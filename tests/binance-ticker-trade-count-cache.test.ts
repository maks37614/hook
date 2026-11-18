import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MarketTickerFeed } from '../server/marketTickerFeed';

test('verified Binance full-market REST response serves 24h trade counts without per-symbol REST', async () => {
  let clock = 1_000_000;
  let requests = 0;
  const request = (async () => {
    requests++;
    return Response.json([
      { symbol: 'BTCUSDT', lastPrice: '100', priceChangePercent: '1',
        quoteVolume: '1000000', highPrice: '101', lowPrice: '99', count: 12345 },
      { symbol: 'ETHUSDT', lastPrice: '90', priceChangePercent: '2',
        quoteVolume: '2000000', highPrice: '91', lowPrice: '89', count: 0 },
    ]);
  }) as typeof fetch;
  const feed = new MarketTickerFeed(request, () => clock);
  assert.equal(feed.getBinance24hTradeCount('futures', 'BTCUSDT'), null);
  const rows = await feed.get('binance', 'futures');
  assert.equal(rows.length, 2);
  assert.equal(Object.hasOwn(rows[0], 'tradeCount24h'), false,
    'do not inflate public ticker payloads for every viewer');
  assert.equal(feed.getBinance24hTradeCount('futures', 'BTCUSDT'), 12345);
  assert.equal(feed.getBinance24hTradeCount('futures', 'ETHUSDT'), 0);
  assert.equal(feed.getBinance24hTradeCount('spot', 'BTCUSDT'), null);
  assert.equal(feed.getBinance24hTradeCount('futures', 'UNKNOWNUSDT'), null);
  assert.equal(requests, 1, 'cache lookups must perform no REST calls');
  clock += 59_999;
  assert.equal(feed.getBinance24hTradeCount('futures', 'BTCUSDT'), 12345);
  clock += 1;
  assert.equal(feed.getBinance24hTradeCount('futures', 'BTCUSDT'), null,
    'expired counts must fall through to on-demand REST');
  assert.equal(requests, 1);
});

test('invalid Binance trade counts never replace a verified count with fabricated data', async () => {
  const feed = new MarketTickerFeed(async () => Response.json([
    { symbol: 'BTCUSDT', lastPrice: '100', priceChangePercent: '1',
      quoteVolume: '1000000', highPrice: '101', lowPrice: '99', count: '12345' },
  ]), () => 1_000_000);
  await feed.get('binance', 'futures');
  assert.equal(feed.getBinance24hTradeCount('futures', 'BTCUSDT'), null);
});

test('trade-count endpoint checks the shared cache before existing Binance fallback', () => {
  const source = readFileSync(new URL('../server/chartMarketStats.ts', import.meta.url), 'utf8');
  assert.match(source, /marketTickerFeed\.getBinance24hTradeCount\(market, symbol\)/);
  assert.match(source, /if \(knownCount !== null\) return knownCount/);
  assert.match(source, /chartExchangeFetch\(/,
    'missing or expired counts must still use the original Binance endpoint');
});
