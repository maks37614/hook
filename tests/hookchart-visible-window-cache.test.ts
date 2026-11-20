import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChartVisibleWindowCache } from '../src/components/hookchart/visibleWindowCache';

const engine=readFileSync(new URL('../src/components/hookchart/engine.tsx',import.meta.url),'utf8');

test('a sub-candle pan reuses both data rows and candle extrema without modifying source',()=>{
  const candles=Array.from({length:1000},(_,i)=>({t:i,l:i-3,h:i+7,c:i}));
  const cache=createChartVisibleWindowCache<(typeof candles)[number]>();
  const first=cache.get(candles,200,310);
  const same=cache.get(candles,200,310);
  assert.strictEqual(same,first);
  assert.strictEqual(same.rows,first.rows);
  assert.equal(first.low,197);
  assert.equal(first.high,316);
  assert.deepEqual(first.rows,candles.slice(200,310));
  assert.equal(candles.length,1000);
});

test('actual bar-range change invalidates visible rows and exactly matches the original extrema scan',()=>{
  const candles=Array.from({length:400},(_,i)=>({l:Math.sin(i/8)*100,h:Math.sin(i/8)*100+5}));
  const cache=createChartVisibleWindowCache<(typeof candles)[number]>();
  for(const [from,to] of [[0,40],[1,41],[50,150],[90,90],[300,400],[399,400],[0,40]]){
    const result=cache.get(candles,from,to);
    const original=to>from?candles.slice(from,to):[];
    let low=Infinity,high=-Infinity;
    for(const bar of original){if(bar.l<low)low=bar.l;if(bar.h>high)high=bar.h}
    assert.deepEqual(result.rows,original);
    assert.equal(result.low,low);
    assert.equal(result.high,high);
  }
});

test('visible and fallback windows coexist while panning into the future',()=>{
  const candles=Array.from({length:300},(_,i)=>({l:i,h:i+1}));
  const cache=createChartVisibleWindowCache<(typeof candles)[number]>();
  const empty=cache.get(candles,300,300);
  const fallback=cache.get(candles,220,300);
  assert.equal(empty.rows.length,0);
  assert.equal(fallback.low,220);
  assert.equal(fallback.high,300);
  assert.strictEqual(cache.get(candles,300,300),empty);
  assert.strictEqual(cache.get(candles,220,300),fallback);
});

test('immutable exchange candle replacement immediately invalidates the viewport cache',()=>{
  const input=[{l:98,h:102},{l:99,h:103}];
  const cache=createChartVisibleWindowCache<(typeof input)[number]>();
  const old=cache.get(input,0,2);
  const next=[input[0],{l:50,h:104}];
  const updated=cache.get(next,0,2);
  assert.notStrictEqual(updated.rows,old.rows);
  assert.equal(updated.low,50);
  assert.equal(updated.high,104);
  assert.strictEqual(cache.get(next,0,2),updated);
});

test('HookChart reuses cached windows but retains original terminal candle-fit and drawing math',()=>{
  assert.match(engine,/const visibleWindowCache = useMemo\(\(\)=>createChartVisibleWindowCache<Candle>\(\), \[\]\)/);
  assert.match(engine,/const visibleWindow=visibleWindowCache\.get\(candles,dataStart,dataEnd\)/);
  assert.match(engine,/const data=visibleWindow\.rows/);
  assert.match(engine,/const scaleWindow=data\.length\?visibleWindow:visibleWindowCache\.get\(candles,Math\.max\(0,candles\.length-80\),candles\.length\)/);
  assert.match(engine,/const readableExtrema=terminalMode&&candleAutoScale\?terminalReadableCandleExtrema\(scaleData\):null/);
  assert.match(engine,/const y=\(p:number\)=>plotH-\(p-lo\)\/\(hi-lo\)\*plotH/);
  assert.match(engine,/const x=\(t:number\)=>\(indexAtTime\(t\)-virtualStart\+\.5\)\*step/);
});
