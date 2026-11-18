import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';
import { BybitOrderBookSync } from '../server/surveillance/bybitOrderBook';
import { BinanceOrderBookSync, type BookUpdate } from '../src/utils/binanceOrderBook';
import { normalizeExchangeSymbol } from '../src/utils/marketSymbols';
import { fetchKlines } from '../server/marketService';
import { isLiveOrderBookView } from '../src/utils/orderBookValidation';

const manualBook = () => new OrderBookEngine('BTCUSDT', 'bybit', 'futures', {
  mode: 'MANUAL', manualThresholdUsd: 1000, minPersistenceSeconds: 15, minDistancePct: 0.1,
});
const packet = (type: 'snapshot' | 'delta', u: number, bids: unknown[] = [['100', '10']], asks: unknown[] = [['101', '1']], symbol = 'BTCUSDT') => ({
  topic: `orderbook.1000.${symbol}`, type, ts: Date.now(), cts: Date.now(),
  data: { s: symbol, u, seq: u * 10, b: bids, a: asks },
});

test('manual search waits for an actual level at the requested amount without summing neighbours', () => {
  const book = manualBook();
  book.applyDepth({ isSnapshot: true, sequence: 1, bids: [[100, 6], [99, 6]], asks: [[101, 6]] });
  assert.deepEqual(book.getDensities(), []);
  assert.deepEqual(book.pollNewlyAppearedDensities(), []);
  book.applyDepth({ sequence: 2, bids: [[100, 10]], asks: [] });
  assert.deepEqual(book.getDensities().map(d => [d.side, d.price, d.quantity, d.notionalUsd]), [['BID', 100, 10, 1000]]);
  book.applyDepth({ sequence: 3, bids: [[100, 9.99]], asks: [] });
  assert.deepEqual(book.getDensities(), []);
  book.applyDepth({ sequence: 4, bids: [], asks: [[101, 20]] });
  assert.deepEqual(book.getDensities().map(d => [d.side, d.notionalUsd]), [['ASK', 2020]]);
  book.applyDepth({ sequence: 5, bids: [], asks: [[101, 0], [102, 1]] });
  assert.deepEqual(book.getDensities(), []);
});

test('cancel/reappear before an alert poll returns only the current amount, once', () => {
  const book = manualBook();
  book.applyDepth({ isSnapshot: true, sequence: 1, bids: [[100, 20], [99, 1]], asks: [[101, 1]] });
  book.applyDepth({ sequence: 2, bids: [[100, 0]], asks: [] });
  book.applyDepth({ sequence: 3, bids: [[100, 30]], asks: [] });
  assert.deepEqual(book.pollNewlyAppearedDensities().map(d => d.notionalUsd), [3000]);
  assert.deepEqual(book.pollNewlyAppearedDensities(), []);
});

test('Bybit requires a matching snapshot and applies absolute quantities, deletions and restart snapshots', () => {
  const book = manualBook();
  let resyncs = 0;
  const sync = new BybitOrderBookSync('BTCUSDT', d => book.applyDepth(d), () => { resyncs++; book.setStatus('RESYNCING'); });
  sync.push(packet('delta', 2));
  assert.equal(resyncs, 1);
  assert.equal(book.getState().dataValid, false);
  sync.push(packet('snapshot', 10, [['100', '10'], ['99', '1']]));
  assert.equal(book.getState().status, 'LIVE');
  assert.equal(book.getDensities()[0].notionalUsd, 1000);
  sync.push(packet('delta', 13, [['100', '20']], []));
  assert.equal(book.getDensities()[0].notionalUsd, 2000, 'quantities replace, rather than accumulate');
  sync.push(packet('delta', 12, [['100', '999']], []));
  sync.push(packet('delta', 14, [['100', '999']], [], 'ETHUSDT'));
  assert.equal(book.getDensities()[0].notionalUsd, 2000);
  sync.push(packet('delta', 14, [['100', '0']], []));
  assert.equal(book.getDensities().length, 0);
  sync.push(packet('snapshot', 1, [['99', '20']], [['100', '1']]));
  assert.equal(book.bestBid, 99);
  assert.equal(book.lastUpdateId, 10);
  assert.equal(book.getDensities()[0].ageSeconds, 0);
});

test('Bybit malformed and delayed packets invalidate the book instead of keeping a live wall', () => {
  for (const corrupt of [
    (p: any) => { p.cts = Date.now() - 6000; },
    (p: any) => { p.cts = Date.now() + 6000; },
    (p: any) => { delete p.data.seq; },
    (p: any) => { p.data.b = [['100', 'NaN']]; },
  ]) {
    const book = manualBook();
    const sync = new BybitOrderBookSync('BTCUSDT', d => book.applyDepth(d), () => book.setStatus('RESYNCING'));
    sync.push(packet('snapshot', 10));
    const bad = packet('delta', 11);
    corrupt(bad);
    sync.push(bad);
    assert.equal(book.getState().dataValid, false);
    assert.deepEqual(book.getState().bids, []);
    assert.deepEqual(book.getDensities(), []);
    sync.push(packet('delta', 12));
    assert.equal(book.getState().dataValid, false);
    sync.push(packet('snapshot', 13));
    assert.equal(book.getState().dataValid, true);
  }
});

test('international Bybit instruments keep their full identity', () => {
  const updates: BookUpdate[] = [];
  const sync = new BybitOrderBookSync('龙虾/USDT', d => updates.push(d), () => {});
  sync.push(packet('snapshot', 1, [['1', '1000']], [['1.1', '1']], normalizeExchangeSymbol('龙虾/USDT')));
  assert.equal(updates.length, 1);
});

test('source time expires even when a buffered packet was received locally just now', t => {
  let clock = Date.now();
  t.mock.method(Date, 'now', () => clock);
  const book = manualBook();
  assert.equal(book.getState().timestamp, 0);
  book.applyDepth({ isSnapshot: true, sequence: 1, eventTime: clock - 4000, bids: [[100, 20]], asks: [[101, 1]] });
  assert.equal(book.getState().dataValid, true);
  clock += 1001;
  assert.equal(book.getState().status, 'STALE');
  assert.deepEqual(book.getState().bids, []);
  assert.deepEqual(book.getDensities(), []);
  assert.equal(book.getOrderBookImbalance(), 0);
  book.applyDepth({ sequence: 2, eventTime: clock - 6000, bids: [[100, 30]], asks: [] });
  book.applyDepth({ sequence: 3, eventTime: clock, bids: [[100, 30]], asks: [] });
  assert.equal(book.getState().dataValid, false);
  book.applyDepth({ isSnapshot: true, sequence: 4, eventTime: clock, bids: [[100, 30]], asks: [[101, 1]] });
  assert.equal(book.getDensities()[0].ageSeconds, 0);
});

test('a Binance delta that ages while waiting for REST cannot bridge a live book', t => {
  let clock = Date.now();
  t.mock.method(Date, 'now', () => clock);
  const updates: BookUpdate[] = [];
  let resyncs = 0;
  const sync = new BinanceOrderBookSync('futures', d => updates.push(d), () => resyncs++);
  sync.push({ U: 99, u: 101, pu: 98, E: clock, b: [['100', '20']], a: [] });
  clock += 6000;
  sync.setSnapshot({ sequence: 100, bids: [[100, 1]], asks: [[101, 1]], eventTime: clock });
  assert.deepEqual(updates, []);
  assert.equal(resyncs, 1);
  assert.equal(sync.needsSnapshot, true);
});

test('crossed and malformed books require a new snapshot and cannot publish densities', () => {
  for (const change of [ [[102, 20]], [[100, -1]], [[NaN, 20]] ] as [number, number][][]) {
    const book = manualBook();
    book.applyDepth({ isSnapshot: true, sequence: 1, bids: [[100, 20]], asks: [[101, 1]] });
    book.applyDepth({ sequence: 2, bids: change, asks: [] });
    assert.equal(book.getState().dataValid, false);
    assert.deepEqual(book.pollNewlyAppearedDensities(), []);
    book.applyDepth({ sequence: 3, bids: [[100, 20]], asks: [] });
    assert.equal(book.getState().dataValid, false);
  }
});

test('backtest requires an exchange response even when a cache entry exists', async t => {
  for (const exchange of ['binance', 'bybit'] as const) {
    let failing = false;
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      return failing ? new Response('{}', { status: 503 }) : Response.json(exchange === 'binance'
        ? [[1700000000000, '100', '101', '99', '100', '1']]
        : { retCode: 0, result: { list: [['1700000000000', '100', '101', '99', '100', '1']] } });
    });
    assert.equal((await fetchKlines(exchange, 'futures', 'AUDITUSDT', '15m', 200)).length, 1);
    failing = true;
    assert.deepEqual(await fetchKlines(exchange, 'futures', 'AUDITUSDT', '15m', 200, undefined, undefined, { requireFresh: true }), []);
    assert.ok(calls >= 2);
    assert.equal((await fetchKlines(exchange, 'futures', 'AUDITUSDT', '15m', 200)).length, 1);
  }
});

test('Bybit API error payloads cannot supply backtest candles', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ retCode: 10006, result: { list: [['1700000000000', '100', '101', '99', '100', '1']] } }));
  assert.deepEqual(await fetchKlines('bybit', 'futures', 'INVALIDUSDT', '15m', 200, undefined, undefined, { requireFresh: true }), []);
});

test('backtest stops on regional denial, rate limits and HTML responses without mirror retries', async t => {
  for (const exchange of ['binance', 'bybit'] as const) {
    for (const status of [403, 429, 451, 200]) {
      let calls = 0;
      t.mock.method(globalThis, 'fetch', async () => {
        calls++;
        return new Response('<html>Unavailable</html>', { status, headers: { 'content-type': 'text/html' } });
      });
      assert.deepEqual(await fetchKlines(exchange, 'spot', 'BLOCKEDUSDT', '15m', 200, undefined, undefined, { requireFresh: true }), []);
      assert.equal(calls, 1);
    }
  }
});

test('a slow HTTP response and client cache age cannot relabel an old DOM as live', () => {
  const snapshot = { sampledAt: 1_800_000_000_000,
    orderBookState: { status: 'LIVE', dataValid: true, timestamp: 1_799_999_996_000, lastReceivedAt: 1_799_999_999_000 } };
  assert.equal(isLiveOrderBookView(snapshot, 20000, 21000), true);
  assert.equal(isLiveOrderBookView(snapshot, 20000, 21001), false);
  assert.equal(isLiveOrderBookView({ ...snapshot, sampledAt: undefined }, 20000, 20001), false);
  assert.equal(isLiveOrderBookView(snapshot, 20000, 19000), false);
});
