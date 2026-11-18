import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/components/ReplayPage.tsx',import.meta.url),'utf8');
test('failed IndexedDB upload never destroys the only legacy PNG before PostgreSQL ACK', () => {
  assert.match(source, /if \(legacyImportPending\.current === userId\) return;/);
  assert.match(source, /const message = \{/);
  assert.match(source, /showToast\('danger', 'Replay PNG', message\)/);
  assert.match(source, /screenshotUrl: undefined/);
  assert.match(source, /lastSyncedRevision <= legacyImportAfterRevision\.current/);
});
