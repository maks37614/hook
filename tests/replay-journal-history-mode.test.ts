import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/components/replay/ReplayJournal.tsx', import.meta.url), 'utf8');
test('Replay journal opens lazy HookChart for each historic trade, not on initial list mount', () => {
  assert.match(source, /React\.lazy\(\(\) => import\('\.\/ReplayTradeHistoryPreview'\)\)/);
  assert.match(source, /previewMode === 'photo' \? \(/);
  assert.match(source, /<ReplayTradeHistoryPreview trade=\{selectedScreenshot\.trade\} \/>/);
  assert.match(source, /setPreviewMode\('chart'\)/);
  assert.match(source, /setPreviewMode\('photo'\)/);
});
test('PNG data from account-owned IndexedDB is used in thumbnail, modal, and download', () => {
  assert.match(source, /loadReplayScreenshot\(imageOwner, trade\.id\)/);
  assert.match(source, /loadReplayScreenshot\(imageOwner, selectedScreenshot\.trade\.id\)/);
  assert.match(source, /URL\.createObjectURL\(blob\)/);
  assert.match(source, /URL\.revokeObjectURL\(blobUrl\)/);
  assert.match(source, /href=\{previewUrl\}/);
  assert.match(source, /journalItems\.some\(trade => trade\.id === selectedScreenshot\.trade\.id\)/);
  assert.match(source, /imageOwner\?: string \| null/);
});
