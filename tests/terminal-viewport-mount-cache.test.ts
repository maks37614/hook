import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Kline } from '../src/types';
import { createTerminalChartMountQueue } from '../src/utils/terminalChartMountQueue';
import { clearTerminalChartHistory, readTerminalChartHistory, saveTerminalChartHistory } from '../src/utils/terminalChartHistoryCache';

test('Terminal mounts at most one newly visible chart per display frame', () => {
  let next = 1;
  const frames = new Map<number, FrameRequestCallback>();
  const queue = createTerminalChartMountQueue({
    request: cb => { const id = next++; frames.set(id, cb); return id; },
    cancel: id => { frames.delete(id); },
  });
  const mounted: string[] = [];
  const cancelA = queue.enqueue(() => mounted.push('A'));
  const cancelB = queue.enqueue(() => mounted.push('B'));
  queue.enqueue(() => mounted.push('C'));
  assert.equal(queue.pendingCount(), 3);
  assert.equal(frames.size, 1, 'one shared animation frame for every queued chart');
  const runFrame = () => {
    assert.equal(frames.size, 1);
    const [id, cb] = frames.entries().next().value!;
    frames.delete(id);
    cb(0);
  };
  runFrame();
  assert.deepEqual(mounted, ['A']);
  assert.equal(queue.pendingCount(), 2);
  cancelB(); // fast scrolling removed B before a high-DPR canvas was allocated
  runFrame();
  assert.deepEqual(mounted, ['A', 'C']);
  assert.equal(queue.pendingCount(), 0);
  assert.equal(frames.size, 0);
  cancelA(); // cancelling an already granted slot is harmless
});

test('queued charts never start after leaving the viewport', () => {
  const frames = new Map<number, FrameRequestCallback>();
  let next = 1;
  const queue = createTerminalChartMountQueue({
    request: cb => { const id = next++; frames.set(id, cb); return id; },
    cancel: id => { frames.delete(id); },
  });
  let mounts = 0;
  const cancel = queue.enqueue(() => mounts++);
  cancel();
  assert.equal(queue.pendingCount(), 0);
  assert.equal(frames.size, 0);
  assert.equal(mounts, 0);
});

const market = (symbol: string, marketType: 'spot' | 'futures' = 'futures') => ({
  exchange: 'binance' as const, marketType, symbol, timeframe: '5m' as const,
});
const candle = (time: number): Kline => ({
  time, open: 100, high: 110, low: 90, close: 105, volume: 900,
});

test('returning Terminal charts reuse only bounded real OHLCV and always expire stale snapshots', () => {
  clearTerminalChartHistory();
  try {
    const data = Array.from({ length: 260 }, (_, i) => candle(i * 300));
    saveTerminalChartHistory(market('BTCUSDT'), data, 1_000);
    const resumed = readTerminalChartHistory(market('BTCUSDT'), 2_000);
    assert.equal(resumed?.length, 180);
    assert.deepEqual(resumed?.at(-1), data.at(-1));
    assert.equal(resumed?.at(0)?.time, data[80].time);
    assert.equal(readTerminalChartHistory(market('BTCUSDT', 'spot'), 2_000), null,
      'spot cannot inherit a futures chart history');
    assert.equal(readTerminalChartHistory(market('ETHUSDT'), 2_000), null);
    assert.equal(readTerminalChartHistory(market('BTCUSDT'), 121_001), null);
  } finally { clearTerminalChartHistory(); }
});

test('Terminal chart warm cache uses a bounded LRU and excludes trade-derived 30s data', () => {
  clearTerminalChartHistory();
  try {
    const data = [candle(1), candle(2)];
    saveTerminalChartHistory({ ...market('BTCUSDT'), timeframe: '30s' }, data, 1_000);
    assert.equal(readTerminalChartHistory({ ...market('BTCUSDT'), timeframe: '30s' }, 1_001), null);
    for (let i = 0; i < 33; i++)
      saveTerminalChartHistory(market('T' + i + 'USDT'), data, 1_000);
    assert.equal(readTerminalChartHistory(market('T0USDT'), 2_000), null, 'eldest entry evicted');
    assert.equal(readTerminalChartHistory(market('T32USDT'), 2_000)?.length, 2);
  } finally { clearTerminalChartHistory(); }
});

test('Terminal warm cache never replaces the fresh history fetch or changes DPR', () => {
  const chart = readFileSync(new URL('../src/components/TradingViewChart.tsx', import.meta.url), 'utf8');
  const widget = readFileSync(new URL('../src/components/terminal/TerminalChartWidget.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(chart, /readTerminalChartHistory\(\{ exchange, marketType, symbol, timeframe \}\)/);
  assert.match(chart, /saveTerminalChartHistory\(/);
  assert.match(chart, /async function loadFullHistory\(\)/);
  assert.match(chart, /await fetchSharedHistoricalKlines\(/);
  assert.match(widget, /terminalChartMountQueue\.enqueue\(\(\) => \{/);
  assert.match(widget, /isTerminalWidgetNearViewport\(node\.getBoundingClientRect\(\), bounds, screen\)/);
  assert.match(widget, /const shouldLoadWidgets = !isSuspended && isNearViewport && isMountReady/);
  assert.match(page, /terminalActiveCharts=\{maximizedBlockId \? 1 : visibleChartCount\}/);
  assert.match(page, /visibleChartIdsRef\.current\.has\(block\.id\)/);
  assert.doesNotMatch(widget, /maxCanvasDpr|devicePixelRatio/);
});
