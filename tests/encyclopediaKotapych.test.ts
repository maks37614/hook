import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { FormationGuideModal } from '../src/components/FormationGuideModal';
import { KotapychGuide } from '../src/components/encyclopedia/KotapychGuide';
import { OpenInterestGuide, OI_PRICE_CASES, OI_MARKET_SCENARIOS } from '../src/components/encyclopedia/OpenInterestGuide';
import { KOTAPYCH_SETUPS, KOTAPYCH_TOPICS } from '../src/components/encyclopedia/kotapychGuideData';
import { KOTAPYCH_SOURCE_PAGES } from '../src/components/encyclopedia/kotapychArchive';

test('main encyclopedia exposes both general categories and the Kotapych subcategory', () => {
  const html = renderToString(React.createElement(FormationGuideModal, { isOpen: true, onClose: () => {} }));
  assert.match(html, /Скальпінг/);
  assert.match(html, /Формації-Патерни/);
  assert.match(html, /Котапич/);
  assert.match(html, /Індикатори/);
});

test('Kotapych has exactly four distinct setups and all structured detail sections', () => {
  assert.deepEqual(KOTAPYCH_SETUPS.map(item => item.id), ['setup1', 'setup2', 'setup3', 'setup4']);
  assert.deepEqual(KOTAPYCH_SETUPS.map(item => item.direction), ['LONG', 'SHORT', 'SHORT', 'LONG']);
  for (const setup of KOTAPYCH_SETUPS) {
    for (const key of ['context', 'recognition', 'entry', 'management', 'stop', 'targets', 'cancellation'] as const) {
      assert.ok(setup[key].length > 0, setup.id + ' should describe ' + key);
    }
    assert.ok(setup.source.includes('docx'));
  }
  assert.ok(KOTAPYCH_TOPICS.length >= 5);
});

test('both complete source document transcripts are indexed and remain accessible', () => {
  const large = KOTAPYCH_SOURCE_PAGES.filter(page => page.source === 'Копатыч.docx');
  const short = KOTAPYCH_SOURCE_PAGES.filter(page => page.source === '4 set.docx');
  assert.equal(large.length, 79);
  assert.equal(short.length, 8);
  assert.deepEqual(large.map(x => x.page), Array.from({ length: 79 }, (_, i) => i + 1));
  assert.deepEqual(short.map(x => x.page), Array.from({ length: 8 }, (_, i) => i + 1));
  assert.ok(large.reduce((length, x) => length + x.text.length, 0) > 70000);
  assert.ok(short.reduce((length, x) => length + x.text.length, 0) > 5000);
  assert.ok(short.some(x => x.text.includes('Сетап №1:')));
  assert.ok(short.some(x => x.text.includes('Сетап №2:')));
  assert.ok(short.some(x => x.text.includes('Сетап №3:')));
  assert.ok(short.some(x => x.text.includes('Сетап №4:')));
});

test('Kotapych guide renders structured Ukrainian navigation', () => {
  const html = renderToString(React.createElement(KotapychGuide));
  for (const name of ['Сетап №1', 'Сетап №2', 'Сетап №3', 'Сетап №4', 'Поглиблений аналіз']) {
    assert.ok(html.includes(name), name + ' tab missing');
  }
  assert.match(html, /ЛОНГ/);
  assert.match(html, /ШОРТ/);
  assert.match(html, /Не є індивідуальною інвестиційною рекомендацією/);
});

test('all key concepts from both documents are covered before hiding raw-notes navigation', () => {
  const topicIds = KOTAPYCH_TOPICS.map(topic => topic.id);
  const required = [
    'market-context', 'bases-levels', 'base-secondary', 'liquidity-sweeps',
    'retest-rounding', 'setup1-variants', 'setup2-variants', 'setup3-pump',
    'setup4-pit', 'tape-orderbook', 'volume-clusters', 'execution-sizing',
    'stops-targets', 'chop-avoidance', 'transitions', 'funding-spot-futures',
    'instrument-selection', 'daily-risk', 'journal-psychology',
  ];
  assert.deepEqual(topicIds, required, 'important concepts must remain accessible');
  for (const topic of KOTAPYCH_TOPICS) {
    assert.ok(topic.points.length >= 6, topic.id + ' must include substantive detail');
    assert.ok(topic.notePages.length >= 5, topic.id + ' must cite original note pages');
    assert.ok(topic.points.every(text => text.trim().length >= 60), topic.id + ' has an incomplete explanation');
  }
  const markup = renderToString(React.createElement(KotapychGuide));
  assert.doesNotMatch(markup, /Повні нотатки|Повний текст наданих матеріалів|Оригінал/);
  assert.ok(markup.includes('Поглиблений аналіз'));
});

test('raw document transcripts are retained in the repository for future verification', () => {
  const count = KOTAPYCH_SOURCE_PAGES.length;
  assert.equal(count, 87);
});


test('Kotapych source notes are not rendered as footers on any setup or topic', () => {
  const ui = readFileSync(new URL('../src/components/encyclopedia/KotapychGuide.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /Джерело:\s*\{setup\.source\}/);
  assert.doesNotMatch(ui, /Джерело теми:/);
  assert.doesNotMatch(ui, /topic\.notePages\.join/);
  // Preserve the underlying content and editorial provenance as data, not on-screen footers.
  assert.equal(KOTAPYCH_SETUPS.length, 4);
  assert.equal(KOTAPYCH_TOPICS.length, 19);
});

test('new corrected Kotapych document is the archived source for all 79 note pages', () => {
  const notes = KOTAPYCH_SOURCE_PAGES.filter(item => item.source === 'Копатыч.docx');
  assert.equal(notes.length, 79);
  assert.match(notes[7].text, /поглощение шортовой\s+активности/i);
  assert.match(notes[21].text, /не делает перехая/i);
  assert.match(notes[47].text, /1,5-2%/);
  assert.match(notes[77].text, /25-30%/);
  assert.ok(!notes.some(item => /погощение|адикчающие/i.test(item.text)), 'obsolete transcription typos must be replaced');
});

test('four corrected-source clarifications and the ambiguous 25-30% volume rule remain visible', () => {
  const setup1 = KOTAPYCH_SETUPS.find(item => item.id === 'setup1');
  const setup2 = KOTAPYCH_SETUPS.find(item => item.id === 'setup2');
  assert.ok(setup1 && setup2);
  assert.match(setup1.entry.join(' '), /Ранній варіант входу/);
  assert.match(setup1.entry.join(' '), /Підтверджений варіант/);
  assert.match(setup1.stop.join(' '), /1,5–2%/);
  assert.match(setup1.context.join(' '), /глобальний шортовий сценарій/);
  assert.match(setup2.summary, /без нового максимуму/);
  assert.match(setup2.entry.join(' '), /прокол не є обов’язковою умовою/);
  const byId = Object.fromEntries(KOTAPYCH_TOPICS.map(topic => [topic.id, topic]));
  assert.match(byId['market-context'].points.join(' '), /входу в шорт/);
  assert.match(byId['execution-sizing'].points.join(' '), /1,5–2%/);
  assert.match(byId['base-secondary'].points.join(' '), /неоднозначні приклади/);
  assert.match(byId['base-secondary'].points.join(' '), /не надійний числовий поріг/);
  assert.equal(KOTAPYCH_TOPICS.length, 19);
});

test('encyclopedia includes the Indicators > Open Interest category without affecting existing categories', () => {
  const component = readFileSync(new URL('../src/components/FormationGuideModal.tsx', import.meta.url), 'utf8');
  assert.match(component, /mainCategory === 'indicators'/);
  assert.match(component, /Open Interest \(OI\)/);
  assert.match(component, /<OpenInterestGuide \/>/);
  assert.match(component, /<KotapychGuide \/>/);
  assert.match(component, /GUIDE_ITEMS\.map/);
});

test('Open Interest guide contains all seven Ukrainian sections and essential limitations', () => {
  const html = renderToString(React.createElement(OpenInterestGuide));
  for (const title of [
    'Основи: як читати OI разом із ціною',
    'Що OI показує насправді',
    'Як застосовують OI в криптотрейдингу',
    'Поширена помилка',
    'Практика для скальпінгу',
    'Де дивитися Open Interest',
    'Коротка формула',
  ]) {
    assert.ok(html.includes(title), title + ' must be present');
  }
  assert.match(html, /відкритих контрактів/);
  assert.match(html, /OI — це контекст, а не точка входу/);
  assert.match(html, /TradingView/);
  assert.match(html, /Coinglass/);
  assert.match(html, /CryptoQuant/);
  assert.match(html, /funding rate/);
  assert.match(html, /ліквідаціями/);
});

test('Open Interest covers four price/OI combinations and three practical market scenarios', () => {
  assert.deepEqual(OI_PRICE_CASES.map(item => [item.price, item.oi]), [
    ['up', 'up'], ['up', 'down'], ['down', 'up'], ['down', 'down'],
  ]);
  assert.deepEqual(OI_MARKET_SCENARIOS.map(item => item.id), ['accumulation','trap','flush']);
  assert.ok(OI_PRICE_CASES.every(item => item.interpretation.length >= 2 && item.practice.length >= 50));
  assert.ok(OI_MARKET_SCENARIOS.every(item => item.conditions.length >= 2 && item.action.length >= 40));
});
