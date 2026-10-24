import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';

const root = process.cwd();
test('registration grants permanent access, retired code routes are unavailable and sessions persist', async () => {
  const directory = fs.mkdtempSync(path.join(root, '.test-access-api-'));
  const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = (reservation.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  let server: ChildProcess | undefined, output = '';
  const env = { ...process.env, DATA_DIR: directory, PORT: String(port), NODE_ENV: 'production', TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' };
  async function start() {
    server = spawn(process.execPath, ['--import', 'tsx', '--import', path.join(root, 'tests/fixtures/offline-market.ts'), path.join(root, 'server.ts')], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout!.on('data', data => { output = (output + data).slice(-8000); }); server.stderr!.on('data', data => { output = (output + data).slice(-8000); });
    for (let n = 0; n < 120; n++) { if (server.exitCode !== null) throw new Error(output); try { if ((await fetch(base + '/api/health')).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 50)); }
    throw new Error(output);
  }
  async function stop() { if (server && server.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited; } }
  async function request(route: string, token?: string, body?: any, method = body ? 'POST' : 'GET') {
    const response = await fetch(base + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text() };
  }
  try {
    await start();
    for (const route of ['/api/market/quotes', '/api/klines?symbol=BTCUSDT', '/api/access/status', '/api/alerts', '/api/surveillance']) assert.equal((await request(route)).status, 401, route);
    const register = (name: string) => request('/api/auth/local/register', undefined, { email: name + '@example.test', password: 'test-password-123', displayName: name });
    const alice = (await register('alice')).body, bob = (await register('bob')).body;
    assert.equal(alice.success, true); assert.equal(bob.success, true);
    const aliceToken = alice.accessToken, bobToken = bob.accessToken;
    for (const token of [aliceToken, bobToken]) {
      const result = await request('/api/access/status', token);
      assert.equal(result.status, 200);
      assert.equal(result.body.access.status, 'free');
      assert.equal(result.body.access.hasFullAccess, true);
      assert.equal(result.body.access.fullAccessUntil, null);
      assert.ok(!('trialEndsAt' in result.body.access));
    }
    assert.equal((await request('/api/access/redeem', bobToken, { code: 'HOOK-OBSOLETE' })).status, 404);
    assert.equal((await request('/api/access/admin', bobToken)).status, 404);
    assert.equal((await request('/api/access/admin/codes', bobToken, { targetUserId: bob.user.uid })).status, 404);
    assert.equal((await request('/api/alerts', bobToken)).status, 200);
    assert.equal((await request('/api/surveillance', bobToken)).status, 200);
    for (const query of ['exchange=invalid', 'marketType=invalid', 'timeframe=invalid',
      'minVolume=NaN', 'minVolume=Infinity', 'minVolume=-1', 'exchange=binance&exchange=bybit']) {
      assert.equal((await request('/api/screener/scan?' + query, bobToken)).status, 400, query);
    }
    assert.notEqual((await request('/api/screener/scan', bobToken)).status, 403);
    assert.equal((await request('/api/auth/local/register', undefined, { email: 'bad@example.test', password: 'test-password-123', isAdmin: true, inviteCode: 'invalid' })).status, 200);
    await stop();
    const file = path.join(directory, 'access.json');
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    state.members[bob.user.uid].trialEndsAt = Date.now() - 20_000;
    state.members[bob.user.uid].paidUntil = Date.now() - 20_000;
    fs.writeFileSync(file, JSON.stringify(state));
    await start();
    const migrated = (await request('/api/access/status', bobToken)).body.access;
    assert.equal(migrated.status, 'free');
    assert.equal(migrated.hasFullAccess, true);
    assert.equal((await request('/api/alerts', bobToken)).status, 200);
    assert.equal((await request('/api/market/quotes?minVolume=0', bobToken)).status, 503, 'Market API reaches offline exchange fixture');
    const unavailableHistory = await request('/api/klines?symbol=BTCUSDT&limit=10', bobToken);
    assert.equal(unavailableHistory.status, 503);
    assert.equal(unavailableHistory.body.success, false, 'Unavailable history must not be reported as a successful empty chart');
    assert.equal(unavailableHistory.body.sourceUnavailable, true);
    assert.equal((await request('/api/auth/local/login', undefined, { email: 'bob@example.test', password: 'test-password-123' })).status, 200);
  } finally { await stop(); fs.rmSync(directory, { recursive: true, force: true }); }
});
