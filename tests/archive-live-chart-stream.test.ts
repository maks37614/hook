import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Kline } from '../src/types';
import { mergeLiveCandle } from '../src/utils/hookchartData';

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const candle = (time: number, close: number): Kline => ({
  time, open: 100, high: Math.max(101, close), low: Math.min(99, close),
  close, volume: 10,
});

test('archive chart receives shared exchange candles with cleanup and owner/TF scoping', () => {
  const page = read('../src/components/SavedFormationChartPage.tsx');
  assert.match(page, /subscribeSharedKlines\(\{/);
  assert.match(page, /if \(!archiveOwner \|\| timeframe === '30s'\) return;/);
  assert.match(page, /marketType: archivedItem\.marketType, symbol, timeframe/);
  assert.match(page, /if \(!current \|\| current\.key !== scope/);
  assert.match(page, /return \(\) => \{ disposed = true; unsubscribe\(\); \};/);
  assert.match(page, /mergeLiveCandle\(current\.rows, candle, MAX_HISTORY\)/);
  assert.doesNotMatch(page, /setInterval\(/, 'archive must not open a duplicate periodic exchange poll');
  assert.doesNotMatch(page, /subscribeMarketTrades\(/, 'archive only needs shared kline WS');
});

test('shared incremental live candle merge rejects stale ticks and unchanged updates', () => {
  const old = [candle(1_700_000_000, 102), candle(1_700_000_060, 105)];
  const stale = candle(1_699_999_940, 90);
  assert.strictEqual(mergeLiveCandle(old, stale), old);
  assert.strictEqual(mergeLiveCandle(old, { ...old[1] }), old);
  const revised = mergeLiveCandle(old, candle(1_700_000_060, 107));
  assert.deepEqual(revised.map(k => k.close), [102, 107]);
  const next = mergeLiveCandle(revised, candle(1_700_000_120, 109));
  assert.deepEqual(next.map(k => k.time), [1_700_000_000, 1_700_000_060, 1_700_000_120]);
});
