import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';
import {
  selectStandoutLevels, AUTO_MAX_DISTINCT_LEVELS_PER_SIDE,
  AUTO_NEARBY_LEVEL_SEPARATION_PCT,
} from '../server/surveillance/standoutDensitySelection';

type Level = [number, number];

function syntheticBook(turnover = 5_000_000) {
  const book = new OrderBookEngine('THINUSDT', 'bybit', 'futures');
  book.setVolume24hUsd(turnover);
  const bids: Level[] = [], asks: Level[] = [];
  for (let i = 1; i <= 1000; i++) {
    const bidPrice = 100 * (1 - i * 0.00005);
    const askPrice = 100 * (1 + i * 0.00005);
    bids.push([bidPrice, 1000 / bidPrice]);
    asks.push([askPrice, 1000 / askPrice]);
  }
  book.applyDepth({
    isSnapshot: true, sequence: 1, eventTime: Date.now(), bids, asks,
  });
  return { book, bids, asks };
}

test('AUTO selects only top distinct walls, not 20 adjacent qualified DOM ticks', () => {
  const { book, asks } = syntheticBook();
  const updates: Level[] = [];
  // Twenty exceptional price levels spanning 0.10%, all one nearby cluster.
  for (let i = 399; i < 419; i++) {
    const price = asks[i][0];
    updates.push([price, 100_000 / price]);
  }
  for (const [i, amount] of [[599, 200_000], [799, 150_000]] as const) {
    const price = asks[i][0];
    updates.push([price, amount / price]);
  }
  book.applyDepth({ sequence: 2, eventTime: Date.now(), bids: [], asks: updates });
  const auto = book.getDensities();
  assert.equal(auto.length, 3, 'one representative for the nearby cluster and two farther walls');
  assert.deepEqual(auto.map(x => Math.round(x.notionalUsd)), [200_000, 150_000, 100_000]);
  assert.ok(auto.every(x => x.side === 'ASK'));
  assert.ok(book.calculateDensityThresholds().ask >= 25_000);

  // MANUAL preserves every level selected by the user; it is not silently
  // forced to use the AUTO statistical top-rank/cluster restrictions.
  book.updateConfig({ mode: 'MANUAL', manualThresholdUsd: 90_000 });
  assert.equal(book.getDensities().length, 22);
  book.updateConfig({ mode: 'HYBRID', manualThresholdUsd: 90_000 });
  assert.equal(book.getDensities().length, 3);
});

test('AUTO never emits every large level in a large same-size cluster', () => {
  const { book, bids, asks } = syntheticBook();
  const updates: Level[] = [];
  for (let i = 0; i < 80; i++) {
    const b = bids[i * 10][0], a = asks[i * 10][0];
    updates.push([a, 100_000 / a]);
  }
  book.applyDepth({ sequence: 2, eventTime: Date.now(), bids: [], asks: updates });
  assert.ok(book.getDensities().length <= AUTO_MAX_DISTINCT_LEVELS_PER_SIDE);
  assert.ok(book.getDensities().length >= 1, 'genuine high-tail outliers are still visible');

  book.updateConfig({ mode: 'MANUAL', manualThresholdUsd: 50_000 });
  assert.equal(book.getDensities().length, 80);
});

test('ranked levels require both a coin-relative notional minimum and a meaningful upper-tail gap', () => {
  const { book, asks } = syntheticBook(5_000_000);
  const regular = asks[10][0];
  book.applyDepth({ sequence: 2, eventTime: Date.now(), bids: [], asks: [[regular, 10_000 / regular]] });
  assert.deepEqual(book.getDensities(), [], 'a $10k level fails the thin-market floor');
  const market = syntheticBook(8_000_000_000);
  const below = market.asks[10][0];
  market.book.applyDepth({ sequence: 2, eventTime: Date.now(), bids: [], asks: [[below, 500_000 / below]] });
  assert.deepEqual(market.book.getDensities(), [], 'large-turnover markets reject ordinary $500k levels');
});

test('competing AUTO walls preserve pending confirmation when a stronger level disappears', t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const { book, asks } = syntheticBook();
  const indexes = [99, 299, 499, 699, 899];
  book.applyDepth({ sequence: 2, eventTime: now, bids: [], asks:
    indexes.map(i => [asks[i][0], 50_000 / asks[i][0]] as Level) });
  assert.equal(book.getDensities().length, 4);
  assert.deepEqual(book.pollNewlyAppearedDensities(), []);

  // Wall age is accrued from fresh stream observations without adding a
  // per-user interval; four visible walls become eligible after 15 seconds.
  for (let seq = 3; seq <= 6; seq++) {
    now += 4000;
    book.applyDepth({ sequence: seq, eventTime: now, bids: [], asks: [] });
  }
  const first = book.pollNewlyAppearedDensities();
  assert.equal(first.length, 4);
  assert.ok(first.every(level => level.confirmed && level.ageSeconds >= 15));
  assert.deepEqual(book.pollNewlyAppearedDensities(), []);

  // The fifth wall was hidden, not cancelled; after a top wall disappears
  // it can still be shown and notified while it is a recent observation.
  now += 4000;
  const oldPrice = asks[indexes[0]][0];
  book.applyDepth({ sequence: 7, eventTime: now, bids: [], asks: [[oldPrice, 0]] });
  assert.equal(book.getDensities().length, 4);
  const promoted = book.pollNewlyAppearedDensities();
  assert.equal(promoted.length, 1);
  assert.equal(promoted[0].price, asks[indexes[4]][0]);
  assert.deepEqual(book.pollNewlyAppearedDensities(), []);
});

test('selection ranks by real USD, is independent for BID/ASK and suppresses nearby duplicates', () => {
  const mid = 100;
  const levels = [
    { side: 'ASK', price: 102, notionalUsd: 120_000, distancePct: 2 },
    { side: 'ASK', price: 102.03, notionalUsd: 115_000, distancePct: 2.03 },
    { side: 'ASK', price: 103, notionalUsd: 70_000, distancePct: 3 },
    { side: 'BID', price: 99.5, notionalUsd: 90_000, distancePct: 0.5 },
    { side: 'BID', price: 99.52, notionalUsd: 85_000, distancePct: 0.48 },
  ] as const;
  const chosen = selectStandoutLevels(levels, 'AUTO', mid);
  assert.equal(chosen.length, 3);
  assert.deepEqual(chosen.map(x => Math.round(x.notionalUsd)), [120_000, 90_000, 70_000]);
  assert.ok(AUTO_NEARBY_LEVEL_SEPARATION_PCT > 0);
  assert.equal(selectStandoutLevels(levels,'MANUAL',mid).length,5);
});

test('genuine walls at 1–3% stay visible even if far depth contains larger exceptional walls', () => {
  const levels = [
    { side: 'ASK', price: 101, notionalUsd: 50_000, distancePct: 1 },
    { side: 'ASK', price: 102.5, notionalUsd: 55_000, distancePct: 2.5 },
    { side: 'ASK', price: 108, notionalUsd: 500_000, distancePct: 8 },
    { side: 'ASK', price: 109, notionalUsd: 400_000, distancePct: 9 },
    { side: 'ASK', price: 110, notionalUsd: 300_000, distancePct: 10 },
    { side: 'ASK', price: 111, notionalUsd: 200_000, distancePct: 11 },
  ] as const;
  // This helper receives ONLY already market-relative statistically qualified
  // levels. It is not used as a way around the turnover/percentile thresholds.
  const chosen = selectStandoutLevels(levels, 'AUTO', 100);
  assert.equal(chosen.length, 4);
  assert.deepEqual(
    chosen.filter(level => level.distancePct <= 3).map(level => level.price).sort((a,b)=>a-b),
    [101, 102.5],
    'the within-3% view must not go empty because much farther walls dominate USD rank'
  );
  assert.deepEqual(
    chosen.filter(level => level.distancePct > 3).map(level => level.notionalUsd),
    [500_000, 400_000],
    'remaining slots still represent the strongest farther liquidity'
  );
  assert.equal(selectStandoutLevels(levels, 'MANUAL', 100).length, 6);
});
