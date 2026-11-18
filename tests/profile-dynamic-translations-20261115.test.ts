import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { locales, supportedLanguages, translatePhrase } from '../src/locales';
import { profileDynamicRows } from '../src/locales/profileDynamic20261115';
import { SCREENER_SEARCH_SORT_OPTIONS } from '../src/utils/screenerSearchSettings';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('dynamic profile labels and error messages have four complete translations', () => {
  assert.deepEqual([...supportedLanguages].sort(), ['en', 'pl', 'ru', 'uk']);
  assert.ok(profileDynamicRows.length >= 30);
  assert.equal(new Set(profileDynamicRows.map(row => row[0])).size, profileDynamicRows.length);
  for (const row of profileDynamicRows) {
    for (const [index, language] of (['uk', 'en', 'ru', 'pl'] as const).entries()) {
      assert.ok(row[index].trim(), language + ': blank translation for ' + row[0]);
      assert.equal(locales[language].phrases[row[0]], row[index]);
      assert.equal(translatePhrase(language, row[0]), row[index]);
    }
  }
  assert.equal(translatePhrase('pl', 'Мої пресети'), 'Moje presety');
  assert.equal(translatePhrase('ru', 'Видалити пресет'), 'Удалить пресет');
  assert.equal(translatePhrase('en', 'Тінь свічки'), 'Candle wick');
  assert.equal(translatePhrase('uk', 'активних'), 'активних');
});

test('search preset and sorting options render translated labels without changing stored values', () => {
  const search = source('../src/components/profile/ProfileScreenerSearchSettings.tsx');
  assert.match(search, /translatePhrase\(language, option\.label\)/);
  assert.match(search, /translatePhrase\(language, error\)/);
  assert.match(search, /translatePhrase\(language, message\)/);
  assert.match(search, /translatePhrase\(language, 'Мої пресети'\)/);
  assert.match(search, /translatePhrase\(language, 'Видалити пресет'\) \+ ' ' \+ item\.name/);
  assert.match(search, /\{item\.name\}/);
  for (const option of SCREENER_SEARCH_SORT_OPTIONS) {
    for (const language of supportedLanguages) {
      assert.notEqual(translatePhrase(language, option.label), '', 'Missing sorting label ' + option.label);
    }
  }
  assert.equal(translatePhrase('en', 'Зміна ціни 24г'), '24h price change');
  assert.equal(translatePhrase('pl', 'Відстань до максимуму'), 'Odległość od maksimum');
});

test('TP/SL price inputs, errors and alerts follow the selected profile language', () => {
  const tpsl = source('../src/components/TpSlConstructorModal.tsx');
  assert.match(tpsl, /translatePhrase\(language, label\)/);
  assert.match(tpsl, /aria-label=\{translatePhrase\(language, label\)\}/);
  assert.match(tpsl, /translatePhrase\(language, fetchError\)/);
  assert.match(tpsl, /translatePhrase\(language, error\)/);
  assert.match(tpsl, /translatePhrase\(language, 'Тінь свічки'\)/);

  const notify = source('../src/components/profile/ProfileNotificationSettings.tsx');
  for (const expr of ['soundError', 'formError', 'message', 'error']) {
    assert.ok(notify.includes('translatePhrase(language, ' + expr + ')'), expr);
  }
  assert.match(notify, /translatePhrase\(language, 'Стандартний звук h00k'\)/);
  assert.match(notify, /translatePhrase\(language, 'Раніше збережені мелодії'\)/);
  const chart = source('../src/components/profile/ProfileHookChartSettings.tsx');
  assert.match(chart, /translatePhrase\(siteLanguage, error\)/);
});

test('profile account and terminal linking translate dynamic status, not user-supplied names', () => {
  const profile = source('../src/components/UserProfileModal.tsx');
  assert.match(profile, /translatePhrase\(language, errorMessage\)/);
  assert.match(profile, /translatePhrase\(language, sessionsError\)/);
  assert.match(profile, /translatePhrase\(language, 'активних'\)/);
  assert.match(profile, /translatePhrase\(language, 'Закрити профіль'\)/);
  const linking = source('../src/components/profile/ProfileTerminalLinkingSettings.tsx');
  assert.match(linking, /translatePhrase\(language, message\.text\)/);
  const index = source('../src/locales/index.ts');
  assert.match(index, /\.\.\.profileLanguagePhrases\[language\]/);
  assert.match(index, /\.\.\.profileDynamicPhrases\[language\]/);
  assert.equal(translatePhrase('pl', 'A completely unknown user-defined preset name'),
    'A completely unknown user-defined preset name');
});
