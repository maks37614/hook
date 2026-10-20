import test from 'node:test';
import assert from 'node:assert/strict';
import type { Kline, MarketCoin } from '../src/types';
import { DAY_SECONDS as DAY, prepareLocationHistory, classifyMarketLocation } from '../src/utils/marketLocation';
import { MarketLocationCache } from '../src/utils/marketLocationCache';

const now = Date.UTC(2026, 9, 7, 12);
const today = Math.floor(now / 1000 / DAY) * DAY;
function candles(days = 730, low = 10, high = 110): Kline[] {
  return Array.from({ length: days }, (_, i) => ({ time: today - (days - i) * DAY,
    open: (low + high) / 2, close: (low + high) / 2, high, low, volume: 100 }));
}
const coin = (symbol = 'BTCUSDT', price = 100, marketType: 'spot' | 'futures' = 'spot') => ({
  symbol, price, exchange: 'binance', marketType, isNearHigh: true, isNearLow: true,
} as MarketCoin);
const flush = () => new Promise(resolve => setImmediate(resolve));

test('narrow ranges never show both badges; middle is neither and thresholds are symmetric', () => {
  const history = prepareLocationHistory(candles(730, 99, 101), now)!;
  for (const [price, high, low] of [[100, false, false], [100.5, true, false], [99.5, false, true],
    [102, true, false], [98, false, true]] as const) {
    const result = classifyMarketLocation(price, history, now);
    assert.equal(result.isNearHigh, high);
    assert.equal(result.isNearLow, low);
  }
});

test('local highs below old highs keep separate horizon positions rather than an ATH-only flag', () => {
  const data = candles();
  for (const c of data.slice(-30)) Object.assign(c, { low: 10, high: 20, open: 15, close: 15 });
  const result = classifyMarketLocation(20, prepareLocationHistory(data, now), now);
  assert.equal(result.location.ranges[0].position, 100);
  assert.equal(result.location.ranges.at(-1)!.position, 10);
  assert.equal(result.isNearHigh, false);
  assert.equal(result.isNearLow, true);
});

test('only complete windows count; short histories, flat ranges, malformed or gapped data stay unknown', () => {
  const history = prepareLocationHistory(candles(100), now)!;
  assert.deepEqual(history.ranges.map(r => r.days), [30, 90]);
  assert.equal(classifyMarketLocation(85, history, now).location.score, 75);
  const gap = candles(100); gap.splice(50, 1);
  const bad = candles(); bad[729].close = Infinity;
  const duplicate = candles(); duplicate[729].time = duplicate[728].time;
  for (const data of [[], candles(29), candles(100, 10, 10), gap, bad, duplicate, candles().slice(0, -1)]) {
    assert.equal(prepareLocationHistory(data, now), null);
    const result = classifyMarketLocation(100, prepareLocationHistory(data, now), now);
    assert.equal(result.location.score, null);
    assert.equal(result.isNearHigh || result.isNearLow, false);
  }
});

test('live/future candles cannot change reference levels; stale history and invalid prices suppress badges', () => {
  const data = candles();
  const expected = prepareLocationHistory(data, now)!;
  data.push({ ...data[0], time: today, high: 10000 }, { ...data[0], time: today + DAY, high: 20000 });
  assert.deepEqual(prepareLocationHistory(data, now), expected);
  for (const price of [NaN, Infinity, 0, -1]) assert.equal(classifyMarketLocation(price, expected, now).location.score, null);
  assert.equal(classifyMarketLocation(110, expected, now + 2 * DAY * 1000).location.score, null);
});

test('trend and ATR describe context without moving location or making high mean reversal', () => {
  const history = prepareLocationHistory(candles(), now)!;
  const up = classifyMarketLocation(112, { ...history, trend: 'bullish' }, now);
  const down = classifyMarketLocation(112, { ...history, trend: 'bearish' }, now);
  assert.equal(up.location.score, down.location.score);
  assert.equal(up.location.score, 100);
  assert.ok(up.location.distanceHighATR! < 0);
  assert.equal(up.isNearHigh, true);
});

test('cache returns immediately, coalesces requests, isolates markets and reprices cached ranges', async () => {
  let requests = 0;
  const resolvers: ((value: Kline[]) => void)[] = [];
  const cache = new MarketLocationCache(async () => {
    requests++;
    return await new Promise<Kline[]>(resolve => resolvers.push(resolve));
  }, () => now, 2, 0);
  const first = cache.enrich([coin(), coin('BTCUSDT', 100, 'futures'), coin('ETHUSDT')]);
  assert.ok(first.every(c => !c.isNearHigh && !c.isNearLow));
  cache.enrich([coin()]);
  await flush();
  assert.equal(requests, 2);
  resolvers[0](candles()); resolvers[1](candles(100, 90, 190));
  await flush();
  assert.equal(requests, 3);
  const updated = cache.enrich([coin(), coin('BTCUSDT', 100, 'futures'), coin('BTCUSDT', 15)]);
  assert.equal(updated[0].isNearHigh, true);
  assert.equal(updated[1].isNearLow, true);
  assert.equal(updated[2].isNearLow, true);
  resolvers[2](candles()); await flush();
  assert.equal(requests, 3);
});

test('failed fetches back off, recover, and eventually stop using old history', async () => {
  let clock = now, requests = 0, fail = true;
  const cache = new MarketLocationCache(async () => {
    requests++;
    if (fail) throw new Error('offline');
    return candles();
  }, () => clock, 1, 0);
  cache.enrich([coin()]); await flush();
  cache.enrich([coin()]); await flush();
  assert.equal(requests, 1);
  clock += 300_001; fail = false;
  cache.enrich([coin()]); await flush();
  assert.equal(cache.enrich([coin()])[0].isNearHigh, true);
  clock += 3600_001; fail = true;
  cache.enrich([coin()]); await flush();
  assert.equal(cache.enrich([coin()])[0].isNearHigh, true);
  clock += 2 * DAY * 1000;
  assert.equal(cache.enrich([coin()])[0].location!.status, 'insufficient_history');
  await flush();
});
