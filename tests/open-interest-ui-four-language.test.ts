import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translatePhrase } from '../src/locales';
import { openInterestUiRows } from '../src/locales/openInterestUiMore20261115';

const file = readFileSync(new URL('../src/components/encyclopedia/OpenInterestGuide.tsx', import.meta.url), 'utf8');

test('Open Interest article translates headings, inline descriptions and screen-reader labels', () => {
  const renderedPart = file.slice(file.indexOf('function DirectionIndicator'));
  assert.match(renderedPart, /aria-label=\{tr\("зростання"\)\}/);
  assert.match(renderedPart, /aria-label=\{tr\("падіння"\)\}/);
  assert.match(renderedPart, /title=\{tr\("Основи: як читати OI разом із ціною"\)\}/);
  assert.match(renderedPart, /title=\{tr\("Де дивитися Open Interest"\)\}/);
  assert.match(renderedPart, /tr\("У матеріалі згадані"\)/);
  assert.match(renderedPart, /tr\("Відкритий інтерес \(Open Interest, OI\)"\)/);
  assert.match(renderedPart, /tr\("Свічка стрімко рухається:/);
  assert.match(renderedPart, /tr\("Знайди рівень → дочекайся реакції/);
  assert.doesNotMatch(renderedPart.replace(/tr\((["'])(.*?)\1\)/g, 'TRANSLATED'),
    /[А-Яа-яІіЇїЄєҐґ]/, 'Unlocalized Ukrainian text remains in rendered article');
});
test('new Open Interest dictionary resolves missing labels on all four locales', () => {
  assert.equal(openInterestUiRows.length, 6);
  for (const row of openInterestUiRows) {
    assert.equal(row.length, 4);
    assert.ok(row.every(value => value.trim()));
    for (const [index, language] of (['uk','en','ru','pl'] as const).entries()) {
      assert.equal(translatePhrase(language, row[0]), row[index]);
    }
  }
  assert.equal(translatePhrase('en', 'зростання'), 'rising');
  assert.equal(translatePhrase('pl', 'Ціна'), 'Cena');
});
