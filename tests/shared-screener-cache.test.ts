import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SharedScanJobs, SharedScanBusyError } from '../server/sharedScanJobs';

test('identical simultaneous screener scans share one computation and result',async()=>{
  const queue=new SharedScanJobs<string[]>(2,2);
  let runs=0;
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const fn=async()=>{runs++;await gate;return ['BTCUSDT'];};
  const first=queue.run('binance:futures:5m',fn);
  const same=queue.run('binance:futures:5m',fn);
  assert.equal(first,same);
  assert.equal(queue.stats().active,1);
  release();
  assert.deepEqual(await first,['BTCUSDT']);
  assert.equal(runs,1);
  assert.equal(queue.stats().uniqueJobs,0);
});

test('distinct expensive scans obey active and queued limits and cannot starve forever',async()=>{
  const queue=new SharedScanJobs<number>(1,1);
  let release!:()=>void;
  const slow=new Promise<void>(resolve=>{release=resolve;});
  const first=queue.run('a',async()=>{await slow;return 1;});
  const next=queue.run('b',async()=>2);
  await assert.rejects(queue.run('c',async()=>3),SharedScanBusyError);
  assert.deepEqual(queue.stats(),{active:1,uniqueJobs:2,waiting:1});
  release();
  assert.equal(await first,1);
  assert.equal(await next,2);
  assert.deepEqual(queue.stats(),{active:0,uniqueJobs:0,waiting:0});
});

test('failed scan releases concurrency slot and identical keys can retry',async()=>{
  const queue=new SharedScanJobs<number>(1,1);
  await assert.rejects(queue.run('a',async()=>{throw Error('exchange offline');}));
  assert.equal(await queue.run('a',async()=>42),42);
});

test('public screener cache is shared, bounded and never duplicates in-flight work',()=>{
  const market=readFileSync(new URL('../server/marketService.ts',import.meta.url),'utf8');
  const server=readFileSync(new URL('../server.ts',import.meta.url),'utf8');
  assert.match(market,/scanJobs\.run\(key,\(\)=>computeScreenerScan\(params,context\)\)/);
  assert.match(market,/context \? 'background' : 'foreground'/);
  assert.match(market,/while \(scanCache\.size > 48\)/);
  assert.match(server,/err instanceof SharedScanBusyError/);
  assert.match(server,/Retry-After', '10'/);
});
