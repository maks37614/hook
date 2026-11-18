import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { notificationChartTarget, notificationCoinTitleParts } from '../src/utils/notificationChartLink';
import { DEFAULT_APP_PREFERENCES } from '../src/utils/userPreferences';
import type { SiteNotificationItem } from '../src/utils/siteNotifications';
import type { ScannedCoin } from '../src/types';

const item = (overrides: Partial<SiteNotificationItem> = {}): SiteNotificationItem => ({
  id: 'event-1', kind: 'openInterest', symbol: 'AKEUSDT',
  title: 'Аномалія OI · AKEUSDT', description: 'OI -3.07% за 15м',
  timestamp: 1_700_000_000_000, read: false,
  exchange: 'bybit', marketType: 'futures', timeframe: '15m', ...overrides,
});
const coin = (exchange: 'binance' | 'bybit', marketType: 'spot' | 'futures'): ScannedCoin => ({
  exchange, marketType, timeframe: '1h', symbol: 'AKEUSDT',
  baseAsset: 'AKE', quoteAsset: 'USDT', currentPrice: 1.5,
  priceChange24h: 2, volume24hUsd: 100000, highPrice24h: 1.8, lowPrice24h: 1.2,
  formations: [{ id: 'from-another-scan' } as ScannedCoin['formations'][number]],
  lastUpdated: 100, exchangeUrl: '',
});

test('coin text is a separate clickable link and the rest of the alert label is preserved', () => {
  assert.deepEqual(notificationCoinTitleParts(item()), {
    label: 'Аномалія OI · ', symbol: 'AKEUSDT',
  });
  assert.deepEqual(notificationCoinTitleParts(item({ title: 'Нова формація' })), {
    label: 'Нова формація · ', symbol: 'AKEUSDT',
  });
  assert.deepEqual(notificationCoinTitleParts(item({ symbol: '<bad-symbol>' })), {
    label: 'Аномалія OI · AKEUSDT', symbol: '',
  });
});

test('clicking Bybit futures notification preserves exact source even with Binance matching symbol', () => {
  const target = notificationChartTarget(item(), [
    coin('binance','futures'), coin('bybit','spot'), coin('bybit','futures'),
  ], DEFAULT_APP_PREFERENCES);
  assert.deepEqual(target?.route, {
    exchange: 'bybit', marketType: 'futures', symbol: 'AKEUSDT',
    timeframe: '15m', kind: 'coin',
  });
  assert.equal(target?.snapshot.coin.exchange, 'bybit');
  assert.equal(target?.snapshot.coin.marketType, 'futures');
  assert.equal(target?.snapshot.coin.formations.length, 0,
    'notification navigation never shows unrelated formations');
});

test('Bybit spot notifications never navigate to the same-symbol Binance or futures chart', () => {
  const target = notificationChartTarget(item({ marketType: 'spot' }), [
    coin('binance','futures'), coin('bybit','futures'), coin('bybit','spot'),
  ], DEFAULT_APP_PREFERENCES);
  assert.equal(target?.route.exchange, 'bybit');
  assert.equal(target?.route.marketType, 'spot');
  assert.equal(target?.snapshot.coin.currentPrice, 1.5);
});

test('older events without exchange use chosen defaults; missing coins open a live fallback chart', () => {
  const p = { ...DEFAULT_APP_PREFERENCES,
    defaultExchange: 'binance' as const, defaultMarketType: 'spot' as const,
    defaultTimeframe: '5m' as const };
  const target = notificationChartTarget(item({
    exchange: undefined, marketType: undefined, timeframe: undefined,
  }), [], p);
  assert.deepEqual(target?.route, {
    exchange: 'binance', marketType: 'spot', symbol: 'AKEUSDT',
    timeframe: '5m', kind: 'coin',
  });
  assert.equal(target?.snapshot.coin.formations.length, 0);
  assert.equal(target?.snapshot.coin.currentPrice, 0);
  assert.equal(notificationChartTarget(item({symbol:'',title:'System offline'}), [], p), null);
});

test('notification bell separates chart navigation from copy action and is reachable from site Header', () => {
  const bell = readFileSync(new URL('../src/components/SiteNotificationBell.tsx', import.meta.url),'utf8');
  const header = readFileSync(new URL('../src/components/Header.tsx', import.meta.url),'utf8');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url),'utf8');
  assert.match(bell, /onOpenChart\(item\)/);
  assert.match(bell, /copyTextToClipboard\(symbol\)/);
  assert.match(bell, /event\.stopPropagation\(\)/);
  assert.match(bell, /aria-label=\{t\('ui\.copy\.symbol', \{ symbol \}\)\}/);
  assert.match(header, /onOpenChart=\{onOpenNotificationChart\}/);
  assert.match(app, /onOpenNotificationChart=\{openNotificationCoinChart\}/);
  assert.match(app, /openChartPage\(target\.route, target\.snapshot\)/);
});
