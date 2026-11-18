import assert from 'node:assert/strict';
import test from 'node:test';
import type { BookUpdate } from '../src/utils/binanceOrderBook';
import type { ChartDepthStatus } from '../src/utils/hookChartDepthProtocol';
import { HookChartDensityBook } from '../src/components/hookchart/densityBook';
import { createSharedDepthSubscriptions } from '../src/components/hookchart/sharedDepthStream';
import { createSharedLiquidationSubscriptions } from '../src/components/hookchart/sharedLiquidationStream';
import type { Liquidation } from '../src/components/hookchart/engine';
import { getSessionLiquidationTotals, recordSessionLiquidation, sessionLiquidationScope } from '../src/components/hookchart/liquidationSession';

const initialBook = (): BookUpdate => ({
  isSnapshot: true, sequence: 100, eventTime: Date.now(),
  bids: [[100, 20], [99, 30]], asks: [[101, 15], [102, 40]],
});

test('five HookCharts subscribe to one site depth WS and late charts get full order books', () => {
  type Options = Parameters<typeof createSharedDepthSubscriptions>[0];
  // Infer options from the connector rather than relying on private types.
  let source: { onBook: (b: BookUpdate) => boolean; onStatus: (s: ChartDepthStatus) => void } | undefined;
  let connected = 0, disconnected = 0;
  const manager = createSharedDepthSubscriptions((options) => {
    connected++;
    source = options;
    options.onStatus('syncing');
    return () => { disconnected++; };
  });
  const settings = { densityAnalysis: true, densityMode: 'manual' as const,
    densityThreshold: 1, densityDiffPct: 5 };
  const books = Array.from({ length: 5 }, () => new HookChartDensityBook());
  const status: ChartDepthStatus[][] = books.map(() => []);
  const subscribe = (index: number) => manager.subscribe({
    exchange: 'binance', marketType: 'futures', symbol: 'BTCUSDT',
    onBook: b => books[index].apply(b),
    onStatus: s => { status[index].push(s); if (s !== 'live') books[index].clear(); },
  });
  const stop = [subscribe(0), subscribe(1)];
  assert.equal(connected, 1);
  assert.ok(source);
  assert.equal(source!.onBook(initialBook()), true);
  source!.onStatus('live');
  for (let i = 2; i < 5; i++) stop.push(subscribe(i));
  assert.equal(connected, 1, 'no new browser-to-VPS sockets');
  assert.equal(manager.activeScopes(), 1);
  for (let i = 0; i < 5; i++) {
    assert.equal(status[i].at(-1), 'live');
    assert.equal(books[i].read(settings, 0).depthReady, true);
  }
  source!.onBook({ sequence: 101, eventTime: Date.now(), bids: [[99, 0]], asks: [[102, 50]] });
  source!.onStatus('live');
  for (const book of books) {
    assert.equal(book.read(settings, 0).book.b.some(b => b.p === 99), false,
      'cancellation must reach every chart immediately');
    assert.equal(book.read(settings, 0).book.a.find(a => a.p === 102)?.q, 50);
  }
  stop[0]();
  assert.equal(disconnected, 0);
  stop.slice(1).forEach(fn => fn());
  assert.equal(disconnected, 1);
  assert.equal(manager.activeScopes(), 0);
});

test('stale book is never replayed; resync snapshot restores subscribers', () => {
  let source: { onBook: (b: BookUpdate) => boolean; onStatus: (s: ChartDepthStatus) => void } | undefined;
  const manager = createSharedDepthSubscriptions(options => {
    source = options;
    return () => {};
  });
  const received: BookUpdate[] = [], statuses: ChartDepthStatus[] = [];
  const scope = { exchange: 'bybit' as const, marketType: 'spot' as const, symbol: 'SOLUSDT' };
  const first = manager.subscribe({ ...scope, onBook: () => true, onStatus: () => {} });
  source!.onBook(initialBook());
  source!.onStatus('live');
  source!.onStatus('reconnecting');
  const second = manager.subscribe({ ...scope, onBook: b => { received.push(b); return true; },
    onStatus: s => statuses.push(s) });
  assert.equal(received.length, 0);
  assert.equal(statuses.at(-1), 'reconnecting');
  source!.onBook(initialBook());
  source!.onStatus('live');
  assert.equal(received.length, 1);
  assert.equal(statuses.at(-1), 'live');
  first(); second();
});

test('a broken chart gets a complete local resync without restarting everybody', () => {
  let source: { onBook: (b: BookUpdate) => boolean; onStatus: (s: ChartDepthStatus) => void } | undefined;
  let stopped = 0;
  const manager = createSharedDepthSubscriptions(options => {
    source = options;
    return () => { stopped++; };
  });
  const base = { exchange: 'binance' as const, marketType: 'futures' as const, symbol: 'ETHUSDT' };
  const stopA = manager.subscribe({ ...base, onBook: () => true, onStatus: () => {} });
  let rejectOnce = true, replayed = false;
  const stopB = manager.subscribe({
    ...base,
    onBook: b => {
      if (!b.isSnapshot && rejectOnce) { rejectOnce = false; return false; }
      if (b.isSnapshot) replayed = true;
      return true;
    }, onStatus: () => {},
  });
  source!.onBook(initialBook()); source!.onStatus('live');
  replayed = false;
  assert.equal(source!.onBook({ sequence: 101, eventTime: Date.now(), bids: [[99, 0]], asks: [] }), true);
  assert.equal(replayed, true);
  assert.equal(stopped, 0, 'isolated chart failure must not drop shared connection');
  stopA(); stopB();
});

test('a subscriber with a failed local snapshot must not show LIVE until recovered', () => {
  let source: { onBook: (book: BookUpdate) => boolean; onStatus: (status: ChartDepthStatus) => void } | undefined;
  const manager = createSharedDepthSubscriptions(options => {
    source = options;
    return () => {};
  });
  const scope = { exchange: 'bybit' as const, marketType: 'futures' as const, symbol: 'ADAUSDT' };
  const stopA = manager.subscribe({ ...scope, onBook: () => true, onStatus: () => {} });
  source!.onBook(initialBook()); source!.onStatus('live');
  const statuses: ChartDepthStatus[] = [];
  let accept = false;
  const stopB = manager.subscribe({
    ...scope,
    onBook: () => accept,
    onStatus: status => statuses.push(status),
  });
  assert.equal(statuses.at(-1), 'reconnecting');
  source!.onBook({ sequence: 101, eventTime: Date.now(), bids: [[99, 0]], asks: [] });
  source!.onStatus('live');
  assert.equal(statuses.at(-1), 'reconnecting',
    'shared transport cannot claim a broken chart is already live');
  accept = true;
  source!.onBook({ sequence: 102, eventTime: Date.now(), bids: [[100, 25]], asks: [] });
  source!.onStatus('live');
  assert.equal(statuses.at(-1), 'live');
  stopA(); stopB();
});

test('large grid with 120 HookCharts still opens one browser depth connection per symbol', () => {
  let connects = 0, disconnects = 0;
  const manager = createSharedDepthSubscriptions(() => {
    connects++;
    return () => { disconnects++; };
  });
  const stops = Array.from({ length: 120 }, () => manager.subscribe({
    exchange: 'binance', marketType: 'futures', symbol: 'BTCUSDT',
    onBook: () => true, onStatus: () => {},
  }));
  assert.equal(connects, 1);
  stops.slice(0, 119).forEach(fn => fn());
  assert.equal(disconnects, 0);
  stops[119]();
  assert.equal(disconnects, 1);
});

test('liquidation WS shares snapshots, preserves Binance cumulative updates and session de-dup', () => {
  type LiqOptions = { onSnapshot: (rows: Liquidation[], live: boolean) => void;
    onLiquidation: (event: Liquidation) => void; onStatus: (live: boolean) => void };
  let source: LiqOptions | undefined;
  let connected = 0, stopped = 0;
  const manager = createSharedLiquidationSubscriptions(options => {
    connected++; source = options; options.onStatus(false);
    return () => { stopped++; };
  });
  const symbol = 'SHAREDTESTUSDT';
  const scope = { exchange: 'binance' as const, symbol };
  const session = sessionLiquidationScope('binance', 'futures', symbol);
  const mk = (id: string, usd: number, side: 'LONG' | 'SHORT' = 'LONG'): Liquidation =>
    ({ id, t: Date.now(), p: 100, q: usd / 100, usd, side });
  const received: Liquidation[][] = [[], []];
  const snapshots: Liquidation[][] = [[], []];
  const subscribe = (index: number) => manager.subscribe({
    ...scope,
    onSnapshot: rows => {
      snapshots[index] = rows;
      for (const row of rows) recordSessionLiquidation(session, row, 'snapshot');
    },
    onLiquidation: row => { received[index].push(row); recordSessionLiquidation(session, row); },
    onStatus: () => {},
  });
  const stopA = subscribe(0);
  source!.onSnapshot([mk('li-1', 1000)], true);
  const stopB = subscribe(1);
  assert.equal(connected, 1);
  assert.equal(snapshots[1].length, 1, 'late chart restores live recent events');
  source!.onLiquidation(mk('li-2', 2000));
  source!.onLiquidation(mk('li-2', 2000));
  source!.onLiquidation(mk('li-2', 3000));
  assert.equal(received[0].length, 2);
  assert.equal(received[1].length, 2);
  assert.equal(getSessionLiquidationTotals(session).totalUsd, 4000);
  stopA();
  assert.equal(stopped, 0);
  stopB();
  assert.equal(stopped, 1);
  assert.equal(manager.activeScopes(), 0);
});

test('reconnecting with a stale snapshot never reduces an already observed cumulative fill', () => {
  let upstream: {
    onSnapshot: (rows: Liquidation[], connected: boolean) => void;
    onLiquidation: (row: Liquidation) => void;
    onStatus: (connected: boolean) => void;
  } | undefined;
  let sockets = 0;
  const manager = createSharedLiquidationSubscriptions(options => {
    sockets++;
    upstream = options;
    return () => {};
  });
  const scope = { exchange: 'binance' as const, symbol: 'BTCUSDT' };
  const firstSnapshots: Liquidation[][] = [];
  const laterSnapshots: Liquidation[][] = [];
  const t = Date.now();
  const fill = (id: string, usd: number): Liquidation => ({
    id, side: 'LONG', t, p: 100, q: usd / 100, usd,
  });
  const stopFirst = manager.subscribe({
    ...scope, onSnapshot: rows => firstSnapshots.push(rows),
    onLiquidation: () => {}, onStatus: () => {},
  });
  upstream!.onSnapshot([fill('fill-1', 1000)], true);
  upstream!.onLiquidation(fill('fill-1', 3000));
  upstream!.onLiquidation(fill('fill-2', 500));
  upstream!.onStatus(false);
  // Simulate a restarted backend with a persisted but older partial snapshot.
  upstream!.onSnapshot([fill('fill-1', 1200)], true);
  const stopLater = manager.subscribe({
    ...scope, onSnapshot: rows => laterSnapshots.push(rows),
    onLiquidation: () => {}, onStatus: () => {},
  });
  const latest = firstSnapshots.at(-1)!;
  assert.equal(latest.find(row => row.id === 'fill-1')?.usd, 3000);
  assert.equal(latest.find(row => row.id === 'fill-2')?.usd, 500);
  assert.deepEqual(latest, laterSnapshots.at(-1));
  assert.equal(sockets, 1, 'new chart must re-use the same browser socket');
  upstream!.onSnapshot([fill('fill-1', 4000)], true);
  assert.equal(firstSnapshots.at(-1)?.find(row => row.id === 'fill-1')?.usd, 4000,
    'genuine larger cumulative fills from the server must still be accepted');
  stopFirst(); stopLater();
});

test('a stale liquidation snapshot does not resurrect expired historical events', () => {
  let upstream: {
    onSnapshot: (rows: Liquidation[], connected: boolean) => void;
    onLiquidation: (row: Liquidation) => void;
  } | undefined;
  const manager = createSharedLiquidationSubscriptions(options => {
    upstream = options;
    return () => {};
  });
  const snapshots: Liquidation[][] = [];
  const stop = manager.subscribe({
    exchange: 'bybit', symbol: 'ETHUSDT',
    onSnapshot: rows => snapshots.push(rows),
    onLiquidation: () => {}, onStatus: () => {},
  });
  const old = { id: 'expired-1', side: 'SHORT' as const,
    t: Date.now() - 31 * 60_000, p: 100, q: 2, usd: 200 };
  upstream!.onSnapshot([old], true);
  assert.deepEqual(snapshots.at(-1), []);
  upstream!.onLiquidation(old);
  upstream!.onSnapshot([], true);
  assert.deepEqual(snapshots.at(-1), []);
  stop();
});

test('one independent browser socket per exchange and coin, not one global market feed', () => {
  let created = 0;
  const manager = createSharedLiquidationSubscriptions(() => { created++; return () => {}; });
  const listener = { onSnapshot: () => {}, onLiquidation: () => {}, onStatus: () => {} };
  const stops = [
    manager.subscribe({ exchange: 'binance', symbol: 'BTCUSDT', ...listener }),
    manager.subscribe({ exchange: 'binance', symbol: 'ETHUSDT', ...listener }),
    manager.subscribe({ exchange: 'bybit', symbol: 'BTCUSDT', ...listener }),
    manager.subscribe({ exchange: 'binance', symbol: 'BTCUSDT', ...listener }),
  ];
  assert.equal(created, 3);
  stops.forEach(fn => fn());
  assert.equal(manager.activeScopes(), 0);
});
