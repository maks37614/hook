import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('../src/components/ReplayPage.tsx', import.meta.url), 'utf8');

test('importing old browser journal never silently drops invalid or excess trades', () => {
  assert.match(page, /if \(raw\.length > 700\)/);
  assert.match(page, /if \(trades\.length !== raw\.length\)/);
  assert.match(page, /legacyImportedTradeIds\.current = trades\.map\(item => item\.id\)/);
  assert.match(page, /legacyImportedTradeIds\.current\.every\(id => lastSyncedTradeIds\.includes\(id\)\)/);
});
test('trade delete removes a duplicate PNG from a still-pending legacy import', () => {
  assert.match(page, /const purgeLegacyImportedTrade = \(tradeId: string\)/);
  assert.match(page, /legacyImportedTradeIds\.current\.filter\(id => id !== tradeId\)/);
  assert.match(page, /purgeLegacyImportedTrade\(id\)/);
  assert.match(page, /localStorage\.setItem\('signalhook_replay_journal', JSON\.stringify\(remaining\)\)/);
});
test('reset, journal clear and account switch cancel old import state', () => {
  assert.match(page, /const forgetLegacyImport = \(\) =>/);
  assert.match(page, /legacyImportPending\.current && legacyImportPending\.current !== owner/);
  assert.match(page, /resetSimulator\(\);\s*forgetLegacyImport\(\)/);
  assert.match(page, /onClearJournal=\{\(\) => \{[\s\S]*?forgetLegacyImport\(\)/);
});
