import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OI_PRICE_CASES, OI_MARKET_SCENARIOS } from '../src/components/encyclopedia/OpenInterestGuide';
import {
  localizeFormationGuideItem,
  translatedFormationGuideIds,
  translatedFormationGuideFields,
} from '../src/locales/formationGuideTranslations';
import { translatePhrase } from '../src/locales';

test('every Open Interest chart scenario remains translated in all four languages', () => {
  assert.equal(OI_PRICE_CASES.length, 4);
  assert.equal(OI_MARKET_SCENARIOS.length, 3);
  const phrases = [
    ...OI_PRICE_CASES.flatMap(item => [item.title, ...item.interpretation, item.practice]),
    ...OI_MARKET_SCENARIOS.flatMap(item =>
      [item.title, ...item.conditions, item.meaning, item.action]),
  ];
  assert.equal(new Set(phrases).size, phrases.length);
  for (const source of phrases) {
    assert.equal(translatePhrase('uk', source), source);
    for (const language of ['en','ru','pl'] as const) {
      const text = translatePhrase(language, source);
      assert.ok(text.trim(), 'empty ' + language + ' OI string');
      assert.notEqual(text, source, language + ' OI fallback: ' + source);
    }
  }
});

test('all eight Encyclopedia pattern cards localize all seven editorial text fields', () => {
  const view = readFileSync(new URL('../src/components/FormationGuideModal.tsx', import.meta.url),'utf8');
  const data = view.slice(view.indexOf('const GUIDE_ITEMS:'), view.indexOf('interface FormationGuideModalProps'));
  const sourceIds = [...data.matchAll(/^\s*id: '([^']+)',/gm)].map(match => match[1]);
  assert.equal(sourceIds.length, 8);
  assert.deepEqual([...translatedFormationGuideIds], sourceIds);
  assert.deepEqual([...translatedFormationGuideFields],
    ['name', 'category', 'description', 'entryRule', 'stopLossRule', 'targetRule', 'volumeRule']);
  for (const id of sourceIds) {
    const original = {
      id, name: '__SOURCE__', category: '__SOURCE__', description: '__SOURCE__',
      entryRule: '__SOURCE__', stopLossRule: '__SOURCE__', targetRule: '__SOURCE__',
      volumeRule: '__SOURCE__',
    };
    for (const language of ['en','ru','pl'] as const) {
      const item = localizeFormationGuideItem(language, original);
      for (const field of translatedFormationGuideFields) {
        assert.ok(item[field].trim(), 'empty ' + language + ' / ' + id + ' / ' + field);
        assert.notEqual(item[field], original[field],
          'untranslated ' + language + ' / ' + id + ' / ' + field);
      }
    }
  }
});
