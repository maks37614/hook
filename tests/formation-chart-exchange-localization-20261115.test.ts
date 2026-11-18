import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { supportedLanguages, interpolate, translatePhrase } from '../src/locales';
import { formationChartControlRows } from '../src/locales/formationChartControls20261115';
import { exchangeScanErrorRows } from '../src/locales/exchangeScanError20261115';
import { localizeFormationRuntime } from '../src/utils/localizeFormationRuntime';

const chart = readFileSync(new URL('../src/components/TradingViewChart.tsx', import.meta.url), 'utf8');
const results = readFileSync(new URL('../src/components/EarlyFormationsResults.tsx', import.meta.url), 'utf8');
const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');

test('chart controls resolve to all four languages', () => {
  for (const row of formationChartControlRows) {
    assert.equal(row.length, 4);
    for (const [index, language] of supportedLanguages.entries()) {
      assert.ok(row[index].trim(), language + ' missing chart control ' + row[0]);
      assert.equal(translatePhrase(language, row[0]), row[index], language + ' chart control ' + row[0]);
    }
  }
  assert.equal(interpolate(
    translatePhrase('en', 'Час до закриття поточної {{timeframe}} свічки: {{remaining}}'),
    {timeframe: '1h',remaining: '00:20'}), 'Time until current 1h candle closes: 00:20');
});

test('known network errors translate without modifying exchange codes', () => {
  for (const row of exchangeScanErrorRows) {
    assert.equal(row.length, 5);
    for (const [index, language] of supportedLanguages.entries()) {
      assert.ok(row[index + 1].trim(), language + ' missing network error ' + row[0]);
      assert.equal(translatePhrase(language, row[0]), row[index + 1], language + ': ' + row[0]);
    }
  }
  assert.equal(localizeFormationRuntime('uk', 'Failed to fetch'), 'Не вдалося виконати мережевий запит');
  assert.equal(localizeFormationRuntime('en', 'Некоректна відповідь біржі'), 'Invalid exchange response');
  assert.equal(localizeFormationRuntime('pl', 'HTTP 429'), 'HTTP 429');
  assert.equal(localizeFormationRuntime('ru', 'Bybit retCode 10006'), 'Bybit retCode 10006');
});

test('chart and early-scan UI actually consume translated labels', () => {
  assert.match(chart, /useLanguage/);
  assert.match(chart, /title=\{tr\(isArchived \?/);
  assert.match(chart, /title=\{tp\('Оновлення в реальному часі \(\{\{mode\}\}\)'/);
  assert.match(chart, /title=\{tp\('Час до закриття поточної \{\{timeframe\}\}/);
  // Raw source errors were intentionally replaced with one translated,
  // accessible status icon; do not regress to a prominent diagnostics banner.
  assert.match(results, /MarketDataFreshnessIcon/);
  assert.match(results, /label=\{tr\('Частина ринкових даних недоступна; результат не можна вважати повним\.'\)\}/);
  assert.doesNotMatch(results, /scanProgress\.missingSources\.map\(trSource\)/);
});

test('HookChart date navigation and liquidation controls use language-aware text', () => {
  assert.equal(translatePhrase('en', 'Для майбутньої дати ще немає свічок'),
    'No candles are available for a future date');
  assert.equal(translatePhrase('pl', 'Цілий день'), 'Cały dzień');
  assert.equal(translatePhrase('ru', 'Сховати блок ліквідацій'),
    'Скрыть панель ликвидаций');
  assert.match(engine, /translateHookChartPhrase\(language,jumpMessage\)/);
  assert.match(engine, /translateHookChartPhrase\(language,"Цілий день"\)/);
  assert.match(engine, /translateHookChartPhrase\(language,liqHudOpen\?/);
  assert.match(engine, /aria-description=\{translateHookChartPhrase\(language,/);
  assert.match(chart, /label: marker\.label \? localizeFormationRuntime\(language, marker\.label\)/);
});
