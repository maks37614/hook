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
