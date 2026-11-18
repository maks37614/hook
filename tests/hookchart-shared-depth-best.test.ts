import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDepthSide } from '../src/components/hookchart/depthBestPrice';
import { createSharedDepthSubscriptions } from '../src/components/hookchart/sharedDepthStream';
import type { BookUpdate } from '../src/utils/binanceOrderBook';

test('incremental best bid/ask preserves full-book results across changes and removal', () => {
  const bids = new Map<number, number>(), asks = new Map<number, number>();
  let bestBid = -Infinity, bestAsk = Infinity;
  const checks: Array<{ b: [number, number][]; a: [number, number][] }> = [
    { b: [[100, 2], [99, 3], [98, 4]], a: [[101, 1], [102, 4], [103, 5]] },
    { b: [[97, 9], [100, 5]], a: [[104, 5], [103, 9]] },
    { b: [[100, 0]], a: [[101, 0]] },
    { b: [[99, 0], [102, 7]], a: [[102, 0], [100, 8]] },
    { b: [[98, 0], [97, 0], [102, 0]], a: [[103, 0], [104, 0], [100, 0]] },
    { b: [[25, 1]], a: [[26, 2]] },
  ];
  for (const update of checks) {
    bestBid = applyDepthSide(bids, update.b, bestBid, true);
    bestAsk = applyDepthSide(asks, update.a, bestAsk, false);
    assert.equal(bestBid, bids.size ? Math.max(...bids.keys()) : -Infinity);
    assert.equal(bestAsk, asks.size ? Math.min(...asks.keys()) : Infinity);
  }
});

test('shared depth distributes one transport and repairs failed charts with a full current snapshot', () => {
  const now = Date.now();
  let onBook: (update: BookUpdate) => boolean = () => false;
  let onStatus: (status: 'connecting'|'syncing'|'live'|'reconnecting'|'unavailable'|'disabled') => void = () => {};
  let connected = 0, stopped = 0;
  const shared = createSharedDepthSubscriptions(options => {
    connected++;
    onBook = options.onBook;
    onStatus = options.onStatus;
    return () => { stopped++; };
  });
  const base = { exchange: 'binance' as const, marketType: 'futures' as const, symbol: 'BTCUSDT' };
  const received1: BookUpdate[] = [], received2: BookUpdate[] = [];
  const statuses1: string[] = [], statuses2: string[] = [];
  const first = shared.subscribe({ ...base, onBook: update => {
    received1.push(update);
    return true;
  }, onStatus: status => statuses1.push(status) });
  assert.equal(connected, 1);
  assert.equal(onBook({
    isSnapshot: true, bids: [[99, 10], [98, 5]], asks: [[101, 8], [102, 5]],
    eventTime: now, sequence: 100,
  }), true);
  onStatus('live');
  const second = shared.subscribe({ ...base, onBook: update => {
    received2.push(update);
    return true;
  }, onStatus: status => statuses2.push(status) });
  assert.equal(connected, 1);
  assert.equal(received2.length, 1);
  assert.equal(received2[0].isSnapshot, true);
  assert.deepEqual(received2[0].bids, [[99, 10], [98, 5]]);
  assert.ok(statuses2.includes('live'));

  assert.equal(onBook({
    bids: [[99, 0], [98, 7]], asks: [[101, 0], [102, 6]],
    eventTime: now + 1, sequence: 101,
  }), true);
  const third: BookUpdate[] = [];
  const repaired = shared.subscribe({ ...base, onBook: update => {
    third.push(update);
    return true;
  }, onStatus: () => {} });
  assert.equal(third[0].isSnapshot, true);
  assert.deepEqual(third[0].bids, [[98, 7]]);
  assert.deepEqual(third[0].asks, [[102, 6]]);

  first();second();repaired();
  assert.equal(shared.activeScopes(), 0);
  assert.equal(stopped, 1);
  assert.equal(received1.length, 2);
});

test('invalid crossed shared depth causes resync rather than publishing a false live book', () => {
  const now = Date.now();
  let onBook: (update: BookUpdate) => boolean = () => false;
  const shared = createSharedDepthSubscriptions(options => {
    onBook = options.onBook;
    return () => {};
  });
  const statuses: string[] = [];
  const off = shared.subscribe({ exchange: 'binance', marketType: 'futures', symbol: 'ETHUSDT',
    onBook: () => true, onStatus: s => statuses.push(s) });
  assert.equal(onBook({ isSnapshot: true, sequence: 10, eventTime: now, bids: [[100, 1]], asks: [[101, 1]] }), true);
  assert.equal(onBook({ sequence: 11, eventTime: now + 1, bids: [[102, 1]], asks: [] }), false);
  // A delta after the invalidated shared book cannot be treated as complete.
  assert.equal(onBook({ sequence: 12, eventTime: now + 2, bids: [[100, 2]], asks: [] }), false);
  off();
});

test('multiple charts that reject one depth delta receive the same shared repair snapshot', () => {
  const now = Date.now();
  let onBook!: (update: BookUpdate) => boolean;
  const shared = createSharedDepthSubscriptions(options => {
    onBook = options.onBook;
    return () => {};
  });
  const base = { exchange: 'binance' as const, marketType: 'futures' as const, symbol: 'SOLUSDT' };
  const repaired: BookUpdate[] = [];
  const chart = () => shared.subscribe({ ...base, onBook: update => {
    if (update.isSnapshot) { repaired.push(update); return true; }
    return false;
  }, onStatus: () => {} });
  const off1 = chart(), off2 = chart();
  assert.equal(onBook({ isSnapshot: true, sequence: 10, eventTime: now,
    bids: [[99, 2]], asks: [[101, 3]] }), true);
  repaired.length = 0;
  assert.equal(onBook({ sequence: 11, eventTime: now + 1,
    bids: [[99, 4]], asks: [] }), true);
  assert.equal(repaired.length, 2);
  assert.strictEqual(repaired[0], repaired[1]);
  assert.deepEqual(repaired[0].bids, [[99, 4]]);
  off1(); off2();
});
