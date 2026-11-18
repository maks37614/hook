import test from 'node:test';
import assert from 'node:assert/strict';
import { HOOKCHART_PRICE_SCALE_WIDTH, hookChartPlotWidth } from '../src/components/hookchart/priceScale';
import { hookChartHorizontalRange } from '../src/utils/hookchartData';

test('HookChart reserves the price-scale area on mobile and desktop', () => {
  for (const width of [320, 375, 390, 768, 1280]) {
    const plotWidth = hookChartPlotWidth(width);
    assert.equal(plotWidth + HOOKCHART_PRICE_SCALE_WIDTH, width);
    assert.ok(plotWidth < width);
  }
});

test('HookChart range ends exactly at the plot boundary, not inside the price scale', () => {
  const plotWidth = hookChartPlotWidth(390);
  const range = hookChartHorizontalRange(250, plotWidth, { barWidth: 9, rightOffset: 8 }, 8, 20);
  assert.ok(Math.abs((range.virtualEnd - range.virtualStart) * range.step - plotWidth) < 1e-9);
});

test('HookChart clamps extremely narrow layouts without a negative plot width', () => {
  assert.equal(hookChartPlotWidth(HOOKCHART_PRICE_SCALE_WIDTH), 1);
  assert.equal(hookChartPlotWidth(NaN), 1);
});
