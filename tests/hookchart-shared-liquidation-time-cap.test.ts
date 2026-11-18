import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedLiquidationSubscriptions } from '../src/components/hookchart/sharedLiquidationStream';
import type { Liquidation } from '../src/components/hookchart/engine';

const now = 1_800_000_000_000;
const event = (id: string, t: number, usd = 100): Liquidation =>
  ({ id, t, usd, side: 'LONG', p: 100, q: usd / 100 });

function harness(t: any) {
  t.mock.timers.enable({ apis: ['Date'], now });
  const sources: Array<{
    onSnapshot: (rows: Liquidation[], connected: boolean) => void;
    onLiquidation: (row: Liquidation) => void;
  }> = [];
  let closed = 0;
  const shared = createSharedLiquidationSubscriptions(options => {
    sources.push(options);
    return () => { closed++; };
  });
  const subscribe = (onSnapshot: (rows: Liquidation[]) => void) => shared.subscribe({
    exchange: 'binance', symbol: 'BTCUSDT',
    onSnapshot: rows => onSnapshot(rows),
    onLiquidation: () => {},
    onStatus: () => {},
  });
  return { sources, shared, subscribe, closed: () => closed };
}

test('out-of-order exchange snapshot retains newest 1500 by event time, not map insertion', t => {
  const h = harness(t);
  const off = h.subscribe(() => {});
  const base = now - 70_000;
  const ascending = Array.from({ length: 1_700 }, (_, i) =>
    event('event-' + i, base + i * 20));
  h.sources[0].onSnapshot([...ascending].reverse(), true);
  const received: Liquidation[][] = [];
  const off2 = h.subscribe(rows => received.push(rows));
  assert.equal(h.shared.activeScopes(), 1);
  assert.equal(received.length, 1);
  assert.equal(received[0].length, 1500);
  const ids = new Set(received[0].map(row => row.id));
  for (let i = 0; i < 200; i++) assert.equal(ids.has('event-' + i), false,
    'the oldest timestamps must be pruned even if they arrived last');
  for (let i = 200; i < 1700; i++) assert.equal(ids.has('event-' + i), true);
  off2();
  off();
  assert.equal(h.closed(), 1);
});

test('late and cumulative updates cannot displace newer markers under capacity pressure', t => {
  const h = harness(t);
  const off = h.subscribe(() => {});
  const base = now - 90_000;
  const rows = Array.from({ length: 1_500 }, (_, i) =>
    event('event-' + i, base + i * 30));
  h.sources[0].onSnapshot(rows, true);
  // A Binance cumulative fill updates an old event, moving its Map entry to
  // the end. Time-based retention still must remove that oldest event.
  h.sources[0].onLiquidation(event('event-0', base, 999));
  h.sources[0].onLiquidation(event('newest', now - 1_000, 500));
  const late = event('out-of-order-late', base - 500, 200);
  h.sources[0].onLiquidation(late);
  let snapshot: Liquidation[] = [];
  const off2 = h.subscribe(rows => { snapshot = rows; });
  assert.equal(snapshot.length, 1500);
  const ids = new Set(snapshot.map(row => row.id));
  assert.equal(ids.has('newest'), true, 'the most recent liquidation remains visible');
  assert.equal(ids.has('event-0'), false, 'an old cumulative fill does not become recent');
  assert.equal(ids.has('out-of-order-late'), false, 'a late old packet cannot displace newer data');
  assert.equal(ids.has('event-1'), true, 'other recent events stay intact');
  off2();
  off();
});

test('large runs of cumulative updates stay bounded and latest USD survives reconnect snapshots', t => {
  const h = harness(t);
  const off = h.subscribe(() => {});
  h.sources[0].onSnapshot([event('order', now - 10_000, 100)], true);
  for (let i = 1; i <= 5_000; i++)
    h.sources[0].onLiquidation(event('order', now - 10_000, 100 + i));
  // A stale relay snapshot must never roll a cumulative order backwards.
  h.sources[0].onSnapshot([event('order', now - 10_000, 300)], true);
  let latest: Liquidation[] = [];
  const off2 = h.subscribe(rows => { latest = rows; });
  assert.deepEqual(latest.map(row => row.id), ['order']);
  assert.equal(latest[0].usd, 5_100);
  off2();
  off();
  assert.equal(h.closed(), 1);
  assert.equal(h.shared.activeScopes(), 0);
});
