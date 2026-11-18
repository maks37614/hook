import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replayPresetTagRows, translateReplayPresetTag } from '../src/locales/replayPresetTags20261115';

test('Replay tags translate to four languages but stored tag IDs remain unchanged', () => {
  assert.equal(replayPresetTagRows.length,12);
  const seen = new Set<string>();
  for (const row of replayPresetTagRows) {
    assert.equal(row.length,4);
    assert.ok(!seen.has(row[0])); seen.add(row[0]);
    for (const [i,lang] of (['uk','en','ru','pl'] as const).entries())
      assert.equal(translateReplayPresetTag(lang,row[0]),row[i]);
  }
  assert.equal(translateReplayPresetTag('en','My manual custom tag'),'My manual custom tag');
  const panel = readFileSync(new URL('../src/components/replay/ReplaySimulatorPanel.tsx',import.meta.url),'utf8');
  const journal = readFileSync(new URL('../src/components/replay/ReplayJournal.tsx',import.meta.url),'utf8');
  assert.match(panel,/value=\{tag\}/);
  assert.match(panel,/translateReplayPresetTag\(language, tag\)/);
  assert.match(journal,/translateReplayPresetTag\(language, trade.tag\)/);
});
