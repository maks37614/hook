import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { VISUAL_CONTEXTS, captureVisualProfile, getVisualProfile, makeVisualProfileKey } from '../src/components/hookchart/visualProfiles';
import { terminalSafeManualPriceViewport, terminalViewportHistoryPhase } from '../src/components/hookchart/terminalAutoScale';

/** Execute the real HookChart visual-profile effect, not a duplicate algorithm. */
const source = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('engine.tsx', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const chartNode = ast.statements.find(node =>
  ts.isFunctionDeclaration(node) && node.name?.text === 'Chart');
assert.ok(chartNode, 'the real Chart function must exist');

function buildEffect(needle: string) {
  let found: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)
        && node.expression.getText(ast) === 'useLayoutEffect'
        && node.arguments[0]?.getText(ast).includes(needle)) {
      found = node.arguments[0];
    }
    ts.forEachChild(node, visit);
  }
  visit(chartNode!);
  assert.ok(found, 'HookChart effect missing: ' + needle);
  const callback = found!.getText(ast);
  const vars = [
    'visualProfile','visualProfileKey','visualProfileCaptureVersion','lastVisualCaptureRef',
    'visualAppliedRef','lastVisualGapRef','fitAllScopeRef','fitAllScopeKey','interactionScope',
    'ref','initialLogicalRange','candles','symbol','tf','terminalMode',
    'terminalNavigation','terminalAutoScale','setVp','hookChartPlotWidth','rangeRestored',
    'restoredHookViewport','rightPaddingBars','rightPadding',
    'ResizeObserver','setVisualCanvasWidth','terminalSafeManualPriceViewport','showVolumes',
    'terminalHistoryPhase','viewportAdjustedByUserRef',
  ];
  const script = `exports.run=(env)=>{const {${vars.join(',')}}=env;(${callback})();};`;
  const code = ts.transpileModule(script, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: { run?: (environment: Record<string, any>) => void } = {};
  new Function('exports', code)(exports);
  assert.ok(exports.run);
  return exports.run!;
}

const applyProfile = buildEffect('lastVisualCaptureRef.current!==visualProfileCaptureVersion');
const trackCanvasWidth = buildEffect('setVisualCanvasWidth(previous=>previous===measured?previous:measured)');
const restorePreviousRange = buildEffect('rangeRestored.current');

function fixture() {
  const updates: Array<Record<string, any>> = [];
  let viewport: Record<string, any> | undefined;
  const candles = Array.from({ length: 150 }, (_, index) => ({
    t: 1700000000000 + index * 3600000,
    o: 100 + index, h: 105 + index, l: 95 + index, c: 102 + index,
  }));
  const env: Record<string, any> = {
    visualProfile: getVisualProfile(undefined, 'screenerFull', 'desktop'),
    visualProfileKey: 'screenerFull:desktop',
    visualProfileCaptureVersion: 0,
    lastVisualCaptureRef: { current: 0 },
    visualAppliedRef: { current: null },
    viewportAdjustedByUserRef: { current: false },
    terminalHistoryPhase: 'ready',
    lastVisualGapRef: { current: 0 },
    fitAllScopeRef: { current: null },
    interactionScope: 'live:binance:futures:BTCUSDT',
    fitAllScopeKey: 'live:binance:futures:BTCUSDT:1h',
    ref: { current: { getBoundingClientRect: () => ({ width: 600 }) } },
    initialLogicalRange: null, candles, symbol: 'BTCUSDT', tf: '1h',
    terminalMode: false, terminalAutoScale: false, terminalNavigation: { current: false },
    terminalSafeManualPriceViewport, showVolumes: true,
    hookChartPlotWidth: (width: number) => width - 60,
    rangeRestored: { current: false },
    restoredHookViewport: () => ({ barWidth: 3, rightOffset: 88, autoY: true }),
    rightPaddingBars: 0, rightPadding: 0,
    setVp(value: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) {
      viewport = typeof value === 'function' ? value(viewport!) : value;
      updates.push(viewport);
    },
  };
  return { env, updates, getViewport: () => viewport };
}

test('capturing the actual preview zoom does not reset it; next slider change still applies', () => {
  const { env, updates, getViewport } = fixture();
  applyProfile(env);
  assert.equal(updates.length, 1);
  assert.ok(getViewport()!.barWidth > 0);

  // A real gesture zoom/pan is different from the visual preset's initial view.
  const manual = {
    ...getViewport()!, barWidth: 16.5, rightOffset: 23,
    autoY: false, manualCenter: 210, manualRange: 44,
  };
  env.setVp(manual);
  const saved = captureVisualProfile(env.visualProfile, 540, manual, 88);
  assert.ok(saved.visibleBars < env.visualProfile.visibleBars);
  assert.equal(saved.rightGapBars, env.visualProfile.rightGapBars,
    'capturing a gesture must never silently overwrite the Graph tab right margin');
  const before = updates.length;
  env.visualProfile = saved;
  env.visualProfileCaptureVersion = 1;
  applyProfile(env);
  assert.equal(updates.length, before, 'Save must not overwrite the gesture-adjusted viewport');
  assert.deepEqual(getViewport(), manual);

  // Streaming candles must also not re-apply an unchanged profile.
  applyProfile(env);
  assert.equal(updates.length, before);

  // Deliberately changing a slider does apply the newly selected profile.
  env.visualProfile = { ...saved, visibleBars: saved.visibleBars + 10 };
  applyProfile(env);
  assert.equal(updates.length, before + 1);
});

test('saved visual profiles take precedence over per-coin old ranges and survive TF changes', () => {
  const { env, updates } = fixture();
  env.initialLogicalRange = { from: 4, to: 65 };
  applyProfile(env);
  assert.equal(updates.length, 1, 'old chart range must not block a saved visual profile');
  restorePreviousRange(env);
  assert.equal(updates.length, 1, 'old range must not overwrite user profile');

  const firstWidth = updates[0].barWidth;
  env.tf = '4h';
  applyProfile(env);
  assert.equal(updates.length, 2, 'changing timeframe should reapply user profile');
  assert.equal(updates[1].barWidth, firstWidth);

  env.visualProfile = undefined; // Replay/legacy chart
  restorePreviousRange(env);
  assert.equal(updates.length, 3, 'legacy per-coin ranges remain available without a profile');
});

test('Replay/no-profile still bypasses visual presets entirely', () => {
  const { env, updates } = fixture();
  env.visualProfile = undefined;
  applyProfile(env);
  assert.equal(updates.length, 0);
});

test('144 visible candles, vertical zoom 0.4 and 81-bar gap update the preview immediately', () => {
  const { env, updates, getViewport } = fixture();
  env.visualProfile = {
    visibleBars: 144, verticalZoom: .4, autoPriceScale: true, rightGapBars: 81,
  };
  env.visualProfileKey = 'terminalCompact:mobile';
  env.terminalMode = true;
  env.rightPaddingBars = 81;
  applyProfile(env);
  assert.equal(updates.length, 1);
  const width = env.hookChartPlotWidth(600);
  assert.ok(Math.abs(getViewport()!.barWidth - width / (144 + 81)) < 1e-8);
  assert.equal(Math.round(width / getViewport()!.barWidth - env.rightPaddingBars), 144);
  assert.equal(getViewport()!.rightOffset, 0);
  assert.equal(getViewport()!.yZoom, .4);
  assert.equal(getViewport()!.autoY, true);
  assert.equal(getViewport()!.manualRange, null);

  env.visualProfile = { ...env.visualProfile, rightGapBars: 50 };
  env.rightPaddingBars = 50;
  applyProfile(env);
  assert.equal(updates.length, 2, 'changing the gap must update the preview without a Save click');
  assert.ok(Math.abs(getViewport()!.barWidth - width / (144 + 50)) < 1e-8);

  env.visualProfile = { ...env.visualProfile, visibleBars: 100 };
  applyProfile(env);
  assert.equal(updates.length, 3, 'moving the candle count slider updates width');
  assert.ok(Math.abs(getViewport()!.barWidth - width / (100 + 50)) < 1e-8);

  env.visualProfile = { ...env.visualProfile, autoPriceScale: false };
  applyProfile(env);
  assert.equal(updates.length, 4, 'switching auto price off updates the price range');
  assert.equal(getViewport()!.autoY, false);
  assert.ok(getViewport()!.manualRange > 0);
  assert.equal(getViewport()!.yZoom, .4);

  env.visualProfile = { ...env.visualProfile, verticalZoom: 1.4 };
  applyProfile(env);
  assert.equal(updates.length, 5, 'vertical zoom slider applies immediately');
  assert.equal(getViewport()!.yZoom, 1.4);
  assert.equal(getViewport()!.autoY, false);
});

test('compact read-only preview follows the same saved gap slider without pointer editing', () => {
  const preview = readFileSync(new URL('../src/components/hookchart/HookChartVisualPreview.tsx', import.meta.url), 'utf8');
  const editor = readFileSync(new URL('../src/components/hookchart/OriginalHookChartSettings.tsx', import.meta.url), 'utf8');
  assert.match(preview, /const step = PLOT \/ \(visible \+ rightGap\)/);
  assert.match(preview, /profile\.rightGapBars/);
  assert.match(preview, /data-synthetic-hookchart/);
  assert.match(editor, /profile=\{selectedProfile\}/);
  assert.doesNotMatch(editor, /<HookChartVisualPreview[\s\S]*?onChange=\{onProfileChange\}/);
  for (const key of ['visibleBars', 'verticalZoom', 'autoPriceScale', 'rightGapBars']) {
    assert.match(editor, new RegExp('onProfileChange\\(\\{ ' + key + ':'));
  }
});

test('all seven live HookChart contexts honor expanded saved zoom and gap on phone and desktop', () => {
  for (const context of VISUAL_CONTEXTS) {
    for (const device of ['mobile', 'desktop'] as const) {
      const { env, updates, getViewport } = fixture();
      env.visualProfileKey = makeVisualProfileKey(context.id, device);
      env.visualProfile = { visibleBars: 144, verticalZoom: .02, autoPriceScale: true, rightGapBars: 900 };
      env.rightPaddingBars = 900;
      env.terminalMode = context.id.startsWith('terminal');
      applyProfile(env);
      assert.equal(updates.length, 1, env.visualProfileKey);
      assert.ok(Math.abs(getViewport()!.barWidth - 540 / (144 + 900)) < 1e-8, env.visualProfileKey);
      assert.equal(getViewport()!.autoY, true, env.visualProfileKey);
      assert.equal(getViewport()!.yZoom, .02, env.visualProfileKey);
      assert.equal(getViewport()!.rightOffset, 0, env.visualProfileKey);

      env.visualProfile = { ...env.visualProfile, verticalZoom: 100, autoPriceScale: false };
      applyProfile(env);
      assert.equal(updates.length, 2, env.visualProfileKey);
      assert.equal(getViewport()!.autoY, false, env.visualProfileKey);
      assert.equal(getViewport()!.yZoom, 100, env.visualProfileKey);
      assert.ok(Number.isFinite(getViewport()!.manualRange) && getViewport()!.manualRange > 0, env.visualProfileKey);
    }
  }
});

test('Terminal global auto-scale intentionally overrides manual vertical zoom, but preserves candle count and gap', () => {
  const { env, updates, getViewport } = fixture();
  env.visualProfileKey = 'terminalCompact:mobile';
  env.visualProfile = { visibleBars: 144, verticalZoom: 2, autoPriceScale: false, rightGapBars: 81 };
  env.rightPaddingBars = 81;
  env.terminalMode = true;
  env.terminalAutoScale = true;
  applyProfile(env);
  assert.equal(updates.length, 1);
  assert.equal(getViewport()!.yZoom, 1);
  assert.equal(getViewport()!.autoY, true);
  assert.equal(getViewport()!.manualRange, null);
  assert.ok(Math.abs(getViewport()!.barWidth - 540 / (144 + 81)) < 1e-8);
});

test('Terminal auto-scale ON/OFF restores all saved sliders without clipping candles', () => {
  const { env, updates, getViewport } = fixture();
  env.visualProfileKey = 'terminalCompact:mobile';
  env.terminalMode = true;
  env.visualProfile = { visibleBars: 255, rightGapBars: 48, verticalZoom: 15.85, autoPriceScale: false };
  env.rightPaddingBars = 48;
  env.ref.current.getBoundingClientRect = () => ({ width: 600, height: 380 });
  env.candles = env.candles.map((c: Record<string, number>) => ({
    ...c, o: 0.012, c: 0.011, l: 0.0093, h: 0.0197,
  }));

  env.terminalAutoScale = true;
  applyProfile(env);
  assert.equal(getViewport()!.autoY, true);
  assert.equal(getViewport()!.manualRange, null);

  env.terminalAutoScale = false;
  applyProfile(env);
  assert.equal(updates.length, 2, 'turning auto-fit OFF must actively restore saved settings');
  const restored = getViewport()!;
  assert.equal(restored.autoY, false);
  assert.equal(restored.fitAll, false);
  assert.equal(restored.rightOffset, 0);
  assert.equal(restored.yZoom, 15.85, 'stored zoom value must stay unmodified');
  assert.ok(Math.abs(restored.barWidth - 540 / (255 + 48)) < 1e-8);
  assert.ok(restored.manualRange >= 0.0197 - 0.0093,
    'all visible candles must fit vertically despite the requested 15.85x zoom');
  assert.ok(restored.manualCenter - restored.manualRange / 2 < 0.0093);
  assert.ok(restored.manualCenter + restored.manualRange / 2 > 0.0197);

  env.terminalAutoScale = true;
  applyProfile(env);
  assert.equal(updates.length, 3);
  assert.equal(getViewport()!.autoY, true);
  assert.equal(getViewport()!.manualRange, null);
  assert.equal(env.visualProfile.visibleBars, 255);
  assert.equal(env.visualProfile.rightGapBars, 48);
  assert.equal(env.visualProfile.verticalZoom, 15.85);
});

test('live HookChart applies a saved profile when a hidden canvas becomes visible and after resize', () => {
  const { env, updates, getViewport } = fixture();
  env.visualCanvasWidth = 0;
  env.visualProfile = {
    visibleBars: 144, verticalZoom: 2, autoPriceScale: false, rightGapBars: 81,
  };
  env.rightPaddingBars = 81;
  let width = 0;
  let notify: () => void = () => {};
  let observerDisconnected = false;
  env.ref.current.getBoundingClientRect = () => ({ width });
  env.ResizeObserver = class {
    constructor(callback: () => void) { notify = callback; }
    observe() {}
    disconnect() { observerDisconnected = true; }
  };
  env.setVisualCanvasWidth = (update: (current: number) => number) => {
    env.visualCanvasWidth = update(env.visualCanvasWidth);
  };
  const stop = trackCanvasWidth(env);
  applyProfile(env);
  assert.equal(updates.length, 0, 'zero-width hidden charts cannot apply a visual profile');
  width = 600;
  notify();
  assert.equal(env.visualCanvasWidth, 600);
  applyProfile(env);
  assert.equal(updates.length, 1, 'saved profile applies after the canvas becomes measurable');
  assert.equal(getViewport()!.autoY, false);
  assert.equal(getViewport()!.yZoom, 2);
  assert.ok(Math.abs(getViewport()!.barWidth - 540 / (144 + 81)) < 1e-8);

  width = 810;
  notify();
  assert.equal(env.visualCanvasWidth, 810);
  applyProfile(env);
  assert.equal(updates.length, 2, 'resizing a Terminal card or fullscreen panel updates the bar width');
  assert.ok(Math.abs(getViewport()!.barWidth - 750 / (144 + 81)) < 1e-8);
  notify();
  applyProfile(env);
  assert.equal(updates.length, 2, 'unchanged canvas width must not reapply the same profile');

  // The actual ResizeObserver hook provides a cleanup in React; the extracted
  // runner intentionally executes only the effect callback body here.
  assert.equal(observerDisconnected, false);
});
 
test('manually fitted history survives chart resize but not a saved preset change', () => {
  const { env, updates } = fixture();
  applyProfile(env);
  assert.equal(updates.length,1);
  const previousSignature=env.visualAppliedRef.current;
  env.fitAllScopeRef.current=env.fitAllScopeKey;
  env.ref.current={ getBoundingClientRect: () => ({ width: 820 }) };
  applyProfile(env);
  assert.equal(updates.length,1,'resizing must preserve an explicit fit-all view');
  assert.notEqual(env.visualAppliedRef.current,previousSignature);
  env.visualProfile={...env.visualProfile,visibleBars:env.visualProfile.visibleBars+12};
  applyProfile(env);
  assert.equal(updates.length,2,'changing a profile setting should take precedence over a prior fit');
  assert.equal(env.fitAllScopeRef.current,null);
});

test('Terminal timeframe waits for historical candles before finalizing manual zoom', () => {
  const { env, updates, getViewport } = fixture();
  env.terminalMode = true;
  env.visualProfileKey = 'terminalCompact:desktop';
  env.visualProfile = { visibleBars: 70, verticalZoom: 3, autoPriceScale: false, rightGapBars: 7 };
  env.candles = [{ t: 1700000000000, o: 101, h: 103, l: 99, c: 102 }];
  env.terminalHistoryPhase = terminalViewportHistoryPhase('15m', env.candles.length, true, false);
  applyProfile(env);
  const seedRange = getViewport()!.manualRange;
  assert.equal(updates.length, 1);

  // Real 15m history reveals an earlier 150-unit wick, missing in the seed.
  env.candles = Array.from({length: 180}, (_, i) => ({
    t: 1700000000000 + i * 900000, o: 100, h: i === 150 ? 250 : 105,
    l: i === 149 ? 50 : 95, c: 102,
  }));
  env.terminalHistoryPhase = terminalViewportHistoryPhase('15m', env.candles.length, true, true);
  applyProfile(env);
  assert.equal(updates.length, 2, 'a full history batch should refit manual zoom exactly once');
  assert.ok(getViewport()!.manualRange > seedRange * 10, 'historical wicks must be visible');
  const fullRange = getViewport()!.manualRange;
  env.candles.push({ t: 1700000000000 + 180 * 900000, o: 102, h: 103, l: 101, c: 102 });
  applyProfile(env);
  assert.equal(updates.length, 2, 'each later live candle must not reset the zoom');
  assert.equal(getViewport()!.manualRange, fullRange);
});

test('late Terminal history does not overwrite manual pan/zoom or fit-all', () => {
  for (const navigate of ['gesture','fitAll'] as const) {
    const { env, updates } = fixture();
    env.terminalMode = true;
    env.visualProfileKey = 'terminalCompact:desktop';
    env.visualProfile = { visibleBars: 70, verticalZoom: 3, autoPriceScale: false, rightGapBars: 7 };
    env.candles = [{ t: 1700000000000, o: 101, h: 103, l: 99, c: 102 }];
    env.terminalHistoryPhase = 'seed';
    applyProfile(env);
    if (navigate === 'gesture') env.viewportAdjustedByUserRef.current = true;
    else env.fitAllScopeRef.current = env.fitAllScopeKey;
    env.candles = Array.from({length:180}, (_, i) => ({
      t: 1700000000000 + i * 900000, o: 101, h: 250, l: 50, c: 102,
    }));
    env.terminalHistoryPhase = 'ready';
    applyProfile(env);
    assert.equal(updates.length, 1, navigate + ' must preserve the viewport');
  }
});

test('short-lived symbols still refit on a two-bar REST history',()=>{
  const { env, updates, getViewport }=fixture();
  env.terminalMode=true;
  env.visualProfileKey='terminalCompact:desktop';
  env.visualProfile={visibleBars:70,verticalZoom:2.5,autoPriceScale:false,rightGapBars:7};
  env.candles=[{t:1700000000000,o:100,h:101,l:99,c:100}];
  env.terminalHistoryPhase=terminalViewportHistoryPhase('5m',1,true,false);
  applyProfile(env);
  const originalRange=getViewport()!.manualRange;
  env.candles=[{t:1699999700000,o:100,h:160,l:90,c:100},{t:1700000000000,o:100,h:101,l:99,c:100}];
  env.terminalHistoryPhase=terminalViewportHistoryPhase('5m',2,true,true);
  applyProfile(env);
  assert.equal(updates.length,2);
  assert.ok(getViewport()!.manualRange>originalRange*5);
  applyProfile(env);
  assert.equal(updates.length,2);
});
