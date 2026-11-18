import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { effectiveScreenerSearchConfig } from '../src/utils/screenerSearchSettings';
import {
  DEFAULT_APP_PREFERENCES, PREFERENCES_STORAGE_KEY, PREFERENCES_UPDATED_EVENT,
  applyChangedDefaultsToMarketFilters, getReplayStartingDefaults, getStoredPreferences, preferenceStorageKey,
  saveStoredPreferences, setPreferencesIdentity,
} from '../src/utils/userPreferences';

function withBrowserStorage(run: (store: Map<string, string>, browser: EventTarget) => void) {
  const beforeWindow = (globalThis as any).window;
  const beforeStorage = (globalThis as any).localStorage;
  const store = new Map<string, string>();
  const browser = new EventTarget();
  (globalThis as any).window = browser;
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
  try {
    setPreferencesIdentity(null);
    run(store, browser);
  } finally {
    setPreferencesIdentity(null);
    (globalThis as any).window = beforeWindow;
    (globalThis as any).localStorage = beforeStorage;
  }
}

test('exchange, market, timeframe and sound stay isolated per authenticated UID', () => {
  withBrowserStorage((store, browser) => {
    store.set(PREFERENCES_STORAGE_KEY, JSON.stringify({
      defaultExchange: 'bybit', defaultMarketType: 'spot', defaultTimeframe: '1h',
      soundAlertsEnabled: true,
    }));
    // Legacy browser-wide key is deliberately NOT imported into a new user's profile.
    assert.deepEqual(getStoredPreferences(), DEFAULT_APP_PREFERENCES);
    const received: Array<string> = [];
    browser.addEventListener(PREFERENCES_UPDATED_EVENT, () => {
      received.push(getStoredPreferences().defaultTimeframe);
    });
    setPreferencesIdentity('alice');
    saveStoredPreferences({ defaultExchange: 'binance', defaultMarketType: 'spot', defaultTimeframe: '5m', soundAlertsEnabled: true });
    assert.equal(store.has(preferenceStorageKey('alice')), true);
    setPreferencesIdentity('bob');
    assert.deepEqual(getStoredPreferences(), DEFAULT_APP_PREFERENCES);
    saveStoredPreferences({ defaultExchange: 'bybit', defaultTimeframe: '1d' });
    setPreferencesIdentity('alice');
    assert.deepEqual(getStoredPreferences(), {
      defaultExchange: 'binance', defaultMarketType: 'spot', defaultTimeframe: '5m',
      soundAlertsEnabled: true,
    });
    setPreferencesIdentity(null);
    assert.deepEqual(getStoredPreferences(), DEFAULT_APP_PREFERENCES);
    assert.ok(received.includes('5m'), 'mounted page listeners receive the restored account defaults');
    assert.ok(received.includes('15m'), 'logging out notifies mounted pages of guest defaults');
  });
});

test('stored defaults reject invalid enum values and Replay resolves all/30s safely', () => {
  withBrowserStorage((store) => {
    setPreferencesIdentity('test');
    store.set(preferenceStorageKey(), JSON.stringify({
      defaultExchange: 'untrusted', defaultMarketType: 'unknown', defaultTimeframe: 'not-a-frame',
    }));
    assert.deepEqual(getStoredPreferences(), DEFAULT_APP_PREFERENCES);
    saveStoredPreferences({ defaultExchange: 'all', defaultMarketType: 'all', defaultTimeframe: '30s' });
    assert.deepEqual(getReplayStartingDefaults(), { exchange: 'binance', marketType: 'futures', timeframe: '1m' });
    saveStoredPreferences({ defaultExchange: 'bybit', defaultMarketType: 'spot', defaultTimeframe: '5m' });
    assert.deepEqual(getReplayStartingDefaults(), { exchange: 'bybit', marketType: 'spot', timeframe: '5m' });
  });
});

test('authentication hydrates owner-scoped defaults and Replay preserves restored sessions', () => {
  const auth = readFileSync(new URL('../src/context/AuthContext.tsx', import.meta.url), 'utf8');
  const replay = readFileSync(new URL('../src/components/ReplayPage.tsx', import.meta.url), 'utf8');
  const terminal = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(auth, /setPreferencesIdentity\(uid\)/);
  assert.match(auth, /setPreferencesIdentity\(null\)/);
  assert.match(auth, /defaultTimeframe: profile\.defaultTimeframe \?\? DEFAULT_APP_PREFERENCES\.defaultTimeframe/);
  assert.match(replay, /if \(restoredContext\?\.atTime\)/);
  assert.match(replay, /const initial = getReplayStartingDefaults\(\)/);
  assert.match(replay, /initial\.exchange, initial\.marketType, initial\.timeframe, false/);
  assert.match(terminal, /const activeTimeframe = blocks\.length === 1 \? blocks\[0\]\.timeframe : timeframe/);
});

test('HookChart follows the account timezone unless the chart user chooses an override', () => {
  const defaults = readFileSync(new URL('../src/components/hookchart/OriginalHookChartSettings.tsx', import.meta.url), 'utf8');
  const canvas = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  const profileChart = readFileSync(new URL('../src/components/profile/ProfileHookChartSettings.tsx', import.meta.url), 'utf8');
  assert.match(defaults, /timezone: 'auto'/);
  assert.match(defaults, /values=\{\['auto', 'Europe\/Warsaw', 'UTC'/);
  assert.match(canvas, /settings\.timezone !== 'auto'/);
  assert.match(canvas, /resolveTimeZone\(profile\?\.timeZone\)/);
  assert.match(profileChart, /previewTimezone=\{resolveTimeZone\(profile\.timeZone\)\}/);
});

test('Screener derives legacy search defaults from current account preferences', () => {
  const screener = readFileSync(new URL('../src/components/CoinScreenerPage.tsx', import.meta.url), 'utf8');
  const terminal = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(screener, /const \{ preferences \} = useAppPreferences\(\)/);
  assert.match(screener, /profile\?\.searchSettings, preferences\.defaultExchange, preferences\.defaultMarketType/);
  assert.match(screener, /exchange: preferences\.defaultExchange, marketType: preferences\.defaultMarketType/);
  assert.match(screener, /\[searchSettings, preferences\.defaultExchange, preferences\.defaultMarketType\]/);
  assert.doesNotMatch(screener, /getStoredPreferences\(\)/);
  assert.match(terminal, /timeframe: tf \|\| config\.globalTimeframe \|\| preferences\.defaultTimeframe/);
  // Existing chart timeframes remain per-block: profile changes affect only the
  // next add action when there is no explicit terminal global-timeframe override.
  assert.match(terminal, /const activeTimeframe = blocks\.length === 1 \? blocks\[0\]\.timeframe : timeframe/);
  assert.match(terminal, /timeframe: tf \|\| block\.timeframe/);
  const before = effectiveScreenerSearchConfig(undefined, { exchange: 'binance', marketType: 'futures' });
  const after = effectiveScreenerSearchConfig(undefined, { exchange: 'bybit', marketType: 'spot' });
  assert.equal(before.exchange, 'binance');
  assert.equal(before.marketType, 'futures');
  assert.equal(after.exchange, 'bybit');
  assert.equal(after.marketType, 'spot');
  const preset = { defaultConfig: { exchange: 'binance', marketType: 'futures' } };
  assert.equal(effectiveScreenerSearchConfig(preset, { exchange: 'bybit' }).exchange, 'binance',
    'an explicitly saved account Screener default must still win');
});

test('changing profile defaults preserves manually chosen regular/early Formations filters', () => {
  const oldDefaults = { defaultExchange: 'binance' as const, defaultMarketType: 'futures' as const, defaultTimeframe: '15m' as const };
  const newDefaults = { defaultExchange: 'bybit' as const, defaultMarketType: 'spot' as const, defaultTimeframe: '5m' as const };
  const untouched = { exchange: 'binance' as const, marketType: 'futures' as const, timeframe: '15m' as const, search: 'BTC' };
  assert.deepEqual(applyChangedDefaultsToMarketFilters(untouched, oldDefaults, newDefaults),
    { exchange: 'bybit', marketType: 'spot', timeframe: '5m', search: 'BTC' });
  const manuallySelected = { exchange: 'all' as const, marketType: 'spot' as const, timeframe: '1h' as const, search: 'ETH' };
  assert.equal(applyChangedDefaultsToMarketFilters(manuallySelected, oldDefaults, newDefaults), manuallySelected,
    'manual overrides are unchanged, preserving their object identity');
  const mixed = { exchange: 'binance' as const, marketType: 'spot' as const, timeframe: '15m' as const, search: 'SOL' };
  assert.deepEqual(applyChangedDefaultsToMarketFilters(mixed, oldDefaults, newDefaults),
    { exchange: 'bybit', marketType: 'spot', timeframe: '5m', search: 'SOL' });
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /setFilters\(current => applyChangedDefaultsToMarketFilters\(current, previous, next\)\)/);
  assert.match(app, /setEarlyFilters\(current => applyChangedDefaultsToMarketFilters\(current, previous, next\)\)/);
  assert.match(app, /if \(previous\.uid !== next\.uid\)/);
  assert.match(app, /setFilters\(fresh\)/);
  assert.match(app, /setEarlyFilters\(createEarlyModeFilters\(fresh\)\)/);
  assert.match(app, /setRegularIndicatorFilters\(\{ \.\.\.DEFAULT_REGULAR_INDICATOR_FILTERS \}\)/);
  assert.match(app, /setEarlyStage\('all'\)/);
  assert.match(app, /\[user\?\.uid, preferences\.defaultExchange, preferences\.defaultMarketType, preferences\.defaultTimeframe\]/);

});

test('Terminal keeps a manually saved global timeframe while new blocks inherit profile defaults', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /config\.globalTimeframe \|\| getStoredPreferences\(\)\.defaultTimeframe/);
  assert.match(page, /setTimeframe\(config\.globalTimeframe \|\| preferences\.defaultTimeframe\)/);
  assert.match(page, /timeframe: tf \|\| config\.globalTimeframe \|\| preferences\.defaultTimeframe/);
  assert.match(page, /updateBlocks\(previous => applyTerminalTimeframe\(previous, tf\)\)/,
    'only an explicit global timeframe selection updates existing chart blocks');
});

test('profile defaults still apply when localStorage rejects writes', () => {
  const originalWindow = (globalThis as any).window;
  const originalStorage = (globalThis as any).localStorage;
  const browser = new EventTarget();
  const delivered: string[] = [];
  const existing = JSON.stringify({
    ...DEFAULT_APP_PREFERENCES,
    defaultExchange: 'binance',
  });
  (globalThis as any).window = browser;
  (globalThis as any).localStorage = {
    getItem: (_key: string) => existing,
    setItem: () => { throw new Error('QuotaExceededError'); },
  };
  browser.addEventListener(PREFERENCES_UPDATED_EVENT, () => {
    delivered.push(getStoredPreferences().defaultExchange);
  });
  try {
    setPreferencesIdentity('private-browser-user');
    saveStoredPreferences({ defaultExchange: 'bybit', defaultMarketType: 'spot', defaultTimeframe: '5m' });
    assert.equal(getStoredPreferences().defaultExchange, 'bybit',
      'the last server-confirmed defaults win even if older localStorage data remains');
    assert.equal(getStoredPreferences().defaultTimeframe, '5m');
    assert.ok(delivered.includes('bybit'), 'all mounted widgets receive an update despite storage failure');
    setPreferencesIdentity('second-private-user');
    assert.equal(getStoredPreferences().defaultExchange, 'binance',
      'in-memory fallback must never leak the prior account defaults');
  } finally {
    setPreferencesIdentity(null);
    (globalThis as any).window = originalWindow;
    (globalThis as any).localStorage = originalStorage;
  }
});

test('cross-tab storage events invalidate in-memory profile defaults', () => {
  const source = readFileSync(new URL('../src/utils/userPreferences.ts', import.meta.url), 'utf8');
  assert.match(source, /if \(e\.key === preferenceStorageKey\(\)\) \{\s*memoryPreferences = null/);
  assert.match(source, /memoryPreferences = next;[\s\S]*?window\.dispatchEvent/);
});
