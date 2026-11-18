import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { supportedLanguages, translatePhrase } from '../src/locales';
import { formationControlRows } from '../src/locales/formationControls20261115';
import { localizeFormationGuideBias } from '../src/locales/formationGuideTranslations';

const pages = [
  'EarlyFormationCard.tsx',
  'EarlyFormationDetailsModal.tsx',
  'FormationCard.tsx',
  'FormationDetailsModal.tsx',
] as const;

const read = (name: string) =>
  readFileSync(new URL('../src/components/' + name, import.meta.url), 'utf8');

test('all surveillance and monitor controls have four real language variants', () => {
  assert.deepEqual([...supportedLanguages], ['uk', 'en', 'ru', 'pl']);
  assert.equal(formationControlRows.length, 4);
  for (const row of formationControlRows) {
    assert.equal(row.length, 4);
    for (const [index, language] of supportedLanguages.entries()) {
      assert.equal(translatePhrase(language, row[0]), row[index],
        'monitoring control must follow selected language: ' + row[0]);
      if (language !== 'uk') assert.notEqual(row[index], row[0]);
    }
  }
});

test('early W/M and confirmed formation badges show localized direction while keeping their semantic state', () => {
  const expected = {
    uk: ['ЛОНГ', 'ШОРТ', 'НЕЙТРАЛЬНО'],
    en: ['LONG', 'SHORT', 'NEUTRAL'],
    ru: ['ЛОНГ', 'ШОРТ', 'НЕЙТРАЛЬНО'],
    pl: ['LONG', 'SHORT', 'NEUTRALNY'],
  } as const;
  for (const lang of supportedLanguages) {
    for (const [index, bias] of (['bullish', 'bearish', 'neutral'] as const).entries()) {
      assert.equal(localizeFormationGuideBias(lang, bias), expected[lang][index]);
    }
  }
  assert.match(read('EarlyFormationCard.tsx'), /localizeFormationGuideBias\(language, isBullish/);
  assert.match(read('EarlyFormationDetailsModal.tsx'), /localizeFormationGuideBias\(language, candidate\.bias\)/);
  assert.match(read('FormationCard.tsx'), /localizeFormationGuideBias\(language, isBullish/);
  assert.match(read('FormationDetailsModal.tsx'), /localizeFormationGuideBias\(language, isBullish/);
});

test('formation quick charts, details, tooltips and accessible labels do not hardcode Ukrainian text', () => {
  for (const path of pages) {
    const source = read(path);
    assert.doesNotMatch(source, /(?:title|aria-label|placeholder)="[^"]*[А-Яа-яІіЇїЄєҐґ][^"]*"/,
      path + ' still hardcodes an untranslated attribute');
    assert.doesNotMatch(source, />[^<>{}\n]*[А-Яа-яІіЇїЄєҐґ][^<>{}\n]*</,
      path + ' still hardcodes a visible Ukrainian text node');
  }
  const early = read('EarlyFormationCard.tsx');
  assert.match(early, /tr\("Швидкий перегляд графіка"\)/);
  assert.match(early, /tr\("Завантаження свічок…"\)/);
  assert.match(early, /tr\("Відкрити графік на весь екран"\)/);
  assert.match(early, /tr\(isMonitored \? 'Зняти монету з нагляду'/);
  assert.match(early, /tr\('Взяти монету на 24\/7 нагляд'\)/);
  const details = read('FormationDetailsModal.tsx');
  assert.match(details, /tr\("Статус патерну"\)/);
  assert.match(details, /tr\('Котирування:'\)/);
  assert.match(details, /tr\(isReferencePreview \? 'Оцінка не проводилася' : 'Якість сетапу'\)/);
  assert.match(details, /tr\("Завантаження свічок з біржі…"\)/);
  const chart = read('FormationCard.tsx');
  assert.match(chart, /tr\(isConfluenceExpanded \? 'Сховати' : 'Показати'\)/);
  assert.match(chart, /tr\("OI сам не визначає напрямок позицій/);
});
