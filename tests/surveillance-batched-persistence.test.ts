import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { SurveillanceCoin } from '../src/types';

const cwd = process.cwd();
const fixture=fs.mkdtempSync(path.join(cwd,'.surveillance-batch-test-'));
process.chdir(fixture);
const service=await import('../server/surveillanceService');
process.chdir(cwd);
test.after(()=>fs.rmSync(fixture,{recursive:true,force:true}));
const file=path.join(fixture,'server','data','surveillance.json');

function coin(userId:string,id:string):SurveillanceCoin {
  return {
    id,userId,symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT',
    exchange:'binance',marketType:'futures',isActive:false,
    createdAt:'',updatedAt:'',config:service.getDefaultSurveillanceConfig(),
  };
}
test('routine 24/7 snapshots share one disk write without delaying in-memory updates',()=>{
  const a=coin('alice','c1'),b=coin('bob','c2');
  service.saveSurveillanceList('alice',[a]);
  service.saveSurveillanceList('bob',[b]);
  const before=fs.readFileSync(file,'utf8');
  const changedA=service.commitSurveillanceCheck({...a,lastCheckedAt:'2026-11-13T20:00:00.000Z'},
    {deferPersist:true});
  const changedB=service.commitSurveillanceCheck({...b,lastCheckedAt:'2026-11-13T20:00:01.000Z'},
    {deferPersist:true});
  assert.equal(changedA?.lastCheckedAt,'2026-11-13T20:00:00.000Z');
  assert.equal(changedB?.lastCheckedAt,'2026-11-13T20:00:01.000Z');
  assert.equal(fs.readFileSync(file,'utf8'),before,'no full-file write per coin');
  assert.equal(service.loadSurveillanceList('alice')[0].lastCheckedAt,changedA?.lastCheckedAt);
  assert.equal(service.flushDeferredSurveillanceChecks(),true);
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(saved.alice[0].lastCheckedAt,changedA?.lastCheckedAt);
  assert.equal(saved.bob[0].lastCheckedAt,changedB?.lastCheckedAt);
  assert.equal(service.flushDeferredSurveillanceChecks(),true);
});

test('new notification timestamps are persisted immediately even in batch mode',()=>{
  const a=coin('secure','important'),ts='2026-11-13T20:03:00.000Z';
  service.saveSurveillanceList('secure',[a]);
  service.commitSurveillanceCheck({...a,lastNotifiedAt:ts},{deferPersist:true});
  const persisted=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(persisted.secure[0].lastNotifiedAt,ts);
});

test('a deleted or paused coin cannot be resurrected by a deferred stale check',()=>{
  const a=coin('safeguard','deleted');
  service.saveSurveillanceList('safeguard',[a]);
  const queued=service.commitSurveillanceCheck({...a,lastCheckedAt:'2026-11-13T20:06:00.000Z'},
    {deferPersist:true});
  assert.ok(queued);
  service.saveSurveillanceList('safeguard',[]);
  assert.equal(service.commitSurveillanceCheck({...a,lastCheckedAt:'2026-11-13T20:07:00.000Z'},
    {deferPersist:true}),null);
  assert.equal(service.flushDeferredSurveillanceChecks(),true);
  const persisted=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(persisted.safeguard.length,0);
});

test('monitor flush is bounded and never overlaps its own 25-second pass',()=>{
  const source=fs.readFileSync(new URL('../server/surveillanceService.ts',import.meta.url),'utf8');
  assert.match(source,/commitSurveillanceCheck\(updated, \{ deferPersist: true \}\)/);
  assert.match(source,/Date\.now\(\) - lastPersistAt >= 5_000/);
  assert.match(source,/finally \{\s*if \(!flushDeferredSurveillanceChecks\(\)\)/);
  assert.match(source,/if \(monitorPassInFlight\) return;/);
});
