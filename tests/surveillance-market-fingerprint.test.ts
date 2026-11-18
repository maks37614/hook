import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SharedMarketAnalysisCache } from '../server/surveillance/sharedMarketAnalysis';

const shared=readFileSync(new URL('../server/surveillance/sharedCandleFeed.ts',import.meta.url),'utf8');
const worker=readFileSync(new URL('../server/surveillance/coinWorker.ts',import.meta.url),'utf8');

test('market-only indicator key is an O(1) revision token, not repeated SHA over historical candles',()=>{
  assert.match(worker,/this\.candleFeed\.fingerprint\(\)/);
  assert.doesNotMatch(worker,/candleFingerprint\(\[/);
  assert.match(shared,/fingerprint\(\) \{ return `\$\{current\.generation\}:\$\{current\.revision\}`; \}/);
});

test('revision is updated after history hydration, buffered replay and live trades',()=>{
  assert.match(shared,/entry\.engine\.setCandles\([\s\S]{0,110}entry\.revision\+\+/);
  assert.match(shared,/if \(trade\.time >= lastSnapshotBucket\) \{[\s\S]{0,130}entry\.revision\+\+/);
  assert.match(shared,/if\(created\.initialized\) \{[\s\S]{0,125}created\.revision\+\+/);
  assert.match(shared,/generation:\+\+nextFeedGeneration,revision:0/);
});

test('market cache cannot reuse a previous subscription generation even if revisions align',()=>{
  const market=new SharedMarketAnalysisCache<{indicator:number}>(6000,2);
  let calculations=0;
  const calc=()=>({indicator:++calculations});
  const key='bybit:futures:BTCUSDT';
  const previous=market.get(key,'10:500',calc,1000);
  const same=market.get(key,'10:500',calc,1100);
  assert.equal(same.indicator,previous.indicator);
  const newGeneration=market.get(key,'11:500',calc,1200);
  assert.notEqual(newGeneration.indicator,same.indicator);
  const nextTrade=market.get(key,'11:501',calc,1300);
  assert.notEqual(nextTrade.indicator,newGeneration.indicator);
});
