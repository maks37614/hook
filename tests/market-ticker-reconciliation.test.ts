import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketTickerFeed } from '../server/marketTickerFeed';

function restTicker(price: number) {
  return new Response(JSON.stringify([{
    symbol: 'BTCUSDT',
    lastPrice: String(price), priceChangePercent: '1',
    quoteVolume: '9000000', highPrice: '120', lowPrice: '80',
  }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function wsTicker(price: number, eventAt: number) {
  return { s: 'BTCUSDT', c: String(price), o: '100', h: '120', l: '80',
    q: '9100000', E: eventAt, st: 1 };
}

test('Binance REST reconciliation does not replace newer WS prices arriving mid-request', async () => {
  let clock = 1_000_000;
  let requestCount = 0;
  let finishRest!: (response: Response) => void;
  const feed = new MarketTickerFeed(async () => {
    requestCount++;
    if (requestCount === 1) return restTicker(100);
    return new Promise<Response>(resolve => { finishRest = resolve; });
  }, () => clock);

  let coins = await feed.get('binance', 'futures');
  assert.equal(coins[0].price, 100);
  assert.equal(requestCount, 1);

  clock += 61_000;
  assert.equal(feed.applyBinanceMiniTickers('futures', [wsTicker(105, clock)]), 1);
  coins = await feed.get('binance', 'futures');
  assert.equal(coins[0].price, 105);
  assert.equal(requestCount, 2, 'full REST reconciliation should run in background');

  assert.equal(feed.applyBinanceMiniTickers('futures', [wsTicker(110, clock)]), 1);
  finishRest(restTicker(103));
  // The background REST operation settles asynchronously; it must merge
  // new WS ticks instead of clobbering them with a stale snapshot.
  await new Promise(resolve => setImmediate(resolve));

  coins = await feed.get('binance', 'futures');
  assert.equal(coins[0].price, 110);
  assert.equal(feed.status('binance', 'futures').status, 'live');
});
