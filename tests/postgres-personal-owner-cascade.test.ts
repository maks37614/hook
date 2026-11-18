import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration=readFileSync(new URL('../server/migrations/006_personal_state_owner_fk.sql', import.meta.url), 'utf8');

test('all three private state tables have strict owner foreign keys and cascading account deletion', () => {
  for (const table of [
    'h00k_surveillance_state',
    'h00k_price_alert_state',
    'h00k_alert_history_state',
  ]) assert.ok(migration.includes("('"+table+"'"), table+" missing from owner FK migration");
  assert.match(migration,/FOREIGN KEY \(user_id\) REFERENCES auth_users\(id\) ON DELETE CASCADE NOT VALID/);
  assert.match(migration,/VALIDATE CONSTRAINT/);
  assert.match(migration,/EXCEPTION 'Personal state owner FK migration blocked/);
  assert.match(migration,/IF existing\.count > 0 THEN/);
  assert.match(migration,/IF NOT FOUND THEN/);
  assert.match(migration,/confdeltype <> 'c'/,
    're-running the migration may not accept a restrictive or nullifying FK');
});
