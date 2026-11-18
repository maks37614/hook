import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interpolate, locales, translateKey } from '../src/locales';
import { surveillanceCoreUiRows } from '../src/locales/surveillanceCore20261115';
const languages = ['uk', 'en', 'ru', 'pl'] as const;
const vars = (s: string) => [...s.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)].map(x => x[1]).sort();
test('Monitoring interface messages contain four complete, matching translations', () => {
  const seen = new Set<string>();
  for (const row of surveillanceCoreUiRows) {
    assert.equal(row.length, 5);
    assert.ok(!seen.has(row[0]), row[0]);
    seen.add(row[0]);
    const params = Object.fromEntries(vars(row[1]).map(x => [x, '42']));
    for (const [i, lang] of languages.entries()) {
      const key = 'surveillance.ui.' + row[0];
      assert.deepEqual(vars(row[i + 1]), vars(row[1]));
      assert.equal(locales[lang].strings[key], row[i + 1]);
      assert.equal(translateKey(lang, key, params), interpolate(row[i + 1], params));
    }
  }
});
test('Monitoring UI localizes status, alerts, setup and removal without changing analysis', () => {
  const src = (name: string) => readFileSync(new URL('../src/components/' + name, import.meta.url), 'utf8');
  const page = src('SurveillancePage.tsx');
  const remove = src('SurveillanceRemoveButton.tsx');
  const copy = src('FormationCoinCopyButton.tsx');
  for (const key of ['heading', 'recentEvents', 'searchPlaceholder', 'triggerModes', 'error.selectSymbol', 'success.added', 'telegram', 'filter.critical', 'severity.warning', 'showMoreEvents', 'domDensities', 'confirmation'])
    assert.ok(page.includes('surveillance.ui.' + key), key);
  assert.ok(remove.includes('surveillance.ui.removeSymbol'));
  assert.ok(copy.includes("t('ui.copy.symbol', { symbol: fullSymbol })"));
  assert.equal(translateKey('en','surveillance.ui.coinCount',{count:2}),'COINS: 2');
  assert.equal(translateKey('pl','surveillance.ui.status.activated',{symbol:'BTCUSDT'}),'Włączono monitoring #BTCUSDT 24/7!');
});
