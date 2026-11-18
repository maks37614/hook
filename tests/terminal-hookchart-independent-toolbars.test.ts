import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const widget = read('../src/components/terminal/TerminalChartWidget.tsx');
const page = read('../src/components/TerminalPage.tsx');
const exchange = read('../src/components/ExchangeCandlestickChart.tsx');
const trading = read('../src/components/TradingViewChart.tsx');
const canvas = read('../src/components/hookchart/HookChartCanvas.tsx');

test('each Terminal chart block owns independent top and side toolbars, including when offscreen', () => {
  assert.match(page, /<TerminalGridItem\s+key=\{block\.id\}/);
  const grid = read('../src/components/terminal/TerminalGridItem.tsx');
  assert.match(grid, /<TerminalChartWidget\s+block=\{block\}/);
  assert.match(grid, /onDragStart=\{dragStart\}/);
  assert.match(grid, /onDrop=\{drop\}/);
  assert.match(widget, /const \[extraToolsOpen, setExtraToolsOpen\] = useState\(false\)/);
  assert.match(widget, /const \[drawingToolsOpen, setDrawingToolsOpen\] = useState\(false\)/);
  assert.match(widget, /useMemo<TerminalToolbarVisibility>\(\(\) => \(\{/);
  assert.match(widget, /onExtraToolsOpenChange: setExtraToolsOpen/);
  assert.match(widget, /onDrawingToolsOpenChange: setDrawingToolsOpen/);
  assert.match(widget, /terminalToolbarVisibility=\{useIntegratedHookChartToolbar \? terminalToolbarVisibility : undefined\}/);
  const stateStart = widget.indexOf('const [extraToolsOpen');
  const stateEnd = widget.indexOf('const blockRootRef', stateStart);
  assert.ok(stateStart >= 0 && stateEnd > stateStart);
  const scopedState = widget.slice(stateStart, stateEnd);
  assert.doesNotMatch(scopedState, /localStorage|queueSave|WebSocket|fetch|setInterval/);
});

test('Terminal toolbar state reaches HookChartCanvas without changing other pages', () => {
  assert.match(exchange, /terminalToolbarVisibility\?: TerminalToolbarVisibility/);
  assert.match(exchange, /terminalToolbarVisibility=\{terminalToolbarVisibility\}/);
  assert.match(trading, /terminalToolbarVisibility\?: TerminalToolbarVisibility/);
  assert.match(trading, /terminalToolbarVisibility=\{terminalToolbarVisibility\}/);
  assert.match(canvas, /terminalToolbarVisibility\?: TerminalToolbarVisibility/);
});

test('Top toolbar only toggles the corresponding terminal chart', () => {
  assert.match(canvas, /integratedToolbar && terminalToolbarVisibility\s*\?\s*terminalToolbarVisibility\.extraToolsOpen/);
  assert.match(canvas, /else if \(integratedToolbar && terminalToolbarVisibility\)\s*terminalToolbarVisibility\.onExtraToolsOpenChange\(!terminalExtraToolsOpen\)/);
  assert.match(canvas, /else if \(integratedToolbar\) changeSettings\(\{ terminalExtraToolsOpen: !terminalExtraToolsOpen \}\)/);
  assert.match(canvas, /else changeSettings\(\{ showTopToolbarIcons: !topToolbarOpen \}\)/);
});

test('Side drawing panel only toggles its terminal chart and preserves Replay', () => {
  assert.match(canvas, /terminalMode && terminalToolbarVisibility\s*\?\s*terminalToolbarVisibility\.drawingToolsOpen/);
  assert.match(canvas, /else if \(terminalMode && terminalToolbarVisibility\)\s*terminalToolbarVisibility\.onDrawingToolsOpenChange\(!drawingToolbarOpen\)/);
  assert.match(canvas, /if \(replay\) setReplayDrawingToolbarOpen\(current => !current\)/);
  assert.match(canvas, /else changeSettings\(\{ drawingToolbarOpen: !drawingToolbarOpen \}\)/);
  assert.match(canvas, /data-drawing-tools=\{drawingToolbarOpen \? 'open' : 'closed'\}/);
  assert.match(canvas, /data-extra-tools-open=\{topToolbarOpen \? 'true' : 'false'\}/);
});
