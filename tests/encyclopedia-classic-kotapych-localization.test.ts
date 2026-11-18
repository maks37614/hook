import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { translatePhrase } from '../src/locales';
import { encyclopediaMoreRows } from '../src/locales/encyclopediaMore20261115';
import { classicMoreRows } from '../src/locales/classicRulesMore20261115';
import { CLASSIC_RULE_GROUPS, CLASSIC_GLOSSARY } from '../src/components/encyclopedia/classicRulesData';
import { KOTAPYCH_SETUPS, KOTAPYCH_TOPICS } from '../src/components/encyclopedia/kotapychGuideData';

const nonUkrainian = ['en','ru','pl'] as const;
test('Encyclopedia follow-up catalogs contain all four nonempty language variants', () => {
  for (const rows of [encyclopediaMoreRows, classicMoreRows]) {
    assert.ok(rows.length > 50);
    const keys = rows.map(r => r[0]);
    assert.equal(new Set(keys).size, keys.length, 'duplicate Ukrainian translation sources');
    for (const row of rows) {
      assert.equal(row.length, 4);
      assert.ok(row.every(value => value?.trim()), 'empty translation for ' + row[0]);
    }
  }
});
test('all 46 Classic Rules instructions are translated, with numerical constraints intact', () => {
  assert.equal(CLASSIC_RULE_GROUPS.length, 6);
  const rules = CLASSIC_RULE_GROUPS.flatMap(g => g.items);
  assert.equal(rules.length, 46);
  for (const group of CLASSIC_RULE_GROUPS) {
    for (const lang of nonUkrainian) {
      for (const source of [group.title, group.short, ...group.items]) {
        const result = translatePhrase(lang, source);
        assert.notEqual(result, source, `missing ${lang} Classic translation: ${source}`);
      }
    }
  }
  for (const number of ['3–4', '25', '0.35', '0.3', '+1%', '5m']) {
    if (number === '0.35' || number === '0.3') continue; // decimal separators are localized
    assert.ok(classicMoreRows.some(r => r.join(' ').includes(number)));
  }
});
test('Classic Rules glossary and six section headings have localized text', () => {
  assert.equal(CLASSIC_GLOSSARY.length, 8);
  for (const item of CLASSIC_GLOSSARY) {
    for (const lang of ['en','pl'] as const) {
      assert.notEqual(translatePhrase(lang, item.term), item.term);
      assert.notEqual(translatePhrase(lang, item.meaning), item.meaning);
    }
  }
  const view = readFileSync(new URL('../src/components/encyclopedia/ClassicRulesGuide.tsx', import.meta.url),'utf8');
  assert.match(view, /tr\(group\.title\)/);
  assert.match(view, /tr\(group\.short\)/);
  assert.match(view, /tr\(item\)/);
  assert.match(view, /tr\(item\.meaning\)/);
  assert.match(view, /aria-label=\{tr\(CLASSIC_CHART_LABELS\[kind\]\)\}/);
});
test('Kotapych all setups and topic headings change with selected language', () => {
  assert.equal(KOTAPYCH_SETUPS.length, 4);
  assert.ok(KOTAPYCH_TOPICS.length >= 15);
  for (const lang of ['en','pl'] as const) {
    for (const setup of KOTAPYCH_SETUPS) {
      assert.notEqual(translatePhrase(lang, setup.title), setup.title);
      assert.notEqual(translatePhrase(lang, setup.summary), setup.summary);
    }
    for (const topic of KOTAPYCH_TOPICS) {
      assert.notEqual(translatePhrase(lang, topic.title), topic.title);
      assert.notEqual(translatePhrase(lang, topic.summary), topic.summary);
    }
  }
  const view=readFileSync(new URL('../src/components/encyclopedia/KotapychGuide.tsx',import.meta.url),'utf8');
  assert.match(view, /const \{ language \} = useLanguage\(\)/);
  assert.match(view, /tr\(item\.summary\)/);
  assert.match(view, /tr\(topic\.summary\)/);
  assert.match(view, /tr\(line\)/);
  assert.match(view, /setup\.focus\.map\(tr\)/);
});
