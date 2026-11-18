import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SharedOiPoller } from '../server/surveillance/sharedOiPoller';
import type { ExchangeOIData } from '../server/marketService';

const market = { exchange: 'binance' as const, marketType: 'futures' as const,
  symbol: 'BTCUSDT', baseAsset: 'BTC' };

test('one shared REST sample updates separate owner OI values using each live price', async () => {
  let calls = 0;
  const samplesA: number[] = [];
  const samplesB: number[] = [];
  const poller = new SharedOiPoller(async () => {
    calls++;
    return { exchange: 'binance', symbol: 'BTCUSDT', amountCoins: 10,
      valueUsd: 1000, change5mPct: null, lastUpdated: 1234 };
  }, false);
  const a = poller.subscribe(market, {
    needsRest: () => true, currentPrice: () => 100,
    onSample: data => samplesA.push(data.valueUsd),
  });
  const b = poller.subscribe(market, {
    needsRest: () => true, currentPrice: () => 105,
    onSample: data => samplesB.push(data.valueUsd),
  });
  assert.equal(poller.stats().markets, 1);
  assert.equal(poller.stats().subscribers, 2);
  await poller.pollMarket('binance:futures:BTCUSDT');
  assert.equal(calls, 1);
  assert.deepEqual(samplesA, [1000]);
  assert.deepEqual(samplesB, [1050]);
  a(); b();
  assert.deepEqual(poller.stats(), { markets: 0, subscribers: 0,
    inFlight: 0, fetches: 1, skippedFreshWs: 0 });
});

test('fresh Bybit WS suppresses REST unless any owner has stale data', async () => {
  let calls = 0, stale = false;
  const seen: number[] = [];
  const poller = new SharedOiPoller(async () => {
    calls++;
    return { exchange: 'bybit', symbol: 'BTCUSDT', amountCoins: 2,
      valueUsd: 205, change5mPct: null, lastUpdated: 900 };
  }, false);
  const bybit = { ...market, exchange: 'bybit' as const };
  poller.subscribe(bybit, { needsRest: () => stale,
    currentPrice: () => 100, onSample: sample => seen.push(sample.valueUsd) });
  await poller.pollMarket('bybit:futures:BTCUSDT');
  assert.equal(calls, 0);
  stale = true;
  await poller.pollMarket('bybit:futures:BTCUSDT');
  assert.equal(calls, 1);
  assert.deepEqual(seen, [205]); // Bybit provides the notional directly.
});

test('unsubscribe and newer WS prevent an in-flight REST result from reaching the owner', async () => {
  let resolve!: (sample: ExchangeOIData | null) => void;
  const poller = new SharedOiPoller(() =>
    new Promise<ExchangeOIData | null>(r => { resolve = r; }), false, () => 1000);
  let enabled = true, delivered = 0;
  const release = poller.subscribe(market, {
    needsRest: () => enabled,
    currentPrice: () => 100,
    onSample: () => delivered++,
  });
  const pending = poller.pollMarket('binance:futures:BTCUSDT');
  enabled = false; // Bybit WS could supersede a pending fallback.
  resolve({ exchange: 'binance', symbol: 'BTCUSDT', amountCoins: 10,
    valueUsd: 1000, change5mPct: null, lastUpdated: 1000 });
  await pending;
  assert.equal(delivered, 0);
  const next = poller.pollMarket('binance:futures:BTCUSDT');
  assert.equal(delivered, 0);
  await next;
  release(); release();
  assert.equal(poller.stats().markets, 0);
});

test('spot markets never request OI; worker has no per-user OI timers', () => {
  let received = 0;
  const poller = new SharedOiPoller(async () => { received++; return null; }, false);
  const release = poller.subscribe({ ...market, marketType: 'spot' },
    { needsRest: () => true, currentPrice: () => 100, onSample: () => {} });
  assert.equal(poller.stats().markets, 0);
  release();
  assert.equal(received, 0);
  const worker = readFileSync(new URL('../server/surveillance/coinWorker.ts', import.meta.url),'utf8');
  assert.match(worker, /sharedOiPoller\.subscribe\(/);
  assert.match(worker, /this\.releaseOiSubscription\?\.\(\)/);
  assert.doesNotMatch(worker, /oiFetchInterval|oiInitialTimer|fetchSingleExchangeOI\(/);
});
