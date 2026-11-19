import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HookChartDensityBook } from '../src/components/hookchart/densityBook';
import { ORDER_BOOK_MAX_AGE_MS } from '../src/utils/orderBookValidation';
import type { BookUpdate } from '../src/utils/binanceOrderBook';

const feed = readFileSync(new URL('../src/components/hookchart/useOriginalHookChartLiveFeed.ts', import.meta.url), 'utf8');

test('HookChart holding-time clock is activated by a complete, valid order book only', () => {
  assert.match(feed, /let stopDepthHoldClockSubscription: \(\(\) => void\) \| null = null/);
  assert.match(feed, /if \(next\.depthReady\) \{\s*if \(stopDepthHoldClockSubscription === null\) \{\s*stopDepthHoldClockSubscription = sharedChartClock\.subscribe\(\(\) => \{ applyBook\(\); \}\);/);
  assert.match(feed, /\} else stopDepthHoldClock\(\)/);
  assert.equal((feed.match(/sharedChartClock\.subscribe\(/g) || []).length, 1,
    'one shared-clock subscription per chart with an active book');
});

test('disconnect, timeout and unmount always stop the holding-time clock', () => {
  assert.match(feed, /const clearDepth = \(\) => \{\s*stopDepthHoldClock\(\)/);
  assert.match(feed, /if \(status !== 'live'\) clearDepth\(\)/);
  assert.match(feed, /stopDepth\(\);\s*stopDepthHoldClock\(\)/);
  assert.match(feed, /if \(replay \|\| lightweight \|\| !exchangeSymbol \|\| !depthEnabled\) \{/,
    'Replay must never allocate a live-depth timer');
});

test('exchange depth readiness is withdrawn when the order book expires', () => {
  const book = new HookChartDensityBook();
  const now = Date.now();
  const base = book.read({} as any, 0, now);
  assert.equal(base.depthReady, false);
  const snapshot: BookUpdate = {
    isSnapshot: true, sequence: 100, eventTime: now,
    bids: [[99, 100]], asks: [[101, 100]],
  };
  assert.equal(book.apply(snapshot, now), true);
  const ready = book.read({ densityAnalysis: false } as any, 0, now);
  assert.equal(ready.depthReady, true);
  const expired = book.read({ densityAnalysis: false } as any, 0, now + ORDER_BOOK_MAX_AGE_MS + 1);
  assert.equal(expired.depthReady, false);
});
