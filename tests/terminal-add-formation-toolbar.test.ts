import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formationChartMarkers } from '../src/utils/hookchartData';
import type { DetectedFormation } from '../src/types';
import { terminalArchiveFormation } from '../src/utils/terminalArchiveFormation';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Terminal expanded HookChart toolbar uses the existing Saved Formations icon instead of Shapes', () => {
  const hook = read('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(hook, /import \{ FormationArchiveIcon \} from '..\/FormationArchiveIcon'/);
  assert.match(hook, /data-terminal-archive-save="true"/);
  assert.match(hook, /onClick=\{terminalArchiveSave\.onSave\}/);
  assert.match(hook, /disabled=\{terminalArchiveSave\.saving\}/);
  assert.match(hook, /<FormationArchiveIcon width=\{16\} height=\{16\}/);
  for (const label of [
    'Зберегти монету в Збережені формації',
    'Save coin to Saved Formations',
    'Zapisz monetę w Zapisanych formacjach',
    'Сохранить монету в Сохранённые формации',
  ]) assert.ok(hook.includes(label), 'missing localized toolbar label: ' + label);
  assert.doesNotMatch(hook, /data-terminal-formation-trigger/);
  const toolbarStart = hook.indexOf('{topToolbarOpen && <div');
  const toolbarEnd = hook.indexOf('<div className={liquidationMapSupported', toolbarStart);
  const icon = hook.indexOf('data-terminal-archive-save="true"');
  assert.ok(toolbarStart >= 0 && toolbarStart < icon && icon < toolbarEnd);
  assert.match(hook, /!replay && !archiveMode && \(terminalMode \|\| visualContext === 'terminalLarge'\)/);
});

test('Terminal saves the exact chart screenshot on click without subscribing to new market feeds', () => {
  const bridge = read('../src/components/TradingViewChart.tsx');
  const exchange = read('../src/components/ExchangeCandlestickChart.tsx');
  const widget = read('../src/components/terminal/TerminalChartWidget.tsx');
  const grid = read('../src/components/terminal/TerminalGridItem.tsx');
  const page = read('../src/components/TerminalPage.tsx');
  assert.match(bridge, /const chartSnapshot = hookChartRef\.current\?\.captureArchiveSnapshot\?\.\(\)/);
  assert.match(bridge, /onAddToArchive\(\{\s*markers: visibleMarkers, chartSnapshot,/);
  assert.match(bridge, /capturedPrice = effectiveKlines\.at\(-1\)\?\.close \|\| latestPriceRef\.current/);
  assert.match(page, /capture\.capturedPrice/);
  assert.match(bridge, /terminalArchiveSave=\{onAddToArchive &&/);
  assert.match(exchange, /onAddToArchive=\{onAddToArchive\}/);
  assert.match(widget, /onAddToArchive=\{onSaveToArchive \? capture => onSaveToArchive\(/);
  assert.match(grid, /onSaveToArchive=\{onSaveToArchive\}/);
  assert.match(page, /onSaveToArchive=\{handleTerminalArchiveCapture\}/);
  assert.match(page, /onAddToArchive=\{capture => \{/);
  assert.match(page, /snapshot\.marketKey !== archiveVisualMarketKey\(/);
  assert.match(page, /<ArchiveEntryReasonDialog/);
  assert.match(page, /await saveToArchive\(pending\.coin, pending\.formation/);
  assert.match(page, /entryReason,/);
  assert.doesNotMatch(widget, /fetch\([^)]*formation|subscribe[^;\n]*formation/i);
});

test('manual saved coins do not invent scanner formations or trades', () => {
  const manual = terminalArchiveFormation(null, 'BTCUSDT', '15m', 1234567);
  assert.equal(manual.patternKey, 'manual');
  assert.equal(manual.bias, 'neutral');
  assert.equal(manual.validation, undefined);
  assert.deepEqual(manual.levels, { entryPrice: 0, targetPrice: 0, stopLossPrice: 0 });
  assert.equal(manual.confidence, 0);
  const real = { id: 'detected', levels: { entryPrice: 100, targetPrice: 110, stopLossPrice: 95 } } as DetectedFormation;
  assert.equal(terminalArchiveFormation(real, 'BTCUSDT', '15m'), real);
  const archive = read('../src/components/ArchiveModal.tsx');
  assert.match(archive, /item\.formation\?\.patternKey === 'manual'/);
  assert.match(archive, /isManual \? '—' : '\$' \+ formatCryptoPrice\(item\.entryPrice\)/);
  assert.match(archive, /isManual \? '—' : '\$' \+ formatCryptoPrice\(item\.targetPrice\)/);
  assert.match(archive, /isManual \? '—' : '\$' \+ formatCryptoPrice\(item\.stopLossPrice\)/);
});

test('saved formation markers remain generated only for an actual previously selected formation', () => {
  const formation = {
    id: 'sample', name: 'W', confidence: 85,
    levels: { entryPrice: 100, targetPrice: 110, stopLossPrice: 95, necklinePrice: 102 },
  } as DetectedFormation;
  const markers = formationChartMarkers(formation, { entry: true, target: true, stop: true }, '1h');
  assert.ok(markers.some(m => m.type === 'entry' && m.price === 100));
  assert.ok(markers.some(m => m.type === 'target' && m.price === 110));
  assert.ok(markers.some(m => m.type === 'stop_loss' && m.price === 95));
  const widget = read('../src/components/terminal/TerminalChartWidget.tsx');
  assert.match(widget, /availableFormations\.find\(item => item\.id === block\.formationId\)/);
  assert.match(widget, /customMarkers=\{chosenMarkers\}/);
  assert.match(widget, /previewMarkers=\{!!chosenFormation\}/);
});
