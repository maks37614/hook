import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CandleCloseCheckPlanner } from '../server/surveillance/candleCloseCheckPlanner';
import type { SurveillanceConfig } from '../src/types';

const config = (modes: string[]): SurveillanceConfig =>
 ({ timeframe: '4h', triggerModes: modes } as SurveillanceConfig);

test('4h bar-close checks run only at next close plus lag, not every 25s', () => {
 const scheduler=new CandleCloseCheckPlanner();
 const four=config(['bar_close']);
 assert.equal(scheduler.due('user:A',four,10_000),true);
 scheduler.succeeded('user:A',four,10_000);
 assert.equal(scheduler.due('user:A',four,35_000),false);
 assert.equal(scheduler.due('user:A',four,14_400_000),false);
 assert.equal(scheduler.due('user:A',four,14_402_500),true);
});
test('multiple close modes choose the earliest boundary, realtime preserves 25s cadence',()=>{
 const schedule=new CandleCloseCheckPlanner();
 const modes=config(['bar_close','bar_close_15m','realtime']);
 schedule.succeeded('x',modes,899_000);
 assert.equal(schedule.due('x',modes,901_500),false);
 assert.equal(schedule.due('x',modes,902_500),true);
 const live=config(['realtime']);
 schedule.succeeded('y',live,10_000);
 assert.equal(schedule.due('y',live,34_999),false);
 assert.equal(schedule.due('y',live,35_000),true);
});
test('failures retry with bounded exponential backoff and config edits force immediate check',()=>{
 const planner=new CandleCloseCheckPlanner();
 const modes=config(['bar_close']);
 planner.failed('u',modes,1000);
 assert.equal(planner.due('u',modes,5999),false);
 assert.equal(planner.due('u',modes,6000),true);
 planner.failed('u',modes,6000);
 assert.equal(planner.due('u',modes,15000),false);
 assert.equal(planner.due('u',modes,16000),true);
 assert.equal(planner.due('u',config(['bar_close_15m']),7000),true);
 planner.prune(new Set());
 assert.equal(planner.stats().tracked,0);
});
test('server loops retain manual checks and use candle-aware due gating',()=>{
 const source=readFileSync(new URL('../server/surveillanceService.ts',import.meta.url),'utf8');
 assert.match(source,/candleCloseCheckPlanner\.due\(key, coin\.config, Date\.now\(\)\)/);
 assert.match(source,/candleCloseCheckPlanner\.failed\(/);
 assert.match(source,/candleCloseCheckPlanner\.succeeded\(/);
 assert.match(source,/checkAllUserCoins\(userId: string\)/);
 assert.match(source,/forceCheck: true, forceNotify: false/);
});

test('late exchange candles trigger retry rather than skipping the next 4h signal',()=>{
 const planner=new CandleCloseCheckPlanner();
 const modes=config(['bar_close']);
 const now=28_805_000;
 assert.equal(planner.hasLatestClosedBars(modes,{'4h':0},now),false);
 assert.equal(planner.hasLatestClosedBars(modes,{'4h':14_400_000},now),true);
 planner.failed('btc',modes,now);
 assert.equal(planner.due('btc',modes,now+4_999),false);
 assert.equal(planner.due('btc',modes,now+5_000),true);
});
test('all requested bar-close intervals must be up to date',()=>{
 const planner=new CandleCloseCheckPlanner();
 const modes=config(['bar_close','bar_close_1h','bar_close_15m','realtime']);
 const now=15_000_000;
 // At this timestamp the last CLOSED 15m candle started at 13.5m,
 // not 14.4m (the latter is still the open candle).
 assert.equal(planner.hasLatestClosedBars(modes,{
  '4h':0,'1h':10_800_000,'15m':12_600_000},now),false);
 const processed={
  '4h':0,'1h':10_800_000,'15m':13_500_000};
 assert.equal(planner.hasLatestClosedBars(modes,processed,now),true);
 assert.equal(planner.hasLatestClosedBars(config(['realtime']),undefined,now),true);
});

test('production CRON respects candle-close scheduling and persists routine checks in batches', () => {
 const cron=readFileSync(new URL('../server/cronService.ts',import.meta.url),'utf8');
 assert.match(cron,/candleCloseCheckPlanner\.due\(key, coin\.config, now\)/);
 assert.match(cron,/candleCloseCheckPlanner\.hasLatestClosedBars\(/);
 assert.match(cron,/candleCloseCheckPlanner\.failed\(/);
 assert.match(cron,/candleCloseCheckPlanner\.succeeded\(/);
 assert.match(cron,/commitSurveillanceCheck\(checked, \{ deferPersist: true \}\)/);
 assert.match(cron,/flushDeferredSurveillanceChecks\(\)/);
 assert.match(cron,/surveillanceCursor/);
});

test('open price alert pages poll without submitting redundant alert snapshots', () => {
 const client=readFileSync(new URL('../src/context/AlertsContext.tsx',import.meta.url),'utf8');
 const fromPoll=client.slice(client.indexOf('const pollSync = async (force = false) =>'));
 assert.match(fromPoll,/apiFetch\('\/api\/alerts\?userId='/);
 assert.doesNotMatch(fromPoll.slice(0,fromPoll.indexOf('const interval = setInterval')),/apiFetch\('\/api\/alerts\/sync'/);
});
