import test from 'node:test';
import assert from 'node:assert/strict';
import { locales, translateKey } from '../src/locales';
import { replayStaticRows } from '../src/locales/replayStatic20261115';

test('Replay static labels exist on all four languages without duplicate keys', () => {
  const keys = new Set<string>();
  for (const row of replayStaticRows) {
    assert.equal(row.length,5);
    assert.ok(!keys.has(row[0])); keys.add(row[0]);
    for (const [i,lang] of (['uk','en','ru','pl'] as const).entries()) {
      const key = 'replay.static.' + row[0];
      assert.ok(row[i+1].trim());
      assert.equal(locales[lang].strings[key],row[i+1]);
      assert.equal(translateKey(lang,key),row[i+1]);
    }
  }
});
