import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { formationDynamicRows, translateFormationDynamicText } from '../src/locales/formationDynamicText';
import { localizeFormationRuntime } from '../src/utils/localizeFormationRuntime';
import { supportedLanguages } from '../src/locales';

test('all templated scanner descriptions have four language variants and matching parameters', () => {
  assert.ok(formationDynamicRows.length >= 40);
  const keys = new Set<string>();
  const parameters = (s: string) => [...s.matchAll(/\{\{([a-zA-Z]+)\}\}/g)].map(m => m[1]).sort();
  for (const row of formationDynamicRows) {
    assert.ok(!keys.has(row[0]), 'duplicate source ' + row[0]);
    keys.add(row[0]);
    assert.equal(row.length, 4);
    for (const text of row) assert.ok(text.trim());
    const sourceKeys = parameters(row[0]);
    for (const text of row.slice(1)) {
      assert.deepEqual(parameters(text), sourceKeys, 'parameters mismatch: ' + row[0]);
    }
  }
});

test('W and M dynamic descriptions are translated without changing live prices', () => {
  const source = 'Подвійний відскок від зони підтримки $0.0012. Лінія шиї (ключовий опір) на рівні $0.0015. Проєкція цілі патерну: $0.0020.';
  const en = localizeFormationRuntime('en', source);
  assert.match(en, /^Double rebound from the support zone/);
  for (const v of ['$0.0012', '$0.0015', '$0.0020']) assert.ok(en.includes(v), v);
  assert.equal(localizeFormationRuntime('uk', source), source);
  const m = 'Подвійний відскок від рівня опору $0.052. Лінія шиї (підтримка) на рівні $0.040. Пробій вниз відкриває ціль на рівні $0.028.';
  assert.match(localizeFormationRuntime('ru', m), /^Двойной отбой от сопротивления/);
  assert.match(localizeFormationRuntime('pl', m), /^Podwójne odrzucenie oporu/);
});

test('joined extreme and round-number contexts remain localized and preserve numeric values', () => {
  const source = 'Бичаче підтискання до горизонтального опору $0.20 із серією вищих мінімумів. Розрахункова ціль пробою: $0.27. Екстремум: Верхній екстремум близько: 1.52%; підхід testing, сила 71/100. Ключова кругла ціна: $0.25.';
  const text = localizeFormationRuntime('en', source);
  assert.match(text, /Bullish pressure toward horizontal resistance/);
  assert.match(text, /Extreme: Upper extreme nearby:/);
  assert.match(text, /Key round-number price:/);
  for (const value of ['$0.20', '$0.27', '1.52%', '71/100', '$0.25']) {
    assert.ok(text.includes(value), value);
  }
  assert.ok(!text.includes('Ключова кругла ціна'));
});

test('scanner quality evidence and errors translate but unknown exchange errors stay unchanged', () => {
  assert.equal(localizeFormationRuntime('en', 'Якість геометрії/формації: 78/100'), 'Formation geometry quality: 78/100');
  assert.equal(localizeFormationRuntime('pl', 'Найближчий ключовий рівень: 0.32%'), 'Najbliższy kluczowy poziom: 0.32%');
  assert.equal(localizeFormationRuntime('ru', 'Біржі не повернули доступних USDT-пар.'), 'Биржи не вернули доступных USDT-пар.');
  assert.equal(localizeFormationRuntime('en', 'R:R 0.42 нижче мінімуму 2.0'), 'R:R 0.42 below the 2.0 minimum');
  const unknown = 'Unsupported exchange status: XQ9 (0.004)';
  for (const lang of supportedLanguages) assert.equal(localizeFormationRuntime(lang, unknown), unknown);
  assert.equal(translateFormationDynamicText('en', 'Некоректна відповідь біржі'), 'Invalid exchange response');
});

test('the translation boundary is the UI, not the scanner or scores', () => {
  const runtime = readFileSync(new URL('../src/utils/localizeFormationRuntime.ts', import.meta.url), 'utf8');
  const card = readFileSync(new URL('../src/components/FormationCard.tsx', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../src/components/FormationDetailsModal.tsx', import.meta.url), 'utf8');
  assert.match(runtime, /translateFormationDynamicText\(language, source/);
  assert.match(card, /localizeFormationRuntime\(language, source\)/);
  assert.match(detail, /localizeFormationRuntime\(language, source\)/);
  assert.match(detail, /tr\(formation\.description\)/);
  assert.match(card, /tr\(item\.evidence\)/);
});
