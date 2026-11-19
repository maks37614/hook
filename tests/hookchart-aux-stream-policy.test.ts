import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hookChartAuxFeedPolicy } from '../src/components/hookchart/hookChartAuxFeedPolicy';

const on = { densityAnalysis: true, showMarketPrintSums: false };
const off = { densityAnalysis: false, showMarketPrintSums: false };

test('disabling density releases its depth book and extra trade subscriber', () => {
  assert.deepEqual(hookChartAuxFeedPolicy(off), { depth: false, trades: false });
  assert.deepEqual(hookChartAuxFeedPolicy(on), { depth: true, trades: true });
  // Existing legacy accounts with no explicit preference keep active densities.
  assert.deepEqual(hookChartAuxFeedPolicy({}), { depth: true, trades: true });
});

test('independent market-print overlay keeps trade data without an unused depth book', () => {
  assert.deepEqual(hookChartAuxFeedPolicy({ ...off, showMarketPrintSums: true }),
    { depth: false, trades: true });
  assert.deepEqual(hookChartAuxFeedPolicy({ ...on, showMarketPrintSums: true }),
    { depth: true, trades: true });
});

test('a breakout, reaction or liquidity strategy retains needed book data', () => {
  assert.deepEqual(hookChartAuxFeedPolicy(off, true), { depth: true, trades: true });
  // Replay and Terminal ECO never start auxiliary market data regardless of settings.
  assert.deepEqual(hookChartAuxFeedPolicy(on, true, true, false),
    { depth: false, trades: false });
  assert.deepEqual(hookChartAuxFeedPolicy(on, true, false, true),
    { depth: false, trades: false });
});

test('depth and trades have independent lifecycle effects; candle feed stays separate', () => {
  const feed = readFileSync(new URL('../src/components/hookchart/useOriginalHookChartLiveFeed.ts', import.meta.url), 'utf8');
  const canvas = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  const candleFeed = readFileSync(new URL('../src/components/TradingViewChart.tsx', import.meta.url), 'utf8');
  assert.match(feed, /if \(replay \|\| lightweight \|\| !exchangeSymbol \|\| !depthEnabled\)/);
  assert.match(feed, /const stopDepth = connectSharedHookChartDepth/);
  assert.match(feed, /if \(!tradesEnabled \|\| !exchangeSymbol\)/);
  assert.match(feed, /const stopTrades = subscribeMarketTrades/);
  assert.match(feed, /depthBookRef\.current\?\.recordAggressiveTrade\(trade\)/);
  assert.match(feed, /return \(\) => \{ dead = true; stopTrades\(\); \};/);
  assert.match(canvas, /needsStrategyBook: activeStrategy\?\.config\.kind === 'breakout'/);
  assert.match(candleFeed, /const stopKlines = subscribeSharedKlines/);
});
