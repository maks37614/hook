import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interpolate, locales, translateKey } from '../src/locales';
import { replayDynamicRows } from '../src/locales/replayDynamic20261115';

const languages = ['uk', 'en', 'ru', 'pl'] as const;
const placeholders = (value: string) => [...value.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)].map(match => match[1]).sort();

test('Replay dynamic messages cover all languages and preserve every numeric placeholder', () => {
  const seen = new Set<string>();
  for (const row of replayDynamicRows) {
    assert.equal(row.length, 5);
    assert.ok(!seen.has(row[0]), 'duplicate key: ' + row[0]);
    seen.add(row[0]);
    for (let i = 0; i < languages.length; i++) {
      const language = languages[i];
      assert.deepEqual(placeholders(row[i + 1]), placeholders(row[1]), row[0] + ' / ' + language);
      assert.equal(locales[language].strings[row[0]], row[i + 1]);
      const vars = Object.fromEntries(placeholders(row[1]).map(p => [p, '42']));
      assert.equal(translateKey(language, row[0], vars), interpolate(row[i + 1], vars));
    }
  }
});

test('Replay coin picker, journal, and simulator use selected-language templates', () => {
  const read = (name: string) => readFileSync(new URL('../src/components/replay/' + name, import.meta.url), 'utf8');
  const toolbar = read('ReplayToolbar.tsx');
  const journal = read('ReplayJournal.tsx');
  const simulator = read('ReplaySimulatorPanel.tsx');
  assert.ok(toolbar.includes('replay.dynamic.coinCount'));
  assert.ok(toolbar.includes('replay.dynamic.listSummary'));
  assert.ok(journal.includes("window.confirm(t('replay.dynamic.clearJournalConfirm'))"));
  assert.ok(journal.includes('replay.dynamic.profitLoss'));
  assert.ok(simulator.includes('replay.dynamic.currentPrice'));
  assert.equal(translateKey('en', 'replay.dynamic.coinCount', { count: 3 }), 'Coins: 3');
  assert.equal(translateKey('pl', 'replay.dynamic.orderPrice', { price: '0.99' }), 'Cena: $0.99');
});
