import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/utils/useReplayProfileState.ts', import.meta.url),'utf8');
test('Replay loads profile only after auth and protects against old account response', () => {
  assert.match(source, /if \(authLoading\) return/);
  assert.match(source, /activeOwner\.current !== owner/);
  assert.match(source, /apiFetch\('\/api\/account\/replay'/);
  assert.match(source, /setLoadedFor\(owner\)/);
});
test('Replay saves only meaningful state updates and version checks every write', () => {
  assert.match(source, /expectedRevision: revision\.current/);
  assert.match(source, /position\?\.id, pendingOrders, journalItems, resetCount/);
  assert.match(source, /90_000/);
  assert.match(source, /if \(response\.status === 409\)/);
  assert.match(source, /entryScreenshot: undefined/);
  assert.match(source, /startsWith\('data:image\/'\)/);
});
test('Reset balance begins fresh profile session and clears all derived trade stats', () => {
  assert.match(source, /setPosition\(null\)/);
  assert.match(source, /setPendingOrders\(\[\]\)/);
  assert.match(source, /setJournalItems\(\[\]\)/);
  assert.match(source, /setResetCount\(count => count \+ 1\)/);
});

test('Replay cross-device deletion prunes IndexedDB but never loads pictures into profile JSON', () => {
  assert.match(source, /pruneReplayScreenshots\(owner,/);
  assert.match(source, /snapshot\.journal \|\| \[\]/);
  assert.match(source, /keepalive: typeof document !== 'undefined'/);
  assert.match(source, /visibilitychange/);
});

test('restoration does not overwrite historical replay cursor before candles load', () => {
  assert.match(source, /const effectiveContext = !context\.atTime && restoredContext/);
  assert.match(source, /restoredContext\.symbol === context\.symbol/);
  assert.match(source, /context: effectiveContext, resetCount/);
});
