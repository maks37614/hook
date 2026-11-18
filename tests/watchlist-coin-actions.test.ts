import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chartPageHash } from '../src/utils/chartPageRoute';
import { getCoinWatchlistKey, resolveWatchlistEntries, watchlistDisplayName, watchlistEntryToChartCoin } from '../src/utils/watchlistUtils';
import type { ScannedCoin } from '../src/types';

test('favorite action sends exact Bybit futures pair to its chart and keeps timeframe', () => {
  const coin = {
    symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT',
    exchange: 'bybit', marketType: 'futures', timeframe: '5m',
    currentPrice: 1950, priceChange24h: -2.1, volume24hUsd: 2000, formations: [],
    lastUpdated: 1, highPrice24h: 1980, lowPrice24h: 1920, exchangeUrl: '',
  } as ScannedCoin;
  const [entry] = resolveWatchlistEntries([getCoinWatchlistKey(coin)], [coin]);
  assert.equal(watchlistDisplayName(entry), 'ETH');
  const selected = watchlistEntryToChartCoin(entry, '1h');
  assert.equal(selected.exchange, 'bybit');
  assert.equal(selected.marketType, 'futures');
  assert.equal(selected.currentPrice, 1950);
  assert.equal(selected.timeframe, '1h');
  assert.deepEqual(selected.formations, []);
  assert.equal(chartPageHash({ exchange: selected.exchange, marketType: selected.marketType,
    symbol: selected.symbol, timeframe: selected.timeframe, kind: 'coin' }), '#/chart/bybit/futures/ETHUSDT/1h');
});

test('missing quote still opens a chart for the correct exchange and never switches markets', () => {
  const [bybit, binance] = resolveWatchlistEntries(['bybit:spot:NVDAUSDT', 'binance:futures:NVDAUSDT'], []);
  const bybitCoin = watchlistEntryToChartCoin(bybit, '15m');
  const binanceCoin = watchlistEntryToChartCoin(binance, '15m');
  assert.equal(bybit.coin, null);
  assert.equal(watchlistDisplayName(bybit), 'NVDA');
  assert.deepEqual([bybitCoin.exchange, bybitCoin.marketType, bybitCoin.symbol], ['bybit','spot','NVDAUSDT']);
  assert.deepEqual([binanceCoin.exchange, binanceCoin.marketType, binanceCoin.symbol], ['binance','futures','NVDAUSDT']);
  assert.equal(bybitCoin.baseAsset, 'NVDA');
  assert.equal(bybitCoin.quoteAsset, 'USDT');
  assert.deepEqual(bybitCoin.formations, []);
  assert.equal(bybitCoin.currentPrice, 0);
});

test('tap on coin name offers chart and copy in a matching dark popup without changing folder actions', () => {
  const drawer = readFileSync(new URL('../src/components/WatchlistDrawer.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(drawer, /onClick=\{\(event\) => openCoinMenu\(entry, event\.currentTarget\)\}/);
  assert.match(drawer, /data-watchlist-coin-actions/);
  assert.match(drawer, /role="menu"/);
  assert.match(drawer, /role="menuitem"/);
  assert.match(drawer, /ui\.watchlist\.openChart/);
  assert.match(drawer, /ui\.watchlist\.copySymbol/);
  assert.match(drawer, /copyTextToClipboard\(entry\.symbol\)/);
  assert.doesNotMatch(drawer, /copyTextToClipboard\(watchlistDisplayName\(entry\)\)/);
  assert.ok(drawer.includes("t('ui.watchlist.copySymbol', { symbol })"));
  assert.match(drawer, /onOpenChart\(entry\)/);
  assert.match(drawer, /data-watchlist-folder-menu/);
  assert.match(drawer, /moveCoin\(entry, folder\)/);
  assert.match(drawer, /removeCoin\(entry\)/);
  assert.match(app, /onOpenChart=\{handleOpenWatchlistChart\}/);
  assert.match(app, /watchlistEntryToChartCoin\(entry, preferences\.defaultTimeframe\)/);
  assert.match(app, /setIsWatchlistOpen\(false\);\s*openChartPage\(/);
});

test('favorite name action copies only the normalized exchange symbol, with no separator or exchange', () => {
  const [bybit, binance] = resolveWatchlistEntries(
    ['bybit:futures:BTCUSDT', 'binance:spot:ETHUSDT'], [],
  );
  assert.equal(bybit.symbol, 'BTCUSDT');
  assert.equal(binance.symbol, 'ETHUSDT');
  assert.equal(watchlistDisplayName(bybit), 'BTC');
  assert.notEqual(bybit.symbol, 'BTC/USDT');
  assert.notEqual(bybit.symbol, bybit.key);
});
