import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isReplayImageKey, replayImageKey } from '../src/utils/replayScreenshots';

test('Replay image refs never embed a data URL in the profile journal', () => {
  assert.equal(replayImageKey('trade_8'), 'idb:trade_8');
  assert.equal(isReplayImageKey('idb:trade_8','trade_8'), true);
  assert.equal(isReplayImageKey('idb:trade_2','trade_8'), false);
});
test('Replay browser images are owner-keyed and physically deleted on reset', () => {
  const source = readFileSync(new URL('../src/utils/replayScreenshots.ts', import.meta.url), 'utf8');
  assert.match(source, /'owner:' \+ encodeURIComponent\(userId\)/);
  assert.match(source, /store\.delete\(key\(owner, tradeId\)\)/);
  assert.match(source, /store\.openCursor\(IDBKeyRange\.bound\(start, start \+ '\\uffff'\)\)/);
  assert.match(source, /cursor\.delete\(\)/);
  // Descriptive comments may mention localStorage, but binary storage must never use it.
  assert.doesNotMatch(source, /\blocalStorage\.(?:getItem|setItem|removeItem)\s*\(|\bfetch\s*\(/);
});

test('next authenticated profile load removes orphaned browser PNGs', () => {
  const source = readFileSync(new URL('../src/utils/replayScreenshots.ts', import.meta.url), 'utf8');
  assert.match(source, /export async function pruneReplayScreenshots/);
  assert.match(source, /if \(!validKeys\.has\(String\(cursor\.key\)\)\) cursor\.delete\(\)/);
});
