import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../src/context/LanguageContext';
import { TerminalChartRefreshPicker } from '../src/components/terminal/TerminalChartRefreshPicker';
import {
  TERMINAL_CHART_REFRESH_OPTIONS,
  normalizeTerminalChartRefreshMs,
  terminalChartUiIntervalMs,
} from '../src/utils/terminalChartRefresh';

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

test('only explicit visual refresh presets are accepted; default keeps live behavior', () => {
  assert.deepEqual(TERMINAL_CHART_REFRESH_OPTIONS, [0, 250, 500, 1000, 2000, 5000]);
  for (const option of TERMINAL_CHART_REFRESH_OPTIONS) {
    assert.equal(normalizeTerminalChartRefreshMs(option), option);
    assert.equal(normalizeTerminalChartRefreshMs(String(option)), option);
  }
  for (const invalid of [null, undefined, '', 'foo', '250ms', -1, 1, 50000, Infinity, NaN]) {
    assert.equal(normalizeTerminalChartRefreshMs(invalid), 0);
  }
  assert.equal(terminalChartUiIntervalMs(0, false), 80);
  assert.equal(terminalChartUiIntervalMs(0, true), 200);
  assert.equal(terminalChartUiIntervalMs(250, false), 250);
  assert.equal(terminalChartUiIntervalMs(1000, false), 1000);
  assert.equal(terminalChartUiIntervalMs(1000, true), 1000);
  assert.equal(terminalChartUiIntervalMs(5000, false), 5000);
  assert.equal(terminalChartUiIntervalMs(0, false, 30), 180);
  assert.equal(terminalChartUiIntervalMs(0, false, 12), 110);
  assert.equal(terminalChartUiIntervalMs(0, true, 30), 200);
  assert.equal(terminalChartUiIntervalMs(1000, false, 30), 1000);
});

test('Terminal refresh icon renders an accessible title and selected visual rate', () => {
  const html = renderToStaticMarkup(React.createElement(LanguageProvider, {
    children: React.createElement(TerminalChartRefreshPicker, {
      intervalMs: 500, onChange: () => {},
      activePreset: 'active', presetAutoUpdate: true, onPresetAutoUpdateChange: () => {},
    }),
  }));
  assert.match(html, /aria-label="Оновлення графіків"/);
  assert.match(html, /Оновлення графіків: 500 ms/);
  assert.match(html, /data-terminal-chart-refresh="500"/);
});

test('both Terminal layouts feed one persisted choice through all chart layers', () => {
  const terminal = read('../src/components/TerminalPage.tsx');
  const widget = read('../src/components/terminal/TerminalChartWidget.tsx');
  const exchange = read('../src/components/ExchangeCandlestickChart.tsx');
  const grid = read('../src/components/terminal/TerminalGridItem.tsx');
  const trading = read('../src/components/TradingViewChart.tsx');
  assert.match(terminal, /normalizeTerminalChartRefreshMs\(config\.terminalRefreshMs\)/);
  assert.match(terminal, /setConfig\(current => current\.terminalRefreshMs === value/);
  assert.doesNotMatch(terminal, /localStorage\.setItem\('terminal_chart_refresh_ms'/);
  assert.equal((terminal.match(/\{renderRefreshPicker\(\)\}/g) ?? []).length, 2);
  assert.equal((terminal.match(/terminalRefreshMs=\{terminalRefreshMs\}/g) ?? []).length, 2);
  assert.match(widget, /terminalRefreshMs=\{terminalRefreshMs\}/);
  assert.match(grid, /terminalRefreshMs=\{terminalRefreshMs\}/);
  assert.match(exchange, /terminalRefreshMs=\{terminalRefreshMs\}/);
  assert.match(trading, /terminalChartUiIntervalMs\(terminalRefreshMs, terminalEcoMode, terminalActiveCharts\)/);
});

test('all HookChart refresh modes use the publisher and keep close signals at ingestion', () => {
  const trading = read('../src/components/TradingViewChart.tsx');
  assert.match(trading, /onClosedCandleRef\.current\?\.\(previousCandle\)/);
  assert.match(trading, /completed \? mergeLiveCandle\(previous, completed\) : previous, latest/);
  assert.match(trading, /if \(chartProvider === 'hookchart'\) liveCandles\.push\(candle, liveUiIntervalMs, opensBar\)/);
  assert.match(trading, /subscribeSharedKlines\(/);
  assert.match(trading, /terminalEcoMode \|\| terminalRefreshMs > 0/);
  assert.match(trading, /liveCandles\.flush\(\);\s*lastUiUpdateTimestampRef\.current = 0;/);
});

test('refresh selector keeps translations, outside dismissal and Escape behavior', () => {
  const picker = read('../src/components/terminal/TerminalChartRefreshPicker.tsx');
  for (const language of ['uk', 'en', 'ru', 'pl'])
    assert.match(picker, new RegExp('  ' + language + ': \\{'));
  assert.match(picker, /document\.addEventListener\('pointerdown', dismissOutside\)/);
  assert.match(picker, /event\.key === 'Escape'/);
  assert.match(picker, /aria-pressed=\{intervalMs === value\}/);
});
