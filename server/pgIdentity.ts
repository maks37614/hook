import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import nodemailer from 'nodemailer';
import type { Request } from 'express';
import { validateSiteAppearance, normalizeSiteAppearance } from '../src/utils/siteAppearance';

// Hashing is intentionally capped on a 2-vCPU VPS; no unbounded scrypt work queue.
let hashingActive = 0;
const waitingHashes: Array<() => void> = [];
async function deriveScrypt(password: string, salt: Buffer, length: number): Promise<Buffer> {
  if (hashingActive >= 2) {
    if (waitingHashes.length >= 16) throw new AuthFailure(429, 'Сервер авторизації зайнятий. Повторіть спробу.', 'AUTH_BUSY');
    await new Promise<void>(resolve => { waitingHashes.push(resolve); });
  } else {
    hashingActive++;
  }
  try {
    return await new Promise((resolve, reject) => {
      scryptCallback(password, salt, length, SCRYPT_OPTIONS, (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      });
    });
  } finally {
    // Transfer the same worker slot to the next waiting request.
    const next = waitingHashes.shift();
    if (next) next(); else hashingActive--;
  }
}

const SESSION_DAYS = 30;
const HASH_LENGTH = 64;
const SCRYPT_COST = 32768;
const SCRYPT_OPTIONS = { N: SCRYPT_COST, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const COOKIE_NAME = process.env.NODE_ENV === 'production' ? '__Host-h00k-session' : 'h00k-session';

export class AuthFailure extends Error {
  constructor(public status: number, message: string, public code = 'AUTH_ERROR') {
    super(message);
  }
}

let pool: Pool | undefined;
let initialized: Promise<void> | undefined;
let retryAfter = 0;
function database(): Pool {
  if (!process.env.DATABASE_URL && !(process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE)) {
    throw new Error('Set DATABASE_URL or PGHOST, PGUSER, PGPASSWORD, PGDATABASE for PostgreSQL auth');
  }
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL || undefined,
    max: 4,
    idleTimeoutMillis: 15_000,
    connectionTimeoutMillis: 4_000,
    statement_timeout: 6_000,
    application_name: 'h00k-auth',
  });
  return pool;
}
export function identityPool() { return database(); }

export async function initializeIdentity() {
  // Cap retry frequency when the database is offline to protect the 2-vCPU VPS.
  if (!initialized && Date.now() < retryAfter) {
    throw new AuthFailure(503, 'База акаунтів тимчасово недоступна. Повторіть спробу.', 'DATABASE_OFFLINE');
  }
  if (!initialized) initialized = (async () => {
    const schema = readFileSync(new URL('./migrations/001_identity.sql', import.meta.url), 'utf8');
    const client = await database().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(811040026)');
      await client.query(schema);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })().catch(error => { retryAfter = Date.now() + 5000; initialized = undefined; throw error; });
  await initialized;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');
const cleanEmail = (email: unknown) => String(email || '').trim().toLowerCase();

export function validateEmail(value: unknown): string {
  const email = cleanEmail(value);
  if (email.length > 254 || !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthFailure(400, 'Введіть дійсну адресу електронної пошти.', 'BAD_EMAIL');
  }
  return email;
}
export function validatePassword(value: unknown) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw new AuthFailure(400, 'Пароль повинен містити від 12 до 128 символів.', 'BAD_PASSWORD');
  }
  return value;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const output = await deriveScrypt(password, salt, HASH_LENGTH);
  return ['scrypt', SCRYPT_COST, salt.toString('base64url'), output.toString('base64url')].join('$');
}
export async function checkPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== String(SCRYPT_COST)) return false;
  try {
    const salt = Buffer.from(parts[2], 'base64url');
    const digest = Buffer.from(parts[3], 'base64url');
    if (salt.length !== 16 || digest.length !== HASH_LENGTH) return false;
    const candidate = await deriveScrypt(password, salt, digest.length);
    return timingSafeEqual(candidate, digest);
  } catch (error) { if (error instanceof AuthFailure) throw error; return false; }
}

const baseUrl = () => {
  const value = process.env.PUBLIC_BASE_URL || 'https://h00k.top';
  const url = new URL(value);
  if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') throw new Error('PUBLIC_BASE_URL must use HTTPS');
  return url.origin;
};
let mailer: ReturnType<typeof nodemailer.createTransport> | undefined;
function mailTransport() {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from || (process.env.SMTP_USER && !process.env.SMTP_PASSWORD)) {
    throw new AuthFailure(503, 'Реєстрація тимчасово недоступна: SMTP ще не налаштований.', 'MAIL_NOT_CONFIGURED');
  }
  if (!mailer) mailer = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    requireTLS: Number(process.env.SMTP_PORT || 587) !== 465,
    tls: { minVersion: 'TLSv1.2' },
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' } : undefined,
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 15_000,
    // Auth emails contain only our own HTTPS text link. Never fetch URLs or
    // read local files if a later caller accidentally adds MIME content.
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return { transport: mailer, from };
}
async function sendActionMail(email: string, purpose: 'verify-email' | 'reset-password', token: string) {
  const { transport, from } = mailTransport();
  const url = new URL(baseUrl());
  url.searchParams.set(purpose === 'verify-email' ? 'verifyEmail' : 'resetPassword', token);
  const subject = purpose === 'verify-email' ? 'h00k — підтвердження email' : 'h00k — відновлення пароля';
  const text = purpose === 'verify-email'
    ? 'Підтвердіть email для h00k: ' + url.toString() + '\nПосилання дійсне 24 години.'
    : 'Відновіть пароль h00k: ' + url.toString() + '\nПосилання дійсне 30 хвилин. Якщо це не ви, проігноруйте лист.';
  try {
    await transport.sendMail({ from, to: email, subject, text });
  } catch (error) {
    // Do not leak email addresses or action tokens to logs.
    console.error('[Auth email] SMTP delivery failed:', error instanceof Error ? error.name : 'transport error');
    throw new AuthFailure(503, 'Не вдалося надіслати лист. Спробуйте повторно пізніше.', 'MAIL_DELIVERY_FAILED');
  }
}

type AuthMailClaim = { id: number; attempts: number };

// For outbox mail, token issuance must be serialized with password changes and
// email verification, which lock the same auth_users row first. Never create a
// fresh actionable token from an outbox job that has already been canceled or
// reclaimed by another worker. Registration's first email remains synchronous.
async function actionFor(
  userId: string, email: string, purpose: 'verify-email' | 'reset-password',
  claim?: AuthMailClaim,
): Promise<boolean> {
  const token = randomToken();
  const hash = hashToken(token);
  if (claim) {
    const client = await database().connect();
    try {
      await client.query('BEGIN');
      const { rows: users } = await client.query(
        'SELECT email_verified_at FROM auth_users WHERE id = $1 FOR UPDATE',
        [userId],
      );
      const { rows: claims } = await client.query(`
        SELECT id FROM auth_mail_outbox
        WHERE id = $1 AND user_id = $2 AND purpose = $3
          AND attempts = $4 AND completed_at IS NULL
        FOR UPDATE
      `, [claim.id, userId, purpose, claim.attempts]);
      if (!users[0] || !claims[0] || (purpose === 'verify-email' && users[0].email_verified_at)) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(
        'INSERT INTO auth_action_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, $3, now() + make_interval(secs => $4::int))',
        [hash, userId, purpose, purpose === 'verify-email' ? 86400 : 1800],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } else {
    await database().query(
      'INSERT INTO auth_action_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, $3, now() + make_interval(secs => $4::int))',
      [hash, userId, purpose, purpose === 'verify-email' ? 86400 : 1800],
    );
  }
  // Existing delivered links remain usable until expiry or the account action
  // succeeds. A crash after SMTP acceptance must not invalidate older links.
  try {
    await sendActionMail(email, purpose, token);
  } catch (error) {
    await database().query('DELETE FROM auth_action_tokens WHERE token_hash = $1', [hash]).catch(() => {});
    throw error;
  }
  return true;
}

function accountShape(row: any) {
  const uid = String(row.id);
  const email = String(row.email);
  const displayName = String(row.display_name);
  const createdAt = new Date(row.created_at).toISOString();
  const extra = row.profile && typeof row.profile === 'object' && !Array.isArray(row.profile) ? row.profile : {};
  const { telegramBotToken: _token, telegramChatId: _chat, telegramBotUsername: _name, ...safe } = extra;
  return {
    user: { uid, email, displayName, photoURL: safe.photoURL || '', emailVerified: Boolean(row.email_verified_at) },
    profile: { ...safe, uid, email, displayName, createdAt, updatedAt: new Date(row.updated_at).toISOString() },
  };
}

export async function registerAccount(emailInput: unknown, passwordInput: unknown, nameInput: unknown) {
  mailTransport(); // Fail closed, before creating an un-verifiable account.
  const email = validateEmail(emailInput);
  const password = validatePassword(passwordInput);
  const displayName = String(nameInput || email.split('@')[0]).trim().slice(0, 80) || 'Користувач';
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  try {
    await database().query(
      'INSERT INTO auth_users (id, email, password_hash, display_name, profile) VALUES ($1, $2, $3, $4, $5::jsonb)',
      [id, email, passwordHash, displayName, JSON.stringify({
        defaultExchange: 'all', defaultMarketType: 'all', defaultTimeframe: '1h',
        soundAlertsEnabled: true, marketSentimentExpanded: true,
        watchlist: [], watchlistFolders: {},
        chartTradeMarkers: { showEntry: true, showTarget: true, showStop: true },
        chartLabelSettings: { entry: true, target: true, stop: true },
        terminalSettings: { columns: 2, blockHeight: 'medium', blocks: [] },
        searchSettings: { minVolumeUsd: 0, presetFilter: 'all', sortBy: 'volume', sortDirection: 'desc' },
        installGuideTipShown: false,
      })],
    );
  } catch (error: any) {
    if (error?.code === '23505') throw new AuthFailure(409, 'Ця електронна адреса вже використовується.', 'EMAIL_EXISTS');
    throw error;
  }
  try {
    await actionFor(id, email, 'verify-email');
  } catch (error) {
    // Keep the unverified account for a bounded resend, not an active session.
    throw error;
  }
}

// Public mail-request endpoints enqueue a small durable job rather than waiting
// for SMTP. This prevents mailbox existence from being exposed through SMTP
// latency, keeps the HTTP path responsive, and survives container restarts.
// No email address, raw token or SMTP secret is persisted in the outbox.
async function enqueueActionMail(emailInput: unknown, purpose: 'verify-email' | 'reset-password') {
  let email: string;
  try { email = validateEmail(emailInput); } catch { return; }
  await database().query(`
    INSERT INTO auth_mail_outbox (user_id, purpose)
    SELECT u.id, $2
    FROM auth_users u
    WHERE u.email = $1
      AND ($2 = 'reset-password' OR u.email_verified_at IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM auth_mail_outbox sent
        WHERE sent.user_id = u.id AND sent.purpose = $2
          AND sent.completed_at > now() - interval '60 seconds'
      )
    ON CONFLICT DO NOTHING
  `, [email, purpose]);
}
export function resendVerification(emailInput: unknown) {
  return enqueueActionMail(emailInput, 'verify-email');
}
export function sendReset(emailInput: unknown) {
  return enqueueActionMail(emailInput, 'reset-password');
}

export async function processAuthMailJobs(): Promise<{ processed: number; delivered: number }> {
  const { rows } = await database().query(`
    WITH next_job AS (
      SELECT id FROM auth_mail_outbox
      WHERE completed_at IS NULL AND available_at <= now()
        AND (claimed_until IS NULL OR claimed_until < now())
      ORDER BY available_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    UPDATE auth_mail_outbox job
    SET attempts = job.attempts + 1,
        claimed_until = now() + interval '60 seconds'
    FROM next_job WHERE job.id = next_job.id
    RETURNING job.id, job.user_id, job.purpose, job.attempts
  `);
  if (!rows[0]) return { processed: 0, delivered: 0 };
  const job = rows[0] as { id: number; user_id: string; purpose: 'verify-email' | 'reset-password'; attempts: number };
  try {
    const account = await database().query(
      'SELECT email, email_verified_at FROM auth_users WHERE id = $1',
      [job.user_id],
    );
    let delivered = 0;
    if (account.rows[0] && (job.purpose !== 'verify-email' || !account.rows[0].email_verified_at)) {
      delivered = await actionFor(job.user_id, account.rows[0].email, job.purpose, job) ? 1 : 0;
    }
    // Fence old workers with the claim's attempt number. A successful password
    // change or email verification may have completed the job during SMTP.
    await database().query(`
      UPDATE auth_mail_outbox SET completed_at = now(), claimed_until = NULL
      WHERE id = $1 AND attempts = $2 AND completed_at IS NULL
    `, [job.id, job.attempts]);
    return { processed: 1, delivered };
  } catch (error) {
    // Never log the email, authentication token or SMTP credentials.
    console.warn('[Auth email] Queued mail attempt failed:', error instanceof AuthFailure ? error.code : 'DELIVERY_ERROR');
    const terminal = job.attempts >= 5;
    const delay = Math.min(600, 15 * (2 ** (Math.max(0, job.attempts - 1))));
    await database().query(`
      UPDATE auth_mail_outbox
      SET claimed_until = NULL,
          available_at = now() + make_interval(secs => $2::integer),
          completed_at = CASE WHEN $3::boolean THEN now() ELSE NULL END
      WHERE id = $1 AND attempts = $4 AND completed_at IS NULL
    `, [job.id, delay, terminal, job.attempts]);
    return { processed: 1, delivered: 0 };
  }
}

// Token hashes and completed queue metadata should not grow without bound.
// Run sparingly; this is database-local work with no exchange/API traffic.
export async function pruneAuthMailHistory() {
  await database().query(`
    DELETE FROM auth_action_tokens
    WHERE expires_at < now() - interval '2 days'
       OR consumed_at < now() - interval '2 days'
  `);
  await database().query(`
    DELETE FROM auth_mail_outbox
    WHERE completed_at < now() - interval '7 days'
  `);
}

export async function verifyEmailToken(token: unknown) {
  const value = String(token || '');
  if (!/^[a-zA-Z0-9_-]{40,80}$/.test(value)) throw new AuthFailure(400, 'Посилання недійсне або застаріле.');
  const tokenHash = hashToken(value);
  const candidate = await database().query(
    "SELECT user_id FROM auth_action_tokens WHERE token_hash = $1 AND purpose = 'verify-email' AND consumed_at IS NULL AND expires_at > now()",
    [tokenHash],
  );
  if (!candidate.rows[0]) throw new AuthFailure(400, 'Посилання недійсне або застаріле.');
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    // Lock the account before any individual token rows, ensuring concurrent
    // sibling links cannot deadlock while all account tokens are consumed.
    await client.query('SELECT id FROM auth_users WHERE id = $1 FOR UPDATE', [candidate.rows[0].user_id]);
    const { rows } = await client.query(
      "SELECT user_id FROM auth_action_tokens WHERE token_hash = $1 AND purpose = 'verify-email' AND consumed_at IS NULL AND expires_at > now() FOR UPDATE",
      [tokenHash],
    );
    if (!rows[0]) throw new AuthFailure(400, 'Посилання недійсне або застаріле.');
    // Every outstanding confirmation link for the same account becomes invalid
    // after the address is verified. A stale link must not serve as a login token.
    await client.query("UPDATE auth_action_tokens SET consumed_at = now() WHERE user_id = $1 AND purpose = 'verify-email' AND consumed_at IS NULL", [rows[0].user_id]);
    await client.query('UPDATE auth_users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1', [rows[0].user_id]);
    // A queued follow-up verification email is no longer relevant.
    await client.query("UPDATE auth_mail_outbox SET completed_at = now(), claimed_until = NULL WHERE user_id = $1 AND purpose = 'verify-email' AND completed_at IS NULL", [rows[0].user_id]);
    await client.query('COMMIT');
    return String(rows[0].user_id);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function changePasswordWithToken(token: unknown, passwordInput: unknown) {
  const value = String(token || '');
  if (!/^[a-zA-Z0-9_-]{40,80}$/.test(value)) throw new AuthFailure(400, 'Посилання недійсне або застаріле.');
  const password = validatePassword(passwordInput);
  // Reject invented, expired or already-used links BEFORE expensive scrypt work.
  // The transaction below checks the token again under a row lock to prevent races.
  const tokenHash = hashToken(value);
  const candidate = await database().query(
    "SELECT user_id FROM auth_action_tokens WHERE token_hash = $1 AND purpose = 'reset-password' AND consumed_at IS NULL AND expires_at > now()",
    [tokenHash],
  );
  if (!candidate.rows[0]) throw new AuthFailure(400, 'Посилання недійсне або застаріле.');
  const passwordHash = await hashPassword(password);
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    // Serialize concurrent recovery links for the same account before locking
    // a token row. The second request will re-check its now-consumed token.
    await client.query('SELECT id FROM auth_users WHERE id = $1 FOR UPDATE', [candidate.rows[0].user_id]);
    const { rows } = await client.query(
      "SELECT user_id FROM auth_action_tokens WHERE token_hash = $1 AND purpose = 'reset-password' AND consumed_at IS NULL AND expires_at > now() FOR UPDATE",
      [tokenHash],
    );
    if (!rows[0]) throw new AuthFailure(400, 'Посилання недійсне або застаріле.');
    const id = String(rows[0].user_id);
    await client.query('UPDATE auth_users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, id]);
    await client.query('UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
    // Reset all previously issued password links, not just the submitted link.
    await client.query("UPDATE auth_action_tokens SET consumed_at = now() WHERE user_id = $1 AND purpose = 'reset-password' AND consumed_at IS NULL", [id]);
    // Cancel previously requested recovery mail that is still in the queue.
    await client.query("UPDATE auth_mail_outbox SET completed_at = now(), claimed_until = NULL WHERE user_id = $1 AND purpose = 'reset-password' AND completed_at IS NULL", [id]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function checkCredentials(emailInput: unknown, passInput: unknown) {
  const email = validateEmail(emailInput);
  const password = typeof passInput === 'string' ? passInput : '';
  // Avoid hashing attacker-controlled 384KB login passwords (API JSON limit).
  // All invalid credentials receive the same public response.
  if (!password || password.length > 128) throw new AuthFailure(401, 'Неправильна електронна адреса або пароль.', 'INVALID_CREDENTIALS');
  const { rows } = await database().query('SELECT * FROM auth_users WHERE email = $1', [email]);
  const user = rows[0];
  // A constant dummy hash avoids a cheap user-existence timing oracle.
  const fake = 'scrypt$32768$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const valid = await checkPassword(password, user?.password_hash || fake);
  if (!user || !valid) throw new AuthFailure(401, 'Неправильна електронна адреса або пароль.', 'INVALID_CREDENTIALS');
  if (!user.email_verified_at) throw new AuthFailure(403, 'Підтвердіть електронну пошту перед входом.', 'EMAIL_UNVERIFIED');
  return accountShape(user);
}

export async function readAccount(userId: string) {
  const { rows } = await database().query('SELECT * FROM auth_users WHERE id = $1', [userId]);
  return rows[0] ? accountShape(rows[0]) : null;
}
export async function createSession(userId: string, req: Request, remember = true) {
  const token = randomToken();
  const id = randomUUID();
  const days = remember ? SESSION_DAYS : 1;
  await database().query(
    'INSERT INTO auth_sessions (id, user_id, token_hash, user_agent, ip_address, expires_at) VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6::int))',
    [id, userId, hashToken(token), String(req.get('User-Agent') || '').slice(0, 255), String(req.ip || '').slice(0, 80), days],
  );
  return { token, days };
}

export function cookieToken(req: Request): string | null {
  const header = req.get('Cookie') || '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    if (part.slice(0, separator).trim() === COOKIE_NAME) {
      const token = part.slice(separator + 1).trim();
      return /^[A-Za-z0-9_-]{40,80}$/.test(token) ? token : null;
    }
  }
  return null;
}
export function csrfForSession(token: string) {
  return createHash('sha256').update('h00k-csrf:' + token).digest('base64url');
}
export type ActiveSession = { id: string; userId: string; token: string; csrf: string; email: string; };
export async function currentSession(req: Request): Promise<ActiveSession | null> {
  const token = cookieToken(req);
  if (!token) return null;
  const { rows } = await database().query(
    'SELECT s.id, s.user_id, u.email FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.email_verified_at IS NOT NULL',
    [hashToken(token)],
  );
  if (!rows[0]) return null;
  // Avoid one write for every HTTP request; a session touch is rarely needed.
  return { id: rows[0].id, userId: rows[0].user_id, email: rows[0].email, token, csrf: csrfForSession(token) };
}
export async function revokeSession(userId: string, sessionId: string) {
  const result = await database().query(
    'UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND id = $2 AND revoked_at IS NULL',
    [userId, sessionId],
  );
  return (result.rowCount || 0) > 0;
}
export async function revokeAllSessions(userId: string) {
  await database().query('UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}
export async function listSessions(userId: string) {
  const { rows } = await database().query(
    'SELECT id, user_agent AS "userAgent", created_at AS "createdAt", last_seen_at AS "lastSeenAt", expires_at AS "expiresAt" FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 50',
    [userId],
  );
  return rows;
}
export async function touchSession(id: string) {
  await database().query("UPDATE auth_sessions SET last_seen_at = now() WHERE id = $1 AND last_seen_at < now() - interval '15 minutes'", [id]).catch(() => {});
}

const EDITABLE_FIELDS = new Set([
  'displayName', 'photoURL', 'defaultExchange', 'defaultMarketType', 'defaultTimeframe',
  'defaultChartProvider', 'hookChartPreferences', 'timeZone', 'soundAlertsEnabled',
  'siteNotificationSettings', 'telegramPriceAlertCollapsed', 'smartAnalysisCollapsed',
  'marketSentimentExpanded', 'watchlist', 'watchlistFolders', 'metaScalpSettings',
  'terminalLinkSettings', 'chartTradeMarkers', 'terminalSettings', 'searchSettings',
  'installGuideTipShown', 'chartLabelSettings', 'tpSlConstructorSettings', 'siteAppearance',
]);
export async function updateAccountProfile(userId: string, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthFailure(400, 'Неправильні дані профілю.');
  const patch: Record<string, unknown> = {};
  for (const [key, data] of Object.entries(value)) {
    if (!EDITABLE_FIELDS.has(key)) throw new AuthFailure(400, 'Неприпустиме поле профілю: ' + key);
    patch[key] = data;
  }
  // Permit only built-in palette names, never arbitrary CSS values or oversized objects.
  if (Object.prototype.hasOwnProperty.call(patch, 'siteAppearance')) {
    const appearance = patch.siteAppearance;
    if (!appearance || typeof appearance !== 'object' || Array.isArray(appearance))
      throw new AuthFailure(400, 'Некоректне оформлення інтерфейсу.');
    if (!validateSiteAppearance(appearance))
      throw new AuthFailure(400, 'Недозволене оформлення або CSS інтерфейсу.');
    patch.siteAppearance = normalizeSiteAppearance(appearance);
  }
  // Terminal revisions are independent of unrelated profile fields. A legacy
  // client may initialize an unversioned workspace, but may NEVER overwrite one
  // that has already been saved by a revision-aware client.
  const hasWorkspacePatch = Object.prototype.hasOwnProperty.call(patch, 'terminalSettings');
  let expectedWorkspaceVersion: string | null | undefined;
  if (patch.terminalSettings && typeof patch.terminalSettings === 'object'
      && !Array.isArray(patch.terminalSettings)) {
    const workspace = patch.terminalSettings as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(workspace, '_expectedVersion')) {
      const expected = workspace._expectedVersion;
      if (expected !== null && (typeof expected !== 'string' || !/^[a-f0-9-]{1,80}$/i.test(expected)))
        throw new AuthFailure(400, 'Некоректна версія робочої області.');
      expectedWorkspaceVersion = expected as string | null;
    }
    const { _expectedVersion: _requestOnly, version: _clientVersion, ...safeWorkspace } = workspace;
    patch.terminalSettings = { ...safeWorkspace, version: randomUUID() };
  }
  if (JSON.stringify(patch).length > 180000) throw new AuthFailure(413, 'Налаштування занадто великі.');
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    if (hasWorkspacePatch) {
      // Without _expectedVersion, older clients may only update a workspace
      // whose revision is still absent. This protects a new device's changes.
      const result = await client.query(
        "UPDATE auth_users SET profile = profile || $1::jsonb, updated_at = now() WHERE id = $2 AND COALESCE(profile -> 'terminalSettings' ->> 'version', '') = $3",
        [JSON.stringify(patch), userId, expectedWorkspaceVersion ?? ''],
      );
      if (!result.rowCount) {
        throw new AuthFailure(409, 'Робочу область змінено на іншому пристрої. Локальні графіки збережені у вашому браузері.', 'TERMINAL_WORKSPACE_CONFLICT');
      }
    } else {
      await client.query('UPDATE auth_users SET profile = profile || $1::jsonb, updated_at = now() WHERE id = $2',
        [JSON.stringify(patch), userId]);
    }
    if (typeof patch.displayName === 'string') {
      const name = patch.displayName.trim().slice(0, 80);
      if (!name) throw new AuthFailure(400, 'Імʼя не може бути порожнім.');
      await client.query('UPDATE auth_users SET display_name = $1 WHERE id = $2', [name, userId]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  return readAccount(userId);
}
/**
 * Lightweight archive list: keep the snapshot identity/visibility metadata but
 * leave dense drawing geometry and per-level DOM marks in PostgreSQL. Individual
 * owner-only reads and explicit exports retrieve the COMPLETE original record.
 * Project in SQL to avoid copying large JSON arrays from PG into Node/network.
 */
export async function loadArchive(userId: string) {
  const { rows } = await database().query(
    `SELECT CASE WHEN jsonb_typeof(payload->'chartSnapshot')='object'
      THEN jsonb_set(payload,'{chartSnapshot}',
        (payload->'chartSnapshot') - 'drawings' - 'scalperLines' - 'density' - 'overlayScene',false)
      ELSE payload END AS payload
     FROM auth_archives WHERE user_id=$1 ORDER BY saved_at DESC LIMIT 2000`, [userId],
  );
  return rows.map(row => row.payload);
}

/** Yield full archived geometry in small batches for deliberate export.
 * This avoids buffering up to 2,000 × 250KB JSONB records in the 2-vCPU VPS.
 * Stable (saved_at,id) pagination works with the existing recent archive index. */
export async function* iterateArchiveExport(userId: string): AsyncGenerator<any> {
  let remaining = 2000;
  let beforeSavedAt: number | null = null;
  let beforeId: string | null = null;
  while (remaining > 0) {
    const size = Math.min(64, remaining);
    const { rows } = await database().query(
      `SELECT id, saved_at, payload FROM auth_archives
       WHERE user_id=$1
         AND ($2::bigint IS NULL OR (saved_at,id)<($2::bigint,$3::text))
       ORDER BY saved_at DESC,id DESC LIMIT $4`,
      [userId,beforeSavedAt,beforeId,size],
    );
    if (!rows.length) return;
    for (const row of rows) yield row.payload;
    remaining -= rows.length;
    if (rows.length < size) return;
    const last = rows[rows.length - 1];
    beforeSavedAt = Number(last.saved_at);
    beforeId = String(last.id);
  }
}
/** Owner-scoped single archive read for explicit proof export; avoids loading 2000 entries. */
export async function loadArchiveItem(userId: string, id: string): Promise<any | null> {
  if (!/^[a-zA-Z0-9_-]{1,140}$/.test(id))
    throw new AuthFailure(400, 'Неправильний ID формації.');
  const { rows } = await database().query(
    'SELECT payload FROM auth_archives WHERE user_id=$1 AND id=$2 LIMIT 1',
    [userId, id],
  );
  return rows[0]?.payload ?? null;
}
/** Archive rows stay compact; the owner-only image is retrieved separately. */
export async function loadArchiveChartImage(userId: string, id: string): Promise<string | null> {
  if (!/^[a-zA-Z0-9_-]{1,140}$/.test(id)) throw new AuthFailure(400, 'Неправильний ID формації.');
  const { rows } = await database().query(
    'SELECT image FROM auth_archive_chart_images WHERE user_id=$1 AND id=$2 LIMIT 1', [userId,id],
  );
  return rows[0]?.image ?? null;
}
export async function saveArchive(userId: string, id: unknown, payload: any) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,140}$/.test(id))
    throw new AuthFailure(400, 'Неправильний ID формації.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new AuthFailure(400, 'Неправильний формат формації.');
  if (payload.userId && payload.userId !== userId)
    throw new AuthFailure(403, 'Немає доступу до чужої формації.');
  const body = { ...payload, id, userId };
  // Legacy archives remain readable/writable; new HookChart saves provide
  // a non-empty reason. Validate submitted text before storing private JSON.
  if (body.entryReason !== undefined &&
      (typeof body.entryReason !== 'string' || !body.entryReason.trim() ||
       body.entryReason.trim().length > 500))
    throw new AuthFailure(400, 'Причина входу має містити від 1 до 500 символів.');
  if (typeof body.entryReason === 'string') body.entryReason = body.entryReason.trim();
  const image = body.chartSnapshot?.image;
  if (image !== undefined && (typeof image !== 'string' || image.length > 130000 ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image)))
    throw new AuthFailure(400, 'Неправильне зображення архіву.');
  // Existing full payload limit also bounds user-authored drawings/geometry.
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 250000)
    throw new AuthFailure(413, 'Формація перевищує допустимий розмір.');
  if (body.chartSnapshot) {
    const { image: _image, ...metadata } = body.chartSnapshot;
    body.chartSnapshot = metadata;
  }
  const db=database();
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    // Match the 2,000-entry archive list limit. A per-account transaction lock
    // prevents simultaneous saves bypassing the quota; different users do not
    // block each other (except for extremely rare hash collisions).
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), 421)', [userId]);
    const { rows: quota } = await client.query(
      `SELECT (SELECT COUNT(*)::int FROM auth_archives WHERE user_id=$1) AS total,
        EXISTS(SELECT 1 FROM auth_archives WHERE user_id=$1 AND id=$2) AS already_saved`,
      [userId, id],
    );
    if (Number(quota[0]?.total || 0) >= 2000 && !quota[0]?.already_saved)
      throw new AuthFailure(409, 'Архів заповнений (максимум 2000 формацій). Видаліть зайві записи.');
    await client.query(
      'INSERT INTO auth_archives (user_id, id, payload, saved_at) VALUES ($1,$2,$3::jsonb,$4) '+
      'ON CONFLICT (user_id,id) DO UPDATE SET payload=EXCLUDED.payload,saved_at=EXCLUDED.saved_at',
      [userId,id,JSON.stringify(body),Number.isFinite(body.savedAtTimestamp)?body.savedAtTimestamp:Date.now()],
    );
    if (image) await client.query(
      'INSERT INTO auth_archive_chart_images (user_id,id,image) VALUES ($1,$2,$3) '+
      'ON CONFLICT (user_id,id) DO UPDATE SET image=EXCLUDED.image',
      [userId,id,image],
    );
    else await client.query('DELETE FROM auth_archive_chart_images WHERE user_id=$1 AND id=$2',[userId,id]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error}
  finally{client.release()}
  return body;
}
export async function deleteArchive(userId: string, id: string) {
  await database().query('DELETE FROM auth_archives WHERE user_id = $1 AND id = $2', [userId, id]);
}
export async function clearArchive(userId: string) {
  await database().query('DELETE FROM auth_archives WHERE user_id = $1', [userId]);
}
