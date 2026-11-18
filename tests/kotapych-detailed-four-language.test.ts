import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KOTAPYCH_SETUPS, KOTAPYCH_TOPICS } from '../src/components/encyclopedia/kotapychGuideData';
import { kotapychDetailedRows } from '../src/locales/kotapychDetails20261115';
import { translatePhrase } from '../src/locales';

const fields = ['context','recognition','entry','management','stop','targets','cancellation'] as const;
const langs = ['en','ru','pl'] as const;

test('Kotapych: all detailed rules in four setups and three topic guides have complete translations', () => {
  assert.equal(KOTAPYCH_SETUPS.length, 4);
  const setupSources = KOTAPYCH_SETUPS.flatMap(setup => fields.flatMap(field => setup[field]));
  assert.equal(setupSources.length, 78);
  const topicIds = ['market-context', 'bases-levels', 'base-secondary'];
  const topicSources = KOTAPYCH_TOPICS.filter(topic => topicIds.includes(topic.id))
    .flatMap(topic => topic.points);
  assert.equal(topicSources.length, 23);
  const sources = [...setupSources, ...topicSources];
  assert.equal(kotapychDetailedRows.length, 101);
  assert.equal(kotapychDetailedRows.length, sources.length);
  assert.equal(new Set(kotapychDetailedRows.map(row => row[0])).size, sources.length);
  for (const source of sources) {
    const row = kotapychDetailedRows.find(row => row[0] === source);
    assert.ok(row, 'missing Kotapych source phrase: ' + source);
    assert.equal(row.length, 4);
    assert.equal(translatePhrase('uk', source), source);
    for (const [i, lang] of langs.entries()) {
      assert.ok(row[i + 1].trim());
      assert.notEqual(row[i + 1], source, lang + ': untranslated source: ' + source);
      assert.equal(translatePhrase(lang, source), row[i + 1],
        lang + ': detailed phrase not connected to the active locale: ' + source);
    }
  }
});

test('Kotapych: numeric caveats remain across translations', () => {
  const examples = [
    { source: '40%', translated: '40%' },
    { source: '25–30%', translated: '25–30%' },
    { source: '0,5%', translated: '0.5%' },
    { source: '1,5–2%', translated: '1.5–2%' },
    { source: '30%', translated: '30%' },
    { source: '1:5', translated: '1:5' },
    { source: '1:10', translated: '1:10' },
  ];
  for (const { source, translated } of examples) {
    const matching = kotapychDetailedRows.filter(row => row[0].includes(source));
    assert.ok(matching.length > 0, 'no source for caveat ' + source);
    for (const row of matching) {
      assert.ok(row[1].includes(translated), 'English value changed: ' + source);
    }
  }
});

test('Kotapych: detailed rows are rendered using selected language', () => {
  const component = readFileSync(new URL('../src/components/encyclopedia/KotapychGuide.tsx', import.meta.url), 'utf8');
  assert.match(component, /const \{ language \} = useLanguage\(\)/);
  assert.match(component, /lines\.map\(\(line, index\)/);
  assert.match(component, /\{tr\(line\)\}/);
  const registry = readFileSync(new URL('../src/locales/index.ts', import.meta.url), 'utf8');
  assert.match(registry, /kotapychDetailedPhrases\[language\]/);
});
