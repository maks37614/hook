import test from 'node:test';
import assert from 'node:assert/strict';
import {
  processCandlesForCutoff, fetchHistoricalReplayCandles, replayFallbackContainsDate,
} from '../src/utils/replayService';
import type { Kline } from '../src/types';

const hour = 3_600_000;
const candle = (ms: number): Kline => ({
  time: ms / 1000, open: 100, high: 101, low: 99, close: 100, volume: 10,
});
const binanceCandle = (ms: number) => [
  ms, '100', '101', '99', '100', '10', ms + hour - 1, '1000', 5, '5', '500', '0',
];

test('Replay never reveals twentieth candle when selected candle is the first or second bar', () => {
  const first = Date.UTC(2026, 4, 15, 14);
  const series = Array.from({ length: 42 }, (_, i) => candle(first + i * hour));
  const atFirst = processCandlesForCutoff(series, first, '1h');
  assert.equal(atFirst.cutoffIndex, 0);
  assert.equal(atFirst.allCandles[atFirst.cutoffIndex].time, first / 1000);
  const atSecond = processCandlesForCutoff(series, first + hour, '1h');
  assert.equal(atSecond.cutoffIndex, 1);
  assert.equal(atSecond.allCandles[atSecond.cutoffIndex].time, (first + hour) / 1000);
  assert.deepEqual(processCandlesForCutoff(series, first - hour, '1h'),
    { allCandles: [], cutoffIndex: 0 });
});

test('Replay never rewinds selected final candle by thirty bars', () => {
  const first = Date.UTC(2025, 7, 12, 0);
  const series = Array.from({ length: 50 }, (_, i) => candle(first + i * hour));
  const last = first + 49 * hour;
  assert.equal(processCandlesForCutoff(series, last, '1h').cutoffIndex, 49);
  assert.equal(processCandlesForCutoff(series, last - hour, '1h').cutoffIndex, 48);
});

test('An exact candle boundary is not covered by the previous candle if the next is missing', () => {
  const first = Date.UTC(2026, 4, 15, 14);
  const series = [candle(first), candle(first + 3 * hour)];
  assert.equal(replayFallbackContainsDate(series, first + hour - 1, '1h'), true);
  assert.equal(replayFallbackContainsDate(series, first + hour, '1h'), false);
  assert.equal(replayFallbackContainsDate(series, first + 3 * hour, '1h'), true);
});

test('latest-only recovery uses exact target candle without an arbitrary twenty-bar jump', async t => {
  const first = Date.UTC(2026, 10, 10, 10);
  const target = first + hour;
  const rows = Array.from({ length: 48 }, (_, i) => binanceCandle(first + i * hour));
  const wrong = Array.from({ length: 20 }, (_, i) => candle(Date.UTC(2025, 6, 1) + i * hour));
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith('/api/klines?')) return Response.json({ success: true, data: wrong });
    if (url.includes('startTime=')) return Response.json([]);
    if (url.includes('fapi.binance.com') && url.includes('limit=500'))
      return Response.json(rows);
    throw new Error('Unexpected historical source: ' + url);
  });
  const result = await fetchHistoricalReplayCandles('binance', 'futures',
    'REPLAYEXACTCUTOFFUSDT', '1h', target, 20, 20);
  assert.equal(result.allCandles.length, 48);
  assert.equal(result.cutoffIndex, 1);
  assert.equal(result.allCandles[result.cutoffIndex].time, target / 1000);
  assert.equal(calls.length, 3);
});
