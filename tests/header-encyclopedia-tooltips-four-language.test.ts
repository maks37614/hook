import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translatePhrase } from '../src/locales';
import { encyclopediaModalUiRows } from '../src/locales/encyclopediaModalUi20261115';

const header = readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../src/components/FormationGuideModal.tsx', import.meta.url), 'utf8');

test('all header tooltips, navigation accessibility labels and guest hints use current site language', () => {
  assert.match(header, /const tr = \(source: string\) => translatePhrase\(language, source\)/);
  const phrases = [...new Set(
    [...header.matchAll(/\btr\((["'])(.*?)\1\)/g)].map(match => match[2]),
  )];
  // The language control's native title and aria-label already use t('language').
  assert.ok(phrases.length >= 18, 'unexpectedly few translated Header labels: ' + phrases.length);
  assert.ok(phrases.includes('Довідник формацій'));
  assert.ok(phrases.includes('Увійти'));
  assert.ok(phrases.includes('Системний нагляд (тільки для зареєстрованих)'));
  assert.ok(phrases.includes('Основна навігація'));
  for (const phrase of phrases) {
    // Existing Ukrainian catalogs may intentionally shorten a tooltip while
    // retaining the same accessible meaning (e.g. omitting '(Fullscreen)').
    assert.ok(translatePhrase('uk', phrase).trim());
    for (const language of ['en', 'ru', 'pl'] as const) {
      const translated = translatePhrase(language, phrase);
      assert.ok(translated.trim(), 'empty ' + language + ' header phrase: ' + phrase);
      assert.notEqual(translated, phrase,
        'missing ' + language + ' header translation: ' + phrase);
    }
  }
  assert.doesNotMatch(header,
    /\b(?:title|aria-label|placeholder)="[^"]*[А-Яа-яІіЇїЄєҐґ][^"]*"/,
    'hard-coded Ukrainian Header tooltip remains');
  assert.match(header, /id="open-guide-btn"[\s\S]*?aria-label=\{tr\("Довідник формацій"\)\}/);
});

test('Encyclopedia close button has a translated tooltip and accessible name', () => {
  assert.match(guide, /title=\{tr\("Закрити енциклопедію"\)\}/);
  assert.match(guide, /aria-label=\{tr\("Закрити енциклопедію"\)\}/);
  const row = encyclopediaModalUiRows.find(row => row[0] === 'Закрити енциклопедію');
  assert.ok(row, 'missing close button phrase');
  for (const [index, lang] of (['uk', 'en', 'ru', 'pl'] as const).entries()) {
    assert.equal(translatePhrase(lang, row[0]), row[index]);
  }
  assert.equal(translatePhrase('en', 'Закрити енциклопедію'), 'Close encyclopedia');
  assert.equal(translatePhrase('pl', 'Закрити енциклопедію'), 'Zamknij encyklopedię');
});
