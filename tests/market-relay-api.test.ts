import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

test('production HTTP and WebSocket relays authenticate accounts, reject private targets and share public data', async () => {
  const root = process.cwd(), directory = fs.mkdtempSync(path.join(root, '.test-market-relay-'));
  const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = (reservation.address() as net.AddressInfo).port; await new Promise<void>(resolve => reservation.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`, sockets: WebSocket[] = [];
  const server = spawn(process.execPath, ['--import', 'tsx', '--import', path.join(root, 'tests/fixtures/mock-exchange.ts'), 'server.ts'], {
    cwd: root, env: { ...process.env, DATA_DIR: directory, PORT: String(port), NODE_ENV: 'production', TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; server.stdout.on('data', data => { output = (output + data).slice(-8000); }); server.stderr.on('data', data => { output = (output + data).slice(-8000); });
  const request = async (route: string, token?: string, body?: unknown) => fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const connect = async (token: string, topic: string) => {
    const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/market/stream?source=' + encodeURIComponent('wss://stream.bybit.com/v5/public/linear'));
    sockets.push(socket); await once(socket, 'open');
    const ready = once(socket, 'message'); socket.send(JSON.stringify({ type: 'auth', token }));
    const [raw] = await ready; assert.equal(JSON.parse(String(raw)).type, 'hook2.ready');
    socket.send(JSON.stringify({ op: 'subscribe', args: [topic] })); return socket;
  };
  try {
    let ready = false;
    for (let n = 0; n < 180; n++) {
      if (server.exitCode !== null) throw new Error(output);
      try { if ((await request('/api/health')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready, output);
    const register = async (name: string) => {
      const response = await request('/api/auth/local/register', undefined, { email: name + '@example.test', password: 'fixture-password-123', displayName: name });
      assert.equal(response.status, 200); return (await response.json()).accessToken as string;
    };
    const alice = await register('alice'), bob = await register('bob');
    const source = '/api/market/source?url=' + encodeURIComponent('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    assert.equal((await request(source)).status, 401);
    const quotes = await Promise.all(Array.from({ length: 60 }, async (_, index) => (await (await request(source, index % 2 ? alice : bob)).json()).price));
    assert.ok(quotes.every(price => price === '100'));
    let status = await (await request('/api/market/connection-status', alice)).json();
    assert.ok(status.sources.find((entry: any) => entry.exchange === 'binance').cacheHits + status.sources.find((entry: any) => entry.exchange === 'binance').shared >= 59);
    for (const target of ['https://127.0.0.1/api/v3/depth', 'https://api.binance.com/api/v3/account', 'https://api.bybit.com/v5/order/create']) assert.equal((await request('/api/market/source?url=' + encodeURIComponent(target), alice)).status, 400);
    const one = await connect(alice, 'orderbook.50.BTCUSDT'), two = await connect(bob, 'publicTrade.ETHUSDT');
    const seenOne: string[] = [], seenTwo: string[] = [];
    one.on('message', raw => { const value = JSON.parse(raw.toString()); if (value.topic) seenOne.push(value.topic); });
    two.on('message', raw => { const value = JSON.parse(raw.toString()); if (value.topic) seenTwo.push(value.topic); });
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.ok(seenOne.length > 0 && seenTwo.length > 0); assert.ok(seenOne.every(topic => topic === 'orderbook.50.BTCUSDT')); assert.ok(seenTwo.every(topic => topic === 'publicTrade.ETHUSDT'));
    status = await (await request('/api/market/connection-status', alice)).json(); assert.equal(status.streams.connections, 1); assert.equal(status.streams.consumers, 2);
    const legacy = await (await request('/api/market/smart-analysis?symbol=BTCUSDT', bob)).json();
    assert.equal(legacy.success, false); assert.match(legacy.error, /Перезавантажте/);
    const analysis = await (await request('/api/market/smart-analysis?schema=2&symbol=BTCUSDT&exchange=bybit&price=999999', bob)).json();
    assert.equal(analysis.success, true); assert.equal(analysis.data.currentPrice, 100); assert.equal(analysis.data.derivatives.bybitFundingRate, 0);
    const rejected = new WebSocket(base.replace('http:', 'ws:') + '/api/market/stream?source=' + encodeURIComponent('wss://stream.bybit.com/v5/public/linear')); sockets.push(rejected);
    await once(rejected, 'open'); const closed = once(rejected, 'close'); rejected.send('{"type":"auth","token":"local.invalid"}'); assert.equal((await closed)[0], 4001);
    for (const target of ['http://[invalid/', '//[invalid/']) {
      const malformed = net.connect(port, '127.0.0.1');
      malformed.on('error', () => {});
      const disconnected = new Promise<void>(resolve => malformed.once('close', () => resolve()));
      await once(malformed, 'connect');
      malformed.write(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`);
      await disconnected;
      assert.equal((await request('/api/health')).status, 200, 'a malformed upgrade must not stop the server');
    }
  } finally {
    sockets.forEach(socket => socket.terminate());
    if (server.exitCode === null) { const exited = once(server, 'exit'); server.kill(); const timer = setTimeout(() => server.kill('SIGKILL'), 7000); await exited; clearTimeout(timer); }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
