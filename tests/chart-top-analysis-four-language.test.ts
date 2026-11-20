import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translatePhrase } from '../src/locales';

const source = readFileSync(
  new URL('../src/components/ChartTopAnalysisText.tsx', import.meta.url),
  'utf8',
);
const view = source.slice(source.lastIndexOf('  return (\n    <div className='));

const labels = [
  'Стопи шорт:',
  'Стопи лонг:',
  'Супротив:',
  'Підтримка:',
  'оновлення...',
  'Авто-оновлення кожні 10 сек',
] as const;

test('above-chart HookChart analysis labels are linked to current language', () => {
  assert.match(source, /const \{ language \} = useLanguage\(\)/);
  assert.match(source, /const tr = \(source: string\) => translatePhrase\(language, source\)/);
  for (const label of labels) {
    assert.ok(view.includes('tr(' + JSON.stringify(label) + ')'),
      'label must use selected language: ' + label);
  }
  assert.equal((view.match(/tr\("оновлення\.\.\."\)/g) ?? []).length, 2);
  assert.equal((view.match(/title=\{(?:binanceOiStale|bybitOiStale) \? tr\('Попереднє підтверджене значення OI; очікується оновлення'\) : tr\("Авто-оновлення кожні 10 сек"\)\}/g) ?? []).length, 2);
  const masked = view.replace(/\btr\((["'])(.*?)\1\)/g, 'LOCALIZED');
  assert.doesNotMatch(masked, />[^<>{}\n]*[А-Яа-яІіЇїЄєҐґ][^<>{}\n]*</,
    'hard-coded Ukrainian label remains visible above chart');
  assert.doesNotMatch(masked, /title="[^"]*[А-Яа-яІіЇїЄєҐґ]/,
    'hard-coded Ukrainian auto-refresh tooltip remains');
});

test('all six labels have localized Ukrainian, English, Russian and Polish forms', () => {
  for (const label of labels) {
    // The reviewed Ukrainian market term for resistance is now "Опір".
    // The original JSX phrase remains a stable lookup key for every locale.
    assert.equal(translatePhrase('uk', label), label === 'Супротив:' ? 'Опір:' : label);
    for (const language of ['en', 'ru', 'pl'] as const) {
      const localized = translatePhrase(language, label);
      assert.ok(localized.trim(), 'missing ' + language + ' value for ' + label);
      assert.notEqual(localized, label, 'untranslated ' + language + ' value for ' + label);
    }
  }
  assert.equal(translatePhrase('en', 'Підтримка:'), 'Support:');
  assert.equal(translatePhrase('pl', 'Супротив:'), 'Opór:');
  assert.equal(translatePhrase('ru', 'оновлення...'), 'обновление...');
});

test('above-chart block no longer fetches or displays funding', () => {
  assert.doesNotMatch(source, /subscribeSharedHookChartFunding|chart-top-funding|Фандинг Binance:|Фандинг Bybit:/);
  assert.doesNotMatch(view, /Фандинг:/);
});

test('localization does not change OI polling cadence, chart sizing, or analysis calculations', () => {
  assert.match(source, /const interval = setInterval\(\(\) => \{/);
  assert.match(source, /\}, 10_000\);/);
  assert.match(source, /if \(inFlight\) return/);
  assert.match(source, /generation !== oiRequestGeneration\.current/);
  assert.match(source, /void refresh\(false\)/);
  assert.match(source, /getCandidateSymbols\(coin\.symbol, coin\.baseAsset\)/);
  assert.match(source, /formatCryptoPrice\(analysis\.sslPrice\)/);
  assert.match(source, /formatCryptoPrice\(analysis\.strongDemand\)/);
  assert.match(source, /max-w-\[680px\] min-w-0 grid-cols-2/);
  assert.equal((view.match(/className="min-w-0 space-y-1 break-words \[overflow-wrap:anywhere\]"/g) ?? []).length, 2);
});
