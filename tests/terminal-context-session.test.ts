import test from 'node:test';
import assert from 'node:assert/strict';
import type { Kline, TerminalChartBlock } from '../src/types';
import { startTerminalAnalysis, type AnalysisWorker, type SessionRuntime } from '../src/utils/terminalAnalysis/session';
import { evidenceScope, readTerminalEvidence, registerTerminalEvidence } from '../src/utils/terminalAnalysis/evidence';
import { parseSharedKlineMessage, type LiveKline } from '../src/components/hookchart/sharedKlineStream';
import type { ChartEvidence, ContextNotice, WorkerRequest } from '../src/utils/terminalAnalysis/model';

const at = 1_800_090_000_000;
const evidence: ChartEvidence = { manualLevels: [], densityEnabled: false, densities: [], oi: [] };
const block = (symbol = 'BTCUSDT', id = symbol, tf: TerminalChartBlock['timeframe'] = '5m'): TerminalChartBlock => ({
  id, symbol, baseAsset: symbol.replace('USDT', ''), quoteAsset: 'USDT', exchange: 'binance', marketType: 'futures', timeframe: tf,
});
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture() {
  let now = at, created = 0, terminated = 0, stopped = 0, errors = 0;
  const sent: WorkerRequest[] = [], calls: Array<{ symbol: string; tf: string; limit: number }> = [];
  const listeners = new Map<string, (row: LiveKline) => void>();
  const timers = new Map<number, () => void>(); let timerId = 0;
  const worker: AnalysisWorker = { postMessage: message => sent.push(message), onmessage: null, onerror: null,
    terminate() { terminated++; } };
  const runtime: SessionRuntime = {
    now: () => now,
    createWorker: () => { created++; return worker; },
    history: async (market, tf, limit) => {
      calls.push({ symbol: market.symbol, tf, limit });
      const count = tf === '5m' ? 37 : 17;
      return Array.from({ length: count }, (_, i) => candle(tf, count - 1 - i));
    },
    subscribe: (market, tf, callback) => {
      const key = market.exchange + ':' + market.marketType + ':' + market.symbol + ':' + tf;
      assert.ok(!listeners.has(key), 'one subscription per instrument/timeframe'); listeners.set(key, callback);
      return () => { stopped++; listeners.delete(key); };
    },
    evidence: () => evidence,
    later: callback => { const id = ++timerId; timers.set(id, callback); return id as unknown as ReturnType<typeof setTimeout>; },
    cancel: id => { timers.delete(id as unknown as number); },
  };
  function candle(tf = '5m', ago = 0) {
    const seconds = tf === '5m' ? 300 : 60, time = Math.floor(now / 1000 / seconds) * seconds - ago * seconds;
    return { time, open: 100, close: 100.1, high: 101, low: 99, volume: 100, eventTime: now };
  }
  const tick = (symbol = 'BTCUSDT', tf = '5m') => listeners.get('binance:futures:' + symbol + ':' + tf)?.(candle(tf));
  const flush = () => { now += 1000; const jobs = [...timers.values()]; timers.clear(); jobs.forEach(fn => fn()); };
  const lastUpdate = () => {
    const update = sent.filter(message => message.type === 'update').at(-1);
    assert.ok(update);
    return update;
  };
  const reply = (needFast: boolean, request = lastUpdate()) => {
    worker.onmessage?.({ data: { scope: request.scope, requestId: request.requestId, notices: [], needFast } });
  };
  return { runtime, worker, sent, calls, listeners, timers, candle, tick, flush, lastUpdate, reply,
    options: { configuredLimit: 10, blocks: [block()], onNotice() {}, onError: () => { errors++; } },
    move: (ms: number) => { now += ms; }, stats: () => ({ created, terminated, stopped, errors }) };
}

test('an excessive SETTINGS limit starts no worker, history, feed or timer even with one chart', () => {
  const f = fixture();
  startTerminalAnalysis({ ...f.options, configuredLimit: 12 }, f.runtime);
  startTerminalAnalysis({ ...f.options, blocks: Array.from({ length: 11 }, (_, i) => block('C' + i)) }, f.runtime);
  assert.equal(f.stats().created, 0); assert.equal(f.calls.length, 0); assert.equal(f.listeners.size, 0);
});

test('same market on several chart timeframes shares one context feed; fast mode is bounded', async () => {
  const f = fixture();
  const session = startTerminalAnalysis({ ...f.options, blocks: [block(), block('BTCUSDT', 'second', '1m')] }, f.runtime);
  await settle();
  assert.equal(f.stats().created, 1); assert.equal(f.listeners.size, 2);
  assert.deepEqual(f.calls.map(c => [c.tf, c.limit]), [['5m', 289], ['1m', 180]]);
  for (let i = 0; i < 3; i++) { f.tick(); f.flush(); f.reply(true); }
  assert.equal(f.listeners.size, 2); assert.equal(f.calls.length, 2);
  session.stop(); assert.equal(f.stats().stopped, 2); assert.equal(f.stats().terminated, 1);
});

test('history has a global two-request cold-start budget and cancellation stops queued work', async () => {
  const f = fixture(); let active = 0, maximum = 0;
  const finish: Array<() => void> = [];
  f.runtime.history = () => new Promise(resolve => {
    active++; maximum = Math.max(maximum, active);
    finish.push(() => { active--; resolve([f.candle('5m', 1), f.candle()]); });
  });
  const session = startTerminalAnalysis({ ...f.options, blocks: Array.from({ length: 10 }, (_, i) => block('C' + i)) }, f.runtime);
  assert.equal(active, 2); assert.equal(maximum, 2);
  finish.shift()!(); await settle(); assert.equal(active, 2);
  session.stop(); finish.forEach(fn => fn()); await settle();
  assert.equal(f.sent.filter(m => m.type === 'seed').length, 1);
  assert.equal(f.listeners.size, 0); assert.equal(maximum, 2);
});

test('history loads cannot overwrite live candles received while requests were pending', async () => {
  const f = fixture(); let resolve!: (rows: Kline[]) => void;
  f.runtime.history = () => new Promise(done => { resolve = done; });
  const session = startTerminalAnalysis(f.options, f.runtime);
  const live = { ...f.candle(), close: 100.9 };
  f.listeners.get('binance:futures:BTCUSDT:5m')!(live);
  resolve([f.candle('5m', 2), f.candle('5m', 1), f.candle()]); await settle();
  const seed = f.sent.find(m => m.type === 'seed');
  assert.ok(seed?.type === 'seed'); assert.equal(seed.rows.at(-1)!.close, 100.9);
  session.stop();
});

test('an in-flight worker receives a single coalesced next update, never an unbounded tick queue', async () => {
  const f = fixture(), session = startTerminalAnalysis(f.options, f.runtime);
  await settle(); f.tick(); f.flush();
  assert.equal(f.sent.filter(m => m.type === 'update').length, 1);
  for (let i = 0; i < 50; i++) { f.tick(); f.flush(); }
  assert.equal(f.sent.filter(m => m.type === 'update').length, 1);
  f.reply(false);
  f.flush(); assert.equal(f.sent.filter(m => m.type === 'update').length, 2);
  session.stop();
});

test('hidden tabs release only monitor subscriptions, avoid analysis, and resume without duplicate feeds', async () => {
  const f = fixture(), session = startTerminalAnalysis(f.options, f.runtime);
  await settle(); session.setVisible(false);
  assert.equal(f.listeners.size, 0); assert.equal(f.timers.size, 0);
  const count = f.sent.length; f.tick(); f.flush(); assert.equal(f.sent.length, count);
  session.setVisible(true); assert.equal(f.listeners.size, 1);
  session.setVisible(true); assert.equal(f.listeners.size, 1);
  session.stop();
  const hidden = fixture(), h = startTerminalAnalysis({ ...hidden.options, visible: false }, hidden.runtime);
  assert.equal(hidden.calls.length, 0); assert.equal(hidden.listeners.size, 0); assert.equal(hidden.stats().created, 0);
  h.setVisible(true); await settle(); assert.equal(hidden.calls.length, 1); h.stop();
});

test('stale exchange replays are rejected and worker failure releases every subscription', async () => {
  const f = fixture(), session = startTerminalAnalysis(f.options, f.runtime);
  await settle();
  f.listeners.get('binance:futures:BTCUSDT:5m')!({ ...f.candle(), eventTime: at - 20000 });
  assert.equal(f.timers.size, 0);
  f.worker.onerror?.({}); assert.equal(f.listeners.size, 0); assert.equal(f.stats().errors, 1);
  assert.equal(f.stats().terminated, 1); session.stop(); assert.equal(f.stats().terminated, 1);
});

test('passive evidence is isolated by owner, exchange, market and timeframe; disabled density is never copied', () => {
  const m = block(), owner = evidenceScope('user-a', m, '5m');
  const stop = registerTerminalEvidence(owner, () => ({ manualLevels: [100], densityEnabled: false,
    densities: [{ price: 100, side: 'BID', at, firstAt: at - 1000, usd: 500000 }], oi: [] }));
  assert.deepEqual(readTerminalEvidence([evidenceScope('user-b', m, '5m')], at).manualLevels, []);
  assert.deepEqual(readTerminalEvidence([evidenceScope('user-a', { ...m, marketType: 'spot' }, '5m')], at).manualLevels, []);
  assert.deepEqual(readTerminalEvidence([evidenceScope('user-a', { ...m, exchange: 'bybit' }, '5m')], at).manualLevels, []);
  assert.deepEqual(readTerminalEvidence([evidenceScope('user-a', m, '1m')], at).manualLevels, []);
  const found = readTerminalEvidence([owner], at);
  assert.deepEqual(found.manualLevels, [100]); assert.deepEqual(found.densities, []);
  stop(); assert.deepEqual(readTerminalEvidence([owner], at).manualLevels, []);
});

test('unused fast feeds are released after the short interesting-market window', async () => {
  const f = fixture(), session = startTerminalAnalysis(f.options, f.runtime);
  await settle();
  f.tick(); f.flush(); f.reply(true);
  await settle(); assert.equal(f.listeners.size, 2);
  f.move(11 * 60000);
  f.tick(); await settle(); f.flush(); f.reply(false);
  assert.equal(f.listeners.size, 1); session.stop();
});

test('a feed-construction failure cleans up the worker and any subscriptions already created', () => {
  const f = fixture(); f.runtime.subscribe = () => { throw new Error('unavailable'); };
  const session = startTerminalAnalysis(f.options, f.runtime);
  assert.equal(f.stats().errors, 1); assert.equal(f.stats().terminated, 1);
  assert.equal(f.calls.length, 0); session.stop();
});

test('changing presets keeps retained markets, switches only required minute feeds and respects a raised limit', async () => {
  const f = fixture();
  const ten = Array.from({ length: 10 }, (_, i) => block('M' + i));
  const session = startTerminalAnalysis({ ...f.options, blocks: ten }, f.runtime);
  await settle();
  assert.equal(f.calls.length, 10);
  const keep = f.listeners.get('binance:futures:M0:5m');
  const next = [...ten.slice(0, 9), block('NEW')];
  session.setBlocks(next, 10);
  await settle();
  assert.equal(f.stats().created, 1);
  assert.equal(f.calls.length, 11);
  assert.equal(f.listeners.get('binance:futures:M0:5m'), keep);
  assert.deepEqual(f.sent.filter(message => message.type === 'remove').map(message => message.scope), ['binance:futures:M9']);
  session.setBlocks([...next].reverse(), 10);
  session.setBlocks(next.map(b => ({ ...b, timeframe: '15m' })), 10);
  assert.equal(f.calls.length, 11);
  session.setBlocks([block('M0', 'other-id', '1m')], 6);
  await settle();
  assert.deepEqual(f.calls.at(-1), { symbol: 'M0', tf: '1m', limit: 180 });
  session.setBlocks([block('M0', 'other-id', '5m')], 9);
  assert.equal(f.listeners.size, 1);
  assert.equal(f.listeners.get('binance:futures:M0:5m'), keep);
  session.setBlocks([block('M0')], 12);
  assert.equal(f.stats().terminated, 1);
  assert.equal(f.listeners.size, 0);
});

test('queued old presets never consume history requests and late history cannot seed a replacement', async () => {
  const f = fixture();
  const started: string[] = [];
  const finish: Array<() => void> = [];
  f.runtime.history = market => new Promise(resolve => {
    started.push(market.symbol);
    finish.push(() => resolve([f.candle()]));
  });
  const ten = Array.from({ length: 10 }, (_, i) => block('OLD' + i));
  const session = startTerminalAnalysis({ ...f.options, blocks: ten }, f.runtime);
  assert.deepEqual(started, ['OLD0', 'OLD1']);
  for (let i = 0; i < 30; i++) session.setBlocks([block('NEXT' + i)], 10);
  session.setBlocks([block('OLD0')], 10);
  assert.deepEqual(started, ['OLD0', 'OLD1']);
  finish.shift()!(); await settle();
  assert.deepEqual(started, ['OLD0', 'OLD1', 'OLD0']);
  assert.equal(f.sent.filter(message => message.type === 'seed').length, 0);
  finish.splice(0).forEach(done => done()); await settle();
  assert.equal(f.sent.filter(message => message.type === 'seed').length, 1);
  session.stop();
});

test('a response for a removed and reopened market cannot deliver, enable a feed or unlock its new request', async () => {
  const f = fixture();
  let notices = 0;
  const session = startTerminalAnalysis({ ...f.options, onNotice: () => { notices++; } }, f.runtime);
  await settle();
  f.tick(); f.flush();
  const old = f.lastUpdate();
  session.setBlocks([block('ETHUSDT')], 10);
  session.setBlocks([block('BTCUSDT', 'new-block')], 10);
  await settle(); f.tick(); f.flush();
  const current = f.lastUpdate();
  assert.notEqual(old.requestId, current.requestId);
  f.worker.onmessage!({ data: { scope: old.scope, requestId: old.requestId, needFast: true,
    notices: [{ observedAt: f.runtime.now() } as ContextNotice] } });
  assert.equal(notices, 0);
  assert.equal(f.listeners.size, 1);
  f.tick(); f.flush();
  assert.equal(f.lastUpdate(), current);
  f.reply(false, current); f.flush();
  assert.ok(f.lastUpdate().requestId > current.requestId);
  session.stop();
});

test('hidden history waits for visibility and an old subscription or paused worker cannot revive a fast feed', async () => {
  const f = fixture();
  let finish!: (rows: Kline[]) => void;
  f.runtime.history = () => new Promise(resolve => { finish = resolve; });
  const session = startTerminalAnalysis(f.options, f.runtime);
  const previousListener = f.listeners.get('binance:futures:BTCUSDT:5m')!;
  session.setVisible(false);
  finish(Array.from({ length: 37 }, (_, i) => f.candle('5m', 36 - i))); await settle();
  assert.equal(f.sent.length, 0);
  session.setVisible(true);
  assert.equal(f.sent.filter(message => message.type === 'seed').length, 1);
  previousListener(f.candle()); f.flush();
  assert.equal(f.sent.filter(message => message.type === 'update').length, 0);
  f.tick(); f.flush();
  session.setVisible(false); session.setVisible(true);
  f.reply(true);
  assert.equal(f.listeners.size, 1);
  session.stop();
});

test('a failed gap repair retries on a new live event at most once per minute', async () => {
  const f = fixture();
  const initial = f.runtime.history;
  const session = startTerminalAnalysis(f.options, f.runtime);
  await settle();
  let attempts = 0;
  f.runtime.history = async (...args) => {
    if (++attempts === 1) throw new Error('transient');
    return initial(...args);
  };
  f.move(10 * 60_000); f.tick();
  await settle(); assert.equal(attempts, 1);
  f.move(59_000); f.tick(); await settle(); assert.equal(attempts, 1);
  f.move(1_000); f.tick(); await settle(); assert.equal(attempts, 2);
  f.move(60_000); f.tick(); await settle(); assert.equal(attempts, 2);
  session.stop();
});

test('a tab hidden across just one close waits for recovery before using the next live candle', async () => {
  const f = fixture();
  f.move(295_000);
  const session = startTerminalAnalysis(f.options, f.runtime);
  await settle();
  f.tick(); f.flush(); f.reply(false);
  const previousUpdates = f.sent.filter(m => m.type === 'update').length;
  session.setVisible(false); f.move(8_000); session.setVisible(true);
  f.tick(); f.flush();
  assert.equal(f.calls.length, 1, 'the minute request budget is still in effect');
  assert.equal(f.sent.filter(m => m.type === 'update').length, previousUpdates);
  f.move(55_000); f.tick(); await settle(); f.flush();
  assert.equal(f.calls.length, 2);
  assert.equal(f.sent.filter(m => m.type === 'update').length, previousUpdates + 1);
  session.stop();
});

test('a coalesced update retains the exchange close alongside the new live candle for both feeds', async () => {
  for (const [exchange, tf] of [['binance', '5m'], ['bybit', '1m']] as const) {
    const f = fixture();
    const session = startTerminalAnalysis({ ...f.options, blocks: [{ ...block('BTCUSDT', 'chart', tf), exchange }] }, f.runtime);
    await settle();
    const emit = f.listeners.get(exchange + ':futures:BTCUSDT:' + tf)!;
    const step = tf === '5m' ? 300 : 60;
    f.move(step * 1000 - 500);
    emit(f.candle(tf));
    f.move(600);
    const time = f.candle(tf, 1).time;
    const final = parseSharedKlineMessage(exchange, exchange === 'binance'
      ? { e: 'kline', s: 'BTCUSDT', E: f.runtime.now(), k: { i: tf, t: time * 1000, o: '100', h: '102', l: '99', c: '102', v: '101', x: true } }
      : { topic: 'kline.1.BTCUSDT', ts: f.runtime.now(), data: [{ start: time * 1000, open: '100', high: '102', low: '99', close: '102', volume: '101', confirm: true }] },
      'BTCUSDT', tf);
    assert.ok(final?.closed);
    emit(final);
    emit(f.candle(tf));
    f.flush();
    const message = f.lastUpdate();
    assert.equal(message.closedCandles?.[tf]?.close, 102);
    assert.equal(message.candles[tf]?.time, time + step);
    assert.equal(message.candles[tf]?.close, 100.1);
    session.stop();
  }
});

test('a Temka confirmation or cancellation needs an actually delivered notification', async () => {
  const f = fixture();
  const shown: string[] = [];
  const session = startTerminalAnalysis({ ...f.options, onNotice: n => { shown.push(n.stage); } }, f.runtime);
  await settle();
  function deliver(stage: ContextNotice['stage']) {
    f.tick(); f.flush();
    const request = f.lastUpdate();
    f.worker.onmessage!({ data: { scope: request.scope, requestId: request.requestId, needFast: false,
      notices: [{ observedAt: f.runtime.now(), key: 'held-low', scenario: 'temka2', stage } as ContextNotice] } });
  }
  deliver('confirmed'); deliver('cancelled');
  assert.deepEqual(shown, []);
  deliver('watch'); deliver('confirmed'); deliver('cancelled'); deliver('cancelled');
  assert.deepEqual(shown, ['watch', 'confirmed', 'cancelled']);
  session.stop();
});


test('optional analysis stop releases all feeds and the Worker despite individual native teardown failures', () => {
  const f = fixture();
  const subscribe = f.runtime.subscribe;
  f.runtime.subscribe = (...args) => {
    const unsubscribe = subscribe(...args);
    return () => {
      unsubscribe();
      throw new Error('simulated native close failure');
    };
  };
  const terminate = f.worker.terminate;
  f.worker.terminate = () => {
    terminate();
    throw new Error('simulated Worker termination failure');
  };
  const session = startTerminalAnalysis({
    ...f.options, blocks: [block('BTCUSDT'), block('ETHUSDT')],
  }, f.runtime);
  assert.equal(f.listeners.size, 2);
  assert.doesNotThrow(() => session.stop());
  assert.equal(f.listeners.size, 0, 'every feed is released even when another close throws');
  assert.equal(f.stats().terminated, 1, 'Worker termination is attempted');
  assert.equal(f.stats().errors, 0, 'disabling does not report a market analysis error');
  assert.doesNotThrow(() => session.stop(), 'repeated cleanup stays idempotent');
});
