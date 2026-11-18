import test from 'node:test';
import assert from 'node:assert/strict';
import type { ScannedCoin } from '../src/types';
import type { RawTicker } from '../server/marketTickerFeed';
import {
  FullEarlyScanBusyError, FullEarlyScanManager, type FullEarlyScanSnapshot,
} from '../server/fullEarlyScan';

const params = { exchange: 'binance' as const, marketType: 'futures' as const,
  timeframe: '5m' as const, minVolumeUsd: 0 };
const ticker = (i: number, exchange: 'binance' | 'bybit' = 'binance'): RawTicker => ({
  exchange, marketType: 'futures', symbol: `COIN${i}USDT`,
  baseAsset: `COIN${i}`, quoteAsset: 'USDT',
  price: 1, high24h: 2, low24h: .5, change24h: 0, volumeUsd: 1000 + i,
});
const coin = (t: RawTicker): ScannedCoin => ({
  ...t, currentPrice: t.price, priceChange24h: t.change24h,
  highPrice24h: t.high24h, lowPrice24h: t.low24h,
  volume24hUsd: t.volumeUsd, timeframe: '5m',
  formations: [], earlyFormations: [{
    id: t.symbol, patternKey: 'double_bottom', name: 'W', bias: 'bullish',
    stage: 'forming', firstPivot: 1, neckline: 1.1,
    earlyEntryMin: .99, earlyEntryMax: 1.01, breakoutEntry: 1.11,
    stopLoss: .96, breakoutStopLoss: 1.05, target: 1.21,
    earlyRiskReward: 2, breakoutRiskReward: 1, observedAt: 1, explanation: '',
  }], lastUpdated: 1, exchangeUrl: '',
});
async function finished(manager: FullEarlyScanManager, id: string): Promise<FullEarlyScanSnapshot> {
  for (let i = 0; i < 200; i++) {
    const state = manager.snapshot(id)!;
    if (!['loading', 'running', 'stopping'].includes(state.status)) return state;
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for mock early scan');
}

test('full scan checks every available USDT ticker, no 75-pair or 60-pair ceiling', async () => {
  const tickers = Array.from({ length: 210 }, (_, i) => ticker(i));
  const seen: string[] = [];
  let active = 0, maxActive = 0;
  const manager = new FullEarlyScanManager({
    async loadTickers() { return { tickers, missingSources: [] }; },
    async checkTicker(t) {
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      seen.push(t.symbol);
      active--;
      return t.symbol === 'COIN200USDT' ? coin(t) : 'checked';
    },
    pause: async () => {},
  }, { concurrency: 5, batchPauseMs: 0 });
  const first = manager.start(params);
  const done = await finished(manager, first.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.total, 210);
  assert.equal(done.processed, 210);
  assert.equal(done.checked, 210);
  assert.equal(done.data.length, 1);
  assert.equal(done.data[0].symbol, 'COIN200USDT', 'low-volume tail must be scanned too');
  assert.equal(new Set(seen).size, 210);
  assert.ok(maxActive <= 5);
  const cached = manager.start(params);
  assert.equal(cached.id, first.id, 'same market and TF share completed scan');
});

test('full scan respects selected exchange, market and volume, never doubles duplicate pair IDs', async () => {
  const tickers = [
    ticker(1), ticker(1), ticker(2, 'bybit'),
    { ...ticker(3), marketType: 'spot' as const },
    { ...ticker(4), volumeUsd: 0 }, ticker(5),
  ];
  const scanned: string[] = [];
  const manager = new FullEarlyScanManager({
    async loadTickers() { return { tickers, missingSources: [] }; },
    async checkTicker(t) { scanned.push(t.symbol); return 'checked'; },
    pause: async () => {},
  }, { batchPauseMs: 0 });
  const done = await finished(manager, manager.start({ ...params, minVolumeUsd: 1001 }).id);
  assert.equal(done.total, 2);
  assert.deepEqual(scanned.sort(), ['COIN1USDT', 'COIN5USDT']);
});

test('unavailable exchange sources and failed candles are explicitly incomplete', async () => {
  const manager = new FullEarlyScanManager({
    async loadTickers() {
      return { tickers: [ticker(1), ticker(2), ticker(3)], missingSources: ['bybit: unavailable'] };
    },
    async checkTicker(t) {
      return t.symbol === 'COIN1USDT' ? null : t.symbol === 'COIN2USDT' ? 'skipped' : 'checked';
    },
    pause: async () => {},
  }, { batchPauseMs: 0 });
  const done = await finished(manager, manager.start(params).id);
  assert.equal(done.status, 'partial');
  assert.equal(done.total, 3);
  assert.equal(done.processed, 3);
  assert.equal(done.checked, 1);
  assert.equal(done.skipped, 1);
  assert.equal(done.failed, 1);
  assert.deepEqual(done.missingSources, ['bybit: unavailable']);
});

test('global active job cap prevents unbounded concurrent whole-exchange scans', async () => {
  let unblock!: () => void;
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  const manager = new FullEarlyScanManager({
    async loadTickers() { return { tickers: [ticker(1)], missingSources: [] }; },
    async checkTicker() { await gate; return 'checked'; },
    pause: async () => {},
  }, { maxActiveJobs: 2, batchPauseMs: 0 });
  const a = manager.start(params);
  const b = manager.start({ ...params, timeframe: '15m' });
  assert.notEqual(a.id, b.id);
  assert.equal(manager.start(params).id, a.id, 'in-flight identical searches are shared');
  assert.throws(() => manager.start({ ...params, timeframe: '1h' }), FullEarlyScanBusyError);
  unblock();
  assert.equal((await finished(manager, a.id)).status, 'completed');
  assert.equal((await finished(manager, b.id)).status, 'completed');
});

test('empty ticker response never claims a successful full market scan', async () => {
  const manager = new FullEarlyScanManager({
    async loadTickers() { return { tickers: [], missingSources: ['binance futures offline'] }; },
    async checkTicker() { throw new Error('must not be called'); },
  });
  const done = await finished(manager, manager.start(params).id);
  assert.equal(done.status, 'failed');
  assert.equal(done.total, 0);
  assert.match(done.message || '', /не повернула/);
});

test('stop during an in-flight batch keeps found setups and never schedules another batch', async () => {
  const tickers = Array.from({ length: 8 }, (_, i) => ticker(i));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let firstStarted!: () => void;
  const started = new Promise<void>(resolve => { firstStarted = resolve; });
  const checked: string[] = [];
  const manager = new FullEarlyScanManager({
    async loadTickers() { return { tickers, missingSources: [] }; },
    async checkTicker(t) {
      checked.push(t.symbol);
      firstStarted();
      await gate;
      return coin(t);
    },
    pause: async () => {},
  }, { concurrency: 1, batchPauseMs: 0 });
  const pending = manager.start(params);
  await started;
  assert.equal(manager.snapshot(pending.id)?.status, 'running');
  const requested = manager.stop(pending.id);
  assert.equal(requested?.status, 'stopping');
  assert.equal(manager.stop(pending.id)?.status, 'stopping', 'repeated stop is idempotent');
  release();
  const stopped = await finished(manager, pending.id);
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.total, 8);
  assert.equal(stopped.processed, 1);
  assert.equal(stopped.checked, 1);
  assert.equal(stopped.data.length, 1);
  assert.equal(checked.length, 1, 'stop must not launch later batches');
  assert.equal(stopped.finishedAt !== undefined, true);
  const restarted = manager.start(params);
  assert.notEqual(restarted.id, pending.id, 'stopped session must not be reused from cache');
  assert.equal((await finished(manager, restarted.id)).status, 'completed');
});

test('stop during exchange discovery prevents all candle requests', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const manager = new FullEarlyScanManager({
    async loadTickers() {
      await gate;
      return { tickers: [ticker(1), ticker(2)], missingSources: [] };
    },
    async checkTicker() {
      calls++;
      return 'checked';
    },
  });
  const started = manager.start(params);
  assert.equal(started.status, 'loading');
  assert.equal(manager.stop(started.id)?.status, 'stopping');
  release();
  const done = await finished(manager, started.id);
  assert.equal(done.status, 'stopped');
  assert.equal(done.processed, 0);
  assert.equal(calls, 0);
  assert.equal(manager.stop('not-an-id'), null);
  assert.equal(manager.stop(done.id)?.status, 'stopped', 'terminal stop is a no-op');
});

test('completed scans are not modified by a later stop request', async () => {
  const manager = new FullEarlyScanManager({
    async loadTickers() { return { tickers: [ticker(1)], missingSources: [] }; },
    async checkTicker() { return 'checked'; },
  }, { batchPauseMs: 0 });
  const started = manager.start(params);
  const done = await finished(manager, started.id);
  assert.equal(done.status, 'completed');
  assert.equal(manager.stop(started.id)?.status, 'completed');
  assert.equal(manager.snapshot(started.id)?.processed, 1);
});
