import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { HookChartPreferences } from '../src/types';
import { terminalEcoPreferences } from '../src/components/hookchart/terminalEcoPreferences';

test('Terminal ECO disables auxiliary layers without mutating chart preferences', () => {
  const saved: HookChartPreferences = {
    showDensityLines: true,
    showDensityAmounts: true,
    showLiquidations: true,
    showMarketPrintSums: true,
    showMarketStatsBar: true,
    showVolumes: true,
    autoVWAP: true,
    levelIntervals: ['1h', '4h'],
    indicators: ['rsi'],
    strategyId: 'some-strategy',
  };
  const before = structuredClone(saved);
  const eco = terminalEcoPreferences(saved, true);
  assert.equal(eco.showDensityLines, false);
  assert.equal(eco.showDensityAmounts, false);
  assert.equal(eco.showLiquidations, false);
  assert.equal(eco.showMarketPrintSums, false);
  assert.equal(eco.showMarketStatsBar, false);
  assert.equal(eco.showVolumes, false);
  assert.equal(eco.autoVWAP, false);
  assert.deepEqual(eco.indicators, []);
  assert.deepEqual(eco.levelIntervals, []);
  assert.equal(eco.strategyId, '');
  assert.deepEqual(saved, before, 'The account settings must stay intact');
  assert.strictEqual(terminalEcoPreferences(saved, false), saved,
    'Leaving ECO restores the exact original settings object');
});

test('ECO does not modify existing user drawings, alerts or visual preferences', () => {
  const saved = {
    showDensityLabels: true,
    drawings: { 'shared:BTCUSDT': [{ id: 'user-line' }] },
    alerts: { 'shared:BTCUSDT': [{ id: 'local-alert' }] },
    visualProfiles: { terminalLarge: { rightGapBars: 21 } },
  } as unknown as HookChartPreferences;
  const eco = terminalEcoPreferences(saved, true);
  assert.strictEqual(eco.drawings, saved.drawings);
  assert.strictEqual(eco.alerts, saved.alerts);
  assert.strictEqual(eco.visualProfiles, saved.visualProfiles);
  assert.equal(terminalEcoPreferences(saved, false).showDensityLabels, true);
});

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Terminal ECO reaches single and multi charts without touching account settings', () => {
  const page = source('../src/components/TerminalPage.tsx');
  const widget = source('../src/components/terminal/TerminalChartWidget.tsx');
  const wrapper = source('../src/components/ExchangeCandlestickChart.tsx');
  const chart = source('../src/components/TradingViewChart.tsx');
  const hook = source('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(page, /onClick=\{\(\) => setTerminalEcoMode\(enabled => !enabled\)\}/);
  assert.match(page, /aria-pressed=\{terminalEcoMode\}/);
  assert.equal((page.match(/terminalEcoMode=\{terminalEcoMode\}/g) || []).length, 1,
    'ECO reaches all chart counts through the shared grid');
  assert.match(widget, /terminalEcoMode=\{terminalEcoMode\}/);
  assert.match(wrapper, /terminalEcoMode=\{terminalEcoMode\}/);
  assert.match(chart, /terminalEcoMode=\{terminalEcoMode\}/);
  assert.match(hook, /const runtimeSettings = useMemo\(\(\) => \{/);
  assert.match(hook, /const next = terminalEcoPreferences\(settings, ecoActive\)/);
  assert.match(hook, /return archiveMode \? \{ \.\.\.next/);
  assert.doesNotMatch(page, /updateProfileData\(\{\s*terminalEcoMode/);
});

test('ECO actually pauses supplementary market feeds and polling, preserving live kline transport', () => {
  const feed = source('../src/components/hookchart/useOriginalHookChartLiveFeed.ts');
  const hook = source('../src/components/hookchart/HookChartCanvas.tsx');
  const chart = source('../src/components/TradingViewChart.tsx');
  assert.match(feed, /if \(replay \|\| lightweight \|\| !exchangeSymbol\)/);
  assert.match(feed, /if \(replay \|\| lightweight \|\| !exchangeSymbol \|\| marketType !== 'futures'\)/);
  assert.match(hook, /lightweight: ecoActive/);
  assert.match(hook, /ecoActive \|\| archiveMode \? \[timeframe\] : Array\.from/);
  assert.match(hook, /runtimeSettings\.showMarketStatsBar !== false/);
  assert.match(hook, /const statsCandles = !showMarketStats \|\| ecoActive \? EMPTY_ECO_STATS_CANDLES : candles/);
  assert.match(hook, /showOi = !archiveMode && \(indicators\.includes\('oi'\) \|\| !!activeStrategy\?\.config\.oiWindow\)/);
  assert.match(hook, /needsFunding: activeStrategy\?\.config\.kind === 'overheat'/);
  assert.match(feed, /marketType !== 'futures' \|\| !needsFunding\)/);
  assert.match(chart, /subscribeSharedKlines\(/);
  assert.match(chart, /subscribeMarketTrades\(/);
});

test('ECO coalesces live visual ticks while standard HookChart stays at its prior frequency', () => {
  const chart = source('../src/components/TradingViewChart.tsx');
  assert.match(chart, /const liveUiIntervalMs = terminalChartUiIntervalMs\(terminalRefreshMs, terminalEcoMode, terminalActiveCharts\)/);
  assert.match(chart, /liveCandles\.push\(candle, liveUiIntervalMs, opensBar\)/);
  assert.match(chart, /lastUiUpdateTimestampRef\.current >= liveUiIntervalMs/);
  assert.match(chart, /ecoUiTimerRef\.current = setTimeout/);
  assert.match(chart, /setLiveMode\(pendingUiModeRef\.current\)/);
});

test('ECO releases per-trade subscriptions while retaining the same kline WS and fallback timer', () => {
  const chart = source('../src/components/TradingViewChart.tsx');
  const klineStart = chart.indexOf('// Live mode only: ReplayChart');
  const tradeStart = chart.indexOf('// ECO skips the additional per-trade subscription');
  const end = chart.indexOf('// One control always changes all three', tradeStart);
  assert.ok(klineStart !== -1 && tradeStart > klineStart && end > tradeStart);
  const klineEffect = chart.slice(klineStart, tradeStart);
  const tradeEffect = chart.slice(tradeStart, end);
  assert.match(klineEffect, /subscribeSharedKlines\(/);
  assert.match(klineEffect, /fetchSharedLiveFallbackKline\(/);
  assert.match(klineEffect, /stopKlines\(\)/);
  assert.doesNotMatch(klineEffect, /subscribeMarketTrades\(|terminalEcoMode/);
  assert.match(klineEffect, /\}, \[symbol, timeframe, exchange, marketType, terminalTradeCandles\]\)/);
  assert.match(tradeEffect, /if \(terminalEcoMode\) return/);
  assert.match(tradeEffect, /if \(terminalTradeCandles\) return/);
  assert.match(tradeEffect, /subscribeMarketTrades\(/);
  assert.match(tradeEffect, /stopTrades\(\)/);
  assert.doesNotMatch(tradeEffect, /subscribeSharedKlines\(/);
  assert.match(tradeEffect, /\}, \[symbol, timeframe, exchange, marketType, terminalEcoMode, terminalTradeCandles\]\)/);
});

test('ECO resets trailing price timers when the user switches coins and restores saved layers', () => {
  const chart = source('../src/components/TradingViewChart.tsx');
  const canvas = source('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(chart, /if \(ecoUiTimerRef\.current !== null\) clearTimeout\(ecoUiTimerRef\.current\)/);
  assert.match(chart, /<ScopedTradingViewChart key=\{scope\} \{\.\.\.props\} \/>/);
  assert.match(chart, /const streamClock = \{ lastExchangePriceAt: 0, lastStreamTickReceivedAt: 0 \}/);
  assert.match(chart, /liveStreamClockRef\.current = streamClock/);
  assert.match(canvas, /const statsCandles = !showMarketStats \|\| ecoActive \? EMPTY_ECO_STATS_CANDLES : candles/);
  assert.match(canvas, /densityQuickOpen && !ecoActive && toolbarPopup/);
});
