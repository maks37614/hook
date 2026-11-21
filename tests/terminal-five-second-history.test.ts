import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateExchangeOneSecondCandles, TERMINAL_5S_LOOKBACK_MS } from '../server/terminalFiveSecondHistory';
import { TerminalFiveSecondAccumulator } from '../src/components/hookchart/terminalFiveSecondCandles';

function row(t: number, o: string, h: string, l: string, c: string, volume: string, buy: string) {
  return [t, o, h, l, c, volume, t + 999, volume, 2, buy, buy, '0'];
}
test('exchange 1s candles aggregate into exact 5s OHLCV without splitting a minute candle', () => {
  const t = 1_700_000_000_000;
  const start = Math.floor(t / 5000) * 5000;
  const result = aggregateExchangeOneSecondCandles([
    row(start, '100', '102', '100', '101', '2', '1'),
    row(start+1000, '101', '103', '100', '102', '3', '2'),
    row(start+4000, '102', '104', '99', '100', '4', '1'),
    row(start+5000, '100', '101', '100', '101', '1', '0'),
  ], start, start + 10_000);
  assert.equal(result.length, 2);
  assert.deepEqual(
    [result[0].time, result[0].open, result[0].high, result[0].low, result[0].close, result[0].volume, result[0].buyVolume],
    [start / 1000, 100, 104, 99, 100, 9, 4],
  );
  assert.equal(result[1].time, (start + 5000) / 1000);
});
test('5s history is limited to four hours and does not invent no-trade candles', () => {
  assert.equal(TERMINAL_5S_LOOKBACK_MS, 14_400_000);
  const start = 1_700_000_000_000;
  const result = aggregateExchangeOneSecondCandles([
    row(start, '100', '101', '100', '101', '1', '1'),
    row(start+10_000, '102', '102', '102', '102', '1', '1'),
    row(start+15_000, '102', '103', '102', '103', '1', '1'),
  ], start, start+15_000);
  assert.equal(result.length, 2);
  assert.equal(result[1].time-result[0].time, 10);
});
test('live 5s accumulator hides first incomplete bucket and does not fabricate missing intervals', () => {
  const bars = new TerminalFiveSecondAccumulator();
  const t = 1_700_000_000_000;
  const start = Math.floor(t / 5000) * 5000;
  bars.accept({ id:'a', t:start+3000, p:100, usd:100, side:'BUY' });
  assert.equal(bars.snapshot().length, 0);
  bars.accept({ id:'b', t:start+5000, p:101, usd:202, side:'SELL' });
  bars.accept({ id:'c', t:start+15000, p:102, usd:102, side:'BUY' });
  assert.deepEqual(bars.snapshot().map(b => b.time), [(start+5000)/1000, (start+15000)/1000]);
});
