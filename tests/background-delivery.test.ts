import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

test('two users receive their own background alerts; tracking survives restart and suspends signals on stale prices', { timeout: 75000 }, async () => {
  const root = process.cwd();
  const directory = fs.mkdtempSync(path.join(root, '.test-background-'));
  const dataDirectory = path.join(directory, 'data');
  const pauseFile = path.join(directory, 'pause-stream');
  const updates: any[] = [];
  const delivered: any[] = [];
  const attempts: any[] = [];
  let failedAlice = false;
  let server: ChildProcess | undefined;
  let base = '';
  let output = '';
  const readJobs = () => {
    try { return JSON.parse(fs.readFileSync(path.join(dataDirectory, 'notification_outbox.json'), 'utf8')); }
    catch { return []; }
  };
  const until = async (check: () => boolean | Promise<boolean>, label: string, timeout = 12000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await check()) return;
      if (server && server.exitCode !== null) throw new Error(`Server exited: ${output}`);
      await delay(30);
    }
    throw new Error(`Timed out: ${label}\n${output}`);
  };
  const upstream = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const target = new URL(new URL(req.url!, 'http://fixture').searchParams.get('upstream')!);
    const reply = (value: unknown, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value));
    };
    if (target.pathname.endsWith('/getMe')) return reply({ ok: true, result: { id: 123, is_bot: true, username: 'fixture_bot' } });
    if (target.pathname.endsWith('/getUpdates')) return reply({ ok: true, result: updates.filter(u => u.update_id >= (body.offset || 0)) });
    if (target.pathname.endsWith('/sendMessage')) {
      attempts.push(body);
      if (body.chat_id === '101' && !failedAlice) {
        failedAlice = true;
        return reply({ ok: false, error_code: 503, description: 'Fixture temporary outage' }, 503);
      }
      delivered.push(body);
      // Acceptance at Telegram precedes the application's durable acknowledgement.
      await delay(80);
      return reply({ ok: true, result: { message_id: delivered.length } });
    }
    if (target.pathname.endsWith('/ticker/price')) {
      if (!target.searchParams.has('symbol')) return reply({}, 503);
      assert.ok(['币安人生USDT', 'ETHUSDT'].includes(target.searchParams.get('symbol')!), 'price requests preserve the complete symbol');
      assert.ok(!target.searchParams.has('injected'));
      return reply({ price: '120' });
    }
    if (target.pathname.endsWith('/klines')) {
      const interval = target.searchParams.get('interval') || '15m';
      const minutes = ({ '1d': 1440, '4h': 240, '1h': 60, '15m': 15, '5m': 5 } as Record<string, number>)[interval] || 15;
      const step = minutes * 60000;
      const end = Math.floor(Date.now() / step) * step;
      return reply(Array.from({ length: 80 }, (_, i) => [end - (79 - i) * step, '120', '121', '119', '120', '100']));
    }
    return reply({}, 503);
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const fixtureOrigin = `http://127.0.0.1:${(upstream.address() as net.AddressInfo).port}`;
  const stop = async () => {
    if (!server) return;
    if (server.exitCode === null) { const exited = once(server, 'exit'); server.kill('SIGKILL'); await exited; }
    server = undefined;
  };
  const start = async () => {
    const reservation = net.createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = (reservation.address() as net.AddressInfo).port;
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    server = spawn(process.execPath, ['--import', 'tsx', '--import', path.join(root, 'tests/fixtures/background-services.ts'), path.join(root, 'server.ts')], {
      cwd: directory,
      env: { ...process.env, NODE_ENV: 'production', DATA_DIR: dataDirectory, PORT: String(port),
        TELEGRAM_BOT_TOKEN: '123:fixture_only', TELEGRAM_CHAT_ID: '', BACKGROUND_FIXTURE_ORIGIN: fixtureOrigin, BACKGROUND_STREAM_PAUSE_FILE: pauseFile },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [server.stdout!, server.stderr!]) stream.on('data', data => { output = (output + data).slice(-12000); });
    base = `http://127.0.0.1:${port}`;
    await until(async () => { try { return (await fetch(base + '/api/health')).ok; } catch { return false; } }, 'HTTP startup');
  };
  const request = async (route: string, token?: string, body?: unknown, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  };
  try {
    await start();
    const register = async (name: string) => {
      const response = await request('/api/auth/local/register', undefined, { email: `${name}@example.test`, password: 'fixture-password-123', displayName: name });
      assert.equal(response.status, 200); return response.data;
    };
    const alice = await register('alice'), bob = await register('bob');
    for (const [user, chat] of [[alice, 101], [bob, 202]] as const) {
      const link = await request('/api/telegram/connect', user.accessToken, { language: 'en' });
      assert.equal(link.status, 200);
      const token = new URL(link.data.url).searchParams.get('start');
      assert.ok(token);
      updates.push({ update_id: updates.length + 1, message: { chat: { id: chat, type: 'private' }, from: { id: chat }, text: `/start ${token}` } });
      await until(async () => (await request('/api/telegram/status', user.accessToken)).data.isConfigured, 'personal Telegram link');
    }
    assert.equal((await request(`/api/telegram/status?userId=${alice.user.uid}`, bob.accessToken)).status, 403);
    const tracking = await request('/api/surveillance', alice.accessToken, { symbol: '币安人生USDT', exchange: 'binance', marketType: 'futures', config: { telegramEnabled: false } });
    assert.equal(tracking.status, 200);
    const coinId = tracking.data.coin.id;
    // unshift means Bob is evaluated first, then Alice whose first delivery fails.
    for (const [user, symbol] of [[alice, '币安人生USDT'], [bob, 'ETHUSDT']] as const) {
      assert.equal((await request('/api/alerts', user.accessToken, { id: `background-${symbol}`, symbol, exchange: 'binance', marketType: 'futures', targetPrice: 100, condition: 'gte' })).status, 200);
    }
    // No browser/HTTP trigger is used. Only the production cron and outbox run.
    await until(() => readJobs().some((job: any) => job.userId === alice.user.uid && job.status === 'pending' && job.attempts === 1), 'persisted temporary delivery failure');
    assert.ok(delivered.some(message => message.chat_id === '202' && message.text.includes('ETHUSDT')));
    await stop();
    assert.ok(readJobs().some((job: any) => job.userId === alice.user.uid && job.status === 'pending'));
    await start();
    await until(() => delivered.length === 2, 'background retry after hard restart');
    await until(() => readJobs().length === 2 && readJobs().every((job: any) => job.status === 'sent'), 'persisted delivery acknowledgements');
    assert.deepEqual(delivered.map(message => [message.chat_id, message.text.includes('币安人生USDT') ? '币安人生USDT' : 'ETHUSDT']).sort(), [['101', '币安人生USDT'], ['202', 'ETHUSDT']]);
    assert.equal(attempts.length, 3, 'one transient failure, then exactly the two expected deliveries');
    assert.ok(readJobs().every((job: any) => job.status === 'sent'));
    const restored = await request(`/api/surveillance/worker/${coinId}`, alice.accessToken);
    assert.equal(restored.status, 200);
    assert.equal(restored.data.data.isActive, true);
    await until(async () => (await request(`/api/surveillance/worker/${coinId}`, alice.accessToken)).data.data.lastAnalysisTimestamp > 0, 'automatic restored worker analysis');
    fs.writeFileSync(pauseFile, 'paused');
    await delay(17_000);
    const stoppedAt = (await request(`/api/surveillance/worker/${coinId}`, alice.accessToken)).data.data.lastAnalysisTimestamp;
    await delay(6500);
    assert.equal((await request(`/api/surveillance/worker/${coinId}`, alice.accessToken)).data.data.lastAnalysisTimestamp, stoppedAt, 'stale quotes cannot generate new analysis/signals');
    fs.unlinkSync(pauseFile);
    await until(async () => (await request(`/api/surveillance/worker/${coinId}`, alice.accessToken)).data.data.lastAnalysisTimestamp > stoppedAt, 'automatic recovery after fresh stream data returns');
    assert.equal((await request(`/api/surveillance/worker/${coinId}`, bob.accessToken)).status, 404);
    for (const user of [alice, bob]) {
      const history = (await request('/api/alerts/history', user.accessToken)).data.history;
      assert.equal(history.length, 1); assert.equal(history[0].telegramSent, true);
      assert.equal((await request('/api/alerts', user.accessToken)).data.alerts[0].triggered, true);
    }
    await stop();
    await start();
    await delay(2200);
    assert.equal(attempts.length, 3, 'completed jobs and consumed rules are not replayed after another restart');
    assert.equal((await request('/api/telegram/status', alice.accessToken)).data.chatId, '101');
    assert.equal((await request('/api/telegram/status', bob.accessToken)).data.chatId, '202');
  } finally {
    await stop();
    upstream.closeAllConnections();
    await new Promise<void>(resolve => upstream.close(() => resolve()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
