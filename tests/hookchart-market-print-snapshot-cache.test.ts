import test from 'node:test';
import assert from 'node:assert/strict';
import { LargeMarketTradeTracker, type MarketTrade } from '../src/components/hookchart/marketTradeStream';

const hour = 60 * 60_000;
const t0 = Math.floor(Date.now() / 1000) * 1000;
const trade = (id: string, t: number, p = 100, q = 10, side: MarketTrade['side'] = 'BUY'): MarketTrade =>
  ({ id, t, p, q, side });
const createTracker = () => {
  const tracker = new LargeMarketTradeTracker();
  tracker.seedThreshold([trade('seed-only', t0 - 1000, 1, 1)]);
  return tracker;
};

test('unchanged market-print snapshots share one reference across repeated chart reads', () => {
  const tracker = createTracker();
  const empty = tracker.snapshot(t0);
  assert.deepEqual(empty, []);
  for (let i = 0; i < 500; i++)
    assert.strictEqual(tracker.snapshot(t0 + i), empty, 'empty prints must not allocate 500 arrays');

  const first = trade('buy-1', t0 + 100);
  assert.ok(tracker.accept(first));
  const populated = tracker.snapshot(t0 + 300);
  assert.notStrictEqual(populated, empty, 'new market trades invalidate the cached empty snapshot');
  assert.equal(populated.length, 1);
  assert.equal(populated[0].usd, 1000);
  for (let i = 0; i < 500; i++)
    assert.strictEqual(tracker.snapshot(t0 + 400 + i), populated,
      'many chart subscribers should share one sorted array, rather than sort on each read');
  assert.equal(tracker.accept(first), null, 'duplicated REST/WS trade ID is still ignored');
  assert.strictEqual(tracker.snapshot(t0 + 950), populated,
    'duplicate packets must not cause unnecessary chart state updates');
});

test('updates publish a new snapshot and never mutate arrays already passed to React', () => {
  const tracker = createTracker();
  tracker.accept(trade('buy-1', t0 + 100, 100, 10));
  const first = tracker.snapshot(t0 + 200);
  tracker.accept(trade('buy-2', t0 + 300, 200, 5));
  const next = tracker.snapshot(t0 + 400);
  assert.notStrictEqual(next, first, 'revised prints must update the chart');
  assert.equal(first[0].p, 100);
  assert.equal(first[0].usd, 1000);
  assert.equal(next[0].p, 150);
  assert.equal(next[0].usd, 2000);
  assert.strictEqual(tracker.snapshot(t0 + 500), next);
  tracker.accept(trade('sell-1', t0 + 1200, 50, 10, 'SELL'));
  const withSell = tracker.snapshot(t0 + 1300);
  assert.notStrictEqual(withSell, next);
  assert.equal(next.length, 1, 'old arrays are not mutated when another side arrives');
  assert.deepEqual(withSell.map(row => row.t), [t0, t0 + 1000], 'sort order preserved');
});

test('snapshot cache expires exactly when oldest print falls outside the one-hour window', () => {
  const tracker = createTracker();
  tracker.accept(trade('earliest', t0 + 100, 100, 10));
  tracker.accept(trade('later', t0 + 1200, 100, 10));
  const both = tracker.snapshot(t0 + 1300);
  assert.equal(both.length, 2);
  const earlyBoundary = t0 + hour;
  assert.strictEqual(tracker.snapshot(earlyBoundary), both, 'exactly at one hour is still in window');
  const expired = tracker.snapshot(earlyBoundary + 1);
  assert.notStrictEqual(expired, both, 'time-based pruning must invalidate unchanged trade revision');
  assert.equal(expired.length, 1);
  assert.equal(expired[0].t, t0 + 1000);
  assert.strictEqual(tracker.snapshot(earlyBoundary + 900), expired);
  const allExpired = tracker.snapshot(t0 + hour + 1001);
  assert.equal(allExpired.length, 0, 'the second stale print is eventually removed');
  assert.strictEqual(tracker.snapshot(t0 + hour + 2000), allExpired,
    'the empty result stays shared until fresh trades arrive');
  // Avoid an unrelated adaptive-cut recalibration after an hour of silence:
  // the test is specifically about snapshot cache invalidation.
  tracker.seedThreshold([trade('fresh-seed', t0 + hour + 2500, 1, 1)]);
  tracker.accept(trade('new', t0 + hour + 3000, 120, 10));
  const fresh = tracker.snapshot(t0 + hour + 3100);
  assert.notStrictEqual(fresh, allExpired);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].usd, 1200);
});

test('large print histories are shared without dropping or duplicating market volume', () => {
  const tracker = createTracker();
  // Warm the adaptive threshold with normal small executions. Without
  // warmup, the algorithm deliberately rejects some first trades while it
  // learns a threshold; that is separate from snapshot-cache correctness.
  for (let i = 0; i < 40; i++)
    tracker.accept(trade('warmup-' + i, t0 - 40_000 + i * 1000 + 100, 1, 1));
  // 1,500 distinct seconds: enough to catch accidental per-chart sorting.
  for (let i = 0; i < 1500; i++)
    tracker.accept(trade('high-frequency-' + i, t0 + i * 1000 + 100, 100, 10));
  const baseline = tracker.snapshot(t0 + 1_500_000);
  const measured = baseline.filter(row => row.t >= t0);
  assert.equal(measured.length, 1500);
  const totalUsd = measured.reduce((sum, row) => sum + row.usd, 0);
  assert.equal(totalUsd, 1_500_000);
  for (let chart = 0; chart < 50; chart++)
    assert.strictEqual(tracker.snapshot(t0 + 1_500_000), baseline,
      '50 Terminal charts reuse the same sorted snapshot with identical market evidence');
  assert.equal(measured.reduce((sum, row) => sum + row.count, 0), 1500);
});
