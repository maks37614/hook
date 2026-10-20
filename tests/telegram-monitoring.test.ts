import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import express from 'express';
import { once } from 'node:events';

const root = process.cwd();
const fixture = fs.mkdtempSync(path.join(root, '.test-telegram-'));
process.chdir(fixture);
const accounts = await import('../server/alertService');
const links = await import('../server/telegramLinkService');
const telegram = await import('../server/telegramService');
const { NotificationOutbox, notificationOutbox } = await import('../server/notificationOutbox');
const { NotificationRouter } = await import('../server/notificationRouter');
const auth = await import('../server/authService');
const surveillance = await import('../server/surveillanceService');
process.chdir(root);
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
test.after(() => { globalThis.fetch = originalFetch; Date.now = originalNow; fs.rmSync(fixture, { recursive: true, force: true }); });

const update = (token: string, chatId: number, type = 'private', sender = chatId) => ({ update_id: chatId,
  message: { text: `/start ${token}`, chat: { id: chatId, type }, from: { id: sender, is_bot: false } } });
const tokenFrom = (url: string) => new URL(url).searchParams.get('start')!;
const fakeBot = async () => Response.json({ ok: true, result: { username: 'HookFixtureBot' } });

test('personal links bind two users out of order; private identity, single use and expiry are enforced', async () => {
  telegram.saveTelegramConfig({ botToken: '123:fixture_shared', chatId: '999' });
  globalThis.fetch = fakeBot;
  const a = await links.createTelegramLink('alice', 'uk');
  const b = await links.createTelegramLink('bob', 'pl');
  const tokenA = tokenFrom(a.url), tokenB = tokenFrom(b.url);
  const persisted = fs.readFileSync(path.join(fixture, 'server/data/telegram_links.json'), 'utf8');
  assert.ok(!persisted.includes(tokenA), 'only a hash of the secret link is stored');
  assert.equal(links.processTelegramUpdate(update(tokenA, 101, 'group')), false);
  assert.equal(links.processTelegramUpdate(update(tokenA, 101, 'private', 202)), false);
  assert.equal(links.processTelegramUpdate(update(tokenB, 202)), true);
  assert.equal(links.processTelegramUpdate(update(tokenA, 101)), true);
  assert.equal(accounts.getUserTelegram('alice')?.chatId, '101');
  assert.equal(accounts.getUserTelegram('bob')?.chatId, '202');
  assert.equal(accounts.getUserTelegram('bob')?.language, 'pl');
  assert.equal(links.processTelegramUpdate(update(tokenA, 303)), false);
  const conflict = await links.createTelegramLink('charlie');
  assert.equal(links.processTelegramUpdate(update(tokenFrom(conflict.url), 101)), false);
  const expired = await links.createTelegramLink('expired');
  Date.now = () => expired.expiresAt + 1;
  assert.equal(links.processTelegramUpdate(update(tokenFrom(expired.url), 404)), false);
  Date.now = originalNow;
});

test('issuing a new link invalidates the previous one; disconnect survives stale credential sync', async () => {
  globalThis.fetch = fakeBot;
  const old = await links.createTelegramLink('relink');
  const current = await links.createTelegramLink('relink');
  assert.equal(links.processTelegramUpdate(update(tokenFrom(old.url), 501)), false);
  assert.equal(links.processTelegramUpdate(update(tokenFrom(current.url), 501)), true);
  const waiting = await links.createTelegramLink('relink');
  links.unlinkTelegram('relink');
  assert.equal(links.processTelegramUpdate(update(tokenFrom(waiting.url), 502)), false);
  accounts.syncUserAlerts('relink', [], '123:stale', '501', 'uk');
  assert.equal(accounts.getUserTelegram('relink')?.botToken, undefined);
  assert.equal(accounts.getUserTelegram('relink')?.chatId, undefined);
});

test('polling persists offset and does not confirm updates before durable linking', async () => {
  globalThis.fetch = fakeBot;
  const link = await links.createTelegramLink('poll-user');
  const offsets: number[] = [];
  globalThis.fetch = async (_input, options) => {
    offsets.push(JSON.parse(String(options?.body)).offset);
    return Response.json({ ok: true, result: offsets.length === 1 ? [{ ...update(tokenFrom(link.url), 601), update_id: 999 }] : [] });
  };
  await links.pollTelegramUpdatesOnce(); await links.pollTelegramUpdatesOnce();
  assert.deepEqual(offsets, [0, 1000]);
  assert.equal(accounts.getUserTelegram('poll-user')?.chatId, '601');
  assert.equal(JSON.parse(fs.readFileSync(path.join(fixture, 'server/data/telegram_links.json'), 'utf8')).offset, 1000);
});

test('a personal test never changes the shared server bot or destination', async () => {
  globalThis.fetch = fakeBot;
  const before = telegram.getEffectiveTelegramConfig();
  assert.equal((await telegram.testTelegramConnection('456:private_fixture', '808')).success, true);
  assert.deepEqual(telegram.getEffectiveTelegramConfig(), before);
});

test('queue retries 429 after the requested delay and survives reloading from disk', async () => {
  const file = path.join(fixture, 'retry-outbox.json');
  const queue = new NotificationOutbox(file);
  let now = originalNow(); Date.now = () => now;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 3 } }, { status: 429 }); };
  const job = queue.enqueue({ userId: 'alice', htmlMessage: 'Retry fixture', scopedKey: 'retry-key' });
  await queue.drain();
  assert.equal(job.status, 'pending'); assert.ok(job.nextAttemptAt >= now + 3000);
  await queue.drain(); assert.equal(calls, 1);
  const restored = new NotificationOutbox(file);
  assert.equal(restored.stats('alice').pending, 1);
  assert.equal(restored.lastAccepted('retry-key'), now);
  now += 4000;
  globalThis.fetch = async () => { calls++; return Response.json({ ok: true, result: {} }); };
  await restored.drain(); assert.equal(restored.stats('alice').pending, 0); assert.equal(calls, 2);
  Date.now = originalNow;
});

test('a blocked bot is recorded as failed; unrelated users still receive their own messages', async () => {
  const queue = new NotificationOutbox(path.join(fixture, 'blocked-outbox.json'));
  const destinations: string[] = [];
  globalThis.fetch = async (_input, options) => {
    const { chat_id } = JSON.parse(String(options?.body)); destinations.push(chat_id);
    return chat_id === '101' ? Response.json({ ok: false, error_code: 403, description: 'bot was blocked by the user' }, { status: 403 }) : Response.json({ ok: true });
  };
  const blocked = queue.enqueue({ userId: 'alice', htmlMessage: 'Alice only' });
  const sent = queue.enqueue({ userId: 'bob', htmlMessage: 'Bob only' });
  await queue.drain();
  assert.equal(blocked.status, 'failed');
  // Global pacing may defer the next chat for 40ms; advance time without sleeping.
  const now = originalNow(); Date.now = () => now + 1200;
  await queue.drain(); Date.now = originalNow;
  assert.equal(sent.status, 'sent'); assert.deepEqual(destinations, ['101', '202']);
});

test('long messages resume at the next part after a restart instead of dropping content', async () => {
  const file = path.join(fixture, 'long-outbox.json');
  const queue = new NotificationOutbox(file);
  const texts: string[] = [];
  globalThis.fetch = async (_input, options) => { texts.push(JSON.parse(String(options?.body)).text); return Response.json({ ok: true }); };
  const text = 'x'.repeat(8000);
  queue.enqueue({ userId: 'bob', htmlMessage: text }); await queue.drain();
  let now = originalNow(); Date.now = () => now + 2000;
  const restored = new NotificationOutbox(file); await restored.drain();
  now += 2000; await restored.drain(); Date.now = originalNow;
  assert.equal(texts.join(''), text); assert.equal(restored.stats('bob').pending, 0);
});

test('pending surveillance notifications are cancelled after pause/removal or category changes', async () => {
  const queue = new NotificationOutbox(path.join(fixture, 'paused-outbox.json'));
  const coin: any = { id: 'paused-coin', userId: 'alice', symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures', isActive: false,
    config: { ...surveillance.getDefaultSurveillanceConfig(), triggerModes: ['realtime'] } };
  surveillance.saveSurveillanceList('alice', [coin]);
  let sends = 0; globalThis.fetch = async () => { sends++; return Response.json({ ok: true }); };
  const job = queue.enqueue({ userId: 'alice', coinId: coin.id, htmlMessage: 'Should not send',
    gate: { source: 'ORDERBOOK', symbol: coin.symbol, exchange: coin.exchange, marketType: coin.marketType,
      eventType: 'DENSITY_APPEARED', eventIdentity: 'wall', triggerMode: 'realtime' } });
  await queue.drain(); assert.equal(job.status, 'cancelled'); assert.equal(sends, 0);
  surveillance.saveSurveillanceList('alice', []);
});

test('one-shot alerts persist a failed delivery, update history on retry, and retain reactivation generation during stale sync', async () => {
  accounts.saveAlerts([]);
  accounts.createAlert({ id: 'offline-price', userId: 'alice', symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures', targetPrice: 100, condition: 'gte' });
  let fail = true;
  const destinations: string[] = [];
  globalThis.fetch = async (input, options) => {
    if (!String(input).includes('telegram.org')) return Response.json({ price: 120 });
    destinations.push(JSON.parse(String(options?.body)).chat_id);
    return fail ? Response.json({ ok: false, error_code: 502, description: 'Temporary outage' }, { status: 502 }) : Response.json({ ok: true });
  };
  await accounts.checkAlertsOnce();
  const fired = { ...accounts.getAllAlerts('alice')[0] };
  assert.equal(fired.triggered, true); assert.equal(accounts.getAlertHistory('alice')[0].telegramSent, false);
  accounts.saveUserTelegram('alice', { mode: 'shared', chatId: '909' }, true);
  fail = false; const now = originalNow(); Date.now = () => now + 10000;
  await notificationOutbox.drain(); Date.now = originalNow;
  assert.equal(accounts.getAlertHistory('alice')[0].telegramSent, true);
  assert.deepEqual(destinations, ['101', '909']);
  accounts.toggleAlert('offline-price', 'alice', true);
  const merged = accounts.syncUserAlerts('alice', [fired]);
  assert.equal(merged[0].deliveryGeneration, 1); assert.equal(merged[0].triggered, false);
});

test('durable notification acceptance and cooldown are recovered in a fresh server process', () => {
  const key = 'restart-cooldown';
  notificationOutbox.enqueue({ userId: 'bob', htmlMessage: 'Restart fixture', scopedKey: key });
  const module = new URL('../server/notificationOutbox.ts', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    `const {notificationOutbox:q}=await import(${JSON.stringify(module)}); if(q.lastAccepted(${JSON.stringify(key)})<=0||q.stats('bob').pending<1)process.exit(1);`], { cwd: fixture, encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0, child.stderr);
});

test('server accounts verify password hashes, use unpredictable IDs, persist sessions and revoke logout', async () => {
  const session = await auth.authenticateLocal('alice@example.test', 'correct-password', true);
  assert.match(session.user.uid, /^local_[0-9a-f-]+$/);
  assert.equal(await auth.verifyUserToken(session.accessToken), session.user.uid);
  await assert.rejects(auth.authenticateLocal('alice@example.test', 'wrong-password'));
  await assert.rejects(auth.authenticateLocal('alice@example.test', 'correct-password', true));
  const stored = fs.readFileSync(path.join(fixture, 'server/data/accounts.json'), 'utf8');
  assert.ok(!stored.includes('correct-password')); assert.ok(!stored.includes(session.accessToken));
  auth.revokeLocalToken(session.accessToken);
  await assert.rejects(auth.verifyUserToken(session.accessToken));
});

test('HTTP authentication rejects forged userIds and exposes only the verified account', async () => {
  const session = await auth.authenticateLocal('bob@example.test', 'correct-password', true);
  const app = express(); app.use(express.json()); app.use(requireMiddleware);
  function requireMiddleware(req: any, res: any, next: any) { return auth.requireUser(req, res, next); }
  app.all('/personal', (req, res) => res.json({ userId: res.locals.userId, query: req.query.userId, body: req.body.userId }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as any).port}/personal`;
  globalThis.fetch = originalFetch;
  try {
    assert.equal((await fetch(base)).status, 401);
    const headers = { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${base}?userId=alice`, { headers })).status, 403);
    assert.equal((await fetch(base, { headers, method: 'POST', body: JSON.stringify({ userId: 'alice' }) })).status, 403);
    const response = await fetch(base, { headers }); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { userId: session.user.uid, query: session.user.uid, body: session.user.uid });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('Firebase tokens require the correct project, signature, algorithm, expiry and authentication time', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  globalThis.fetch = async () => Response.json({ fixture: publicKey.export({ type: 'spki', format: 'pem' }) }, { headers: { 'Cache-Control': 'max-age=300' } });
  const now = Math.floor(originalNow() / 1000);
  const claims = { sub: 'firebase-owner', aud: 'knowledgeable-text-whh41', iss: 'https://securetoken.google.com/knowledgeable-text-whh41', exp: now + 3600, iat: now - 1, auth_time: now - 1 };
  const jwt = (changes = {}, header = {}) => {
    const encoded = [JSON.stringify({ alg: 'RS256', kid: 'fixture', ...header }), JSON.stringify({ ...claims, ...changes })].map(value => Buffer.from(value).toString('base64url')).join('.');
    return `${encoded}.${sign('RSA-SHA256', Buffer.from(encoded), privateKey).toString('base64url')}`;
  };
  assert.equal(await auth.verifyUserToken(jwt()), 'firebase-owner');
  for (const changes of [{ aud: 'other' }, { iss: 'other' }, { exp: now - 1 }, { iat: now + 3600 }, { auth_time: now + 3600 }, { sub: '' }]) await assert.rejects(auth.verifyUserToken(jwt(changes)));
  await assert.rejects(auth.verifyUserToken(jwt({}, { alg: 'none' })));
  const forged = jwt().split('.'); forged[1] = Buffer.from(JSON.stringify({ ...claims, sub: 'victim' })).toString('base64url');
  await assert.rejects(auth.verifyUserToken(forged.join('.')));
});


test('history retention is per user and generated history IDs satisfy Firestore rules', () => {
  const recorded = accounts.getAlertHistory('alice').find(item => item.alertId === 'offline-price');
  assert.ok(recorded);
  assert.match(recorded.id, /^[a-zA-Z0-9_-]{1,128}$/);
  const record: any = { id: 'history-owner-b', userId: 'history-b', symbol: 'BTCUSDT', triggeredAt: 1, telegramSent: true };
  accounts.saveHistory([...Array.from({ length: 500 }, (_, i) => ({ ...record, id: `history-a-${i}`, userId: 'history-a' })), record]);
  accounts.addHistoryItem({ ...record, id: 'history-a-new', userId: 'history-a' });
  assert.equal(accounts.getAlertHistory('history-a').length, 500);
  assert.deepEqual(accounts.getAlertHistory('history-b'), [record]);
});
