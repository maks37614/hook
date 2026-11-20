import type { ScalperCandle, ScalperKind, ScalperLine, ScalperPoint } from './scalperMode';

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
 * A cascade tier is active only until the first post-pivot wick reaches or
 * crosses its price. Outermost boundaries may have been established by a later
 * pivot than line.from; use that last price-matching pivot as activation time.
 * The creating candle itself must never invalidate its own level.
 *
 * This is presentation-only: detection, breakout states and historical candles
 * are never modified. The last (potentially live) candle is included so an
 * intrabar sweep hides the level immediately, without waiting for close.
 */
export function cascadeLineIsActive(
  line: ScalperLine,
  touches: readonly ScalperPoint[],
  candles: readonly ScalperCandle[],
  side: 'upper' | 'lower',
): boolean {
  const price = line.from.p;
  if (!Number.isFinite(price) || price <= 0 || line.to.p !== price ||
      !Number.isFinite(line.from.t) || !candles.length) return false;
  let activatedAt = line.from.t;
  if (line.role !== 'cascade-step') {
    const epsilon = Math.max(1e-12, Math.abs(price) * 1e-12);
    for (const touch of touches) {
      if (Number.isFinite(touch.t) && Number.isFinite(touch.p) &&
          Math.abs(touch.p - price) <= epsilon && touch.t > activatedAt) {
        activatedAt = touch.t;
      }
    }
  }
  if (candles[candles.length - 1].t < activatedAt) return false;
  // Scan back only to activation. With the Scalper analyzer's bounded recent
  // pivots this covers a small number of bars and never starts network work.
  for (let i = candles.length - 1; i >= 0; i--) {
    const bar = candles[i];
    if (!Number.isFinite(bar.t)) return false;
    if (bar.t <= activatedAt) break;
    if (!Number.isFinite(bar.h) || !Number.isFinite(bar.l) || bar.h < bar.l) return false;
    if (side === 'upper' ? bar.h >= price : bar.l <= price) return false;
  }
  return true;
}

/**
 * Active cascade rays start just beyond the latest candle's right edge.
 * This prevents projecting old tiers through / behind historical candles.
 * The right end still reaches the price-scale divider.
 */
export function cascadeFutureRayStartX(
  lastCandleCenterX: number,
  barStep: number,
  scaleX: number,
  plotWidth: number,
): number | null {
  if (![lastCandleCenterX, barStep, scaleX, plotWidth].every(Number.isFinite) ||
      barStep <= 0 || scaleX <= 0 || plotWidth <= 0) return null;
  const devicePixel = 1 / scaleX;
  const x = Math.max(0, lastCandleCenterX + barStep * 0.5 + devicePixel);
  return x + devicePixel < plotWidth ? x : null;
}
