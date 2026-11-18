import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasDirectionalTradeLevels, isScreener24hPreview } from '../src/utils/formationTradeGeometry';
import { formationDetailsRows } from '../src/locales/formationDetails20261115';
import { supportedLanguages, translatePhrase } from '../src/locales';
import type { DetectedFormation } from '../src/types';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const make = (bias: DetectedFormation['bias'], entry: number, target: number, stop: number) => ({
  bias, levels: { entryPrice: entry, targetPrice: target, stopLossPrice: stop },
});

test('bullish and bearish price-alert bundles require consistently ordered finite levels', () => {
  assert.equal(hasDirectionalTradeLevels(make('bullish', 100, 105, 98)), true);
  assert.equal(hasDirectionalTradeLevels(make('bearish', 100, 95, 102)), true);
  assert.equal(hasDirectionalTradeLevels(make('bearish', 100, 105, 98)), false);
  assert.equal(hasDirectionalTradeLevels(make('bullish', 100, 95, 102)), false);
  assert.equal(hasDirectionalTradeLevels(make('bullish', 100, 100, 98)), false);
  assert.equal(hasDirectionalTradeLevels(make('bearish', 100, 95, 100)), false);
  assert.equal(hasDirectionalTradeLevels(make('neutral', 100, 105, 98)), false);
  for (const value of [0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(hasDirectionalTradeLevels(make('bullish', value, 105, 98)), false);
    assert.equal(hasDirectionalTradeLevels(make('bullish', 100, value, 98)), false);
    assert.equal(hasDirectionalTradeLevels(make('bearish', 100, 95, value)), false);
  }
});

test('client-only screener reference is identified without confusing scanner results', () => {
  assert.equal(isScreener24hPreview({
    source: 'screener_24h_preview', id: 'screener_preview_binance_futures_BTCUSDT',
    patternKey: 'range',
  }), true);
  assert.equal(isScreener24hPreview({
    id: 'screener_BTCUSDT_1794870000000', patternKey: 'range',
  }), true, 'old saved synthetic screener ranges should not display fake score');
  assert.equal(isScreener24hPreview({
    id: 'BTCUSDT-level-breakout-1h-120', patternKey: 'level_breakout',
  }), false);
  assert.equal(isScreener24hPreview({
    id: 'screener_BTCUSDT_1794870000000', patternKey: 'range',
    validation: { passed: true } as DetectedFormation['validation'],
  }), false);
});

test('reference scenario never claims detected formation or scanner-rated 85/100 in details', () => {
  const modal = read('src/components/FormationDetailsModal.tsx');
  const screener = read('src/components/CoinScreenerPage.tsx');
  assert.match(screener, /source: 'screener_24h_preview'/);
  assert.match(screener, /confidence: 0/);
  assert.doesNotMatch(screener, /confidence: 85/);
  assert.match(modal, /const isReferencePreview = isScreener24hPreview\(formation\)/);
  assert.match(modal, /isReferencePreview \? 'Довідкові рівні 24h' : 'Виявлена формація'/);
  assert.match(modal, /isReferencePreview \? '—' :/);
  assert.match(modal, /isReferencePreview \? 'Оцінка не проводилася' : 'Якість сетапу'/);
  assert.match(modal, /disabled=\{isReferencePreview\}/);
  assert.match(modal, /!isReferencePreview && qualityExpanded/);
  assert.match(modal, /Довідкові рівні не є підтвердженим торговим сигналом/);
  assert.match(modal, /isReferencePreview \? 'Орієнтовні рівні \(24h\)' : 'Торгові рівні \(Setup\)'/);
  assert.match(modal, /isScreener24hPreview\(item\) \? tr\('Довідкові рівні 24h'\)/);
  assert.match(modal, /formation=\{isReferencePreview \? null : formation\}/);
});

test('24h reference badges remain direction-neutral, while detected LONG and SHORT retain matching arrows', () => {
  const modal = read('src/components/FormationDetailsModal.tsx');
  assert.ok(modal.includes("isReferencePreview ? '24h'"));
  assert.ok(!modal.includes('isReferencePreview ? `24h ${isBullish'));
  assert.ok(modal.includes("isBullish ? ' ▲' : isBearish ? ' ▼' : ''"));
  assert.ok(modal.includes("? 'bg-slate-700/40 text-slate-200 border border-slate-600/50'"));
});

test('invalid formation geometry blocks all quick alerts and bundled Telegram alerts', () => {
  const modal = read('src/components/FormationDetailsModal.tsx');
  assert.match(modal, /const hasValidDirectionalLevels = hasDirectionalTradeLevels\(formation\)/);
  assert.match(modal, /if \(!Number\.isFinite\(targetPrice\) \|\| targetPrice <= 0 \|\| !hasValidDirectionalLevels\)/);
  assert.match(modal, /const handleSetAllAlerts = async \(\) => \{\s+if \(!hasValidDirectionalLevels\)/);
  assert.equal((modal.match(/disabled=\{settingAlert !== null \|\| !hasValidDirectionalLevels\}/g) || []).length, 4);
  assert.match(modal, /Некоректні рівні Entry\/TP\/SL: сповіщення не створено/);
  // User-entered custom price alerts remain available and independent.
  assert.match(modal, /customAlertCondition/);
  assert.match(modal, /const handleSetQuickLiquidityAlert/);
});

test('new reference and safety labels are correctly translated into four languages', () => {
  const keys = [
    'Виявлена формація', 'Довідкові рівні 24h', 'Довідковий діапазон 24h',
    'Довідкові рівні не є підтвердженим торговим сигналом.',
    'Оцінка не проводилася', 'Орієнтовні рівні (24h)',
    'Некоректні рівні Entry/TP/SL: сповіщення не створено',
  ];
  const rows = new Map<string, readonly string[]>(formationDetailsRows.map(row => [row[0], row] as const));
  for (const key of keys) {
    const row = rows.get(key);
    assert.ok(row, 'missing translation: ' + key);
    for (const [index, lang] of supportedLanguages.entries()) {
      assert.ok(row[index].trim(), lang + ' empty: ' + key);
      assert.equal(translatePhrase(lang, key), row[index], lang + ' ' + key);
    }
  }
});

test('preview and alert safety helpers are constant work and never open streams', () => {
  const code = read('src/utils/formationTradeGeometry.ts') +
    read('src/utils/screenerPreviewTradeLevels.ts');
  assert.doesNotMatch(code, /new WebSocket|fetch\(|setInterval\(|setTimeout\(|addAlertsBatch\(/);
});
