import type { ScalperCandle, ScalperKind, ScalperLine, ScalperPoint, ScalperScene } from './scalperMode';

/**
 * Visual-only right-edge projection for horizontal cascade tiers.
 * The Scalper analyzer keeps the original pivot/time geometry (including the
 * short steps); Canvas alone extends the displayed ray to the price scale.
 * Other formations, diagonal lines and the underlying price are untouched.
 */
export function scalperRenderedLineEndX(
  kind: ScalperKind,
  line: ScalperLine,
  originalEndX: number,
  plotWidth: number,
): number {
  return kind === 'cascade'
    && (line.role === 'cascade-step' || line.role === 'upper' || line.role === 'lower')
    && line.from.p === line.to.p
    && Number.isFinite(plotWidth)
    ? plotWidth
    : originalEndX;
}

/** One visual-only width for all automatic Scalper lines, independent of manual drawings. */
export function normalizeScalperLineWidth(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0.2, Math.min(5, value)) : 0.4;
}


/**
 * A CSS width below one *physical* pixel has inconsistent coverage as a thin
 * diagonal crosses sub-pixel positions. Rasterize automatic scalper strokes to
 * whole device pixels, with a one-pixel floor. Settings continue storing CSS px.
 * No other chart or candle strokes pass through this helper.
 */
export function scalperRasterStrokeWidth(cssWidth: number, scaleX: number, scaleY: number): number {
  const sx = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1;
  const sy = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1;
  const scale = Math.min(sx, sy);
  return Math.max(1, Math.round(normalizeScalperLineWidth(cssWidth) * scale)) / scale;
}

/**
 * Every automatic cascade stroke is 0.1 CSS px thinner than the chosen
 * Scalper line width (0.4 -> 0.3 by default). Resolve to device pixels to
 * preserve even coverage along the ray. Subpixel opacity compensation lets
 * the narrower setting remain visually distinct when DPR rounds both
 * 0.3px and 0.4px to the same physical-pixel count.
 */
export function cascadeStrokeAppearance(
  scalperCssWidth: number, scaleX: number, scaleY: number,
): { cssWidth: number; width: number; coverage: number } {
  const cssWidth = Math.max(0.1, Math.round((normalizeScalperLineWidth(scalperCssWidth) - 0.1) * 1000) / 1000);
  const width = scalperRasterStrokeWidth(cssWidth, scaleX, scaleY);
  return { cssWidth, width, coverage: Math.min(1, cssWidth / width) };
}

/**
 * Only horizontal strokes can be pixel-centered without changing their slope
 * or wick touch geometry. An odd device-pixel width is centered at n + 0.5;
 * an even device-pixel width is centered at n. Diagonals use raw coordinates.
 */
export function scalperPixelCenteredHorizontalY(y: number, strokeWidth: number, scaleY: number): number {
  if (!Number.isFinite(y)) return y;
  const scale = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1;
  const physicalWidth = Math.max(1, Math.round(strokeWidth * scale));
  const halfPixel = physicalWidth % 2 ? 0.5 : 0;
  return (Math.round(y * scale - halfPixel) + halfPixel) / scale;
}


/**
 * Only lines originating at their actual defining swing wick are valid.
 * Later contact, sweep or gap through the price expires that exact tier:
 * a later retest never moves the activation timestamp forward to resurrect it.
 * This reads only already available OHLC, including the current live bar.
 */
export function cascadeLineIsActive(
  line: ScalperLine,
  _touches: readonly ScalperPoint[],
  candles: readonly ScalperCandle[],
  side: 'upper' | 'lower',
): boolean {
  const price = line.from.p;
  const activationTime = line.from.t;
  if (!Number.isFinite(price) || price <= 0 || line.to.p !== price ||
      !Number.isFinite(activationTime) || !candles.length) return false;
  const lastTime = candles[candles.length - 1].t;
  if (!Number.isFinite(lastTime) || lastTime < activationTime) return false;

  // Require the historical anchor itself to really be the high/low that
  // established this tier. Previously an outer boundary could start on a
  // DIFFERENT pivot's candle, drawing a false level across older candles.
  const epsilon = Math.max(1e-12, Math.abs(price) * 1e-12);
  for (let i = candles.length - 1; i >= 0; i--) {
    const bar = candles[i];
    if (!Number.isFinite(bar.t) || !Number.isFinite(bar.h) ||
        !Number.isFinite(bar.l) || bar.h < bar.l) return false;
    if (bar.t === activationTime) {
      return Math.abs((side === 'upper' ? bar.h : bar.l) - price) <= epsilon;
    }
    if (bar.t < activationTime) break;
    if (side === 'upper' ? bar.h >= price : bar.l <= price) return false;
  }
  // No defining historical candle in memory means the ray cannot be verified.
  return false;
}

/**
 * Visible auto trend/triangle/wedge diagonal: use the latest *supporting wick*
 * as its activation time. Older touches are evidence for the structure, not
 * post-formation breaches. Only later bars can expire its painted line.
 *
 * A wick crossing the projected diagonal removes that line. A single exposed
 * trendline also expires once price moves decisively away from it: unlike a
 * two-wall triangle, an abandoned standalone line must not linger over an
 * unrelated impulse. No market data, fit coordinates or detector state changes.
 */
export function scalperDiagonalIsActive(
  line: ScalperLine,
  touches: readonly ScalperPoint[],
  candles: readonly ScalperCandle[],
  side: 'upper' | 'lower',
  expireWhenFar = false,
): boolean {
  const elapsed = line.to.t - line.from.t;
  if (!Number.isFinite(elapsed) || elapsed <= 0 ||
      !Number.isFinite(line.from.p) || !Number.isFinite(line.to.p) ||
      line.from.p <= 0 || line.to.p <= 0 || !candles.length) return false;
  const last = candles[candles.length - 1];
  if (!Number.isFinite(last.t) || last.t < line.from.t) return false;
  const priceAt = (t: number) =>
    line.from.p + (line.to.p - line.from.p) * (t - line.from.t) / elapsed;

  // The input is the existing in-memory chart. A 12-bar volatility estimate
  // is enough for visual tolerances and is calculated only when OHLC changes.
  const recent = candles.slice(-12);
  let rangeSum = 0;
  for (const bar of recent) {
    if (!Number.isFinite(bar.h) || !Number.isFinite(bar.l) || bar.h < bar.l) return false;
    rangeSum += bar.h - bar.l;
  }
  const avgRange = rangeSum / recent.length;
  const matchTolerance = Math.max(avgRange * .3, line.from.p * .0001);
  const farThreshold = Math.max(avgRange * 2, last.c * .0015);
  let activatedAt = line.from.t;
  for (const touch of touches) {
    if (touch.t >= activatedAt && touch.t <= line.to.t &&
        Number.isFinite(touch.p) && Number.isFinite(touch.t) &&
        Math.abs(touch.p - priceAt(touch.t)) <= matchTolerance) {
      activatedAt = touch.t;
    }
  }
  for (let i = candles.length - 1; i >= 0; i--) {
    const bar = candles[i];
    if (!Number.isFinite(bar.t)) return false;
    if (bar.t <= activatedAt) break;
    if (![bar.h, bar.l, bar.c].every(Number.isFinite) || bar.h < bar.l) return false;
    const projected = priceAt(bar.t);
    if (!Number.isFinite(projected) || projected <= 0) return false;
    // The contact after the final structural pivot invalidates the visual line.
    if (side === 'upper' ? bar.h >= projected : bar.l <= projected) return false;
    if (expireWhenFar &&
        (side === 'upper' ? projected - bar.c > farThreshold
          : bar.c - projected > farThreshold)) return false;
  }
  return true;
}


/**
 * Select exactly the live geometry that the chart renders. Archive snapshots
 * use this on demand, so expired cascade tiers / broken trend lines cannot
 * reappear in a saved chart even when the live screenshot hid them.
 * This function is never part of a frame loop or network subscription.
 */
export function visibleScalperLines(
  scene: ScalperScene | null,
  candles: readonly ScalperCandle[],
): ScalperLine[] {
  if (!scene?.setups.length || !candles.length) return [];
  const visible: ScalperLine[] = [];
  for (const setup of scene.setups) {
    const cascadeSide = setup.lines.some(line => line.role === 'upper') ? 'upper' : 'lower';
    for (const line of setup.lines) {
      if (setup.kind === 'cascade') {
        if (cascadeLineIsActive(line, setup.touches, candles, cascadeSide)) visible.push(line);
      } else if (line.from.p === line.to.p) {
        visible.push(line);
      } else {
        const side = line.role === 'upper' ? 'upper' : 'lower';
        if (scalperDiagonalIsActive(line, setup.touches, candles, side, setup.kind === 'trend'))
          visible.push(line);
      }
    }
  }
  return visible;
}
