import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAutoPocZone, createAutoPocZoneCache, type PocCandle } from '../src/components/hookchart/autoPoc';

function legacyZone(rows: PocCandle[]) {
  if (rows.length <= 4) return null;
  let lo = Infinity, hi = -Infinity;
  for (const row of rows) { if (row.l < lo) lo = row.l; if (row.h > hi) hi = row.h; }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
  const count = 48, step = (hi - lo) / count, bins = Array.from({ length: count }, () => 0);
  for (const k of rows) {
    const a = Math.max(0, Math.min(count - 1, Math.floor((k.l - lo) / step)));
    const b = Math.max(a, Math.min(count - 1, Math.floor((k.h - lo) / step)));
    const share = k.v / Math.max(1, b - a + 1);
    for (let j = a; j <= b; j++) bins[j] += share;
  }
  let poc = 0, max = 0;
  for (let i = 0; i < count; i++) if (bins[i] > max) { max = bins[i]; poc = i; }
  let z0 = poc, z1 = poc;
  if (poc > 0 && bins[poc - 1] >= max * .72) z0--;
  if (poc < count - 1 && bins[poc + 1] >= max * .72) z1++;
  return { pLo: lo + z0 * step, pHi: lo + (z1 + 1) * step, pMid: lo + (poc + .5) * step };
}

const candles: PocCandle[] = Array.from({ length: 500 }, (_, i) => ({
  l: 98 + Math.sin(i * .23) * 2, h: 103 + Math.cos(i * .1) * 2,
  v: 100 + i % 17 * 13,
}));

test('cached POC matches the original visible-range model', () => {
  for (const [start, end] of [[0, 500], [4, 25], [70, 245], [100, 105], [498, 500]]) {
    assert.deepEqual(calculateAutoPocZone(candles, start, end), legacyZone(candles.slice(start, end)));
  }
  assert.equal(calculateAutoPocZone([], 0, 0), null);
  assert.equal(calculateAutoPocZone(Array.from({ length: 8 }, () => ({ l: 1, h: 1, v: 10 }))), null);
});

test('POC cache reuses unchanged scenes and invalidates after a new tick or viewport change', () => {
  const cache = createAutoPocZoneCache();
  const first = cache.get(candles, 20, 120);
  assert.ok(first);
  assert.strictEqual(cache.get(candles, 20, 120), first);
  const differentViewport = cache.get(candles, 21, 121);
  assert.deepEqual(differentViewport, legacyZone(candles.slice(21, 121)));
  const newBars = candles.slice();
  newBars[119] = { ...newBars[119], v: newBars[119].v * 5 };
  const updated = cache.get(newBars, 20, 120);
  assert.notStrictEqual(updated, first);
  assert.deepEqual(updated, legacyZone(newBars.slice(20, 120)));
});
