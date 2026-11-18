import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('../src/components/ReplayPage.tsx', import.meta.url), 'utf8');
const images = readFileSync(new URL('../src/utils/replayScreenshots.ts', import.meta.url), 'utf8');

test('Replay keeps PNG locally until PostgreSQL acknowledges deletion', () => {
  assert.match(page, /const pendingPngCleanup = useRef/);
  assert.match(page, /afterRevision: lastSyncedRevision/);
  assert.match(page, /lastSyncedRevision <= item\.afterRevision/);
  assert.match(page, /item\.tradeIds\.some\(id => lastSyncedTradeIds\.includes\(id\)\)/);
  assert.match(page, /queueImageOperation\(clean\)\.catch\(reportScreenshotCleanupError\)/);
  assert.match(page, /schedulePngCleanupAfterSync\(\[id\]\)/);
  assert.doesNotMatch(page, /queueImageOperation\(\(\) => deleteReplayScreenshot\(owner, id\)\)/);
});

test('Replay account reset avoids deleting screenshots from newly created trades', () => {
  assert.match(page, /item\.all && journalItems\.length === 0 && lastSyncedTradeIds\.length === 0/);
  assert.match(page, /deleteReplayScreenshots\(owner, item\.tradeIds\)/);
  assert.match(page, /pendingPngCleanup\.current\.filter\(item => item\.owner === owner\)/);
  assert.match(images, /export async function deleteReplayScreenshots\(/);
  assert.match(images, /const unique = \[\.\.\.new Set\(tradeIds\)\]/);
  assert.match(images, /for \(const tradeId of unique\) store\.delete\(key\(owner, tradeId\)\)/);
});
