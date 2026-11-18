import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translatePhrase } from '../src/locales';

const modal = readFileSync(new URL('../src/components/TelegramAlertsModal.tsx', import.meta.url), 'utf8');
const visible = modal.slice(modal.indexOf('  return (\n'));

test('Telegram alert creation, history and CRON UI use the selected site language', () => {
  assert.match(modal, /const ui = \(phrase: string\) => translatePhrase\(language, phrase\)/);
  const sourceKeys = [...new Set([...visible.matchAll(/\bui\((["'])(.*?)\1\)/g)].map(x => x[2]))];
  assert.ok(sourceKeys.length >= 90, 'too few localized Telegram UI messages');
  const expected = [
    'Сповіщення в Telegram',
    'Підключення Telegram',
    'Створити сповіщення ціни',
    'Цільова ціна ($)',
    'Миттєві сповіщення при досягненні ваших рівнів',
    'У вас ще немає встановлених сповіщень',
    'Історія сповіщень порожня',
    'Завантаження журналу сповіщень із сервера...',
    'Фоновий CRON-моніторинг 24/7',
    'Нагляд за монетами:',
    'Очистити всю історію',
    'Отримувати сповіщення на робочий стіл навіть коли вкладка згорнута',
  ];
  for (const source of expected) {
    assert.ok(sourceKeys.includes(source), 'missing UI localization wrapper: ' + source);
    for (const language of ['en','pl','ru'] as const) {
      const translation = translatePhrase(language, source);
      assert.ok(translation.trim());
      assert.notEqual(translation, source, language + ' lacks an actual translation: ' + source);
    }
  }
  const renderedWithoutTranslatedSources = visible
    .replace(/\bui\((["'])(.*?)\1\)/g, 'TRANSLATED')
    .replace(/\bui\([^\n]*\)/g, 'TRANSLATED');
  assert.doesNotMatch(renderedWithoutTranslatedSources,
    />[^<>{}\n]*[А-Яа-яІіЇїЄєҐґ][^<>{}\n]*</,
    'untranslated visible Ukrainian JSX remains');
  assert.doesNotMatch(renderedWithoutTranslatedSources,
    /\b(?:title|aria-label|placeholder)="[^"]*[А-Яа-яІіЇїЄєҐґ]/,
    'untranslated Telegram accessible label or tooltip remains');
});

test('CRON and form-validation errors are localized without changing exchange/alert payloads', () => {
  for (const text of [
    'Не вдалося оновити повідомлення',
    'Помилка надсилання тестового сповіщення CRON',
    'Не вдалося виконати запит до CRON',
    'Вкажіть символ та цільову ціну',
    'Невірна цільова ціна',
    'Помилка збереження сповіщення',
  ]) {
    // Keep the original source message until display so a language switch
    // also updates already-visible errors without changing server payloads.
    assert.ok(modal.includes("'" + text + "'"), 'missing original fallback key: ' + text);
    assert.notEqual(translatePhrase('en', text), text);
    assert.notEqual(translatePhrase('pl', text), text);
  }
  assert.match(modal, /\{ui\(createErrorMsg\)\}/);
  assert.match(modal, /\{ui\(testResult\.message\)\}/);
  assert.match(modal, /addAlert\(\{\s*symbol: formSymbol,/);
  assert.match(modal, /note: formNote \|\| undefined/);
  assert.match(modal, /userId: user\?\.uid/);
  assert.match(modal, /language,\s*symbol: formSymbol \|\| 'BTCUSDT'/);
  assert.match(modal, /apiFetch\('\/api\/cron\/status'\)/);
  assert.match(modal, /setInterval\(fetchCronStatus, 8000\)/);
  assert.match(modal, /data-no-translate>\{item\.symbol\}/);
  assert.match(modal, /data-no-translate>\{item\.formationName\}/);
});
