import test from 'node:test';
import assert from 'node:assert/strict';
import type { Candle } from '../src/components/hookchart/engine';
import {
  haveSameCandlePrefix, updateHookChartAggregation,
} from '../src/components/hookchart/aggregationCache';

const mk = (i: number): Candle => ({
  t: 1_800_000_000_000 + i * 60_000,
  o: 100 + i * .01, h: 102 + i * .01,
  l: 99 + i * .01, c: 101 + i * .01,
  v: i + 1, n: i % 10,
});

test('repeated higher TF checks share one verified immutable candle prefix scan', () => {
  const old = Array.from({ length: 4_000 }, (_, i) => mk(i));
  const next = [...old.slice(0, -1), { ...old.at(-1)!, c: old.at(-1)!.c + .3 }];
  let reads = 0;
  const count = (source: Candle[]): Candle[] => new Proxy(source, {
    get(target, property, receiver) {
      if (typeof property === 'string' && /^(0|[1-9]\d*)$/.test(property)) reads++;
      return Reflect.get(target, property, receiver);
    },
  });
  const trackedOld = count(old);
  const trackedNew = count(next);
  assert.equal(haveSameCandlePrefix(trackedOld, trackedNew, 3_999), true);
  const firstReads = reads;
  assert.ok(firstReads >= 7_998, 'initial validation must inspect the full immutable prefix');

  for (let i = 0; i < 12; i++) {
    assert.equal(haveSameCandlePrefix(trackedOld, trackedNew, 3_999), true);
  }
  assert.equal(reads, firstReads, 'other timeframes must reuse the first validated prefix');

  // Once the input becomes a new candle array, it must be checked again.
  assert.equal(haveSameCandlePrefix(trackedOld, [...next], 3_999), true);
  assert.ok(reads > firstReads);
});

test('shared prefix cache preserves historical corrections, shortening, and exact boundaries', () => {
  const original = Array.from({ length: 1_000 }, (_, i) => mk(i));
  const changed = original.map((row, i) => i === 300 ? { ...row, h: row.h + 20 } : row);
  assert.equal(haveSameCandlePrefix(original, changed, 100), true);
  assert.equal(haveSameCandlePrefix(original, changed, 300), true);
  assert.equal(haveSameCandlePrefix(original, changed, 301), false);
  assert.equal(haveSameCandlePrefix(original, changed, 999), false);
  assert.equal(haveSameCandlePrefix(original, changed, -1), false);
  assert.equal(haveSameCandlePrefix(original, changed, 1001), false);
  assert.equal(haveSameCandlePrefix(original, original, original.length), true);

  const other = [...original, mk(1000)];
  const initial = updateHookChartAggregation(original, '1m', '15m');
  const updated = updateHookChartAggregation(other, '1m', '15m', initial);
  assert.notStrictEqual(updated.candles, initial.candles);
  const corrected = updateHookChartAggregation(changed, '1m', '15m', initial);
  assert.notDeepEqual(corrected.candles, initial.candles);
  assert.notStrictEqual(corrected.candles, initial.candles);
});

test('remote analysis polling is gated on a nonempty set of requested higher timeframes', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  const effect = source.slice(source.indexOf('  useEffect(() => {\n    const exchangeSymbol = /^[A-Z0-9]+$/i.test(symbol);'),
    source.indexOf('  const analysisSeries = useMemo'));
  const requestedAt = effect.indexOf('const requested = analysisTfs.filter(');
  const gateAt = effect.indexOf('if (!requested.length) {', requestedAt);
  const subscriptionAt = effect.indexOf('sharedPublicChartPolling.subscribe(', gateAt);
  assert.ok(requestedAt >= 0 && gateAt > requestedAt && subscriptionAt > gateAt);
  assert.match(effect.slice(gateAt, subscriptionAt), /return;\s*}/);
  assert.match(effect.slice(gateAt, subscriptionAt), /stop = requested.map/);
  assert.match(source, /const trendIntervals = needsTrendSeries \? settings\.trendIntervals \|\| \[\] : \[\]/);
});
