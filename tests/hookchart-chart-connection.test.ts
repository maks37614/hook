import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VISUAL_CONTEXTS, makeVisualProfileKey } from '../src/components/hookchart/visualProfiles';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Screener and Formations share two scales while Terminal and devices stay independent', () => {
  const keys = VISUAL_CONTEXTS.flatMap(item =>
    [makeVisualProfileKey(item.id, 'desktop'), makeVisualProfileKey(item.id, 'mobile')]);
  assert.equal(keys.length, 14, 'all historical context names remain supported');
  assert.equal(new Set(keys).size, 10, 'two shared scales and three Terminal layouts for each device');
  assert.equal(makeVisualProfileKey('formationsQuick', 'mobile'), makeVisualProfileKey('screenerQuick', 'mobile'));
  assert.equal(makeVisualProfileKey('formationsFull', 'desktop'), makeVisualProfileKey('screenerFull', 'desktop'));
  assert.notEqual(makeVisualProfileKey('screenerQuick', 'mobile'), makeVisualProfileKey('screenerQuick', 'desktop'));
  assert.notEqual(makeVisualProfileKey('screenerQuick', 'desktop'), makeVisualProfileKey('terminalLarge', 'desktop'));
});

test('Screener, Formations and fullscreen routes pass their profile context into HookChart', () => {
  const formation = source('../src/components/FormationCard.tsx');
  const early = source('../src/components/EarlyFormationCard.tsx');
  const fullscreen = source('../src/components/FullscreenChartModal.tsx');
  const exchange = source('../src/components/ExchangeCandlestickChart.tsx');
  const trading = source('../src/components/TradingViewChart.tsx');
  assert.match(formation, /visualContext="formationsQuick"/);
  assert.match(early, /visualContext="formationsQuick"/);
  assert.match(fullscreen, /'formationsFull' : 'screenerFull'/);
  assert.match(exchange, /visualContext=\{visualContext\}/);
  assert.match(trading, /terminalMode=\{terminalMode\} terminalAutoScale=\{terminalAutoScale\}/);
  assert.match(trading, /terminalHistoryReady=\{terminalTradeCandles \|\| initialHistoryLoaded \|\| klines\.length > 1\}/);
  assert.match(trading, /terminalInitialView=\{terminalInitialView\} terminalFitAllRequest=\{terminalFitAllRequest\} visualContext=\{visualContext\}/);
  assert.match(trading, /visualContext = 'screenerQuick'/);
});

test('Terminal single and multi-chart layouts route to their proper saved profiles', () => {
  const terminal = source('../src/components/TerminalPage.tsx');
  const widget = source('../src/components/terminal/TerminalChartWidget.tsx');
  const canvas = source('../src/components/hookchart/HookChartCanvas.tsx');
  // One coin and many coins now share the same grid widget. HookChart derives
  // its saved Terminal visual context from the actual rendered tile width.
  assert.match(terminal, /<TerminalGridItem/);
  assert.doesNotMatch(terminal, /visualContext="terminalLarge"/);
  assert.match(terminal, /terminalAutoScale=\{autoScaleCharts && chartProvider === 'hookchart'\}/);
  assert.match(widget, /terminalAutoScale=\{terminalAutoScale && useIntegratedHookChartToolbar\}/);
  assert.match(widget, /terminalMode=\{useIntegratedHookChartToolbar\}/);
  assert.match(canvas, /visualContextForTerminalWidth\(root\.getBoundingClientRect\(\)\.width\)/);
  assert.match(canvas, /const activeVisualContext = terminalMode \? terminalVisualContext : \(visualContext \|\| 'screenerQuick'\)/);
  assert.match(canvas, /visualDeviceForWidth\(window\.innerWidth\)/);
});

test('saved chart settings rehydrate from user account and drive native chart, time and indicator axes', () => {
  const canvas = source('../src/components/hookchart/HookChartCanvas.tsx');
  const editor = source('../src/components/hookchart/OriginalHookChartSettings.tsx');
  const engine = source('../src/components/hookchart/engine.tsx');
  const account = source('../src/components/profile/ProfileHookChartSettings.tsx');
  assert.match(canvas, /profile\?\.hookChartPreferences/);
  assert.match(canvas, /normalizeOriginalHookChartPreferences\(preferences\)/);
  assert.match(canvas, /visualProfile=\{activeVisualProfile\}/);
  assert.match(canvas, /visualProfileKey=\{replay \? undefined : terminalInitialViewTarget/);
  assert.match(canvas, /rightPaddingBars=\{rightPaddingBars\}/);
  assert.match(editor, /onProfileChange=\{delta => set\('visualProfiles', patchVisualProfile\(/);
  assert.match(engine, /profile\.visibleBars,profile\.verticalZoom,profile\.autoPriceScale,profile\.rightGapBars/);
  assert.match(account, /writerRef\.current\(\{ hookChartPreferences: delta \}\)/);
  assert.match(account, /normalizeOriginalHookChartPreferences\(profile\.hookChartPreferences\)/);
});

test('Replay remains independent and global Terminal auto mode has explicit priority', () => {
  const engine = source('../src/components/hookchart/engine.tsx');
  const canvas = source('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(canvas, /const activeVisualProfile = replay \? undefined/);
  assert.match(canvas, /terminalInitialViewTarget && selectedTerminalInitialView/);
  assert.match(engine, /const priceAuto=terminalAutoScale\|\|profile\.autoPriceScale/);
  assert.match(engine, /yZoom:terminalAutoScale\?1:profile\.verticalZoom/);
  assert.match(engine, /terminalCandlePriceRange\(lo,hi,plotH,showVolumes\)/);
});
