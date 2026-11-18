import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { screenerMainRows } from '../src/locales/screenerMain20261115';
import { supportedLanguages, translateKey } from '../src/locales';

const screener = readFileSync(new URL('../src/components/CoinScreenerPage.tsx', import.meta.url), 'utf8');
const dictionary = readFileSync(new URL('../src/locales/index.ts', import.meta.url), 'utf8');

test('Screener toolbar, guest mode and cards are translated in all four languages', () => {
  assert.deepEqual(supportedLanguages, ['uk', 'en', 'ru', 'pl']);
  assert.ok(screenerMainRows.length >= 70);
  const keys = new Set<string>();
  for (const row of screenerMainRows) {
    assert.equal(row.length, 5);
    const [suffix, ...translations] = row;
    assert.ok(!keys.has(suffix), 'duplicate Screener phrase ' + suffix);
    keys.add(suffix);
    assert.ok(translations.every(value => value.trim().length > 0));
    assert.equal(new Set(translations.map(text =>
      [...text.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)].map(match => match[1]).sort().join(','))).size, 1,
      'translation interpolation mismatch for ' + suffix);
    for (const [index, language] of supportedLanguages.entries()) {
      const key = 'screener.main.' + suffix;
      // Runtime interpolation intentionally blanks unspecified variables. Supply
      // literal placeholders to verify the whole dictionary template instead.
      const templateParams = Object.fromEntries(
        [...translations[index].matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)]
          .map(match => [match[1], '{{' + match[1] + '}}']),
      );
      assert.equal(translateKey(language, key, templateParams), translations[index], language + ':' + key);
    }
  }
  assert.match(dictionary, /\.\.\.screenerMainStrings\[language\]/);
});

test('Screener filters and UI accessibility labels use selected language without changing volume math', () => {
  for (const key of [
    'navigation', 'toTop', 'toBottom', 'search', 'clearSearch', 'expandPresets',
    'searchPresets', 'applyDefault', 'refreshQuotes', 'sortLabel',
    'volumeSwitchFrom', 'volumeSwitchTo', 'guestTitle', 'guestReadOnly',
    'noResultsTitle', 'noResultsIntro', 'noResultsFrom', 'noResultsTo',
    'resetFilters', 'range24h', 'foundCount', 'updated',
  ]) assert.ok(screener.includes('screener.main.' + key), 'missing UI binding: ' + key);
  assert.match(screener, /const \{ t, language \} = useLanguage\(\)/);
  assert.match(screener, /toLocaleTimeString\(timeLocale\)/);
  assert.match(screener, /aria-label=\{t\('screener\.main\.search'\)\}/);
  assert.match(screener, /aria-pressed=\{volumeMode === 'from'\}/);
  assert.match(screener, /isVolumeWithinCap\(coin\.volumeUsd, maxVolumeUsd, volumeMode\)/);
  assert.match(screener, /preferredVolumeSortOrder\(nextMode\)/);
  assert.match(screener, /const \[errorShowsCachedData, setErrorShowsCachedData\] = useState\(false\)/);
});

test('Screener card captions and notification tooltips no longer hardcode a single display language', () => {
  for (const key of [
    'chartRegister', 'highActivity', 'favoriteAdd', 'favoriteRemove', 'guestFavorite',
    'linkGuest', 'linkOpenGroup', 'telegramGuest', 'surveillanceGuest',
    'surveillanceCurrent', 'surveillanceAdd', 'price', 'change24h',
    'low', 'high', 'fromLow', 'fromHigh', 'turnover24h', 'volatility5m',
  ]) assert.ok(screener.includes('screener.main.' + key), 'missing card binding ' + key);
  assert.doesNotMatch(screener, /(?:title|aria-label|placeholder)="[^"]*[А-Яа-яІіЇїЄєҐґ]/);
  assert.doesNotMatch(screener, />[^<>{}\n]*[А-Яа-яІіЇїЄєҐґ][^<>{}\n]*</);
  assert.equal(translateKey('en', 'screener.main.fromHigh', { percent: '1.5' }), '−1.5% below high');
  assert.equal(translateKey('pl', 'screener.main.foundCount', { matched: 12, total: 556 }),
    'Znaleziono: 12 z 556');
  assert.equal(translateKey('ru', 'screener.main.surveillancePaused'), 'Приостановлена');
});

test('Partial Bybit/Binance source warnings do not create a red Screener banner', () => {
  assert.match(screener, /setHasPartialMarketData\(Boolean\(snapshot\.warning\)\)/);
  assert.doesNotMatch(screener, /setError\(snapshot\.warning\)/);
  assert.match(screener, /MarketDataFreshnessIcon label=\{t\('screener\.main\.staleData'\)\} kind="partial"/);
  assert.match(screener, /\{error && \(/, 'hard failures must still provide retry');
  assert.match(screener, /onClick=\{\(\) => fetchCoins\(\)\}/, 'manual retry must remain available');
  assert.match(screener, /setCoins\(applyScreenerLiveQuotes\(snapshot\.coins, afterSnapshot\)\)/,
    'partial warning must not block market data updates');
});

test('Futures market type badges display only the localized name, without USDT', () => {
  const labels = {
    uk: 'Фʼючерси',
    en: 'Futures',
    ru: 'Фьючерсы',
    pl: 'Kontrakty futures',
  } as const;
  for (const language of supportedLanguages) {
    assert.equal(translateKey(language, 'futures'), labels[language]);
    assert.doesNotMatch(translateKey(language, 'futures'), /USDT|[()]/i);
  }
  assert.equal((screener.match(/t\(coin\.marketType === 'futures' \? 'futures' : 'spot'\)/g) ?? []).length, 2,
    'both table and card badges must use the same translated market label');
  // Symbol pairs still show /USDT; only the market-type badge is shortened.
  assert.match(screener, /\/USDT/);
});
