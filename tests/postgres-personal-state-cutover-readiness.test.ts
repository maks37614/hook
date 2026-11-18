import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preparePersonalStateRows } from '../server/pgPersonalState';

test('duplicate IDs belonging to one account cannot silently disappear during staging', () => {
  const coin=(symbol:string)=>({id:'same-id',userId:'owner',exchange:'binance',
    marketType:'futures',symbol,isActive:true,config:{}});
  const alert=(targetPrice:number)=>({id:'alert-id',userId:'owner',exchange:'bybit',
    marketType:'futures',symbol:'ETHUSDT',isActive:true,targetPrice});
  const history=(triggeredAt:number)=>({id:'history-id',userId:'owner',triggeredAt});
  const snapshot={surveillance:{owner:[coin('BTCUSDT'),coin('ETHUSDT')]},
    alerts:[alert(10),alert(20)],history:[history(10),history(20)]} as any;
  const prepared=preparePersonalStateRows(snapshot,new Set(['owner']));
  assert.equal(prepared.surveillance.length,1);
  assert.equal(prepared.alerts.length,1);
  assert.equal(prepared.history.length,1);
  assert.equal(prepared.skipped.invalid,3,
    'all three discarded duplicate IDs must block a lossless cutover');
  assert.equal(prepared.surveillance[0].symbol,'BTCUSDT',
    'the first valid record is retained rather than silently overwritten');
});

test('operator readiness requires a verified backup, stopped writers and consistent live snapshot',()=>{
  const cli=readFileSync(new URL('../server/pgStateMigrator.ts',import.meta.url),'utf8');
  assert.match(cli,/--ready <backup-file>/);
  assert.match(cli,/H00K_PERSONAL_STATE_WRITERS_STOPPED/);
  assert.match(cli,/verifyPersonalStateBackup\(args\[1\]\)/);
  assert.match(cli,/result\.skipped\.invalid===0/);
  assert.match(cli,/result\.skipped\.orphaned===0/);
  assert.match(cli,/snapshotUnchanged/);
  assert.match(cli,/if \(!verify && !ready\) await initializeIdentity\(\)/,
    'readiness mode must never initialize or modify schema');
  assert.match(cli,/verifyPersonalStateStaging\(connection,snapshot\)/);
  assert.match(cli,/verifiedAfterCommit:true/);
  assert.match(cli,/jsonStillAuthoritative:true,liveCutover:false/,
    'a readiness check is never an implicit production cutover');
  assert.match(cli,/process\.exitCode=2/);
});
