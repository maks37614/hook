import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';
import { ExchangeStreamClient } from '../server/surveillance/exchangeStream';
import { acquireExchangeStream } from '../server/surveillance/sharedExchangeStream';

test('fresh delta after five seconds of silence cannot resurrect a stale density', t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const book = new OrderBookEngine('GAPTESTUSDT', 'bybit', 'futures', {
    mode: 'MANUAL', manualThresholdUsd: 1000,
    minPersistenceSeconds: 15, minDistancePct: 0.1,
  });
  book.applyDepth({ isSnapshot: true, sequence: 1, eventTime: now,
    bids: [[100, 20]], asks: [[101, 1]] });
  assert.equal(book.getState().status, 'LIVE');
  assert.equal(book.getDensities().length, 1);

  now += 5_001; // No getState() or watchdog call was made during the outage.
  book.applyDepth({ sequence: 2, eventTime: now,
    bids: [[100, 25]], asks: [] });
  assert.equal(book.getState().dataValid, false);
  assert.equal(book.getState().status, 'STALE');
  assert.equal(book.getState().sequenceGap, true);
  assert.deepEqual(book.getDensities(), []);
  assert.deepEqual(book.pollNewlyAppearedDensities(), []);

  now += 100;
  book.applyDepth({ sequence: 3, eventTime: now,
    bids: [[100, 30]], asks: [[101, 1]] });
  assert.notEqual(book.getState().status, 'LIVE',
    'repeated fresh deltas may not restore the old book');
  book.applyDepth({ isSnapshot: true, sequence: 4, eventTime: now,
    bids: [[90, 20]], asks: [[91, 10]] });
  assert.equal(book.getState().status, 'LIVE');
  assert.deepEqual(book.getState().bids.map(level => level.price), [90],
    'old 100 bid must not survive across a reconnection');
});

test('disconnect status and stale exchange clock require a fresh snapshot', t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const book = new OrderBookEngine('RECONNECTTESTUSDT', 'binance', 'futures');
  book.applyDepth({ isSnapshot: true, sequence: 10, eventTime: now,
    bids: [[100, 5]], asks: [[101, 4]] });
  assert.equal(book.getState().status, 'LIVE');
  book.setStatus('RESYNCING');
  book.applyDepth({ sequence: 11, eventTime: now,
    bids: [[99, 5]], asks: [[102, 4]] });
  assert.equal(book.getState().dataValid, false,
    'a status change must invalidate continuity even without a five-second delay');
  assert.equal(book.getState().sequenceGap, true);

  book.applyDepth({ isSnapshot: true, sequence: 12, eventTime: now - 4_900,
    bids: [[100, 5]], asks: [[101, 4]] });
  assert.equal(book.getState().status, 'LIVE');
  now += 200;
  book.applyDepth({ sequence: 13, eventTime: now,
    bids: [[100, 7]], asks: [] });
  assert.equal(book.getState().status, 'STALE',
    'an expired exchange timestamp invalidates even a recently received snapshot');
  book.applyDepth({ isSnapshot: true, sequence: 14, eventTime: now,
    bids: [[99, 7]], asks: [[100, 4]] });
  assert.equal(book.getState().status, 'LIVE');
});

test('shared cache never replays a book patched across a five-second disconnect', async t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  t.mock.method(ExchangeStreamClient.prototype, 'connect', () => {});

  const early = acquireExchangeStream('LATERECONNECTUSDT', 'bybit', 'futures');
  const source = (early as any).entry.source as ExchangeStreamClient;
  let late: ReturnType<typeof acquireExchangeStream> | null = null;
  try {
    source.emit('depth', {isSnapshot:true,sequence:10,eventTime:now,
      bids:[[100,5]],asks:[[101,5]]});
    now += 5_001;
    source.emit('depth', {sequence:11,eventTime:now,
      bids:[[100,99]],asks:[[101,99]]});
    late = acquireExchangeStream('LATERECONNECTUSDT','bybit','futures');
    const observations: any[] = [];
    late.on('depth', update => observations.push(update));
    await new Promise<void>(resolve => queueMicrotask(resolve));
    assert.deepEqual(observations, [],
      'late owner must not receive a false live snapshot after a reconnect gap');

    source.emit('depth', {isSnapshot:true,sequence:12,eventTime:now,
      bids:[[90,6]],asks:[[91,6]]});
    assert.equal(observations.length, 1);
    assert.equal(observations[0].sequence, 12);
    assert.deepEqual(observations[0].bids, [[90,6]]);
    assert.deepEqual(observations[0].asks, [[91,6]]);
  } finally {
    late?.destroy();
    early.destroy();
  }
});
