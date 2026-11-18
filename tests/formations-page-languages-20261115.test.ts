import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { formationsPageRows } from '../src/locales/formationsPagePhrases';
import { interpolate, translatePhrase, supportedLanguages } from '../src/locales';

const read = (name: string) => readFileSync(new URL('../src/' + name, import.meta.url), 'utf8');

test('all Formations page labels and status fragments are translated into four languages', () => {
  assert.ok(formationsPageRows.length >= 100);
  const seen = new Set<string>();
  for (const row of formationsPageRows) {
    const uk = row[0];
    assert.ok(!seen.has(uk), 'Duplicate source phrase: ' + uk);
    seen.add(uk);
    for (const [index, language] of supportedLanguages.entries()) {
      assert.ok(row[index]?.trim(), language + ': empty translation for ' + uk);
      assert.equal(translatePhrase(language, uk), row[index], language + ': ' + uk);
    }
  }
});

test('composed scanner status and rejection text change with selected language', () => {
  const source = 'Тиск продавців · підхід до екстремуму · очікування підтвердження';
  const splitTranslate = (lang: 'uk'|'en'|'ru'|'pl') => source
    .split(' · ').map(fragment => translatePhrase(lang, fragment)).join(' · ');
  assert.equal(splitTranslate('en'), 'Selling pressure · approaching an extreme · awaiting confirmation');
  assert.equal(splitTranslate('ru'), 'Давление продавцов · подход к экстремуму · ожидание подтверждения');
  assert.equal(splitTranslate('pl'), 'Presja sprzedających · zbliżenie do ekstremum · oczekiwanie na potwierdzenie');
  assert.equal(translatePhrase('en', 'Немає підтвердженого пробою рівня'), 'No confirmed level breakout');
  assert.equal(translatePhrase('pl', 'Немає підтвердженого пробою рівня'), 'Brak potwierdzonego wybicia poziomu');
  assert.equal(interpolate(translatePhrase('en', 'Потік: {{supportive}}/{{available}} факторів підтримують'),
    { supportive: 1, available: 3 }), 'Flow: 1/3 supporting factors');
});

test('screenshots target real UI integration, not just catalog additions', () => {
  const app = read('App.tsx');
  const card = read('components/FormationCard.tsx');
  const filters = read('components/ScreenerFilters.tsx');
  const locales = read('locales/index.ts');
  assert.match(app, /tr\('Раннє виявлення формацій · W \/ M'\)/);
  assert.match(app, /tr\('Повний пошук серед доступних USDT-пар/);
  assert.match(app, /interpolate\(tr\('\{\{coins\}\} монет/);
  assert.match(filters, /tr\("Технічні фільтри · ATR \/ RVOL \/ RSI \/ OI \/ Дельта"\)/);
  assert.match(filters, /tr\("OI доступний тільки для ф'ючерсів/);
  assert.match(filters, /tr\("Показники розраховуються тільки із закритих свічок/);
  assert.match(card, /trStatus\(formation\.statusLabel\)/);
  assert.match(card, /rejectionReasons\.slice\(0, 2\)\)\.map\(tr\)/);
  assert.match(card, /interpolate\(tr\('Потік: \{\{supportive\}\}\/\{\{available\}\} факторів підтримують'\)/);
  assert.match(locales, /\.\.\.formationsPagePhrases\[language\]/);
});
