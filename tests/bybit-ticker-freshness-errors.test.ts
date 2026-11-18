import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketTickerFeed } from '../server/marketTickerFeed';
import { ExchangeBudgetError } from '../server/exchangeHttp';

let clock = 1_800_000_000_000;
const validTick = (symbol = 'BTCUSDT') => ({
  symbol, lastPrice: '100', price24hPcnt: '0.05', turnover24h: '1000000',
  highPrice24h: '110', lowPrice24h: '90', openInterestValue: '12345', fundingRate: '0.0001',
});
const response = (rows: unknown[], code = 0) => Response.json({
  retCode: code, result: { category: 'linear', list: rows },
});

test('Bybit REST-only quotes remain live between successful 30s polls, unlike Binance 15s streams', async () => {
  const start = 1_800_000_000_000;
  clock = start;
  const feed = new MarketTickerFeed(async () => response([validTick()]), () => clock);
  const tickers = await feed.get('bybit', 'futures');
  assert.equal(tickers.length, 1);
  assert.equal(tickers[0].openInterestUsd, 12345);
  assert.equal(tickers[0].fundingRatePct, 0.01);
  assert.equal(feed.status('bybit', 'futures').status, 'live');
  clock = start + 30_000;
  assert.equal(feed.status('bybit', 'futures').status, 'live');
  clock = start + 44_999;
  assert.equal(feed.status('bybit', 'futures').status, 'live');
  clock = start + 45_000;
  assert.equal(feed.status('bybit', 'futures').status, 'stale');
  clock = start + 120_000;
  assert.equal(feed.status('bybit', 'futures').status, 'unavailable');
  assert.equal(feed.status('binance', 'futures').status, 'unavailable');
});

test('Bybit HTTP 403 does not falsely claim a regional ban or use a second hostname', async () => {
  clock = 1_800_000_010_000;
  const requests: string[] = [];
  const feed = new MarketTickerFeed(async input => {
    requests.push(String(input));
    return new Response('Forbidden', { status: 403 });
  }, () => clock);
  assert.deepEqual(await feed.get('bybit', 'futures'), []);
  assert.equal(requests.length, 1);
  const status = feed.status('bybit', 'futures');
  assert.equal(status.status, 'unavailable');
  assert.equal(status.httpStatus, 403);
  assert.match(status.error || '', /IP-квота/);
  assert.doesNotMatch(status.error || '', /регіону сервера/);
  clock += 60_000;
  await feed.get('bybit', 'futures');
  assert.equal(requests.length, 1, 'IP cooldown prevents repeated calls during ten-minute 403 pause');
});

test('Bybit HTTP 200 retCode 10006 throttles requests and records exact code', async () => {
  clock = 1_800_000_020_000;
  const requests: string[] = [];
  const feed = new MarketTickerFeed(async input => {
    requests.push(String(input));
    return response([], 10006);
  }, () => clock);
  assert.deepEqual(await feed.get('bybit', 'futures'), []);
  assert.equal(requests.length, 1);
  assert.match(feed.status('bybit', 'futures').error || '', /10006/);
  assert.match(feed.diagnostics()[0].lastRestFailure || '', /retCode 10006/);
  clock += 30_000;
  await feed.get('bybit', 'futures');
  assert.equal(requests.length, 1);
});

test('invalid or non-USDT Bybit responses cannot mark a feed successfully refreshed', async () => {
  clock = 1_800_000_030_000;
  const calls: string[] = [];
  const feed = new MarketTickerFeed(async input => {
    calls.push(String(input));
    return response(calls.length === 1 ? [{ ...validTick(), symbol: 'BTCUSDC' }] : [validTick()]);
  }, () => clock);
  const ticks = await feed.get('bybit', 'futures');
  assert.equal(calls.length, 2, 'a malformed first host result allows one alternate-host recovery');
  assert.deepEqual(ticks.map(t => t.symbol), ['BTCUSDT']);
  assert.equal(feed.status('bybit', 'futures').status, 'live');
  assert.equal(feed.diagnostics()[0].restSuccesses, 1);
  assert.equal(feed.diagnostics()[0].restFailures, 0);
});

test('local REST budget cooldown does not retry the same Bybit IP over another host', async () => {
  clock = 1_800_000_040_000;
  let requests = 0;
  const feed = new MarketTickerFeed(async () => {
    requests++;
    throw new ExchangeBudgetError('Exchange bybit cooling down');
  }, () => clock);
  assert.deepEqual(await feed.get('bybit', 'futures'), []);
  assert.equal(requests, 1);
  assert.match(feed.status('bybit', 'futures').error || '', /локального ліміту/);
  assert.match(feed.diagnostics()[0].lastRestFailure || '', /Local REST budget/);
  clock += 10_000;
  await feed.get('bybit', 'futures');
  assert.equal(requests, 1, 'short local cooldown should not amplify REST load');
});
