import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ORIGINAL_HOOKCHART_DEFAULTS,
  normalizeOriginalHookChartPreferences,
} from '../src/components/hookchart/OriginalHookChartSettings';
import type { HookChartPreferences } from '../src/types';

const newAccountVisuals: HookChartPreferences = {
  showMarketPrintArrows: false,
  showLiquidationArrows: false,
  showLiquidationCandleSums: false,
};

test('new PostgreSQL registrations store all three HookChart decorations as disabled', () => {
  const code = readFileSync(new URL('../server/pgIdentity.ts', import.meta.url), 'utf8');
  const begin = code.indexOf('export async function registerAccount(');
  const end = code.indexOf('// Public mail-request endpoints', begin);
  assert.ok(begin > -1 && end > begin, 'inspect actual account registration bootstrap');
  const registration = code.slice(begin, end);
  assert.match(registration, /JSON\.stringify\(\{[\s\S]*?hookChartPreferences:\s*\{/);
  assert.match(registration, /hookChartPreferences:\s*\{\s*showMarketPrintArrows:\s*false,\s*showLiquidationArrows:\s*false,\s*showLiquidationCandleSums:\s*false,?\s*\}/);
  assert.match(code, /'hookChartPreferences'/, 'profile API must keep accepting chart preference updates');
});

test('saved new-user settings remain off after HookChart normalization', () => {
  const normalized = normalizeOriginalHookChartPreferences(newAccountVisuals);
  assert.equal(normalized.showMarketPrintArrows, false);
  assert.equal(normalized.showLiquidationArrows, false);
  assert.equal(normalized.showLiquidationCandleSums, false);
  assert.equal(normalized.showLiquidations, true, 'main Liq data remains available');
  assert.equal(normalized.showVolumes, true, 'other chart controls remain untouched');
  assert.equal(normalized.showMarketPrintSums, false, 'existing large-trade amount setting remains untouched');
});

test('existing users retain previous defaults and can independently re-enable the three settings', () => {
  assert.equal(ORIGINAL_HOOKCHART_DEFAULTS.showMarketPrintArrows, true);
  assert.equal(ORIGINAL_HOOKCHART_DEFAULTS.showLiquidationArrows, true);
  assert.equal(ORIGINAL_HOOKCHART_DEFAULTS.showLiquidationCandleSums, true);

  const existing = normalizeOriginalHookChartPreferences();
  assert.equal(existing.showMarketPrintArrows, true);
  assert.equal(existing.showLiquidationArrows, true);
  assert.equal(existing.showLiquidationCandleSums, true);

  const selected = normalizeOriginalHookChartPreferences({
    ...newAccountVisuals,
    showMarketPrintArrows: true,
    showLiquidationArrows: true,
    showLiquidationCandleSums: true,
  });
  assert.equal(selected.showMarketPrintArrows, true);
  assert.equal(selected.showLiquidationArrows, true);
  assert.equal(selected.showLiquidationCandleSums, true);
});

test('HookChart settings still expose manual controls for all three options', () => {
  const settings = readFileSync(new URL('../src/components/hookchart/OriginalHookChartSettings.tsx', import.meta.url), 'utf8');
  for (const [label, name] of [
    ['Стрілка до суми великих ринкових угод', 'showMarketPrintArrows'],
    ['Показувати стрілки ліквідацій', 'showLiquidationArrows'],
    ['Показувати суми Liq під свічками', 'showLiquidationCandleSums'],
  ]) {
    assert.ok(settings.includes('label="' + label + '"'));
    assert.ok(settings.includes("set('" + name + "', value)"), 'the ' + name + ' toggle stays editable');
  }
});
