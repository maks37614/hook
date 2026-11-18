import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isVolumeWithinCap, preferredVolumeSortOrder } from '../src/utils/screenerVolume';
import type { MarketCoin, ScannedCoin } from '../src/types';
import {
  DEFAULT_SCREENER_SEARCH_CONFIG, MAX_SCREENER_SEARCH_PRESETS,
  compareScreenerSearchCoins, effectiveScreenerSearchConfig, matchesAdvancedScreenerFilters,
  normalizeScreenerSearchConfig, normalizeScreenerSearchSettings,
} from '../src/utils/screenerSearchSettings';

const source = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');
const coin = (symbol: string, volumeUsd: number, change24h: number): MarketCoin => ({
  symbol, baseAsset: symbol.replace('USDT', ''), quoteAsset: 'USDT',
  exchange: 'binance', marketType: 'futures', price: 10,
  change24h, volumeUsd, high24h: 11, low24h: 9,
  distanceToHighPct: 10, distanceToLowPct: 10, volatility24hPct: 2,
  isNearHigh: false, isNearLow: false, isActiveCoin: false,
  exchangeUrl: '',
});

test('Screener search defaults are local and legacy account settings stay readable', () => {
  assert.equal(DEFAULT_SCREENER_SEARCH_CONFIG.sortBy, 'volume');
  assert.equal(DEFAULT_SCREENER_SEARCH_CONFIG.secondarySortBy, 'none');
  const settings = normalizeScreenerSearchSettings({ presetFilter: 'active', sortBy: 'price', sortDirection: 'asc' },
    { exchange: 'bybit', marketType: 'spot' });
  assert.equal(settings.defaultConfig?.presetFilter, 'active');
  assert.equal(settings.defaultConfig?.sortBy, 'price');
  assert.equal(settings.defaultConfig?.sortOrder, 'asc');
  assert.equal(settings.defaultConfig?.exchange, 'bybit');
  assert.equal(settings.defaultConfig?.marketType, 'spot');
});

test('account preset defaults load and invalid preset references safely fall back', () => {
  const filters = {
    ...DEFAULT_SCREENER_SEARCH_CONFIG, exchange: 'bybit' as const, marketType: 'spot' as const,
    searchQuery: 'BTC', maxVolumeUsd: 5_000_000, sortBy: 'priceChange' as const,
    sortOrder: 'asc' as const, secondarySortBy: 'volume' as const,
  };
  const saved = normalizeScreenerSearchSettings({
    defaultConfig: DEFAULT_SCREENER_SEARCH_CONFIG,
    defaultPresetId: 'mine',
    presets: [{ id: 'mine', name: 'My scalping', config: filters }],
  });
  const selected = effectiveScreenerSearchConfig(saved);
  assert.deepEqual(selected, filters);
  assert.equal(effectiveScreenerSearchConfig({ ...saved, defaultPresetId: 'deleted' }).sortBy, 'volume');
  assert.equal(saved.presets?.[0]?.name, 'My scalping');
});

test('imported preset values are bounded and secondary sorts cannot duplicate primary', () => {
  const data = normalizeScreenerSearchConfig({
    searchQuery: 'A'.repeat(200), exchange: 'invalid', maxVolumeUsd: Number.POSITIVE_INFINITY,
    sortBy: 'price', secondarySortBy: 'price',
  });
  assert.equal(data.searchQuery.length, 80);
  assert.equal(data.exchange, 'all');
  assert.equal(data.maxVolumeUsd, 0);
  assert.equal(data.secondarySortBy, 'none');
  const tooMany = normalizeScreenerSearchSettings({
    presets: Array.from({ length: 25 }, (_, index) => ({
      id: String(index), name: 'Preset ' + index, config: data,
    })),
  });
  assert.equal(tooMany.presets?.length, MAX_SCREENER_SEARCH_PRESETS);
});

test('local multi-priority sort uses primary metric, then secondary on ties', () => {
  const a = coin('AAAUSDT', 10_000, 3);
  const b = coin('BBBUSDT', 10_000, 6);
  const c = coin('CCCUSDT', 20_000, 1);
  const config = { sortBy: 'volume' as const, sortOrder: 'desc' as const,
    secondarySortBy: 'priceChange' as const, secondarySortOrder: 'desc' as const };
  const ordered = [a, c, b].sort((left, right) => compareScreenerSearchCoins(left, right, config));
  assert.deepEqual(ordered.map(item => item.symbol), ['CCCUSDT', 'BBBUSDT', 'AAAUSDT']);
  const reversed = [a, c, b].sort((left, right) => compareScreenerSearchCoins(left, right,
    { ...config, secondarySortOrder: 'asc' }));
  assert.deepEqual(reversed.map(item => item.symbol), ['CCCUSDT', 'AAAUSDT', 'BBBUSDT']);
});

test('profile search settings are confined to coin Screener and legacy HookChart sorting is removed', () => {
  const profile = source('../src/components/UserProfileModal.tsx');
  const editor = source('../src/components/profile/ProfileScreenerSearchSettings.tsx');
  const screener = source('../src/components/CoinScreenerPage.tsx');
  const hook = source('../src/components/hookchart/OriginalHookChartSettings.tsx');
  assert.match(profile, /setActiveProfileSection\('search'\)/);
  assert.match(profile, /<ProfileScreenerSearchSettings/);
  assert.match(editor, /updateProfileData\(\{ searchSettings:/);
  assert.match(editor, /Зберегти як налаштування за замовчуванням/);
  assert.match(editor, /Мої пресети/);
  assert.match(screener, /id="screener-custom-search-preset"/);
  assert.match(screener, /applySearchConfig\(selected\.config\)/);
  assert.match(screener, /result\.sort\(\(a, b\) => compareScreenerSearchCoins/);
  assert.doesNotMatch(hook, /Дані та сортування|Типи та порядок сортування|Інтервали аналізу/);
});

test('saved search presets open from a right-side arrow inside coin search, without a separate preset row', () => {
  const screener = source('../src/components/CoinScreenerPage.tsx');
  const toolbar = screener.slice(screener.indexOf('{/* Main Filter & Search Toolbar */}'),
    screener.indexOf('{/* Exchange Filter */}'));
  assert.doesNotMatch(toolbar, /Пресети пошуку:<\/label>|Вибрати пресет<\/option>/);
  assert.match(toolbar, /ref=\{searchPresetDropdownRef\}/);
  assert.match(toolbar, /aria-label=\{t\('screener\.main\.search'\)\}/);
  assert.match(toolbar, /data-screener-preset-trigger/);
  assert.match(toolbar, /aria-expanded=\{isSearchPresetMenuOpen\}/);
  assert.match(toolbar, /aria-controls="screener-custom-search-preset"/);
  assert.match(toolbar, /absolute inset-y-0 right-0 flex w-9 items-center/);
  assert.match(toolbar, /<ChevronDown aria-hidden="true"/);
  assert.equal((toolbar.match(/id="screener-custom-search-preset"/g) ?? []).length, 1);
  assert.match(toolbar, /applySearchConfig\(effectiveScreenerSearchConfig\(searchSettings\)\)/);
  assert.match(toolbar, /if \(selected\) applySearchConfig\(selected\.config\)/);
  assert.match(toolbar, /searchSettings\.presets \|\| \[\]/);
  assert.match(toolbar, /setIsSearchPresetMenuOpen\(false\)/);
  assert.match(toolbar, /right-11' : 'right-2\.5'/);
  assert.match(screener, /document\.addEventListener\('pointerdown', closeOnOutsidePointer\)/);
  assert.match(screener, /document\.addEventListener\('keydown', closeOnEscape\)/);
  assert.match(screener, /document\.removeEventListener\('pointerdown', closeOnOutsidePointer\)/);
});

test('account switching and failed preset writes cannot leak search settings', () => {
  const app = source('../src/App.tsx');
  const editor = source('../src/components/profile/ProfileScreenerSearchSettings.tsx');
  const screener = source('../src/components/CoinScreenerPage.tsx');
  assert.match(app, /<CoinScreenerPage\s+key=\{user\?\.uid \|\| 'guest'\}/);
  assert.match(editor, /await updateProfileData\(\{ searchSettings:/);
  assert.match(editor, /if \(saved\) setEditingId\(id\)/);
  assert.match(editor, /if \(saved && editingId === id\)/);
  assert.match(editor, /return false;/);
  assert.match(screener, /const previousUiSession = screenerUiSession\.get\(user\?\.uid \|\| 'guest'\)/);
  assert.match(screener, /const cachedUi = previousUiSession\?\.savedConfigKey === savedConfigKey \? previousUiSession : undefined/,
    'only compatible user-session filters should be restored');
});

test('empty symbol search explains and preserves full-market filtering', () => {
  const editor = source('../src/components/profile/ProfileScreenerSearchSettings.tsx');
  const screener = source('../src/components/CoinScreenerPage.tsx');
  assert.match(editor, /Якщо залишити поле порожнім, скрінер шукатиме всі монети/);
  assert.match(screener, /if \(searchQuery\.trim\(\) && !matchesExchangeInstrumentSearch/);
});

test('volume filter direction is included in defaults and saved account presets', () => {
  assert.equal(DEFAULT_SCREENER_SEARCH_CONFIG.volumeMode, 'to');
  const oldPreset = normalizeScreenerSearchConfig({ maxVolumeUsd: 1_000_000 });
  assert.equal(oldPreset.volumeMode, 'to', 'old presets must keep their original upper-limit meaning');
  const savedSettings = normalizeScreenerSearchSettings({
    defaultConfig: { ...DEFAULT_SCREENER_SEARCH_CONFIG, volumeMode: 'from', maxVolumeUsd: 5_000_000 },
    presets: [{
      id: 'large-volume', name: 'Active big caps',
      config: { ...DEFAULT_SCREENER_SEARCH_CONFIG, volumeMode: 'from', maxVolumeUsd: 10_000_000 },
    }],
    defaultPresetId: 'large-volume',
  });
  assert.equal(savedSettings.defaultConfig?.volumeMode, 'from');
  assert.equal(savedSettings.presets?.[0]?.config.volumeMode, 'from');
  assert.equal(effectiveScreenerSearchConfig(savedSettings).volumeMode, 'from');
  assert.equal(effectiveScreenerSearchConfig(savedSettings).maxVolumeUsd, 10_000_000);
  assert.equal(normalizeScreenerSearchConfig({ volumeMode: 'invalid' }).volumeMode, 'to');
});

test('24h volume direction icon has no button fill or border', () => {
  const screener = source('../src/components/CoinScreenerPage.tsx');
  const block = screener.slice(
    screener.indexOf('data-screener-volume-direction'),
    screener.indexOf('data-screener-volume-direction') + 1400,
  );
  assert.match(block, /rounded-none border-0 bg-transparent p-0/);
  assert.match(block, /shadow-none transition-colors hover:bg-transparent/);
  assert.doesNotMatch(block, /hover:border-cyan-400|border-slate-700\/80/);
  assert.match(block, /setVolumeMode\(nextMode\)/);
  assert.match(block, /aria-pressed=\{volumeMode === 'from'\}/);
});

test('Screener volume arrow changes only local filter mode, preserving preset and profile integration', () => {
  const screener = source('../src/components/CoinScreenerPage.tsx');
  const dropdown = source('../src/components/ScreenerVolumeDropdown.tsx');
  const editor = source('../src/components/profile/ProfileScreenerSearchSettings.tsx');
  assert.match(screener, /t\('screenerVolume24h'\)/);
  assert.match(screener, /data-screener-volume-direction/);
  assert.match(screener, /setVolumeMode\(nextMode\)/);
  assert.match(screener, /if \(sortBy === 'volume'\) setSortOrder\(preferredVolumeSortOrder\(nextMode\)\)/);
  assert.match(screener, /if \(sortBy === 'volume'\) setSortOrder\(preferredVolumeSortOrder\(volumeMode\)\)/);
  assert.match(screener, /isVolumeWithinCap\(coin\.volumeUsd, maxVolumeUsd, volumeMode\)/);
  assert.match(screener, /mode=\{volumeMode\}/);
  assert.match(screener, /volumeMode, savedConfigKey, advancedFilters, sortBy/);
  assert.match(dropdown, /option\.label\.replace\(/);
  assert.match(editor, /setField\('volumeMode', draft\.volumeMode === 'to' \? 'from' : 'to'\)/);
  // Direction control is icon-only on the right; the amount shows ≤ or ≥.
  const volumeSection = screener.slice(screener.indexOf('data-screener-filter="volume"'),
    screener.indexOf('data-screener-filter="volume"') + 2200);
  assert.ok(volumeSection.indexOf('<ScreenerVolumeDropdown') < volumeSection.indexOf('data-screener-volume-direction'));
  assert.match(volumeSection, /aria-pressed=\{volumeMode === 'from'\}/);
  assert.doesNotMatch(volumeSection, /<span>\{volumeMode === 'to' \?/);
  assert.match(dropdown, /option\.label\.replace\(\/\^До \/, ''\)/);
  assert.match(dropdown, /mode === 'from' \? '≥' : '≤'/);
  assert.match(dropdown, /entries\.splice\(insertAt/);
});

test('24h volume filter label is translated while preserving the requested Ukrainian wording', () => {
  const languages = [
    ['uk', 'Обсяг 24год:'],
    ['en', '24h Volume:'],
    ['pl', 'Wolumen 24 godz.:'],
    ['ru', 'Объём 24 ч:'],
  ];
  for (const [language, expected] of languages) {
    const locale = source('../src/locales/' + language + '.ts');
    assert.ok(locale.includes('"screenerVolume24h": "' + expected + '"'));
    for (const key of ['screenerVolumeFrom', 'screenerVolumeTo', 'screenerVolumeUnlimited']) {
      assert.ok(locale.includes('"' + key + '":'), language + ' must translate ' + key);
    }
  }
});

test('advanced Screener filters remain off for old saved presets and clamp malformed numeric values', () => {
  const old = normalizeScreenerSearchConfig({ searchQuery: 'BTC', volumeMode: 'from' });
  assert.equal(old.minVolatility5mPct, 0);
  assert.equal(old.minPriceUsd, 0);
  assert.equal(old.maxPriceUsd, 0);
  assert.equal(old.maxDistanceToHighPct, null);
  assert.equal(old.maxDistanceToLowPct, null);
  assert.equal(old.onlyWithFormations, false);
  assert.equal(old.minOpenInterestUsd, 0);
  assert.equal(old.fundingRateDirection, 'any');
  assert.equal(old.minFundingRateAbsPct, 0);
  assert.equal(old.minBreakoutRvol, 0);
  assert.equal(old.volumeMode, 'from');
  const malformed = normalizeScreenerSearchConfig({
    minVolatility5mPct: -3, minPriceUsd: Number.POSITIVE_INFINITY,
    maxDistanceToHighPct: -12, maxDistanceToLowPct: 120,
    minOpenInterestUsd: -1, fundingRateDirection: 'invalid', minFundingRateAbsPct: 102,
    minBreakoutRvol: Number.NaN, onlyWithFormations: 'true',
  });
  assert.equal(malformed.minVolatility5mPct, 0);
  assert.equal(malformed.minPriceUsd, 0);
  assert.equal(malformed.maxDistanceToHighPct, 0);
  assert.equal(malformed.maxDistanceToLowPct, 100);
  assert.equal(malformed.minOpenInterestUsd, 0);
  assert.equal(malformed.fundingRateDirection, 'any');
  assert.equal(malformed.minFundingRateAbsPct, 100);
  assert.equal(malformed.minBreakoutRvol, 0);
  assert.equal(malformed.onlyWithFormations, false);
});

test('price, volatility and 24h high/low filters are inclusive and combine without market requests', () => {
  const coinData = { ...coin('ABCUSDT', 5_000_000, 4), price: 1.5, volatility5mPct: 1.1,
    distanceToHighPct: 1.5, distanceToLowPct: 2.5 };
  const config = normalizeScreenerSearchConfig({
    minVolatility5mPct: 1.1, minPriceUsd: 0.01, maxPriceUsd: 10,
    maxDistanceToHighPct: 1.5, maxDistanceToLowPct: 2.5,
  });
  assert.equal(matchesAdvancedScreenerFilters(coinData, config), true);
  assert.equal(matchesAdvancedScreenerFilters({ ...coinData, price: 11 }, config), false);
  assert.equal(matchesAdvancedScreenerFilters({ ...coinData, price: 0.001 }, config), false);
  assert.equal(matchesAdvancedScreenerFilters({ ...coinData, volatility5mPct: 1 }, config), false);
  assert.equal(matchesAdvancedScreenerFilters({ ...coinData, volatility5mPct: undefined }, config), false);
  assert.equal(matchesAdvancedScreenerFilters({ ...coinData, distanceToLowPct: 3 }, config), false);
  assert.equal(matchesAdvancedScreenerFilters({ ...coinData, distanceToHighPct: 2 }, config), false);
  assert.equal(matchesAdvancedScreenerFilters(coinData, normalizeScreenerSearchConfig({
    maxDistanceToHighPct: null,
  })), true);
});

const formCoin = (ratio: number, confirmed = true, closedCandleOnly = true, lookAheadSafe = true): ScannedCoin => ({
  formations: [{ validation: {
    breakoutConfirmed: confirmed, closedCandleOnly, volumeRatio: ratio,
    lookAheadSafe, finiteData: true, enoughData: true,
  } }],
} as unknown as ScannedCoin);

test('only cached detected formations count; breakout RVOL must be confirmed and from closed candles', () => {
  const sample = coin('ABCUSDT', 5_000_000, 2);
  const onlyPatterns = normalizeScreenerSearchConfig({ onlyWithFormations: true });
  assert.equal(matchesAdvancedScreenerFilters(sample, onlyPatterns), false);
  assert.equal(matchesAdvancedScreenerFilters(sample, onlyPatterns, formCoin(0.8, false)), true);
  const onlyRvol = normalizeScreenerSearchConfig({ minBreakoutRvol: 1.5 });
  assert.equal(matchesAdvancedScreenerFilters(sample, onlyRvol), false);
  assert.equal(matchesAdvancedScreenerFilters(sample, onlyRvol, formCoin(2, false)), false);
  assert.equal(matchesAdvancedScreenerFilters(sample, onlyRvol, formCoin(2, true, false)), false);
  assert.equal(matchesAdvancedScreenerFilters(sample, onlyRvol, formCoin(2, true, true, false)), false);
  assert.equal(matchesAdvancedScreenerFilters(sample, onlyRvol, formCoin(1.49)), false);
  assert.equal(matchesAdvancedScreenerFilters(sample, onlyRvol, formCoin(1.5)), true);
});

test('OI and Funding require actual finite quotes and do not infer missing data', () => {
  const sample = coin('ABCUSDT', 5_000_000, 1);
  const oi = normalizeScreenerSearchConfig({ minOpenInterestUsd: 10_000_000 });
  assert.equal(matchesAdvancedScreenerFilters(sample, oi), false);
  assert.equal(matchesAdvancedScreenerFilters({ ...sample, openInterestUsd: Number.NaN }, oi), false);
  assert.equal(matchesAdvancedScreenerFilters({ ...sample, openInterestUsd: 9_999_999 }, oi), false);
  assert.equal(matchesAdvancedScreenerFilters({ ...sample, openInterestUsd: 10_000_000 }, oi), true);
  const positive = normalizeScreenerSearchConfig({ fundingRateDirection: 'positive', minFundingRateAbsPct: 0.01 });
  assert.equal(matchesAdvancedScreenerFilters(sample, positive), false);
  assert.equal(matchesAdvancedScreenerFilters({ ...sample, fundingRatePct: 0 }, positive), false);
  assert.equal(matchesAdvancedScreenerFilters({ ...sample, fundingRatePct: 0.009 }, positive), false);
  assert.equal(matchesAdvancedScreenerFilters({ ...sample, fundingRatePct: 0.01 }, positive), true);
  const negative = normalizeScreenerSearchConfig({ fundingRateDirection: 'negative' });
  assert.equal(matchesAdvancedScreenerFilters({ ...sample, fundingRatePct: -0.01 }, negative), true);
  assert.equal(matchesAdvancedScreenerFilters({ ...sample, fundingRatePct: 0.01 }, negative), false);
});

test('Screener-only advanced UI is wired through profile saved presets and existing formations cache', () => {
  const ui = source('../src/components/profile/ProfileScreenerSearchSettings.tsx');
  const screener = source('../src/components/CoinScreenerPage.tsx');
  const logic = source('../src/utils/screenerSearchSettings.ts');
  for (const name of [
    'minVolatility5mPct', 'minPriceUsd', 'maxPriceUsd', 'maxDistanceToHighPct',
    'maxDistanceToLowPct', 'onlyWithFormations', 'minOpenInterestUsd',
    'fundingRateDirection', 'minFundingRateAbsPct', 'minBreakoutRvol',
  ]) assert.ok(ui.includes("setField('" + name + "'"), name + ' must have a setting control');
  assert.match(screener, /matchesAdvancedScreenerFilters\(coin, advancedFilters, formationsMap\.get\(formationKey\)\)/);
  assert.match(screener, /setAdvancedFilters\(config\)/);
  assert.match(screener, /advancedFilters, formationsMap/);
  assert.doesNotMatch(logic, /fetch\(|new WebSocket\(|fetchKlines\(/);
  assert.match(ui, /Мінімальна ціна не може перевищувати максимальну/);
});

test('profile volume selector uses the same minimum/maximum directions and sorting as Screener', () => {
  const editor = source('../src/components/profile/ProfileScreenerSearchSettings.tsx');
  const volumeSection = editor.slice(editor.indexOf('<span>{t(\'screenerVolume24h\')}</span>'),
    editor.indexOf('<div className="col-span-full space-y-4'));
  assert.ok(volumeSection.includes("setField('volumeMode', draft.volumeMode === 'to' ? 'from' : 'to')"));
  assert.ok(volumeSection.includes("setField('maxVolumeUsd', Number(event.target.value))"));
  assert.ok(volumeSection.indexOf('aria-label="Межа обсягу за 24 години"') < volumeSection.indexOf('aria-pressed={draft.volumeMode'));
  assert.match(volumeSection, /draft\.volumeMode === 'from' \? '≥' : '≤'/);
  assert.doesNotMatch(volumeSection, /<span>\{draft.volumeMode === 'to' \?/);
  assert.match(volumeSection, /!SCREENER_VOLUME_CAPS\.some\(option => option\.value === draft\.maxVolumeUsd\)/);
  assert.match(editor, /next\.sortOrder = preferredVolumeSortOrder\(next\.volumeMode\)/);
  assert.match(editor, /key === 'volumeMode' \|\| key === 'maxVolumeUsd'/);
  assert.match(editor, /key === 'sortBy' && value === 'volume'/);
  assert.equal(preferredVolumeSortOrder('from'), 'asc');
  assert.equal(preferredVolumeSortOrder('to'), 'desc');
});

test('saved profile minimum volume presets survive normalization and produce matching first rows', () => {
  const profile = normalizeScreenerSearchSettings({
    defaultConfig: { ...DEFAULT_SCREENER_SEARCH_CONFIG, volumeMode: 'to', maxVolumeUsd: 50_000 },
    defaultPresetId: 'from-1m',
    presets: [{
      id: 'from-1m', name: 'Від $1M',
      config: { ...DEFAULT_SCREENER_SEARCH_CONFIG,
        volumeMode: 'from', maxVolumeUsd: 1_000_000, sortBy: 'volume', sortOrder: 'asc' },
    }],
  });
  const applied = effectiveScreenerSearchConfig(profile);
  assert.equal(applied.volumeMode, 'from');
  assert.equal(applied.maxVolumeUsd, 1_000_000);
  assert.equal(applied.sortOrder, 'asc');
  const coins = [
    coin('LOWUSDT', 49_999, 1),
    coin('MINUSDT', 1_000_000, 1),
    coin('HIGHUSDT', 1_500_000, 1),
    coin('TOPUSDT', 6_000_000, 1),
  ];
  const result = coins.filter(item => isVolumeWithinCap(item.volumeUsd, applied.maxVolumeUsd, applied.volumeMode))
    .sort((a, b) => compareScreenerSearchCoins(a, b, applied));
  assert.deepEqual(result.map(item => item.symbol), ['MINUSDT', 'HIGHUSDT', 'TOPUSDT']);
});

test('new saved profile search defaults replace stale Screener session filters without resets on unrelated writes', () => {
  const screen = source('../src/components/CoinScreenerPage.tsx');
  assert.match(screen, /savedConfigKey: string/);
  assert.match(screen, /const savedConfigKey = JSON\.stringify\(initialSearch\)/);
  assert.match(screen, /previousUiSession\?\.savedConfigKey === savedConfigKey \? previousUiSession : undefined/);
  assert.match(screen, /previous\.key === savedConfigKey\) return;/);
  assert.match(screen, /applySearchConfig\(initialSearch\)/);
  assert.match(screen, /screenerUiSession\.set\(user\?\.uid \|\| 'guest'/);
});
