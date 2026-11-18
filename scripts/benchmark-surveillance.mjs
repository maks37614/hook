#!/usr/bin/env node
/** CPU/memory-only synthetic 24/7 watcher workload. NO exchange/API traffic.
 * A smoke model for shared scheduler efficiency, not a real capacity guarantee.
 * Usage: node --import tsx scripts/benchmark-surveillance.mjs
 *        node --import tsx scripts/benchmark-surveillance.mjs --watchers 1000 --markets 50 --ticks 30
 */
import { performance } from 'node:perf_hooks';
import { SharedWorkerAnalysisClock } from '../server/surveillance/sharedWorkerAnalysisClock.ts';
import { CandleCloseCheckPlanner } from '../server/surveillance/candleCloseCheckPlanner.ts';

const option=(flag,fallback)=>{
 const i=process.argv.indexOf(flag);
 return i===-1?fallback:Number(process.argv[i+1]);
};
const watchers=option('--watchers',100);
const markets=option('--markets',10);
const ticks=option('--ticks',30);
const barClosePct=option('--bar-close-pct',80);
if(![watchers,markets,ticks,barClosePct].every(Number.isSafeInteger)||
 watchers<1||watchers>10_000||markets<1||markets>watchers||
 ticks<1||ticks>500||barClosePct<0||barClosePct>100)
 throw new Error('Limits: watchers 1..10000, markets 1..watchers, ticks 1..500, bar-close-pct 0..100');

const clock=new SharedWorkerAnalysisClock();
const planner=new CandleCloseCheckPlanner();
const stop=[];
let work=0; // A deterministic synthetic fingerprint, not market evaluation.
for (let i=0;i<watchers;i++) {
 const market='binance:futures:SYMBOL'+i%markets;
 const owner='u'+i;
 stop.push(clock.subscribe(market,()=>{
   const cfg=i%100<barClosePct?{triggerModes:['bar_close_15m']}:{triggerModes:['realtime']};
   if (planner.due(owner,cfg,1_000_000+work*10)) {
     planner.succeeded(owner,cfg,1_000_000+work*10);
   }
   work++;
 }));
}
const durations=[];
for (let i=0;i<ticks;i++) {
 const start=performance.now();
 clock.runTick();
 durations.push(performance.now()-start);
}
for(const release of stop)release();
const sorted=durations.slice().sort((a,b)=>a-b);
const p=n=>sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*n)-1)];
console.log(JSON.stringify({
 type:'synthetic-in-process', realVpsCapacityVerified:false,
 hasExternalRequests:false,watchers,markets,ticks,barClosePct,
 estimatedPerUserTimersWithoutSharing:watchers,
 timersWithSharingBeforeRelease:watchers?1:0,
 processing:{meanMs:Number((durations.reduce((x,y)=>x+y,0)/ticks).toFixed(3)),
  p50Ms:Number(p(.5).toFixed(3)),p95Ms:Number(p(.95).toFixed(3)),
  p99Ms:Number(p(.99).toFixed(3))},
 schedule:planner.stats(),
 memory:{rssMb:Number((process.memoryUsage().rss/1048576).toFixed(1)),
  heapMb:Number((process.memoryUsage().heapUsed/1048576).toFixed(1))}
},null,2));
