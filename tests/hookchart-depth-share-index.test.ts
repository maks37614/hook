import test from 'node:test';
import assert from 'node:assert/strict';
import type { HookChartPreferences } from '../src/types';
import { HookChartDensityBook } from '../src/components/hookchart/densityBook';
import { equalDepthAutoStats } from '../src/components/hookchart/feedPublishPolicy';
import {
  createOrderBookLocalShareFloorLookup, orderBookLocalShareFloor,
  type OrderBookDensityLevel,
} from '../src/components/hookchart/marketAnalytics';

test('indexed BID/ASK local-share thresholds match the original full scan', () => {
  const levels: OrderBookDensityLevel[] = [];
  for (let i = 0; i < 850; i++) {
    const bid = +(100 - i * .003).toFixed(3);
    const ask = +(100 + i * .003).toFixed(3);
    levels.push({ side: 'BID', p: bid, q: (i % 17 + 1) * 2, usd: bid * (i % 17 + 1) * 2 });
    levels.push({ side: 'ASK', p: ask, q: (i % 11 + 1) * 3, usd: ask * (i % 11 + 1) * 3 });
  }
  // Two rows with the same side and price are excluded together, not just
  // the candidate row itself; real exchange books ordinarily have unique prices.
  levels.push({ ...levels[20], q: 4, usd: levels[20].p * 4 });
  for (const width of [0, .001, .5, 2, 20]) {
    for (const share of [0, .25, .5, .95]) {
      const indexed = createOrderBookLocalShareFloorLookup(levels, width, share);
      for (const item of levels.filter((_, i) => i % 17 === 0)) {
        const expected = orderBookLocalShareFloor(levels, item, width, share);
        const actual = indexed(item);
        assert.ok(Math.abs(expected - actual) <= Math.max(1e-6, Math.abs(expected) * 1e-9),
          `Mismatch for ${item.side} ${item.p}, width ${width}, share ${share}: ${actual} vs ${expected}`);
      }
    }
  }
});

test('depth books reuse level snapshots on hold-time ticks but invalidate on deltas and settings', () => {
  const now = Date.now();
  const depth = new HookChartDensityBook();
  const base = { densityDiffPct: 5, densityMode: 'manual', densityThreshold: 100 } as HookChartPreferences;
  assert.equal(depth.apply({
    bids: [[99, 10], [98, 12]], asks: [[101, 15], [102, 9]],
    sequence: 100, isSnapshot: true, eventTime: now,
  }, now), true);
  const first = depth.read(base, 1, now + 100);
  const holdTick = depth.read(base, 1, now + 200);
  assert.equal(first.depthReady, true);
  assert.strictEqual(holdTick.book, first.book);
  assert.equal(first.book.b[0].p, 99);
  assert.equal(first.book.b[0].q, 10);

  assert.equal(depth.apply({
    bids: [[99, 30]], asks: [], sequence: 101, eventTime: now + 300,
  }, now + 300), true);
  const updated = depth.read(base, 1, now + 301);
  assert.notStrictEqual(updated.book, first.book);
  assert.equal(updated.book.b[0].q, 30);

  const changedDistance = depth.read({ ...base, densityDiffPct: .1 }, 1, now + 302);
  assert.notStrictEqual(changedDistance.book, updated.book);
  assert.equal(changedDistance.book.b.length, 0);
  assert.equal(changedDistance.book.a.length, 0);

  depth.clear();
  const empty = depth.read(base, 1, now + 303);
  assert.equal(empty.depthReady, false);
  assert.deepEqual(empty.book, { b: [], a: [] });
});

test('unchanged depth auto counters can skip React updates without hiding trade-flow changes', () => {
  const a = { baseline: 100, bidCut: 200, askCut: 300, buy5m: 400, sell5m: 500 };
  assert.equal(equalDepthAutoStats(a, { ...a }), true);
  for (const key of ['baseline', 'bidCut', 'askCut', 'buy5m', 'sell5m'] as const) {
    assert.equal(equalDepthAutoStats(a, { ...a, [key]: a[key] + 1 }), false);
  }
});

test('auto local-share threshold index is reused on hold refresh and invalidated only for new level inputs', () => {
  type View = {
    levels: OrderBookDensityLevel[];
    localShareFloor?: ReturnType<typeof createOrderBookLocalShareFloorLookup>;
  };
  const now = Date.now();
  const depth = new HookChartDensityBook();
  const levelView = () => (depth as unknown as { levelView: View | null }).levelView;
  const manual = {
    densityDiffPct: 5, densityMode: 'manual', densityThreshold: 100,
    densityAnalysis: true, densityTimeoutMin: 0,
  } as HookChartPreferences;
  const auto = { ...manual, densityMode: 'auto' } as HookChartPreferences;
  assert.equal(depth.apply({
    bids: [[99, 50], [98, 30], [97, 15]], asks: [[101, 40], [102, 25], [103, 18]],
    sequence: 100, isSnapshot: true, eventTime: now,
  }, now), true);

  const manualRead = depth.read(manual, 1, now + 50);
  assert.equal(manualRead.depthReady, true);
  assert.equal(levelView()?.localShareFloor, undefined,
    'explicit manual cutoff must not build an unnecessary depth share index');

  const autoRead = depth.read(auto, 1, now + 100);
  const firstView = levelView()!;
  const firstIndex = firstView.localShareFloor;
  assert.equal(autoRead.depthReady, true);
  assert.ok(firstIndex, 'automatic threshold mode needs a populated index');
  for (const item of firstView.levels) {
    assert.ok(Math.abs(firstIndex!(item) - orderBookLocalShareFloor(firstView.levels, item)) < 1e-5);
  }
  const hold = depth.read(auto, 1, now + 1_000);
  assert.strictEqual(hold.book, autoRead.book, 'unchanged book must be reused on hold refresh');
  assert.strictEqual(levelView()?.localShareFloor, firstIndex,
    'hold-time score updates must reuse the existing price index');

  const otherDistance = depth.read({ ...auto, densityDiffPct: 8 }, 1, now + 1_001);
  assert.equal(otherDistance.depthReady, true);
  const distanceIndex = levelView()?.localShareFloor;
  assert.ok(distanceIndex);
  assert.notStrictEqual(distanceIndex, firstIndex);

  assert.equal(depth.apply({ sequence: 101, eventTime: now + 1_200,
    bids: [[99, 55]], asks: [],
  }, now + 1_200), true);
  depth.read({ ...auto, densityDiffPct: 8 }, 1, now + 1_201);
  const newSequenceIndex = levelView()?.localShareFloor;
  assert.ok(newSequenceIndex);
  assert.notStrictEqual(newSequenceIndex, distanceIndex);

  depth.clear();
  assert.equal(levelView(), null);
});
