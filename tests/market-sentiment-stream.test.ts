import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';
import type { MarketCoin } from '../src/types';
import { calculateMarketSentiment } from '../server/sentimentService';
import { installMarketSentimentStream } from '../server/marketSentimentStream';
import { readMarketSentimentPacket } from '../src/utils/marketSentimentSocket';

const coin: MarketCoin = {
  symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures',
  baseAsset: 'BTC', quoteAsset: 'USDT', price: 100, change24h: 2,
  volumeUsd: 50_000_000, high24h: 110, low24h: 90, volatility24hPct: 22,
  distanceToHighPct: 9, distanceToLowPct: 10,
  isNearHigh: false, isNearLow: false, isActiveCoin: true, exchangeUrl: '',
};

const withServer = async (
  action: (url: string, server: ReturnType<typeof createServer>) => Promise<void>,
) => {
  const server = createServer((_req, res) => { res.statusCode = 404; res.end(); });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  try { await action('ws://127.0.0.1:' + address.port + '/api/market/sentiment/live', server); }
  finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
};

test('stream uses EXACT current REST calculation for every metric, including unavailability fields', async () => {
  const expected = await calculateMarketSentiment([coin, { ...coin, symbol: 'ETHUSDT', change24h: -1 }]);
  // JSON omits undefined optional fields; the wire format must compare with
  // the serialized REST result, not the in-memory object.
  const expectedWire = JSON.parse(JSON.stringify(expected));
  await withServer(async (url, server) => {
    let count = 0;
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const stream = installMarketSentimentStream(server, async () => {
      count++;
      await gate;
      return expected;
    });
    const sockets: WebSocket[] = [];
    try {
      assert.deepEqual(stream.stats(), { clients: 0, activeTimer: false, computations: 0,
        errors: 0, hasSnapshot: false }, 'no viewers must mean zero market work');
      const first = new WebSocket(url), second = new WebSocket(url);
      sockets.push(first, second);
      await Promise.all([
        once(first, 'open', { signal: AbortSignal.timeout(3000) }),
        once(second, 'open', { signal: AbortSignal.timeout(3000) }),
      ]);
      const msg1 = once(first, 'message', { signal: AbortSignal.timeout(3000) });
      const msg2 = once(second, 'message', { signal: AbortSignal.timeout(3000) });
      assert.equal(count, 1, 'all connected viewers reuse a single flight');
      assert.equal(stream.stats().activeTimer, true);
      finish();
      const [[raw1], [raw2]] = await Promise.all([msg1, msg2]);
      const firstPacket = JSON.parse(Buffer.from(raw1).toString('utf8'));
      const secondPacket = JSON.parse(Buffer.from(raw2).toString('utf8'));
      assert.deepEqual(firstPacket.data, expectedWire);
      assert.deepEqual(secondPacket.data, expectedWire);
      assert.equal(firstPacket.type, 'sentiment');
      assert.deepEqual(readMarketSentimentPacket(firstPacket)?.data, expectedWire);
      assert.equal(firstPacket.data.marketBreadth.aboveEma20Pct, null);
      assert.equal(firstPacket.data.capitalFlow.netInflow24hUsd, null);
      assert.deepEqual(firstPacket.data.derivativesOverview, expectedWire.derivativesOverview);

      first.close();
      second.close();
      await Promise.all([
        once(first, 'close', { signal: AbortSignal.timeout(3000) }),
        once(second, 'close', { signal: AbortSignal.timeout(3000) }),
      ]);
      assert.equal(stream.stats().clients, 0);
      assert.equal(stream.stats().activeTimer, false, 'no timer without viewers');

      const third = new WebSocket(url);
      sockets.push(third);
      const again = once(third, 'message', { signal: AbortSignal.timeout(3000) });
      const [cached] = await again;
      assert.deepEqual(JSON.parse(Buffer.from(cached).toString('utf8')).data, expectedWire);
      assert.equal(count, 1, 'reconnection uses recent snapshot without new exchange work');
      third.close();
      await once(third, 'close', { signal: AbortSignal.timeout(3000) });
    } finally {
      finish();
      stream.close();
      for (const socket of sockets) if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
    }
  });
});

test('temporarily missing exchange data never turns a verified metric into fabricated zero', async () => {
  const snapshot = await calculateMarketSentiment([coin]);
  const snapshotWire = JSON.parse(JSON.stringify(snapshot));
  await withServer(async (url, server) => {
    let calls = 0;
    const stream = installMarketSentimentStream(server, async () => {
      if (++calls === 1) throw new Error('Exchange unavailable');
      return snapshot;
    }, { intervalMs: 80 });
    const client = new WebSocket(url);
    try {
      const first = once(client, 'message', { signal: AbortSignal.timeout(3000) });
      const [unavailableRaw] = await first;
      const unavailable = JSON.parse(Buffer.from(unavailableRaw).toString('utf8'));
      assert.equal(unavailable.type, 'unavailable');
      assert.equal(readMarketSentimentPacket(unavailable), null);
      const second = once(client, 'message', { signal: AbortSignal.timeout(3000) });
      const [recoveredRaw] = await second;
      const recovered = JSON.parse(Buffer.from(recoveredRaw).toString('utf8'));
      assert.deepEqual(recovered.data, snapshotWire);
      assert.ok(calls >= 2);
    } finally {
      stream.close();
      if (client.readyState !== WebSocket.CLOSED) client.terminate();
    }
  });
});

test('sentiment socket rejects unverified/stale/incomplete frames and retains nullable fields', async () => {
  const data = await calculateMarketSentiment([coin]);
  const now = Date.now();
  const valid = { type: 'sentiment', at: now, data };
  assert.deepEqual(readMarketSentimentPacket(valid, now)?.data, data);
  assert.equal(readMarketSentimentPacket({ ...valid, at: now - 91_000 }, now), null);
  assert.equal(readMarketSentimentPacket({ ...valid, at: now + 3_000 }, now), null);
  assert.equal(readMarketSentimentPacket({ ...valid, data: { ...data, dataQuality: null } }, now), null);
  assert.equal(readMarketSentimentPacket({ ...valid, data: { ...data, compositeScore: 150 } }, now), null);
  assert.equal(readMarketSentimentPacket({ ...valid, data: { ...data, capitalFlow: null } }, now), null);
  assert.equal(readMarketSentimentPacket({ ...valid, type: 'quotes' }, now), null);
});

test('HTTP fallback and UI profile translations are preserved without additional exchange sockets', () => {
  const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const sentiment = readFileSync(new URL('../server/sentimentService.ts', import.meta.url), 'utf8');
  const relay = readFileSync(new URL('../server/marketSentimentStream.ts', import.meta.url), 'utf8');
  const widget = readFileSync(new URL('../src/components/MarketSentimentWidget.tsx', import.meta.url), 'utf8');
  assert.match(server, /app\.get\('\/api\/market\/sentiment'/);
  assert.match(server, /installMarketSentimentStream\(httpServer\)/);
  assert.match(server, /pathname !== '\/api\/market\/sentiment\/live'/);
  assert.doesNotMatch(relay, /new WebSocket\(|fapi\.binance|api\.bybit|fetch\(/);
  assert.match(sentiment, /const CACHE_TTL_MS = 25_000/);
  assert.match(sentiment, /const rawScore = 50/);
  assert.match(sentiment, /liveSentimentInFlight/);
  assert.match(widget, /createMarketSentimentSocket\(/);
  assert.match(widget, /fetch\('\/api\/market\/sentiment'\)/);
  assert.match(widget, /setInterval\(refreshVisible, 30000\)/);
  assert.match(widget, /updateProfileData\(\{ marketSentimentExpanded: next \}\)/);
  assert.match(widget, /<MarketSentimentScale score=\{data\.compositeScore\}/);
  assert.match(widget, /document\.visibilityState === 'hidden'/);
});
