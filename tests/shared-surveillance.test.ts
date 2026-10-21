import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { SharedCoinMarketPool } from '../server/surveillance/sharedCoinMarket';
import { MultiTimeframeEngine, getTimeframeMs } from '../server/surveillance/multiTimeframeEngine';
import { LevelsAndFormationsEngine } from '../server/surveillance/levelsAndFormationsEngine';
import { VolumeAndOIEngine } from '../server/surveillance/volumeAndOIEngine';
import type { SurveillanceCoin, Timeframe } from '../src/types';

class Stream extends EventEmitter {
  status = 'LIVE';
  closed = false;
  destroy() { this.closed = true; this.removeAllListeners(); }
}
const instrument = { symbol: 'BTCUSDT', baseAsset: 'BTC', exchange: 'binance', marketType: 'futures' } as const;
const history = (tf: Timeframe) => {
  const step = getTimeframeMs(tf);
  const start = Math.floor(Date.now() / step) * step - 79 * step;
  return Array.from({ length: 80 }, (_, i) => ({ time: (start + i * step) / 1000,
    open: 100, close: 100, high: 101 + Math.sin(i), low: 99 - Math.sin(i), volume: 100 }));
};
const fixture = () => {
  const streams: Stream[] = [];
  let historyCalls = 0, oiCalls = 0;
  const pool = new SharedCoinMarketPool({
    stream: (() => { const stream = new Stream(); streams.push(stream); return stream; }) as any,
    klines: async (_exchange, _market, _symbol, tf) => { historyCalls++; return history(tf); },
    oi: async () => { oiCalls++; return { binance: null, bybit: null, totalOIUsd: 0 }; },
  });
  const price = (stream = streams[0], value = 100) => stream.emit('price', {
    price: value, high24h: 102, low24h: 98, volume24hUsd: 1_000_000, time: Date.now(), change24h: 1,
  });
  return { pool, streams, price, calls: () => ({ historyCalls, oiCalls }) };
};

test('one market shares its stream, initial history, OI and analysis until the final subscriber leaves', async () => {
  const f = fixture();
  const a = f.pool.acquire(instrument), b = f.pool.acquire({ ...instrument, symbol: 'btc/usdt' });
  try {
    assert.equal(a.market, b.market);
    await a.market.ready;
    assert.equal(f.streams.length, 1);
    assert.deepEqual(f.calls(), { historyCalls: 5, oiCalls: 1 });
    f.price();
    const first = a.market.getAnalysis();
    assert.ok(first);
    assert.equal(b.market.getAnalysis(), first, 'expensive analysis runs once in the existing six-second interval');
    a.release(); a.release();
    assert.equal(f.streams[0].closed, false, 'one account cannot stop another account');
    b.release();
    assert.equal(f.streams[0].closed, true);
    const restarted = f.pool.acquire(instrument);
    try { assert.notEqual(restarted.market, a.market); await restarted.market.ready; }
    finally { restarted.release(); }
  } finally { a.release(); b.release(); }
});

test('exchange and market identities stay separate; late subscribers receive a complete current book', async () => {
  const f = fixture();
  const leases = [f.pool.acquire(instrument), f.pool.acquire({ ...instrument, marketType: 'spot' }),
    f.pool.acquire({ ...instrument, exchange: 'bybit' })];
  try {
    await Promise.all(leases.map(lease => lease.market.ready));
    assert.equal(f.streams.length, 3);
    const market = leases[0].market, stream = f.streams[0];
    stream.emit('depth', { isSnapshot: true, sequence: 1, bids: [[99, 10], [98, 3]], asks: [[101, 7]] });
    stream.emit('depth', { sequence: 2, bids: [[99, 12], [98, 0]], asks: [[102, 5]] });
    assert.deepEqual(market.bookSnapshot(), { isSnapshot: true, sequence: 2,
      bids: [[99, 12]], asks: [[101, 7], [102, 5]] });
    stream.emit('status', 'STALE');
    assert.equal(market.bookSnapshot(), null);
    stream.emit('depth', { isSnapshot: true, sequence: 1, bids: [[97, 2]], asks: [[103, 4]] });
    assert.deepEqual(market.bookSnapshot()?.bids, [[97, 2]], 'a new snapshot can reset the sequence');
  } finally { leases.forEach(lease => lease.release()); }
});

test('shared results match the independent engines and stale feeds cannot emit analysis', async () => {
  const f = fixture(), lease = f.pool.acquire(instrument);
  const nativeNow = Date.now;
  let clock = nativeNow();
  Date.now = () => clock;
  try {
    await lease.market.ready;
    const candles = new MultiTimeframeEngine(), levels = new LevelsAndFormationsEngine(), volume = new VolumeAndOIEngine();
    for (const tf of ['1d', '4h', '1h', '15m', '5m'] as const) candles.setCandles(tf, history(tf));
    const trade = { price: 100.5, quantity: 3, side: 'BUY' as const, time: clock, isBuyerMaker: false };
    f.streams[0].emit('trade', trade); candles.updateWithTrade(trade); volume.addTrade(trade);
    const actual = lease.market.getAnalysis()!;
    assert.deepEqual(actual.structures, candles.getMultiTimeframeStructures(trade.price));
    assert.deepEqual(actual.levelZones, levels.findSupportResistanceZones(candles.getCandles('1d'), candles.getCandles('4h'), candles.getCandles('1h')));
    assert.deepEqual(actual.thirdTouches, levels.trackThirdTouch(trade.price, candles.getCandles('1h')));
    assert.deepEqual(actual.patterns, levels.detectFormations(candles.getCandles('1h'), trade.price));
    assert.deepEqual(actual.tradeFlow, volume.getTradeFlowSnapshot());
    clock += 15_001;
    assert.equal(lease.market.getAnalysis(), null);
    f.price();
    assert.ok(lease.market.getAnalysis());
  } finally { Date.now = nativeNow; lease.release(); }
});

test('reading trade flow for UI polling never changes the history used by signals', () => {
  const control = new VolumeAndOIEngine(), observed = new VolumeAndOIEngine();
  const trade = { price: 100, quantity: 3, side: 'BUY' as const, time: Date.now(), isBuyerMaker: false };
  control.addTrade(trade); observed.addTrade(trade);
  assert.deepEqual(control.getTradeFlowSnapshot(), observed.getTradeFlowSnapshot());
  for (let i = 0; i < 100; i++) observed.getTradeFlowSnapshot(false);
  const next = { ...trade, quantity: 2, side: 'SELL' as const };
  control.addTrade(next); observed.addTrade(next);
  assert.deepEqual(control.getTradeFlowSnapshot(), observed.getTradeFlowSnapshot());
});

test('a scheduled analysis never skips a cycle when its timer fires before the cache age boundary', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const nativeNow = Date.now;
  let clock = nativeNow();
  Date.now = () => clock;
  const f = fixture(), lease = f.pool.acquire(instrument);
  try {
    await lease.market.ready;
    f.price();
    const first = lease.market.getAnalysis();
    let next: typeof first = null;
    lease.market.on('tick', () => { next = lease.market.getAnalysis(); });
    clock += 5999;
    t.mock.timers.tick(6000);
    assert.ok(next);
    assert.notEqual(next, first, 'the six-second scheduler must force a new calculation');
  } finally { lease.release(); Date.now = nativeNow; t.mock.timers.reset(); }
});

test('two users share public analysis while thresholds, events and stopping remain independent', async () => {
  const directory = fs.mkdtempSync(path.join(process.cwd(), '.test-surveillance-shared-'));
  const previousDir = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  const { CoinWorker } = await import('../server/surveillance/coinWorker');
  const { getDefaultSurveillanceConfig } = await import('../server/surveillanceService');
  const { MacroAndNewsEngine } = await import('../server/surveillance/macroAndNewsEngine');
  const { StateMachineAndAlerts } = await import('../server/surveillance/stateMachineAndAlerts');
  const f = fixture(), macro = new MacroAndNewsEngine();
  macro.updateBTCContext = async () => ({ available: false } as any);
  const coin = (id: string, threshold: number): SurveillanceCoin => ({ ...instrument, id, userId: id,
    quoteAsset: 'USDT', isActive: true, createdAt: '', updatedAt: '',
    config: { ...getDefaultSurveillanceConfig(), densityMode: 'MANUAL', manualDensityThresholdUsd: threshold, telegramEnabled: false } });
  const alice = new CoinWorker(coin('alice', 1000), macro, new StateMachineAndAlerts(), f.pool);
  const bob = new CoinWorker(coin('bob', 1_000_000), macro, new StateMachineAndAlerts(), f.pool);
  const lease = f.pool.acquire(instrument);
  try {
    await lease.market.ready;
    f.price();
    f.streams[0].emit('depth', { isSnapshot: true, sequence: 1, bids: [[99, 100]], asks: [[101, 100]] });
    await Promise.all([alice.runDeepAnalysis(), bob.runDeepAnalysis()]);
    const a = alice.getSnapshot(), b = bob.getSnapshot();
    assert.equal(a.id, 'alice'); assert.equal(b.userId, 'bob');
    assert.equal(a.densityThresholdUsd, 1000); assert.equal(b.densityThresholdUsd, 1_000_000);
    assert.equal(a.structures, b.structures);
    assert.notEqual(a.recentEvents, b.recentEvents);
    alice.updateCoin(coin('alice', 2000));
    assert.equal(alice.getSnapshot().densityThresholdUsd, 2000);
    assert.equal(bob.getSnapshot().densityThresholdUsd, 1_000_000);
    alice.destroy();
    f.price(f.streams[0], 101);
    assert.equal(bob.getSnapshot().currentPrice, 101);
    assert.equal(f.streams[0].closed, false);
  } finally {
    alice.destroy(); bob.destroy(); lease.release();
    if (previousDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previousDir;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
