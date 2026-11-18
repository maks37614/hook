import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KOTAPYCH_SETUPS, KOTAPYCH_TOPICS } from '../src/components/encyclopedia/kotapychGuideData';
import { kotapychDetailedRows } from '../src/locales/kotapychDetails20261115';
import { kotapychAdvancedTopicRows } from '../src/locales/kotapychAdvancedTopics20261115';
import { translatePhrase } from '../src/locales';

const supported = ['uk', 'en', 'ru', 'pl'] as const;
const setupFields = ['context', 'recognition', 'entry', 'management', 'stop', 'targets', 'cancellation'] as const;
function numericalTokens(text: string): string[] {
  return [...text.matchAll(/\d+(?:[.,]\d+)?(?:[–-]\d+(?:[.,]\d+)?)?%?/g)]
    .map(match => match[0].replaceAll(',', '.'));
}

test('all 19 Kotapych deep-dive topics have complete, four-language paragraphs', () => {
  assert.equal(KOTAPYCH_TOPICS.length, 19);
  const topicPhrases = KOTAPYCH_TOPICS.flatMap(topic => topic.points);
  assert.equal(topicPhrases.length, 142);
  assert.equal(kotapychDetailedRows.length, 101); // 78 setups + first 23 topic paragraphs
  assert.equal(kotapychAdvancedTopicRows.length, 119);
  const rows = [...kotapychDetailedRows, ...kotapychAdvancedTopicRows];
  assert.equal(new Set(rows.map(row => row[0])).size, rows.length, 'duplicate source keys');
  const map = new Map<string, readonly string[]>(rows.map(row => [row[0], row]));
  for (const topic of KOTAPYCH_TOPICS) {
    assert.ok(topic.points.length, 'empty topic ' + topic.id);
    for (const source of topic.points) {
      const row = map.get(source);
      assert.ok(row, `untranslated topic ${topic.id}: ${source}`);
      assert.equal(row.length, 4);
      for (const [index, lang] of supported.entries()) {
        assert.ok(row[index].trim(), `empty ${lang} topic ${topic.id}`);
        assert.equal(translatePhrase(lang, source), row[index],
          `selected locale not applied: ${lang} / ${topic.id}`);
        if (lang !== 'uk') assert.notEqual(row[index], source,
          `same-as-Ukrainian ${lang} topic ${topic.id}`);
        if (index > 0) {
          for (const token of numericalTokens(source)) {
            assert.ok(numericalTokens(row[index]).includes(token),
              `source number ${token} missing in ${lang} / ${topic.id}`);
          }
        }
      }
    }
  }
});

test('all four Kotapych setups keep every source rule and render localized bullet text', () => {
  assert.equal(KOTAPYCH_SETUPS.length, 4);
  const source = KOTAPYCH_SETUPS.flatMap(item =>
    setupFields.flatMap(field => item[field]));
  assert.equal(source.length, 78);
  const keys = new Set<string>(kotapychDetailedRows.map(row => row[0]));
  assert.ok(source.every(line => keys.has(line)));
  const view = readFileSync(new URL('../src/components/encyclopedia/KotapychGuide.tsx', import.meta.url), 'utf8');
  assert.match(view, /translatePhrase\(language, text\)/);
  assert.match(view, /\{tr\(line\)\}/);
  assert.match(view, /\{tr\(item\.summary\)\}/);
  assert.match(view, /\{tr\(topic\.summary\)\}/);
});

test('new Kotapych topic catalog is connected to all four language dictionaries', () => {
  const index = readFileSync(new URL('../src/locales/index.ts', import.meta.url), 'utf8');
  assert.match(index, /import \{ kotapychAdvancedTopicPhrases \}/);
  assert.match(index, /kotapychAdvancedTopicPhrases\[language\]/);
  for (const language of supported) {
    const example = 'У лонговій ідеї покупці можуть повертати ціну до межі швидше, ніж продавці відштовхують її; це один із показників локального переважання.';
    const translated = translatePhrase(language, example);
    assert.ok(translated.trim());
    if (language !== 'uk') assert.notEqual(translated, example);
  }
});
