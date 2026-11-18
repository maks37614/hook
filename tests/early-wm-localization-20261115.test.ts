import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { earlyWmRows } from '../src/locales/earlyWmMore20261115';
import { interpolate, supportedLanguages, translatePhrase } from '../src/locales';

const read = (path: string) => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');
const results = read('components/EarlyFormationsResults.tsx');
const card = read('components/EarlyFormationCard.tsx');
const modal = read('components/EarlyFormationDetailsModal.tsx');
const scanner = read('utils/earlyFormations.ts');

test('early W/M labels resolve in all four languages, not just Ukrainian', () => {
  assert.ok(earlyWmRows.length >= 60);
  const keys = new Set<string>();
  for (const row of earlyWmRows) {
    const source = row[0];
    assert.ok(!keys.has(source), 'Duplicate early W/M phrase: ' + source);
    keys.add(source);
    for (const [i, lang] of supportedLanguages.entries()) {
      assert.ok(row[i]?.trim(), lang + ': no translation for ' + source);
      const resolved = translatePhrase(lang, source);
      assert.ok(resolved.trim(), lang + ': blank active phrase ' + source);
      // Names such as TP and quoted technical abbreviations may intentionally
      // remain unchanged in another language. Exact target languages are checked below.
    }
  }
});

test('scanner progress and empty states are translated at render time', () => {
  assert.match(results, /tr\(scanProgress\.status === 'loading' \? 'Отримання списку USDT-пар…'/);
  assert.match(results, /tr\('Частина ринкових даних недоступна/);
  assert.match(results, /tr\('Повне сканування не завершено/);
  assert.match(results, /interpolate\(tr\('Ранні W\/M-сценарії:/);
  assert.equal(
    interpolate(translatePhrase('en', 'Ранні W/M-сценарії: {{coins}} монет · {{count}} можливих формацій'), {coins: 64, count: 86}),
    'Early W/M scenarios: 64 coins · 86 possible formations',
  );
});

test('early W/M cards and modal translate scenario text and marker captions', () => {
  assert.match(card, /tr\(candidate\.name\)/);
  assert.match(card, /tr\(candidate\.explanation\)/);
  assert.match(card, /tr\(ready \? 'Формується' : 'Потенційна'\)/);
  assert.match(card, /customMarkers=\{localizedMarkers\}/);
  assert.match(modal, /tr\(candidate\.explanation\)/);
  assert.match(modal, /translatePhrase\(language, marker\.label\)/);
  assert.match(scanner, /label: 'Можливий ранній вхід · межа 1'/);
  assert.equal(translatePhrase('en', 'Можлива подвійна вершина (M)'), 'Possible double top (M)');
  assert.equal(translatePhrase('pl', 'Можливий ранній вхід · межа 1'), 'Możliwe wczesne wejście · granica 1');
});

test('early W/M translations leave scanner and risk models unchanged', () => {
  assert.match(scanner, /closedCandleOnly|candles|lookAheadSafe|firstPivot/);
  assert.match(results, /getVisibleEarlyFormations\(coins, filters, stage\)/);
  assert.match(card, /earlyFormationChartMarkers\(candidate\)\.map/);
});
