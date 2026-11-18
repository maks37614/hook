import test from 'node:test';
import assert from 'node:assert/strict';
import type { Kline } from '../src/types';
import { convertLiveHookChartCandles } from '../src/utils/hookChartLiveConversion';

const candle = (time: number, price = 10): Kline => ({
  time, open: price, high: price + 1, low: price - 1,
  close: price, volume: 100, tradeCount: 5,
});
const scope = 'binance:futures:BTCUSDT:5m';

test('live HookChart reuses unchanged history and replaces only the last price', () => {
  const candles = [candle(100), candle(200)];
  const history: Kline[] = [];
  const first = convertLiveHookChartCandles(candles, history, scope, undefined, null);
  assert.deepEqual(first.candles.map(row => row.t), [100_000, 200_000]);
  assert.strictEqual(convertLiveHookChartCandles(candles, history, scope, undefined, first), first);

  const next = [candles[0], candle(200, 12)];
  const replaced = convertLiveHookChartCandles(next, history, scope, undefined, first);
  assert.notStrictEqual(replaced.candles, first.candles);
  assert.strictEqual(replaced.candles[0], first.candles[0]);
  assert.equal(replaced.candles[1].c, 12);
  assert.deepEqual(first.candles.map(row => row.c), [10, 10]);

  const appendedInput = [...next, candle(300, 15)];
  const appended = convertLiveHookChartCandles(appendedInput, history, scope, undefined, replaced);
  assert.strictEqual(appended.candles[1], replaced.candles[1]);
  assert.deepEqual(appended.candles.map(row => row.c), [10, 12, 15]);
});

test('rewind, changed prefix, new scope or history page rebuilds live candles', () => {
  const a = candle(100), b = candle(200), c = candle(300);
  const input = [a,b,c], history: Kline[] = [];
  const first = convertLiveHookChartCandles(input, history, scope, undefined, null);

  const rewind = convertLiveHookChartCandles([a,b], history, scope, undefined, first);
  assert.deepEqual(rewind.candles.map(row => row.t), [100_000,200_000]);

  const revised = convertLiveHookChartCandles([candle(100,20),b,c], history, scope, undefined, first);
  assert.equal(revised.candles[0].c,20);

  const otherScope = convertLiveHookChartCandles(input, history,'bybit:futures:BTCUSDT:5m',undefined,first);
  assert.notStrictEqual(otherScope,first);

  const older = [candle(50)];
  const historyPage = convertLiveHookChartCandles(input,older,scope,undefined,first);
  assert.deepEqual(historyPage.candles.map(row=>row.t),[50_000,100_000,200_000,300_000]);
});

test('history cap, invalid last update and overlapping historical pages preserve canonical candles', () => {
  const a = candle(100),b=candle(200),c=candle(300),d=candle(400);
  const input=[a,b,c],history:Kline[]=[];
  const first=convertLiveHookChartCandles(input,history,scope,2,null);
  assert.deepEqual(first.candles.map(row=>row.t),[200_000,300_000]);

  const appended=convertLiveHookChartCandles([...input,d],history,scope,2,first);
  assert.deepEqual(appended.candles.map(row=>row.t),[300_000,400_000]);

  const invalid=candle(300,0); // nonpositive low -> invalid exchange bar
  const rejected=convertLiveHookChartCandles([a,b,invalid],history,scope,2,first);
  assert.deepEqual(rejected.candles.map(row=>row.t),[100_000,200_000]);

  const overlap=convertLiveHookChartCandles([b,c],[a,b],scope,undefined,null);
  assert.deepEqual(overlap.candles.map(row=>row.t),[100_000,200_000,300_000]);
});
