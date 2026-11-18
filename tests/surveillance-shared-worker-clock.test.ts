import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedWorkerAnalysisClock } from '../server/surveillance/sharedWorkerAnalysisClock';
import { readFileSync } from 'node:fs';

test('one 6s timer for many users and markets; last subscriber releases it', () => {
 const clock = new SharedWorkerAnalysisClock(6000);
 let a=0,b=0,c=0;
 const stopA=clock.subscribe('binance:futures:BTCUSDT',()=>a++);
 const stopB=clock.subscribe('binance:futures:BTCUSDT',()=>b++);
 const stopC=clock.subscribe('bybit:spot:BTCUSDT',()=>c++);
 assert.deepEqual([clock.stats().timers,clock.stats().subscribers,clock.stats().instruments],[1,3,2]);
 clock.runTick();
 assert.deepEqual([a,b,c],[1,1,1]);
 stopA();stopA();clock.runTick();
 assert.deepEqual([a,b,c],[1,2,2]);
 stopB();stopC();
 assert.deepEqual([clock.stats().timers,clock.stats().subscribers,clock.stats().instruments],[0,0,0]);
});
test('a failed analysis callback cannot stop other watchers', () => {
 const clock=new SharedWorkerAnalysisClock();
 let good=0;
 const stop1=clock.subscribe('same',()=>{throw new Error('failure');});
 const stop2=clock.subscribe('same',()=>good++);
 clock.runTick();
 assert.equal(good,1);
 assert.equal(clock.stats().callbackFailures,1);
 stop1();stop2();
});
test('CoinWorker still runs personal deep analysis but not a separate interval', () => {
 const source=readFileSync(new URL('../server/surveillance/coinWorker.ts',import.meta.url),'utf8');
 assert.match(source,/sharedWorkerAnalysisClock.subscribe\(/);
 assert.match(source,/this.releaseAnalysisClock\?\.\(\)/);
 assert.doesNotMatch(source,/slowAnalysisInterval = setInterval/);
 assert.match(source,/sharedMarketAnalysis.get\(/);
});
