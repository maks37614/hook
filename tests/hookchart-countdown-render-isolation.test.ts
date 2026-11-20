import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countdownBarLeftMs, formatCountdownBarLeft } from '../src/components/hookchart/ChartBarCountdown';

test('clock labels remain exact at 1-minute and 1-hour bar boundaries', () => {
  const start = 1710000000000;
  const minute = 60_000;
  assert.equal(formatCountdownBarLeft(countdownBarLeftMs(start, minute, start)), '01:00');
  assert.equal(formatCountdownBarLeft(countdownBarLeftMs(start + 1000, minute, start)), '00:59');
  const alignedStart = Math.floor(start / minute) * minute;
  assert.equal(formatCountdownBarLeft(countdownBarLeftMs(alignedStart, minute, alignedStart)), '01:00');
  assert.equal(formatCountdownBarLeft(countdownBarLeftMs(alignedStart + 59_000, minute, alignedStart)), '00:01');
  assert.equal(formatCountdownBarLeft(countdownBarLeftMs(alignedStart + 60_000, minute, alignedStart)), '01:00',
    'late exchange Kline must not hold the countdown at zero');
  assert.equal(formatCountdownBarLeft(countdownBarLeftMs(alignedStart + 61_000, minute, alignedStart)), '00:59');
  const hour = 3600_000;
  assert.equal(formatCountdownBarLeft(countdownBarLeftMs(7200_000, hour, 7200_000)), '01:00:00');
  assert.equal(formatCountdownBarLeft(countdownBarLeftMs(7201_000, hour, 7200_000)), '59:59');
});

test('invalid clock inputs safely render a neutral countdown', () => {
  assert.equal(countdownBarLeftMs(Number.NaN, 60_000), 0);
  assert.equal(countdownBarLeftMs(Date.now(), 0), 0);
  assert.equal(formatCountdownBarLeft(-1000), '00:00');
});

test('the one-second clock is subscribed by only the countdown child, not the Canvas Chart', () => {
  const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  const label = readFileSync(new URL('../src/components/hookchart/ChartBarCountdown.tsx', import.meta.url), 'utf8');
  const replay = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(engine, /useSharedChartClock\(/, 'the chart renderer must not rerender on the wall clock');
  assert.match(engine, /<ChartBarCountdown tf=\{tf\} intervalMs=\{intervalMs\}/);
  assert.match(label, /useSharedChartClock\(true\)/);
  assert.match(replay, /hideBarCountdown=\{replay\}/, 'historical Replay has no wall-clock countdown');
});

test('Terminal price stream updates its visible owner without rerendering a hidden chart badge', () => {
  const chart = readFileSync(new URL('../src/components/TradingViewChart.tsx', import.meta.url), 'utf8');
  const guards = chart.match(/if \(showNavigationControls && !hideSymbolAndPrice\) \{/g) || [];
  assert.equal(guards.length, 3, 'immediate, ECO trailing-tick and animation-frame price updates must all be guarded');
  assert.match(chart, /onLivePriceUpdate\?\.\(update\.price\)/,
    'Terminal must keep receiving live price even without a chart badge');
  // The gap recovery callback is stable and must remain in the live tick dependencies.
  assert.match(chart, /\[onLivePriceUpdate, chartProvider, showNavigationControls, hideSymbolAndPrice, liveCandles, liveUiIntervalMs, terminalEcoMode, terminalRefreshMs, recoverKlineGap\]/);
});
