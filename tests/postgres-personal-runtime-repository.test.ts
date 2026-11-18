import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { PgPersonalStateRuntimeRepository, PersonalStateInactiveError,
  PersonalStateRevisionConflict } from '../server/pgPersonalStateRuntime';

const alert=(owner:string,id:string)=>({
  id,userId:owner,exchange:'binance' as const,marketType:'futures' as const,
  symbol:'BTCUSDT',targetPrice:100,condition:'gte',isActive:true,triggered:false,
  createdAt:1800000000000,
});
const coin=(owner:string,id:string)=>({
  id,userId:owner,exchange:'bybit' as const,marketType:'futures' as const,
  symbol:'ETHUSDT',isActive:true,config:{triggerModes:['bar_close']},
});
const event=(owner:string,id:string)=>({
  id,userId:owner,triggeredAt:1800000000000,symbol:'BTCUSDT',
  exchange:'binance' as const,marketType:'futures' as const,
  condition:'gte',targetPrice:100,triggeredPrice:102,telegramSent:false,
});

test('inactive owners cannot read or change staged PostgreSQL rows',async()=>{
  const queries:string[]=[];
  let releases=0;
  const client={query:async(sql:string)=>{
    queries.push(sql);
    return {rows:[],rowCount:0};
  },release:()=>{releases++;}};
  const repository=new PgPersonalStateRuntimeRepository({
    connect:async()=>client,
  } as any);
  await assert.rejects(()=>repository.readOwner('alice'),PersonalStateInactiveError);
  await assert.rejects(()=>repository.replace('alice',0,{alerts:[alert('alice','a')] as any}),
    PersonalStateInactiveError);
  assert.equal(queries.some(sql=>sql.startsWith('DELETE')),false);
  assert.equal(queries.filter(sql=>sql==='ROLLBACK').length,2);
  assert.equal(releases,2);
});

test('duplicate/cross-owner private records are rejected before opening a transaction',async()=>{
  let connected=0;
  const repository=new PgPersonalStateRuntimeRepository({
    connect:async()=>{connected++;throw Error('unexpected DB connection');},
  } as any);
  await assert.rejects(
    ()=>repository.replace('alice',0,{alerts:[alert('alice','id'),alert('alice','id')] as any}),
    /duplicated/);
  await assert.rejects(
    ()=>repository.replace('alice',0,{alerts:[alert('bob','id')] as any}),
    /cross-owner/);
  await assert.rejects(()=>repository.replace('alice',-1,{alerts:[]}),/Invalid/);
  await assert.rejects(()=>repository.replace('alice',0,{}),/Unknown or empty/);
  assert.equal(connected,0);
});

test('PostgreSQL transaction preserves owner isolation, revisions and independent datasets',async t=>{
  if(process.env.H00K_PG_INTEGRATION_TEST!=='1'){
    t.skip('Integration PostgreSQL is not configured');return;
  }
  const pool=new Pool({max:2,connectionTimeoutMillis:4000});
  const owner='runtime-'+randomUUID();
  const other='runtime-'+randomUUID();
  const client=await pool.connect();
  try {
    const identity=readFileSync(new URL('../server/migrations/001_identity.sql',import.meta.url),'utf8');
    const staging=readFileSync(new URL('../server/migrations/002_personal_state.sql',import.meta.url),'utf8');
    const runtime=readFileSync(new URL('../server/migrations/005_personal_state_runtime.sql',import.meta.url),'utf8');
    const ownerPrivacy=readFileSync(new URL('../server/migrations/006_personal_state_owner_fk.sql',import.meta.url),'utf8');
    await client.query(identity);
    await client.query(staging);
    await client.query(runtime);
    await client.query(ownerPrivacy);
    await client.query(ownerPrivacy); // Idempotent on a restarted migration runner.
    for(const id of [owner,other]){
      await client.query(
        'INSERT INTO auth_users (id,email,password_hash,display_name) VALUES ($1,$2,$3,$4)',
        [id,id+'@example.test','test-hash','Runtime test']);
    }
    const repo=new PgPersonalStateRuntimeRepository(pool);
    await assert.rejects(()=>repo.readOwner(owner),PersonalStateInactiveError,
      'staging rows must not become active just because schema exists');
    // Operator activation is explicitly out of scope. Fixtures insert markers
    // only after schema setup, simulating an already verified migration.
    for(const id of [owner,other]){
      await client.query(
        'INSERT INTO h00k_personal_state_runtime_owners '+
        '(user_id,revision,source_snapshot_sha256) VALUES ($1,0,$2)',
        [id,'a'.repeat(64)]);
    }
    const v1=await repo.replace(owner,0,{
      surveillance:[coin(owner,'coin1')] as any,
      alerts:[alert(owner,'alert1')] as any,
      history:[event(owner,'history1')] as any,
    });
    assert.equal(v1,1);
    const state=await repo.readOwner(owner);
    assert.equal(state.revision,1);
    assert.deepEqual(state.state.surveillance.map(x=>x.id),['coin1']);
    assert.deepEqual(state.state.alerts.map(x=>x.id),['alert1']);
    assert.deepEqual(state.state.history.map(x=>x.id),['history1']);
    await assert.rejects(
      ()=>repo.replace(owner,0,{alerts:[]}),PersonalStateRevisionConflict,
      'a stale session must never wipe newer personal alerts');
    const v2=await repo.replace(other,0,{
      surveillance:[coin(other,'coin2')] as any,
      alerts:[alert(other,'alert2')] as any,
      history:[event(other,'history2')] as any,
    });
    assert.equal(v2,1);
    const v3=await repo.replace(owner,1,{alerts:[]});
    assert.equal(v3,2);
    const after=await repo.readOwner(owner);
    assert.equal(after.state.alerts.length,0);
    assert.equal(after.state.history.length,1,
      'an alerts-only transaction must preserve the independent history');
    assert.deepEqual((await repo.readOwner(other)).state.alerts.map(x=>x.id),['alert2']);

    // Deleting a registered owner MUST remove sensitive market monitoring,
    // price alerts, alert history and runtime activation. Another user's
    // records remain untouched.
    await client.query('DELETE FROM auth_users WHERE id=$1',[other]);
    for (const table of ['h00k_surveillance_state','h00k_price_alert_state',
      'h00k_alert_history_state','h00k_personal_state_runtime_owners']) {
      const gone=await client.query('SELECT count(*)::int AS count FROM '+table+' WHERE user_id=$1',[other]);
      assert.equal(gone.rows[0].count,0,table+' retained personal data after account removal');
    }
    await assert.rejects(()=>repo.readOwner(other),PersonalStateInactiveError);
    assert.equal((await repo.readOwner(owner)).state.history.length,1,
      'cascade for a deleted owner must not touch another owner');
  } finally {
    for(const id of [owner,other]){
      for(const table of ['h00k_price_alert_state','h00k_alert_history_state',
        'h00k_surveillance_state','h00k_personal_state_runtime_owners']){
        await client.query('DELETE FROM '+table+' WHERE user_id=$1',[id]).catch(()=>{});
      }
      await client.query('DELETE FROM auth_users WHERE id=$1',[id]).catch(()=>{});
    }
    client.release();
    await pool.end();
  }
});
