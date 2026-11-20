/** Pointer movement is measured in CSS pixels, independent of DPR/zoom. */
export const RULER_DRAG_THRESHOLD_PX = 6;

export interface RulerScreenPoint { x: number; y: number }
export interface RulerPricePoint { t: number; p: number }

/** Ignore tap jitter, but accept real press-and-drag measurements. */
export function rulerDragThresholdMet(start: RulerScreenPoint, end: RulerScreenPoint): boolean {
  return Number.isFinite(start.x) && Number.isFinite(start.y)
    && Number.isFinite(end.x) && Number.isFinite(end.y)
    && Math.hypot(end.x - start.x, end.y - start.y) >= RULER_DRAG_THRESHOLD_PX;
}

/** Never save an invisible, zero-length measurement. */
export function rulerHasRange(a: RulerPricePoint, b: RulerPricePoint): boolean {
  return Number.isFinite(a.t) && Number.isFinite(a.p)
    && Number.isFinite(b.t) && Number.isFinite(b.p)
    && (a.t !== b.t || a.p !== b.p);
}
