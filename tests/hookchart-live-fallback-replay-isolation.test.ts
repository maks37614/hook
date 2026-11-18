import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldApplyLiveFallbackKline } from '../src/components/hookchart/sharedLiveFallback';
import type { Kline } from '../src/types';

const bar = (time: number, volume: number, close = 102): Kline => ({
  time, open: 100, high: Math.max(103, close), low: 99, close, volume,
});

test('REST fallback never rolls back a newer WebSocket candle or its volume', () => {
  const now = 1730000000;
  assert.equal(shouldApplyLiveFallbackKline(bar(now-60, 20), bar(now, 40), 1000, 0, false), false,
    'old timestamps cannot replace current candle');
  assert.equal(shouldApplyLiveFallbackKline(bar(now, 42), bar(now, 40), 1000, 1200, true), false,
    'new stream message after REST request started always wins');
  assert.equal(shouldApplyLiveFallbackKline(bar(now, 10), bar(now, 40), 1000, 0, false), false,
    'historical HTTP replay must not reduce the cumulative candle volume');
  assert.equal(shouldApplyLiveFallbackKline(bar(now, 40, 99), bar(now, 40, 100), 1000, 0, false), false,
    'equal cumulative volume cannot undo a newer trade price');
  assert.equal(shouldApplyLiveFallbackKline(bar(now, 41), bar(now, 40), 1000, 1200, false), true,
    'HTTP remains usable as backup while WS is disconnected');
  assert.equal(shouldApplyLiveFallbackKline(bar(now+60, 2), bar(now, 40), 1000, 1200, true), true,
    'valid new candle must be allowed even when older candle was updated');
});

test('bad or missing REST fallback candles are rejected', () => {
  const candle = bar(1730000000, 50);
  assert.equal(shouldApplyLiveFallbackKline({ ...candle, volume: -1 }, candle, 0, 0, false), false);
  assert.equal(shouldApplyLiveFallbackKline(candle, null, 0, 0, false), true);
});

test('Replay never subscribes to live market or liquidation sessions', () => {
  const replay = readFileSync(new URL('../src/components/replay/ReplayChart.tsx', import.meta.url), 'utf8');
  const canvas = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  const feed = readFileSync(new URL('../src/components/hookchart/useOriginalHookChartLiveFeed.ts', import.meta.url), 'utf8');
  assert.match(replay, /markers=\{hookMarkers\} replay/);
  assert.match(canvas, /useOriginalHookChartLiveFeed\(\{\s*exchange, marketType, symbol, settings: runtimeSettings, candles, replay,\s*lightweight: ecoActive \|\| archiveMode,/);
  assert.match(canvas, /archiveMode \? \[\] : visiblePriceMarkers/);
  assert.match(feed, /const sessionSubscription = useMemo\(\(\) => \(replay \|\| lightweight\)/);
  assert.match(feed, /snapshot: \(\) => EMPTY_SESSION_LIQUIDATIONS/);
  assert.match(feed, /if \(replay \|\| lightweight \|\| !exchangeSymbol\)/);
  assert.match(canvas, /marketPrints=\{replay \? \[\] : liveFeed\.marketPrints\}/);
  assert.match(canvas, /liquidations=\{replay \? \[\] : liveFeed\.liquidations\}/);
  assert.match(canvas, /showLiqRiskBlock=\{!replay/);
});

test('native HookChart does not launch the unused legacy per-chart countdown interval', () => {
  const chart = readFileSync(new URL('../src/components/TradingViewChart.tsx', import.meta.url), 'utf8');
  assert.match(chart, /if \(chartProvider === 'hookchart'\) return;\s*const updateCountdown/);
  assert.match(chart, /clearInterval\(interval\);\s*\}, \[timeframe, chartProvider\]\)/);
  assert.match(chart, /fetchSharedLiveFallbackKline/);
});
