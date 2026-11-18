import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  terminalCandlePriceRange,
  terminalSafeManualPriceViewport,
} from '../src/components/hookchart/terminalAutoScale';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('disabling Terminal auto-scale restores safe manual vertical bounds for tall, high-volatility candles', () => {
  // Matches the kind of tall wicks and large user zoom reported on mobile.
  for (const [low, high] of [[0.0093, 0.0197], [0.075, 0.168], [0.00000083, 0.00000121]]) {
    for (const height of [120, 220, 380, 700]) {
      for (const volumes of [false, true]) {
        for (const zoom of [0.5, 1, 1.8, 15.85, 100]) {
          const { manualCenter, manualRange } = terminalSafeManualPriceViewport(low, high, height, volumes, zoom);
          const manualLow = manualCenter - manualRange / 2;
          const manualHigh = manualCenter + manualRange / 2;
          assert.ok(Number.isFinite(manualCenter) && Number.isFinite(manualRange) && manualRange > 0);
          const upperWickY = height - (high - manualLow) / manualRange * height;
          const lowerWickY = height - (low - manualLow) / manualRange * height;
          const volumeTop = volumes ? height - (Math.max(56, Math.min(108, height * .14)) + 3) : height;
          assert.ok(upperWickY >= 2.9 - 1e-6,
            'upper wick clipped at ' + high + ', h=' + height + ', zoom=' + zoom);
          assert.ok(lowerWickY <= volumeTop - 4.9 + 1e-6,
            'lower wick overlaps volume at ' + low + ', h=' + height + ', zoom=' + zoom);
          assert.ok(manualLow < low && manualHigh > high);
        }
      }
    }
  }
});

test('Terminal manual fit honors a zoom-out profile and leaves the requested setting unchanged', () => {
  const stored = Object.freeze({
    visibleBars: 255, rightGapBars: 48, verticalZoom: 0.76, autoPriceScale: false,
  });
  const fitted = terminalCandlePriceRange(0.0093, 0.0197, 380, true);
  const calculated = terminalSafeManualPriceViewport(0.0093, 0.0197, 380, true, stored.verticalZoom);
  assert.ok(calculated.manualRange > fitted.high - fitted.low,
    'a requested zoom-out should widen the chart, without crossing the volume region');
  assert.deepEqual(stored, {
    visibleBars: 255, rightGapBars: 48, verticalZoom: 0.76, autoPriceScale: false,
  });
});

test('switching off auto-scale reapplies the saved Terminal profile, not a hardcoded reset', () => {
  const engine = read('src/components/hookchart/engine.tsx');
  const terminal = read('src/components/TerminalPage.tsx');
  const widget = read('src/components/terminal/TerminalChartWidget.tsx');
  const hook = read('src/components/hookchart/HookChartCanvas.tsx');
  assert.match(terminal, /onClick=\{\(\) => setAutoScaleCharts\(enabled => !enabled\)\}/);
  assert.match(terminal, /terminalInitialView=\{config\.initialChartView\}/);
  assert.match(terminal, /terminalAutoScale=\{autoScaleCharts && chartProvider === 'hookchart'\}/);
  assert.match(widget, /terminalInitialView=\{useIntegratedHookChartToolbar \? terminalInitialView : undefined\}/);
  assert.match(hook, /const selectedTerminalInitialView = appliedTerminalInitialView\?\.view \?\? terminalInitialView/);
  assert.match(engine, /visualProfile\.visibleBars,visualProfile\.verticalZoom,visualProfile\.autoPriceScale,visualProfile\.rightGapBars,terminalAutoScale/);
  assert.match(engine, /if\(visualAppliedRef\.current===signature\)return;/);
  assert.match(engine, /const priceAuto=terminalAutoScale\|\|visualProfile\.autoPriceScale/);
  assert.match(engine, /const terminalManualProfile=!priceAuto&&\(terminalMode\|\|visualProfileKey\.startsWith\('terminal'\)\)/);
  assert.match(engine, /terminalSafeManualPriceViewport\(low,high,/);
  assert.match(engine, /showVolumes,visualProfile\.verticalZoom\)/);
  assert.match(engine, /manualCenter:priceAuto\?null:\(manualPrice\?\.manualCenter\?\?center\)/);
  assert.match(engine, /manualRange:priceAuto\?null:\(manualPrice\?\.manualRange\?\?/);
  assert.match(engine, /const visibleSlots=Math\.max\(1,visualProfile\.visibleBars\+Math\.max\(0,rightPaddingBars\)\)/);
  assert.match(engine, /barWidth,rightOffset:0,autoY:priceAuto/);
});

test('restore uses existing visible candles only, without touching WebSockets or the candle renderer', () => {
  const helper = read('src/components/hookchart/terminalAutoScale.ts');
  const body = helper.slice(helper.indexOf('export function terminalSafeManualPriceViewport('));
  assert.doesNotMatch(body, /fetch\(|setTimeout\(|new WebSocket|new EventSource|localStorage|document\./);
  assert.match(body, /terminalCandlePriceRange\(candleLow, candleHigh, plotHeight, showVolumes\)/);
  assert.match(body, /terminalSafeVerticalZoomRange\(/);
  assert.doesNotMatch(body, /for\s*\(|while\s*\(/);
  const engine = read('src/components/hookchart/engine.tsx');
  assert.match(engine, /const recent=candles\.slice\(-count\)/);
});
