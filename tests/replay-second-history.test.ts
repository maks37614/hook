import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Kline } from '../src/types';
import {
  supportsReplaySeconds, buildReplaySecondHistory, replaySecondPreview,
  firstReplaySecondEvent, fetchReplaySecondBatch, replaySecondObservedTime,
} from '../src/utils/replaySecondHistory';

const bar = (time:number,open:number,high:number,low:number,close:number,volume:number):Kline =>
  ({time,open,high,low,close,volume});

test('one-second accuracy is advertised only on supported markets and timeframes',()=>{
  for(const tf of ['1m','5m','15m'] as const)
    assert.equal(supportsReplaySeconds('binance','spot',tf),true);
  assert.equal(supportsReplaySeconds('binance','spot','1h'),false);
  assert.equal(supportsReplaySeconds('binance','futures','1m'),false);
  assert.equal(supportsReplaySeconds('bybit','spot','1m'),false);
  assert.equal(supportsReplaySeconds('bybit','futures','5m'),false);
});

test('historical seconds never reveal future highs/lows or cumulative volume',()=>{
  const parent=bar(1740000000,100,115,95,105,9);
  const seconds=[
    bar(parent.time,100,101,100,101,2),
    bar(parent.time+1,101,110,95,98,3),
    bar(parent.time+4,98,115,97,105,4),
  ];
  const h=buildReplaySecondHistory(parent,seconds,60)!;
  assert.ok(h);
  assert.equal(h.cumulative.length,60);
  assert.equal(replaySecondPreview(parent,h,0).close,100);
  assert.equal(replaySecondPreview(parent,h,1/60).close,101);
  assert.equal(replaySecondPreview(parent,h,2/60).low,95);
  assert.equal(replaySecondObservedTime(h,0),parent.time);
  assert.equal(replaySecondObservedTime(h,2/60),parent.time+1);
  assert.equal(replaySecondObservedTime(h,2.9/60),parent.time+1,
    'the entry timestamp must not round into an unseen future second');
  assert.equal(replaySecondObservedTime(h,1),parent.time+59);
  assert.equal(replaySecondPreview(parent,h,3/60).high,110);
  assert.equal(replaySecondPreview(parent,h,5/60).high,115);
  assert.equal(replaySecondPreview(parent,h,5/60).volume,9);
  assert.equal(replaySecondPreview(parent,h,1),parent);
  assert.equal(firstReplaySecondEvent(h,parent.time+2,row=>row.high>=112?'tp':null)?.time,parent.time+4);
  assert.equal(firstReplaySecondEvent(h,parent.time+5,row=>row.high>=112?'tp':null),null);
  assert.equal(buildReplaySecondHistory(parent,seconds.slice(0,2),60),null);
  assert.equal(buildReplaySecondHistory(parent,[...seconds,seconds[2]],60),null);
  assert.equal(buildReplaySecondHistory(parent,[...seconds].reverse(),60),null);
  assert.equal(parent.high,115);
});

test('a single browser-direct request covers up to 15 minutes without VPS processing',async()=>{
  const now=Math.floor(Date.now()/1000)-7200;
  const start=Math.floor(now/60)*60;
  const parents=Array.from({length:15},(_,i)=>bar(start+i*60,100,101,99,100,2));
  let calls=0;
  const mock=async(input:RequestInfo|URL):Promise<Response>=>{
    calls++;
    const url=new URL(String(input));
    assert.equal(url.hostname,'data-api.binance.vision');
    assert.equal(url.searchParams.get('interval'),'1s');
    assert.equal(url.searchParams.get('limit'),'900');
    return {ok:true,json:async()=>parents.flatMap(parent=>[
      [parent.time*1000,'100','101','100','101','1',0,'0',0,'0','0'],
      [(parent.time+59)*1000,'101','101','99','100','1',0,'0',0,'0','0'],
    ])} as Response;
  };
  const result=await fetchReplaySecondBatch('BTCUSDT','1m',parents,undefined,mock as typeof fetch);
  assert.equal(calls,1);
  assert.equal(result.size,15);
  assert.equal(result.get(parents[0].time)?.rows.length,2);
  assert.equal(result.get(parents[14].time)?.cumulative.length,60);
  assert.equal((await fetchReplaySecondBatch('BAD SYMBOL','1m',parents,undefined,mock as typeof fetch)).size,0);
  assert.equal(calls,1);
});

test('the Replay page gates animation on loading, checks 1s fills, and labels fallback honestly',()=>{
  const page=readFileSync('src/components/ReplayPage.tsx','utf8');
  const chart=readFileSync('src/components/replay/ReplayChart.tsx','utf8');
  const locales=readFileSync('src/locales/replayStatic20261115.ts','utf8');
  assert.match(page,/fetchReplaySecondBatch\(/);
  assert.match(page,/firstReplaySecondEvent\(/);
  assert.match(page,/replaySecondPreview\(/);
  assert.match(page,/entryTime: replayActionTime/);
  assert.match(page,/createdAtTime: replayActionTime/);
  assert.match(page,/exitTime: replayActionTime/);
  assert.match(page,/replaySecondObservedTime\(secondsForNext, playbackPhase \/ REPLAY_INTRABAR_PHASES\)/);
  const secondSource=readFileSync('src/utils/replaySecondHistory.ts','utf8');
  assert.match(secondSource,/AbortSignal\.any\(\[signal,timeout\]\)/);
  assert.match(secondSource,/AbortSignal\.timeout\(4500\)/);
  assert.match(page,/supportsReplaySeconds\(/);
  assert.match(page,/if \(secondIsLoading\)/);
  assert.match(page,/replayIntrabarCandle\(/);
  assert.match(page,/secondParent,secondsForNext,playbackPhase/);
  assert.doesNotMatch(page,/\/api\/replay\/seconds/);
  assert.match(chart,/intrabarSource/);
  for(const s of ['Історія 1с · реальна','Historical 1s · real','История 1с · реальная','Historia 1 s · rzeczywista'])
    assert.ok(locales.includes(s),s);
});
