import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ScannedCoin } from '../src/types';
import {
  getCoinWatchlistKey,
  isCoinInWatchlist,
  toggleCoinWatchlist,
  removeCoinFromWatchlistFolders,
  resolveWatchlistEntries,
} from '../src/utils/watchlistUtils';

const binance = { exchange: 'binance', marketType: 'futures', symbol: 'BTCUSDT' } as const;
const bybit = { exchange: 'bybit', marketType: 'futures', symbol: 'BTCUSDT' } as const;
const bybitSpot = { exchange: 'bybit', marketType: 'spot', symbol: 'BTCUSDT' } as const;

test('Favorites retain exchange and market, even for identical coin symbols', () => {
  assert.equal(getCoinWatchlistKey(bybit), 'bybit:futures:BTCUSDT');
  assert.equal(getCoinWatchlistKey(binance), 'binance:futures:BTCUSDT');
  assert.equal(getCoinWatchlistKey(bybitSpot), 'bybit:spot:BTCUSDT');
  let list = toggleCoinWatchlist([], bybit);
  assert.deepEqual(list, ['bybit:futures:BTCUSDT']);
  assert.equal(isCoinInWatchlist(list, bybit), true);
  assert.equal(isCoinInWatchlist(list, binance), false);
  assert.equal(isCoinInWatchlist(list, bybitSpot), false);
  list = toggleCoinWatchlist(list, binance);
  list = toggleCoinWatchlist(list, bybitSpot);
  assert.equal(list.length, 3);
  list = toggleCoinWatchlist(list, bybit);
  assert.deepEqual(list, ['binance:futures:BTCUSDT', 'bybit:spot:BTCUSDT']);
});

test('Old symbol-only favorites map to historic Binance futures, never to Bybit', () => {
  const old = ['BTCUSDT'];
  assert.equal(isCoinInWatchlist(old, binance), true);
  assert.equal(isCoinInWatchlist(old, bybit), false);
  assert.equal(isCoinInWatchlist(old, bybitSpot), false);
  assert.deepEqual(toggleCoinWatchlist(old, binance), []);
  assert.deepEqual(toggleCoinWatchlist(old, bybit), ['BTCUSDT', 'bybit:futures:BTCUSDT']);
});

test('Adding any exchange to favorites does not assign any existing folder', () => {
  const initialFolders = {
    'Мій список': ['binance:futures:ETHUSDT'],
    'Інша папка': [],
  };
  const list = toggleCoinWatchlist(['binance:futures:ETHUSDT'], bybit);
  assert.deepEqual(list, ['binance:futures:ETHUSDT', 'bybit:futures:BTCUSDT']);
  assert.deepEqual(initialFolders, {
    'Мій список': ['binance:futures:ETHUSDT'],
    'Інша папка': [],
  });
  assert.deepEqual(removeCoinFromWatchlistFolders(initialFolders, bybit), initialFolders);
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /const handleToggleWatchlist = \(coin: CoinIdentifier \| string\)/);
  assert.match(app, /if \(wasRemoved\) \{\s*setWatchlistFolders/);
  assert.doesNotMatch(app, /alreadyAssigned|idx === 0/);
  assert.match(app, /toggleCoinWatchlist\(previous, coin\)/);
});

test('Removing a favorite clears only its matching folder entries, preserving other exchanges', () => {
  const folders = {
    Signals: ['BTCUSDT', 'bybit:futures:BTCUSDT', 'bybit:spot:BTCUSDT'],
    Altcoins: ['binance:spot:SOLUSDT'],
  };
  assert.deepEqual(removeCoinFromWatchlistFolders(folders, bybit), {
    Signals: ['BTCUSDT', 'bybit:spot:BTCUSDT'],
    Altcoins: ['binance:spot:SOLUSDT'],
  });
  assert.deepEqual(removeCoinFromWatchlistFolders(folders, binance), {
    Signals: ['bybit:futures:BTCUSDT', 'bybit:spot:BTCUSDT'],
    Altcoins: ['binance:spot:SOLUSDT'],
  });
});

test('Drawer never substitutes a Bybit quote for an old Binance favorite', () => {
  const scanned = [
    { ...bybit, baseAsset: 'BTC', currentPrice: 110 } as ScannedCoin,
    { ...binance, baseAsset: 'BTC', currentPrice: 100 } as ScannedCoin,
  ];
  const result = resolveWatchlistEntries(['bybit:futures:BTCUSDT', 'binance:futures:BTCUSDT'], scanned);
  assert.equal(result.length, 2);
  assert.equal(result[0].exchange, 'bybit');
  assert.equal(result[0].coin?.exchange, 'bybit');
  assert.equal(result[1].exchange, 'binance');
  assert.equal(result[1].coin?.exchange, 'binance');

  const legacyUnresolved = resolveWatchlistEntries(['BTCUSDT'], scanned.slice(0, 1));
  assert.equal(legacyUnresolved[0].exchange, 'binance');
  assert.equal(legacyUnresolved[0].coin, null);
});

test('Screener grid and table send the full coin identity, while new favorites appear in general list', () => {
  const screener = readFileSync(new URL('../src/components/CoinScreenerPage.tsx', import.meta.url), 'utf8');
  const drawer = readFileSync(new URL('../src/components/WatchlistDrawer.tsx', import.meta.url), 'utf8');
  assert.equal((screener.match(/isCoinInWatchlist\(watchlist, coin\)/g) ?? []).length, 2);
  assert.equal((screener.match(/onToggleWatchlist\(coin\)/g) ?? []).length, 2);
  assert.doesNotMatch(screener, /onToggleWatchlist\(coin\.symbol\)/);
  assert.match(drawer, /const groups = \[\{/);
  assert.ok(drawer.includes("group.name || t('ui.watchlist.general')"));
  assert.ok(drawer.includes("folder || t('ui.watchlist.general')"));
  assert.match(drawer, /moveCoin\(entry, folder\)/);
});
