import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');

test('trash on a signal marker deletes immediately, without any confirmation dialog', () => {
  assert.match(engine, /onSelectPriceAlert\?\.\(alertActions\.id,'delete'\)/);
  const choose = canvas.slice(canvas.indexOf('const choosePriceMarker ='), canvas.indexOf('const createTelegramPriceAlert ='));
  assert.match(choose, /if \(action === 'delete'\) \{ void deletePriceMarker\(markerId\); return; \}/);
  assert.doesNotMatch(canvas, /confirmDeletePriceMarker|selectedMarkerAction|Видалити цінове сповіщення/);
  assert.match(canvas, /role="dialog" aria-label="Редагувати сигнальний рівень"/);
});

test('server alert removal remains authoritative and failed requests are not hidden as success', () => {
  const removal = canvas.slice(canvas.indexOf('const deletePriceMarker ='), canvas.indexOf('const choosePriceMarker ='));
  assert.match(removal, /deletingMarkerIds\.current\.has\(markerId\)/);
  assert.match(removal, /if \(!await deleteAlert\(remoteId\)\) throw new Error/);
  assert.match(removal, /setAlerts\(current => current\.filter\(marker => marker\.id !== markerId\)\)/);
  assert.match(removal, /catch \(error\)/);
  assert.match(removal, /finally \{/);
});
