import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Separate fit-history action triggers one shared all-history request for every Terminal panel', () => {
  const drawer = read('src/components/terminal/TerminalSettingsDrawer.tsx');
  const page = read('src/components/TerminalPage.tsx');
  // Newer Terminal drawers record an uncommitted preview before announcing Apply.
  // The fit-all event and all-chart callback must still execute in order.
  assert.match(drawer, /\{t\('terminal\.drawer\.fitHistory'\)\}/);
  assert.match(drawer, /onClick=\{applyDefaultInitialView\}/);
  assert.match(drawer, /applyTerminalInitialViewNow\(TERMINAL_FIT_HISTORY_PROFILE\);\s*(?:setHasUncommittedPreview\(true\);\s*)?setInitialApplied\(true\);\s*onApplyInitialFitAll\?\.\(\);/);
  assert.match(page, /const \[terminalFitAllRequest, setTerminalFitAllRequest\] = useState\(0\);/);
  assert.match(page, /onApplyInitialFitAll=\{\(\) => setTerminalFitAllRequest\(version => version \+ 1\)\}/);
  assert.equal((page.match(/terminalFitAllRequest=\{terminalFitAllRequest\}/g) ?? []).length, 1,
    'single and multi-chart views share the same prop forwarding');
  assert.doesNotMatch(drawer, /new WebSocket|location\.reload\(|window\.location\.reload\(/);
});

test('fit-history request reaches every chart, including previously lazy-mounted panels', () => {
  const grid = read('src/components/terminal/TerminalGridItem.tsx');
  const widget = read('src/components/terminal/TerminalChartWidget.tsx');
  const exchange = read('src/components/ExchangeCandlestickChart.tsx');
  const wrapper = read('src/components/TradingViewChart.tsx');
  const canvas = read('src/components/hookchart/HookChartCanvas.tsx');
  assert.match(grid, /terminalFitAllRequest=\{terminalFitAllRequest\}/);
  assert.match(widget, /terminalFitAllRequest=\{useIntegratedHookChartToolbar \? terminalFitAllRequest : undefined\}/);
  assert.match(widget, /const shouldLoadWidgets = !isSuspended && \(isSingleBlock \|\| isMaximized \|\| isNearViewport\)/);
  assert.match(exchange, /terminalFitAllRequest=\{terminalFitAllRequest\}/);
  assert.match(wrapper, /terminalFitAllRequest=\{terminalFitAllRequest\}/);
  assert.match(canvas, /terminalFitAllRequest=\{terminalInitialViewTarget \? terminalFitAllRequest : undefined\}/);
  assert.match(canvas, /const terminalInitialViewTarget = !replay && !archiveMode/);
  assert.match(canvas, /terminalMode \|\| visualContext === 'terminalLarge'/);
  assert.doesNotMatch(read('src/components/replay/ReplayChart.tsx'), /terminalFitAllRequest/);
});

test('same fit-all callback powers the scale-history icon and Terminal Apply', () => {
  const engine = read('src/components/hookchart/engine.tsx');
  assert.match(engine, /const fitAllHistory=\(\)=>\{terminalNavigation\.current=true;manualPriceAxisOverride\.current=false;fitAllScopeRef\.current=fitAllScopeKey;/);
  assert.match(engine, /onClick=\{fitAllHistory\}/);
  assert.match(engine, /lastTerminalFitAllRequestRef=useRef<\{request:number;scope:string\}\|null>\(null\)/);
  assert.match(engine, /if\(!terminalFitAllRequest\)\{\s*lastTerminalFitAllRequestRef\.current=null;\s*return;\s*\}/);
  assert.match(engine, /if\(!candles\.length\)return;/);
  assert.match(engine, /previousFit\?\.request===terminalFitAllRequest&&previousFit\.scope===fitAllScopeKey/);
  assert.match(engine, /lastTerminalFitAllRequestRef\.current=\{request:terminalFitAllRequest,scope:fitAllScopeKey\};\s*fitAllHistory\(\);/);
  assert.match(engine, /\},\[terminalFitAllRequest,candles\.length,fitAllScopeKey\]\);/);
  // Profile refresh runs first; the fit-all click must win over the saved
  // number-of-bars setting rather than collapsing back to a narrow window.
  assert.ok(engine.indexOf('if(visualAppliedRef.current===signature)return;')
    < engine.indexOf('lastTerminalFitAllRequestRef.current={request:terminalFitAllRequest,scope:fitAllScopeKey};'));
  assert.match(engine, /rightOffset:0,autoY:true,manualCenter:null,manualRange:null,yZoom:1,fitAll:true/);
  assert.match(engine, /if\(fitAllScopeRef\.current===fitAllScopeKey&&oldSignature&&/);
  // The action only changes a Viewport and is not a new candle fetch.
  const start = engine.indexOf('const fitAllHistory=()=>');
  const end = engine.indexOf('const zoomButton=', start);
  const effect = engine.slice(start, end);
  assert.doesNotMatch(effect, /fetch\(|onNeedHistory|new WebSocket|new EventSource|localStorage\.setItem/);
});

test('confirmation explains stored startup settings versus on-demand fit on all four languages', () => {
  const translations = read('src/locales/terminalSettingsDrawer20261115.ts');
  for (const text of [
    'Усі графіки підігнано під завантажену історію',
    'All Terminal charts fitted to loaded history',
    'Все графики подогнаны под загруженную историю',
    'Wszystkie wykresy dopasowano do wczytanej historii',
    'натисніть «Готово»', 'press Done', 'нажмите «Готово»',
    'kliknij „Gotowe”',
  ]) assert.ok(translations.includes(text), text);
});

test('Apply stages visible fit-history controls; Done saves dynamic mode while charts still fit immediately', () => {
  const drawer = read('src/components/terminal/TerminalSettingsDrawer.tsx');
  const page = read('src/components/TerminalPage.tsx');
  const profiles = read('src/components/terminal/terminalInitialViewApply.ts');
  const types = read('src/types.ts');
  const workspace = read('src/utils/useTerminalWorkspace.ts');
  assert.match(profiles, /visibleBars: 500,\s*rightGapBars: 0,\s*verticalZoom: 1,\s*autoPriceScale: true/);
  assert.match(drawer, /setInitial\(TERMINAL_FIT_HISTORY_PROFILE\);\s*setInitialFitAll\(true\);/);
  assert.match(drawer, /initialFitAll \? t\('terminal\.drawer\.allLoadedCandles'\) : initial\.visibleBars/);
  const apply = drawer.slice(drawer.indexOf('setInitial(TERMINAL_FIT_HISTORY_PROFILE);'), drawer.indexOf('onApplyInitialFitAll?.();'));
  assert.doesNotMatch(apply, /onUpdateConfig\(/, 'Apply is preview-only until Done');
  assert.match(drawer, /const saveAndClose = \(\) => \{[\s\S]*?onUpdateConfig\(\{\s*initialChartView: initialResetToDefault \? undefined : initial,\s*initialChartFitAll: initialFitAll,/);
  assert.match(drawer, /onClick=\{saveAndClose\}/);
  assert.match(types, /initialChartFitAll\?: boolean/);
  assert.match(workspace, /config\.initialChartFitAll = config\.initialChartFitAll === true/);
  assert.match(page, /setTerminalFitAllRequest\(version => config\.initialChartFitAll === true\s*\? \(version > 0 \? version : 1\) : 0\)/);
});
