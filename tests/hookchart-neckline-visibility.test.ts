import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ChartMarkerInfo, DetectedFormation } from '../src/types';
import {
  coalesceNecklinePriceMarkers, defaultFormationNecklineVisible,
  filterFormationNeckline, formationChartMarkers, hasFormationNeckline, withCalculatedNecklineMarker,
} from '../src/utils/hookchartData';
import {
  chartNecklineScopeKey, chartNecklineStorageKey,
  readChartNecklineOverride, saveChartNecklineOverride,
} from '../src/utils/chartNecklineVisibility';

const wm = {
  id: 'SOLUSDT-double_top-5m', patternKey: 'double_top',
  levels: {
    entryPrice: 70.98, targetPrice: 65.6, stopLossPrice: 74.2,
    necklinePrice: 70.98, supportPrice: 70.98, resistancePrice: 85.0,
  },
} as DetectedFormation;

test('confirmed W/M has its neckline enabled by default, other patterns do not', () => {
  assert.equal(defaultFormationNecklineVisible(wm), true);
  assert.equal(defaultFormationNecklineVisible({ ...wm, patternKey: 'double_bottom' }), true);
  assert.equal(defaultFormationNecklineVisible({ ...wm, patternKey: 'bull_flag' }), false);
  assert.equal(defaultFormationNecklineVisible({ ...wm, patternKey: 'asc_triangle' }), false);
  assert.equal(defaultFormationNecklineVisible({ ...wm, levels: { ...wm.levels, necklinePrice: 0 } }), false);
  assert.equal(defaultFormationNecklineVisible({ ...wm, levels: { ...wm.levels, necklinePrice: Number.NaN } }), false);
  assert.equal(defaultFormationNecklineVisible(null), false);
});

test('neckline is retained when its price equals Entry and Support', () => {
  const markers = formationChartMarkers(wm, { entry: true, target: true, stop: true }, '5m');
  assert.equal(markers.filter(marker => marker.type === 'neckline').length, 1);
  assert.equal(markers.filter(marker => marker.type === 'entry').length, 1);
  assert.equal(markers.find(marker => marker.type === 'neckline')?.price, 70.98);
  assert.equal(hasFormationNeckline(markers), true);
  const paint = coalesceNecklinePriceMarkers(markers);
  assert.deepEqual(paint.filter(marker => marker.price === 70.98).map(marker => marker.type), ['neckline']);
  // The paint-only coalescing must not mutate the real entry/snapshot metadata.
  assert.equal(markers.some(marker => marker.type === 'entry'), true);
  assert.equal(markers.some(marker => marker.type === 'target'), true);
  assert.equal(markers.some(marker => marker.type === 'stop_loss'), true);
});

test('disabling neck restores Entry at same price, without hiding TP or SL', () => {
  const all = formationChartMarkers(wm, { entry: true, target: true, stop: true });
  const off = filterFormationNeckline(all, false);
  assert.equal(off.some(marker => marker.type === 'neckline'), false);
  assert.deepEqual(off.filter(marker => marker.price === 70.98).map(marker => marker.type), ['entry']);
  assert.deepEqual(off.filter(marker => ['entry', 'target', 'stop_loss'].includes(marker.type)).map(marker => marker.type),
    ['entry', 'target', 'stop_loss']);
  assert.equal(filterFormationNeckline(all, true), all, 'enabled state does not create a new marker array');
});

test('distinct neck and entry paint independently, custom markers stay untouched', () => {
  const distinct = formationChartMarkers({ ...wm, levels: { ...wm.levels, necklinePrice: 71.7, supportPrice: 69.4 } });
  assert.equal(coalesceNecklinePriceMarkers(distinct).some(marker => marker.type === 'entry'), true);
  assert.equal(coalesceNecklinePriceMarkers(distinct).some(marker => marker.type === 'neckline'), true);
  const custom: ChartMarkerInfo[] = [
    { id: 'user-note', type: 'custom', price: 70.98, label: 'Note', color: '#eee' },
    { id: 'neck', type: 'neckline', price: 70.98, label: 'Шия', color: '#fbbf24' },
  ];
  assert.deepEqual(coalesceNecklinePriceMarkers(custom).map(marker => marker.id), ['user-note', 'neck']);
});

test('older saved W/M view restores a neckline that was suppressed by equal Entry', () => {
  const oldMarkers: ChartMarkerInfo[] = [
    { id: 'entry', type: 'entry', price: wm.levels.entryPrice, label: 'Вхід', color: '#38bdf8' },
    { id: 'target', type: 'target', price: wm.levels.targetPrice, label: 'TP', color: '#10b981' },
  ];
  const restored = withCalculatedNecklineMarker(wm, oldMarkers, '5m');
  assert.equal(hasFormationNeckline(restored), true);
  assert.equal(restored.length, oldMarkers.length + 1);
  assert.equal(oldMarkers.length, 2, 'original archived list is not mutated');
  assert.equal(coalesceNecklinePriceMarkers(restored)
    .filter(marker => marker.price === wm.levels.entryPrice).length, 1);
  assert.equal(filterFormationNeckline(restored, false).some(marker => marker.type === 'entry'), true);
  assert.equal(withCalculatedNecklineMarker(wm, restored), restored, 'do not duplicate a real neck');
  assert.equal(withCalculatedNecklineMarker(null, oldMarkers), oldMarkers);
});

test('user override is scoped by user, exchange, symbol, TF and formation and restores after remount', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const owner = chartNecklineStorageKey('userA');
  const scope = chartNecklineScopeKey({ exchange: 'binance', marketType: 'futures',
    symbol: 'solusdt', timeframe: '5m', formationId: wm.id });
  const another = chartNecklineScopeKey({ exchange: 'bybit', marketType: 'futures',
    symbol: 'solusdt', timeframe: '5m', formationId: wm.id });
  assert.equal(readChartNecklineOverride(owner, scope, storage), null);
  assert.equal(saveChartNecklineOverride(owner, scope, false, storage), true);
  assert.equal(readChartNecklineOverride(owner, scope, storage), false);
  assert.equal(readChartNecklineOverride(owner, another, storage), null);
  assert.equal(readChartNecklineOverride(chartNecklineStorageKey('userB'), scope, storage), null);
  assert.equal(saveChartNecklineOverride(owner, scope, true, storage), true);
  assert.equal(readChartNecklineOverride(owner, scope, storage), true);
});

test('React toolbar uses the explicit choice and keeps early W/M controls isolated', () => {
  const chart = readFileSync(new URL('../src/components/TradingViewChart.tsx', import.meta.url), 'utf8');
  const toolbar = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  assert.match(chart, /necklineOverride \?\? defaultFormationNecklineVisible\(formation\)/);
  assert.match(chart, /earlyPreviewOwnsNeckline = previewMarkers && !formation/);
  assert.match(chart, /necklineToggle=\{necklineToolbarToggle\}/);
  assert.match(chart, /earlyNecklineToggle\?\.visible \?\? earlyNecklineVisible/);
  const fullscreen = readFileSync(new URL('../src/components/FullscreenChartModal.tsx', import.meta.url), 'utf8');
  assert.match(fullscreen, /visible: earlyLevelVisibility\.neckline/);
  assert.match(fullscreen, /toggleEarlyLevel\('neckline'\)/);
  assert.match(toolbar, /aria-pressed=\{necklineToggle\.visible\}/);
  assert.match(engine, /for\(const marker of paintedMarkers\)/);
});
