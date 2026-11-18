import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketTickerFeed } from '../server/marketTickerFeed';

const snapshot = [{ symbol: 'BTCUSDT', lastPrice: '100', priceChangePercent: '1',
  quoteVolume: '900', highPrice: '101', lowPrice: '98' }];

test('Binance mini-ticker WebSocket refreshes full market quotes without repeated REST snapshots', async () => {
  let now = 1_000, calls = 0;
  const feed = new MarketTickerFeed(async () => {
    calls++;
    return Response.json(snapshot);
  }, () => now);
  await feed.get('binance', 'spot');
  assert.equal(calls, 1);
  now = 11_000;
  assert.equal(feed.applyBinanceMiniTickers('spot', [
    { s: 'BTCUSDT', o: '100', c: '110', h: '112', l: '97', q: '1200' },
  ]), 1);
  assert.equal((await feed.get('binance', 'spot'))[0].price, 110);
  assert.equal((await feed.get('binance', 'spot'))[0].change24h, 10);
  assert.equal((await feed.get('binance', 'spot'))[0].volumeUsd, 1200);
  assert.equal(calls, 1, 'no per-user REST fetches while WebSocket remains live');
  now = 61_100;
  feed.applyBinanceMiniTickers('spot', [{ s: 'BTCUSDT', o: '100', c: '112', h: '113', l: '98', q: '1250' }]);
  await feed.get('binance', 'spot');
  assert.equal(calls, 2, 'periodic full REST reconciliation still discovers changed markets');
});

test('mini-ticker batches cannot introduce unknown coins or invalid prices', async () => {
  let now = 1_000;
  const feed = new MarketTickerFeed(async () => Response.json(snapshot), () => now);
  assert.equal(feed.applyBinanceMiniTickers('futures', [{ s: 'BTCUSDT', c: '100' }]), 0,
    'WS delta alone is not a full symbol universe');
  const original = await feed.get('binance', 'futures');
  now = 11_000;
  assert.equal(feed.applyBinanceMiniTickers('futures', [
    { s: 'FOOUSDT', o: '1', c: '2', h: '2', l: '1', q: '2000' },
    { s: 'BTCUSDT', o: '100', c: '-5', h: '105', l: '98', q: '1000' },
  ]), 0);
  assert.deepEqual(await feed.get('binance', 'futures'), original);
});

test('USD-M screener ignores same-symbol COIN-M mini-ticker records', async () => {
  const feed = new MarketTickerFeed(async () => Response.json(snapshot), () => 1_000);
  await feed.get('binance', 'futures');
  assert.equal(feed.applyBinanceMiniTickers('futures',
    [{ s: 'BTCUSDT', st: 2, o: '100', c: '999', h: '1000', l: '90', q: '1000' }]), 0);
  assert.equal((await feed.get('binance', 'futures'))[0].price, 100);
  assert.equal(feed.applyBinanceMiniTickers('futures',
    [{ s: 'BTCUSDT', st: 1, o: '100', c: '120', h: '123', l: '90', q: '1500' }]), 1);
  assert.equal((await feed.get('binance', 'futures'))[0].price, 120);
});

test('slow REST reconciliation never delays dozens of users while market WebSocket is healthy', async () => {
  let now = 1_000, calls = 0;
  let releaseReconcile: ((response: Response) => void) | undefined;
  const feed = new MarketTickerFeed(async () => {
    calls++;
    return calls === 1 ? Response.json(snapshot) : new Promise<Response>(resolve => {
      releaseReconcile = resolve;
    });
  }, () => now);
  await feed.get('binance', 'futures');
  now = 61_200;
  feed.applyBinanceMiniTickers('futures',
    [{ s: 'BTCUSDT', st: 1, o: '100', c: '130', h: '131', l: '98', q: '1200' }]);
  const quotes = await Promise.all(Array.from({ length: 150 }, () => feed.get('binance', 'futures')));
  assert.equal(calls, 2);
  assert.ok(quotes.every(q => q[0]?.price === 130), 'the fresh stream quote must not wait for REST');
  assert.ok(releaseReconcile, 'a single shared reconciliation should be in flight');
  releaseReconcile(Response.json([{ ...snapshot[0], lastPrice: '131' }]));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal((await feed.get('binance', 'futures'))[0].price, 131);
});

test('out-of-date Binance stream frames do not overwrite fresh Screener market quotes', async () => {
  let now = 100_000;
  const feed = new MarketTickerFeed(async () => Response.json(snapshot), () => now);
  await feed.get('binance', 'futures');
  assert.equal(feed.applyBinanceMiniTickers('futures', [
    { s: 'BTCUSDT', st: 1, E: 60_000, o: '100', c: '999', h: '999', l: '98', q: '5000' },
  ]), 0);
  assert.equal((await feed.get('binance', 'futures'))[0].price, 100);
  assert.equal(feed.applyBinanceMiniTickers('futures', [
    { s: 'BTCUSDT', st: 1, E: now, o: '100', c: '123', h: '130', l: '98', q: '2000' },
  ]), 1);
  assert.equal((await feed.get('binance', 'futures'))[0].price, 123);
});
