/**
 * Inactive-by-default PostgreSQL repository for the future personal-state
 * runtime cutover. Production JSON readers/writers do not call this module.
 *
 * An owner must be explicitly activated after verified, quiesced migration,
 * ordered-row reconstruction and tombstone reconciliation. Without that
 * marker every read/write fails closed. Writes are revision-checked and
 * transactional; one owner's edits never replace another owner's rows.
 */
import type { Pool, PoolClient } from 'pg';
import type { AlertHistoryItem, PriceAlert, SurveillanceCoin } from '../src/types';
import { preparePersonalStateRows, STATE_MIGRATION_CHUNK } from './pgPersonalState';

export type PersonalDataset = 'surveillance' | 'alerts' | 'history';
type PersonalRow = SurveillanceCoin | PriceAlert | AlertHistoryItem;
type StateForDataset = {
  surveillance: SurveillanceCoin[];
  alerts: PriceAlert[];
  history: AlertHistoryItem[];
};

const TABLE: Record<PersonalDataset, {table:string; id:string; columns:readonly string[]}> = {
  surveillance: {
    table: 'h00k_surveillance_state', id: 'coin_id',
    columns: ['user_id','coin_id','exchange','market_type','symbol','is_active','payload','position'],
  },
  alerts: {
    table: 'h00k_price_alert_state', id: 'alert_id',
    columns: ['user_id','alert_id','exchange','market_type','symbol','is_active','payload','position'],
  },
  history: {
    table: 'h00k_alert_history_state', id: 'history_id',
    columns: ['user_id','history_id','triggered_at','payload','position'],
  },
};

export class PersonalStateInactiveError extends Error {
  constructor() {
    super('PostgreSQL personal state is not activated for this owner; JSON remains authoritative');
  }
}
export class PersonalStateRevisionConflict extends Error {
  constructor() { super('Personal state was modified concurrently; reload the latest revision'); }
}

function ownerAllowed(owner: string): boolean {
  return typeof owner === 'string' && owner.length > 0 &&
    owner !== 'guest' && owner.length <= 256;
}

function rowsFor<T extends PersonalDataset>(
  dataset: T, owner: string, records: StateForDataset[T],
): unknown[][] {
  if (!ownerAllowed(owner) || !Array.isArray(records))
    throw new Error('Invalid private state owner or row list');
  const prepared = preparePersonalStateRows({
    surveillance: dataset === 'surveillance' ? { [owner]:records as SurveillanceCoin[] } : {},
    alerts: dataset === 'alerts' ? records as PriceAlert[] : [],
    history: dataset === 'history' ? records as AlertHistoryItem[] : [],
  }, new Set([owner]));
  const accepted = prepared[dataset];
  if (prepared.skipped.invalid || prepared.skipped.orphaned ||
      accepted.length !== records.length)
    throw new Error('Invalid, duplicated or cross-owner private state record; no changes committed');
  if (dataset === 'history') {
    return prepared.history.map((row,i)=>[owner,row.id,row.time,JSON.stringify(row.payload),i]);
  }
  const market = dataset === 'alerts' ? prepared.alerts : prepared.surveillance;
  return market.map((row,i)=>[owner,row.id,row.exchange,row.market,row.symbol,
    row.active,JSON.stringify(row.payload),i]);
}

async function readRevision(client:PoolClient,owner:string,lock:boolean):Promise<number> {
  const row=await client.query('SELECT revision FROM h00k_personal_state_runtime_owners '+
    'WHERE user_id=$1'+(lock?' FOR UPDATE':''),[owner]);
  if (row.rows.length!==1) throw new PersonalStateInactiveError();
  const revision=Number(row.rows[0].revision);
  if (!Number.isSafeInteger(revision) || revision<0) throw new Error('Invalid PostgreSQL state revision');
  return revision;
}

async function rewriteDataset(client:PoolClient,owner:string,
  dataset:PersonalDataset, rows:readonly (readonly unknown[])[]):Promise<void> {
  const {table,columns}=TABLE[dataset];
  await client.query('DELETE FROM '+table+' WHERE user_id=$1',[owner]);
  for(let start=0;start<rows.length;start+=STATE_MIGRATION_CHUNK) {
    const part=rows.slice(start,start+STATE_MIGRATION_CHUNK);
    const values:unknown[]=[];
    const tuples=part.map((row,i)=>{
      values.push(...row);
      return '('+row.map((_,j)=>'$'+(i*columns.length+j+1)).join(',')+')';
    });
    await client.query('INSERT INTO '+table+' ('+columns.join(',')+') VALUES '+tuples.join(','),values);
  }
}

export class PgPersonalStateRuntimeRepository {
  constructor(private readonly pool: Pick<Pool, 'connect'>) {}

  /** One consistent read of all private datasets; inactive owners cannot
   * accidentally read staged copies as if they were live.
   */
  async readOwner(owner:string):Promise<{revision:number;state:StateForDataset}> {
    if(!ownerAllowed(owner)) throw new PersonalStateInactiveError();
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const revision=await readRevision(client,owner,false);
      const [surveillance,alerts,history]=await Promise.all([
        client.query('SELECT payload FROM h00k_surveillance_state WHERE user_id=$1 '+
          'ORDER BY position ASC NULLS LAST, coin_id ASC',[owner]),
        client.query('SELECT payload FROM h00k_price_alert_state WHERE user_id=$1 '+
          'ORDER BY position ASC NULLS LAST, alert_id ASC',[owner]),
        client.query('SELECT payload FROM h00k_alert_history_state WHERE user_id=$1 '+
          'ORDER BY position ASC NULLS LAST, history_id ASC',[owner]),
      ]);
      const state: StateForDataset={
        surveillance:surveillance.rows.map(r=>r.payload as SurveillanceCoin),
        alerts:alerts.rows.map(r=>r.payload as PriceAlert),
        history:history.rows.map(r=>r.payload as AlertHistoryItem),
      };
      for(const group of Object.values(state))
        if(group.some(record=>record?.userId!==owner))
          throw new Error('PostgreSQL payload owner mismatch');
      await client.query('COMMIT');
      return {revision,state};
    } catch(error) {
      await client.query('ROLLBACK').catch(()=>{});
      throw error;
    } finally {client.release();}
  }

  /** Optimistic revision with per-owner row lock. All three datasets can be
   * replaced atomically, or just one dataset without touching the others.
   * This is not yet connected to live JSON-backed application routes.
   */
  async replace(owner:string,expectedRevision:number,
    changes:Partial<StateForDataset>):Promise<number> {
    if (!ownerAllowed(owner) || !Number.isSafeInteger(expectedRevision) ||
        expectedRevision<0 || !changes || typeof changes!=='object')
      throw new Error('Invalid personal state replacement');
    const kinds=(Object.keys(changes) as PersonalDataset[]);
    if (!kinds.length || kinds.some(kind=>!Object.prototype.hasOwnProperty.call(TABLE,kind)))
      throw new Error('Unknown or empty private state dataset');
    // Validate every record before taking a DB lock; no partially accepted
    // user input can reach a transactional DELETE.
    const prepared=kinds.map(kind=>[kind,rowsFor(kind,owner,changes[kind] as never)] as const);
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current=await readRevision(client,owner,true);
      if(current!==expectedRevision) throw new PersonalStateRevisionConflict();
      if (current >= Number.MAX_SAFE_INTEGER)
        throw new Error('Personal state revision overflow');
      for(const [dataset,rows] of prepared) await rewriteDataset(client,owner,dataset,rows);
      const result=await client.query(
        'UPDATE h00k_personal_state_runtime_owners SET revision=revision+1 '+
        'WHERE user_id=$1 AND revision=$2 RETURNING revision',
        [owner,current]);
      if(result.rowCount!==1) throw new PersonalStateRevisionConflict();
      await client.query('COMMIT');
      return current+1;
    } catch(error) {
      await client.query('ROLLBACK').catch(()=>{});
      throw error;
    } finally {client.release();}
  }
}
