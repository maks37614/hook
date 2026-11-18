import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TP_SL_PATTERNS } from '../src/utils/tpSlConstructor';
import { extraPhrases } from '../src/locales/extraPhrases';
import { supportedLanguages, translateKey, translatePhrase } from '../src/locales';

const modal = readFileSync(new URL('../src/components/TpSlConstructorModal.tsx', import.meta.url), 'utf8');

test('all TP/SL pattern choices are translated into each of the four site languages', () => {
  for (const [, label] of TP_SL_PATTERNS) {
    for (const language of supportedLanguages) {
      assert.equal(typeof extraPhrases[language][label], 'string', language + ': ' + label);
      assert.ok(translatePhrase(language, label).trim(), language + ': empty ' + label);
    }
  }
  assert.equal(translatePhrase('en', 'Подвійне дно (W)'), 'Double bottom (W)');
  assert.equal(translatePhrase('pl', 'Подвійна вершина (M)'), 'Podwójny szczyt (M)');
  assert.equal(translatePhrase('ru', 'Стиснення волатильності'), 'Сжатие волатильности');
});

test('TP/SL modal messages, warnings and dynamic symbols survive language changes', () => {
  assert.equal(translatePhrase('en', 'Конструктор TP/SL'), 'TP/SL Builder');
  assert.equal(translatePhrase('pl', 'Введіть скінченне числове значення.'), 'Wpisz skończoną wartość liczbową.');
  assert.equal(translateKey('en', 'ui.tpsl.scopeCoin', { symbol: 'BTCUSDT' }), 'Only BTCUSDT · this pattern');
  assert.equal(translateKey('pl', 'ui.tpsl.rulesForCoin', { symbol: 'ETHUSDT' }), 'Reguły dla ETHUSDT');
  assert.equal(translateKey('ru', 'ui.tpsl.levelPrice', { level: 'SL' }), 'Цена SL');
  assert.equal(translateKey('en', 'ui.tpsl.independentTarget', { offset: 1.5 }), 'Independent TP: 1.5 ATR from the default TP.');
  for (const language of supportedLanguages) {
    for (const key of ['ui.tpsl.scopeCoin', 'ui.tpsl.coinTemplate', 'ui.tpsl.rulesForCoin',
      'ui.tpsl.templateCount', 'ui.tpsl.independentTarget', 'ui.tpsl.levelPrice',
      'ui.tpsl.chartExplanation', 'ui.tpsl.geometryWarning', 'ui.tpsl.privacyNote']) {
      const localized = translateKey(language, key, { symbol: 'BTCUSDT', count: 5, offset: 2, level: 'TP' });
      assert.ok(localized.trim() && !localized.includes('{{'), language + ': ' + key);
    }
  }
});

test('modal translates rendering-only labels, with no change to stored pattern identifiers', () => {
  assert.match(modal, /translatePhrase\(language, label\)/);
  assert.match(modal, /t\('ui\.tpsl\.scopeCoin'/);
  assert.match(modal, /t\('ui\.tpsl\.coinTemplate'/);
  assert.match(modal, /t\('ui\.tpsl\.chartExplanation'\)/);
  assert.match(modal, /t\('ui\.tpsl\.geometryWarning'\)/);
  assert.match(modal, /t\('ui\.tpsl\.privacyNote'\)/);
  assert.match(modal, /t\('ui\.tpsl\.levelPrice'/);
  assert.match(modal, /tpSlCoinRuleKey\(symbol, pattern\)/);
  assert.match(modal, /serializeTpSlSettings\(draft\)/);
});
