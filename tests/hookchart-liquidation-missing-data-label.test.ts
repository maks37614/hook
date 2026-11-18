import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcCascadeRisk } from '../src/components/hookchart/engine';
import { translateHookChartPhrase } from '../src/locales/hookchartLanguage';

test('an empty connected liquidation window must not render a cascade label', () => {
  const empty = calcCascadeRisk([], 1000, 70000, 1_800_000_000_000);
  assert.equal(empty.hasData, false);
  assert.equal(empty.score, 0);
  const source = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /translateHookChartPhrase\(language,cascadeRisk\.hasData\?"Немає":"Немає даних"\)/);
  assert.match(source, /hasObservedLiquidationCascade\(cascadeRisk,liquidationStreamLive\)/);
});

test('no observed Liq data has an accurate label in all site languages', () => {
  assert.equal(translateHookChartPhrase('uk', 'Немає даних'), 'Немає даних');
  assert.equal(translateHookChartPhrase('en', 'Немає даних'), 'No data');
  assert.equal(translateHookChartPhrase('ru', 'Немає даних'), 'Нет данных');
  assert.equal(translateHookChartPhrase('pl', 'Немає даних'), 'Brak danych');
});
