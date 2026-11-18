import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import express from 'express';
import { readFileSync } from 'node:fs';
import {
  getFavoriteQuotes, installFavoriteQuoteRoutes, validateFavoriteQuoteKeys,
} from '../server/favoriteQuotes';
import type { RawTicker } from '../server/marketTickerFeed';
import {
  watchlistQuoteToScannedCoin, isWatchlistMarketQuote, resolveWatchlistEntries,
} from '../src/utils/watchlistUtils';

const bybit: RawTicker = {
  symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT',
  exchange: 'bybit', marketType: 'futures',
  price: 145.25, change24h: -2.75, volumeUsd: 3_100_000,
  high24h: 152, low24h: 144,
};
const binance: RawTicker = { ...bybit, exchange: 'binance', price: 147 };

function fakeFeed() {
  const calls: string[] = [];
  const feed = {
    async get(exchange: 'binance' | 'bybit', market: 'futures' | 'spot') {
      calls.push(exchange + ':' + market);
      return market === 'futures'
        ? exchange === 'bybit' ? [bybit] : [binance]
        : [];
    },
    status(exchange: 'binance' | 'bybit', marketType: 'futures' | 'spot') {
      return { exchange, marketType, status: 'live' as const, updatedAt: Date.now() };
    },
  };
  return { feed, calls };
}

test('Favorite quote keys accept only bounded full exchange:market:symbol identities', () => {
  assert.deepEqual(validateFavoriteQuoteKeys(['bybit:futures:SOLUSDT',
    'bybit:futures:SOLUSDT', 'binance:futures:SOLUSDT']),
    ['bybit:futures:SOLUSDT', 'binance:futures:SOLUSDT']);
  for (const invalid of [undefined, [], ['SOLUSDT'], ['bybit:SOLUSDT'],
    ['unknown:futures:SOLUSDT'], ['bybit:futures:../../etc'], new Array(151).fill('binance:spot:BTCUSDT')]) {
    assert.equal(validateFavoriteQuoteKeys(invalid), null);
  }
});

test('Saved Bybit SOL is quoted from shared ticker feed, independent of formation scan', async () => {
  const { feed, calls } = fakeFeed();
  const result = await getFavoriteQuotes(['bybit:futures:SOLUSDT'], feed);
  assert.deepEqual(calls, ['bybit:futures']);
  assert.deepEqual(result.data, [bybit]);
  assert.equal(result.sources[0].status, 'live');

  const converted = result.data.filter(isWatchlistMarketQuote)
    .map(row => watchlistQuoteToScannedCoin(row, Date.now()));
  assert.equal(converted[0].exchange, 'bybit');
  assert.equal(converted[0].currentPrice, 145.25);
  assert.equal(converted[0].volume24hUsd, 3_100_000);
  assert.deepEqual(converted[0].formations, []);
  const favorites = resolveWatchlistEntries(['bybit:futures:SOLUSDT'], converted);
  assert.equal(favorites[0].coin?.exchange, 'bybit');
  assert.equal(favorites[0].coin?.currentPrice, 145.25);
  assert.notEqual(favorites[0].coin?.exchange, 'binance');
});

test('Same ticker on Binance and Bybit remains two distinct favorite quotes', async () => {
  const { feed, calls } = fakeFeed();
  const result = await getFavoriteQuotes(
    ['bybit:futures:SOLUSDT', 'binance:futures:SOLUSDT'], feed);
  assert.equal(calls.length, 2);
  assert.equal(result.data.length, 2);
  assert.deepEqual(result.data.map(row => row.exchange).sort(), ['binance', 'bybit']);
});

test('Public API returns only requested symbols and rejects malformed batches', async () => {
  const app = express();
  app.use(express.json());
  const { feed, calls } = fakeFeed();
  installFavoriteQuoteRoutes(app, feed);
  const server = app.listen(0, '127.0.0.1');
  // Binding on 127.0.0.1 is async in Node 22; querying address() immediately
  // can return null. Await listening before assertions and always close the server.
  let address: ReturnType<typeof server.address>;
  try {
    await once(server, 'listening');
    address = server.address();
    assert.ok(address && typeof address !== 'string');
  } catch (error) {
    server.closeAllConnections();
    server.close();
    throw error;
  }
  const submit = (keys: unknown) => new Promise<{ code: number; json: any; headers: any }>((resolve, reject) => {
    const data = JSON.stringify({ keys });
    const request = httpRequest({
      hostname: '127.0.0.1', port: address.port,
      path: '/api/market/favorite-quotes', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve({ code: response.statusCode || 0,
        json: JSON.parse(Buffer.concat(chunks).toString()), headers: response.headers }));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end(data);
  });
  try {
    const ok = await submit(['bybit:futures:SOLUSDT']);
    assert.equal(ok.code, 200);
    assert.equal(ok.headers['cache-control'], 'no-store');
    assert.equal(ok.json.data.length, 1);
    assert.equal(ok.json.data[0].exchange, 'bybit');
    const bad = await submit(['SOLUSDT']);
    assert.equal(bad.code, 400);
    assert.equal(bad.json.success, false);
    assert.equal(calls.length, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

test('Watchlist drawer loads missing quotes only when visible and stops when closed', () => {
  const widget = readFileSync(new URL('../src/components/WatchlistDrawer.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  assert.match(app, /installFavoriteQuoteRoutes\(app\)/);
  assert.match(widget, /if \(!isOpen \|\| !missingKeySignature\) return/);
  assert.match(widget, /fetch\('\/api\/market\/favorite-quotes'/);
  assert.match(widget, /i \+= 100/);
  assert.match(widget, /setInterval\(\(\) => \{ void refresh\(\); \}, 60_000\)/);
  assert.match(widget, /controller\.abort\(\)/);
  assert.match(widget, /resolveWatchlistEntries\(watchlistSymbols, \[\.\.\.allCoins, \.\.\.marketQuotes\]\)/);
  assert.doesNotMatch(widget, /Недоступна у поточному скануванні/);
  assert.doesNotMatch(widget, /можна видалити кнопкою кошика/);
});
