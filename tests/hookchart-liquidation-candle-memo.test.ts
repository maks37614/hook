import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORIGINAL_HOOKCHART_DEFAULTS, normalizeOriginalHookChartPreferences } from '../src/components/hookchart/OriginalHookChartSettings';
import { translateHookChartPhrase } from '../src/locales/hookchartLanguage';
import {
  aggregateLiquidationsByCandle,
  type Candle,
  type Liquidation,
} from '../src/components/hookchart/engine';

const minute = 60_000;
const start = 1_800_000_000_000;
const candle = (t: number): Candle => ({ t, o: 100, h: 105, l: 95, c: 101, v: 100, n: 10 });
const event = (
  id: string, offset: number, side: Liquidation['side'], usd: number,
): Liquidation => ({ id, t: start + offset, side, p: 100, q: usd / 100, usd });

test('Liq markers retain exact LONG/SHORT sums and counts per candle after memoization', () => {
  const candles = [candle(start), candle(start + minute), candle(start + 2 * minute)];
  const events = [
    event('a', 1_000, 'LONG', 300),
    event('b', 5_000, 'SHORT', 125),
    event('c', 20_000, 'LONG', 75),
    event('d', minute, 'SHORT', 400), // Exact candle boundary belongs to the second candle.
    event('e', minute + 59_999, 'LONG', 20),
    event('f', 2 * minute + 2_000, 'SHORT', 600),
  ];
  assert.deepEqual(aggregateLiquidationsByCandle(candles, events, minute), [
    { index: 0, t: start, totalUsd: 500, longUsd: 375, shortUsd: 125, count: 3 },
    { index: 1, t: start + minute, totalUsd: 420, longUsd: 20, shortUsd: 400, count: 2 },
    { index: 2, t: start + 2 * minute, totalUsd: 600, longUsd: 0, shortUsd: 600, count: 1 },
  ]);
});

test('Liq marker bucketing still rejects invalid or out-of-range events', () => {
  const candles = [candle(start), candle(start + minute)];
  const events = [
    event('before', -1, 'LONG', 100),
    event('after', 2 * minute, 'SHORT', 100),
    event('zero', 2_000, 'LONG', 0),
    event('negative', 2_000, 'SHORT', -100),
    { ...event('nan', 2_000, 'LONG', 100), t: NaN },
    event('valid', minute + 3_000, 'LONG', 125),
  ];
  assert.deepEqual(aggregateLiquidationsByCandle(candles, events, minute), [
    { index: 1, t: start + minute, totalUsd: 125, longUsd: 125, shortUsd: 0, count: 1 },
  ]);
  assert.deepEqual(aggregateLiquidationsByCandle(candles, [], minute), []);
  assert.deepEqual(aggregateLiquidationsByCandle([], events, minute), []);
});

test('Canvas reuses Liq candle buckets rather than re-aggregating on every cursor redraw', () => {
  const source = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  assert.match(source, /const liquidationBuckets=useMemo\(/);
  assert.match(source, /showLiquidations\?aggregateLiquidationsByCandle\(candles,liquidations,intervalMs\):\[\]/);
  assert.match(source, /\[showLiquidations,candles,liquidations,intervalMs\]/);
  assert.match(source, /for\(const bucket of liquidationBuckets\)/);
  assert.doesNotMatch(source, /for\(const bucket of aggregateLiquidationsByCandle\(/,
    'the draw loop must not perform O(events × log candles) bucketing on every frame');
});

test('Liq arrow, total and L/S detail toggles are independently stored with safe sizes', () => {
  const defaults = normalizeOriginalHookChartPreferences();
  assert.equal(defaults.showLiquidationArrows, true);
  assert.equal(defaults.showLiquidationDetailSums, true);
  assert.equal(defaults.liquidationArrowSize, 5);
  assert.equal(defaults.liquidationSumFontSize, 10);
  assert.equal(defaults.liquidationDetailFontSize, 9);
  assert.equal(defaults.showMarketPrintArrows, true);
  assert.equal(defaults.marketPrintArrowSize, 4);
  assert.equal(defaults.marketPrintFontSize, 10);
  assert.equal(ORIGINAL_HOOKCHART_DEFAULTS.showLiquidationCandleSums, true);

  const hidden = normalizeOriginalHookChartPreferences({
    showLiquidationArrows: false, showLiquidationDetailSums: false,
    showLiquidationCandleSums: true, showMarketPrintSums: true, showMarketPrintArrows: false,
    liquidationArrowSize: 999, liquidationSumFontSize: -12, liquidationDetailFontSize: 15,
    marketPrintArrowSize: -1, marketPrintFontSize: Number.POSITIVE_INFINITY,
  });
  assert.equal(hidden.showLiquidationArrows, false);
  assert.equal(hidden.showLiquidationDetailSums, false);
  assert.equal(hidden.showLiquidationCandleSums, true);
  assert.equal(hidden.showMarketPrintSums, true);
  assert.equal(hidden.showMarketPrintArrows, false);
  assert.equal(hidden.liquidationArrowSize, 16);
  assert.equal(hidden.liquidationSumFontSize, 8);
  assert.equal(hidden.liquidationDetailFontSize, 15);
  assert.equal(hidden.marketPrintArrowSize, 2);
  assert.equal(hidden.marketPrintFontSize, 10);
});

test('all HookChart annotation controls reach the canvas and do not change liquidation bucketing', () => {
  const canvas = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/components/hookchart/OriginalHookChartSettings.tsx', import.meta.url), 'utf8');
  for (const pref of ['showLiquidationArrows', 'showLiquidationDetailSums', 'liquidationArrowSize',
    'liquidationSumFontSize', 'liquidationDetailFontSize', 'showMarketPrintArrows',
    'marketPrintArrowSize', 'marketPrintFontSize']) {
    assert.match(canvas, new RegExp(pref + '=\\{runtimeSettings\\.' + pref));
    assert.ok(settings.includes(`set('${pref}',`), `missing UI control for ${pref}`);
    assert.ok(source.includes(pref), `missing renderer for ${pref}`);
  }
  assert.match(source, /if\(showLiquidationArrows&&tailY>tipY\+6\)/);
  assert.match(source, /if\s*\(!showLiquidationCandleSums\)\s*\{/);
  assert.match(source, /const detail=showLiquidationDetailSums\?/);
  assert.match(source, /if\(showMarketPrintArrows\)\{/);
  assert.match(source, /showMarketPrintSums\?aggregateMarketPrintsByCandle/);
  assert.match(source, /showLiquidations\?aggregateLiquidationsByCandle/);
});

test('new Liq and executed-trade controls are translated in all four languages', () => {
  for (const label of [
    'Стрілка до суми великих ринкових угод',
    'Розмір стрілки ринкових угод',
    'Розмір тексту великих ринкових угод',
    'Показувати L/S під сумою Liq',
    'Показувати стрілки ліквідацій',
    'Розмір стрілки Liq',
    'Розмір загальної суми Liq',
    'Розмір тексту L/S під сумою',
  ]) {
    assert.equal(translateHookChartPhrase('uk', label), label);
    for (const language of ['en', 'ru', 'pl'] as const)
      assert.notEqual(translateHookChartPhrase(language, label), label, `${language}: ${label}`);
  }
});
