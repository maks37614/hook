import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { EventEmitter, once } from 'node:events';
import WebSocket from 'ws';
import {
  decodeHookChartKlineFrame,
  isHookChartKlineUpstreamStale,
  installHookChartKlineRelay,
} from '../server/hookChartKlineRelay';

class ExchangeSocket extends EventEmitter {
  readyState = WebSocket.OPEN;
  closed = false;
  constructor(readonly url: string) { super(); }
  send(_data: string) {}
  close() { this.closed = true; }
  push(raw: WebSocket.RawData) { this.emit('message', raw); }
}

const scope = (symbol: string) => 'exchange=binance&market=futures&symbol=' +
  encodeURIComponent(symbol) + '&timeframe=1m';

const marketPacket = (symbol: string, sequence: number) => ({
  e: 'kline', E: 1710000000000 + sequence, s: symbol,
  k: {
    t: 1710000000000, i: '1m', o: '100', h: '105',
    l: '99', c: '103', v: String(10 + sequence), n: 4,
  },
});

function nextMarketCandle(ws: WebSocket) {
  return new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error('missing relayed Kline'));
    }, 1500);
    const onMessage = (raw: WebSocket.RawData) => {
      const packet = JSON.parse(raw.toString());
      if (packet.type !== 'kline') return;
      clearTimeout(timeout);
      ws.off('message', onMessage);
      resolve(packet);
    };
    ws.on('message', onMessage);
  });
}

test('relay decodes Buffer, ArrayBuffer and fragmented UTF-8 exchange Klines', async () => {
  const symbol = '币安人生USDT';
  const server = createServer();
  const upstream: ExchangeSocket[] = [];
  const relay = installHookChartKlineRelay(server, url => {
    const socket = new ExchangeSocket(url);
    upstream.push(socket);
    return socket as unknown as WebSocket;
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const client = new WebSocket('ws://127.0.0.1:' + port +
    '/api/hookchart/klines?' + scope(symbol));
  try {
    await once(client, 'open');
    assert.equal(upstream.length, 1, 'one upstream per subscribed market');
    upstream[0].emit('open');
    for (let n = 1; n <= 3; n++) {
      const raw = Buffer.from(JSON.stringify(marketPacket(symbol, n)), 'utf8');
      const variant: WebSocket.RawData = n === 1 ? raw :
        n === 2 ? Uint8Array.from(raw).buffer :
          [raw.subarray(0, 9), raw.subarray(9, 16), raw.subarray(16)];
      const next = nextMarketCandle(client);
      upstream[0].push(variant);
      const packet = await next;
      assert.equal(packet.candle.volume, 10 + n);
    }
    assert.equal(relay.stats().upstreamCandles, 3);
    assert.equal(relay.stats().activeMarkets, 1);
  } finally {
    client.terminate();
    relay.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('frame decoder preserves a Unicode symbol across split multibyte characters', () => {
  const bytes = Buffer.from(JSON.stringify({ symbol: '币安人生USDT' }), 'utf8');
  const frames: WebSocket.RawData[] = [
    bytes,
    Uint8Array.from(bytes).buffer,
    [bytes.subarray(0, 14), bytes.subarray(14, 15), bytes.subarray(15)],
  ];
  for (const raw of frames) assert.equal(decodeHookChartKlineFrame(raw), bytes.toString('utf8'));
});

test('a newly open silent socket expires independently of any previous cached candle', () => {
  const opened = 50_000;
  assert.equal(isHookChartKlineUpstreamStale(opened, 10_000, false, opened + 25_000), false);
  assert.equal(isHookChartKlineUpstreamStale(opened, 10_000, false, opened + 25_001), true);
  assert.equal(isHookChartKlineUpstreamStale(opened, 55_000, true, 80_000), false);
  assert.equal(isHookChartKlineUpstreamStale(opened, 55_000, true, 80_001), true);
  assert.equal(isHookChartKlineUpstreamStale(0, 0, false, 100_000), false);
});

test('silent relay upstream is closed once and enters bounded reconnect after 25s', async () => {
  const nativeInterval = globalThis.setInterval;
  let tick!: () => void;
  const intervalReplacement = ((callback: () => void, delay?: number, ...args: unknown[]) => {
    if (delay === 5000) {
      tick = callback;
      return { unref() {} } as unknown as ReturnType<typeof setInterval>;
    }
    return nativeInterval(callback, delay, ...args);
  }) as typeof setInterval;
  let relay!: ReturnType<typeof installHookChartKlineRelay>;
  const server = createServer();
  const sources: ExchangeSocket[] = [];
  globalThis.setInterval = intervalReplacement;
  try {
    relay = installHookChartKlineRelay(server, url => {
      const socket = new ExchangeSocket(url);
      sources.push(socket);
      return socket as unknown as WebSocket;
    });
  } finally {
    globalThis.setInterval = nativeInterval;
  }
  const nativeNow = Date.now;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const client = new WebSocket('ws://127.0.0.1:' + port + '/api/hookchart/klines?' + scope('BTCUSDT'));
  try {
    await once(client, 'open');
    assert.equal(sources.length, 1);
    sources[0].emit('open');
    Date.now = () => nativeNow() + 26_001;
    tick();
    assert.equal(sources[0].closed, true, 'a socket with no valid Kline must be retired');
    tick();
    assert.equal(relay.stats().reconnects, 0, 'watchdog must not repeatedly close a pending socket');
    sources[0].emit('close');
    assert.equal(relay.stats().reconnects, 1, 'close event enters existing bounded retry');
  } finally {
    Date.now = nativeNow;
    client.terminate();
    relay.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
