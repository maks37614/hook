import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedLiquidationViewSubscriptions } from '../src/components/hookchart/sharedLiquidationView';
import type { Liquidation } from '../src/components/hookchart/engine';

type SourceOptions = {
  exchange: 'binance' | 'bybit'; symbol: string;
  onSnapshot: (events: Liquidation[], connected: boolean) => void;
  onLiquidation: (event: Liquidation) => void;
  onStatus: (connected: boolean) => void;
};
const initial = 1_800_000_000_000;
const row = (id: string, t: number, usd: number, side: 'LONG' | 'SHORT' = 'LONG'): Liquidation =>
  ({ id, t, usd, side, p: 100, q: usd / 100 });

test('50 HookCharts of one symbol share exactly one market buffer, timer, and cutoff', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: initial });
  const sources: SourceOptions[] = [];
  let closes = 0;
  const views = createSharedLiquidationViewSubscriptions(options => {
    sources.push(options as SourceOptions);
    return () => { closes++; };
  });
  const received: Array<{ rows: Liquidation[]; cut: number; clock: number }> = [];
  const stops = Array.from({ length: 50 }, () => views.subscribe({
    exchange: 'binance', symbol: 'BTCUSDT',
    onView: v => { received.push({ rows: v.rows, cut: v.automaticCut, clock: v.cascadeClock }); },
    onStatus: () => {},
  }));
  assert.deepEqual(views.stats(), { markets: 1, subscribers: 50, timers: 1 });
  assert.equal(sources.length, 1, 'one underlying shared Liq WebSocket for 50 charts');
  const event = row('shared-1', initial - 1000, 4000);
  sources[0].onSnapshot([event], true);
  assert.equal(received.length, 100, 'each chart receives one initial empty view and one snapshot');
  const latest = received.slice(-50);
  assert.ok(latest.every(x => x.rows === latest[0].rows),
    'all charts receive the exact same sorted array by reference');
  assert.ok(latest.every(x => x.cut === 4000));
  assert.equal(latest[0].rows[0].usd, 4000);
  t.mock.timers.tick(10_000);
  assert.equal(received.length, 100, 'unchanged Liq does not create React updates every 2 seconds');
  const next = row('shared-2', initial + 9000, 2000, 'SHORT');
  sources[0].onLiquidation(next);
  t.mock.timers.tick(200);
  assert.equal(received.length, 150, 'one market publish fans out to 50 charts');
  const updated = received.slice(-50);
  assert.ok(updated.every(x => x.rows === updated[0].rows));
  assert.equal(updated[0].rows.length, 2);
  stops.forEach(stop => stop());
  assert.equal(closes, 1, 'one socket closes when final chart unsubscribes');
  assert.deepEqual(views.stats(), { markets: 0, subscribers: 0, timers: 0 });
  t.mock.timers.tick(120_000);
  assert.equal(received.length, 150, 'no ghost timers after final unsubscribe');
});

test('duplicate and cumulative fills preserve original view and publish only increased USD', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: initial });
  let emit!: SourceOptions;
  const views = createSharedLiquidationViewSubscriptions(options => {
    emit = options as SourceOptions;
    return () => {};
  });
  const received: Liquidation[][] = [];
  const stop = views.subscribe({ exchange: 'bybit', symbol: 'ETHUSDT',
    onView: view => received.push(view.rows), onStatus: () => {} });
  emit.onSnapshot([row('same', initial, 1500)], true);
  const original = received.at(-1)!;
  emit.onLiquidation(row('same', initial, 1500));
  emit.onLiquidation(row('same', initial, 1200));
  t.mock.timers.tick(2000);
  assert.strictEqual(received.at(-1), original);
  emit.onLiquidation(row('same', initial + 100, 2200));
  t.mock.timers.tick(200);
  assert.notStrictEqual(received.at(-1), original);
  assert.equal(original[0].usd, 1500, 'past React state cannot be mutated');
  assert.equal(received.at(-1)![0].usd, 2200);
  assert.equal(received.at(-1)!.length, 1);
  stop();
});

test('cascade 1m/5m and adaptive cutoff 15m expire with shared stable rows', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: initial });
  let emit!: SourceOptions;
  const views = createSharedLiquidationViewSubscriptions(options => {
    emit = options as SourceOptions;
    return () => {};
  });
  const received: Array<{ time: number; clock: number; cut: number; rows: Liquidation[] }> = [];
  const stop = views.subscribe({
    exchange: 'binance', symbol: 'AGINGUSDT',
    onView: view => received.push({
      time: Date.now(), clock: view.cascadeClock, cut: view.automaticCut, rows: view.rows,
    }),
    onStatus: () => {},
  });
  emit.onSnapshot([row('aging', initial, 3500)], true);
  const first = received.at(-1)!;
  assert.equal(first.cut, 3500);
  t.mock.timers.tick(60_000);
  assert.strictEqual(received.at(-1), first, 'inclusive 1m event still contributes');
  t.mock.timers.tick(2000);
  const oneMinute = received.at(-1)!;
  assert.equal(oneMinute.rows, first.rows, 'time passage does not require a new sorted array');
  assert.ok(oneMinute.clock >= initial + 60_001);
  t.mock.timers.tick(4 * 60_000);
  const fiveMinute = received.at(-1)!;
  assert.equal(fiveMinute.rows, first.rows);
  assert.ok(fiveMinute.clock >= initial + 300_001, '5m risk expiry still invalidates React');
  const beforeQuarterHour = received.length;
  t.mock.timers.tick(10 * 60_000 + 2000);
  const expired = received.at(-1)!;
  assert.ok(received.length > beforeQuarterHour);
  assert.equal(expired.cut, 0, '15m quantiles expire even when there are no new events');
  assert.equal(expired.rows.length, 1, '30m Liq history remains visible after adaptive expiry');
  stop();
});

test('listener errors, late events, and final unsub do not leave ghost market subscriptions', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: initial });
  const sources: SourceOptions[] = [];
  let closes = 0;
  const shared = createSharedLiquidationViewSubscriptions(options => {
    sources.push(options as SourceOptions);
    return () => { closes++; };
  });
  const off1 = shared.subscribe({
    exchange: 'bybit', symbol: 'BTCUSDT',
    onView: () => { throw new Error('unmounted chart'); },
    onStatus: () => { throw new Error('inactive UI'); },
  });
  let notifications = 0;
  const off2 = shared.subscribe({ exchange: 'bybit', symbol: 'BTCUSDT',
    onView: () => { notifications++; }, onStatus: () => {} });
  sources[0].onSnapshot([row('live', initial, 1800)], true);
  assert.equal(notifications, 2, 'one listener exception must not block its peer');
  off1();
  off2();
  off1();
  assert.equal(closes, 1);
  sources[0].onLiquidation(row('late', initial, 2000));
  t.mock.timers.tick(5000);
  assert.deepEqual(shared.stats(), { markets: 0, subscribers: 0, timers: 0 });
  assert.equal(notifications, 2);
  const off3 = shared.subscribe({
    exchange: 'bybit', symbol: 'BTCUSDT',
    onView: () => {}, onStatus: () => {},
  });
  assert.equal(sources.length, 2, 'a newly subscribed market gets a clean current socket');
  off3();
});
