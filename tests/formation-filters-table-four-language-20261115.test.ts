import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interpolate, locales, translateKey } from '../src/locales';
import { formationFiltersTableRows } from '../src/locales/formationFiltersTable20261115';
const languages = ['uk', 'en', 'ru', 'pl'] as const;
const placeholders = (s: string) => [...s.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)].map(m => m[1]).sort();
test('Formation filters and table have full four-language text and matching numbers', () => {
  const seen = new Set<string>();
  for (const row of formationFiltersTableRows) {
    assert.equal(row.length, 5);
    assert.ok(!seen.has(row[0]), row[0]);
    seen.add(row[0]);
    const params = Object.fromEntries(placeholders(row[1]).map(key => [key, '42']));
    for (const [index, language] of languages.entries()) {
      const key = 'i18n.' + row[0];
      assert.deepEqual(placeholders(row[index + 1]), placeholders(row[1]), key + ' / ' + language);
      assert.equal(locales[language].strings[key], row[index + 1]);
      assert.equal(translateKey(language, key, params), interpolate(row[index + 1], params));
    }
  }
});
test('Early stage, level filters, formation table and tooltips use locale', () => {
  const source = (name: string) => readFileSync(new URL('../src/components/' + name, import.meta.url), 'utf8');
  const filters = source('ScreenerFilters.tsx');
  const table = source('ScreenerTable.tsx');
  assert.ok(filters.includes('i18n.formationFilters.earlyDirection'));
  assert.ok(filters.includes("'i18n.formationFilters.stage.' + item.value"));
  assert.ok(filters.includes('i18n.formationFilters.fromVolume'));
  assert.ok(filters.includes('i18n.formationFilters.densityTip'));
  assert.ok(table.includes('i18n.formationTable.highDistance'));
  assert.ok(table.includes('i18n.formationTable.formationCount'));
  assert.ok(table.includes('i18n.formationTable.terminalGroup'));
  assert.ok(table.includes('tr(formation.statusLabel)'));
  assert.equal(translateKey('pl', 'i18n.formationFilters.fromVolume', { volume: '$50k' }), 'Od $50k');
});


test('regular technical filters appear above formation types without changing filter behavior', () => {
  const filters = readFileSync(new URL('../src/components/ScreenerFilters.tsx', import.meta.url), 'utf8');
  const exchangeRow = filters.indexOf('/* Row 2: Exchange and market */');
  const technicalRow = filters.indexOf('/* Technical indicators belong exclusively to ordinary formation screening. */');
  const categoryRow = filters.indexOf('/* Row 3: Categories, Direction, Status, Min Volume, View Mode */');
  assert.ok(exchangeRow >= 0 && technicalRow > exchangeRow && categoryRow > technicalRow,
    'exchange/market → technical filters → formation categories');
  assert.equal(filters.split('regular-technical-filters"').length - 1, 2,
    'the existing accordion button and its panel both retain the same id');
  const technical = filters.slice(technicalRow, categoryRow);
  assert.match(technical, /!earlyMode && onRegularIndicatorFilterChange/);
  assert.match(technical, /aria-expanded=\{isTechnicalFiltersOpen\}/);
  assert.match(technical, /onClick=\{\(\) => setIsTechnicalFiltersOpen\(open => !open\)\}/);
  assert.match(technical, /onResetRegularIndicatorFilters/);
  for (const field of ['atrBand', 'minBreakoutRvol', 'rsiZone', 'oiChange', 'delta', 'cvd20']) {
    assert.ok(technical.includes('regularIndicatorFilters.' + field), field + ' still bound to original state');
  }
});
