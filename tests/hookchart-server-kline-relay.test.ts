import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { EventEmitter, once } from 'node:events';
import WebSocket from 'ws';
import { installHookChartKlineRelay } from '../server/hookChartKlineRelay';

class FakeExchangeSocket extends EventEmitter {
  readyState = WebSocket.OPEN;
  sent: string[] = [];
  closed = false;
  constructor(readonly url: string) { super(); }
  send(data: string) { this.sent.push(data); }
  close() { this.closed = true; }
  emitMarket(packet: unknown) { this.emit('message', Buffer.from(JSON.stringify(packet))); }
}
const scope = 'exchange=binance&market=futures&symbol=BTCUSDT&timeframe=1m';
const candle = (eventTime: number, volume: number) => ({
  e: 'kline', E: eventTime, s: 'BTCUSDT', k: {
    t: 1710000000000, i: '1m', o: '100', h: '105', l: '99',
    c: '103', v: String(volume), n: 14,
  },
});
const takePacket = (ws: WebSocket, type: string) => new Promise<any>((resolve, reject) => {
  const timeout = setTimeout(() => { ws.off('message', onMessage); reject(new Error('relay timed out')); }, 1500);
  const onMessage = (body: WebSocket.RawData) => {
    const packet = JSON.parse(body.toString());
    if (packet.type !== type) return;
    clearTimeout(timeout);
    ws.off('message', onMessage);
    resolve(packet);
  };
  ws.on('message', onMessage);
});

test('one upstream Kline WebSocket fans out to two independent browser sessions', async () => {
  const server = createServer();
  const sources: FakeExchangeSocket[] = [];
  const relay = installHookChartKlineRelay(server, url => {
    const socket = new FakeExchangeSocket(url);
    sources.push(socket);
    return socket as unknown as WebSocket;
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const url = 'ws://127.0.0.1:' + port + '/api/hookchart/klines?' + scope;
  const a = new WebSocket(url), b = new WebSocket(url);
  try {
    await Promise.all([once(a, 'open'), once(b, 'open')]);
    assert.equal(sources.length, 1);
    assert.match(sources[0].url, /btcusdt@kline_1m$/);
    const nextA = takePacket(a, 'kline'), nextB = takePacket(b, 'kline');
    sources[0].emitMarket(candle(1710000000100, 15));
    assert.equal((await nextA).candle.volume, 15);
    assert.equal((await nextB).candle.volume, 15);
    sources[0].emitMarket(candle(1710000000100, 15));
    assert.equal(relay.stats().upstreamCandles, 1,
      'identical WS replay must not re-broadcast or falsely reset relay liveness');
    assert.equal(relay.stats().clients, 2);
    assert.equal(relay.stats().activeMarkets, 1);
    sources[0].emitMarket(candle(1710000000000, 20));
    sources[0].emitMarket(candle(1710000000200, 10));
    assert.equal(relay.stats().sent >= 4, true);
    assert.equal(relay.stats().upstreamCandles,1,
      'rejected out-of-order candles are not counted as accepted exchange frames');
    assert.ok(relay.stats().sentBytes > relay.stats().sent,
      'real VPS-to-client websocket bytes are recorded');
    const sameTime = candle(1710000000100, 15);
    const corrected = takePacket(a, 'kline');
    sources[0].emitMarket({ ...sameTime, k: { ...sameTime.k, n: 17, V: '4.25' } });
    assert.equal((await corrected).candle.tradeCount, 17);
    const next = takePacket(a, 'kline');
    sources[0].emitMarket(candle(1710000000300, 21));
    assert.equal((await next).candle.volume, 21);
  } finally {
    a.terminate(); b.terminate();
    relay.close(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('invalid instrument is rejected without opening any exchange socket', async () => {
  const server = createServer();
  let opened = 0;
  const relay = installHookChartKlineRelay(server, url => {
    opened++;
    return new FakeExchangeSocket(url) as unknown as WebSocket;
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const client = new WebSocket('ws://127.0.0.1:' + port +
    '/api/hookchart/klines?exchange=binance&market=futures&symbol=INVALID%2FUSDT&timeframe=2m');
  try {
    await once(client, 'close');
    assert.equal(opened, 0);
    assert.equal(relay.stats().activeMarkets, 0);
    assert.equal(relay.stats().rejected, 1);
  } finally {
    client.terminate();
    relay.close(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('relay is read-only and never allocates personal or Replay streams', async () => {
  const source = (await import('node:fs')).readFileSync(
    new URL('../src/components/hookchart/sharedKlineStream.ts', import.meta.url), 'utf8');
  const replay = (await import('node:fs')).readFileSync(
    new URL('../src/components/replay/ReplayChart.tsx', import.meta.url), 'utf8');
  assert.match(source, /\/api\/hookchart\/klines/);
  assert.match(source, /relayFallback = true/);
  assert.match(replay, /markers=\{hookMarkers\} replay/);
  assert.doesNotMatch(replay, /hookchart\/klines|subscribeSharedKlines/);
});


test('VPS relay does not reset retry backoff on WS open before the first valid candle', async () => {
  const server = createServer();
  const sources: FakeExchangeSocket[] = [];
  const relay = installHookChartKlineRelay(server, url => {
    const socket = new FakeExchangeSocket(url);
    sources.push(socket);
    return socket as unknown as WebSocket;
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const client = new WebSocket('ws://127.0.0.1:' + port + '/api/hookchart/klines?' + scope);
  const captureRetry = (fn: () => void) => {
    const native = globalThis.setTimeout;
    const timers: Array<{ fn: () => void; delay: number }> = [];
    (globalThis as any).setTimeout = (callback: () => void, delay: number) => {
      if (delay >= 1000 && delay <= 35_000) {
        timers.push({ fn: callback, delay });
        return {} as ReturnType<typeof setTimeout>;
      }
      return native(callback, delay);
    };
    try { fn(); }
    finally { (globalThis as any).setTimeout = native; }
    assert.equal(timers.length, 1, 'exactly one relay retry timer must be scheduled');
    return timers[0];
  };
  try {
    await once(client, 'open');
    assert.equal(sources.length, 1);
    const first = captureRetry(() => {
      sources[0].emit('open');
      sources[0].emit('close');
    });
    assert.ok(first.delay >= 1_000 && first.delay < 2_000);
    first.fn();
    assert.equal(sources.length, 2);
    const second = captureRetry(() => {
      sources[1].emit('open');
      sources[1].emit('close');
    });
    assert.ok(second.delay >= 2_000 && second.delay < 3_000,
      'open-close without a valid candle must increase server-side backoff');
    second.fn();
    assert.equal(sources.length, 3);
    sources[2].emit('open');
    sources[2].emitMarket(candle(1710000000300, 50));
    assert.equal(relay.stats().upstreamCandles, 1);
    const recovered = captureRetry(() => sources[2].emit('close'));
    assert.ok(recovered.delay >= 1_000 && recovered.delay < 2_000,
      'accepted exchange data resets the retry delay to baseline');
  } finally {
    client.terminate();
    relay.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
