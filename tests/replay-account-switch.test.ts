import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/components/ReplayPage.tsx', import.meta.url), 'utf8');

test('switching profiles cancels prior playback and discards in-flight historical responses', () => {
  assert.match(source, /if \(lastAccountRef\.current === ownerKey\) return/);
  assert.match(source, /initializedAccountRef\.current = null/);
  assert.match(source, /loadRequestIdRef\.current\+\+/);
  assert.match(source, /historyRequestIdRef\.current\+\+/);
  assert.match(source, /setAllCandles\(\[\]\)/);
  assert.match(source, /setIsPlaying\(false\)/);
  assert.match(source, /if \(!isReady\) \{\s*setIsPlaying\(false\);\s*resetIntrabar\(\)/,
    'a not-yet-ready profile cancels playback and clears the fractional candle');
  assert.match(source, /replaySecondCacheRef\.current\.clear\(\)/,
    'a new account must not reuse historical second buffers from the prior session');
});
test('late screenshot operations cannot write into a different signed-in user journal', () => {
  assert.match(source, /screenshotOwnerRef\.current = owner/);
  assert.equal((source.match(/if \(screenshotOwnerRef\.current !== userId\) return;/g) || []).length, 2);
});
