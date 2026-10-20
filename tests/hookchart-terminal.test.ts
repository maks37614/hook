import test from 'node:test';
import assert from 'node:assert/strict';
import { hookChartHorizontalRange, terminalHookViewport } from '../src/utils/hookchartData.ts';
import type { DetectedFormation } from '../src/types';

const candles = Array.from({ length: 1000 }, (_, i) => ({ t: 1_700_000_000_000 + i * 60_000 }));
const formation = (end: number, span: number) => ({ id: 'formation', detectedAt: candles[end].t,
  candleStartIndex: 10, candleEndIndex: 10 + span - 1 } as DetectedFormation);

test('terminal cards show at least 180 bars with small candles at every card width', () => {
  for (const width of [240, 450, 900]) {
    const viewport = terminalHookViewport(candles, width);
    const range = hookChartHorizontalRange(candles.length, width, viewport, 8);
    assert.ok(range.virtualEnd - range.virtualStart >= 180);
    assert.ok(viewport.barWidth <= 3);
    assert.equal(range.virtualEnd, candles.length + 8);
    assert.equal(viewport.autoY, true);
  }
});

test('formation focus uses detection time and includes the pattern plus preceding history', () => {
  const viewport = terminalHookViewport(candles, 450, formation(600, 100));
  const range = hookChartHorizontalRange(candles.length, 450, viewport, 8);
  assert.ok(range.virtualStart <= 501 - 80);
  assert.ok(range.virtualEnd > 600);
  assert.ok(range.virtualEnd < 1000, 'an older formation is not replaced by the latest candles');
  assert.ok(range.virtualStart > 10, 'scanner indices do not anchor into unrelated loaded history');
});

test('long formations fit with history even inside narrow terminal cards', () => {
  const viewport = terminalHookViewport(candles, 240, formation(800, 400));
  const range = hookChartHorizontalRange(candles.length, 240, viewport, 8);
  assert.ok(range.virtualStart <= 401 - 80);
  assert.ok(range.virtualEnd > 800);
  assert.ok(viewport.barWidth < 1);
});

test('unavailable or invalid formation timestamps fall back to the latest history', () => {
  for (const detectedAt of [NaN, Infinity, candles[0].t - 60_000, candles.at(-1)!.t + 60_000]) {
    const viewport = terminalHookViewport(candles, 450, { ...formation(600, 100), detectedAt });
    assert.deepEqual(viewport, terminalHookViewport(candles, 450));
  }
});
