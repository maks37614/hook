import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TerminalSettingsDrawer } from '../src/components/terminal/TerminalSettingsDrawer';
import { getVisualProfile, normalizeVisualProfile } from '../src/components/hookchart/visualProfiles';
import type { TerminalWorkspaceConfig } from '../src/types';
import { applyTerminalInitialViewNow, TERMINAL_INITIAL_VIEW_APPLY_EVENT } from '../src/components/terminal/terminalInitialViewApply';

const source = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const defaultConfig: TerminalWorkspaceConfig = {
  layoutPreset: 'custom', columns: 2, autoFitScreen: true,
  blocks: [], showFormations: true, blockHeight: 'medium',
};

const drawer = (config: TerminalWorkspaceConfig) => renderToStaticMarkup(
  React.createElement(TerminalSettingsDrawer, {
    isOpen: true,
    onClose: () => {},
    config,
    coinSelection: { exchange: 'all', marketType: 'all' },
    coinLimit: 12,
    onUpdateConfig: () => {},
    onApplyGlobalTimeframe: () => {},
    onApplyPreset: () => {},
    onResetWorkspace: () => {},
    totalBlocks: 3,
  }),
);

test('terminal settings show starting chart view controls independently of global layout settings', () => {
  const html = drawer(defaultConfig);
  assert.match(html, /Початковий показ графіків/);
  for (const name of [
    'Початкова кількість свічок Термінала',
    'Початковий відступ Термінала в барах',
    'Початковий вертикальний масштаб Термінала',
    'Початковий автоматичний масштаб ціни Термінала',
    'Відновити типовий показ графіків',
  ]) assert.ok(html.includes(name), name);
  assert.match(html, /Масштаб і відступ під час відкриття/);
  assert.match(html, /Застосувати початковий вигляд/);
  const settings = source('../src/components/terminal/TerminalSettingsDrawer.tsx');
  assert.match(settings, /setInitial\(previous => \(\{ \.\.\.previous, \.\.\.patch \}\)\)/);
  assert.match(settings, /onClick=\{\(\) => \{[\s\S]*?setInitial\(TERMINAL_FIT_HISTORY_PROFILE\);/);
  // Applying a view may first mark it as an unsaved preview; do not lose
  // the shared apply event or its accessibility confirmation.
  assert.match(settings, /applyTerminalInitialViewNow\(TERMINAL_FIT_HISTORY_PROFILE\);\s*(?:setHasUncommittedPreview\(true\);\s*)?setInitialApplied\(true\);/);
  assert.match(settings, /onClick=\{saveAndClose\}/);
  assert.match(settings, /touch-manipulation/);
  assert.match(settings, /role="status" aria-live="polite"/);
});

test('Apply transmits the chosen viewport to every mounted Terminal chart on each click', () => {
  const target = new EventTarget();
  // Model a 12-chart Terminal: every mounted chart is an independent listener.
  // The button must reset every chart on every press, even with unchanged sliders.
  const received = Array.from({ length: 12 }, () => [] as unknown[]);
  for (const perChart of received) {
    target.addEventListener(TERMINAL_INITIAL_VIEW_APPLY_EVENT, (event) =>
      perChart.push((event as CustomEvent).detail?.view));
  }

  const requested = { visibleBars: 255, rightGapBars: 48, verticalZoom: 0.76, autoPriceScale: true };
  applyTerminalInitialViewNow(requested, target);
  applyTerminalInitialViewNow(requested, target);
  for (const perChart of received) assert.deepEqual(perChart, [requested, requested],
    'all 12 charts receive the chosen values on repeated presses');

  const chart = source('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(chart, /if \(!terminalInitialViewTarget \|\| typeof window === 'undefined'\) return;/);
  assert.match(chart, /terminalMode \|\| visualContext === 'terminalLarge'/);
  assert.match(chart, /window\.addEventListener\(TERMINAL_INITIAL_VIEW_APPLY_EVENT, onApply\)/);
  assert.match(chart, /setAppliedTerminalInitialView\(current => \(\{/);
  assert.match(chart, /const selectedTerminalInitialView = appliedTerminalInitialView\?\.view \?\? terminalInitialView/);
  assert.match(chart, /normalizeVisualProfile\(selectedTerminalInitialView, activeVisualContext\)/);
  assert.ok(chart.includes('visualProfileKey={replay ? undefined : terminalInitialViewTarget'));
  assert.ok(chart.includes('${activeVisualKey}:apply-${appliedTerminalInitialView?.version ?? 0}'));
  assert.doesNotMatch(chart, /key=\{appliedTerminalInitialView\}/,
    'do not remount charts or subscribe again to WebSocket');

  const engine = source('../src/components/hookchart/engine.tsx');
  assert.match(engine, /visualProfileKey,visualProfile\.visibleBars/);
  assert.match(engine, /if\(visualAppliedRef\.current===signature\)return;/);
  assert.match(engine, /candleFit:priceAuto && \(terminalMode \|\| visualProfileKey\.startsWith\('terminal'\)\)/);
  assert.match(engine, /terminalCandlePriceRange\(lo,hi,plotH,showVolumes\)/);
  assert.match(engine, /const range=!terminalAutoScale&&vp\.autoY&&vp\.candleFit/);
  assert.match(engine, /terminalSafeVerticalZoomRange\(fitted,lo,hi,plotH,showVolumes,vp\.yZoom\?\?1\)/);

  const translations = source('../src/locales/terminalSettingsDrawer20261115.ts');
  assert.match(translations, /"initialApplied",\s*"Усі графіки підігнано під завантажену історію\.[^"]*Готово[^"]*",\s*"All Terminal charts fitted to loaded history\.[^"]*Done[^"]*",\s*"Все графики подогнаны под загруженную историю\.[^"]*Готово[^"]*",\s*"Wszystkie wykresy dopasowano do wczytanej historii\.[^"]*Gotowe[^"]*"/);
});

test('later resetting saved Terminal initial view clears the temporary applied viewport', () => {
  const chart = source('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(chart, /if \(!current \|\| !terminalInitialView\) return null;/);
  assert.match(chart, /view\.visibleBars === saved\.visibleBars/);
  assert.match(chart, /view\.rightGapBars === saved\.rightGapBars/);
  assert.match(chart, /view\.verticalZoom === saved\.verticalZoom/);
  assert.match(chart, /view\.autoPriceScale === saved\.autoPriceScale/);
});

test('saved terminal values appear in the terminal drawer and invalid values are clamped', () => {
  const base = getVisualProfile(undefined, 'terminalMedium', 'desktop');
  const custom = { ...base, visibleBars: 205, rightGapBars: 31, verticalZoom: 1.8, autoPriceScale: false };
  const html = drawer({ ...defaultConfig, initialChartView: custom });
  assert.match(html, /205/);
  assert.match(html, /Барів:\s*31/);
  assert.match(html, /1\.80/);
  const normalized = normalizeVisualProfile({
    ...custom, visibleBars: 10_000, rightGapBars: -99, verticalZoom: Infinity,
  }, 'terminalMedium');
  assert.equal(normalized.visibleBars, 500);
  assert.equal(normalized.rightGapBars, 0);
  assert.ok(Number.isFinite(normalized.verticalZoom));
});

test('initial terminal view is stored in existing profile workspace, not a new global preference', () => {
  const types = source('../src/types.ts');
  const hook = source('../src/utils/useTerminalWorkspace.ts');
  const page = source('../src/components/TerminalPage.tsx');
  assert.match(types, /initialChartView\?: VisualChartProfile/);
  assert.match(hook, /config\.initialChartView = normalizeVisualProfile\(config\.initialChartView, 'terminalMedium'\)/);
  assert.match(hook, /auth\.updateTerminalWorkspace\(\{/);
  assert.match(page, /terminalInitialView=\{config\.initialChartView\}/);
  assert.match(page, /<TerminalSettingsDrawer/);
});

test('terminal chart initial view is passed only through terminal widgets to HookChart, never Replay', () => {
  const page = source('../src/components/TerminalPage.tsx');
  const widget = source('../src/components/terminal/TerminalChartWidget.tsx');
  const wrapper = source('../src/components/ExchangeCandlestickChart.tsx');
  const chart = source('../src/components/TradingViewChart.tsx');
  const canvas = source('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(widget, /terminalInitialView=\{useIntegratedHookChartToolbar \? terminalInitialView : undefined\}/);
  assert.match(wrapper, /terminalInitialView=\{terminalInitialView\}/);
  assert.match(chart, /terminalInitialView=\{terminalInitialView\}/);
  assert.match(canvas, /terminalInitialViewTarget && selectedTerminalInitialView/);
  assert.match(canvas, /normalizeVisualProfile\(selectedTerminalInitialView, activeVisualContext\)/);
  assert.match(canvas, /activeVisualProfile\?\.rightGapBars/);
  assert.match(page, /<TerminalGridItem/);
  assert.match(widget, /terminalMode=\{useIntegratedHookChartToolbar\}/);
  assert.doesNotMatch(source('../src/components/replay/ReplayChart.tsx'), /terminalInitialView/);
  assert.doesNotMatch(source('../src/components/ScreenerTable.tsx'), /terminalInitialView/);
});

test('single-chart Terminal keeps the saved per-block timeframe and uses the normal chart tile', () => {
  const page = source('../src/components/TerminalPage.tsx');
  const widget = source('../src/components/terminal/TerminalChartWidget.tsx');
  assert.match(page, /const activeTimeframe = blocks\.length === 1 \? blocks\[0\]\.timeframe : timeframe/);
  assert.match(page, /activeTimeframe === tf/);
  assert.match(page, /<TerminalGridItem/);
  assert.match(page, /block=\{block\}/);
  assert.match(widget, /timeframe=\{block\.timeframe\}/);
  assert.match(widget, /onTimeframeChange=\{useIntegratedHookChartToolbar/);
  assert.doesNotMatch(page, /visualContext="terminalLarge"/);
});

test('maximizing one Terminal chart suspends other visible charts without changing their settings', () => {
  const page = source('../src/components/TerminalPage.tsx');
  const widget = source('../src/components/terminal/TerminalChartWidget.tsx');
  assert.match(page, /isSuspended=\{maximizedBlockId !== null && !isMaximized\}/);
  assert.match(widget, /const shouldLoadWidgets = !isSuspended && \(isSingleBlock \|\| isOnlyChart \|\| isMaximized \|\| isNearViewport\)/);
  assert.doesNotMatch(widget, /new WebSocket\(/, 'HookChart already owns its quote stream');
  assert.match(widget, /onLivePriceUpdate=\{useIntegratedHookChartToolbar \? handleChartPrice : undefined\}/);
  assert.match(widget, /\{shouldLoadWidgets \? \(/);
});

test('Terminal coin changes clear pending prices from a prior instrument', () => {
  const widget = source('../src/components/terminal/TerminalChartWidget.tsx');
  assert.match(widget, /previousInstrumentRef\.current === instrumentKey/);
  assert.match(widget, /activeInstrumentRef\.current !== instrumentKey/);
  assert.match(widget, /clearTimeout\(headerPriceTimerRef\.current\)/);
  assert.match(widget, /pendingHeaderPriceRef\.current = null/);
  assert.match(widget, /setCurrentPrice\(nextPrice\)/);
  assert.match(widget, /setLivePrice\(nextPrice \?\? 0\)/);
});

test('Terminal removes the separate 24h quote strip but keeps unique chart ids and indexed lookups', () => {
  const page = source('../src/components/TerminalPage.tsx');
  assert.doesNotMatch(page, /terminal\.market\.(volume24h|high24h|low24h|quotes)/);
  assert.doesNotMatch(page, /quotesAvailable/);
  assert.doesNotMatch(page, />WLive</);
  assert.match(page, /Math\.random\(\)\.toString\(36\)\.slice\(2, 10\)/);
  assert.match(page, /const coinsByMarket = useMemo\(\(\) => \{/);
  assert.match(page, /coinsByMarket\.get\(coinMarketKey\(block\)\)/);
});

test('Terminal does not poll market quotes while hidden and refreshes safely on return', () => {
  const page = source('../src/components/TerminalPage.tsx');
  assert.match(page, /document\.visibilityState === 'hidden'/);
  assert.match(page, /document\.visibilityState === 'visible'/);
  assert.match(page, /const minGap = force \? 10_000 : marketRefreshDemandRef\.current \? 25_000 : 55_000/);
  assert.match(page, /now - lastRequestAt < minGap/);
  assert.match(page, /document\.addEventListener\('visibilitychange', onVisibilityChange\)/);
  assert.match(page, /document\.removeEventListener\('visibilitychange', onVisibilityChange\)/);
  assert.match(page, /controller\.abort\(\)/);
});

test('Terminal header actions cannot target the wrong symbol in multi-chart mode', () => {
  const page = source('../src/components/TerminalPage.tsx');
  const widget = source('../src/components/terminal/TerminalChartWidget.tsx');
  assert.match(page, /const hasHeaderTarget = blocks\.length === 1 && coinMarketKey\(activeCoin\) === coinMarketKey\(blocks\[0\]\)/);
  // The header's Telegram shortcut was replaced by workspace alerts.
  // Per-chart Telegram actions remain scoped to the exact instrument.
  assert.doesNotMatch(page, /onOpenTelegramAlerts && hasHeaderTarget/);
  assert.match(page, /aria-pressed=\{terminalAlertsEnabled\}/);
  assert.match(page, /onSendMetaScalp && hasHeaderTarget/);
  assert.match(widget, /onSendMetaScalp\(coin\)/);
  assert.match(widget, /onOpenTelegramAlerts\(\{/);
});

test('closed per-chart coin switchers do not rescan the entire Terminal market', () => {
  const widget = source('../src/components/terminal/TerminalChartWidget.tsx');
  assert.match(widget, /const filteredCoins = useMemo\(\(\) => \{\s*if \(!isCoinPickerOpen\) return \[\];/);
  assert.match(widget, /const available = getAllCoins\?\.\(\) \?\? allCoins \?\? \[\]/);
  assert.match(widget, /\}, \[allCoins, getAllCoins, coinSearch, isCoinPickerOpen(?:, coinListVersion)?\]\)/);
});

test('1x–4x Terminal layout buttons never remove, replace or reorder existing chart blocks', () => {
  const page = source('../src/components/TerminalPage.tsx');
  const start = page.indexOf('title="1 колонка (зберегти всі графіки)"');
  const sectionStart = page.lastIndexOf('<button', start);
  const end = page.indexOf('{/* Timeframe Selector */}', start);
  assert.ok(sectionStart >= 0 && end > sectionStart, 'layout controls must exist');
  const layout = page.slice(sectionStart, end);
  assert.doesNotMatch(layout, /setBlocks\(/, 'column selectors must not discard chart blocks');
  assert.doesNotMatch(layout, /handleApplyPreset\(/, 'column selectors must not replace selected coins');
  for (const columns of [1, 2, 3, 4]) {
    assert.match(layout, new RegExp('columns: ' + columns + ', freeLayoutAutoColumns: false, autoFitScreen: true'));
  }
  assert.match(layout, /config\.columns === 1/);
});

test('Terminal preserves actual quote timestamp instead of claiming every refreshed card is fresh', () => {
  const page = source('../src/components/TerminalPage.tsx');
  assert.match(page, /timeframe: preferences\.defaultTimeframe, lastUpdated: marketSnapshot\.timestamp \?\? 0/);
  assert.match(page, /\[marketCoins, marketSnapshot\.timestamp, formationCoins, preferences\.defaultTimeframe\]/);
});

test('favorite click is visible in multi-chart mode and never wipes existing charts', () => {
  const page = source('../src/components/TerminalPage.tsx');
  const start = page.indexOf('const handleSelectFavoriteCoin =');
  const end = page.indexOf('// Block management', start);
  assert.ok(start >= 0 && end > start);
  const handler = page.slice(start, end);
  assert.match(handler, /setIsFavoritesDrawerOpen\(false\)/);
  assert.match(handler, /if \(blocks\.length === 1\)/);
  assert.match(handler, /setBlocks\(previous => previous\.map\(block => \(\{/);
  assert.match(handler, /\.\.\.block, symbol: favCoin\.symbol/);
  assert.match(handler, /const alreadyOpen = blocks\.find\(block => coinMarketKey\(block\) === coinMarketKey\(favCoin\)\)/);
  assert.match(handler, /setMaximizedBlockId\(alreadyOpen\.id\)/);
  assert.match(handler, /if \(blocks\.length >= MAX_TERMINAL_CHARTS\)/);
  assert.match(handler, /setBlocks\(previous => previous\.length >= MAX_TERMINAL_CHARTS \? previous : \[\.\.\.previous, nextBlock\]\)/);
  assert.doesNotMatch(handler, /setBlocks\(\[/, 'favorite selection must not discard the grid');
  assert.match(page, /blocks\.some\(block => coinMarketKey\(block\) === coinMarketKey\(favCoin\)\)/);
});

test('Terminal favorites preserve exact saved exchange and market without picking a different ticker', () => {
  const page = source('../src/components/TerminalPage.tsx');
  const start = page.indexOf('// Use exact saved exchange + market identities');
  const end = page.indexOf('const filteredFavorites =', start);
  assert.ok(start >= 0 && end > start);
  const resolver = page.slice(start, end);
  assert.match(resolver, /resolveWatchlistEntries\(localWatchlist, coins\)/);
  assert.match(resolver, /entry\.coin \?\? watchlistEntryToChartCoin\(entry, timeframe\)/);
  assert.doesNotMatch(resolver, /const bySymbol = new Map/);
  assert.match(page, /handleRemoveFromWatchlist\(getCoinWatchlistKey\(favCoin\), e\)/);
});

test('legacy workspaces with over 50 charts paginate without discarding saved charts', () => {
  const page = source('../src/components/TerminalPage.tsx');
  assert.match(page, /const visibleWorkspaceBlocks = useMemo\(\(\) => blocks\.slice\(/);
  assert.match(page, /visibleWorkspaceStart \+ workspacePageSize/);
  assert.match(page, /\{visibleWorkspaceBlocks\.map\(\(block, index\) => \{/);
  assert.match(page, /index=\{visibleWorkspaceStart \+ index\}/);
  assert.match(page, /onDragStart=\{handleDragStart\}/);
  const grid = source('../src/components/terminal/TerminalGridItem.tsx');
  assert.match(grid, /onDragStart\(index\)/);
  assert.match(page, /onDrop=\{handleDrop\}/);
  assert.match(grid, /onDrop\(index\)/);
  assert.match(page, /aria-label=\{t\('terminal\.page\.pageNavigation'\)\}/);
  assert.match(page, /setWorkspacePage\(Math\.floor\(blockIndex \/ workspacePageSize\)\)/);
  assert.match(page, /const terminalBelowCharts = \(/);
  assert.match(page, /disabled=\{blocks\.length >= MAX_TERMINAL_CHARTS\}/);
  const gridStart = page.indexOf('ref={chartListRef} className="w-full h-full');
  const gridEnd = page.indexOf('{/* Add Chart Modal */}', gridStart);
  assert.ok(gridStart >= 0 && gridEnd > gridStart);
  assert.doesNotMatch(page.slice(gridStart, gridEnd), /\{blocks\.map\(/);
});

test('terminal profile sync rejects cross-device changes and keeps a recoverable local backup', () => {
  const hook = source('../src/utils/useTerminalWorkspace.ts');
  const panel = source('../src/components/terminal/TerminalPresetPanel.tsx');
  const auth = source('../src/context/AuthContext.tsx');
  const backend = source('../server/pgIdentity.ts');
  assert.match(hook, /auth\.updateTerminalWorkspace\(\{/);
  assert.match(hook, /serverVersion\.current/);
  assert.match(hook, /error\.code === 'TERMINAL_WORKSPACE_CONFLICT'/);
  assert.match(hook, /syncConflictRef\.current/);
  assert.match(hook, /onDownloadLocalBackup|downloadLocalBackup/);
  assert.match(panel, /syncConflict \? 'terminal\.drawer\.syncPresetConflict'/);
  assert.match(panel, /terminal\.drawer\.syncDownload/);
  assert.match(auth, /updateTerminalWorkspace: \(/);
  assert.match(backend, /COALESCE\(profile -> 'terminalSettings' ->> 'version', ''\) = \$3/);
  assert.match(backend, /new AuthFailure\(409, .*'TERMINAL_WORKSPACE_CONFLICT'\)/);
});

test('old Terminal workspaces stay readable and the server issues new revision tokens', () => {
  const preset = source('../src/utils/useTerminalWorkspace.ts');
  const types = source('../src/types.ts');
  const backend = source('../server/pgIdentity.ts');
  assert.match(preset, /normalizeTerminalBlocks\(settings\.blocks\)/);
  assert.match(types, /interface TerminalWorkspaceSettings \{[\s\S]*?version\?: string;/);
  assert.match(backend, /patch\.terminalSettings = \{ \.\.\.safeWorkspace, version: randomUUID\(\) \}/);
});

test('Terminal always chooses native HookChart, never legacy TradingView even on old accounts', () => {
  const page = source('../src/components/TerminalPage.tsx');
  const widget = source('../src/components/terminal/TerminalChartWidget.tsx');
  const wrapper = source('../src/components/ExchangeCandlestickChart.tsx');
  assert.match(page, /const chartProvider = normalizeChartProvider\('hookchart'\)/);
  assert.match(widget, /const chartProvider = normalizeChartProvider\('hookchart'\)/);
  assert.match(page, /<TerminalGridItem/);
  assert.match(widget, /<ExchangeCandlestickChart\s+forceHookChart/);
  assert.match(wrapper, /forceHookChart=\{forceHookChart\}/);
  assert.doesNotMatch(page, /tradingViewUrl|getTradingViewSymbol|s\.tradingview\.com|<iframe/);
  assert.doesNotMatch(page, /setIframeLoading|handleToggleDrawingToolbar/);
  assert.doesNotMatch(widget, /<iframe|tradingViewUrl|getTradingViewSymbol|s\.tradingview\.com/);
  assert.doesNotMatch(widget, /fetchDirectKlines|calculateCorrelationToBtc|setTimeframeMetrics/);
  assert.match(widget, /lastUpdated: 0/);
});

test('Terminal sync conflicts are visible outside hidden menus and can be recovered safely', () => {
  const page = source('../src/components/TerminalPage.tsx');
  const hook = source('../src/utils/useTerminalWorkspace.ts');
  const settings = source('../src/components/terminal/TerminalSettingsDrawer.tsx');
  assert.doesNotMatch(page, /<div role="alert" className="z-30 flex shrink-0/);
  assert.match(page, /syncConflict=\{syncConflict\} backupFailed=\{backupFailed\}/);
  assert.match(page, /onDownloadLocalBackup=\{downloadLocalBackup\}/);
  assert.match(page, /onRestoreCloudWorkspace=\{restoreCloudWorkspace\}/);
  assert.match(settings, /role="alert"/);
  assert.match(settings, /onClick=\{onDownloadLocalBackup\}/);
  assert.match(settings, /onClick=\{onRestoreCloudWorkspace\}/);
  assert.match(settings, /backupFailed/);
  assert.match(settings, /terminal\.drawer\.conflictBackupFailed/);
  assert.match(hook, /saveConflictBackup\(uid: string, value: WorkspaceSnapshot\): boolean/);
  assert.match(hook, /localStorage\.setItem\(terminalStorageKey\(CONFLICT_KEY, uid\)/);
  assert.match(hook, /if \(uid && syncConflictRef\.current\) \{\s*const stored = saveConflictBackup\(uid, workspace\)/);
  // Cloud hydration now checks the conflict first and only loads the remote
  // state if there were no local edits; keep the two safety gates explicit.
  assert.match(hook, /if \(syncConflictRef\.current\) return;/);
  // Hydration now normalizes the server workspace before assignment. Assert
  // both the no-local-edits gate and that the normalized result is applied.
  assert.match(hook, /if \(revision\.current === 0\) \{[\s\S]*?const hydratedWorkspace = loadTerminalWorkspace\(uid, profile\.terminalSettings\)/);
  assert.match(hook, /setWorkspace\(hydratedWorkspace\)/);
  assert.match(hook, /window\.confirm\(/);
  assert.match(hook, /window\.location\.reload\(\)/);
});

test('late profile hydration never overwrites a locally edited workspace or claims the cloud version', () => {
  const hook = source('../src/utils/useTerminalWorkspace.ts');
  const start = hook.indexOf('if (hydrated.current || !uid || profile?.uid !== uid) return;');
  const end = hook.indexOf('const setField =', start);
  assert.ok(start >= 0 && end > start);
  const hydration = hook.slice(start, end);
  assert.match(hydration, /revision\.current > 0 \|\| lastCommittedWorkspace\.current !== workspace/);
  assert.match(hydration, /syncConflictRef\.current = true/);
  assert.match(hydration, /saveConflictBackup\(uid, workspaceRef\.current\)/);
  assert.match(hydration, /setSyncConflict\(true\)/);
  assert.match(hydration, /if \(syncConflictRef\.current\) return;/);
  assert.match(hydration, /if \(revision\.current === 0\)/);
  assert.doesNotMatch(hook, /serverVersion\.current = profile\.terminalSettings\?\.version[\s\S]*?serverVersion\.current = profile\.terminalSettings\?\.version/,
    'the CAS version must not be upgraded by a newer profile update from another device');
});

test('the sole chart uses the same identity-bound grid item as multiple charts', () => {
  const page = source('../src/components/TerminalPage.tsx');
  const widget = source('../src/components/terminal/TerminalChartWidget.tsx');
  assert.match(page, /visibleWorkspaceBlocks\.map\(\(block, index\)/);
  assert.match(page, /<TerminalGridItem[\s\S]*?key=\{block\.id\}[\s\S]*?block=\{block\}/);
  assert.match(page, /getCoinForBlock\(block\)/);
  assert.match(widget, /symbol=\{block\.symbol\}/);
  assert.match(widget, /exchange=\{block\.exchange\}/);
  assert.match(widget, /marketType=\{block\.marketType\}/);
  assert.match(widget, /timeframe=\{block\.timeframe\}/);
  assert.doesNotMatch(page, /<ExchangeCandlestickChart/);
});

test('Terminal increments save revisions only for committed React workspaces', () => {
  const hook = source('../src/utils/useTerminalWorkspace.ts');
  const start = hook.indexOf('const setField = useCallback(');
  const end = hook.indexOf('const retrySync = useCallback(', start);
  assert.ok(start >= 0 && end > start);
  const updates = hook.slice(start, end);
  const updaterEnd = updates.indexOf('const setBlocks:');
  assert.ok(updaterEnd > 0);
  assert.doesNotMatch(updates.slice(0, updaterEnd), /revision\.current \+= 1/);
  assert.match(updates, /if \(lastCommittedWorkspace\.current === workspace\) return/);
  assert.match(updates, /const isPureHydration = hydrationWorkspaceRef\.current === workspace/);
  assert.match(updates, /if \(!isPureHydration\) revision\.current \+= 1/);
  assert.match(hook, /hydrationWorkspaceRef\.current = hydratedWorkspace/);
  assert.doesNotMatch(hook, /skipHydrationCommit/,
    'hydration must not suppress a concurrent user edit batched into the same commit');
  assert.match(updates, /revision\.current \+= 1/);
  assert.match(hook, /revision\.current === savedRevision\.current/);
  assert.match(hook, /lastCommittedWorkspace\.current !== workspace/);
});

test('Terminal workspace JSON import is available and disables auto presets before restoring charts', () => {
  const hook = source('../src/utils/useTerminalWorkspace.ts');
  const page = source('../src/components/TerminalPage.tsx');
  const panel = source('../src/components/terminal/TerminalPresetPanel.tsx');
  assert.match(hook, /const importWorkspaceBackup = useCallback/);
  assert.match(hook, /parseTerminalWorkspaceBackup\(json\)/);
  assert.match(hook, /setWorkspace\(recovered\)/);
  assert.match(page, /onImportWorkspaceBackup=\{handleImportWorkspaceBackup\}/);
  const importHandlerStart = page.indexOf('const handleImportWorkspaceBackup = useCallback(');
  const importHandlerEnd = page.indexOf('const handleSaveCoinPreset =', importHandlerStart);
  assert.ok(importHandlerStart >= 0 && importHandlerEnd > importHandlerStart);
  const importHandler = page.slice(importHandlerStart, importHandlerEnd);
  assert.match(importHandler, /if \(imported\) \{/);
  assert.match(importHandler, /setActiveMarketPreset\(null\)/);
  assert.match(importHandler, /setPresetMatches\(\[\]\)/);
  assert.match(panel, /accept=".json,application\/json"/);
  assert.match(panel, /handleBackupFile\(event\)/);
  assert.match(panel, /onDownloadLocalBackup/);
});

test('auto-updating market presets preserve an enlarged chart unless that block disappears', () => {
  const page = source('../src/components/TerminalPage.tsx');
  const start = page.indexOf('const applyPresetPage = useCallback(');
  const end = page.indexOf('const handleWorkspaceConfigUpdate', start);
  assert.ok(start >= 0 && end > start);
  const updater = page.slice(start, end);
  assert.doesNotMatch(updater, /setMaximizedBlockId\(null\)/,
    'refreshing an unchanged market preset must not collapse the current chart');
  assert.match(page, /if \(maximizedBlockId !== null && !blocks\.some\(block => block\.id === maximizedBlockId\)\)/);
  assert.match(page, /setMaximizedBlockId\(null\)/);
});

test('identical 30-second market snapshots do not reapply the preset page twice', () => {
  const page = source('../src/components/TerminalPage.tsx');
  const start = page.indexOf('const handleApplyMarketCoins = useCallback(');
  const end = page.indexOf('const handleActiveMarketPresetChange =', start);
  assert.ok(start >= 0 && end > start);
  const handler = page.slice(start, end);
  assert.match(handler, /current\.length === selected\.length/);
  assert.match(handler, /current\.every\(\(coin, index\) => coinMarketKey\(coin\) === coinMarketKey\(selected\[index\]\)\)/);
  assert.match(handler, /\? current : selected/);
  assert.match(handler, /applyPresetPage\(selected, presetPageRef\.current\)/);
});
