import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/ReplayPage.tsx', import.meta.url), 'utf8');
test('Replay profile state is not written to legacy unscoped localStorage', () => {
  assert.match(source, /useReplayProfileState\(/);
  assert.doesNotMatch(source, /\b(saveReplayJournal|saveReplaySettings|loadReplayJournal|loadReplaySettings)\(/);
  assert.match(source, /if \(!isReady\) \{/);
  assert.match(source, /restoredContext\?\.atTime/);
  assert.match(source, /restoringProfile = false/);
});
test('Deleting a trade and resetting balance also deletes its screenshot bytes', () => {
  assert.match(source, /storeReplayScreenshot\(userId, tradeId, image\)/);
  assert.match(source, /replayImageKey\(tradeId\)/);
  assert.match(source, /onDeleteJournalItem=\{\(id\) =>/);
  assert.match(source, /schedulePngCleanupAfterSync\(\[id\]\)/);
  assert.match(source, /clearReplayScreenshots\(owner\)/);
  assert.match(source, /resetSimulator\(\)/);
  assert.match(source, /setIsPlaying\(false\)/);
  assert.match(source, /if \(!window\.confirm\(warning\)\) return/);
});

test('Failed physical PNG deletion is surfaced instead of claiming complete cleanup', () => {
  assert.match(source, /queueImageOperation\(clean\)\.catch\(reportScreenshotCleanupError\)/);
  assert.match(source, /deleteReplayScreenshots\(owner, item\.tradeIds\)/);
  assert.match(source, /schedulePngCleanupAfterSync\(journalItems\.map\(item => item\.id\), true\)/);
  assert.match(source, /showToast\('danger', 'Replay', message\)/);
});

test('legacy local Replay journal requires explicit owner action before import', () => {
  assert.match(source, /legacyJournalCount > 0/);
  assert.match(source, /const importLegacyReplay = \(\) =>/);
  assert.match(source, /if \(!owner \|\| journalItems\.length > 0\) return/);
  assert.match(source, /if \(!window\.confirm\(label\)\) return/);
  assert.match(source, /legacyImportPending\.current = owner/);
  assert.match(source, /lastSyncedRevision <= legacyImportAfterRevision\.current/);
  assert.match(source, /localStorage\.removeItem\('signalhook_replay_journal'\)/);
});

test('legacy import deletes the old copy only after the imported trade ids are in the acknowledged PG snapshot', () => {
  assert.match(source, /legacyImportedTradeIds\.current\.every\(id => lastSyncedTradeIds\.includes\(id\)\)/);
  assert.match(source, /legacyImportedTradeIds\.current = trades\.map\(item => item\.id\)/);
});
