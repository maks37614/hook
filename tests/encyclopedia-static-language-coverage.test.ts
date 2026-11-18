import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translatePhrase, locales } from '../src/locales';

const components = [
  'FormationGuideModal.tsx',
  'encyclopedia/ClassicRulesGuide.tsx',
  'encyclopedia/KotapychGuide.tsx',
  'encyclopedia/OpenInterestGuide.tsx',
] as const;

test('every literal Ukrainian phrase passed to Encyclopedia tr() has all four translations', () => {
  let checked = 0;
  for (const path of components) {
    const source = readFileSync(new URL('../src/components/' + path, import.meta.url), 'utf8');
    const phrases = new Set([...source.matchAll(/\btr\((['"])([^'"\\]*(?:\\.[^'"\\]*)*)\1\)/g)]
      .map(match => match[2])
      .filter(phrase => /[А-Яа-яІіЇїЄєҐґ]/.test(phrase)));
    assert.ok(phrases.size >= 10, path + ' unexpectedly lost localization calls');
    for (const phrase of phrases) {
      for (const language of ['uk', 'en', 'ru', 'pl'] as const) {
        const translated = translatePhrase(language, phrase);
        assert.ok(translated.trim(), language + ': empty translation for ' + phrase);
        assert.ok(Object.prototype.hasOwnProperty.call(locales[language].phrases, phrase) ||
          translated !== phrase,
          language + ': unknown source phrase in ' + path + ': ' + phrase);
        if (language === 'en' || language === 'pl') {
          assert.notEqual(translated, phrase,
            language + ': untranslated Ukrainian source in ' + path + ': ' + phrase);
        }
      }
      checked++;
    }
  }
  assert.ok(checked >= 90, 'expected substantive coverage for all Encyclopedia sections');
});
