import test from 'node:test';
import assert from 'node:assert/strict';
import { locales, translatePhrase } from '../src/locales';
import { translateHookChartPhrase } from '../src/locales/hookchartLanguage';

const phrases = [
  "Налаштування hookchart",
  "Підтримка та опір",
  "Показувати підтримку та опір",
  "S — підтримка нижче ціни, R — опір вище ціни. Рівні з підтвердженим пробоєм приховуються.",
  "Показувати мітки S/R",
  "Вмикає або вимикає підписи підтримки й опору; лінії керуються перемикачем вище.",
  "Автоматичні рівні",
  "Таймфрейми автовизначення рівнів",
  "Можна вибрати всі п’ять таймфреймів. За замовчуванням: 1г, 4г і 1d; 5 хв та 15 хв вимкнено. Зніміть усі, щоб вимкнути автовизначення.",
  "Колір міток рівнів",
  "Колір активних рівнів та їхніх підписів. Пробиті рівні залишаються сірими.",
  "Розмір міток рівнів",
  "Тип міток рівнів",
  "Із заливкою",
  "Із рамкою",
  "Тип ліній рівнів",
  "Індекс настрою ринку: від страху до жадібності",
  "Шукаємо рівні DOM від вказаної суми (ціна × кількість на одному рівні). Якщо таких немає, чекаємо наступних оновлень стакана."
] as const;
const supported = ['uk', 'en', 'ru', 'pl'] as const;

test('S/R level settings and remaining market messages translate into four languages', () => {
  for (const source of phrases) {
    for (const language of supported) {
      const value = locales[language].phrases[source];
      assert.ok(value && value.trim(), `${language}: ${source}`);
      assert.equal(translatePhrase(language, source), value, `${language}: ${source}`);
      assert.equal(translateHookChartPhrase(language, source), value, `${language}: ${source}`);
    }
  }
  assert.equal(translatePhrase('uk', 'Показувати підтримку та опір'), 'Показувати підтримку та опір');
  assert.equal(translatePhrase('en', 'Показувати підтримку та опір'), 'Show support and resistance');
  assert.equal(translatePhrase('ru', 'Показувати підтримку та опір'), 'Показывать поддержку и сопротивление');
  assert.equal(translatePhrase('pl', 'Показувати підтримку та опір'), 'Pokaż wsparcie i opór');
});
