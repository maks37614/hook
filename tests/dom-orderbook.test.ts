import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateDomBook, buildObservedClusters, formatDomPrice, mergeDomTrades } from '../src/utils/domOrderBook';

test('compressed DOM conserves both sides notional, preserves true spread and never crosses bid/ask labels', () => {
  const bids: [number, number][] = [[100.081, 2], [100.071, 3]];
  const asks: [number, number][] = [[100.089, 4], [100.099, 5]];
  for (const factor of [1, 2, 5, 10, 20, 50, 100]) {
    const d = aggregateDomBook(bids, asks, 0.001, factor, 100, 0);
    const sum = (rows: { volumeUsd: number }[]) => rows.reduce((a, b) => a + b.volumeUsd, 0);
    assert.ok(Math.abs(sum(d.aggregatedBids) - (2 * 100.081 + 3 * 100.071)) < 1e-7);
    assert.ok(Math.abs(sum(d.aggregatedAsks) - (4 * 100.089 + 5 * 100.099)) < 1e-7);
    assert.equal(d.bestBid, 100.081);
    assert.equal(d.bestAsk, 100.089);
    assert.ok(d.spreadUsd > 0);
    assert.ok(d.aggregatedAsks.every(row => row.price >= Math.min(...asks.map(v => v[0]))));
    assert.ok(d.aggregatedBids.every(row => row.price <= Math.max(...bids.map(v => v[0]))));
  }
});

test('exchange tick precision is preserved in row text', () => {
  assert.equal(formatDomPrice(100.121, 0.001), '100.121');
  assert.equal(formatDomPrice(100.124, 0.001), '100.124');
  assert.equal(formatDomPrice(100.25, 0.25), '100.25');
  assert.equal(formatDomPrice(0.00000123, 0.00000001), '0.00000123');
});

test('clusters contain only observed actual trades, conserve volume and identify real POC', () => {
  const now = Date.UTC(2026, 9, 10, 12, 3);
  const candle = Math.floor(now / 60000) * 60000;
  const mk = (id: string, price: number, vol: number, sell: boolean, t: number) =>
    ({ id, price, qty: vol / price, volumeUsd: vol, isBuyerMaker: sell, timestamp: t });
  const trades = [
    mk('buy', 100.01, 200, false, candle + 1000),
    mk('sell', 100.01, 100, true, candle + 2000),
    mk('other', 100.02, 50, true, candle + 3000),
  ];
  const cols = buildObservedClusters(trades, '1m', 0.01, now);
  assert.equal(cols.length, 4);
  const latest = cols.at(-1)!;
  assert.equal(latest.totalVolume, 350);
  assert.equal(Object.values(latest.levels).reduce((sum, x) => sum + x.buyVol + x.sellVol, 0), 350);
  assert.equal(latest.pocPrice, 100.01);
  assert.equal(Object.values(latest.levels).filter(x => x.isPOC).length, 1);
  assert.equal(cols.slice(0, 3).reduce((sum, x) => sum + x.totalVolume, 0), 0);
});

test('REST and WS overlapping executions dedupe and order by exchange timestamps', () => {
  const trade = { id: 'abc', price: 100, qty: 1, volumeUsd: 100, isBuyerMaker: false, timestamp: 1000 };
  const next = { ...trade, id: 'def', timestamp: 2000 };
  const merged = mergeDomTrades([trade], [trade, next], 50);
  assert.deepEqual(merged.map(t => t.id), ['def', 'abc']);
});
