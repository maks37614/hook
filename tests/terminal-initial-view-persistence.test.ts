import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTerminalWorkspaceBackup } from '../src/utils/useTerminalWorkspace';
import { terminalStorageKey } from '../src/utils/terminalPresets';
import { getVisualProfile } from '../src/components/hookchart/visualProfiles';
import { TERMINAL_FIT_HISTORY_PROFILE } from '../src/components/terminal/terminalInitialViewApply';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const baseConfig = {
  layoutPreset: 'custom', columns: 2, autoFitScreen: true, showClock: true,
  showFormations: true, blockHeight: 'medium', blocks: [],
};

const restoreConfig = (config: Record<string, unknown>) => parseTerminalWorkspaceBackup(
  JSON.stringify({ blocks: [], presets: [], config: { ...baseConfig, ...config } }),
).config;

test('Terminal fit-all view survives JSON backup restoration with user-specific flag', () => {
  const restored = restoreConfig({
    initialChartView: TERMINAL_FIT_HISTORY_PROFILE,
    initialChartFitAll: true,
  });
  assert.equal(restored.initialChartFitAll, true);
  assert.deepEqual(restored.initialChartView, TERMINAL_FIT_HISTORY_PROFILE);
});

test('user can disable fit-all and repeatedly replace all four initial chart settings', () => {
  const first = restoreConfig({
    initialChartView: { visibleBars: 255, rightGapBars: 48, verticalZoom: 1.8, autoPriceScale: false },
    initialChartFitAll: false,
  });
  assert.equal(first.initialChartFitAll, false);
  assert.deepEqual(first.initialChartView, {
    visibleBars: 255, rightGapBars: 48, verticalZoom: 1.8, autoPriceScale: false,
  });
  const updated = restoreConfig({
    ...first, initialChartView: { visibleBars: 90, rightGapBars: 13, verticalZoom: 0.75, autoPriceScale: true },
  });
  assert.equal(updated.initialChartFitAll, false);
  assert.deepEqual(updated.initialChartView, {
    visibleBars: 90, rightGapBars: 13, verticalZoom: 0.75, autoPriceScale: true,
  });
  assert.deepEqual(getVisualProfile(undefined, 'terminalMedium', 'desktop'), {
    visibleBars: 70, rightGapBars: 7, verticalZoom: 1, autoPriceScale: true,
  });
});

test('Apply initial view restores all four built-in defaults, previewed until Done', () => {
  const drawer = read('src/components/terminal/TerminalSettingsDrawer.tsx');
  assert.match(drawer, /const applyDefaultInitialView = \(\) => \{/);
  assert.match(drawer, /const defaults = getVisualProfile\(undefined, 'terminalMedium', 'desktop'\)/);
  assert.match(drawer, /setInitial\(defaults\)/);
  assert.match(drawer, /setInitialFitAll\(false\)/);
  assert.match(drawer, /applyTerminalInitialViewNow\(defaults\)/);
  assert.match(drawer, /onClick=\{applyDefaultInitialView\}/);
  assert.match(drawer, /onPreviewInitialDefaults\?\.\(\)/);
  assert.match(read('src/components/TerminalPage.tsx'), /onPreviewInitialDefaults=\{\(\) => setTerminalFitAllRequest\(0\)\}/);
  assert.match(drawer, /setInitialDirty\(true\)/);
  assert.match(drawer, /if \(initialDirty\) \{/);
  assert.deepEqual(getVisualProfile(undefined, 'terminalMedium', 'desktop'), {
    visibleBars: 70, rightGapBars: 7, verticalZoom: 1, autoPriceScale: true,
  });
});

test('Terminal additional display switches are account-specific and included in backup', () => {
  const page = read('src/components/TerminalPage.tsx');
  const hook = read('src/utils/useTerminalWorkspace.ts');
  const config = restoreConfig({
    autoScaleCharts: true, terminalEcoMode: true,
    presetAutoUpdate: false, terminalRefreshMs: 500,
  });
  assert.equal(config.autoScaleCharts, true);
  assert.equal(config.terminalEcoMode, true);
  assert.equal(config.presetAutoUpdate, false);
  assert.equal(config.terminalRefreshMs, 500);
  for (const key of ['autoScaleCharts', 'terminalEcoMode', 'presetAutoUpdate', 'terminalRefreshMs'])
    assert.match(page, new RegExp('config\\.' + key));
  assert.match(hook, /auth\.updateTerminalWorkspace\(\{/);
  assert.doesNotMatch(page, /localStorage\.setItem\('terminal_auto_scale_charts'/);
  assert.doesNotMatch(page, /localStorage\.setItem\('terminal_eco_mode'/);
});

test('storage keys isolate each account from other accounts and guest settings', () => {
  const key = 'crypto_screener_terminal_config';
  assert.notEqual(terminalStorageKey(key, 'alice'), terminalStorageKey(key, 'bob'));
  assert.notEqual(terminalStorageKey(key, 'alice'), terminalStorageKey(key));
  assert.equal(terminalStorageKey(key, 'alice'), key + '_alice');
  assert.equal(terminalStorageKey(key), key + '_guest');
});

test('Done commits custom settings, cancels old fit-all and triggers immediate profile save', () => {
  const drawer = read('src/components/terminal/TerminalSettingsDrawer.tsx');
  const page = read('src/components/TerminalPage.tsx');
  const hook = read('src/utils/useTerminalWorkspace.ts');
  const engine = read('src/components/hookchart/engine.tsx');

  for (const field of ['visibleBars', 'rightGapBars', 'verticalZoom', 'autoPriceScale'])
    assert.match(drawer, new RegExp('updateInitial\\(\\{\\s*' + field + ':'));
  assert.match(drawer, /setInitialFitAll\(false\);\s*setInitialResetToDefault\(false\);\s*setInitialDirty\(true\)/);
  assert.match(drawer, /const saveAndClose = \(\) => \{[\s\S]*?initialChartFitAll: initialFitAll/);
  assert.match(drawer, /if \(!initialFitAll && !initialResetToDefault\)\s*applyTerminalInitialViewNow\(initial\)/);
  assert.match(drawer, /onClick=\{saveAndClose\}/);
  assert.match(page, /if \(updated\.initialChartFitAll === false\) setTerminalFitAllRequest\(0\)/);
  assert.match(page, /requestImmediateWorkspaceSync\(\)/);
  assert.match(engine, /if\(!terminalFitAllRequest\)\{\s*lastTerminalFitAllRequestRef\.current=null;/);
  assert.match(hook, /localStorage\.setItem\(terminalStorageKey\(CONFIG_KEY, uid\), JSON\.stringify\(workspace\.config\)\)/);
  assert.match(hook, /immediate \? 0 : 1200/);
});

test('logged-in settings are sent to profile with revision protection; old profile cannot overwrite local edits', () => {
  const hook = read('src/utils/useTerminalWorkspace.ts');
  const backend = read('server/pgIdentity.ts');
  assert.match(hook, /auth\.updateTerminalWorkspace\(\{/);
  assert.match(hook, /columns: config\.columns, blockHeight: config\.blockHeight, config,/);
  assert.match(hook, /serverVersion\.current/);
  assert.match(hook, /syncConflictRef\.current/);
  assert.match(hook, /if \(\(revision\.current > 0 \|\| lastCommittedWorkspace\.current !== workspace\)/);
  assert.match(hook, /if \(revision\.current === 0\)/);
  assert.match(backend, /COALESCE\(profile -> 'terminalSettings' ->> 'version', ''\) = \$3/);
  assert.match(backend, /new AuthFailure\(409,[\s\S]*?'TERMINAL_WORKSPACE_CONFLICT'\)/);
});


test('closing the drawer without Done discards the preview and restores the saved fit mode', () => {
  const drawer = read('src/components/terminal/TerminalSettingsDrawer.tsx');
  const page = read('src/components/TerminalPage.tsx');
  assert.match(drawer, /const \[hasUncommittedPreview, setHasUncommittedPreview\]/);
  assert.match(drawer, /setHasUncommittedPreview\(true\)/);
  assert.match(drawer, /const discardAndClose = \(\) => \{[\s\S]*?if \(hasUncommittedPreview\) \{/);
  assert.match(drawer, /discardTerminalInitialViewPreview\(\)/);
  const canvas = read('src/components/hookchart/HookChartCanvas.tsx');
  assert.match(canvas, /if \(detail\?\.reset\) \{\s*setAppliedTerminalInitialView\(null\)/);
  assert.match(drawer, /onRestoreInitialFit\?\.\(\)/);
  assert.match(drawer, /onClick=\{discardAndClose\}/);
  assert.match(drawer, /onClick=\{saveAndClose\}/);
  assert.match(page, /onRestoreInitialFit=\{\(\) => setTerminalFitAllRequest\(version =>\s*config\.initialChartFitAll === true \? version \+ 1 : 0\)\}/);
});
