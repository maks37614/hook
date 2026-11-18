import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { locales, supportedLanguages, translatePhrase } from '../src/locales';
import { profileAuthTelegramRows } from '../src/locales/profileAuthTelegram20261115';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('profile authentication and Telegram alerts contain complete reviewed copy in four languages', () => {
  assert.deepEqual([...supportedLanguages].sort(), ['en', 'pl', 'ru', 'uk']);
  assert.ok(profileAuthTelegramRows.length >= 50);
  assert.equal(new Set(profileAuthTelegramRows.map(row => row[0])).size, profileAuthTelegramRows.length);
  for (const row of profileAuthTelegramRows) {
    for (const [i, language] of (['uk', 'en', 'ru', 'pl'] as const).entries()) {
      assert.ok(row[i].trim(), language + ' missing translation of ' + row[0]);
      assert.equal(locales[language].phrases[row[0]], row[i], language + ' catalog ' + row[0]);
      assert.equal(translatePhrase(language, row[0]), row[i], language + ' lookup ' + row[0]);
    }
  }
  assert.equal(translatePhrase('en', 'Не вдалося завантажити CAPTCHA. Перевірте з\'єднання або блокувальник.'),
    'Could not load CAPTCHA. Check your connection or ad blocker.');
  assert.equal(translatePhrase('pl', 'Сповіщення'), 'Alerty');
  assert.equal(translatePhrase('ru', 'Історія'), 'История');
});

test('auth form and CAPTCHA use selected language for visible feedback and the challenge itself', () => {
  const modal = read('../src/components/AuthModal.tsx');
  const captcha = read('../src/components/AuthCaptcha.tsx');
  assert.match(modal, /const \{ language \} = useLanguage\(\)/);
  assert.match(modal, /const localizedTitle = translatePhrase\(language, title\)/);
  assert.match(modal, /const localizedExplanation = translatePhrase\(language, explanation\)/);
  assert.match(modal, /translatePhrase\(language, localError \|\| authError \|\| ''\)/);
  assert.match(modal, /translatePhrase\(language, authNotice\)/);
  assert.match(captcha, /language: 'uk' \| 'en' \| 'ru' \| 'pl'/);
  assert.match(captcha, /size: 'flexible',\s+language,/);
  assert.match(captcha, /\[siteKey, retry, language\]/);
  assert.match(captcha, /onChangeRef\.current\(null\)/);
  assert.match(captcha, /translatePhrase\(language, "Перевірка CAPTCHA"\)/);
  assert.match(captcha, /translatePhrase\(language, 'Повторити'\)/);
});

test('Telegram alerts localize counts, profile status, and parameterized messages without translating symbols or user names', () => {
  const telegram = read('../src/components/TelegramAlertsModal.tsx');
  assert.match(telegram, /const ui = \(phrase: string\) => translatePhrase\(language, phrase\)/);
  assert.match(telegram, /uiFormat\('Сповіщення для \{symbol\} створено у вашому профілі!'/);
  assert.match(telegram, /uiFormat\('Оновлено: \{edited\}\. Пропущено: \{skipped\}\. Помилок: \{failed\}\.'/);
  for (const label of ['Сповіщення', 'Історія', 'Активні сповіщення', 'Призупинені',
    'Відпрацьовані сповіщення', 'Очистити спрацьовані', 'Активних сповіщень:']) {
    assert.ok(telegram.includes("ui('" + label + "')"), 'Missing dynamic label ' + label);
  }
  for (const label of ['Telegram: доставлено', 'Telegram: очікує повторної спроби',
    'Telegram: не доставлено —', 'Цінова умова спрацювала', 'У черзі доставки']) {
    assert.ok(telegram.includes("ui('" + label + "')"), 'Missing delivery status ' + label);
  }
  assert.match(telegram, /<strong data-no-translate className="text-white">\{profile\?\.displayName \|\| user\.email\}<\/strong>/);
  assert.match(telegram, /Object\.prototype\.hasOwnProperty\.call\(params, key\)/);
  assert.match(telegram, /confirm\(ui\('Ви впевнені, що хочете очистити історію сповіщень\?'\)\)/);
});

test('dynamic Telegram message templates keep coin symbols, numbers and the selected language', () => {
  const format = (lang: 'uk' | 'en' | 'pl' | 'ru', template: string, params: Record<string,string|number>) =>
    translatePhrase(lang, template).replace(/\{([a-z]+)\}/gi,
      (part, key: string) => Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : part);
  assert.equal(format('en', 'Сповіщення для {symbol} створено у вашому профілі!', {symbol:'BTCUSDT'}),
    'An alert for BTCUSDT has been created in your profile!');
  assert.equal(format('pl', 'Оновлено: {edited}. Пропущено: {skipped}. Помилок: {failed}.',
    {edited:3,skipped:2,failed:0}), 'Zaktualizowano: 3. Pominięto: 2. Błędy: 0.');
  assert.equal(format('ru', 'Сповіщення для {symbol} створено у вашому профілі!', {symbol:'ETHUSDT'}),
    'Уведомление для ETHUSDT создано в вашем профиле!');
});
