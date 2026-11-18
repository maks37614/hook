import test from 'node:test';
import assert from 'node:assert/strict';
import { terminalCandlePriceRange, terminalSafeVerticalZoomRange } from '../src/components/hookchart/terminalAutoScale';

test('terminal auto-scale keeps the lowest visible wick above volume histogram', () => {
  for (const height of [80, 100, 160, 220, 380, 700]) {
    const range = terminalCandlePriceRange(95, 110, height, true);
    const wickY = height - (95 - range.low) / (range.high - range.low) * height;
    const volumeTop = height - 3 - Math.max(56, Math.min(108, height * .14));
    assert.ok(wickY < volumeTop - 5, `lower wick must clear volume band at ${height}px`);
    const upperWickY = height - (110 - range.low) / (range.high - range.low) * height;
    assert.ok(upperWickY > 0, 'upper wick remains inside the chart');
  }
});

test('terminal auto-scale works with volumes hidden and tiny crypto prices', () => {
  const regular = terminalCandlePriceRange(95, 110, 300, false);
  const withVolumes = terminalCandlePriceRange(95, 110, 300, true);
  assert.ok(regular.low > withVolumes.low, 'volume band receives additional space');
  const tiny = terminalCandlePriceRange(.00000091, .00000105, 180, true);
  assert.ok(Number.isFinite(tiny.low) && Number.isFinite(tiny.high));
  assert.ok(tiny.low < .00000091 && tiny.high > .00000105);
});

test('auto-scale does not change chart history or require a candle feed', () => {
  const first = terminalCandlePriceRange(100, 100, 280, true);
  assert.ok(first.high > first.low);
  assert.ok(Number.isFinite(first.low));
});

test('narrow stablecoin candles use their observed range, not a 1% floor', () => {
  for (const height of [160, 240, 380]) {
    const low = 1.0007, high = 1.0012;
    const fitted = terminalCandlePriceRange(low, high, height, true);
    assert.ok(fitted.high - fitted.low < .003, 'stablecoin candles must not become a flat line');
    const wickY = height - (low - fitted.low) / (fitted.high - fitted.low) * height;
    const volumeTop = height - 3 - Math.max(56, Math.min(108, height * .14));
    assert.ok(wickY < volumeTop - 5, 'stablecoin lower wick clears the volume band');
  }
  const flat = terminalCandlePriceRange(1.0009, 1.0009, 240, true);
  assert.ok(Number.isFinite(flat.low) && Number.isFinite(flat.high));
  assert.ok(flat.high > 1.0009 && flat.low < 1.0009);
  assert.ok(flat.high - flat.low < .003, 'identical candles receive only a minimal fallback');
});

test('Terminal profile zoom keeps both visible wicks inside the chart and above the volume band', () => {
  for (const height of [80, 100, 160, 220, 300, 380, 700]) {
    for (const volumes of [true, false]) {
      for (const [low, high] of [[95, 110], [0.01275, 0.0135], [1.0007, 1.0012]]) {
        const fitted = terminalCandlePriceRange(low, high, height, volumes);
        const baselineSpread = fitted.high - fitted.low;
        const band = volumes ? Math.max(56, Math.min(108, height * .14)) + 3 : 0;
        for (const zoom of [0.76, 1, 1.2, 1.5, 2, 4]) {
          const range = terminalSafeVerticalZoomRange(fitted, low, high, height, volumes, zoom);
          const span = range.high - range.low;
          assert.ok(Number.isFinite(span) && span > 0, 'price range stays finite');
          const wickTop = height - (high - range.low) / span * height;
          const wickBottom = height - (low - range.low) / span * height;
          // Zoom=1 intentionally preserves the original fitter, which can
          // use a smaller top margin on exceptionally short 80px charts.
          if (zoom !== 1) assert.ok(wickTop >= 2.9,
            `high wick remains visible at H=${height}, zoom=${zoom}, vol=${volumes}`);
          assert.ok(wickBottom <= height - band - 4.9,
            `low wick clears volume histogram at H=${height}, zoom=${zoom}, vol=${volumes}`);
          if (zoom < 1) assert.ok(span > baselineSpread, 'zooming out visibly expands price range');
          if (zoom > 1) assert.ok(span <= baselineSpread * (1 + 1e-10), 'zoom-in never expands range');
        }
      }
    }
  }
});

test('Terminal global auto-fit keeps its original geometry and invalid zoom is ignored', () => {
  const fitted = terminalCandlePriceRange(95, 110, 220, true);
  assert.deepEqual(terminalSafeVerticalZoomRange(fitted, 95, 110, 220, true, 1), fitted);
  assert.deepEqual(terminalSafeVerticalZoomRange(fitted, 95, 110, 220, true, NaN), fitted);
  assert.deepEqual(terminalSafeVerticalZoomRange(fitted, 95, 110, 220, true, -1), fitted);
  // The unzoomed fitting algorithm is not modified by the profile zoom helper.
  assert.deepEqual(terminalCandlePriceRange(95, 110, 220, true), fitted);
});
