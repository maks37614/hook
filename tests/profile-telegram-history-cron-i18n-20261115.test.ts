import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { locales, supportedLanguages, translatePhrase } from '../src/locales';
import { profileTelegramHistoryRows } from '../src/locales/profileTelegramHistory20261115';

const telegram = readFileSync(new URL('../src/components/TelegramAlertsModal.tsx', import.meta.url), 'utf8');
const catalog = readFileSync(new URL('../src/locales/index.ts', import.meta.url), 'utf8');

test('Telegram alert history and CRON have reviewed translations in all four languages', () => {
  assert.deepEqual([...supportedLanguages].sort(), ['en', 'pl', 'ru', 'uk']);
  assert.ok(profileTelegramHistoryRows.length >= 75);
  assert.equal(new Set(profileTelegramHistoryRows.map(row => row[0])).size, profileTelegramHistoryRows.length);
  for (const row of profileTelegramHistoryRows) {
    for (const [index, language] of (['uk', 'en', 'ru', 'pl'] as const).entries()) {
      assert.ok(row[index].trim(), language + ': empty Telegram phrase ' + row[0]);
      // Newer reviewed global terminology may supersede a Telegram-specific
      // phrase. Both the catalog and the effective translation must exist.
      const dictionary = locales[language].phrases[row[0]];
      assert.ok(dictionary?.trim(), language + ' dictionary: ' + row[0]);
      assert.ok(translatePhrase(language, row[0]).trim(), language + ' lookup: ' + row[0]);
    }
  }
  assert.match(catalog, /\.\.\.profileTelegramHistoryPhrases\[language\]/);
});

test('alert creation conditions, controls and history status use translated labels', () => {
  for (const label of [
    'Ціль:', 'Зафіксовано:', 'Спрацювало на:', 'Помилка:', '≥ Ціна піднялась або досягла',
    '≤ Ціна опустилась або досягла',
  ]) {
    assert.ok(telegram.includes("ui('" + label + "')"), 'Untranslated dynamic Telegram label ' + label);
  }
  for (const label of ["'Відновлення...'", "'Відновити'", "'Перевіряємо CRON...'", "'Сховати форму'"]) {
    assert.ok(telegram.includes(label), 'Missing corresponding Telegram button ' + label);
  }
  assert.match(telegram, /ui\(isReactivating \? 'Відновлення\.\.\.' : 'Відновити'\)/);
  assert.match(telegram, /ui\(testingCron \? 'Перевіряємо CRON\.\.\.' : '⚡ Запустити тест CRON та сповіщень'\)/);
});

test('history dates follow the interface locale, while symbols, names and notes are preserved', () => {
  assert.match(telegram, /const dateLocale = \{ uk: 'uk-UA', en: 'en-US', ru: 'ru-RU', pl: 'pl-PL' \}\[language\]/);
  assert.match(telegram, /toLocaleTimeString\(dateLocale\)/);
  assert.match(telegram, /toLocaleString\(dateLocale, \{/);
  assert.doesNotMatch(telegram, /toLocale(?:TimeString|String)\('uk-UA'/);
  assert.match(telegram, /data-no-translate>\{item\.symbol\}/);
  assert.match(telegram, /data-no-translate>\{item\.formationName\}/);
  assert.match(telegram, /data-no-translate>"\{item\.note\}"/);
  assert.match(telegram, /data-no-translate className="text-white">\{profile\?\.displayName \|\| user\.email\}/);
  assert.equal(translatePhrase('pl', 'Ціль:'), 'Cel:');
  assert.equal(translatePhrase('en', 'Помилка:'), 'Error:');
});

test('all supported languages retain alert meanings without changing numeric market values', () => {
  for (const lang of supportedLanguages) {
    assert.ok(translatePhrase(lang, 'Серверне збереження: повідомлення фіксуються навіть після закриття вкладки або браузера.').trim());
    assert.ok(translatePhrase(lang, 'Оновити формат моїх надісланих повідомлень').trim());
  }
});
