import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const analysis = readFileSync(new URL('../src/components/ChartTopAnalysisText.tsx', import.meta.url), 'utf8');
const chartPage = readFileSync(new URL('../src/components/FormationDetailsModal.tsx', import.meta.url), 'utf8');
const view = analysis.slice(analysis.lastIndexOf('  return (\n    <div className='));

test('chart top analysis centers the pair of columns within the chart on desktop', () => {
  assert.match(view, /data-testid="chart-top-analysis-columns"/);
  assert.match(view, /className="mx-auto grid w-full max-w-\[680px\] min-w-0 grid-cols-2/);
  assert.match(view, /items-start gap-x-3 gap-y-2 px-1/);
  assert.match(view, /sm:gap-x-6 sm:px-2 sm:text-xs lg:gap-x-10/);
  assert.equal((view.match(/<div className="min-w-0 space-y-1 break-words \[overflow-wrap:anywhere\]">/g) ?? []).length, 2);
  assert.doesNotMatch(view, /absolute|translate-x|left-1\/2|right-0/);
});

test('both columns remain visible on mobile with no fixed minimum width or clipping', () => {
  assert.match(view, /grid-cols-2/);
  assert.match(view, /w-full max-w-\[680px\] min-w-0/);
  assert.doesNotMatch(view, /overflow-hidden|overflow-x-auto|hidden sm:/);
  // Only the OI percentage and its status dot are atomic; long text in
  // the analysis columns must still wrap on narrow phone screens.
  assert.equal((view.match(/inline-flex items-center gap-0\.5 whitespace-nowrap align-middle/g) ?? []).length, 2);
  assert.equal((view.match(/whitespace-nowrap/g) ?? []).length, 2);
  for (const label of ['Стопи шорт:', 'POC:', 'Стопи лонг:', 'Супротив:', 'Підтримка:', 'OI Binance:', 'OI Bybit:']) {
    assert.ok(view.includes(label), label);
  }
});

test('analysis stays directly above the chart and does not change its computation or data requests', () => {
  assert.match(chartPage, /<div ref=\{chartSectionRef\} tabIndex=\{-1\} className="space-y-3 outline-none">\s*\{\/\* Real-time Analysis Plain Text/);
  assert.match(chartPage, /\{!showArchivedStatic && <ChartTopAnalysisText[\s\S]*?\/>\}\s*\{chartHistoryLoading/);
  assert.match(chartPage, /const showArchivedStatic = archivedVisualAvailable && !showLiveArchivedChart/);
  assert.match(analysis, /void refresh\(true\)/);
  assert.match(analysis, /formatCryptoPrice\(analysis\.sslPrice\)/);
  assert.match(analysis, /formatCryptoPrice\(analysis\.strongSupply\)/);
});

test('funding sits below long stops in the left column without changing the two-column layout', () => {
  const stopLong = view.indexOf('tr("Стопи лонг:")');
  const binanceFunding = view.indexOf('data-testid="chart-top-funding-binance"');
  const bybitFunding = view.indexOf('data-testid="chart-top-funding-bybit"');
  const rightColumn = view.indexOf('{/* Section 2:');
  assert.ok(stopLong >= 0 && stopLong < binanceFunding && binanceFunding < bybitFunding && bybitFunding < rightColumn);
  assert.match(view, /coin.marketType === 'futures'/);
});

test('Binance and Bybit OI status dots stay anchored next to their percentages', () => {
  for (const exchange of ['binance', 'bybit']) {
    const start = view.indexOf(`{${exchange}OI.change5mPct !== null && (`);
    const row = view.slice(view.indexOf(`OI ${exchange === 'binance' ? 'Binance' : 'Bybit'}:`), view.indexOf('</div>', start));
    const groupStart = row.indexOf('ml-1 inline-flex items-center gap-0.5 whitespace-nowrap align-middle');
    const conditional = row.indexOf(`{${exchange}OI.change5mPct !== null && (`);
    const dot = row.indexOf(`title={${exchange}OiStale ?`);
    assert.ok(groupStart >= 0 && groupStart < conditional && conditional < dot,
      exchange + ' dot must share a nonwrapping inline group with percentage');
    assert.match(row, /h-1\.5 w-1\.5 shrink-0 rounded-full/);
    assert.match(row, /text-\[10px\] sm:text-\[11px\]/);
    assert.doesNotMatch(row, /rounded-full ml-1\.5/);
  }
});
