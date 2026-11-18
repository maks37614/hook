import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { personalStateSnapshotDigest } from '../server/pgPersonalState';
import { verifyPersonalStateStaging } from '../server/pgPersonalStateVerifier';

test('read-only personal-state verifier never mutates database or prints account payloads', async () => {
  const snapshot = { surveillance: {}, alerts: [], history: [] };
  const queries: string[] = [];
  const client = { query: async (sql: string, args?: unknown[]) => {
    queries.push(sql);
    if (sql.includes('FROM h00k_personal_state_staging_runs'))
      return { rows: [{ snapshot_sha256: personalStateSnapshotDigest(snapshot) }] };
    if (sql.includes('FROM auth_users')) return { rows: [{ id: 'test-owner' }] };
    if (sql.includes('count(*)::bigint AS total')) return { rows: [{ total: '0' }] };
    return { rows: [] };
  }} as any;
  const result = await verifyPersonalStateStaging(client,snapshot,{stageKey:'test-source'});
  assert.equal(result.consistent,true);
  assert.equal(result.stageMarkerMatches,true);
  assert.deepEqual(result.surveillance,{expected:0,matched:0,missing:0,different:0,extra:0});
  assert.equal(queries[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(queries.at(-1),'COMMIT');
  assert.equal(queries.every(query => !/^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(query)),true);
  assert.equal(queries.some(query => /h00k_personal_state_staging_runs/.test(query)),true);
});

test('missing migration marker must not be presented as a verified PostgreSQL cutover', async () => {
  const snapshot = { surveillance: {}, alerts: [], history: [] };
  const client = { query: async (sql: string) => {
    if (sql.includes('FROM auth_users')) return { rows: [] };
    if (sql.includes('count(*)::bigint AS total')) return { rows: [{ total: '0' }] };
    return { rows: [] };
  }} as any;
  const result=await verifyPersonalStateStaging(client,snapshot);
  assert.equal(result.stageMarkerMatches,false);
  assert.equal(result.consistent,false);
});

test('explicit --verify mode does not initialize or migrate identity schema', () => {
  const cli=readFileSync(new URL('../server/pgStateMigrator.ts',import.meta.url),'utf8');
  assert.match(cli,/--verify/);
  assert.match(cli,/if \(!verify && !ready\) await initializeIdentity\(\)/);
  assert.match(cli,/verifyPersonalStateStaging\(connection,snapshot\)/);
  assert.match(cli,/process\.exitCode=2/);
});
