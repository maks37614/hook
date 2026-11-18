import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translatePhrase } from '../src/locales';
import { encyclopediaModalUiRows } from '../src/locales/encyclopediaModalUi20261115';

const source = readFileSync(new URL('../src/components/FormationGuideModal.tsx', import.meta.url), 'utf8');

test('Encyclopedia modal changes its tabs, subtitles and loading states when the language changes', () => {
  const visible = source.slice(source.indexOf('export const FormationGuideModal'));
  assert.match(visible, /const tr = \(source: string\) => translatePhrase\(language, source\)/);
  for (const text of [
    'Скальпінг','Формації-Патерни','Індикатори',
    '4 сетапи · 19 тематичних розділів','6 тематичних розділів · графічні приклади',
    'Відкритий інтерес · 7 розділів',
    'Завантажуємо матеріали Котапича…','Завантажуємо правила…',
    'Точка входу:','Стоп-лос:','Тейк-профіт:','Підтвердження обсягом:',
    'Закрити енциклопедію',
  ]) {
    assert.ok(visible.includes('tr(' + JSON.stringify(text) + ')'), 'missing localized modal label: ' + text);
  }
  assert.doesNotMatch(visible.replace(/tr\((["'])(.*?)\1\)/g, 'TRANSLATED'),
    /[А-Яа-яІіЇїЄєҐґ]/, 'untranslated Ukrainian text remains in the modal');
});

test('new Encyclopedia navigation labels have four language variants', () => {
  assert.equal(encyclopediaModalUiRows.length, 4);
  for (const row of encyclopediaModalUiRows) {
    assert.equal(row.length, 4);
    for (const [i, language] of (['uk','en','ru','pl'] as const).entries()) {
      assert.equal(translatePhrase(language, row[0]), row[i]);
    }
  }
  assert.equal(translatePhrase('en','Скальпінг'), 'Scalping');
  assert.equal(translatePhrase('pl','Індикатори'), 'Wskaźniki');
});
