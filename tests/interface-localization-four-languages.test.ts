import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extraPhrases, extraStrings } from '../src/locales/extraPhrases';
import { locales, supportedLanguages, translateKey, translatePhrase } from '../src/locales';

test('new UI phrase catalog has a complete four-language translation for every entry', () => {
  const sources = Object.keys(extraPhrases.uk);
  assert.ok(sources.length > 200, 'coverage catalog should include the audited interface copy');
  for (const language of supportedLanguages) {
    assert.deepEqual(Object.keys(extraPhrases[language]), sources);
    for (const source of sources) {
      assert.ok(extraPhrases[language][source]?.trim(), `${language}: ${source}`);
      // All extra phrase entries must be available from the live translation engine.
      assert.equal(translatePhrase(language, source).trim(), locales[language].phrases[source].trim(), `${language}: ${source}`);
    }
    assert.deepEqual(Object.keys(extraStrings[language]), Object.keys(extraStrings.uk));
    for (const key of Object.keys(extraStrings.uk)) {
      assert.ok(translateKey(language, key)?.trim(), `${language}: ${key}`);
    }
  }
});

test('auth, notification, screener and chart labels translate without modifying technical symbols', () => {
  assert.equal(translatePhrase('en', 'Вхід до h00k'), 'Sign in to h00k');
  assert.equal(translatePhrase('pl', 'Запам\'ятати мене'), 'Zapamiętaj mnie');
  assert.equal(translatePhrase('ru', 'Електронна пошта'), 'Электронная почта');
  assert.equal(translatePhrase('en', 'Тільки перегляд списку'), 'Coin list view only');
  assert.equal(translatePhrase('pl', '24h Range (Low - High)'), 'Zakres 24h (min. — maks.)');
  assert.equal(translatePhrase('en', 'Кольори інтерфейсу'), 'Interface colors');
  assert.equal(translatePhrase('pl', 'Колір акцентів'), 'Kolor akcentów');
  assert.equal(translatePhrase('ru', 'Стандартні кольори'), 'Стандартные цвета');
  assert.equal(translatePhrase('uk', 'Фон сайту'), 'Фон сайту');
  assert.equal(translatePhrase('en', 'Фон блоків графіків'), 'Chart block background');
  assert.equal(translatePhrase('pl', 'Мій CSS'), 'Mój CSS');
  assert.equal(translatePhrase('pl', 'Оформлення сайту'), 'Wygląd strony');
  assert.equal(translatePhrase('ru', 'Шрифт сайту'), 'Шрифт сайта');
  assert.equal(translatePhrase('pl', 'Максимум 3500 символів CSS.'), 'Maksymalnie 3500 znaków CSS.');
  assert.equal(translateKey('en', 'ui.interface.disallowedValue', { property: 'font-size' }), 'Disallowed value: font-size');
  assert.equal(translateKey('pl', 'replay'), 'Odtwarzanie');
  assert.equal(translateKey('ru', 'replay'), 'Воспроизведение');
  assert.equal(translateKey('en', 'ui.copy.symbol', { symbol: 'BTCUSDT' }), 'Copy BTCUSDT');
  assert.equal(translateKey('ru', 'ui.copy.symbol', { symbol: 'BTCUSDT' }), 'Скопировать BTCUSDT');
  assert.equal(translateKey('pl', 'ui.copy.symbolTitle', { symbol: 'ETHUSDT' }), 'Kopiuj ETHUSDT');
  assert.equal(translateKey('en', 'ui.notifications.unread', { count: 3 }), 'Site notifications, unread: 3');
  assert.equal(translateKey('pl', 'header.linking.enabled'), 'włączone');
  assert.equal(translateKey('ru', 'header.linking.title', { terminal: 'MetaScalp', status: 'включена' }), 'Связь с терминалом: MetaScalp — включена. Открыть настройки профиля');
  assert.equal(translateKey('en', 'ui.notifications.range', { percent: '1.23' }), 'Range 1.23%');
  assert.equal(translateKey('pl', 'ui.coins.showMore', { remaining: 123 }), 'Pokaż 50 kolejnych monet (pozostało 123)');
  assert.equal(translateKey('uk', 'ui.copy.symbol', { symbol: 'BTCUSDT' }), 'Скопіювати BTCUSDT');
});

test('dynamic accessible labels use explicit localization keys rather than untranslatable concatenation', () => {
  const screenerCopy = readFileSync(new URL('../src/components/ScreenerCopySymbolButton.tsx', import.meta.url), 'utf8');
  const bell = readFileSync(new URL('../src/components/SiteNotificationBell.tsx', import.meta.url), 'utf8');
  const screener = readFileSync(new URL('../src/components/CoinScreenerPage.tsx', import.meta.url), 'utf8');
  assert.match(screenerCopy, /t\('ui\.copy\.symbol'/);
  assert.match(bell, /t\('ui\.notifications\.unread'/);
  assert.match(bell, /t\('ui\.chart\.open'/);
  assert.match(screener, /t\('ui\.coins\.showMore'/);
  assert.doesNotMatch(bell, /toLocaleString\('uk-UA'/);
  assert.doesNotMatch(screenerCopy, /aria-label=\{\`Скопіювати/);
});
