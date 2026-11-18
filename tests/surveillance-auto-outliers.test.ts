import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';
import { densityOutlierThresholds, depthOutlierProfile } from '../server/surveillance/depthOutlierProfile';

type Level = [number, number];
function marketBook(symbol: string, marketVolume: number, typicalUsd: number, mid: number) {
  const tick = mid >= 1000 ? 1 : mid >= 1 ? 0.01 : 0.000001;
  const bids: Level[] = Array.from({ length: 1000 }, (_, i) => {
    const price = mid - tick * (i + 1);
    return [price, typicalUsd / price];
  });
  const asks: Level[] = Array.from({ length: 1000 }, (_, i) => {
    const price = mid + tick * (i + 1);
    return [price, typicalUsd / price];
  });
  const book = new OrderBookEngine(symbol, 'binance', 'futures');
  book.setVolume24hUsd(marketVolume);
  book.applyDepth({ isSnapshot: true, sequence: 1, bids, asks, eventTime: Date.now() });
  return { book, bids, asks };
}

test('GOOGL and BULLA $10K levels are ordinary, but extraordinary levels are selected', () => {
  for (const [symbol, volume, price] of [
    ['GOOGLUSDT', 100_000_000, 294],
    ['BULLAUSDT', 5_000_000, 0.0141],
  ] as const) {
    const { book, bids, asks } = marketBook(symbol, volume, 1_000, price);
    const cheapPrice = asks[10][0];
    book.applyDepth({ sequence: 2, asks: [[cheapPrice, 10_000 / cheapPrice]], bids: [], eventTime: Date.now() });
    assert.ok(book.calculateDensityThresholds().ask > 10_000, symbol);
    assert.equal(book.getDensities().filter(d => d.notionalUsd <= 10_000).length, 0, symbol);
    assert.deepEqual(book.pollNewlyAppearedDensities().filter(d => d.notionalUsd <= 10_000), [], symbol);
    const wallPrice = bids[20][0];
    book.applyDepth({ sequence: 3, asks: [], bids: [[wallPrice, 500_000 / wallPrice]], eventTime: Date.now() });
    assert.ok(book.getDensities().some(d => d.side === 'BID' && d.price === wallPrice), symbol);
    assert.ok(book.getDensities().every(d => d.notionalUsd >= 25_000), symbol);
  }
});

test('BTC and ETH require much larger absolute levels than $10K without hardcoded symbols', () => {
  for (const [symbol, volume, price] of [
    ['BTCUSDT', 40_000_000_000, 95_000],
    ['ETHUSDT', 8_000_000_000, 3_500],
  ] as const) {
    const { book, bids, asks } = marketBook(symbol, volume, 10_000, price);
    const threshold = book.calculateDensityThresholds();
    assert.ok(threshold.bid > 250_000 && threshold.ask > 250_000, symbol);
    const tiny = asks[10][0];
    book.applyDepth({ sequence: 2, bids: [], asks: [[tiny, 10_000 / tiny]], eventTime: Date.now() });
    assert.equal(book.getDensities().length, 0);
    const wall = bids[25][0];
    const exceptionalWall = Math.max(2_000_000, threshold.bid * 1.8);
    book.applyDepth({ sequence: 3, bids: [[wall, exceptionalWall / wall]], asks: [], eventTime: Date.now() });
    assert.equal(book.getDensities().length, 1);
    assert.ok(book.getDensities()[0].notionalUsd >= exceptionalWall - 0.001);
  }
});

test('each book side is compared to its own typical levels', () => {
  const { book, bids, asks } = marketBook('SIDEUSDT', 10_000_000, 1_000, 100);
  // Typical BID levels are 100x the ASK levels.
  const higherBids = bids.map(([p]) => [p, 100_000 / p] as Level);
  book.applyDepth({ sequence: 2, bids: higherBids, asks: [], eventTime: Date.now() });
  const limits = book.calculateDensityThresholds();
  assert.ok(limits.bid >= 400_000, 'normal $100k bids must NOT look special');
  assert.ok(limits.ask < 80_000, 'a standout $80k ask must NOT be hidden by other-side bids');
  assert.deepEqual(book.getDensities(), []);
  const askWall = asks[3][0], bidWall = bids[3][0];
  book.applyDepth({ sequence: 3,
    bids: [[bidWall, 700_000 / bidWall]],
    asks: [[askWall, 80_000 / askWall]], eventTime: Date.now() });
  assert.deepEqual(new Set(book.getDensities().map(d => d.side)), new Set(['BID', 'ASK']));
});

test('AUTO fails closed when ticker turnover is missing, MANUAL remains precise and HYBRID stays stricter', () => {
  const { book, asks } = marketBook('VOLUNKNOWNUSDT', 0, 1_000, 100);
  assert.ok(book.calculateAdaptiveThreshold() >= 1_000_000);
  const price = asks[4][0];
  book.applyDepth({ sequence: 2, bids: [], asks: [[price, 20_000 / price]], eventTime: Date.now() });
  assert.deepEqual(book.getDensities(), []);
  book.updateConfig({ mode: 'MANUAL', manualThresholdUsd: 7_000 });
  assert.equal(book.calculateAdaptiveThreshold(), 7_000);
  assert.equal(book.getDensities().length, 1);
  book.updateConfig({ mode: 'HYBRID', manualThresholdUsd: 40_000 });
  assert.deepEqual(book.getDensities(), []);
  book.setVolume24hUsd(10_000_000);
  assert.ok(book.calculateAdaptiveThreshold() >= 40_000);
});

test('profile ignores invalid/empty levels and uses real notional, not price or base quantity alone', () => {
  const bids = new Map([[100, 50], [99, 0], [98, NaN]]);
  const asks = new Map([[101, 50], [102, 0]]);
  const profile = depthOutlierProfile(bids, asks);
  assert.ok(profile);
  assert.equal(profile.count, 2);
  assert.equal(profile.bid.median, 5000);
  assert.equal(profile.ask.median, 5050);
  assert.equal(densityOutlierThresholds(profile, 0, 1_000, 'AUTO').common, 1_000_000);
  assert.deepEqual(densityOutlierThresholds(profile, 10_000_000, 2_000, 'MANUAL'),
    { common: 2000, bid: 2000, ask: 2000 });
});

test('snapshot liquidity is not mislabeled newly arrived; AUTO waits for two fresh observations', t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const { book, bids, asks } = marketBook('SNAPSHOTUSDT', 10_000_000, 1_000, 100);
  // Force an actual large wall during an initial snapshot: visible, but not new.
  book.applyDepth({ sequence: 2, bids: [[bids[11][0], 500_000 / bids[11][0]]],
    asks: [], eventTime: now });
  assert.ok(book.getDensities().length > 0);
  assert.deepEqual(book.pollNewlyAppearedDensities(), [],
    'new AUTO walls are not alerted until observed again, even if economically large');
  // An AUTO alert needs an observed lifetime and size stability, not two
  // instantaneous tick observations. Keep each packet within freshness.
  for(let sequence=3; sequence<=6; sequence++){
    now += 4000;
    book.applyDepth({ sequence, bids: [], asks: [], eventTime: now });
    if (sequence < 6) assert.deepEqual(book.pollNewlyAppearedDensities(), []);
  }
  assert.equal(book.pollNewlyAppearedDensities().length, 1);

  const oldWall = bids[11][0], newWall = asks[12][0];
  book.applyDepth({ isSnapshot: true, sequence: 7,
    bids: [[oldWall, 500_000 / oldWall], [bids[13][0], 100]],
    asks: [[newWall, 500_000 / newWall], [asks[14][0], 100]], eventTime: now });
  assert.ok(book.getDensities().length >= 1, 'a resync still shows visible walls');
  assert.deepEqual(book.pollNewlyAppearedDensities(), [],
    'resync must not fabricate NEW liquidity alerts for pre-existing walls');
});

test('exceptional top-one-percent wall clusters survive while common large levels do not', () => {
  const bids = new Map<number, number>();
  const asks = new Map<number, number>();
  for (let i = 0; i < 1000; i++) {
    const bidPrice = 100 - (i + 1) * .01;
    const askPrice = 100 + (i + 1) * .01;
    bids.set(bidPrice, (i < 20 ? 100_000 : 1_000) / bidPrice);
    asks.set(askPrice, 1_000 / askPrice);
  }
  const rare = depthOutlierProfile(bids, asks);
  assert.ok(rare);
  const threshold = densityOutlierThresholds(rare, 10_000_000, 1_000_000, 'AUTO');
  assert.ok(threshold.bid <= 100_000 && threshold.bid > 25_000,
    'a genuine 2%-tail $100k BID wall cluster should remain detectable');
  for (let i = 20; i < 200; i++) {
    const bidPrice = 100 - (i + 1) * .01;
    bids.set(bidPrice, 100_000 / bidPrice);
  }
  const common = depthOutlierProfile(bids, asks);
  assert.ok(common);
  assert.ok(densityOutlierThresholds(common, 10_000_000, 1_000_000, 'AUTO').bid > 100_000,
    'if 20% of levels have that size, they no longer stand out');
});
