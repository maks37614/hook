import test from 'node:test';
import assert from 'node:assert/strict';
import { audit20261115EncyclopediaRows } from '../src/locales/audit20261115Encyclopedia';
import { classicMoreRows } from '../src/locales/classicRulesMore20261115';
import { encyclopediaMoreRows } from '../src/locales/encyclopediaMore20261115';
import { translatePhrase } from '../src/locales';
import { kotapychDetailedRows } from '../src/locales/kotapychDetails20261115';
import { kotapychAdvancedTopicRows } from '../src/locales/kotapychAdvancedTopics20261115';
import { openInterestUiRows } from '../src/locales/openInterestUiMore20261115';
import { encyclopediaModalUiRows } from '../src/locales/encyclopediaModalUi20261115';

const languages = ['uk', 'en', 'ru', 'pl'] as const;
const canonical = new Map<string, readonly string[]>(
  audit20261115EncyclopediaRows.map(row => [row[0], row]),
);

test('shared Encyclopedia source phrases have exactly one canonical translation in four languages', () => {
  let overlapCount = 0;
  for (const rows of [classicMoreRows, encyclopediaMoreRows]) {
    for (const row of rows) {
      const reviewed = canonical.get(row[0]);
      if (!reviewed) continue;
      overlapCount++;
      assert.deepEqual([...row], [...reviewed], 'conflicting translations for ' + row[0]);
      for (const [index, language] of languages.entries()) {
        assert.equal(translatePhrase(language, row[0]), reviewed[index],
          'runtime differs from reviewed wording: ' + language + ' ' + row[0]);
      }
    }
  }
  assert.ok(overlapCount >= 19, 'expected known Encyclopedia glossary overlaps');
});

test('source titles and liquidity-sweep terminology remain faithful to the original', () => {
  const rulesTitle = 'Структурований навчальний регламент за 10-сторінковим документом «Свод правил»: відбір сетапів, рівні, проторговки, каскади, одиночний хай і похилі лінії.';
  const liquidity = 'Основна ідея: шукати підтверджену реакцію ринку на межі проторговки, оцінювати швидкість руху, обсяги та поведінку покупців і продавців. Прокол ліквідності — лише частина контексту.';
  assert.match(translatePhrase('en', rulesTitle), /Свод правил/);
  assert.match(translatePhrase('ru', liquidity), /Снятие ликвидности/);
  assert.match(translatePhrase('pl', liquidity), /Zebranie płynności/);
  const note = 'значення «0,35» та «0,3» з PDF залишені дослівно за змістом, але їхні одиниці автор не вказав. Без уточнення їх не можна використовувати як готовий відсоток стопа.';
  for (const language of languages) {
    const translation = translatePhrase(language, note);
    assert.match(translation, /0,35/);
    assert.match(translation, /0,3/);
  }
});


test('English and Polish Encyclopedia catalogs contain no untranslated Cyrillic prose', () => {
  const catalogs = [
    audit20261115EncyclopediaRows,
    classicMoreRows,
    encyclopediaMoreRows,
    kotapychDetailedRows,
    kotapychAdvancedTopicRows,
    openInterestUiRows,
    encyclopediaModalUiRows,
  ];
  let count = 0;
  for (const catalog of catalogs) {
    for (const row of catalog) {
      assert.equal(row.length, 4, 'missing one of four languages');
      for (const index of [1, 3] as const) {
        // The Russian original document title is cited verbatim, not untranslated prose.
        const withoutOriginalTitle = row[index].replaceAll('Свод правил', '');
        assert.doesNotMatch(withoutOriginalTitle, /[А-Яа-яІіЇїЄєҐґ]/,
          'untranslated Cyrillic text in ' + (index === 1 ? 'English' : 'Polish') +
          ' for source: ' + row[0]);
      }
      count++;
    }
  }
  assert.ok(count >= 460, 'expected the complete four-language Encyclopedia catalog');
});
