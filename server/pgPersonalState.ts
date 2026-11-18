import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { PoolClient } from 'pg';
import type { PriceAlert, AlertHistoryItem, SurveillanceCoin } from '../src/types';

type DbClient = Pick<PoolClient, 'query'>;
export type PersonalStateSnapshot = {
  surveillance: Record<string, SurveillanceCoin[]>;
  alerts: PriceAlert[];
  history: AlertHistoryItem[];
};
export type MigrationCount = { surveillance: number; alerts: number; history: number;
  orphaned: number; invalid: number };
export const STATE_MIGRATION_CHUNK = 100;
export const DEFAULT_PERSONAL_STATE_STAGE_KEY = 'legacy-json';

export function personalStateSnapshotDigest(snapshot: PersonalStateSnapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

/** Preserve only identities registered in PostgreSQL. Legacy/guest account
 * records remain in the original JSON backup, never resurrected as monitors. */
export function preparePersonalStateRows(snapshot: PersonalStateSnapshot,
  knownUsers: ReadonlySet<string>) {
  const rows = {
    surveillance: [] as Array<{ owner: string; id: string; exchange: string; market: string;
      symbol: string; active: boolean; payload: SurveillanceCoin }>,
    alerts: [] as Array<{ owner: string; id: string; exchange: string; market: string;
      symbol: string; active: boolean; payload: PriceAlert }>,
    history: [] as Array<{ owner: string; id: string; time: number; payload: AlertHistoryItem }>,
  };
  let orphaned=0,invalid=0;
  const ownerAllowed=(userId: unknown): userId is string =>
    typeof userId === 'string' && userId !== 'guest' && knownUsers.has(userId);
  const marketValid=(x:any) =>
    (x?.exchange === 'binance' || x?.exchange === 'bybit') &&
    (x.marketType === 'spot' || x.marketType === 'futures') &&
    typeof x.symbol === 'string' && /^[A-Z0-9]{2,40}$/.test(x.symbol.toUpperCase());
  const identValid=(id:unknown) => typeof id === 'string' && id.length > 0 && id.length <= 256;
  for(const [user,coins] of Object.entries(snapshot.surveillance || {})) {
    if (!Array.isArray(coins)) { invalid++; continue; }
    for(const coin of coins) {
      if(!ownerAllowed(user) || coin?.userId!==user) { orphaned++; continue; }
      if(!identValid(coin?.id) || !marketValid(coin)) { invalid++; continue; }
      rows.surveillance.push({ owner:user,id:coin.id,exchange:coin.exchange,
        market:coin.marketType,symbol:coin.symbol.toUpperCase(),
        active:coin.isActive===true,payload:coin });
    }
  }
  for (const alert of snapshot.alerts || []) {
    if (!ownerAllowed(alert?.userId)) { orphaned++; continue; }
    if (!identValid(alert?.id) || !marketValid(alert)) { invalid++; continue; }
    rows.alerts.push({owner:alert.userId!,id:alert.id,exchange:alert.exchange,
      market:alert.marketType,symbol:alert.symbol.toUpperCase(),
      active:alert.isActive===true,payload:alert});
  }
  for (const event of snapshot.history || []) {
    if (!ownerAllowed(event?.userId)) { orphaned++; continue; }
    if (!identValid(event?.id) || !Number.isSafeInteger(event?.triggeredAt)) {
      invalid++; continue;
    }
    rows.history.push({owner:event.userId,id:event.id,time:event.triggeredAt,payload:event});
  }
  // Duplicate IDs in one owner's JSON are ambiguous, not harmless. A
  // silent last-write-wins Map would discard personal alerts during staging.
  // Keep the first complete record and report the duplicate as invalid, so
  // cutover preflight cannot claim the source is lossless.
  const unique=<T>(items: readonly T[], key:(item:T)=>string) => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of items) {
      const id = key(item);
      if (seen.has(id)) { invalid++; continue; }
      seen.add(id);
      out.push(item);
    }
    return out;
  };
  return {
    surveillance:unique(rows.surveillance,x=>JSON.stringify([x.owner,x.id])),
    alerts:unique(rows.alerts,x=>JSON.stringify([x.owner,x.id])),
    history:unique(rows.history,x=>JSON.stringify([x.owner,x.id])),
    skipped:{ orphaned,invalid },
  };
}

async function batchInsert(client: DbClient, table: string,
  columns: readonly string[], rows: readonly (readonly unknown[])[]) {
  let inserted=0;
  for(let at=0;at<rows.length;at+=STATE_MIGRATION_CHUNK){
    const chunk=rows.slice(at,at+STATE_MIGRATION_CHUNK);
    const values: unknown[]=[];
    const tuples=chunk.map((row,i)=>{
      values.push(...row);
      return '('+row.map((_,j)=>'$'+(i*columns.length+j+1)).join(',')+')';
    });
    const conflict=table==='h00k_alert_history_state'?'history_id':
      table==='h00k_price_alert_state'?'alert_id':'coin_id';
    const nonKeyColumns=columns.filter(c=>c!=='user_id'&&c!==conflict);
    const updates=nonKeyColumns.map(c=>c+'=EXCLUDED.'+c).join(',');
    // An older JSON snapshot must NEVER overwrite a different live/staged
    // PostgreSQL record. Identical replays remain idempotent; conflicting
    // values return no row, triggering rollback of the entire transaction.
    const unchanged=nonKeyColumns.map(c=>
      table+'.'+c+' IS NOT DISTINCT FROM EXCLUDED.'+c).join(' AND ');
    // Table and column names are fixed internal literals, never user input.
    const result=await client.query(
      'INSERT INTO '+table+' ('+columns.join(',')+') VALUES '+tuples.join(',')+
      ' ON CONFLICT (user_id,'+conflict+') DO UPDATE SET '+updates+
      ' WHERE '+unchanged+' RETURNING 1',values);
    inserted+=result.rowCount || 0;
  }
  return inserted;
}

export async function stagePersonalStateToPostgres(client:DbClient,snapshot:PersonalStateSnapshot,
  schema:string,options:{stageKey?:string}={}) {
  const stageKey=options.stageKey ?? DEFAULT_PERSONAL_STATE_STAGE_KEY;
  if(!stageKey || stageKey.length>128) throw new Error('Invalid personal state stage key');
  const snapshotSha256=personalStateSnapshotDigest(snapshot);
  await client.query('BEGIN');
  try {
    // A transaction-wide advisory lock prevents simultaneous migrations.
    await client.query('SELECT pg_advisory_xact_lock(811040027)');
    await client.query(schema);
    const previous=await client.query(
      'SELECT snapshot_sha256 FROM h00k_personal_state_staging_runs WHERE stage_key=$1 FOR UPDATE',
      [stageKey]);
    if (previous.rows.length && previous.rows[0].snapshot_sha256 !== snapshotSha256)
      throw new Error('Personal state staging source has changed since the last successful run; '+
        'stop and reconcile the JSON and PostgreSQL copies before retrying');
    const users = await client.query('SELECT id FROM auth_users');
    const known=new Set<string>(users.rows.map((row:{id:string})=>row.id));
    const prepared=preparePersonalStateRows(snapshot,known);
    // A matching staging marker means the source was already committed.
    // Do not even attempt INSERTs on replay: an idempotent ON CONFLICT
    // still INSERTS rows that a user has since intentionally deleted.
    // --verify is the only safe way to check an existing staged snapshot.
    if (previous.rows.length) {
      await client.query('COMMIT');
      return { surveillance:0, alerts:0, history:0, ...prepared.skipped,
        stageKey, snapshotSha256, alreadyStaged:true, verificationRequired:true };
    }
    const surveillance=await batchInsert(client,'h00k_surveillance_state',
      ['user_id','coin_id','exchange','market_type','symbol','is_active','payload'],
      prepared.surveillance.map(r=>[r.owner,r.id,r.exchange,r.market,r.symbol,r.active,
        JSON.stringify(r.payload)]));
    const alerts=await batchInsert(client,'h00k_price_alert_state',
      ['user_id','alert_id','exchange','market_type','symbol','is_active','payload'],
      prepared.alerts.map(r=>[r.owner,r.id,r.exchange,r.market,r.symbol,r.active,
        JSON.stringify(r.payload)]));
    const history=await batchInsert(client,'h00k_alert_history_state',
      ['user_id','history_id','triggered_at','payload'],
      prepared.history.map(r=>[r.owner,r.id,r.time,JSON.stringify(r.payload)]));
    if (surveillance!==prepared.surveillance.length || alerts!==prepared.alerts.length ||
      history!==prepared.history.length)
      throw new Error('PostgreSQL staging conflict: a target row differs from the JSON snapshot; '+
        'the transaction was rolled back without replacing the newer state');
    const inserted=await client.query(
      'INSERT INTO h00k_personal_state_staging_runs(stage_key,snapshot_sha256) VALUES ($1,$2)',
      [stageKey,snapshotSha256]);
    if(inserted.rowCount!==1) throw new Error('PostgreSQL staging marker write failed');
    await client.query('COMMIT');
    return {surveillance,alerts,history,...prepared.skipped,stageKey,snapshotSha256,
      alreadyStaged:false,verificationRequired:true};
  } catch(e) { await client.query('ROLLBACK');throw e; }
}
export const readPersonalStateSchema=()=>readFileSync(new URL('./migrations/002_personal_state.sql',
  import.meta.url),'utf8');
export function readJsonSnapshot(dataDir=resolve(process.cwd(),'server','data')):
  PersonalStateSnapshot {
  const read=(name:string,empty:unknown)=> {
    try { return JSON.parse(readFileSync(resolve(dataDir,name),'utf8')); }
    catch(e) {
      if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return empty;
      throw e;
    }
  };
  return { surveillance:read('surveillance.json',{}) as PersonalStateSnapshot['surveillance'],
    alerts:read('alerts.json',[]) as PriceAlert[],
    history:read('alert_history.json',[]) as AlertHistoryItem[] };
}
