import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTerminalWorkspace } from '../src/utils/useTerminalWorkspace';
import { terminalStorageKey } from '../src/utils/terminalPresets';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('all Terminal settings controls write to the same per-profile workspace and Done flushes it', () => {
  const drawer = read('../src/components/terminal/TerminalSettingsDrawer.tsx');
  const page = read('../src/components/TerminalPage.tsx');
  const hook = read('../src/utils/useTerminalWorkspace.ts');
  for (const fragment of [
    'coinPresetExchange: event.target.value', 'coinPresetMarketType: event.target.value',
    'coinPresetLimit: Number(event.target.value)', 'layoutPreset: item.id',
    'columns: col', 'autoFitScreen: !config.autoFitScreen',
    'showClock: config.showClock === false', 'blockHeight: h.id',
    'initialChartFitAll: initialFitAll', 'initialChartView: initialResetToDefault',
  ]) assert.ok(drawer.includes(fragment), `Terminal setting not wired: ${fragment}`);
  assert.match(drawer, /onApplyGlobalTimeframe\(tf\)/);
  assert.match(drawer, /onApplyPreset\('top_3'\)/);
  assert.match(drawer, /if \(onDone\) onDone\(\);\s*else onClose\(\);/);
  assert.match(page, /onDone=\{handleDoneWorkspaceSettings\}/);
  assert.match(page, /const handleDoneWorkspaceSettings = useCallback\(\(\) => \{[\s\S]*?requestImmediateWorkspaceSync\(\);\s*setConfig\(current => \(\{ \.\.\.current \}\)\);/);
  assert.match(hook, /updateTerminalWorkspace\(\{[\s\S]*?config,[\s\S]*?blocks: value\.blocks, customPresets: value\.presets/);
  assert.match(hook, /terminalStorageKey\(CONFIG_KEY, uid\)/);
  assert.match(hook, /terminalStorageKey\(BLOCKS_KEY, uid\)/);
});

test('Terminal settings and 30 chart identities reload from the correct account profile', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const items = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); },
  } });
  try {
    const blocks = Array.from({ length: 30 }, (_, i) => ({
      id: `chart-${i}`, symbol: `C${i}USDT`, baseAsset: `C${i}`, quoteAsset: 'USDT',
      exchange: i % 2 ? 'bybit' as const : 'binance' as const,
      marketType: i % 2 ? 'spot' as const : 'futures' as const,
      timeframe: i % 2 ? '1m' as const : '15m' as const, colSpan: 1 as const,
    }));
    const config = { layoutPreset: 'custom' as const, columns: 3 as const, blockHeight: 'large' as const,
      blocks: [], showFormations: true, autoFitScreen: false, showClock: false,
      coinPresetLimit: 10, coinPresetExchange: 'bybit' as const, coinPresetMarketType: 'spot' as const,
      presetAutoUpdate: false, globalTimeframe: '5m' as const, autoScaleCharts: true,
      terminalEcoMode: true, terminalRefreshMs: 500 as const, terminalMarketAlerts: true,
      initialChartFitAll: false, initialChartView: { visibleBars: 90, rightGapBars: 12,
        verticalZoom: 1.2, autoPriceScale: false },
    };
    const profile = { columns: 3, blockHeight: 'large' as const, blocks, config, customPresets: [], version: 'v1' };
    // A stale local value must not override the account's versioned profile.
    items.set(terminalStorageKey('crypto_screener_terminal_config', 'owner-a'),
      JSON.stringify({ ...config, coinPresetLimit: 50, showClock: true }));
    const restored = loadTerminalWorkspace('owner-a', profile);
    assert.equal(restored.blocks.length, 30);
    assert.deepEqual(restored.blocks, blocks);
    for (const key of ['columns','blockHeight','autoFitScreen','showClock','coinPresetLimit',
      'coinPresetExchange','coinPresetMarketType','presetAutoUpdate','globalTimeframe',
      'autoScaleCharts','terminalEcoMode','terminalRefreshMs','terminalMarketAlerts','initialChartFitAll'] as const)
      assert.equal(restored.config[key], config[key], `lost user setting: ${key}`);
    assert.equal(restored.config.initialChartView?.visibleBars, 90);
    assert.equal(restored.config.initialChartView?.rightGapBars, 12);
    assert.equal(loadTerminalWorkspace('owner-b').config.coinPresetLimit, undefined);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
