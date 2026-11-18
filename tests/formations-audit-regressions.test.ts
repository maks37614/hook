import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMatchingUnformedCoins } from '../src/utils/formationList';
import { interpolate, translatePhrase, supportedLanguages } from '../src/locales';
import type { ScannedCoin, ScreenerFilterState, DetectedFormation } from '../src/types';

const source = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const filters: ScreenerFilterState = {
  exchange: 'binance', marketType: 'futures', timeframe: '5m',
  category: 'all', bias: 'all', status: 'all', minVolumeUsd: 0,
  densityConfirmedOnly: false, roundNumberOnly: false,
  searchQuery: 'BTC', sortBy: 'confidence', sortOrder: 'desc',
};
const coin = (updates: Partial<ScannedCoin> = {}): ScannedCoin => ({
  symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
  exchange: 'binance', marketType: 'futures', timeframe: '5m',
  currentPrice: 100, priceChange24h: 0, highPrice24h: 100,
  lowPrice24h: 99, volume24hUsd: 900_000, lastUpdated: 1,
  exchangeUrl: '', formations: [], ...updates,
});

test('coin-only Formations search never leaks a different exchange, market, TF or below-minimum volume', () => {
  const inputs = [
    coin(), coin({ exchange: 'bybit' }), coin({ marketType: 'spot' }),
    coin({ timeframe: '15m' }), coin({ volume24hUsd: 2 }),
  ];
  assert.deepEqual(getMatchingUnformedCoins(inputs, { ...filters, minVolumeUsd: 1000 }), [inputs[0]]);
  assert.equal(getMatchingUnformedCoins(inputs, { ...filters, searchQuery: '' }).length, 0);
});

test('filtered-out formations are never incorrectly presented as unformed coins', () => {
  const pattern = { id: 'w1', name: 'Double bottom' } as DetectedFormation;
  const withPattern = coin({ formations: [pattern] });
  assert.deepEqual(getMatchingUnformedCoins([withPattern], filters), []);
  for (const change of [
    { category: 'reversal' as const },
    { bias: 'bearish' as const },
    { status: 'breakout' as const },
    { densityConfirmedOnly: true },
    { roundNumberOnly: true },
  ]) assert.deepEqual(getMatchingUnformedCoins([coin()], { ...filters, ...change }), []);
});

test('Formations cards track fresh quotes without mixing 24/7 spot and futures monitoring', () => {
  const card = source('../src/components/FormationCard.tsx');
  assert.match(card, /if \(!isChartExpanded && Number\.isFinite\(coin\.currentPrice\) && coin\.currentPrice > 0\)/);
  assert.match(card, /setLivePrice\(coin\.currentPrice\)/);
  assert.match(card, /item\.exchange === coin\.exchange && item\.marketType === coin\.marketType/);
  assert.match(card, /removeCoinFromSurveillance\(monitoredEntry\.id\)/);
  assert.doesNotMatch(card, /isCoinMonitored\(coin\.symbol, coin\.exchange\)/);
  assert.doesNotMatch(card, /isCoinOnSurveillance\(coin\.symbol, coin\.exchange\)/);
});

test('switching to early W/M never shows old regular scanner failure or launches a regular retry', () => {
  const app = source('../src/App.tsx');
  assert.match(app, /\{!earlyMode && \(error \|\| \(scanBusy && lastUpdated === null\)\) && \(/);
  assert.match(app, /!earlyMode && scanBusy && lastUpdated !== null/);
  assert.match(app, /earlyMode \? \(\s*<EarlyFormationsResults/);
  assert.match(app, /getMatchingUnformedCoins\(coins, filters\)/);
  assert.match(app, /onClick=\{\(\) => handlePageChange\('screener'\)\}/);
});

test('formation archive lookup matches exchange and market without changing existing two-argument callers', () => {
  const archive = source('../src/context/ArchiveContext.tsx');
  const details = source('../src/components/FormationDetailsModal.tsx');
  assert.match(archive, /isArchived: \(symbol: string, formationIdOrName: string, exchange\?: ExchangeId, marketType\?: MarketType\)/);
  assert.match(archive, /\(!exchange \|\| item\.exchange === exchange\)/);
  assert.match(archive, /\(!marketType \|\| item\.marketType === marketType\)/);
  // Existing lookups remain exchange-aware, but a matching saved setup must
  // not disable the Add button: users can save multiple independent ideas.
  assert.doesNotMatch(details, /if \(alreadyArchived\)/);
  assert.equal((details.match(/isArchived=\{false\}/g) || []).length, 2);
});

test('all new Formation search and empty-state strings are available in four languages', () => {
  const phrases = [
    'Знайдено {{count}} монет за пошуком "{{query}}"',
    'На поточному таймфреймі ({{timeframe}}) активних геометричних патернів ще не сформовано. Ви можете відкрити монету в терміналі або змінити таймфрейм:',
    'Відкрити у Скрінері Монет', "Об'єм:",
    'Формацій не знайдено',
    'За активними технічними фільтрами ATR, RVOL, RSI, OI або дельти формацій немає. Скидання фільтрів відновить результати. OI доступний лише для ф’ючерсів, дельта/CVD — лише для Binance; відсутні дані не підміняються оцінками.',
    'За поточними фільтрами активних формацій не виявлено. Спробуйте змінити таймфрейм (5m / 15m / 1h / 4h), обрати обидві біржі або скинути фільтри.',
  ];
  for (const phrase of phrases) for (const language of supportedLanguages) {
    const translation = translatePhrase(language, phrase);
    assert.ok(translation.length > 0 && !translation.includes('undefined'));
    if (language !== 'uk') assert.notEqual(translation, phrase, language + ': ' + phrase);
  }
  assert.equal(
    interpolate(translatePhrase('en', phrases[0]), { count: 2, query: 'BTC' }),
    'Found 2 coins matching "BTC"',
  );
});
