import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { TerminalChartBlock } from '../src/types';
import { normalizeTerminalBlocks } from '../src/utils/terminalPresets';
import { filterVisibleTradeMarkers, formationChartMarkers } from '../src/utils/hookchartData';
import type { ChartMarkerInfo, DetectedFormation } from '../src/types';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('TP/SL is a separate cloud-saved, default-off switch on each Terminal chart', () => {
  const type = read('../src/types.ts');
  const widget = read('../src/components/terminal/TerminalChartWidget.tsx');
  const exchange = read('../src/components/ExchangeCandlestickChart.tsx');
  const chart = read('../src/components/TradingViewChart.tsx');
  const canvas = read('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(type, /showTradeLevels\?: boolean/);
  assert.match(widget, /const showTradeLevels = block\.showTradeLevels === true/);
  assert.match(widget, /onToggle: \(\) => onUpdateBlock\(\{ showTradeLevels: !showTradeLevels \}\)/);
  assert.match(widget, /tradeLevelToggle=\{tradeLevelToggle\}/);
  assert.match(exchange, /tradeLevelToggle=\{tradeLevelToggle\}/);
  assert.match(chart, /terminalTradeLevelsVisible === undefined/);
  assert.match(chart, /previewMarkers && terminalTradeLevelsVisible === undefined/);
  assert.match(chart, /tradeLevelToggle=\{tradeLevelToggle \|\| !previewMarkers \? combinedTradeLevels : undefined\}/);
  assert.match(canvas, /aria-pressed=\{tradeLevelToggle\.visible\}/);
  assert.match(canvas, /onClick=\{tradeLevelToggle\.onToggle\}/);
  assert.match(canvas, /<span>TP\/SL<\/span>/);
});

test('Turning off trade labels filters all three lines but keeps other technical overlays', () => {
  const formation = { levels: {
    entryPrice: 100, targetPrice: 110, stopLossPrice: 95, necklinePrice: 100,
    supportPrice: 92, resistancePrice: 113,
  } } as DetectedFormation;
  const source = formationChartMarkers(formation);
  const hidden = filterVisibleTradeMarkers(source, { entry: false, target: false, stop: false });
  assert.equal(hidden.some(x => ['entry', 'target', 'stop_loss'].includes(x.type)), false);
  assert.ok(hidden.some(x => x.type === 'neckline'));
  assert.ok(hidden.some(x => x.type === 'support'));
  const shown = filterVisibleTradeMarkers(source, { entry: true, target: true, stop: true });
  assert.deepEqual(shown, source);
});

test('Existing chart blocks default to hidden, and explicit opt-in survives normalization', () => {
  const block: TerminalChartBlock = {
    id: 'btc', symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
    exchange: 'binance', marketType: 'futures', timeframe: '5m',
  };
  assert.notEqual(block.showTradeLevels, true);
  const [saved] = normalizeTerminalBlocks([{ ...block, showTradeLevels: true }]);
  assert.equal(saved.showTradeLevels, true);
  const [legacy] = normalizeTerminalBlocks([block]);
  assert.notEqual(legacy.showTradeLevels, true);
});

test('TP/SL tooltips are localized, while only the requested chart markers are controlled', () => {
  const canvas = read('../src/components/hookchart/HookChartCanvas.tsx');
  const chart = read('../src/components/TradingViewChart.tsx');
  for (const language of ['uk', 'en', 'pl', 'ru']) {
    assert.match(canvas, new RegExp('\\b' + language + ': \\{ show:'));
  }
  assert.match(chart, /filterVisibleTradeMarkers\(markers, visibility\)/);
  assert.match(chart, /tradeLevelToggle \? \{/);
  assert.match(chart, /onToggle: tradeLevelToggle\.onToggle/);
});
