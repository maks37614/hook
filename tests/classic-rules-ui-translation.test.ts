import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translatePhrase } from '../src/locales';

const source = readFileSync(new URL('../src/components/encyclopedia/ClassicRulesGuide.tsx', import.meta.url), 'utf8');

test('Classic Rules source warnings and instructions render using selected language', () => {
  const ui = source.slice(source.indexOf('export function ClassicRulesGuide()'));
  assert.match(ui, /const tr = \(source: string\) => translatePhrase\(language, source\)/);
  for (const phrase of [
    'Правила торгівлі', 'Структурований навчальний регламент',
    'Це особистий регламент', 'Уточнення чисел:', 'Ключове правило:',
    'Обмеження:', 'Припини натягувати нахилку:', 'Словник позначень',
  ]) {
    assert.ok(ui.includes('tr(') && ui.includes(phrase), 'missing translated Classic rule: ' + phrase);
  }
  assert.match(ui, /tr\(item\.time\)/);
  assert.match(ui, /tr\("у прикладі"\)/);
  assert.match(source, /\{tr\(title\)\}/);
  assert.match(source, /\{tr\(subtitle\)\}/);
  assert.equal(translatePhrase('en', 'Правила торгівлі'), 'Trading rules');
  assert.equal(translatePhrase('pl', 'Словник позначень'), 'Słownik pojęć');
});
