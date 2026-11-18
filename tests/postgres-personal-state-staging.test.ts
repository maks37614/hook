import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preparePersonalStateRows, STATE_MIGRATION_CHUNK,
 personalStateSnapshotDigest, DEFAULT_PERSONAL_STATE_STAGE_KEY,
 stagePersonalStateToPostgres } from '../server/pgPersonalState';

test('staging skips guest, former-user, malformed state, and preserves valid per-user rows',()=>{
 const snap={
 surveillance:{
  alice:[{id:'a1',userId:'alice',exchange:'binance',marketType:'futures',symbol:'BTCUSDT',isActive:true}],
  former:[{id:'x',userId:'former',exchange:'bybit',marketType:'spot',symbol:'BTCUSDT',isActive:true}],
  guest:[{id:'y',userId:'guest',exchange:'binance',marketType:'futures',symbol:'BTCUSDT',isActive:true}]
 },
 alerts:[{id:'id',userId:'alice',symbol:'ETHUSDT',exchange:'bybit',marketType:'spot',isActive:true},
  {id:'old',userId:'former',symbol:'ETHUSDT',exchange:'bybit',marketType:'spot',isActive:true}],
 history:[{id:'h',userId:'alice',triggeredAt:1},{id:'other',userId:'guest',triggeredAt:1}]
 };
 const rows=preparePersonalStateRows(snap as any,new Set(['alice']));
 assert.deepEqual(rows.surveillance.map(x=>x.id),['a1']);
 assert.deepEqual(rows.alerts.map(x=>x.id),['id']);
 assert.deepEqual(rows.history.map(x=>x.id),['h']);
 assert.equal(rows.skipped.orphaned,4);
 assert.equal(STATE_MIGRATION_CHUNK,100);
});
test('staging is idempotent, atomic and does not replace JSON canonical state',()=>{
 const code=readFileSync(new URL('../server/pgPersonalState.ts',import.meta.url),'utf8');
 const sql=readFileSync(new URL('../server/migrations/002_personal_state.sql',import.meta.url),'utf8');
 const cli=readFileSync(new URL('../server/pgStateMigrator.ts',import.meta.url),'utf8');
 assert.match(code,/ON CONFLICT \(user_id,/);
 assert.match(code,/await client.query\('BEGIN'\)/);
 assert.match(code,/await client.query\('ROLLBACK'\)/);
 assert.match(code,/pg_advisory_xact_lock/);
 assert.match(code,/IS NOT DISTINCT FROM EXCLUDED/);
 assert.match(code,/PostgreSQL staging conflict/);
 assert.match(code,/snapshot_sha256 FROM h00k_personal_state_staging_runs/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS h00k_personal_state_staging_runs/);
 assert.match(cli,/stagedSnapshotMatches/);
 for(const name of ['h00k_surveillance_state','h00k_price_alert_state','h00k_alert_history_state']) {
  assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+name));
 }
 assert.match(cli,/liveCutover:false/);
 assert.match(cli,/Specify --dry-run, --backup, --apply, --verify or --ready/);
 assert.match(cli,/createPersonalStateBackup\(snapshot\)/);
});

test('snapshot fingerprint is stable for exact replays and changes for altered inputs',()=>{
 const original={surveillance:{a:[]},alerts:[{id:'alert'}],history:[]} as any;
 const digest=personalStateSnapshotDigest(original);
 assert.match(digest,/^[0-9a-f]{64}$/);
 assert.equal(personalStateSnapshotDigest(structuredClone(original)),digest);
 original.alerts[0].id='changed-alert';
 assert.notEqual(personalStateSnapshotDigest(original),digest);
 assert.equal(DEFAULT_PERSONAL_STATE_STAGE_KEY,'legacy-json');
});

test('matching committed staging marker short-circuits before all personal INSERTs',async()=>{
 const snapshot={ surveillance:{},alerts:[],history:[] } as any;
 const digest=personalStateSnapshotDigest(snapshot);
 const calls:string[]=[];
 const client={query:async (sql:string,values?:unknown[])=>{
  calls.push(sql);
  if (sql.includes('SELECT snapshot_sha256 FROM h00k_personal_state_staging_runs'))
   return {rows:[{snapshot_sha256:digest}]};
  if (sql.includes('SELECT id FROM auth_users')) return {rows:[]};
  return {rows:[],rowCount:0};
 }} as any;
 const result=await stagePersonalStateToPostgres(client,snapshot,'-- schema already installed');
 assert.equal(result.alreadyStaged,true);
 assert.equal(result.verificationRequired,true);
 assert.deepEqual([result.surveillance,result.alerts,result.history],[0,0,0]);
 assert.equal(calls.includes('COMMIT'),true);
 assert.equal(calls.some(sql=>/INSERT INTO h00k_(?:surveillance_state|price_alert_state|alert_history_state|personal_state_staging_runs)/.test(sql)),false,
  'repeat of an already committed snapshot can never recreate deleted rows');
});
