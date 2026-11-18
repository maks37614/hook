import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { locales, supportedLanguages, translatePhrase } from '../src/locales';
import { profileContinuationRows, profileContinuationPhrases } from '../src/locales/profileContinuation20261115';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('new profile notification and guide phrases exist in all four languages', () => {
  assert.deepEqual([...supportedLanguages].sort(), ['en', 'pl', 'ru', 'uk']);
  assert.ok(profileContinuationRows.length >= 18);
  assert.equal(new Set(profileContinuationRows.map(row => row[0])).size, profileContinuationRows.length);
  for (const row of profileContinuationRows) {
    for (const [i, lang] of (['uk', 'en', 'ru', 'pl'] as const).entries()) {
      assert.ok(row[i].trim(), lang + ' missing ' + row[0]);
      assert.equal(profileContinuationPhrases[lang][row[0]], row[i]);
      assert.equal(locales[lang].phrases[row[0]], row[i]);
      assert.equal(translatePhrase(lang, row[0]), row[i]);
    }
  }
  assert.equal(translatePhrase('en', 'Назва монети'), 'Coin name');
  assert.equal(translatePhrase('pl', 'Прослухати'), 'Odsłuchaj');
  assert.equal(translatePhrase('ru', 'Зараховано дотиків:'), 'Засчитано касаний:');
});

test('notification controls translate all previously untranslated buttons and labels', () => {
  const notification = source('../src/components/profile/ProfileNotificationSettings.tsx');
  const labels = [
    'Назва монети', 'Зміна ціни (%)', 'Ринок (імпульси)', 'Тривалість вікна',
    'Зберегти монету й увімкнути імпульси', 'Прослухати', 'Видалити вибрану',
    'Вимкнути всі сповіщення сайту', 'Сповіщення браузера, якщо вкладка згорнута',
  ];
  for (const label of labels) {
    assert.ok(notification.includes("translatePhrase(language, '" + label + "')"),
      'Notification label does not use current language: ' + label);
  }
});

test('terminal guide and TP/SL dynamic labels translate without changing terminal or chart data', () => {
  const linking = source('../src/components/profile/ProfileTerminalLinkingSettings.tsx');
  assert.match(linking, /translatePhrase\(language, label\)/);
  assert.match(linking, /translatePhrase\(language, 'Увімкнути лінковку'\)/);
  assert.match(linking, /translatePhrase\(language, 'Як підключити'\)/);
  assert.match(linking, /translatePhrase\(language, 'до h00k.top'\)/);
  assert.match(linking, /selected === 'tiger' \? 'Tiger' : 'MetaScalp'/);

  const tpsl = source('../src/components/TpSlConstructorModal.tsx');
  assert.match(tpsl, /translatePhrase\(language, 'Зараховано дотиків:'\)/);
  assert.match(tpsl, /\{touchCount\} \/ \{needed\}/);
});

test('profile preset names remain verbatim and price formatting uses selected locale', () => {
  const screener = source('../src/components/profile/ProfileScreenerSearchSettings.tsx');
  assert.match(screener, /const numberLocale = \{ uk: 'uk-UA', en: 'en-US', ru: 'ru-RU', pl: 'pl-PL' \}\[language\]/);
  assert.match(screener, /new Intl\.NumberFormat\(numberLocale, \{ notation: 'compact'/);
  assert.match(screener, /<div data-no-translate className="break-words text-sm font-semibold text-slate-100">\{item\.name\}<\/div>/);
  // Only display strings change; preset ids, saved names and comparison logic are not localized.
  assert.match(screener, /const name = presetName\.trim\(\)/);
});
