import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual, verify } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import type { RequestHandler } from 'express';
import firebaseConfig from '../firebase-applet-config.json';
import { DATA_DIR, readJson, writeJson } from './storage';
import { accessService } from './accessService';

const derive = promisify(scrypt);
const accountsFile = path.join(DATA_DIR, 'accounts.json');
interface Account { uid: string; email: string; displayName: string; salt: string; password: string; }
interface ResetRecord { uid: string; expiresAt: number; }
interface AuthStore { accounts: Record<string, Account>; sessions: Record<string, { uid: string; expiresAt: number }>; resetTokens?: Record<string, ResetRecord>; }
let store: AuthStore | undefined;
function state() { return store ||= readJson<AuthStore>(accountsFile, { accounts: {}, sessions: {} }); }
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export async function authenticateLocal(email: string, password: string, register = false, displayName?: string) {
  email = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      typeof password !== 'string' || password.length < 8 || password.length > 256) {
    throw new Error('Вкажіть email і пароль від 8 до 256 символів');
  }
  const current = state();
  let account = current.accounts[email];
  if (register) {
    if (account) throw new Error('Цей email вже зареєстровано');
    const salt = randomBytes(16).toString('hex');
    const hash = (await derive(password, salt, 64)) as Buffer;
    // Recheck after scrypt: concurrent registration must never replace an account.
    if (current.accounts[email]) throw new Error('Цей email вже зареєстровано');
    account = { uid: `local_${randomUUID()}`, email, displayName: String(displayName || email.split('@')[0]).slice(0, 100), salt, password: hash.toString('hex') };
    current.accounts[email] = account;
  } else {
    const hash = (await derive(password, account?.salt || 'invalid-account', 64)) as Buffer;
    if (!account || !timingSafeEqual(Buffer.from(account.password, 'hex'), hash)) throw new Error('Невірний email або пароль');
  }
  const accessToken = `local.${randomBytes(32).toString('base64url')}`;
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  for (const [key, session] of Object.entries(current.sessions)) if (session.expiresAt <= Date.now()) delete current.sessions[key];
  current.sessions[digest(accessToken)] = { uid: account.uid, expiresAt };
  writeJson(accountsFile, current);
  accessService.ensureMember(account.uid, { email, displayName: account.displayName });
  return { accessToken, expiresAt, user: { uid: account.uid, email, displayName: account.displayName, photoURL: '', isLocalUser: true } };
}

const RESET_VALIDITY_MS = 30 * 60_000;
const activeRedemptions = new Set<string>();
export function hasLocalEmailAccount(value: string): boolean {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return !!state().accounts[email];
}
export function localEmailForUid(uid: string): string | undefined {
  return Object.values(state().accounts).find(account => account.uid === uid)?.email;
}
// The bearer reset token is only sent by email; persist its SHA-256 digest.
export function createLocalPasswordReset(value: string): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const current = state();
  const account = current.accounts[email];
  if (!account) return null;
  const tokens = current.resetTokens ||= {};
  const now = Date.now();
  for (const [key, record] of Object.entries(tokens)) {
    // Keep previously sent, unexpired links valid: mail deliveries can
    // arrive out of order. All links are revoked after a successful reset.
    if (record.expiresAt <= now) delete tokens[key];
  }
  const token = randomBytes(32).toString('base64url');
  tokens[digest(token)] = { uid: account.uid, expiresAt: now + RESET_VALIDITY_MS };
  writeJson(accountsFile, current);
  return token;
}
export function revokeLocalPasswordReset(token: string) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
  const current = state();
  delete current.resetTokens?.[digest(token)];
  writeJson(accountsFile, current);
}
export async function confirmLocalPasswordReset(token: string, password: string): Promise<void> {
  const invalid = new Error('Посилання недійсне або термін його дії минув. Запросіть нове.');
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalid;
  if (typeof password !== 'string' || password.length < 8 || password.length > 256)
    throw new Error('Новий пароль має містити від 8 до 256 символів.');
  const current = state();
  const hash = digest(token);
  const record = current.resetTokens?.[hash];
  if (!record || record.expiresAt <= Date.now() || activeRedemptions.has(hash)) throw invalid;
  const account = Object.values(current.accounts).find(value => value.uid === record.uid);
  if (!account) throw invalid;
  activeRedemptions.add(hash);
  try {
    const salt = randomBytes(16).toString('hex');
    const derived = (await derive(password, salt, 64)) as Buffer;
    if (current.resetTokens?.[hash] !== record || record.expiresAt <= Date.now()) throw invalid;
    account.salt = salt;
    account.password = derived.toString('hex');
    delete current.resetTokens![hash];
    for (const [key, value] of Object.entries(current.resetTokens || {})) {
      if (value.uid === account.uid) delete current.resetTokens![key];
    }
    // Invalidate all previously issued sessions for this account.
    for (const [key, session] of Object.entries(current.sessions)) {
      if (session.uid === account.uid) delete current.sessions[key];
    }
    writeJson(accountsFile, current);
  } finally {
    activeRedemptions.delete(hash);
  }
}

export function revokeLocalToken(token: string) {
  delete state().sessions[digest(token)]; writeJson(accountsFile, state());
}

let certificates: Record<string, string> = {};
let certificatesExpireAt = 0;
let loadingCertificates: Promise<void> | undefined;
async function loadCertificates() {
  if (!loadingCertificates) loadingCertificates = (async () => {
    const response = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Authentication certificates unavailable');
    certificates = await response.json();
    const maxAge = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 300);
    certificatesExpireAt = Date.now() + Math.min(maxAge, 86400) * 1000;
  })().finally(() => { loadingCertificates = undefined; });
  await loadingCertificates;
}

export async function verifyUserToken(token: string): Promise<string> {
  if (token.startsWith('local.')) {
    const session = state().sessions[digest(token)];
    if (!session || session.expiresAt <= Date.now()) throw new Error('Session expired');
    return session.uid;
  }
  if (token.length > 10000) throw new Error('Invalid token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  const project = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
      claims.aud !== project || claims.iss !== `https://securetoken.google.com/${project}` ||
      typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 ||
      typeof claims.exp !== 'number' || claims.exp <= now ||
      typeof claims.iat !== 'number' || claims.iat > now ||
      typeof claims.auth_time !== 'number' || claims.auth_time > now || claims.firebase?.sign_in_provider === 'anonymous') throw new Error('Invalid token claims');
  if (Date.now() >= certificatesExpireAt) await loadCertificates();
  if (!Object.hasOwn(certificates, header.kid) || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), certificates[header.kid], Buffer.from(parts[2], 'base64url'))) throw new Error('Invalid signature');
  return claims.sub;
}

export const requireUser: RequestHandler = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) return void res.status(401).json({ success: false, error: 'Увійдіть у свій обліковий запис' });
    const uid = await verifyUserToken(token);
    if (uid === 'guest') throw new Error('Registration required');
    if ((req.query.userId !== undefined && req.query.userId !== uid) ||
        (req.body?.userId !== undefined && req.body.userId !== uid)) return void res.status(403).json({ success: false, error: 'Доступ до чужого облікового запису заборонено' });
    const identity = token.startsWith('local.')
      ? Object.values(state().accounts).find(account => account.uid === uid)
      : (() => { const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); return { email: claims.email, displayName: claims.name }; })();
    try { accessService.ensureMember(uid, identity); }
    catch { return void res.status(503).json({ success: false, error: 'Сховище доступу недоступне. Повторіть спробу пізніше.' }); }
    req.query.userId = uid;
    req.body ||= {}; req.body.userId = uid;
    res.locals.userId = uid;
    next();
  } catch { res.status(401).json({ success: false, error: 'Сесія недійсна. Увійдіть повторно' }); }
};
