import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateMarketPrintsByCandle, filterMarketPrintCandleBuckets, normalizeMarketPrintDisplayMinUsd } from '../src/components/hookchart/marketPrintBuckets';
import { LargeMarketTradeTracker, subscribeMarketTrades } from '../src/components/hookchart/marketTradeStream';
import type { MarketPrint } from '../src/components/hookchart/marketAnalytics';

const examplePrint = (id: string, side: 'BUY' | 'SELL', t: number, usd: number): MarketPrint => ({
  id, side, t, usd, p: 1, count: 1, score: 100, touches: 1, lastTouch: t,
});

test('per-candle total uses each unique large-print ID once, and combines BUY/SELL', () => {
  const first = 1_000_000;
  const candles = [{ t: first }, { t: first + 60_000 }, { t: first + 120_000 }];
  const prints = [
    examplePrint('b1', 'BUY', first + 15_000, 1000),
    examplePrint('b1', 'BUY', first + 15_000, 1200), // evolving burst, not a second trade
    examplePrint('b2', 'BUY', first + 59_900, 300),
    examplePrint('s1', 'SELL', first + 20_000, 250),
    examplePrint('s2', 'SELL', first + 60_001, 500),
  ];
  const buckets = aggregateMarketPrintsByCandle(candles, prints, 60_000);
  assert.equal(buckets.length, 2);
  assert.deepEqual({ buy: buckets[0].buyUsd, sell: buckets[0].sellUsd, total: buckets[0].totalUsd },
    { buy: 1500, sell: 250, total: 1750 });
  assert.deepEqual({ buy: buckets[1].buyUsd, sell: buckets[1].sellUsd },
    { buy: 0, sell: 500 });
  assert.equal(buckets[0].buyGroups, 2);
  assert.equal(buckets[0].sellGroups, 1);
});

test('split a large execution burst across exact candle boundaries, including a missing candle', () => {
  const t = 1_020_000;
  const boundary = t + 60_000;
  const group = {
    ...examplePrint('cross', 'BUY', boundary - 200, 3000),
    segments: [{ t: boundary - 1000, usd: 1200 }, { t: boundary, usd: 1800 }],
  };
  const buckets = aggregateMarketPrintsByCandle(
    [{ t }, { t: boundary }, { t: boundary + 120_000 }], [group], 60_000,
  );
  assert.equal(buckets[0].buyUsd, 1200);
  assert.equal(buckets[1].buyUsd, 1800);
  assert.equal(buckets[0].totalUsd + buckets[1].totalUsd, group.usd);
  assert.deepEqual(aggregateMarketPrintsByCandle([{ t }, { t: t + 120_000 }],
    [examplePrint('gap', 'SELL', t + 90_000, 999)], 60_000), []);
});

test('tracker rejects duplicate REST/WS IDs, including when a burst is updated repeatedly', () => {
  const now = Math.floor(Date.now() / 1000) * 1000 + 100;
  const tracker = new LargeMarketTradeTracker();
  tracker.seedThreshold(Array.from({ length: 40 }, (_, i) => ({
    id: 'seed-' + i, t: now - 3000 + i, p: 10, q: 10, side: 'BUY' as const,
  })));
  assert.equal(tracker.accept({ id: 'one', t: now, p: 10, q: 20, side: 'BUY' })?.usd, 200);
  assert.equal(tracker.accept({ id: 'one', t: now, p: 10, q: 20, side: 'BUY' }), null);
  assert.equal(tracker.accept({ id: 'two', t: now + 100, p: 10, q: 30, side: 'BUY' })?.usd, 300);
  const prints = tracker.snapshot(now + 100);
  assert.equal(prints.length, 1, 'evolving burst updates the same ID');
  assert.equal(prints[0].usd, 500, 'the duplicate 200 USD trade was not counted again');
  assert.equal(prints[0].count, 2);
  assert.equal(prints.reduce((sum, row) => sum + row.usd, 0), 500);
});

test('more than 40 qualifying bursts in one candle are fully summed rather than truncated', () => {
  const now = Math.floor(Date.now() / 60_000) * 60_000;
  const tracker = new LargeMarketTradeTracker();
  tracker.seedThreshold(Array.from({ length: 30 }, (_, i) => ({
    id: 'reference-' + i, t: now + 4000 + i, p: 10, q: 10, side: 'BUY' as const,
  })));
  for (let i = 0; i < 80; i++) {
    const trade = tracker.accept({
      id: 'many-' + i, t: now + 5000 + 5 * i,
      p: 10, q: 20, side: i % 2 ? 'SELL' : 'BUY',
    });
    assert.ok(trade, 'different trade IDs are accepted');
  }
  const prints = tracker.snapshot(now + 10_000);
  assert.equal(prints.length, 2, 'accumulated one second per direction');
  const totals = aggregateMarketPrintsByCandle([{ t: now }], prints, 60_000);
  assert.equal(totals.length, 1);
  assert.equal(totals[0].buyUsd, 8000);
  assert.equal(totals[0].sellUsd, 8000);
  assert.equal(totals[0].totalUsd, 16000);
});

test('multiple HookCharts with same symbol share one exchange WebSocket and initial REST seed', async () => {
  const originalFetch = globalThis.fetch;
  const originalSocket = globalThis.WebSocket;
  const sockets: FakeSocket[] = [];
  let fetchCalls = 0;
  class FakeSocket {
    static OPEN = 1;
    readyState = 1;
    onopen: ((event: any) => void) | null = null;
    onmessage: ((event: any) => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    onclose: ((event: any) => void) | null = null;
    closes = 0;
    constructor(readonly url: string) { sockets.push(this); }
    send(_data: string) {}
    close() { this.closes++; }
  }
  const time = Date.now();
  const active = [
    { T: time - 500, p: '100', q: '1', m: false, a: 10 },
  ];
  let a = 0, b = 0;
  let stopA: (() => void) | undefined, stopB: (() => void) | undefined;
  try {
    globalThis.fetch = (async () => {
      fetchCalls++;
      return { ok: true, json: async () => active } as Response;
    }) as typeof fetch;
    globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
    const scope = { exchange: 'binance' as const, marketType: 'futures' as const, symbol: 'BTCUSDT' };
    stopA = subscribeMarketTrades(scope, { onTrade: () => { a++; }, onPrints: () => {} });
    stopB = subscribeMarketTrades(scope, { onTrade: () => { b++; }, onPrints: () => {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sockets.length, 1);
    assert.equal(fetchCalls, 1);
    assert.equal(a, 1); assert.equal(b, 1);
    const send = (id: number, quantity: string) =>
      sockets[0].onmessage?.({ data: JSON.stringify({
        T: time, p: '100', q: quantity, m: false, a: id,
      }) });
    send(10, '1'); // same trade replayed after initial REST response
    send(11, '50');
    assert.equal(a, 2); assert.equal(b, 2);
    stopA();
    assert.equal(sockets[0].closes, 0, 'first subscriber must not kill the second chart feed');
    stopB();
    assert.equal(sockets[0].closes, 0, 'short chart swaps reuse the existing socket');
    await new Promise(resolve => setTimeout(resolve, 1_600));
    assert.equal(sockets[0].closes, 1, 'the idle socket closes after its 1.5s release window');
  } finally {
    stopA?.(); stopB?.();
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalSocket;
  }
});

test('live candle subscribers ignore REST seed and receive only new deduplicated trades', async () => {
  const oldFetch = globalThis.fetch;
  const oldWebSocket = globalThis.WebSocket;
  let onMessage: ((data: any) => void) | null = null;
  let analytic = 0, live = 0;
  let stopAnalytics: (() => void) | null = null;
  let stopLive: (() => void) | null = null;
  const at = Date.now();
  class FakeSocket {
    static OPEN = 1;
    onmessage: ((event: any) => void) | null = null;
    onopen: ((event: any) => void) | null = null;
    onclose: ((event: any) => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    constructor(_url: string) {
      onMessage = payload => this.onmessage?.({ data: JSON.stringify(payload) });
    }
    close() {}
    send(_text: string) {}
  }
  try {
    globalThis.fetch = (async () => ({ ok: true, json: async () => [
      { a: 1, T: at - 1000, p: '10', q: '20', m: false },
    ] } as Response)) as typeof fetch;
    globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
    const scope = { exchange: 'binance' as const, marketType: 'spot' as const,
      symbol: 'LIVESEEDTESTUSDT' };
    stopAnalytics = subscribeMarketTrades(scope, {
      onTrade: () => { analytic++; }, onPrints: () => {},
    });
    stopLive = subscribeMarketTrades(scope, {
      liveOnly: true, wantsPrints: () => false,
      onTrade: () => { live++; }, onPrints: () => {},
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(analytic, 1, 'analytics still receives the recent REST trade');
    assert.equal(live, 0, 'REST seed must never mutate a live candle');
    onMessage?.({ a: 1, T: at - 1000, p: '10', q: '20', m: false });
    assert.equal(live, 0, 'overlapping exchange IDs are deduplicated');
    onMessage?.({ a: 2, T: at, p: '10', q: '25', m: false });
    assert.equal(live, 1);
    assert.equal(analytic, 2);
  } finally {
    stopLive?.(); stopAnalytics?.();
    await new Promise(resolve => setTimeout(resolve, 1_600));
    globalThis.fetch = oldFetch;
    globalThis.WebSocket = oldWebSocket;
  }
});

test('market-print minimum filters complete BUY + SELL candle totals, not individual trades', () => {
  const first = 1_020_000;
  const candles = [{ t: first }, { t: first + 60_000 }];
  const prints = [
    examplePrint('b1', 'BUY', first + 10_000, 30_000),
    examplePrint('s1', 'SELL', first + 20_000, 25_000),
    examplePrint('b2', 'BUY', first + 70_000, 45_000),
  ];
  const original = aggregateMarketPrintsByCandle(candles, prints, 60_000);
  assert.equal(original.length, 2);
  assert.strictEqual(filterMarketPrintCandleBuckets(original, 0), original);
  const visible = filterMarketPrintCandleBuckets(original, 50_000);
  assert.deepEqual(visible.map(row => [row.buyUsd, row.sellUsd, row.totalUsd]), [[30_000, 25_000, 55_000]]);
  assert.equal(original.length, 2, 'underlying aggregate is untouched');
  assert.equal(filterMarketPrintCandleBuckets(original, 55_000).length, 1);
  assert.equal(filterMarketPrintCandleBuckets(original, 55_001).length, 0);
});

test('market-print minimum normalizes invalid numbers and caps extreme values', () => {
  assert.equal(normalizeMarketPrintDisplayMinUsd(undefined), 0);
  assert.equal(normalizeMarketPrintDisplayMinUsd(NaN), 0);
  assert.equal(normalizeMarketPrintDisplayMinUsd(-5), 0);
  assert.equal(normalizeMarketPrintDisplayMinUsd(Infinity), 0);
  assert.equal(normalizeMarketPrintDisplayMinUsd(25.129), 25.13);
  assert.equal(normalizeMarketPrintDisplayMinUsd(10 ** 15), 1_000_000_000_000);
});
