import test from 'node:test';
import assert from 'node:assert/strict';
import { terminalReadableCandleExtrema } from '../src/components/hookchart/terminalAutoScale';
import { latestCandleResetViewport } from '../src/components/hookchart/resetViewport';

const ordinary = Array.from({ length: 25 }, (_, index) => {
  const open = 89 + index * 0.1;
  return { o: open, c: open + 0.06, h: open + 0.3, l: open - 0.24 };
});

test('Terminal auto fit keeps the exact high and low for ordinary candles', () => {
  const result = terminalReadableCandleExtrema(ordinary);
  assert.equal(result.low, ordinary[0].l);
  assert.equal(result.high, ordinary.at(-1)!.h);
  assert.equal(result.clippedHigh, false);
  assert.equal(result.clippedLow, false);
});

test('an isolated extreme upper wick cannot flatten all of the recent candles', () => {
  const candles = ordinary.map(c => ({ ...c }));
  candles[4].h = 848;
  const result = terminalReadableCandleExtrema(candles);
  assert.equal(result.clippedHigh, true);
  assert.ok(result.high < 100, 'readable chart stays near the actual price');
  assert.equal(candles[4].h, 848, 'original OHLC remains untouched');
});

test('an isolated deep lower wick cannot stretch the axis toward zero', () => {
  const candles = ordinary.map(c => ({ ...c }));
  candles[5].l = 0.001;
  const result = terminalReadableCandleExtrema(candles);
  assert.equal(result.clippedLow, true);
  assert.ok(result.low > 80);
  assert.equal(candles[5].l, 0.001);
});

test('repeated extreme wicks stay represented by the price scale', () => {
  const candles = ordinary.map(c => ({ ...c }));
  for (let i = 0; i < 6; i++) candles[i].h = 848;
  const result = terminalReadableCandleExtrema(candles);
  assert.equal(result.clippedHigh, false);
  assert.equal(result.high, 848);
});

test('a real sustained rise in candle bodies is never trimmed as a flash wick', () => {
  const candles = Array.from({ length: 25 }, (_, i) => ({
    o: 85 + i * 10, c: 89 + i * 10, h: 91 + i * 10, l: 83 + i * 10,
  }));
  const result = terminalReadableCandleExtrema(candles);
  assert.equal(result.high, candles.at(-1)!.h);
  assert.equal(result.low, candles[0].l);
  assert.equal(result.clippedHigh, false);
});

test('few candles remain untrimmed and invalid OHLC cannot corrupt bounds', () => {
  const thin = [{ o: 90, c: 91, h: 800, l: 80 }];
  assert.equal(terminalReadableCandleExtrema(thin).high, 800);
  assert.deepEqual(terminalReadableCandleExtrema([]), {
    low: 0, high: 1, clippedHigh: false, clippedLow: false,
  });
  const withInvalid = [...ordinary, { o: NaN, c: 1, h: Infinity, l: -1 }];
  const result = terminalReadableCandleExtrema(withInvalid);
  assert.equal(result.low, ordinary[0].l);
  assert.equal(result.high, ordinary.at(-1)!.h);
});

test('reset uses the latest requested candle window rather than a fixed 180-bar view', () => {
  const reset = latestCandleResetViewport(700, 200, 36, 5);
  assert.equal(reset.autoY, true);
  assert.equal(reset.candleFit, true);
  assert.equal(reset.fitAll, false);
  assert.ok(reset.barWidth > 10);
});
