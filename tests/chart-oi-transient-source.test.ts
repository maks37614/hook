import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcileChartOi, CHART_OI_MAX_STALE_MS } from '../src/utils/chartOiDisplay';
import { translatePhrase } from '../src/locales';

const now=1_800_000_000_000;
const sample={
  valueUsd:646_000_000,amountCoins:8_000_000,
  change5mPct:-0.18,lastUpdated:now-1_000,
};
test('a one-off Binance error preserves verified OI without fabricating a new timestamp',()=>{
 const previous=reconcileChartOi(null,sample,now);
 assert.equal(previous.stale,false);
 const missing=reconcileChartOi(previous.reading,null,now+10_000);
 assert.equal(missing.stale,true);
 assert.deepEqual(missing.reading,sample);
 assert.equal(missing.reading?.lastUpdated,sample.lastUpdated);
 const recovered=reconcileChartOi(missing.reading,{...sample,valueUsd:650_000_000,lastUpdated:now+12_000},now+12_000);
 assert.equal(recovered.stale,false);
 assert.equal(recovered.reading?.valueUsd,650_000_000);
});
test('older than 90s, future and malformed OI readings become unavailable',()=>{
 assert.deepEqual(reconcileChartOi(sample,null,now+CHART_OI_MAX_STALE_MS+1),{reading:null,stale:false});
 assert.deepEqual(reconcileChartOi(null,{...sample,lastUpdated:now+9_000},now),{reading:null,stale:false});
 assert.deepEqual(reconcileChartOi(null,{...sample,valueUsd:NaN},now),{reading:null,stale:false});
 assert.deepEqual(reconcileChartOi(null,{...sample,amountCoins:-1},now),{reading:null,stale:false});
 assert.deepEqual(reconcileChartOi(null,{...sample,change5mPct:Infinity},now),{reading:null,stale:false});
});
test('old server OI remains explicitly stale even when returned successfully',()=>{
 const old={...sample,lastUpdated:now-70_000};
 assert.deepEqual(reconcileChartOi(null,old,now),{reading:old,stale:true});
});
test('chart labels use stale styles for each exchange and all four translations',()=>{
 const source=readFileSync(new URL('../src/components/ChartTopAnalysisText.tsx',import.meta.url),'utf8');
 assert.match(source,/reconcileChartOi\(previousBinanceOI\.current, fetchedBinance, checkedAt\)/);
 assert.match(source,/reconcileChartOi\(previousBybitOI\.current, fetchedBybit, checkedAt\)/);
 assert.match(source,/binanceOiStale \? 'bg-slate-400'/);
 assert.match(source,/bybitOiStale \? 'bg-slate-400'/);
 const phrase='Попереднє підтверджене значення OI; очікується оновлення';
 for(const language of ['uk','en','ru','pl'] as const){
   const t=translatePhrase(language,phrase);
   assert.ok(t);
   if(language!=='uk')assert.notEqual(t,phrase);
 }
});
