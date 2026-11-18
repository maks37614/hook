import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChartMarkerInfo, DetectedFormation } from '../src/types';
import { filterVisibleTradeMarkers, formationChartMarkers, hasCompleteTradeLevelSet, terminalChartMarkers, toggleCombinedTradeLevels } from '../src/utils/hookchartData';

const formation = {
  patternKey: 'double_top',
  levels: {
    entryPrice: 100,
    targetPrice: 115,
    stopLossPrice: 95,
    necklinePrice: 102,
    supportPrice: 90,
    resistancePrice: 120,
  },
} as DetectedFormation;

const tradeMarkerTypes = ['entry', 'target', 'stop_loss'];

test('Terminal HookChart hides TP, Entry and SL together until explicitly enabled', () => {
  const hidden = terminalChartMarkers(formation, false, '15m');
  assert.equal(hidden.some(marker => tradeMarkerTypes.includes(marker.type)), false);
  assert.deepEqual(hidden.map(marker => marker.type), ['neckline', 'resistance', 'support']);

  const shown = terminalChartMarkers(formation, true, '15m');
  assert.deepEqual(shown.filter(marker => tradeMarkerTypes.includes(marker.type)).map(marker => marker.label),
    ['Вхід', 'TP', 'SL']);
  assert.equal(terminalChartMarkers(formation, false, '15m').some(marker => tradeMarkerTypes.includes(marker.type)), false);
});

test('Terminal ordinary formations hide neckline by default but can show it manually', () => {
  const regular = { ...formation, patternKey: 'bull_flag' };
  assert.equal(terminalChartMarkers(regular, false, '15m').some(marker => marker.type === 'neckline'), false);
  assert.equal(terminalChartMarkers(regular, false, '15m', undefined, true)
    .some(marker => marker.type === 'neckline'), true);
});

test('Terminal TP/SL switch filters trade markers without suppressing other custom annotations', () => {
  const custom = [
    { id: 'entry', type: 'entry', label: 'Вхід', price: 100, color: '#fff' },
    { id: 'tp', type: 'target', label: 'TP', price: 110, color: '#fff' },
    { id: 'sl', type: 'stop_loss', label: 'SL', price: 90, color: '#fff' },
    { id: 'note', type: 'custom', label: 'Нотатка', price: 101, color: '#fff' },
  ] satisfies ChartMarkerInfo[];

  assert.deepEqual(terminalChartMarkers(formation, false, '15m', custom).map(marker => marker.id), ['note']);
  assert.deepEqual(terminalChartMarkers(formation, true, '15m', custom), custom);
});

test('Other chart pages retain the account-wide formation-label behavior', () => {
  assert.deepEqual(formationChartMarkers(formation).slice(0, 3).map(marker => marker.label), ['Вхід', 'TP', 'SL']);
});

test('Fullscreen TP/SL button enables all three from a mixed state, then hides all three', () => {
  const partiallyShown = { entry: true, target: false, stop: true };
  const enabled = toggleCombinedTradeLevels(partiallyShown);
  assert.deepEqual(enabled, { entry: true, target: true, stop: true });
  const disabled = toggleCombinedTradeLevels(enabled);
  assert.deepEqual(disabled, { entry: false, target: false, stop: false });
});

test('Fullscreen grouped level settings also hide supplied custom TP, Entry and SL lines', () => {
  const source = [
    { id: 'entry', type: 'entry', label: 'Вхід', price: 100, color: '#fff' },
    { id: 'tp', type: 'target', label: 'TP', price: 110, color: '#fff' },
    { id: 'sl', type: 'stop_loss', label: 'SL', price: 90, color: '#fff' },
    { id: 'note', type: 'custom', label: 'Нотатка', price: 101, color: '#fff' },
  ] satisfies ChartMarkerInfo[];
  assert.deepEqual(filterVisibleTradeMarkers(source, { entry: false, target: false, stop: false }).map(marker => marker.id), ['note']);
  assert.deepEqual(filterVisibleTradeMarkers(source, { entry: true, target: true, stop: true }), source);
});

test('combined TP/SL toggle needs a complete three-level formation or custom setup', () => {
  assert.equal(hasCompleteTradeLevelSet(formation), true);
  const incomplete = { ...formation, levels: { ...formation.levels, stopLossPrice: 0 } };
  assert.equal(hasCompleteTradeLevelSet(incomplete), false);
  const custom = [
    { id: 'entry', type: 'entry', label: 'Вхід', price: 100, color: '#fff' },
    { id: 'target', type: 'target', label: 'TP', price: 110, color: '#fff' },
    { id: 'stop', type: 'stop_loss', label: 'SL', price: 90, color: '#fff' },
  ] satisfies ChartMarkerInfo[];
  assert.equal(hasCompleteTradeLevelSet(null, custom), true);
  assert.equal(hasCompleteTradeLevelSet(formation, custom.slice(0, 2)), false,
    'partial archive markers override formation levels and cannot display all three');
});
