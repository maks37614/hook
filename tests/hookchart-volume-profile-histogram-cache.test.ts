import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildVolumeProfileHistogram, createVolumeProfileHistogramCache,
  type ProfileCandle,
} from '../src/components/hookchart/volumeProfileHistogram';

test('volume profile retains the original inclusive candle-to-price-bin semantics', () => {
  const candles: ProfileCandle[] = [
    { o: 10, h: 12, l: 10, c: 12, v: 100 },
    { o: 12, h: 14, l: 12, c: 11, v: 50 },
  ];
  const profile = buildVolumeProfileHistogram(candles, 0, 1, 2);
  assert.ok(profile);
  assert.equal(profile.pLo, 10);
  assert.equal(profile.pHi, 14);
  assert.equal(profile.step, 2);
  assert.deepEqual(profile.bins, [
    { buy: 50, sell: 0, total: 50 },
    { buy: 50, sell: 50, total: 100 },
  ]);
  assert.equal(profile.maxV, 100);
  assert.equal(profile.poc, 1);
});

test('invalid and flat candle selections do not produce misleading profile bars', () => {
  const flat = [{ o: 10, h: 10, l: 10, c: 10, v: 5 }];
  assert.equal(buildVolumeProfileHistogram(flat, 0, 0, 20), null);
  assert.equal(buildVolumeProfileHistogram(flat, -1, 0, 20), null);
  assert.equal(buildVolumeProfileHistogram(flat, 0, 1, 20), null);
  assert.equal(buildVolumeProfileHistogram(flat, 0, 0, 0), null);
});

test('the same candle snapshot/range/bin width is calculated only once', () => {
  const candles = Array.from({ length: 700 }, (_, i) => ({
    o: 100 + i / 100, h: 103 + i / 100,
    l: 98 + i / 100, c: 101 + i / 100, v: 150 + i,
  }));
  const cache = createVolumeProfileHistogramCache();
  const first = cache.get(candles, 60, 680, 40);
  for (let move = 0; move < 400; move++) {
    assert.strictEqual(cache.get(candles, 60, 680, 40), first,
      'moving the pointer or panning at the same profile resolution cannot rebuild the bins');
  }
  assert.equal(cache.calculations(), 1);
  assert.notStrictEqual(cache.get(candles, 60, 680, 30), first,
    'changing the on-screen profile width may change the bin resolution');
  assert.equal(cache.calculations(), 2);
  assert.notStrictEqual(cache.get(candles, 50, 680, 40), first,
    'moving a selection endpoint to another candle must rebuild the histogram');
  assert.equal(cache.calculations(), 3);
});

test('a new immutable candle snapshot invalidates cached OHLCV and POC without requiring a new chart', () => {
  const candles: ProfileCandle[] = [
    { o: 10, h: 12, l: 10, c: 11, v: 100 },
    { o: 12, h: 14, l: 12, c: 13, v: 50 },
  ];
  const cache = createVolumeProfileHistogramCache();
  const before = cache.get(candles, 0, 1, 2);
  const revised = [...candles.slice(0, 1), { ...candles[1], h: 17, v: 500 }];
  const after = cache.get(revised, 0, 1, 2);
  assert.notStrictEqual(before, after);
  assert.equal(after?.pHi, 17);
  assert.equal(cache.calculations(), 2);
  assert.equal(cache.activeEntries(), 1);
});

test('50 chart cards with repeated hover events use bounded per-chart histogram work', () => {
  const candles = Array.from({ length: 600 }, (_, i) => ({
    o: 10 + i / 100, h: 12 + i / 100, l: 9 + i / 100,
    c: 11 + i / 100, v: i + 25,
  }));
  const cards = Array.from({ length: 50 }, () => createVolumeProfileHistogramCache(4));
  for (let hover = 0; hover < 250; hover++) {
    for (const chart of cards) chart.get(candles, 50, 550, 35);
  }
  assert.equal(cards.reduce((n, card) => n + card.calculations(), 0), 50,
    '12,500 pointer checks should build just one histogram per chart');
  for (const chart of cards) {
    for (let i = 0; i < 12; i++) chart.get(candles, i, 550, 35);
    assert.ok(chart.activeEntries() <= 4,
      'the bounded LRU must not retain every historical drag position');
  }
});

test('the chart consumes cached data only and recomputes screen coordinates after gestures', () => {
  const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  assert.match(engine, /volumeProfileCache\.get\(candles,i0,i1,binCount\)/);
  assert.match(engine, /const yTop=g\.y\(pHi\),yBottom=g\.y\(pLo\)/);
  assert.match(engine, /const xA=g\.x\(t0\),xB=g\.x\(t1\)/);
});
