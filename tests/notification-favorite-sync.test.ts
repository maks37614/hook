import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeNotificationFavoriteIds, normalizeSiteNotificationSettings, matchesNotificationScope } from '../src/utils/siteNotifications';

test('favorite scopes sync canonical exchange-market pairs, not untrusted keys', () => {
  const input = ['BTCUSDT','bybit:spot:BTCUSDT','binance:futures:ETHUSDT','garbage:exploit','bybit:futures:BTCUSDT','binance:invalid-market:BAD'];
  const ids = normalizeNotificationFavoriteIds(input);
  assert.deepEqual(ids, ['binance:futures:BTCUSDT','bybit:spot:BTCUSDT',
    'binance:futures:ETHUSDT','bybit:futures:BTCUSDT']);
  assert.deepEqual(normalizeNotificationFavoriteIds(['BTCUSDT','btcUsdt']),['binance:futures:BTCUSDT']);
  assert.deepEqual(normalizeNotificationFavoriteIds({ not: 'array' }),[]);
});

test('server-side favorite scope matches actual selected exchange and market only', () => {
  const cfg=normalizeSiteNotificationSettings({
    optedIn: true, enabled: true, price: true, onlyFavorites: true,
    favoriteIds: ['bybit:spot:BTCUSDT'],
  });
  assert.deepEqual(cfg.favoriteIds,['bybit:spot:BTCUSDT']);
  assert.equal(matchesNotificationScope(cfg,
    {symbol:'BTCUSDT',exchange:'bybit',marketType:'spot'},cfg.favoriteIds,{timeframeIndependent:true}),true);
  assert.equal(matchesNotificationScope(cfg,
    {symbol:'BTCUSDT',exchange:'bybit',marketType:'futures'},cfg.favoriteIds,{timeframeIndependent:true}),false);
  assert.equal(matchesNotificationScope(cfg,
    {symbol:'BTCUSDT',exchange:'binance',marketType:'spot'},cfg.favoriteIds,{timeframeIndependent:true}),false);
  assert.equal(matchesNotificationScope(cfg,
    {symbol:'ETHUSDT',exchange:'bybit',marketType:'spot'},cfg.favoriteIds,{timeframeIndependent:true}),false);
});

test('favorite scopes are checked locally and no watchlist edit writes to VPS', () => {
  const client=readFileSync(new URL('../src/context/SiteNotificationsContext.tsx',import.meta.url),'utf8');
  assert.match(client, /favoritesRef\.current = normalized/);
  assert.doesNotMatch(client, /void updateSettings\(\{ favoriteIds: normalized \}\)/);
  assert.match(client, /patch\.onlyFavorites === true && patch\.favoriteIds === undefined/);
  assert.doesNotMatch(client, /\/api\/notification-preferences/);
});
