import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { FormationGuideModal } from '../src/components/FormationGuideModal';
import { ClassicRulesGuide, ClassicPriceDiagram, type ClassicChartKind } from '../src/components/encyclopedia/ClassicRulesGuide';
import {
  CLASSIC_GENERAL_RULES, CLASSIC_LEVEL_RULES, CLASSIC_RANGE_RULES,
  CLASSIC_CASCADE_RULES, CLASSIC_SINGLE_HIGH_RULES, CLASSIC_TRENDLINE_RULES,
  CLASSIC_RULE_GROUPS, CLASSIC_GLOSSARY,
} from '../src/components/encyclopedia/classicRulesData';

test('Scalping contains Kotapych and Rules, with no top-level Rules category', () => {
  const html = renderToString(React.createElement(FormationGuideModal, { isOpen: true, onClose: () => {} }));
  for (const name of ['Скальпінг', 'Формації-Патерни', 'Індикатори', 'Котапич', 'Правила']) {
    assert.ok(html.includes(name), name + ' missing from the encyclopedia');
  }
  const topLevelTabs = html.match(/role="tab" aria-selected=/g) || [];
  assert.equal(topLevelTabs.length, 3, 'only Scalping, Patterns and Indicators remain as primary categories');
  assert.match(html, /aria-label="Підкатегорії скальпінгу"/);
  assert.match(html, /Котапич/);
  assert.match(html, /Правила/);

  const source = readFileSync(new URL('../src/components/FormationGuideModal.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /mainCategory === 'rules'/);
  assert.doesNotMatch(source, /setMainCategory\('rules'\)/);
  assert.match(source, /scalpingSubcategory === 'classic'/);
  assert.match(source, /setScalpingSubcategory\('classic'\)/);
  assert.match(source, /<ClassicRulesGuide \/>/);
  assert.match(source, /<KotapychGuide \/>/);
  assert.match(source, /<OpenInterestGuide \/>/);
  assert.match(source, /GUIDE_ITEMS\.map/);
});

test('all ten PDF pages are covered by six meaningful Ukrainian Classic sections', () => {
  assert.deepEqual(CLASSIC_RULE_GROUPS.map(group => group.id), [
    'overview','levels','ranges','cascades','singleHigh','trendlines',
  ]);
  assert.deepEqual(CLASSIC_RULE_GROUPS.flatMap(group => group.sourcePages)
    .filter((value, index, array) => array.indexOf(value) === index).sort((a,b) => a-b),
    [2,3,4,5,6,7,8,9,10]);
  for (const group of CLASSIC_RULE_GROUPS) {
    assert.ok(group.items.length >= 5, group.id + ' should contain detailed rules');
    assert.ok(group.items.every(item => item.length >= 55), group.id + ' has a truncated explanation');
    assert.ok(group.title && group.short);
  }
  assert.ok(CLASSIC_GLOSSARY.length >= 8);
});

test('Classic rules retain the author-specific trading thresholds without inventing units', () => {
  assert.match(CLASSIC_GENERAL_RULES.items.join(' '), /3–4 години/);
  assert.match(CLASSIC_GENERAL_RULES.items.join(' '), /від 10 хвилин/);
  assert.match(CLASSIC_GENERAL_RULES.items.join(' '), /половинним обсягом/);
  assert.match(CLASSIC_LEVEL_RULES.items.join(' '), /від 25 хвилин/);
  assert.match(CLASSIC_LEVEL_RULES.items.join(' '), /3%/);
  assert.match(CLASSIC_LEVEL_RULES.items.join(' '), /0,35/);
  assert.match(CLASSIC_LEVEL_RULES.items.join(' '), /одиницю виміру/);
  assert.match(CLASSIC_LEVEL_RULES.items.join(' '), /0,3/);
  assert.match(CLASSIC_LEVEL_RULES.items.join(' '), /\+1%/);
  assert.match(CLASSIC_RANGE_RULES.items.join(' '), /25 хвилин, 20 хвилин і 6 хвилин/);
  assert.match(CLASSIC_RANGE_RULES.items.join(' '), /10%, 7% та 6%/);
  assert.match(CLASSIC_CASCADE_RULES.items.join(' '), /першого лоя/);
  assert.match(CLASSIC_SINGLE_HIGH_RULES.items.join(' '), /15s/);
  assert.match(CLASSIC_TRENDLINE_RULES.items.join(' '), /до 20 хвилин/);
  assert.match(CLASSIC_TRENDLINE_RULES.items.join(' '), /5m/);
});

test('Classic rules has six working section tabs and responsive redrawn candle diagrams', () => {
  const html = renderToString(React.createElement(ClassicRulesGuide));
  for (const name of ['Загальні правила', 'Рівні', 'Проторговки', 'Каскади', 'Одиночний хай', 'Нахилка в рівень']) {
    assert.ok(html.includes(name), name + ' missing from section navigation');
  }
  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /умовна схема/);
  const kinds: ClassicChartKind[] = ['range25','range20','range6','level','cascade','wideCascade','singleHigh','trendline'];
  for (const kind of kinds) {
    const chart = renderToString(React.createElement(ClassicPriceDiagram,{kind}));
    assert.match(chart, /role="img"/);
    assert.match(chart, /<svg/);
    assert.match(chart, /<rect/);
    assert.match(chart, /<line/);
    assert.match(chart, /скриншот із PDF/);
  }
});


test('encyclopedia enlarges all text only in its wide-screen dialog', () => {
  const modalSource = readFileSync(new URL('../src/components/FormationGuideModal.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const html = renderToString(React.createElement(FormationGuideModal, { isOpen: true, onClose: () => {} }));

  assert.match(html, /class="encyclopedia-modal /);
  assert.match(modalSource, /<KotapychGuide \/>|<ClassicRulesGuide \/>|<OpenInterestGuide \/>/);
  const rules = css.slice(css.lastIndexOf('Encyclopedia typography:'));
  assert.match(rules, /@media \(min-width: 1280px\)/);
  for (const size of ['xs', 'sm', 'base', 'lg', 'xl']) {
    assert.match(rules, new RegExp('--text-' + size + ':'));
    assert.match(rules, new RegExp('--text-' + size + '--line-height:'));
  }
  assert.match(rules, /\.encyclopedia-modal \.text-\\\[10px\\\]/);
  assert.match(rules, /\.encyclopedia-modal \.text-\\\[11px\\\]/);
  assert.doesNotMatch(css.slice(0, css.lastIndexOf('Encyclopedia typography:')), /--text-xs:\s*0\.95rem/);
});
