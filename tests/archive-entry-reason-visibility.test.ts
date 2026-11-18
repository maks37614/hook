import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const archiveModal = readFileSync(
  new URL('../src/components/ArchiveModal.tsx', import.meta.url),
  'utf8',
);

test('saved formations show the whole entry reason section only when it has text', () => {
  assert.match(
    archiveModal,
    /\{item\.entryReason\?\.trim\(\)\s*&&\s*\(\s*<section\s+data-archive-entry-reason/,
  );
  assert.doesNotMatch(archiveModal, /archive\.entryReasonMissing/);

  for (const missing of [undefined, '', ' ', '\t\n  ']) {
    assert.equal(Boolean(missing?.trim()), false);
  }
  assert.equal(Boolean('  Planned retest  '.trim()), true);
});
