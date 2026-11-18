import type { Express, Request, Response, NextFunction } from 'express';
import { captchaConfig, verifyAuthCaptcha } from './authCaptcha';
import {
  AuthFailure, COOKIE_NAME, initializeIdentity, registerAccount, checkCredentials,
  verifyEmailToken, resendVerification, sendReset, changePasswordWithToken, readAccount,
  createSession, cookieToken, currentSession, revokeSession, revokeAllSessions, listSessions,
  updateAccountProfile, loadArchive, iterateArchiveExport, loadArchiveItem, loadArchiveChartImage, saveArchive, deleteArchive, clearArchive, touchSession,
} from './pgIdentity';

const cookieOptions = (days: number, remember = true) => ({
  httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const,
  path: '/', ...(remember ? { maxAge: days * 24 * 60 * 60 * 1000 } : {}),
});
const clearSessionCookie = (res: Response) => res.clearCookie(COOKIE_NAME, {
  path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
});
function failed(res: Response, error: unknown) {
  const known = error instanceof AuthFailure;
  if (!known) console.error('[Postgres identity]', error instanceof Error ? error.message : 'Unexpected error');
  res.status(known ? error.status : 503).json({
    success: false, code: known ? error.code : 'AUTH_TEMPORARILY_UNAVAILABLE',
    error: known ? error.message : 'Сервіс авторизації тимчасово недоступний.',
  });
}
function wrap(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => { Promise.resolve(handler(req, res)).catch(error => failed(res, error)); };
}

// Small bounded in-process abuse budget. One app replica; for horizontal scaling
// move this to Redis/PG with the same quotas. Never rate-limit market feed endpoints.
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(req: Request, kind: string, max: number, durationMs: number, includeEmail = true, ownerId?: string) {
  const now = Date.now();
  if (buckets.size > 12000) {
    for (const [k, v] of buckets) { if (v.resetAt <= now) buckets.delete(k); }
    if (buckets.size > 12000) buckets.clear();
  }
  const identity = String(req.body?.email || '').trim().toLowerCase().slice(0, 254);
  // Explicit archive image requests are already authenticated: isolate limits
  // by account so unrelated visitors behind mobile carrier NAT do not compete.
  const keys = [ownerId ? kind + ':account:' + ownerId : kind + ':ip:' + req.ip];
  if (includeEmail && identity) keys.push(kind + ':email:' + identity);
  for (const key of keys) {
    const record = buckets.get(key);
    if (record && record.resetAt > now && record.count >= max) throw new AuthFailure(429, 'Забагато спроб. Спробуйте пізніше.', 'RATE_LIMITED');
  }
  for (const key of keys) {
    const record = buckets.get(key);
    buckets.set(key, record && record.resetAt > now
      ? { count: record.count + 1, resetAt: record.resetAt }
      : { count: 1, resetAt: now + durationMs });
  }
}

function checkOrigin(req: Request) {
  const origin = req.get('Origin');
  const host = req.get('Host') || '';
  if (!origin) {
    // Non-browser clients cannot use cross-site cookies as credentials.
    // Allow origin-less API calls; authenticated mutations still require CSRF.
    return;
  }
  let url: URL;
  try { url = new URL(origin); } catch { throw new AuthFailure(403, 'Неприпустиме походження запиту.'); }
  if (url.host !== host || !['https:', 'http:'].includes(url.protocol)) {
    throw new AuthFailure(403, 'Неприпустиме походження запиту.', 'BAD_ORIGIN');
  }
}
function protectOrigin(req: Request, res: Response, next: NextFunction) {
  try { checkOrigin(req); next(); } catch (error) { failed(res, error); }
}

export async function requirePostgresSession(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await currentSession(req);
    if (!session) throw new AuthFailure(401, 'Увійдіть у свій акаунт.', 'SESSION_EXPIRED');
    // Cookie-backed writes must prove same-origin JS access.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      checkOrigin(req);
      if (req.get('X-CSRF-Token') !== session.csrf) throw new AuthFailure(403, 'Недійсний токен захисту запиту.', 'BAD_CSRF');
    }
    const provided = [req.query?.userId, req.body?.userId].filter(v => v !== undefined);
    if (provided.some(v => v !== session.userId)) throw new AuthFailure(403, 'Немає доступу до чужих даних.', 'WRONG_OWNER');
    req.query.userId = session.userId;
    req.body = { ...(req.body || {}), userId: session.userId };
    res.locals.userId = session.userId;
    res.locals.sessionId = session.id;
    next();
  } catch (error) { failed(res, error); }
}

export function installPostgresIdentityRoutes(app: Express) {
  // Schema initialization is shared and idempotent; startServer awaits it first.
  app.disable('x-powered-by');
  app.get('/api/auth/config', (_req, res) => res.setHeader('Cache-Control', 'no-store').json({
    backend: 'postgres', captcha: captchaConfig(),
  }));
  // No auth token, challenge response or account status may be cached even
  // when CAPTCHA rejects the request before reaching the handlers.
  app.use(['/api/auth', '/api/account'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  // Register preflight middleware using the EXACT SAME Express route matching
  // rules as the handlers below. A mounted req.path string comparison misses
  // mixed-case and trailing-slash URLs under Express's default routing settings.
  // Keep this ahead of schema initialization so bots do not trigger PostgreSQL/SMTP.
  function guardAuthAction(kind: string, max: number, durationMs: number) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        checkOrigin(req);
        // Before CAPTCHA succeeds, count only the client IP, not an unverified
        // email supplied by an attacker (otherwise anyone can lock out a victim).
        rateLimit(req, 'captcha-preflight', 60, 5 * 60 * 1000, false);
        void verifyAuthCaptcha(req).then(() => {
          try {
            rateLimit(req, kind, max, durationMs);
            next();
          } catch (error) { failed(res, error); }
        }, error => failed(res, error));
      } catch (error) { failed(res, error); }
    };
  }
  app.post('/api/auth/register', guardAuthAction('signup', 4, 60 * 60 * 1000));
  app.post('/api/auth/login', guardAuthAction('login', 10, 15 * 60 * 1000));
  app.post('/api/auth/forgot-password', guardAuthAction('forgot', 4, 60 * 60 * 1000));
  app.post('/api/auth/resend-verification', guardAuthAction('verify', 3, 60 * 60 * 1000));

  // Lazy and retryable schema readiness: auth errors never stop public market routes.
  app.use(['/api/auth', '/api/account'], (req, res, next) => {
    // Guest visitors have no account cookie: /session must not depend on the DB.
    // Otherwise a DB outage would hold the entire screener behind the login splash.
    if (req.method === 'GET' && req.originalUrl.split('?')[0] === '/api/auth/session' && !cookieToken(req)) {
      next();
      return;
    }
    void initializeIdentity().then(() => next(), error => failed(res, error));
  });

  app.post('/api/auth/register', protectOrigin, wrap(async (req, res) => {
    try {
      await registerAccount(req.body?.email, req.body?.password, req.body?.displayName);
    } catch (error) {
      // A public 409 EMAIL_EXISTS response enumerates registered accounts.
      // Show the same outcome as a fresh registration after valid CAPTCHA.
      if (!(error instanceof AuthFailure && error.code === 'EMAIL_EXISTS')) throw error;
    }
    res.status(202).json({ success: true, message: 'Якщо адресу можна зареєструвати, перевірте пошту для підтвердження.' });
  }));
  app.post('/api/auth/resend-verification', protectOrigin, wrap(async (req, res) => {
    try { await resendVerification(req.body?.email); }
    catch (error) {
      // Do not reveal if this email belongs to an unverified account by
      // returning SMTP errors only for registered users.
      if (!(error instanceof AuthFailure && ['MAIL_NOT_CONFIGURED', 'MAIL_DELIVERY_FAILED'].includes(error.code))) throw error;
      console.warn('[Auth email] Verification resend unavailable');
    }
    res.json({ success: true });
  }));
  app.post('/api/auth/login', protectOrigin, wrap(async (req, res) => {
    const account = await checkCredentials(req.body?.email, req.body?.password);
    const session = await createSession(account.user.uid, req, req.body?.remember !== false);
    res.cookie(COOKIE_NAME, session.token, cookieOptions(session.days, req.body?.remember !== false));
    const current = await currentSessionFromToken(req, session.token);
    res.json({ success: true, ...account, csrf: current.csrf });
  }));
  app.post('/api/auth/verify-email', protectOrigin, wrap(async (req, res) => {
    rateLimit(req, 'email-link', 12, 60 * 60 * 1000);
    const userId = await verifyEmailToken(req.body?.token);
    const account = await readAccount(userId);
    if (!account) throw new AuthFailure(404, 'Акаунт не знайдено.');
    const session = await createSession(userId, req);
    res.cookie(COOKIE_NAME, session.token, cookieOptions(session.days));
    res.json({ success: true, ...account, csrf: (await currentSessionFromToken(req, session.token)).csrf });
  }));
  app.post('/api/auth/forgot-password', protectOrigin, wrap(async (req, res) => {
    try { await sendReset(req.body?.email); }
    catch (error) {
      // Return identical public status for unknown and known email addresses,
      // including when SMTP is unavailable for the latter. Log only the class
      // of failure, never the address or a reset token.
      if (!(error instanceof AuthFailure && ['MAIL_NOT_CONFIGURED', 'MAIL_DELIVERY_FAILED'].includes(error.code))) throw error;
      console.warn('[Auth email] Password recovery delivery unavailable');
    }
    res.json({ success: true, message: 'Якщо акаунт існує, ми надішлемо лист для відновлення.' });
  }));
  app.post('/api/auth/reset-password', protectOrigin, wrap(async (req, res) => {
    rateLimit(req, 'password-reset', 8, 60 * 60 * 1000);
    await changePasswordWithToken(req.body?.token, req.body?.password);
    clearSessionCookie(res);
    res.json({ success: true, message: 'Пароль змінено. Увійдіть повторно.' });
  }));
  app.get('/api/auth/session', wrap(async (req, res) => {
    const session = await currentSession(req);
    if (!session) { res.status(401).json({ success: false, code: 'SESSION_EXPIRED' }); return; }
    const account = await readAccount(session.userId);
    if (!account) { res.status(401).json({ success: false }); return; }
    void touchSession(session.id);
    res.json({ success: true, ...account, csrf: session.csrf });
  }));
  app.post('/api/auth/logout', requirePostgresSession, wrap(async (_req, res) => {
    await revokeSession(res.locals.userId, res.locals.sessionId);
    clearSessionCookie(res);
    res.json({ success: true });
  }));
  app.post('/api/auth/logout-all', requirePostgresSession, wrap(async (_req, res) => {
    await revokeAllSessions(res.locals.userId);
    clearSessionCookie(res);
    res.json({ success: true });
  }));
  app.get('/api/auth/sessions', requirePostgresSession, wrap(async (_req, res) => {
    res.json({ success: true, sessions: await listSessions(res.locals.userId) });
  }));
  app.delete('/api/auth/sessions/:id', requirePostgresSession, wrap(async (req, res) => {
    await revokeSession(res.locals.userId, String(req.params.id));
    const revokedCurrent = req.params.id === res.locals.sessionId;
    if (revokedCurrent) clearSessionCookie(res);
    res.json({ success: true, revokedCurrent });
  }));
  app.patch('/api/account/profile', requirePostgresSession, wrap(async (req, res) => {
    // The ownership middleware injects userId for legacy endpoints; it must not
    // become an editable profile field. Only authenticated session UID is trusted.
    const { userId: _authenticatedOwner, ...updates } = req.body || {};
    const account = await updateAccountProfile(res.locals.userId, updates);
    res.json({ success: true, ...account });
  }));
  app.get('/api/account/archive', requirePostgresSession, wrap(async (req, res) => {
    rateLimit(req, 'archive-list', 30, 60_000, false, res.locals.userId);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ success: true, items: await loadArchive(res.locals.userId) });
  }));
  // Full-fidelity archive export is intentional, not part of initial profile
  // loading; historical drawing and density arrays remain intact in PG.
  app.get('/api/account/archive/export', requirePostgresSession, wrap(async (req, res) => {
    rateLimit(req, 'archive-export', 2, 60_000, false, res.locals.userId);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'attachment; filename="h00k-archive.json"');
    // No unbounded buffering when exporting many full drawings/density sets:
    // stream 64-row PG pages and honour HTTP backpressure per account.
    const iterator = iterateArchiveExport(res.locals.userId)[Symbol.asyncIterator]();
    const first = await iterator.next(); // Fail as JSON before sending any headers.
    res.type('application/json; charset=utf-8');
    let next = first;
    let sent = false;
    try {
      res.write('[');
      while (!next.done && !res.destroyed) {
        const chunk = (sent ? ',' : '') + JSON.stringify(next.value);
        if (!res.write(chunk)) {
          const drained = await new Promise<boolean>(resolve => {
            const done = (ok:boolean) => {
              res.off('drain', onDrain); res.off('close', onClose); resolve(ok);
            };
            const onDrain = () => done(true);
            const onClose = () => done(false);
            res.once('drain',onDrain); res.once('close',onClose);
          });
          if (!drained) break;
        }
        sent = true;
        next = await iterator.next();
      }
      if (!res.destroyed) res.end(']');
    } catch (error) {
      if (res.headersSent) res.destroy(error instanceof Error ? error : undefined);
      else throw error;
    } finally {
      await iterator.return?.(undefined);
    }
  }));
  // Full single record is read only when the owner opens a saved formation.
  app.get('/api/account/archive/:id', requirePostgresSession, wrap(async (req, res) => {
    rateLimit(req, 'archive-detail', 40, 60_000, false, res.locals.userId);
    const item = await loadArchiveItem(res.locals.userId, String(req.params.id));
    if (!item) throw new AuthFailure(404, 'Формацію не знайдено.', 'ARCHIVE_NOT_FOUND');
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ success:true, item });
  }));
  // One owner-scoped JPEG per explicit archive open. No full image payloads
  // in archive lists, profile sync or browser localStorage.
  app.get('/api/account/archive/:id/chart-image', requirePostgresSession, wrap(async (req, res) => {
    rateLimit(req, 'archive-chart-image', 30, 60_000, false, res.locals.userId);
    const image = await loadArchiveChartImage(res.locals.userId, String(req.params.id));
    if (!image) throw new AuthFailure(404, 'Знімок графіка відсутній.', 'ARCHIVE_IMAGE_NOT_FOUND');
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ success:true, image });
  }));
  app.put('/api/account/archive/:id', requirePostgresSession, wrap(async (req, res) => {
    rateLimit(req, 'archive-write', 12, 60_000, false, res.locals.userId);
    const item = await saveArchive(res.locals.userId, req.params.id, req.body);
    res.json({ success: true, item });
  }));
  app.delete('/api/account/archive', requirePostgresSession, wrap(async (_req, res) => {
    await clearArchive(res.locals.userId);
    res.json({ success: true });
  }));
  app.delete('/api/account/archive/:id', requirePostgresSession, wrap(async (req, res) => {
    await deleteArchive(res.locals.userId, String(req.params.id));
    res.json({ success: true });
  }));
}

// On login the cookie isn't in req yet. Avoid a second DB lookup;
 // the CSRF token is derived only from the new unpredictable session secret.
import { csrfForSession } from './pgIdentity';
async function currentSessionFromToken(_req: Request, token: string) { return { csrf: csrfForSession(token) }; }
