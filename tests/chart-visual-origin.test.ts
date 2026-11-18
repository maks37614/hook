import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chartPageVisualContext, readChartPageHash } from '../src/utils/chartPageRoute';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('origin comes from the page, not the presence of a formation', () => {
  const app = source('../src/App.tsx');
  const select = app.slice(app.indexOf('const handleSelectPair ='), app.indexOf('const handleOpenWatchlistChart ='));
  assert.ok(select.includes("origin: activePage === 'patterns' ? 'formations' : 'screener'"));
  assert.ok(select.includes('formationId: rawFormation?.id'));
  assert.ok(app.includes('visualOrigin={chartPageVisualOrigin(chartRoute)}'));
});

test('Screener uses Screener quick/full even when selected coin has a formation', () => {
  const detail = source('../src/components/FormationDetailsModal.tsx');
  assert.ok(detail.includes("visualContext={visualOrigin === 'screener' ? 'screenerQuick' : 'formationsQuick'}"));
  assert.ok(detail.includes("visualContext={visualOrigin === 'screener' ? 'screenerFull' : 'formationsFull'}"));
  assert.ok(detail.includes('onOpenFullscreen={() => setIsFullscreenChartOpen(true)}'));
});

test('favorite navigation and timeframe change preserve chart origin', () => {
  const app = source('../src/App.tsx');
  const section = app.slice(app.indexOf('const selectFavoriteOnChartPage'), app.indexOf('// Reuse existing scan results.'));
  assert.equal(section.split('origin: chartRoute.origin').length - 1, 2);
  assert.ok(app.includes('visualContext={chartPageVisualContext(chartRoute, true)}'));
  assert.ok(app.includes("chartPageVisualOrigin(chartRoute) === 'screener' ? 'screener' : 'formations'"));
  for (const origin of ['screener', 'formations'] as const) {
    const route = readChartPageHash('#/chart/bybit/futures/BTCUSDT/15m?formation=breakout&origin=' + origin);
    assert.ok(route);
    assert.equal(chartPageVisualContext(route,false),origin === 'screener' ? 'screenerQuick' : 'formationsQuick');
    assert.equal(chartPageVisualContext(route,true),origin === 'screener' ? 'screenerFull' : 'formationsFull');
  }
});

test('early-detection and terminal contexts remain independent', () => {
  const app = source('../src/App.tsx');
  const early = app.slice(app.indexOf("chartRoute?.kind === 'early' ? ("), app.indexOf("activeSelectedPair?.formation &&"));
  assert.ok(early.includes('earlyCandidate={activeEarlyCandidate}'));
  const hook = source('../src/components/hookchart/HookChartCanvas.tsx');
  assert.ok(hook.includes("const activeVisualContext = terminalMode ? terminalVisualContext : (visualContext || 'screenerQuick')"));
});
