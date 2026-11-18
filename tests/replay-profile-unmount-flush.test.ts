import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/utils/useReplayProfileState.ts', import.meta.url), 'utf8');

test('Replay saves pending profile mutations on page unmount', () => {
  assert.match(src, /Router navigation can unmount Replay/);
  assert.match(src, /useEffect\(\(\) => \(\) => \{/);
  assert.match(src, /clearTimeout\(pendingTimer\.current\)/);
  assert.match(src, /if \(owner && loadedFor === owner\) saveLatest\(\)/);
});

test('Replay persistence never writes before the signed-in owner snapshot is loaded', () => {
  assert.match(src, /if \(!owner \|\| loadedFor !== owner \|\| activeOwner\.current !== owner \|\| blocked\.current\) return;/);
  assert.match(src, /if \(loadedFor !== owner \|\| activeOwner\.current !== owner \|\| blocked\.current\) return;/);
  assert.match(src, /\}, \[owner, loadedFor\]\);/);
});
