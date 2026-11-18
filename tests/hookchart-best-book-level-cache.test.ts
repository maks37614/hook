import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { BookUpdate } from '../src/utils/binanceOrderBook';
import { HookChartDensityBook } from '../src/components/hookchart/densityBook';

const now = Date.now();
const settings = { densityAnalysis: false } as any;
const snapshot = (sequence: number, bids: [number, number][], asks: [number, number][]): BookUpdate => ({
  sequence, eventTime: now, isSnapshot: true, bids, asks,
});
const delta = (sequence: number, bids: [number, number][], asks: [number, number][]): BookUpdate => ({
  sequence, eventTime: now, bids, asks,
});

test('best bid/ask price stays exact across new levels, quantity updates and removals', () => {
  const b = new HookChartDensityBook();
  assert.equal(b.apply(snapshot(100, [[99, 2], [98, 3]], [[101, 5], [102, 7]]), now), true);
  assert.equal(b.read(settings, 0, now).price, 100);
  assert.equal(b.apply(delta(101, [[98, 7]], [[102, 4]]), now), true);
  assert.equal(b.read(settings, 0, now).price, 100, 'non-best quantity changes cannot move midprice');
  assert.equal(b.apply(delta(102, [[100, 3]], []), now), true);
  assert.equal(b.read(settings, 0, now).price, 100.5, 'new top BID immediately changes midprice');
  assert.equal(b.apply(delta(103, [[100, 0]], []), now), true);
  assert.equal(b.read(settings, 0, now).price, 100, 'deleting top BID discovers next best');
  assert.equal(b.apply(delta(104, [], [[101, 0]]), now), true);
  assert.equal(b.read(settings, 0, now).price, 100.5, 'deleting top ASK discovers next best');
  assert.equal(b.apply(delta(105, [], [[100.5, 6]]), now), true);
  assert.equal(b.read(settings, 0, now).price, 99.75, 'new closer ASK is selected');
});

test('same packet removes a best level and inserts its successor, preserving ordering', () => {
  const b = new HookChartDensityBook();
  assert.equal(b.apply(snapshot(10, [[95, 1], [94, 1]], [[105, 1], [106, 1]]), now), true);
  assert.equal(b.apply(delta(11, [[95, 0], [96, 2]], [[105, 0], [104, 2]]), now), true);
  assert.equal(b.read(settings, 0, now).price, 100);
  assert.equal(b.apply(delta(11, [[999, 1]], []), now), true, 'duplicate sequence is ignored');
  assert.equal(b.read(settings, 0, now).price, 100);
});

test('crossed or empty books clear cached best levels and new snapshot restores state', () => {
  const b = new HookChartDensityBook();
  assert.equal(b.apply(snapshot(10, [[99, 2]], [[101, 2]]), now), true);
  assert.equal(b.apply(delta(11, [[102, 1]], []), now), false);
  assert.equal(b.read(settings, 0, now).depthReady, false);
  assert.equal(b.apply(snapshot(30, [[10, 1]], [[12, 1]]), now), true);
  assert.equal(b.read(settings, 0, now).price, 11);
  assert.equal(b.apply(delta(31, [[10, 0]], []), now), false);
  assert.equal(b.read(settings, 0, now).depthReady, false);
});

test('large order-book quantity deltas no longer rescan all prices on each update', () => {
  const src = readFileSync(new URL('../src/components/hookchart/densityBook.ts', import.meta.url), 'utf8');
  assert.match(src, /private bestBid = -Infinity/);
  assert.match(src, /private bestAsk = Infinity/);
  assert.match(src, /if \(removedBest\) \{/);
  assert.doesNotMatch(src, /Math\.max\(\.\.\.this\.bids\.keys\(\)\)/);
  assert.doesNotMatch(src, /Math\.min\(\.\.\.this\.asks\.keys\(\)\)/);
  const b = new HookChartDensityBook();
  const bidRows: [number, number][] = Array.from({ length: 4000 }, (_, i) => [50 + i / 100, 1]);
  const askRows: [number, number][] = Array.from({ length: 4000 }, (_, i) => [110 + i / 100, 1]);
  assert.equal(b.apply(snapshot(1, bidRows, askRows), now), true);
  assert.equal(b.read(settings, 0, now).price, (89.99 + 110) / 2);
  for (let i = 2; i < 250; i++) {
    assert.equal(b.apply(delta(i, [[50 + (i % 3000) / 100, 5]], [[110 + (i % 3000) / 100, 5]]), now), true);
  }
  assert.equal(b.read(settings, 0, now).price, (89.99 + 110) / 2);
});
