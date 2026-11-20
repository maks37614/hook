import type { ScalperKind, ScalperLine, ScalperStatus } from './scalperMode';

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

/** Visual-only widths in CSS px. Do not change other Scalper formations. */
export function scalperCascadeLineWidth(line: ScalperLine, status: ScalperStatus): number {
  return line.role === 'cascade-step' ? 0.2 : status === 'confirmed' ? 0.8 : 0.5;
}
