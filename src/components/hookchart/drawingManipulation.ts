/** Convert screen-space manipulation into chart time/price coordinates.
 * This deliberately uses the existing chart geometry: zoom, panning and
 * future (unloaded) candle slots remain valid drawing positions.
 */
export interface DrawingPoint { t: number; p: number }
export interface DrawingScreenPoint { x: number; y: number }
export interface DrawingGeometry {
  plotH: number;
  x: (time: number) => number;
  y: (price: number) => number;
  p: (y: number) => number;
  timeAtX: (x: number) => number;
}

const visiblePriceY = (y: number, g: DrawingGeometry) =>
  Math.max(0, Math.min(g.plotH, y));

/** A point is moved without OHLC magnetism; the user can place it anywhere. */
export function freeDrawingPoint(x: number, y: number, g: DrawingGeometry): DrawingPoint {
  return { t: Math.round(g.timeAtX(x)), p: g.p(visiblePriceY(y, g)) };
}

/** Translate all anchors from the SAME original snapshot (no accumulated drift). */
export function translateDrawingPoints(
  points: readonly DrawingPoint[],
  from: DrawingScreenPoint,
  to: DrawingScreenPoint,
  g: DrawingGeometry,
): DrawingPoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // A translation must preserve the geometry even when an anchor leaves
  // the visible viewport. Only direct endpoint edits clamp into the plot.
  return points.map(point => ({
    t: Math.round(g.timeAtX(g.x(point.t) + dx)),
    p: g.p(g.y(point.p) + dy),
  }));
}

/** Position the compact, background-free icons inside the plot, including
 * 34px mobile touch targets, without covering the drawing anchor. */
export function drawingActionsPosition(
  x: number,
  y: number,
  plotW: number,
  plotH: number,
): DrawingScreenPoint {
  return {
    x: Math.max(2, Math.min(Math.max(2, plotW - 70), x + 10)),
    y: Math.max(2, Math.min(Math.max(2, plotH - 36), y - 41)),
  };
}

/** Extend a user-drawn ray from its first anchor THROUGH its second anchor.
 * Left-pointing and vertical rays must not flip to the right side.
 */
export function rayEndPoint(
  x1: number, y1: number, x2: number, y2: number,
  plotW: number, plotH: number,
): DrawingScreenPoint {
  const dx = x2 - x1;
  if (Math.abs(dx) < 1e-9) {
    return { x: x1, y: y2 >= y1 ? plotH : 0 };
  }
  const x = dx > 0 ? plotW : 0;
  return { x, y: y1 + ((x - x1) * (y2 - y1)) / dx };
}

/** Hit-test the rendered label rather than only its bottom-left anchor. */
export function drawingTextHitDistance(
  x: number, y: number, anchorX: number, baselineY: number, label: string,
  width?: number,
): number {
  const size = Number.isFinite(width) && (width ?? 0) > 0
    ? width! : Math.max(14, [...label].length * 7);
  const left = anchorX, right = anchorX + size, top = baselineY - 14, bottom = baselineY + 4;
  const dx = Math.max(left - x, 0, x - right);
  const dy = Math.max(top - y, 0, y - bottom);
  return Math.hypot(dx, dy);
}
