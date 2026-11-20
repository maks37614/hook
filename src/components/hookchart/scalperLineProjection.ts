import type { ScalperKind, ScalperLine } from './scalperMode';

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
