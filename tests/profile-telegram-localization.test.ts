import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { locales, supportedLanguages, telegramText, translateKey } from '../src/locales';

test('profile Telegram labels resolve to Ukrainian instead of localization keys', () => {
  const expected: Record<string, string> = {
    'telegram.title': 'Telegram-сповіщення',
    'telegram.connected': 'Telegram підключено',
    'telegram.test': 'Надіслати тест',
    'telegram.disconnect': 'Відключити',
    'telegram.refresh': 'Оновити статус',
  };
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(translateKey('uk', key), value, key);
  }
});

test('all Telegram profile UI labels and errors resolve in all supported languages', () => {
  for (const language of supportedLanguages) {
    for (const key of Object.keys(locales.uk.telegram).filter(key => key.startsWith('telegram.'))) {
      assert.notEqual(translateKey(language, key), key, `${language} / ${key}`);
      assert.ok(translateKey(language, key).trim().length > 0, `${language} / ${key}`);
    }
  }
  assert.equal(translateKey('uk', 'telegram.errors.request_failed'), 'Не вдалося виконати запит. Спробуйте ще раз.');
  assert.equal(translateKey('uk', 'missing.translation.key'), 'missing.translation.key');
});

test('Telegram bot templates stay in their dedicated message namespace', () => {
  assert.match(telegramText('uk', 'priceAlertTitle'), /СПОВІЩЕННЯ ЦІНИ/);
  assert.equal(translateKey('uk', 'priceAlertTitle'), 'priceAlertTitle');
});

test('profile form and connection card have localized labels and generic unknown-error handling', () => {
  const profile = readFileSync(new URL('../src/components/UserProfileModal.tsx', import.meta.url), 'utf8');
  const telegram = readFileSync(new URL('../src/components/TelegramConnectionCard.tsx', import.meta.url), 'utf8');
  assert.match(profile, /Електронна пошта/);
  assert.doesNotMatch(profile, />\s*Email\s*</);
  assert.doesNotMatch(profile, /High\/Low|Futures\)<|Spot\)</);
  assert.match(telegram, /telegramErrorText\(status\.pollingError\)/);
  assert.match(telegram, /telegramErrorText\(errorCode\)/);
  assert.match(telegram, /telegramErrorText\(status\.linkError\)/);
  assert.match(telegram, /t\('telegram\.errors\.request_failed'\)/);
});
