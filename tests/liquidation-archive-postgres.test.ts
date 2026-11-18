import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {LiquidationArchive} from '../server/liquidationArchive';

/** Integration test runs only when the GitHub CI PostgreSQL service is present.
 * Never connects to a user's production database by default.
 */
test('PostgreSQL 16 Liq archive deduplicates reconnects and cumulative Binance fills', {
  skip: process.env.LIQ_TEST_PG !== '1',
}, async () => {
  const pool = new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    max: 1,
  });
  const archive = new LiquidationArchive(true,100,()=>pool);
  const id = 'test:' + randomUUID();
  const row = {
    exchange:'binance' as const,symbol:'BTCUSDT',
    id,t:Date.now(),side:'LONG' as const,p:67234.5,q:0.02,usd:1344.69,
  };
  try {
    archive.record(row);
    await archive.flush();
    archive.record(row);
    await archive.flush();
    archive.record({...row,q:0.05,usd:3361.725});
    await archive.flush();
    archive.record({...row,q:0.01,usd:672.345});
    await archive.flush();
    const records=await pool.query(
      'SELECT observed_notional, quantity, side FROM h00k_liquidation_events WHERE exchange=$1 AND symbol=$2 AND event_id=$3',
      ['binance','BTCUSDT',id],
    );
    assert.equal(records.rows.length,1);
    assert.equal(Number(records.rows[0].observed_notional),3361.725);
    assert.equal(Number(records.rows[0].quantity),0.05);
    const heatmap=await archive.heatmap('binance','BTCUSDT',24);
    assert.equal(heatmap?.source,'observed_liquidations');
    assert.ok(heatmap!.bins.some(bin=>bin.usd>=3361.725 && bin.side==='LONG'));
  } finally {
    await pool.query('DELETE FROM h00k_liquidation_events WHERE event_id=$1',[id]).catch(()=>{});
    await pool.end();
  }
});

test('PostgreSQL monthly purge deletes ONLY Liq events and keeps its reset marker across restart', {
  skip: process.env.LIQ_TEST_PG !== '1',
}, async () => {
  const pool=new Pool({
    host:process.env.PGHOST,user:process.env.PGUSER,password:process.env.PGPASSWORD,
    database:process.env.PGDATABASE,max:1,
  });
  let mockNow=Date.now();
  const currentMonth=new Date(mockNow).toISOString().slice(0,7);
  const archive=new LiquidationArchive(true,100,()=>pool,()=>mockNow);
  const id='monthly:'+randomUUID();
  const untouched='keep:'+randomUUID();
  try {
    // The real PostgreSQL schema also includes the maintenance marker.
    await archive.runMonthlyCleanup();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS h00k_liq_monthly_sentinel
        (id TEXT PRIMARY KEY)`);
    await pool.query('INSERT INTO h00k_liq_monthly_sentinel (id) VALUES ($1)',[untouched]);
    archive.record({exchange:'binance',symbol:'BTCUSDT',id,t:mockNow-1000,
      side:'SHORT',p:65000,q:0.1,usd:6500});
    await archive.flush();
    const before=await pool.query(
      'SELECT count(*)::int AS n FROM h00k_liquidation_events WHERE event_id=$1',[id]);
    assert.equal(before.rows[0].n,1);
    const nextMonth=new Date(mockNow);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1,1);
    nextMonth.setUTCHours(0,10,0,0);
    mockNow=nextMonth.getTime();
    assert.equal(await archive.runMonthlyCleanup(),true,'once at new UTC calendar month');
    assert.equal(await archive.runMonthlyCleanup(),false,'not twice');
    const after=await pool.query(
      'SELECT count(*)::int AS n FROM h00k_liquidation_events WHERE event_id=$1',[id]);
    assert.equal(after.rows[0].n,0);
    const other=await pool.query(
      'SELECT count(*)::int AS n FROM h00k_liq_monthly_sentinel WHERE id=$1',[untouched]);
    assert.equal(other.rows[0].n,1,'unrelated PostgreSQL tables survive reset');
    const marker=await pool.query(
      "SELECT last_completed_month,reset_count FROM h00k_liquidation_archive_maintenance WHERE task_name='monthly'");
    assert.equal(String(marker.rows[0].last_completed_month).trim(),
      new Date(mockNow).toISOString().slice(0,7));
    assert.ok(Number(marker.rows[0].reset_count)>=1);
    const restarted=new LiquidationArchive(true,100,()=>pool,()=>mockNow);
    assert.equal(await restarted.runMonthlyCleanup(),false);
  } finally {
    await pool.query('DELETE FROM h00k_liq_monthly_sentinel WHERE id=$1',[untouched]).catch(()=>{});
    await pool.query('DELETE FROM h00k_liquidation_events WHERE event_id=$1',[id]).catch(()=>{});
    await pool.end();
  }
});
