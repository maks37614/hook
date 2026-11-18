import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {readFileSync} from 'node:fs';
import {LiquidationArchive, liquidationUtcMonth} from '../server/liquidationArchive';

const event = (id:string,usd=1000) => ({
  exchange:'binance' as const, symbol:'BTCUSDT', id,
  t:Date.now(), side:'LONG' as const, p:65000, q:0.02, usd,
});

test('archive is zero-IO by default and never polls exchange feeds', async () => {
  const archive=new LiquidationArchive(false,10,()=>{throw Error('DB should not be used')});
  archive.record(event('a'));
  await archive.flush();
  assert.equal(archive.stats().queued,0);
  assert.equal(archive.stats().enabled,false);
  assert.equal(await archive.heatmap('binance','BTCUSDT',24),null);
});

test('durable Liq archive batch uses idempotent event IDs and greatest cumulative fill', async () => {
  const calls: Array<{sql:string; values?:unknown[]}>= [];
  const fake={
    query:async(sql:string,values?:unknown[])=>{
      calls.push({sql,values});
      if(sql.includes('SELECT FLOOR')) return {rows:[]};
      return {rows:[],rowCount:0};
    },
  } as unknown as Pool;
  (fake as any).connect=async()=>({
    query:async(sql:string,values?:unknown[])=>sql.includes('SELECT last_completed_month')
      ? {rows:[{last_completed_month:liquidationUtcMonth(Date.now())}]}
      : fake.query(sql,values),
    release:()=>{},
  });
  const archive=new LiquidationArchive(true,100,()=>fake);
  archive.record(event('one',1000));
  archive.record(event('two',2000));
  archive.record(event('one',4000));
  archive.record(event('one',500)); // stale cumulative fill ignored
  assert.equal(archive.stats().queued,2);
  await archive.flush();
  assert.equal(archive.stats().queued,0);
  assert.equal(archive.stats().batches,1);
  assert.equal(archive.stats().duplicateQueued,1);
  const insert=calls.find(c=>c.sql.includes('INSERT INTO h00k_liquidation_events'));
  assert.ok(insert);
  assert.match(insert!.sql,/ON CONFLICT \(exchange,symbol,event_id\)/);
  assert.match(insert!.sql,/EXCLUDED\.observed_notional > h00k_liquidation_events\.observed_notional/);
  assert.equal(insert!.values?.length,16,'one row per unique ID, eight parameters each');
  assert.equal(insert!.values?.[7],4000);
  assert.equal(insert!.values?.[15],2000);
  assert.ok(calls.some(c=>c.sql.includes('CREATE TABLE IF NOT EXISTS h00k_liquidation_events')));
});

test('archive bounded queue never silently claims to save dropped events', () => {
  const archive=new LiquidationArchive(true,2,()=>{throw Error('No DB expected')});
  archive.record(event('a'));
  archive.record(event('b'));
  archive.record(event('c'));
  assert.equal(archive.stats().queued,2);
  assert.equal(archive.stats().droppedOnOverflow,1);
  archive.record({...event('a',1001),usd:3000});
  assert.equal(archive.stats().queued,2);
});

test('observed-only heatmap is grouped at timestamp and logarithmic price bins', async () => {
  const queries: string[]=[];
  const fake={
    query:async(sql:string)=>{
      queries.push(sql);
      if(sql.includes('SELECT FLOOR')) return {rows:[
        {t:1794600000,bin:2200,side:'LONG',amount:'8500',orders:'3'},
      ]};
      return {rows:[]};
    },
  } as unknown as Pool;
  (fake as any).connect=async()=>({
    query:async(sql:string,values?:unknown[])=>sql.includes('SELECT last_completed_month')
      ? {rows:[{last_completed_month:liquidationUtcMonth(Date.now())}]}
      : fake.query(sql,values),
    release:()=>{},
  });
  const archive=new LiquidationArchive(true,5,()=>fake);
  const data=await archive.heatmap('binance','BTCUSDT',24);
  assert.equal(data?.complete,false);
  assert.equal(data?.truncated,false);
  assert.equal(data?.bins.length,1);
  assert.equal(data?.bins[0].usd,8500);
  assert.equal(data?.bins[0].count,3);
  assert.equal(data?.bins[0].time,1794600000*1000);
  assert.match(data!.caveat,/Лише отримані/);
  assert.equal(await archive.heatmap('binance','BTC\/USDT',168),null);
  assert.match(queries.at(-1)!,/LIMIT 6001/);
});

test('Postgres migration rejects invalid price values and has indexed event timestamp', () => {
  const sql=readFileSync(new URL('../server/migrations/003_liquidation_events.sql',import.meta.url),'utf8');
  assert.match(sql,/PRIMARY KEY \(exchange,symbol,event_id\)/);
  assert.match(sql,/price < 'Infinity'::float8/);
  assert.match(sql,/event_time DESC/);
  const feed=readFileSync(new URL('../server/liquidationFeed.ts',import.meta.url),'utf8');
  assert.match(feed,/liquidationArchive\.record/);
  assert.match(feed,/LIQ_MARKET_CAP/);
});

test('7d heatmap keeps latest 6,000 bins when archive exceeds its output cap', async () => {
  // DB query returns descending timestamp, newest first; output is ascending
  // for the HookChart binary-search viewport transform.
  const rows=Array.from({length:6001},(_,i)=>({
    t:2_000_000_000-i*900,bin:2200,side:'SHORT',amount:'1500',orders:'1',
  }));
  const fake={
    query:async (sql:string) => sql.includes('SELECT FLOOR') ? {rows} : {rows:[]},
  } as unknown as Pool;
  (fake as any).connect=async()=>({
    query:async(sql:string,values?:unknown[])=>sql.includes('SELECT last_completed_month')
      ? {rows:[{last_completed_month:liquidationUtcMonth(Date.now())}]}
      : fake.query(sql,values),
    release:()=>{},
  });
  const archive=new LiquidationArchive(true,5,()=>fake);
  const result=await archive.heatmap('binance','BTCUSDT',168);
  assert.equal(result?.bins.length,6000);
  assert.equal(result?.truncated,true);
  assert.equal(result?.bins.at(-1)?.time,2_000_000_000_000,'latest bin retained');
  assert.ok(result!.bins[0].time<result!.bins.at(-1)!.time);
});

test('disabled heatmap returns explicit JSON 404, not fallback HTML or a database call', async () => {
  const {default:express}=await import('express');
  const {installLiquidationArchiveRoutes}=await import('../server/liquidationArchiveRoutes');
  const {liquidationArchive}=await import('../server/liquidationArchive');
  if(liquidationArchive.enabled)return; // staging may explicitly enable archive
  const app=express();
  installLiquidationArchiveRoutes(app);
  const server=app.listen(0,'127.0.0.1');
  try {
    await new Promise<void>(resolve=>server.once('listening',resolve));
    const address=server.address();
    if(!address || typeof address==='string')throw Error('port unavailable');
    const response=await fetch('http://127.0.0.1:'+address.port+
      '/api/hookchart/liquidation-heatmap?exchange=binance&symbol=BTCUSDT&period=24h');
    assert.equal(response.status,404);
    assert.match(response.headers.get('content-type')||'',/json/);
    const body=await response.json();
    assert.equal(body.code,'LIQ_ARCHIVE_DISABLED');
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});

test('UTC monthly archive cleanup runs once per calendar month, survives restart, and only truncates Liq table', async () => {
  let now=Date.UTC(2026,10,20,12);
  let completedMonth='2026-11';
  let truncates=0;
  const sqlCalls:string[]=[];
  const fake={
    query:async(sql:string)=>{sqlCalls.push(sql);return {rows:[]};},
    connect:async()=>({
      query:async(sql:string,params?:unknown[])=>{
        sqlCalls.push(sql);
        if(sql.includes('SELECT last_completed_month'))return {
          rows:[{last_completed_month:completedMonth}],
        };
        if(sql.startsWith('TRUNCATE TABLE'))truncates++;
        if(sql.includes('UPDATE h00k_liquidation_archive_maintenance'))completedMonth=String(params?.[0]);
        return {rows:[]};
      },
      release:()=>{},
    }),
  } as unknown as Pool;
  const first=new LiquidationArchive(true,50,()=>fake,()=>now);
  assert.equal(await first.runMonthlyCleanup(),false,'first startup in same month keeps history');
  assert.equal(truncates,0);
  now=Date.UTC(2026,11,1,0,10);
  assert.equal(await first.runMonthlyCleanup(),true,'new month triggers cleanup');
  assert.equal(truncates,1);
  assert.equal(completedMonth,'2026-12');
  assert.equal(first.stats().monthlyResets,1);
  assert.equal(await first.runMonthlyCleanup(),false,'recheck in same month does not purge');
  const restarted=new LiquidationArchive(true,50,()=>fake,()=>now);
  assert.equal(await restarted.runMonthlyCleanup(),false,'database marker prevents duplicate purge on restart');
  assert.equal(truncates,1);
  assert.ok(sqlCalls.some(sql=>sql.includes('FOR UPDATE')));
  assert.ok(sqlCalls.every(sql=>!sql.includes('TRUNCATE TABLE h00k_users') &&
    !sql.includes('TRUNCATE TABLE users') &&
    !sql.includes('TRUNCATE TABLE alerts')));
  assert.equal(sqlCalls.filter(sql=>sql.startsWith('TRUNCATE TABLE')).length,1);
  assert.equal(sqlCalls.find(sql=>sql.startsWith('TRUNCATE TABLE'))?.trim(),
    'TRUNCATE TABLE h00k_liquidation_events');
});

test('after calendar rollover old Liq packets cannot recreate erased history', async () => {
  let now=Date.UTC(2026,11,1,0,15);
  const archive=new LiquidationArchive(true,10,()=>{throw Error('No DB should be touched')},()=>now);
  archive.record({...event('late'),t:Date.UTC(2026,10,30,23,59)});
  assert.equal(archive.stats().queued,0);
  assert.equal(archive.stats().rejected,1);
  archive.record({...event('current'),t:now-100});
  assert.equal(archive.stats().queued,1);
  assert.equal(liquidationUtcMonth(now),'2026-12');
  assert.equal(liquidationUtcMonth(Date.UTC(2026,10,30)),'2026-11');
});

test('disabled archive has no scheduled maintenance, writes or database connection', async () => {
  const archive=new LiquidationArchive(false,10,()=>{throw Error('No DB')});
  archive.startMonthlyMaintenance();
  assert.equal(await archive.runMonthlyCleanup(),false);
  assert.equal(archive.stats().monthlyResetEnabled,false);
  assert.equal(archive.stats().lastMonthlyResetAt,null);
  archive.stopMonthlyMaintenance();
});

test('monthly maintenance migration never modifies unrelated application tables', () => {
  const sql=readFileSync(new URL('../server/migrations/004_liquidation_monthly_reset.sql',import.meta.url),'utf8');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS h00k_liquidation_archive_maintenance/);
  assert.doesNotMatch(sql,/TRUNCATE|DROP TABLE|CASCADE/);
  const route=readFileSync(new URL('../server/liquidationArchiveRoutes.ts',import.meta.url),'utf8');
  assert.match(route,/liquidationArchive\.startMonthlyMaintenance\(\)/);
  assert.match(route,/toISOString\(\)\.slice\(0, 7\)/);
});
