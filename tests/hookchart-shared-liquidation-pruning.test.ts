import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedLiquidationSubscriptions } from '../src/components/hookchart/sharedLiquidationStream';
import type { Liquidation } from '../src/components/hookchart/engine';

const event = (id: string, t = Date.now(), usd = 100): Liquidation =>
  ({ id, t, side: 'LONG', p: 100, q: usd / 100, usd });

test('shared liquidation stream retains one socket, deduplicates cumulative fills and caps memory', () => {
  let callbacks!: {
    onSnapshot: (rows: Liquidation[], connected: boolean) => void;
    onLiquidation: (row: Liquidation) => void;
    onStatus: (connected: boolean) => void;
  };
  let opened = 0, stopped = 0;
  const shared = createSharedLiquidationSubscriptions(options => {
    callbacks = options;
    opened++;
    return () => { stopped++; };
  });
  const scope = { exchange: 'binance' as const, symbol: 'BTCUSDT' };
  const a: Liquidation[] = [], b: Liquidation[] = [];
  const offA = shared.subscribe({ ...scope,
    onSnapshot: rows => a.push(...rows),
    onLiquidation: row => a.push(row),
    onStatus: () => {},
  });
  callbacks.onSnapshot([event('one', Date.now(), 500)], true);
  assert.equal(a.length, 1);
  callbacks.onLiquidation(event('one', Date.now(), 500));
  assert.equal(a.length, 1, 'same cumulative fill must not dispatch twice');
  callbacks.onLiquidation(event('one', Date.now(), 700));
  assert.equal(a.length, 2);

  const offB = shared.subscribe({ ...scope,
    onSnapshot: rows => b.push(...rows),
    onLiquidation: row => b.push(row),
    onStatus: () => {},
  });
  assert.equal(opened, 1);
  assert.equal(b.length, 1);
  assert.equal(b[0].usd, 700, 'joining chart must receive most recent cumulative notional');

  const now = Date.now();
  for (let i = 0; i < 1800; i++) callbacks.onLiquidation(event('id-' + i, now + i, i + 100));
  const late: Liquidation[] = [];
  const offC = shared.subscribe({ ...scope,
    onSnapshot: rows => late.push(...rows),
    onLiquidation: () => {},
    onStatus: () => {},
  });
  assert.equal(late.length, 1500);
  assert.ok(late.some(row => row.id === 'id-1799'));
  assert.ok(!late.some(row => row.id === 'id-0'));

  offA(); offB(); offC();
  assert.equal(shared.activeScopes(), 0);
  assert.equal(stopped, 1);
});

test('join immediately prunes expired shared snapshots, even without incoming trades', () => {
  let snapshot!: (rows: Liquidation[], connected: boolean) => void;
  const shared = createSharedLiquidationSubscriptions(options => {
    snapshot = options.onSnapshot;
    return () => {};
  });
  const scope = { exchange: 'bybit' as const, symbol: 'ETHUSDT' };
  const old = event('expired', Date.now() - 40 * 60_000);
  const recent = event('recent', Date.now() - 10 * 60_000);
  const off = shared.subscribe({ ...scope, onSnapshot: () => {}, onLiquidation: () => {}, onStatus: () => {} });
  snapshot([old, recent], true);
  const values: Liquidation[] = [];
  const joined = shared.subscribe({ ...scope, onSnapshot: rows => values.push(...rows), onLiquidation: () => {}, onStatus: () => {} });
  assert.deepEqual(values.map(row => row.id), ['recent']);
  joined();off();
});
