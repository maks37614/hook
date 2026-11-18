import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { supportedLanguages, translatePhrase } from '../src/locales';
import { formationRuntimeRows } from '../src/locales/formationRuntime20261115';
import { localizeFormationRuntime } from '../src/utils/localizeFormationRuntime';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('all actual regular-scanner pattern names and dynamic labels have four-language translations', () => {
  const keys = new Set<string>();
  for (const row of formationRuntimeRows) {
    assert.equal(row.length, 5);
    assert.ok(!keys.has(row[0]), 'duplicate runtime phrase ' + row[0]);
    keys.add(row[0]);
    for (const [index, language] of supportedLanguages.entries()) {
      assert.ok(row[index + 1]?.trim(), language + ': missing ' + row[0]);
      assert.equal(translatePhrase(language, row[0]), row[index + 1], language + ': ' + row[0]);
    }
  }
  const scanner = read('../src/utils/patternRecognition.ts');
  for (const source of [
    'Бичачий прапор (Флагшток)', 'Ведмежий прапор',
    'Ретест пробитого рівня', 'Пробій ключового опору',
    'Молот / Бичачий пін-бар', 'Падаюча зірка (Пін-бар)',
    'Бичаче поглинання', 'Ведмеже поглинання',
  ]) {
    assert.ok(scanner.includes("'" + source + "'"), 'not a real scanner name: ' + source);
    assert.ok(keys.has(source), 'missing named formation ' + source);
    assert.doesNotMatch(localizeFormationRuntime('en', source), /[А-Яа-яІіЇїЄєҐґ]/);
    assert.doesNotMatch(localizeFormationRuntime('pl', source), /[А-Яа-яІіЇїЄєҐґ]/);
  }
});

test('photo example: a bull flag uses the selected language throughout the status, name and flow', () => {
  const name = 'Бичачий прапор (Флагшток)';
  const status = 'Вихід із прапора вгору · підхід до екстремуму · очікування підтвердження';
  const reason = 'Обсяг свічки пробою не підтверджений';
  const flow = 'Потік: 1/3 факторів підтримують';
  const expected = {
    uk: ['Бичачий прапор (Флагшток)', 'Вихід із прапора вгору', 'Обсяг свічки пробою не підтверджений'],
    en: ['Bull flag (flagpole)', 'Bull flag breakout', 'Breakout candle volume is unconfirmed'],
    ru: ['Бычий флаг (флагшток)', 'Выход из флага вверх', 'Объём свечи пробоя не подтверждён'],
    pl: ['Flaga byka (maszt)', 'Wybicie z flagi w górę', 'Wolumen świecy wybicia jest niepotwierdzony'],
  } as const;
  for (const language of supportedLanguages) {
    assert.equal(localizeFormationRuntime(language, name), expected[language][0]);
    assert.ok(localizeFormationRuntime(language, status).startsWith(expected[language][1] + ' · '));
    assert.equal(localizeFormationRuntime(language, reason), expected[language][2]);
    assert.ok(localizeFormationRuntime(language, flow).includes('1/3'));
  }
  assert.equal(localizeFormationRuntime('uk', 'UPPER_EXTREME'), 'Верхній екстремум');
  assert.equal(localizeFormationRuntime('uk', 'APPROACHING'), 'Наближення');
  assert.equal(localizeFormationRuntime('en', 'Тиск продавців · підхід до екстремуму · очікування підтвердження'),
    'Selling pressure · approaching an extreme · awaiting confirmation');
});

test('numeric confluence notes are translated but preserve actual indicator values and units', () => {
  const cases = [
    'R:R 1.33 нижче мінімуму 2.0',
    'Якість геометрії/формації: 72/100',
    'Найближчий ключовий рівень: 1.42%',
    'Відстань до рівня опору / шиї: 0.46%',
    'Відстань до рівня підтримки / шиї: 0.76%',
    '3 підтверджених тестів екстремуму',
    'RVOL 1.14x · без підтвердженого пробою',
    'ATR/price 2.40%',
    'data=OK, candles=LOW, lookAhead=SAFE, closed=FAIL',
    'UPPER_EXTREME; відстань 0.46%; підхід APPROACHING; сила 76/100',
    'Відстань до екстремуму 0.23% · сила підходу 74/100 · тести 3',
    'Відстань до рівня пробою: 0.66 ATR',
    'Дельта +4.50% за останню закриту свічку',
    'CVD20 -3.03% за 20 закритих свічок',
  ];
  const markers = ['1.33', '72/100', '1.42%', '0.46%', '0.76%', '3', '1.14x', '2.40%', 'SAFE', '0.46%', '0.23%', '0.66 ATR', '+4.50%', '-3.03%'];
  for (const language of supportedLanguages) {
    cases.forEach((source, index) => {
      const translated = localizeFormationRuntime(language, source);
      assert.ok(translated.includes(markers[index]), language + ': lost metric for ' + source);
      if (language === 'en' || language === 'pl') {
        assert.doesNotMatch(translated, /[А-Яа-яІіЇїЄєҐґ]/, language + ': still Ukrainian: ' + source);
      }
    });
    assert.equal(localizeFormationRuntime(language, 'R:R 1.33 < 2.0'), 'R:R 1.33 < 2.0');
    assert.equal(localizeFormationRuntime(language, 'Unknown upstream description'), 'Unknown upstream description');
  }
});

test('regular cards and their detailed views use the runtime translator without changing scanner rules', () => {
  const card = read('../src/components/FormationCard.tsx');
  const details = read('../src/components/FormationDetailsModal.tsx');
  const catalog = read('../src/locales/index.ts');
  assert.match(catalog, /\.\.\.formationRuntimePhrases\[language\]/);
  for (const source of [card, details]) {
    assert.match(source, /const tr = \(source: string\) => localizeFormationRuntime\(language, source\)/);
  }
  assert.match(card, /trStatus\(formation\.statusLabel\)/);
  assert.match(card, /rejectionReasons\.slice\(0, 2\)\)\.map\(tr\)/);
  assert.match(card, /tr\(formation\.roundNumberContext\.densityConfirmed \? 'КРУГЛИЙ \+ ЩІЛЬНІСТЬ' : 'КРУГЛИЙ РІВЕНЬ'\)/);
  assert.match(card, /coin\.marketType === 'futures' \? "Ф'ючерси" : 'Спот'/);
  assert.match(card, /formation\.validation\.confluence\.total/);
  assert.match(details, /trStatus\(formation\.statusLabel\)/);
});
