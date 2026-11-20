import test from 'node:test';
import assert from 'node:assert/strict';
import type { Kline } from '../src/types';
import { mergeMissingExchangeKlines } from '../src/utils/hookchartData';

const bar = (time: number, price: number, volume = 10): Kline =>
  ({ time, open: price, high: price + 0.03, low: price - 0.02, close: price + 0.01, volume });

test('restores real exchange candles missing after a kline WebSocket outage', () => {
  const displayed = [bar(1000, 0.27), bar(1180, 0.28)];
  const recovered = [bar(1000, 0.27), bar(1060, 0.271), bar(1120, 0.277), bar(1180, 0.29)];
  const result = mergeMissingExchangeKlines(displayed, recovered, 1000, 1180);
  assert.deepEqual(result.map(c => c.time), [1000, 1060, 1120, 1180]);
  assert.strictEqual(result[0], displayed[0]);
  assert.strictEqual(result[3], displayed[1], 'live candle wins over stale REST snapshot');
});

test('never invents an OHLC bar if the exchange has no observed candle', () => {
  const displayed = [bar(1000, 0.27), bar(1180, 0.28)];
  const result = mergeMissingExchangeKlines(displayed, [bar(1000, 0.27), bar(1180, 0.28)], 1000, 1180);
  assert.strictEqual(result, displayed);
});

test('rejects invalid, out-of-gap and duplicated rows', () => {
  const displayed = [bar(1000, 0.27), bar(1180, 0.28)];
  const bad = { ...bar(1120, 0.28), high: 0.05 };
  const recovered = [
    bar(940, 0.27), bar(1060, 0.272), bar(1060, 0.271),
    bad, bar(1240, 0.30),
  ];
  const result = mergeMissingExchangeKlines(displayed, recovered, 1000, 1180);
  assert.deepEqual(result.map(c => c.time), [1000, 1060, 1180]);
  assert.equal(result[1].open, 0.272);
});

test('preserves original live array when there are no missing bars', () => {
  const displayed = [bar(1000, 0.27), bar(1060, 0.272), bar(1120, 0.273)];
  assert.strictEqual(mergeMissingExchangeKlines(displayed, [], 1000, 1120), displayed);
  assert.strictEqual(mergeMissingExchangeKlines(displayed, [bar(1060, 0.28)], 1000, 1120), displayed);
});

test('respects memory cap after a genuine reconnect repair', () => {
  const displayed = [bar(1000, 0.27), bar(1180, 0.28)];
  const recovered = [bar(1060, 0.272), bar(1120, 0.274)];
  const result = mergeMissingExchangeKlines(displayed, recovered, 1000, 1180, 3);
  assert.deepEqual(result.map(c => c.time), [1060, 1120, 1180]);
});
