import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLiquidations } from '../server/liquidationFeed';
import { calcCascadeRisk, type Liquidation } from '../src/components/hookchart/engine';

test('Binance forceOrder uses executed cumulative quantity, not original order quantity', () => {
  const now = Date.now();
  const base = { e: 'forceOrder', E: now, st: 1,
    o: { s: 'BTCUSDT', S: 'SELL', i: 12345, T: now, ap: '70000',
      q: '10', z: '2', l: '1', X: 'PARTIALLY_FILLED' } };
  const observed = parseLiquidations('binance', 'BTCUSDT', base);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].q, 2);
  assert.equal(observed[0].usd, 140000);
  assert.equal(observed[0].side, 'LONG');
  assert.equal(parseLiquidations('binance', 'BTCUSDT', {
    ...base, o: { ...base.o, z: '0', l: '0' },
  }).length, 0, 'an unfilled original order must never be reported as executed Liq');
  const lastFill = parseLiquidations('binance', 'BTCUSDT', {
    ...base, o: { ...base.o, z: '0', l: '0.25' },
  });
  assert.equal(lastFill[0]?.usd, 17500,
    'when accumulated fill is missing, the last executed fill is usable');
});

test('Binance forced stream rejects non-liquidation, wrong market and invalid side', () => {
  const now = Date.now();
  const valid = { e: 'forceOrder', E: now, st: 1,
    o: { s: 'BTCUSDT', S: 'BUY', i: 1, T: now, ap: '50000', z: '1', l: '1', q: '3' } };
  assert.equal(parseLiquidations('binance', 'BTCUSDT', valid)[0].side, 'SHORT');
  assert.equal(parseLiquidations('binance', 'BTCUSDT', { ...valid, e: 'aggTrade' }).length, 0);
  assert.equal(parseLiquidations('binance', 'BTCUSDT', { ...valid, st: 2 }).length, 0,
    'COIN-M contract sizes cannot be naively priced as USDT contracts');
  assert.equal(parseLiquidations('binance', 'BTCUSDT', {
    ...valid, o: { ...valid.o, S: 'UNKNOWN' },
  }).length, 0, 'unrecognized sides should not count as SHORT');
});

test('cascade confidence is capped when activity is only one or two independent events', () => {
  const now = 1_800_000_000_000;
  const make = (id: string, t: number): Liquidation =>
    ({ id, t, usd: 100_000, side: 'LONG', p: 100, q: 1000 });
  const rows = [make('one', now), make('two', now - 1000), make('three', now - 2000)];
  const one = calcCascadeRisk(rows.slice(0, 1), 100, 100, now);
  assert.equal(one.count1, 1);
  assert.ok(one.score <= 33 && one.level === 'LOW', 'a single forced order is not a cascade');
  const two = calcCascadeRisk(rows.slice(0, 2), 100, 100, now);
  assert.equal(two.count1, 2);
  assert.ok(two.score <= 57 && two.level !== 'HIGH' && two.level !== 'CRIT');
  const three = calcCascadeRisk(rows, 100, 100, now);
  assert.equal(three.count1, 3);
  assert.ok(three.score > two.score, 'several independent large events can increase cascade risk');
  assert.equal(calcCascadeRisk(rows, 100, 100, now + 301_000).score, 0,
    'no cascade score survives the 5-minute window');
});

test('Bybit allLiquidation preserves observed size and bankruptcy-price notional estimate', () => {
  const now = Date.now();
  const result = parseLiquidations('bybit', 'ETHUSDT', {
    topic: 'allLiquidation.ETHUSDT', ts: now, data: [
      { T: now, s: 'ETHUSDT', S: 'Buy', v: '2.5', p: '3000' },
      { T: now, s: 'ETHUSDT', S: 'Sell', v: '1', p: '2900' },
    ],
  });
  assert.deepEqual(result.map(x => x.side), ['LONG', 'SHORT']);
  assert.deepEqual(result.map(x => x.usd), [7500, 2900]);
});

test('Binance price chooses a positive fill price when average is the string zero', () => {
  const now = Date.now();
  const base = { e: 'forceOrder', E: now,
    o: { s: 'BTCUSDT', S: 'SELL', i: 7, T: now,
      ap: '0', L: '71500', p: '71000', z: '2', l: '2', q: '10' },
  };
  const executed = parseLiquidations('binance', 'BTCUSDT', base);
  assert.equal(executed.length, 1, 'zero string average must not discard a real fill');
  assert.equal(executed[0].p, 71500);
  assert.equal(executed[0].usd, 143000);
  const orderFallback = parseLiquidations('binance', 'BTCUSDT', {
    ...base, o: { ...base.o, L: '0', p: '71000' },
  });
  assert.equal(orderFallback[0]?.p, 71000);
  assert.equal(parseLiquidations('binance', 'BTCUSDT', {
    ...base, o: { ...base.o, L: '0', p: '0' },
  }).length, 0, 'no valid price means no fabricated notional');
});
