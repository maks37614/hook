import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/components/ReplayPage.tsx', import.meta.url), 'utf8');
const journal = readFileSync(new URL('../src/components/replay/ReplayJournal.tsx', import.meta.url), 'utf8');

test('in-flight PNG locks are scoped to account and trade ID', () => {
  assert.match(page, /const operationKey = userId \+ ':' \+ tradeId/);
  assert.match(page, /storingScreenshots\.current\.has\(operationKey\)/);
  assert.match(page, /storingScreenshots\.current\.add\(operationKey\)/);
  assert.match(page, /storingScreenshots\.current\.delete\(operationKey\)/);
  assert.doesNotMatch(page, /storingScreenshots\.current\.has\(item\.id\)/);
});

test('switching previews clears old PNG and ignores requests from an unmounted preview', () => {
  assert.match(journal, /setSource\(undefined\);\s*const load = \(\) =>/);
  assert.match(journal, /if \(!disposed\) setSource\(undefined\)/);
  assert.match(journal, /if \(!cancelled\) setPreviewUrl\(null\)/);
  assert.match(journal, /URL\.revokeObjectURL\(blobUrl\)/);
});
