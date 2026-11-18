import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MarketTickerFeed } from '../server/marketTickerFeed';

test('failed REST reconciliation does not invalidate fresh Binance WS prices', async () => {
  let now = Date.now();
  let attempts = 0;
  const request = (async () => {
    attempts++;
    if (attempts === 1) return new Response(JSON.stringify([{
      symbol: 'BTCUSDT', lastPrice: '100', priceChangePercent: '1.0',
      quoteVolume: '100000000', highPrice: '110', lowPrice: '90',
    }]), { status: 200 });
    throw new Error('ETIMEDOUT during periodic REST reconciliation');
  }) as typeof fetch;
  const feed = new MarketTickerFeed(request, () => now);
  assert.equal((await feed.get('binance', 'futures')).length, 1);
  now += 61_000;
  assert.equal(feed.applyBinanceMiniTickers('futures', [{
    s: 'BTCUSDT', st: 1, E: now, c: '101', o: '100',
    h: '110', l: '90', q: '100000000',
  }]), 1);
  assert.equal((await feed.get('binance', 'futures'))[0].price, 101);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(attempts, 2);
  assert.equal(feed.status('binance', 'futures').status, 'live');
  const stats = feed.diagnostics().find(item => item.source === 'binance:futures');
  assert.equal(stats?.restFailures, 1);
  assert.match(stats?.lastRestFailure || '', /ETIMEDOUT/);
  now += 16_000;
  assert.equal(feed.status('binance', 'futures').status, 'stale');
});
