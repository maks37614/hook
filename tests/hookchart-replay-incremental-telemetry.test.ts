import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replayHistoryChange } from '../src/utils/replayHistoryChange';
import type { Kline } from '../src/types';

const candle = (time: number, value: number): Kline => ({
  time, open: value, high: value + 2, low: value - 2, close: value + 1, volume: 10,
});

test('Replay forward stepping uses only one incremental candle and volume update', () => {
  const a = candle(60, 100), b = candle(120, 102), c = candle(180, 104);
  const prior = [a, b], advanced = [a, b, c];
  assert.equal(replayHistoryChange(prior, advanced), 'append');
  assert.equal(replayHistoryChange(advanced, advanced), 'same');
  assert.equal(replayHistoryChange(prior, [a, { ...b, close: 999 }]), 'replace-last');
});

test('Replay history change resets on rewind, replaced earlier candle, gaps and new date', () => {
  const a = candle(60, 100), b = candle(120, 102), c = candle(180, 104);
  assert.equal(replayHistoryChange([a, b, c], [a, b]), 'reset');
  assert.equal(replayHistoryChange([a, b], [a, { ...b }, c]), 'reset',
    'a corrected earlier historical bar requires complete reset');
  assert.equal(replayHistoryChange([a, b], [a, b, candle(120, 111)]), 'reset',
    'out-of-order or repeated time must never be appended');
  assert.equal(replayHistoryChange([a, b], [candle(60, 90), b]), 'reset');
  assert.equal(replayHistoryChange(null, [a]), 'reset');
  assert.equal(replayHistoryChange([a], []), 'reset');
});

test('historical Replay never joins shared live Kline, trade, depth or liquidation transports', () => {
  const replay = readFileSync(new URL('../src/components/replay/ReplayChart.tsx', import.meta.url), 'utf8');
  const canvas = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  assert.match(replay, /replayHistoryChange\(/);
  assert.match(replay, /candleSeriesRef\.current\.update\(candle\(newest\)\)/);
  assert.match(replay, /volumeSeriesRef\.current\.update\(volume\(newest\)\)/);
  assert.match(replay, /candleSeriesRef\.current\.setData\(visibleCandles\.map\(candle\)\)/);
  assert.match(replay, /markers=\{hookMarkers\} replay/);
  assert.doesNotMatch(replay, /subscribeSharedKlines|subscribeMarketTrades|\/api\/hookchart\/klines/);
  assert.match(canvas, /const change = replayHistoryChange\(/);
  assert.match(canvas, /const rows = toHookCandles\(klines\);/);
  assert.match(canvas, /useEffect\(\(\) => replay \? undefined : connectChartDiagnostics\(\)/);
  assert.match(canvas, /if \(replay \|\| externalData \|\| !exchangeSymbol\)/);
});

test('browser diagnostics are opt-in, browser-local and never upload metrics', () => {
  const source = readFileSync(new URL('../src/components/hookchart/chartDiagnostics.ts', import.meta.url), 'utf8');
  assert.match(source, /get\('hookchartPerf'\) === '1'/);
  assert.match(source, /recordChartPaint/);
  assert.match(source, /recordChartKline/);
  assert.match(source, /usedJSHeapSize/);
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|sendBeacon|localStorage/);
});
