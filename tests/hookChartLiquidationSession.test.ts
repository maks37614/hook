import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalLiquidationId,
  deduplicateLiquidations,
  filterVisibleLiquidations,
} from '../src/components/hookchart/liquidationDisplay';
import {
  getSessionLiquidationTotals,
  recordSessionLiquidation,
  sessionLiquidationScope,
} from '../src/components/hookchart/liquidationSession';
import { parseLiquidations } from '../server/liquidationFeed';

test('Long and Short liquidation thresholds are independent', () => {
  const rows = [
    { id: 'l1', side: 'LONG' as const, usd: 500 },
    { id: 's1', side: 'SHORT' as const, usd: 1500 },
    { id: 'l2', side: 'LONG' as const, usd: 2500 },
    { id: 's2', side: 'SHORT' as const, usd: 3000 },
  ];
  assert.deepEqual(
    filterVisibleLiquidations(rows, 1000, {
      liquidationLongMinUsd: 2000, liquidationShortMinUsd: 2000,
    }).map(row => row.id),
    ['l2', 's2'],
  );
  assert.deepEqual(filterVisibleLiquidations(rows, 1000, { showLiquidationLong: false }).map(row => row.id), ['s1', 's2']);
  assert.deepEqual(filterVisibleLiquidations(rows, 1000, { showLiquidationShort: false }).map(row => row.id), ['l2']);
  assert.deepEqual(
    filterVisibleLiquidations(rows, 0, {
      liquidationLongMinUsd: 0, liquidationShortMinUsd: 0,
    }).map(row => row.id),
    ['l1', 's1', 'l2', 's2'],
  );
  assert.deepEqual(filterVisibleLiquidations(rows, 0, {}), []);
  assert.equal(rows.length, 4);
});

test('Bybit occurrence IDs stay distinct while repeated deliveries are deduplicated', () => {
  const first = 'byb:BTCUSDT:1794258000000:Buy:100:2:0';
  const duplicated = 'byb:BTCUSDT:1794258000000:Buy:100:2:3';
  assert.notEqual(canonicalLiquidationId(first), canonicalLiquidationId(duplicated));
  assert.deepEqual(
    deduplicateLiquidations([
      { id: first, usd: 200 }, { id: duplicated, usd: 200 }, { id: first, usd: 200 },
    ]).map(row => row.usd),
    [200, 200],
  );
});

test('two equal Bybit rows total $400 and a replayed packet cannot count them again', () => {
  const now = Date.now();
  const event = { T: now, S: 'Buy', p: '100', v: '2' };
  const packet = { topic: 'allLiquidation.BATCHUSDT', ts: now, data: [{ ...event }, { ...event }] };
  const rows = parseLiquidations('bybit', 'BATCHUSDT', packet);
  const repeated = parseLiquidations('bybit', 'BATCHUSDT', packet);
  assert.equal(new Set(rows.map(row => row.id)).size, 2);
  assert.deepEqual(repeated, rows);
  assert.equal(deduplicateLiquidations([...rows, ...repeated]).length, 2);
  const scope = sessionLiquidationScope('bybit', 'futures', 'BATCHUSDT');
  [...rows, ...repeated].forEach(row => recordSessionLiquidation(scope, row));
  assert.deepEqual(getSessionLiquidationTotals(scope), { totalUsd: 400, longUsd: 400, shortUsd: 0, count: 2 });
  const nextPacket = parseLiquidations('bybit', 'BATCHUSDT', { ...packet, ts: now + 1 });
  assert.equal(deduplicateLiquidations([...rows, ...nextPacket]).length, 4);
});

test('upgrading legacy Bybit session IDs preserves the amount already counted', t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const scope = sessionLiquidationScope('bybit', 'futures', 'UPGRADEUSDT');
  const now = Date.now();
  const legacyId = `byb:UPGRADEUSDT:${now}:Buy:100:2`;
  const data = new Map([[`hookchart:liquidations:session:v1:${scope}`, JSON.stringify({
    totals: { totalUsd: 200, longUsd: 200, shortUsd: 0, count: 1 }, ids: [[legacyId, 'LONG', 200]],
  })]]);
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  } });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });
  const row = { side: 'LONG' as const, usd: 200, t: now };
  assert.equal(recordSessionLiquidation(scope, { ...row, id: `${legacyId}:${now}:0` }), false);
  assert.equal(recordSessionLiquidation(scope, { ...row, id: `${legacyId}:${now}:1` }), true);
  assert.equal(recordSessionLiquidation(scope, { ...row, id: `${legacyId}:${now}:1` }), false);
  assert.deepEqual(getSessionLiquidationTotals(scope), { totalUsd: 400, longUsd: 400, shortUsd: 0, count: 2 });
});

test('Session totals survive timeframe changes and do not mix coins or exchanges', () => {
  const binBtc = sessionLiquidationScope('Binance', 'futures', 'btcusdt');
  const bybBtc = sessionLiquidationScope('Bybit', 'futures', 'BTCUSDT');
  const binEth = sessionLiquidationScope('Binance', 'futures', 'ETHUSDT');
  const now = Date.now();
  const mk = (id: string, side: 'LONG' | 'SHORT', usd: number) => ({ id, side, usd, t: now });
  assert.equal(recordSessionLiquidation(binBtc, mk('bin-first', 'LONG', 1000)), true);
  assert.equal(recordSessionLiquidation(binBtc, mk('bin-first', 'LONG', 1000)), false);
  assert.equal(recordSessionLiquidation(binBtc, mk('bin-first', 'LONG', 1500)), true);
  assert.equal(recordSessionLiquidation(bybBtc, mk('byb-first', 'SHORT', 300)), true);
  assert.equal(recordSessionLiquidation(binEth, mk('bin-eth', 'LONG', 900)), true);
  assert.deepEqual(getSessionLiquidationTotals(binBtc), {
    totalUsd: 1500, longUsd: 1500, shortUsd: 0, count: 1,
  });
  assert.equal(getSessionLiquidationTotals(bybBtc).totalUsd, 300);
  assert.equal(getSessionLiquidationTotals(binEth).totalUsd, 900);
});

test('Old snapshots do not count as session events, but delayed live ticks do', () => {
  const scope = sessionLiquidationScope('Bybit', 'futures', 'SNAPTESTUSDT');
  const old = { id: 'old', side: 'LONG' as const, usd: 123, t: Date.now() - 90_000 };
  assert.equal(recordSessionLiquidation(scope, old, 'snapshot'), false);
  assert.equal(recordSessionLiquidation(scope, old, 'live'), true);
  assert.equal(recordSessionLiquidation(scope, old, 'live'), false);
  assert.equal(getSessionLiquidationTotals(scope).totalUsd, 123);
});
