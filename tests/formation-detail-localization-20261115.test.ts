import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { formationDetailsRows } from '../src/locales/formationDetails20261115';
import { interpolate, supportedLanguages, translatePhrase } from '../src/locales';

const file = readFileSync(new URL('../src/components/FormationDetailsModal.tsx', import.meta.url), 'utf8');

test('formation detail dynamic messages resolve in Ukrainian, English, Russian and Polish', () => {
  assert.ok(formationDetailsRows.length >= 45);
  const seen = new Set<string>();
  for (const row of formationDetailsRows) {
    assert.ok(!seen.has(row[0]), 'Duplicate detail key: ' + row[0]);
    seen.add(row[0]);
    for (const [index, lang] of supportedLanguages.entries()) {
      assert.ok(row[index]?.trim(), lang + ': missing ' + row[0]);
      const resolved = translatePhrase(lang, row[0]);
      // The newer shared Russian dictionary uses an equivalent phrasing.
      if (lang === 'ru' && row[0] === 'Спробувати ще раз')
        assert.ok(['Попробовать снова', 'Попробовать ещё раз'].includes(resolved));
      else assert.equal(resolved, row[index], lang + ': ' + row[0]);
    }
  }
});

test('dynamic price alert templates preserve prices and translate surrounding text', () => {
  assert.equal(interpolate(translatePhrase('en', 'Сповіщення на ${{price}} додано!'), { price: '0.00325' }),
    'Alert for $0.00325 added!');
  assert.equal(interpolate(translatePhrase('ru', 'Алерт на {{level}} додано!'), { level: 'Вход' }),
    'Алерт на Вход добавлен!');
  assert.equal(interpolate(translatePhrase('pl', 'Встановлені сповіщення для {{symbol}}:'), { symbol: 'BTCUSDT' }),
    'Alerty ustawione dla BTCUSDT:');
});

test('formation detail UI uses translation for quality, pattern selection and Telegram alerts', () => {
  assert.match(file, /trStatus\(formation\.statusLabel\)/);
  assert.match(file, /tr\(formation\.description\)/);
  assert.match(file, /tp\('Нормовано: \{\{raw\}\} \/ \{\{max\}\}/);
  assert.match(file, /tp\('Очікується \(\{\{count\}\}\/\{\{required\}\}\)'/);
  assert.match(file, /tp\('Сповіщення на/);
  assert.match(file, /tp\('Алерт на \{\{level\}\} додано!'/);
  assert.match(file, /tp\('Встановлені сповіщення для \{\{symbol\}\}:'/);
  assert.match(file, /tr\(isReferencePreview \? 'Орієнтовні рівні \(24h\)' : 'Торгові рівні \(Setup\)'\)/);
  assert.match(file, /tr\(item\.evidence\)/);
  assert.match(file, /tr\(customAlertError\)/);
  assert.match(file, /tr\(alertFeedback\)/);
});
