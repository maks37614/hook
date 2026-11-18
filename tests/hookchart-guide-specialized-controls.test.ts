import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aggregateHookChartCandles } from '../src/components/hookchart/aggregationCache';
import type { Candle } from '../src/components/hookchart/engine';
import { normalizeOriginalHookChartPreferences } from '../src/components/hookchart/OriginalHookChartSettings';

const code = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

test('Liq sums can be hidden without disabling the actual liquidation markers', () => {
  const defaults = normalizeOriginalHookChartPreferences();
  assert.equal(defaults.showLiquidations, true);
  assert.equal(defaults.showLiquidationCandleSums, true);
  assert.equal(normalizeOriginalHookChartPreferences({ showLiquidationCandleSums: false }).showLiquidationCandleSums, false);
  assert.equal(normalizeOriginalHookChartPreferences({ showLiquidations: false }).showLiquidationCandleSums, true);
  const canvas = code('../src/components/hookchart/HookChartCanvas.tsx');
  const engine = code('../src/components/hookchart/engine.tsx');
  const settings = code('../src/components/hookchart/OriginalHookChartSettings.tsx');
  assert.match(canvas, /showLiquidationCandleSums=\{runtimeSettings\.showLiquidationCandleSums !== false\}/);
  assert.match(engine, /if\s*\(!showLiquidationCandleSums\)\s*\{/);
  assert.match(engine, /if\(showLiquidations\)\s*\{/);
  assert.match(settings, /Показувати суми Liq під свічками/);
  assert.match(settings, /showLiquidationCandleSums: true/);
  assert.match(settings, /showLiquidationCandleSums = source\?\.showLiquidationCandleSums !== false/);
  assert.match(canvas, /showMarketPrintSums=\{runtimeSettings\.showMarketPrintSums === true\}/);
});

test('30m auto-levels use 30-minute buckets without introducing a chart-wide 30m timeframe', () => {
  const settings = normalizeOriginalHookChartPreferences({
    levelIntervals: ['5m', '30m', '1h', '1d', 'not-a-timeframe'],
  });
  assert.deepEqual(settings.levelIntervals, ['5m', '30m', '1h', '1d']);
  const canvas = code('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(canvas, /const LEVEL_TFS = new Set<LevelTf>\(\['5m', '15m', '30m'/);
  assert.match(canvas, /const ANALYSIS_TIMEFRAMES = new Set<string>\(\[\.\.\.TIMEFRAMES, '30m'\]\)/);
  const types = code('../src/types.ts');
  assert.doesNotMatch(types.match(/export type Timeframe =[^\n]+/)?.[0] || '', /30m/);
  const exchange = code('../src/utils/directExchangeClient.ts');
  assert.match(exchange, /case '30m': return '30m'/);
  assert.match(exchange, /case '30m': return '30'/);

  const start = 1_800_000_000_000;
  const minute = 60_000;
  const rows: Candle[] = Array.from({ length: 60 }, (_, i) => ({
    t: start + i * minute, o: i, h: i + 2, l: i - 2, c: i + 1, v: 2, n: 1,
  }));
  const result = aggregateHookChartCandles(rows, '1m', '30m');
  assert.ok(result.length >= 2);
  for (const row of result) assert.equal(row.t % (30 * minute), 0);
  assert.equal(result.reduce((sum, row) => sum + row.v, 0), rows.reduce((sum, row) => sum + row.v, 0));
});

test('guide chapters lead to actual settings fields, preserve live chart state and support four languages', () => {
  const guide = code('../src/components/hookchart/HookChartGuide.tsx');
  const settings = code('../src/components/hookchart/OriginalHookChartSettings.tsx');
  const chart = code('../src/components/hookchart/HookChartCanvas.tsx');
  const css = code('../src/components/hookchart/hookChartGuide.css');
  for (const field of [
    'Ліквідації на графіку', 'Показувати суми Liq під свічками', 'Long (L)', 'Short (S)',
    'Мінімальна сума Long (USD)', 'Блок Liq + каскад',
    'Таймфрейми автовизначення рівнів', 'Підписи рівнів', 'Тип міток рівнів',
    'Аналіз великих лімітних заявок (щільностей)', 'Щільності на графіку',
    'Пороговий об’єм великих ордерів', 'Що показувати в AUTO',
    'Прогнозні зони Liq · модель за історією',
  ]) {
    assert.ok(guide.includes(field), 'tour needs the settings target: ' + field);
    assert.ok(settings.includes('label="' + field + '"'), 'settings must render its target: ' + field);
  }
  for (const lang of ['uk', 'en', 'pl', 'ru']) {
    assert.ok(guide.includes('  ' + lang + ': {'), 'Missing guide language: ' + lang);
  }
  assert.match(settings, /data-hookchart-guide-setting=\{label\}/);
  assert.match(settings, /guidedTab\?: 'main' \| 'levels'/);
  assert.match(chart, /React\.lazy\(\(\) => import\('\.\/HookChartGuide'\)/);
  assert.match(guide, /createPortal\(/);
  assert.match(guide, /onNavigate\(step\.tab \?\? null\)/);
  assert.match(css, /pointer-events: none/);
});

test('guide question mark is only inside the expanded drawing toolbar, not over chart candles', () => {
  const source = code('../src/components/hookchart/HookChartCanvas.tsx');
  const css = code('../src/components/hookchart/integration.css');
  const guideIndex = source.indexOf('className="hookchart-guide-entry"');
  const drawerIndex = source.indexOf('{drawingToolbarOpen && <div className="floatingDrawTools"');
  const drawerEnd = source.indexOf("{!archiveMode && drawingToolbarOpen && panel === 'indicators'", drawerIndex);
  const stageIndex = source.indexOf('<div className="chartStage"');
  assert.ok(stageIndex >= 0 && drawerIndex > stageIndex && guideIndex > drawerIndex && guideIndex < drawerEnd,
    'guide button must be inside the conditional drawing rail, never at chart stage level');
  assert.equal((source.match(/className="hookchart-guide-entry"/g) || []).length, 1);
  assert.match(source.slice(drawerIndex, guideIndex), /!terminalMode && !replay && !archiveMode && <React\.Fragment>/);
  assert.match(source, /const drawingToolbarOpen = archiveMode \? archiveDrawingToolbarOpen : !replay && !terminalMode && guideOpen\s*\? true/);
  assert.match(source, /\{guideOpen && !terminalMode && !replay && <React\.Suspense/);
  assert.match(source, /onClick=\{\(\) => \{ setPanel\(null\); setGuideOpen\(true\); \}\}/);
  assert.match(css, /\.floatingDrawTools > \.hookchart-guide-entry/);
  assert.doesNotMatch(css, /\.chartStage > \.hookchart-guide-entry/);
  assert.doesNotMatch(css, /\.chartStage\[data-drawing-tools="open"\] > \.hookchart-guide-entry/);
  assert.ok(!source.slice(drawerIndex, drawerEnd).includes('changeSettings'),
    'opening a tour must not persist the toolbar state');
});
