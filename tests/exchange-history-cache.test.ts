import test from 'node:test';
import assert from 'node:assert/strict';
import { ExchangeHistoryCache } from '../server/exchangeHistoryCache';

const endpoint = 'https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=2';
const valid = (data: any) => Array.isArray(data) && data.length > 0;

test('200 simultaneous OI history readers produce one exchange request, not 200', async () => {
  let calls = 0;
  const cache = new ExchangeHistoryCache(async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return Response.json([{ sumOpenInterestValue: '100', sumOpenInterest: '1' }]);
  }, () => 100_000);
  const results = await Promise.all(Array.from({ length: 200 }, () => cache.get(endpoint, valid)));
  assert.equal(calls, 1);
  assert.equal(results.length, 200);
  assert.ok(results.every(x => x?.[0]?.sumOpenInterestValue === '100'));
});

test('OI history refreshes after 60 seconds, while current OI can still be sampled more frequently', async () => {
  let calls = 0, now = 100_000;
  const cache = new ExchangeHistoryCache(async () => {
    calls++;
    return Response.json([{ sumOpenInterestValue: String(calls * 100) }]);
  }, () => now);
  assert.equal((await cache.get(endpoint, valid))[0].sumOpenInterestValue, '100');
  now += 15_000;
  assert.equal((await cache.get(endpoint, valid))[0].sumOpenInterestValue, '100');
  assert.equal(calls, 1);
  now += 45_000;
  assert.equal((await cache.get(endpoint, valid))[0].sumOpenInterestValue, '200');
  assert.equal(calls, 2);
});

test('rate-limit replies and invalid payloads are never cached as live historical OI', async () => {
  let calls = 0;
  const cache = new ExchangeHistoryCache(async () => {
    calls++;
    if (calls === 1) return Response.json({ retCode: 10006 }, { status: 429 });
    if (calls === 2) return Response.json({ invalid: true });
    return Response.json({ retCode: 0, result: { list: [{ openInterest: '5' }] } });
  });
  const bybitUrl = 'https://api.bybit.com/v5/market/open-interest?symbol=BTCUSDT&intervalTime=5min';
  const bybitValid = (json: any) => json?.retCode === 0 && Array.isArray(json?.result?.list);
  assert.equal(await cache.get(bybitUrl, bybitValid), null);
  assert.equal(await cache.get(bybitUrl, bybitValid), null);
  assert.equal((await cache.get(bybitUrl, bybitValid)).result.list[0].openInterest, '5');
  assert.equal(calls, 3);
  assert.equal(cache.stats().cachedSeries, 1);
});

test('historical series cache has a strict memory cap', async () => {
  let n = 0;
  const cache = new ExchangeHistoryCache(async () => Response.json([{ value: ++n }]),
    Date.now, 60_000, 3);
  for (let i = 0; i < 20; i++)
    await cache.get(endpoint + '&series=' + i, valid);
  assert.equal(cache.stats().cachedSeries, 3);
});
