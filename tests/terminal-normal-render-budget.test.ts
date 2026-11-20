import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mergeLiveCandle } from '../src/utils/hookchartData';
import type { Kline } from '../src/types';

const candle = (time: number, close = 100): Kline =>
  ({ time, open: 99, high: 101, low: 98, close, volume: 400 });

test('identical live kline snapshots preserve the full candle history reference', () => {
  const history = Array.from({ length: 3000 }, (_, i) => candle(1700000000 + i * 60));
  assert.strictEqual(mergeLiveCandle(history, { ...history[history.length - 1] }), history);
  assert.equal(history.length, 3000);
});

test('a real change in price, volume or exchange trade statistics still replaces the latest candle', () => {
  const first: Kline = { ...candle(1700000000), tradeCount: 7, buyVolume: 100,
    buyQuoteVolume: 1000, quoteVolume: 2000 };
  const old = [first];
  for (const patch of [
    { close: 101 }, { high: 102 }, { low: 97 }, { open: 98 },
    { volume: 450 }, { tradeCount: 8 }, { buyVolume: 101 },
    { buyQuoteVolume: 1001 }, { quoteVolume: 2001 },
  ]) {
    const next = mergeLiveCandle(old, { ...first, ...patch });
    assert.notStrictEqual(next, old, 'the market changed: ' + JSON.stringify(patch));
    assert.equal(next.length, 1);
    assert.equal(next[0].time, first.time);
  }
  assert.strictEqual(mergeLiveCandle(old, { ...first, time: first.time - 60 }), old);
  assert.equal(mergeLiveCandle(old, candle(first.time + 60)).length, 2);
});

test('ordinary Terminal refresh avoids loading-state churn after the first quote snapshot', () => {
  const source = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /const marketSnapshotLoadedRef = useRef\(false\)/);
  assert.match(source, /if \(!marketSnapshotLoadedRef\.current\) setMarketLoading\(true\)/);
  assert.match(source, /marketSnapshotLoadedRef\.current = true;\s*setMarketSnapshot\(next\)/);
  assert.match(source, /document\.visibilityState === 'hidden'/);
  assert.match(source, /setInterval\(\(\) => \{ void load\(\); \}, 30_000\)/);
});

test('density book publishes stable references on its hold-time clock when depth is unchanged', () => {
  const source = readFileSync(new URL('../src/components/hookchart/useOriginalHookChartLiveFeed.ts', import.meta.url), 'utf8');
  assert.match(source, /setBook\(current => current === next\.book \? current : next\.book\)/);
  assert.match(source, /stopDepthHoldClockSubscription = sharedChartClock\.subscribe\(/);
  assert.match(source, /if \(status !== 'live'\) clearDepth\(\)/);
});

test('Terminal keeps one live visual refresh path despite multiple coin blocks', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  const grid = readFileSync(new URL('../src/components/terminal/TerminalGridItem.tsx', import.meta.url), 'utf8');
  const widget = readFileSync(new URL('../src/components/terminal/TerminalChartWidget.tsx', import.meta.url), 'utf8');
  assert.match(page, /isOnlyChart=\{visibleWorkspaceBlocks\.length === 1\}/);
  assert.match(grid, /isSingleBlock=\{false\}/);
  assert.match(grid, /isOnlyChart=\{isOnlyChart\}/);
  assert.match(widget, /const shouldLoadWidgets = !isSuspended && isNearViewport/);
  assert.match(widget, /useLayoutEffect\(\(\) => \{/);
  assert.match(widget, /isMaximized \|\| compactFullscreenMode/);
  assert.doesNotMatch(widget, /isOnlyChart \|\| isNearViewport/,
    'a single Terminal chart must also suspend when the user cannot see it');
  assert.match(widget, /historyLimit=\{isMaximized \|\| isSingleBlock \|\| isOnlyChart \? 1000 : 180\}/);
  assert.doesNotMatch(page, /new WebSocket\(/);
});
