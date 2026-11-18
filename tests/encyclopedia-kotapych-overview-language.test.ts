import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translatePhrase } from '../src/locales';

const view = readFileSync(
  new URL('../src/components/encyclopedia/KotapychGuide.tsx', import.meta.url),
  'utf8'
);
const overviewCopy = [
  'Основна ідея: шукати підтверджену реакцію ринку на межі проторговки, оцінювати швидкість руху, обсяги та поведінку покупців і продавців. Прокол ліквідності — лише частина контексту.',
  'Відсотки прибутковості та співвідношення R:R у файлах — особисті приклади автора, не підтверджені бектестом. Ризик кожної угоди розраховується окремо.',
  'Ключові ідеї з обох документів (79 і 8 сторінок), згруповані за темами: від структури ринку й варіантів сетапів до виконання угод, фандингу та ризику. Авторські оцінки ймовірностей не є перевіреною статистикою.',
] as const;

test('Kotapych overview, caution and topic description render through selected language', () => {
  const rendered = view.slice(view.indexOf('export function KotapychGuide()'));
  assert.match(rendered, /const tr = \(text: string\) => translatePhrase\(language, text\)/);
  for (const text of overviewCopy) {
    assert.ok(rendered.includes('{tr(' + JSON.stringify(text) + ')}'),
      'hardcoded or missing translated paragraph: ' + text.slice(0, 60));
  }
  for (const language of ['en', 'ru', 'pl'] as const) {
    for (const phrase of overviewCopy) {
      const translated = translatePhrase(language, phrase);
      assert.ok(translated.trim(), 'missing ' + language + ' translation');
      assert.notEqual(translated, phrase,
        language + ' fallback to Ukrainian: ' + phrase.slice(0, 50));
    }
  }
});

test('Encyclopedia navigation and Classic glossary use consistent educational terms', () => {
  const expected = {
    en: ['Scalping', 'Indicators', 'Glossary of terms'],
    ru: ['Скальпинг', 'Индикаторы', 'Словарь обозначений'],
    pl: ['Skalping', 'Wskaźniki', 'Słownik pojęć'],
  } as const;
  for (const [lang, values] of Object.entries(expected)) {
    const language = lang as keyof typeof expected;
    for (const [index, source] of ['Скальпінг', 'Індикатори', 'Словник позначень'].entries()) {
      assert.equal(translatePhrase(language, source), values[index],
        'inconsistent ' + language + ' terminology for ' + source);
    }
  }
});
