import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('../src/components/ReplayPage.tsx', import.meta.url), 'utf8');

test('Replay reuses a single audio context and releases it on page unmount', () => {
  assert.match(page, /const replayAudioContextRef = useRef<AudioContext \| null>\(null\)/);
  assert.match(page, /if \(!audioCtx \|\| audioCtx\.state === 'closed'\)/);
  assert.match(page, /replayAudioContextRef\.current = audioCtx/);
  assert.match(page, /context\.close\(\)\.catch\(\(\) => \{\}\)/);
  assert.match(page, /osc\.onended = \(\) => \{/);
  assert.doesNotMatch(page, /const audioCtx = new \(window\.AudioContext/);
});
test('Replay notifications cancel the previous expiry timer and clean up on unmount', () => {
  assert.match(page, /const replayToastTimerRef = useRef<ReturnType<typeof setTimeout> \| null>\(null\)/);
  assert.match(page, /if \(replayToastTimerRef\.current\) clearTimeout\(replayToastTimerRef\.current\)/);
  assert.match(page, /replayToastTimerRef\.current = setTimeout\(\(\) => \{/);
  assert.match(page, /replayToastTimerRef\.current = null/);
});
