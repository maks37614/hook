import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { getCoinWatchlistKey, isCoinInWatchlist } from '../src/utils/watchlistUtils';
import { sharedHistoricalKlineKey } from '../src/utils/sharedHistoricalKlines';
import { supportedLanguages, translatePhrase } from '../src/locales';

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('regular Formation favorites preserve exchange and market identity', () => {
  const binanceFutures = { exchange: 'binance', marketType: 'futures', symbol: 'BTCUSDT' };
  const bybitFutures = { exchange: 'bybit', marketType: 'futures', symbol: 'BTCUSDT' };
  const binanceSpot = { exchange: 'binance', marketType: 'spot', symbol: 'BTCUSDT' };
  const favorites = [getCoinWatchlistKey(bybitFutures), getCoinWatchlistKey(binanceSpot)];
  assert.equal(isCoinInWatchlist(favorites, bybitFutures), true);
  assert.equal(isCoinInWatchlist(favorites, binanceSpot), true);
  assert.equal(isCoinInWatchlist(favorites, binanceFutures), false);
  // Legacy plain-symbol favorites still represent Binance Futures only.
  assert.equal(isCoinInWatchlist(['BTCUSDT'], binanceFutures), true);
  assert.equal(isCoinInWatchlist(['BTCUSDT'], bybitFutures), false);

  const page = read('../src/App.tsx');
  const card = read('../src/components/FormationCard.tsx');
  const table = read('../src/components/ScreenerTable.tsx');
  assert.match(page, /isWatchlisted=\{isCoinInWatchlist\(watchlist, coin\)\}/);
  assert.match(card, /onClick=\{\(\) => onToggleWatchlist\(coin\)\}/);
  assert.match(card, /onToggleWatchlist: \(coin: CoinIdentifier \| string\) => void/);
  assert.doesNotMatch(card, /onToggleWatchlist\(coin\.symbol\)/);
  assert.match(table, /const isWatchlisted = isCoinInWatchlist\(watchlist, coin\)/);
  assert.match(table, /onClick=\{\(\) => onToggleWatchlist\(coin\)\}/);
  assert.doesNotMatch(table, /watchlist\.includes\(coin\.symbol\)/);
});

test('expanded Formation quick charts share public candle history and do not duplicate fetches on rescans', () => {
  const card = read('../src/components/FormationCard.tsx');
  assert.match(card, /fetchSharedHistoricalKlines\(\{/);
  assert.match(card, /timeframe: cardTimeframe, limit: 200/);
  assert.match(card, /loadedHistoryScope === historyScope && klines\.length > 0/);
  assert.match(card, /\[isChartExpanded, cardTimeframe, coin\.exchange, coin\.marketType, coin\.symbol, historyRetry\]/);
  assert.doesNotMatch(card, /\[isChartExpanded, cardTimeframe, coin\]/);
  assert.doesNotMatch(card, /fetch\(\s*[\`'"]\/api\/klines/);
  // The underlying HookChart must not mount with zero candles and independently request 1000 more.
  assert.match(card, /\{!historyReady \? \(/);
  assert.match(card, /\) : \(\s*<TradingViewChart/);
  assert.match(card, /if \(cancelled\) return/);
  assert.match(card, /return \(\) => \{ cancelled = true; \}/);
  assert.match(card, /setHistoryError\(true\)/);
  assert.match(card, /setHistoryRetry\(value => value \+ 1\)/);
  assert.match(card, /onTimeframeChange=\{\(tf\) => setCardTimeframe\(tf\)\}/);
  assert.match(card, /onLivePriceUpdate=\{\(p\) => setLivePrice\(p\)\}/);
});

test('shared history keys never mix exchange, spot/futures, timeframe or international symbols', () => {
  const req = {
    exchange: 'binance' as const, marketType: 'futures' as const,
    symbol: '币安人生USDT', timeframe: '1h' as const, limit: 200,
  };
  const key = sharedHistoricalKlineKey(req);
  assert.match(key, /币安人生USDT/);
  assert.notEqual(key, sharedHistoricalKlineKey({ ...req, exchange: 'bybit' }));
  assert.notEqual(key, sharedHistoricalKlineKey({ ...req, marketType: 'spot' }));
  assert.notEqual(key, sharedHistoricalKlineKey({ ...req, timeframe: '5m' }));
  assert.notEqual(key, sharedHistoricalKlineKey({ ...req, symbol: 'BTCUSDT' }));
  assert.equal(key, sharedHistoricalKlineKey({ ...req, symbol: '币安人生/USDT' }));
});

test('initial Formations load shows skeleton instead of a false "nothing found" state; refresh keeps cards', () => {
  const page = read('../src/App.tsx');
  assert.match(page, /\{isLoading && lastUpdated === null \? \(/);
  assert.match(page, /setLastUpdated\(Date\.now\(\)\)/);
  assert.match(page, /key=\{key\}\s+coin=\{coin\}/);
  assert.match(page, /getVisibleFormations\(projectedCoins, filters, regularIndicatorFilters\)/);
  assert.match(page, /earlyMode \? \(\s*<EarlyFormationsResults/);
  assert.match(page, /shouldRunStandardScan\(activePage, earlyMode, chartPageActive\)/);
});

test('chart-loading error and retry have translations in four site languages', () => {
  const phrases = [
    ['Не вдалося завантажити свічки',
      'Could not load candles', 'Не удалось загрузить свечи', 'Nie udało się wczytać świec'],
    ['Повторити завантаження',
      'Retry loading', 'Повторить загрузку', 'Ponów ładowanie'],
  ];
  for (const [source, en, ru, pl] of phrases) {
    // The Ukrainian source is already the correct uk translation. Compare
    // named languages instead of assuming a zero-based English-first order.
    const expected = { uk: source, en, ru, pl };
    for (const language of supportedLanguages) {
      assert.equal(translatePhrase(language, source), expected[language],
        language + ': ' + source);
    }
  }
});
