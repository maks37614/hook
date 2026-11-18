import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { formationCardMoreRows } from '../src/locales/formationCardMore20261115';
import { translatePhrase, supportedLanguages, interpolate } from '../src/locales';

const card = readFileSync(new URL('../src/components/FormationCard.tsx', import.meta.url), 'utf8');

test('confluence labels and information tooltips have four translations', () => {
  assert.ok(formationCardMoreRows.length >= 30);
  const keys = new Set<string>();
  for (const row of formationCardMoreRows) {
    assert.ok(!keys.has(row[0]), 'Duplicate UI phrase: ' + row[0]);
    keys.add(row[0]);
    for (const [index, lang] of supportedLanguages.entries()) {
      assert.ok(row[index]?.trim(), lang + ' missing translation for ' + row[0]);
    }
  }
  assert.equal(translatePhrase('en', 'Кругле число'), 'Round number');
  assert.equal(translatePhrase('pl', 'Якість даних'), 'Jakość danych');
  assert.equal(translatePhrase('ru', 'RVOL пробою'), 'RVOL пробоя');
});

test('confluence view translates user-visible values without changing the score', () => {
  assert.match(card, /tr\(QUALITY_LABELS\[key\] \?\? key\)/);
  assert.match(card, /tr\(item\.evidence\)/);
  assert.match(card, /interpolate\(tr\('Нормовано: \{\{raw\}\}\/\{\{max\}\} доступних балів/);
  assert.match(card, /tr\('Очікування дотиків'\)/);
  assert.match(card, /title=\{tr\("ATR\(14\) у відсотках/);
  const normalized = interpolate(
    translatePhrase('en', 'Нормовано: {{raw}}/{{max}} доступних балів → {{total}}/100. Відсутні показники не зменшують оцінку. Натисни на складову для пояснення.'),
    {raw: 40, max: 70, total: 57},
  );
  assert.match(normalized, /40\/70/);
  assert.match(normalized, /57\/100/);
});
