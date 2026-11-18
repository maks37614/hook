import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LiquidationEventBuffer } from '../src/components/hookchart/liquidationEventBuffer';
import { nextLiquidationAdaptiveCutExpiry, nextLiquidationCascadeTransition } from '../src/components/hookchart/feedPublishPolicy';
import { calcCascadeRisk, type Liquidation } from '../src/components/hookchart/engine';

const minute = 60_000;
const t0 = 1_800_000_000_000;
const row = (id: string, t: number, usd: number, side: Liquidation['side'] = 'LONG'): Liquidation =>
  ({ id, t, usd, side, p: 100, q: usd / 100 });

test('unchanged liquidation history reuses one sorted array for periodic polls and 50 Terminal charts', () => {
  const buffer = new LiquidationEventBuffer<Liquidation>();
  for (let i = 0; i < 1_500; i++) {
    assert.equal(buffer.upsert(row('liq-' + i, t0 + i * 1000, 100 + i)), true);
  }
  const original = buffer.snapshot(t0 + 1_500_000);
  assert.equal(original.length, 1500);
  assert.equal(original[0].t, t0);
  assert.equal(original.at(-1)?.t, t0 + 1_499_000);
  const originalTotal = original.reduce((sum, item) => sum + item.usd, 0);
  for (let i = 1; i <= 50; i++)
    assert.strictEqual(buffer.snapshot(t0 + 1_500_000 + i * 2000), original,
      'repeated Liq polling must not re-sort or allocate a new array for unchanged history');
  assert.equal(original.reduce((sum, item) => sum + item.usd, 0), originalTotal);
  const changed = row('new-liq', t0 + 1_600_000, 250, 'SHORT');
  buffer.upsert(changed);
  const updated = buffer.snapshot(t0 + 1_600_100);
  assert.notStrictEqual(updated, original, 'new exchange event invalidates the shared snapshot');
  assert.equal(updated.at(-1)?.id, changed.id);
  assert.equal(original.length, 1500, 'earlier React snapshot is not mutated');
});

test('cumulative fills update once while duplicates never invalidate the cached display', () => {
  const buffer = new LiquidationEventBuffer<Liquidation>();
  buffer.upsert(row('exchange-order', t0, 200));
  const first = buffer.snapshot(t0 + 1000);
  assert.equal(buffer.upsert(row('exchange-order', t0, 200)), false);
  assert.equal(buffer.upsert(row('exchange-order', t0, 180)), false);
  assert.strictEqual(buffer.snapshot(t0 + 1100), first);
  assert.equal(buffer.upsert(row('exchange-order', t0 + 200, 350)), true);
  const next = buffer.snapshot(t0 + 1200);
  assert.notStrictEqual(next, first);
  assert.equal(first[0].usd, 200);
  assert.equal(next[0].usd, 350);
  assert.equal(next.length, 1, 'one cumulative order still counts as one label');
  buffer.replace([row('exchange-order', t0 + 200, 350), row('another-order', t0 + 300, 70)]);
  const restored = buffer.snapshot(t0 + 1500);
  assert.notStrictEqual(restored, next, 'a resync snapshot must invalidate old cached results');
  assert.deepEqual(restored.map(value => value.id), ['exchange-order', 'another-order']);
});

test('cache respects the exact retention boundary, caller age and row-count settings', () => {
  const buffer = new LiquidationEventBuffer<Liquidation>();
  buffer.upsert(row('old', t0, 100));
  buffer.upsert(row('middle', t0 + minute, 200));
  buffer.upsert(row('new', t0 + 2 * minute, 300));
  const initial = buffer.snapshot(t0 + 2 * minute, 2 * minute, 3);
  assert.equal(initial.length, 3);
  assert.strictEqual(buffer.snapshot(t0 + 2 * minute, 2 * minute, 3), initial);
  const shortWindow = buffer.snapshot(t0 + 2 * minute, minute, 3);
  assert.notStrictEqual(shortWindow, initial, 'changing maxAgeMs bypasses the cached response');
  assert.deepEqual(shortWindow.map(item => item.id), ['middle', 'new']);
  assert.strictEqual(buffer.snapshot(t0 + 2 * minute, minute, 3), shortWindow,
    'an event exactly at cutoff remains visible');
  const after = buffer.snapshot(t0 + 2 * minute + 1, minute, 3);
  assert.deepEqual(after.map(item => item.id), ['new']);
  assert.equal(buffer.size, 1);
  assert.strictEqual(buffer.snapshot(t0 + 2 * minute + 1, minute, 3), after);
  buffer.upsert(row('next', t0 + 2 * minute + 2, 400));
  const capped = buffer.snapshot(t0 + 2 * minute + 3, minute, 1);
  assert.deepEqual(capped.map(item => item.id), ['next']);
  assert.equal(buffer.size, 1, 'row cap still bounds retained memory');
  assert.deepEqual(buffer.snapshot(t0 + 2 * minute + 3, minute, 0), []);
  assert.equal(buffer.size, 0);
  assert.deepEqual(buffer.snapshot(t0 + 2 * minute + 3000, minute, 2), []);
});

test('cascade clock advances only at actual 1m and 5m inclusive expiry boundaries', () => {
  const events = [row('risk', t0, 1000)];
  assert.equal(nextLiquidationCascadeTransition(events, t0), t0 + minute + 1);
  assert.equal(nextLiquidationCascadeTransition(events, t0 + minute), t0 + minute + 1);
  assert.equal(nextLiquidationCascadeTransition(events, t0 + minute + 1), t0 + 5 * minute + 1);
  assert.equal(nextLiquidationCascadeTransition(events, t0 + 5 * minute), t0 + 5 * minute + 1);
  assert.equal(nextLiquidationCascadeTransition(events, t0 + 5 * minute + 1), Infinity);
  assert.equal(calcCascadeRisk(events, 100, 100, t0 + minute).count1, 1);
  assert.equal(calcCascadeRisk(events, 100, 100, t0 + minute + 1).count1, 0);
  assert.equal(calcCascadeRisk(events, 100, 100, t0 + 5 * minute).count5, 1);
  assert.equal(calcCascadeRisk(events, 100, 100, t0 + 5 * minute + 1).count5, 0);
  assert.equal(calcCascadeRisk(events, 100, 100, t0 + 5 * minute + 1).score, 0);
});

test('future-dated events enter the cascade window on time; invalid rows cannot schedule work', () => {
  const future = row('future', t0 + 10_000, 900);
  assert.equal(nextLiquidationCascadeTransition([future], t0), future.t);
  assert.equal(nextLiquidationCascadeTransition([future], future.t), future.t + minute + 1);
  assert.equal(calcCascadeRisk([future], 100, 100, t0).count5, 0);
  assert.equal(calcCascadeRisk([future], 100, 100, future.t).count5, 1);
  assert.equal(nextLiquidationCascadeTransition([
    { t: NaN, usd: 200 },
    { t: t0, usd: -100 },
    { t: t0, usd: Infinity },
  ], t0), Infinity);
});

test('adaptive Liq threshold respects the inclusive 15m window without recalculating each poll', () => {
  const first = row('first', t0, 1_000);
  const second = row('second', t0 + 3 * minute, 4_000);
  const rows = [first, second];
  assert.equal(nextLiquidationAdaptiveCutExpiry(rows, t0 + minute), t0 + 15 * minute);
  assert.equal(nextLiquidationAdaptiveCutExpiry(rows, t0 + 15 * minute), t0 + 15 * minute,
    'an event exactly 15 minutes old still participates in the adaptive threshold');
  assert.equal(nextLiquidationAdaptiveCutExpiry(rows, t0 + 15 * minute + 1), t0 + 18 * minute);
  assert.equal(nextLiquidationAdaptiveCutExpiry(rows, t0 + 18 * minute + 1), Infinity);
  assert.equal(nextLiquidationAdaptiveCutExpiry([
    { t: NaN, usd: 100 },
    { t: t0, usd: 0 },
    { t: t0, usd: Infinity },
  ], t0), Infinity);
});

test('one shared Liq view preserves time-sensitive cascade and adaptive-cut expiry', () => {
  const source = readFileSync(new URL('../src/components/hookchart/sharedLiquidationView.ts', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../src/components/hookchart/useOriginalHookChartLiveFeed.ts', import.meta.url), 'utf8');
  assert.match(source, /now >= entry\.nextCascadeAt/);
  assert.match(source, /nextLiquidationCascadeTransition\(rows, now\)/);
  assert.match(source, /now > entry\.adaptiveExpiresAt/);
  assert.match(source, /nextLiquidationAdaptiveCutExpiry\(rows, now\)/);
  assert.match(hook, /setCascadeClock\(view\.cascadeClock\)/);
  assert.match(hook, /calcCascadeRisk\(liquidations, liquidationCut, candles\.at\(-1\)\?\.c \|\| 0\)/);
  assert.match(hook, /\[lightweight, liquidations, liquidationCut, candles\.at\(-1\)\?\.c, cascadeClock\]/);
});
