/**
 * Explicit, read-only JSON -> PostgreSQL staging consistency check.
 *
 * This does NOT make PostgreSQL authoritative. It compares complete
 * per-owner alert/monitor/history rows, including their JSON payload and
 * indexed metadata, and reports aggregate mismatches without logging user
 * identities, symbols, chat IDs or history content.
 */
import { isDeepStrictEqual } from 'node:util';
import type { PoolClient } from 'pg';
import type { PersonalStateSnapshot } from './pgPersonalState';
import { DEFAULT_PERSONAL_STATE_STAGE_KEY, personalStateSnapshotDigest,
  preparePersonalStateRows, STATE_MIGRATION_CHUNK } from './pgPersonalState';

type Client = Pick<PoolClient, 'query'>;
type StagedRow = {
  owner: string;
  id: string;
  fields: Record<string, unknown>;
  payload: unknown;
};
export type TableVerification = {
  expected: number;
  matched: number;
  missing: number;
  different: number;
  extra: number;
};
export type PersonalStateVerification = {
  stageKey: string;
  snapshotSha256: string;
  stageMarkerMatches: boolean;
  surveillance: TableVerification;
  alerts: TableVerification;
  history: TableVerification;
  skipped: { orphaned: number; invalid: number };
  consistent: boolean;
};

function rowKey(owner: string, id: string): string {
  return JSON.stringify([owner, id]);
}
function normalizedPayload(payload: unknown): unknown {
  // PostgreSQL JSONB normalizes object key order and omits undefined values.
  // JSON serialization is exactly how staging originally wrote the payloads.
  return JSON.parse(JSON.stringify(payload));
}

/** Each table name, ID and column is a fixed internal literal. */
async function verifyTable(client: Client, table: string, idColumn: string,
  columns: readonly string[], expected: readonly StagedRow[],
  scopeOwners?: readonly string[]): Promise<TableVerification> {
  const filtered = scopeOwners
    ? expected.filter(row => scopeOwners.includes(row.owner))
    : expected;
  let matched = 0, missing = 0, different = 0, found = 0;
  for (let offset = 0; offset < filtered.length; offset += STATE_MIGRATION_CHUNK) {
    const chunk = filtered.slice(offset, offset + STATE_MIGRATION_CHUNK);
    const values = chunk.flatMap(row => [row.owner, row.id]);
    const places = chunk.map((_, i) =>
      '($' + (2 * i + 1) + ',$' + (2 * i + 2) + ')').join(',');
    const selected = ['user_id', idColumn, ...columns, 'payload'].join(',');
    const query = 'SELECT ' + selected + ' FROM ' + table +
      ' WHERE (user_id,' + idColumn + ') IN (VALUES ' + places + ')';
    const result = await client.query(query, values);
    const byKey = new Map<string, Record<string, unknown>>(
      result.rows.map((row: Record<string, unknown>) =>
        [rowKey(String(row.user_id), String(row[idColumn])), row]));
    for (const row of chunk) {
      const stored = byKey.get(rowKey(row.owner, row.id));
      if (!stored) { missing++; continue; }
      found++;
      const metadataMatches = columns.every(column =>
        isDeepStrictEqual(column === 'triggered_at'
          ? Number(stored[column]) : stored[column], row.fields[column]));
      const payloadMatches = isDeepStrictEqual(stored.payload, normalizedPayload(row.payload));
      if (metadataMatches && payloadMatches) matched++;
      else different++;
    }
  }
  const total = scopeOwners
    ? await client.query('SELECT count(*)::bigint AS total FROM ' + table +
      ' WHERE user_id = ANY($1::text[])', [scopeOwners])
    : await client.query('SELECT count(*)::bigint AS total FROM ' + table);
  const totalRows = Number(total.rows[0].total);
  if (!Number.isSafeInteger(totalRows) || totalRows < found)
    throw new Error('Invalid PostgreSQL staging row count');
  return { expected: filtered.length, matched, missing, different,
    extra: totalRows - found };
}

/** Compare one consistent PostgreSQL snapshot. No INSERT/UPDATE/DELETE. */
export async function verifyPersonalStateStaging(client: Client,
  snapshot: PersonalStateSnapshot, options: {
    stageKey?: string;
    /** Test-only/account-scoped verification; omit to validate all owners. */
    scopeOwners?: readonly string[];
  } = {}): Promise<PersonalStateVerification> {
  const stageKey = options.stageKey ?? DEFAULT_PERSONAL_STATE_STAGE_KEY;
  if (!stageKey || stageKey.length > 128) throw new Error('Invalid personal state stage key');
  const digest = personalStateSnapshotDigest(snapshot);
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const previous = await client.query(
      'SELECT snapshot_sha256 FROM h00k_personal_state_staging_runs WHERE stage_key=$1',
      [stageKey]);
    const stageMarkerMatches = previous.rows.length === 1 &&
      previous.rows[0].snapshot_sha256 === digest;
    const users = await client.query('SELECT id FROM auth_users');
    const allowed = new Set<string>(
      users.rows.map((row: {id: string}) => row.id));
    const prepared = preparePersonalStateRows(snapshot, allowed);
    const surveillance = await verifyTable(client, 'h00k_surveillance_state', 'coin_id',
      ['exchange','market_type','symbol','is_active'],
      prepared.surveillance.map(row => ({ owner: row.owner, id: row.id,
        fields: { exchange: row.exchange, market_type: row.market,
          symbol: row.symbol, is_active: row.active }, payload: row.payload })),
      options.scopeOwners);
    const alerts = await verifyTable(client, 'h00k_price_alert_state', 'alert_id',
      ['exchange','market_type','symbol','is_active'],
      prepared.alerts.map(row => ({ owner: row.owner, id: row.id,
        fields: { exchange: row.exchange, market_type: row.market,
          symbol: row.symbol, is_active: row.active }, payload: row.payload })),
      options.scopeOwners);
    const history = await verifyTable(client, 'h00k_alert_history_state', 'history_id',
      ['triggered_at'],
      prepared.history.map(row => ({ owner: row.owner, id: row.id,
        fields: { triggered_at: row.time }, payload: row.payload })),
      options.scopeOwners);
    const tables = [surveillance, alerts, history];
    const consistent = stageMarkerMatches &&
      tables.every(row => !row.missing && !row.different && !row.extra);
    await client.query('COMMIT');
    return { stageKey, snapshotSha256: digest, stageMarkerMatches,
      surveillance, alerts, history, skipped: prepared.skipped, consistent };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
