import test from 'node:test';
import assert from 'node:assert/strict';
import { candlesBeforeHistoryEnd, clampHookChartHistory, extendHookChartHistory, scopedHookChartHistoryRows } from '../src/utils/hookChartHistory';

const candle = (time: number) => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 });
test('HookChart history preference clamps to 100–5000', () => {
  assert.equal(clampHookChartHistory(5000), 5000);
  assert.equal(clampHookChartHistory(9000), 5000);
  assert.equal(clampHookChartHistory(20), 100);
  assert.equal(clampHookChartHistory('3200'), 3200);
});
test('Chart extends 180 recent candles to 5000 without duplicates, using paged endTime', async () => {
  const original = Array.from({ length: 180 }, (_,i) => candle(4821+i));
  const calls: { endTime:number;limit:number }[]=[];
  const result = await extendHookChartHistory(original, 5000, async (endTime, limit) => {
    calls.push({endTime,limit});
    const newest = Math.floor(endTime / 1000);
    return Array.from({ length: limit }, (_,i) => candle(newest-limit+1+i));
  });
  assert.equal(result.length, 5000);
  assert.equal(new Set(result.map(x => x.time)).size, 5000);
  assert.equal(result.at(-1)?.time, 5000);
  assert.ok(calls.length <= 5);
  assert.ok(calls.every(x => x.limit <= 1000));
});
test('Insufficient older exchange history leaves real available candles without inventing data', async () => {
  const rows = await extendHookChartHistory([candle(2),candle(3)],5000, async () => [candle(1)]);
  assert.deepEqual(rows.map(x => x.time),[1,2,3]);
});

test('Short exchange history pages keep extending and update loaded count each page', async () => {
  const original = Array.from({ length: 20 }, (_,i) => candle(81+i));
  const progress: number[] = [];
  const result = await extendHookChartHistory(original, 100, async (endTime, limit) => {
    const newest = Math.floor(endTime / 1000);
    const size = Math.min(limit, 20);
    return Array.from({ length: size }, (_,i) => candle(newest-size+1+i));
  }, rows => progress.push(rows.length));
  assert.equal(result.length, 100);
  assert.deepEqual(progress, [40, 60, 80, 100]);
});

test('Older candles already fetched are reported before a subsequent request fails', async () => {
  const original = Array.from({ length: 20 }, (_,i) => candle(81+i));
  const received: number[] = [];
  let calls = 0;
  await assert.rejects(
    extendHookChartHistory(original, 100, async (endTime, limit) => {
      if (++calls > 1) throw new Error('temporary exchange outage');
      const newest = Math.floor(endTime / 1000);
      return Array.from({ length: Math.min(limit, 20) }, (_,i) => candle(newest-19+i));
    }, rows => received.push(rows.length)),
    /temporary exchange outage/
  );
  assert.deepEqual(received, [40]);
});

test('Older history is isolated to the exact exchange, market, symbol and timeframe', () => {
  const btc = { scope: 'binance:futures:BTCUSDT:5m', rows: [candle(100), candle(200)] };
  assert.deepEqual(scopedHookChartHistoryRows(btc, 'binance:futures:BTCUSDT:5m'), btc.rows);
  assert.deepEqual(scopedHookChartHistoryRows(btc, 'binance:futures:ETHUSDT:5m'), []);
  assert.deepEqual(scopedHookChartHistoryRows(btc, 'bybit:futures:BTCUSDT:5m'), []);
  assert.deepEqual(scopedHookChartHistoryRows(btc, 'binance:spot:BTCUSDT:5m'), []);
  assert.deepEqual(scopedHookChartHistoryRows(btc, 'binance:futures:BTCUSDT:1h'), []);
});

test('Candle page must precede requested endTime even when an upstream mirror ignores it', () => {
  const rows = [candle(100), candle(101), candle(102), candle(103)];
  assert.deepEqual(candlesBeforeHistoryEnd(rows, 101_999).map(x => x.time), [100, 101]);
  assert.deepEqual(candlesBeforeHistoryEnd(rows, 99_999), []);
});
