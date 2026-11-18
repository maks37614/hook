import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publishSurveillance, publishSurveillanceAlert, subscribeSurveillance, surveillanceStreamStats } from '../server/surveillanceEvents';

test('SSE invalidations are isolated per user and 15-second coalesced', () => {
  const a:number[] = [], b:number[] = [];
  const clearA = subscribeSurveillance('user-a', version=>a.push(version));
  const clearB = subscribeSurveillance('user-b', version=>b.push(version));
  assert.ok(clearA && clearB);
  publishSurveillance('user-a', false, 100_000);
  publishSurveillance('user-a', false, 100_010);
  publishSurveillance('user-b', false, 100_010);
  assert.deepEqual(a,[1]);
  assert.deepEqual(b,[1]);
  publishSurveillance('user-a', false, 115_100);
  assert.deepEqual(a,[1,2]);
  clearA?.();clearB?.();
  assert.equal(surveillanceStreamStats().clients,0);
});

test('SSE enforces per-user connection limits and cleans up listeners',()=>{
  const handles = Array.from({length:3},()=>subscribeSurveillance('test-user',()=>{}));
  assert.ok(handles.every(Boolean));
  assert.equal(subscribeSurveillance('test-user',()=>{}),null);
  handles.forEach(fn=>fn?.());
  assert.equal(surveillanceStreamStats().clients,0);
});

test('server route authenticates via bearer token, sends only invalidations and bounds backpressure',()=>{
  const server=readFileSync(new URL('../server.ts',import.meta.url),'utf8');
  const client=readFileSync(new URL('../src/context/SurveillanceContext.tsx',import.meta.url),'utf8');
  const worker=readFileSync(new URL('../server/surveillance/coinWorker.ts',import.meta.url),'utf8');
  assert.match(server,/app\.use\(\['\/api\/alerts',[^\n]*'\/api\/surveillance'/);
  assert.match(server,/app\.get\('\/api\/surveillance\/stream'/);
  assert.match(server,/res\.locals\.userId/);
  assert.match(server,/X-Accel-Buffering/);
  assert.match(server,/!res\.write/);
  assert.doesNotMatch(server,/\?token=|req\.query\.token/);
  const shared=readFileSync(new URL('../src/utils/userSignalStream.ts',import.meta.url),'utf8');
  assert.match(client,/subscribeUserSignalStream\(user\.uid/);
  assert.match(shared,/apiFetch\('\/api\/surveillance\/stream'/);
  assert.match(shared,/60_000/);
  assert.match(shared,/state\.controller\?\.abort\(\)/);
  assert.match(shared,/connections\.delete\(userId\)/);
  assert.match(worker,/publishSurveillance\(this\.coin\.userId\)/);
});

test('a real new alert bypasses 15s routine throttle, with one trailing update per burst', async () => {
  const eventsA:Array<{version:number;urgent:boolean}> = [];
  const eventsB:Array<{version:number;urgent:boolean}> = [];
  const clearA=subscribeSurveillance('urgent-a',(version,urgent)=>
    eventsA.push({version,urgent:urgent===true}));
  const clearB=subscribeSurveillance('urgent-b',(version,urgent)=>
    eventsB.push({version,urgent:urgent===true}));
  assert.ok(clearA && clearB);
  try {
    publishSurveillance('urgent-a');
    assert.equal(eventsA.length,1);
    publishSurveillanceAlert('urgent-a');
    assert.deepEqual(eventsA.map(x=>x.urgent),[false,true],
      'new signals must bypass 15-second state invalidation throttle');
    assert.deepEqual(eventsB,[],'another user receives no private invalidations');
    // Bursts of 100 new signals must not cause 100 expensive browser GETs.
    for(let i=0;i<100;i++) publishSurveillanceAlert('urgent-a');
    assert.equal(eventsA.length,2);
    assert.equal(surveillanceStreamStats().pendingUrgent,1);
    await new Promise(resolve=>setTimeout(resolve,850));
    assert.deepEqual(eventsA.map(x=>x.urgent),[false,true,true]);
    assert.equal(surveillanceStreamStats().pendingUrgent,0);
  } finally {clearA?.();clearB?.();}
  assert.equal(surveillanceStreamStats().clients,0);
});

test('urgent invalidation timer is cancelled when the last browser disconnects', async () => {
  const versions:number[]=[];
  const clear=subscribeSurveillance('urgent-cleanup',(version)=>versions.push(version));
  assert.ok(clear);
  publishSurveillanceAlert('urgent-cleanup');
  publishSurveillanceAlert('urgent-cleanup');
  assert.equal(versions.length,1);
  assert.equal(surveillanceStreamStats().pendingUrgent,1);
  clear?.();
  assert.equal(surveillanceStreamStats().pendingUrgent,0);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.deepEqual(versions,[1]);
});

test('urgent SSE invalidations refresh client immediately without exposing private events', () => {
  const server=readFileSync(new URL('../server.ts',import.meta.url),'utf8');
  const client=readFileSync(new URL('../src/context/SurveillanceContext.tsx',import.meta.url),'utf8');
  const worker=readFileSync(new URL('../server/surveillance/coinWorker.ts',import.meta.url),'utf8');
  assert.match(server,/const event = urgent \? 'alert' : 'changed'/);
  assert.match(server,/event: \$\{event\}/);
  const shared=readFileSync(new URL('../src/utils/userSignalStream.ts',import.meta.url),'utf8');
  assert.match(shared,/frame\.startsWith\('event: alert\\n'\)/);
  assert.match(client,/event === 'alert'/);
  assert.match(client,/now - lastUrgentFetch >= 500/);
  assert.match(client,/now - lastFetch >= 12000|Date\.now\(\) - lastFetch >= 12000/,
    'routine site refresh remains throttled to protect the VPS');
  assert.match(worker,/publishSurveillanceAlert\(this\.coin\.userId\)/);
});
