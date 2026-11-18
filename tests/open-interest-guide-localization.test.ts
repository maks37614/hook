import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translatePhrase } from '../src/locales';
import { OI_PRICE_CASES, OI_MARKET_SCENARIOS } from '../src/components/encyclopedia/OpenInterestGuide';

test('Open Interest case studies and practical guidance are translated to EN, RU and PL', () => {
  assert.equal(OI_PRICE_CASES.length, 4);
  assert.equal(OI_MARKET_SCENARIOS.length, 3);
  const sources = [
    ...OI_PRICE_CASES.flatMap(item => [item.title, ...item.interpretation, item.practice]),
    ...OI_MARKET_SCENARIOS.flatMap(item => [item.title, ...item.conditions, item.meaning, item.action]),
  ];
  assert.ok(sources.length >= 30);
  for (const source of sources) {
    for (const lang of ['en', 'ru', 'pl'] as const) {
      const translated = translatePhrase(lang, source);
      assert.ok(translated?.trim(), `${lang}: missing ${source}`);
      assert.notEqual(translated, source, `${lang}: untranslated ${source}`);
    }
  }
});

test('Open Interest guide actively localizes scenario arrays when language changes', () => {
  const src = readFileSync(new URL('../src/components/encyclopedia/OpenInterestGuide.tsx', import.meta.url), 'utf8');
  assert.match(src, /useLanguage\(\)/);
  assert.match(src, /translatePhrase\(language, source\)/);
  assert.match(src, /tr\(item\.title\)/);
  assert.match(src, /tr\(item\.practice\)/);
  assert.match(src, /tr\(item\.meaning\)/);
  assert.match(src, /tr\(item\.action\)/);
  assert.match(src, /tr\(point\)/);
  assert.match(src, /tr\(v\)/);
  assert.equal(translatePhrase('en', 'Що OI показує насправді'), 'What OI really measures');
  assert.equal(translatePhrase('pl', 'Перед входом'), 'Przed wejściem');
});
