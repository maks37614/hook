import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CoinWorker } from '../server/surveillance/coinWorker';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';
import { densityOutlierThresholds } from '../server/surveillance/depthOutlierProfile';

function fakeWorker() {
  const worker = Object.create(CoinWorker.prototype) as any;
  worker.isDestroyed = false;
  worker.coin = {
    id: 'coin1', userId: 'density-owner', symbol: 'ZECUSDT',
    exchange: 'binance', marketType: 'futures', isActive: true,
    config: { telegramEnabled: false, triggerModes: ['realtime'], densityMode: 'AUTO' },
  };
  worker.streamClient = {
    status: 'LIVE',
    marketTicker: { price: 500 },
    hasFreshMarketQuote: () => true,
  };
  worker.recentEvents = [];
  worker.analysisInFlight = true; // Mimics slow macro/BTC request.
  worker.lastAnalysisTimestamp = 0;
  worker.orderBookEngine = {
    pending: [] as any[],
    hasFreshSynchronizedDepth: () => true,
    pollNewlyAppearedDensities() { const p = this.pending; this.pending = []; return p; },
    getSignificantDensities: () => [],
    calculateAdaptiveThreshold: () => 25_000,
  };
  return worker;
}
const wall = (firstSeenAt: number) => ({
  id: 'ask_510', side: 'ASK', price: 510, quantity: 100, notionalUsd: 51_000,
  distancePct: 2, ageSeconds: 18, firstSeenAt, lastSeenAt: Date.now(),
  averageSizeUsd: 51_000, maxSizeUsd: 51_000, qualityScore: 70,
  classification: 'PERSISTENT_LIQUIDITY', confirmed: true, persistenceRatio: 1,
  persistenceSamples: 4,
});

test('confirmed density events are handled while deep analysis is busy, with no extra timers or API calls', async () => {
  const worker = fakeWorker();
  const first = Date.now() - 18_000;
  const liveWall = wall(first);
  worker.orderBookEngine.pending = [liveWall];
  await worker.runDeepAnalysis();
  assert.equal(worker.recentEvents.length, 1);
  liveWall.notionalUsd = 8_000;
  assert.equal(worker.recentEvents[0].evidence.notionalUsd, 51_000,
    'old event evidence must not mutate with the active order-book level');
  assert.equal(worker.analysisInFlight, true);
  assert.equal(worker.lastAnalysisTimestamp, 0, 'cheap DOM checks never start expensive analysis');
  assert.match(worker.recentEvents[0].description, /2%.+18с/);
  assert.ok(worker.recentEvents[0].eventId.endsWith(String(first)));

  // Same still-standing wall is consumed once, and a duplicate callback
  // cannot spam the event feed.
  worker.orderBookEngine.pending = [wall(first)];
  await worker.runDeepAnalysis();
  assert.equal(worker.recentEvents.length, 1);

  // It was cancelled, then placed again at the SAME price: new wall lifetime
  // gets a separate visible event (Telegram cooldown still uses side + price).
  const second = first + 35_000;
  worker.orderBookEngine.pending = [wall(second)];
  await worker.runDeepAnalysis();
  assert.equal(worker.recentEvents.length, 2);
  assert.notEqual(worker.recentEvents[0].eventId, worker.recentEvents[1].eventId);

  const source = readFileSync(new URL('../server/surveillance/coinWorker.ts', import.meta.url), 'utf8');
  const analysis = source.indexOf('public async runDeepAnalysis()');
  const densityCheck = source.indexOf('this.processDensitySignals();', analysis);
  const quoteGateBeforeHeavy = source.indexOf('!this.streamClient.hasFreshMarketQuote()', densityCheck);
  assert.ok(analysis > 0 && densityCheck > analysis && quoteGateBeforeHeavy > densityCheck,
    'verified depth is processed before the price-dependent macro/analysis gate');
  assert.doesNotMatch(source, /setInterval\(\(\) => this\.processDensitySignals/);
  const macro = source.indexOf('await this.macroEngine.updateBTCContext()');
  const quoteGate = source.indexOf('this.currentPrice !== price', macro);
  const currentBook = source.indexOf('const significantDensities = this.orderBookEngine.getSignificantDensities(', macro);
  const setup = source.indexOf('this.setupEngine.evaluateSetups(', macro);
  assert.ok(macro > 0 && quoteGate > macro && currentBook > quoteGate && setup > currentBook,
    'setup scoring must read current depth after the asynchronous macro call');
});

test('fresh synchronized DOM can notify before a quiet trade ticker; stale book or paused worker cannot', async () => {
  const worker = fakeWorker();
  let polls = 0;
  worker.orderBookEngine.pollNewlyAppearedDensities = () => { polls++; return [wall(Date.now()-18000)]; };
  worker.streamClient.hasFreshMarketQuote = () => false;
  worker.orderBookEngine.hasFreshSynchronizedDepth = () => false;
  await worker.runDeepAnalysis();
  assert.equal(polls,0,'a stale book must never emit a wall, even if an old price is cached');
  worker.orderBookEngine.hasFreshSynchronizedDepth = () => true;
  await worker.runDeepAnalysis();
  assert.equal(polls,1,'fresh DOM supports a liquidity alert without a new trade');
  assert.equal(worker.recentEvents.length,1);
  assert.equal(worker.lastAnalysisTimestamp,0,'price-dependent macro and setup analysis remains blocked');
  worker.coin.isActive = false;
  await worker.runDeepAnalysis();
  assert.equal(polls,1);
  worker.coin.isActive = true;
  worker.streamClient.status = 'STALE';
  await worker.runDeepAnalysis();
  assert.equal(polls,1, 'a disconnected exchange cannot supply live density alerts');
});

test('AUTO floor without live DOM does not depend on MANUAL amount or settings', () => {
  assert.deepEqual(densityOutlierThresholds(null, 0, 20_000_000, 'AUTO'),
    { common: 1_000_000, bid: 1_000_000, ask: 1_000_000 });
  assert.deepEqual(densityOutlierThresholds(null, 0, 20_000_000, 'HYBRID'),
    { common: 20_000_000, bid: 20_000_000, ask: 20_000_000 });
  assert.deepEqual(densityOutlierThresholds(null, 0, 5_000, 'MANUAL'),
    { common: 5_000, bid: 5_000, ask: 5_000 });
});

test('depth-only freshness is synchronized, expires after silence, and needs resnapshot after reconnect', t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const book = new OrderBookEngine('THINUSDT', 'bybit', 'futures');
  book.applyDepth({ isSnapshot:true, sequence:1, eventTime:now,
    bids:[[100,500]], asks:[[101,100]] });
  assert.equal(book.hasFreshSynchronizedDepth(), true);
  now += 6000;
  assert.equal(book.hasFreshSynchronizedDepth(), false,
    'quiet socket alone must not be mistaken for a continuously observed book');
  book.setStatus('STALE');
  assert.equal(book.hasFreshSynchronizedDepth(),false);
  book.applyDepth({ sequence:2, eventTime:now, bids:[], asks:[] });
  assert.equal(book.hasFreshSynchronizedDepth(),false,
    'a delta cannot repair lost continuity');
  book.applyDepth({ isSnapshot:true, sequence:3, eventTime:now,
    bids:[[100,500]], asks:[[101,100]] });
  assert.equal(book.hasFreshSynchronizedDepth(),true);
});
