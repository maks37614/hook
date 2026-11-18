export interface TouchHoldPoint { x: number; y: number }

const CONTROL_SELECTOR = 'button, input, select, textarea, a, [role="button"], [contenteditable="true"], .timeJumpDock, .chartScaleDock';

/** Informational chart overlays are part of the plot; actual controls keep their native gestures. */
export function isChartControlTarget(target: EventTarget | null): boolean {
  return !!(target as Element | null)?.closest?.(CONTROL_SELECTOR);
}

interface HoldClock {
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (handle: unknown) => void;
}

/** Short hold reveals a freely movable cursor; a longer still hold reveals the lens. */
export const TOUCH_CURSOR_HOLD_MS = 280;
export const TOUCH_MAGNIFIER_HOLD_MS = 850;
const TOUCH_HOLD_SLOP_PX = 10;

/** Only one pointer may arm a hold. A swipe before cursor activation still pans. */
export function createChartTouchHold(clock: HoldClock = {
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}) {
  let candidate: {
    id: number;
    start: TouchHoldPoint;
    latest: TouchHoldPoint;
    cursorActivated: boolean;
    activateCursor: (point: TouchHoldPoint) => void;
    activateMagnifier?: (point: TouchHoldPoint) => void;
  } | null = null;
  let timer: unknown = null;
  const cancel = () => {
    if (timer !== null) clock.cancel(timer);
    timer = null;
    candidate = null;
  };
  return {
    cancel,
    /** A long press may still be armed after the cursor has appeared. */
    pending: () => candidate !== null && !candidate.cursorActivated,
    start(
      id: number,
      point: TouchHoldPoint,
      activateCursor: (point: TouchHoldPoint) => void,
      activateMagnifier?: (point: TouchHoldPoint) => void,
    ) {
      cancel();
      if (![id, point.x, point.y].every(Number.isFinite)) return;
      const current = {
        id, start: { ...point }, latest: { ...point },
        cursorActivated: false, activateCursor, activateMagnifier,
      };
      candidate = current;
      timer = clock.schedule(() => {
        if (candidate !== current) return;
        timer = null;
        current.cursorActivated = true;
        current.activateCursor(current.latest);
        if (candidate !== current) return;
        if (!current.activateMagnifier) {
          candidate = null;
          return;
        }
        timer = clock.schedule(() => {
          if (candidate !== current) return;
          timer = null;
          candidate = null;
          current.activateMagnifier?.(current.latest);
        }, TOUCH_MAGNIFIER_HOLD_MS - TOUCH_CURSOR_HOLD_MS);
      }, TOUCH_CURSOR_HOLD_MS);
    },
    /** Return true only before the short hold, so a revealed cursor moves freely. */
    move(id: number, point: TouchHoldPoint): boolean {
      if (!candidate || candidate.id !== id) return false;
      if (![point.x, point.y].every(Number.isFinite) ||
          Math.hypot(point.x - candidate.start.x, point.y - candidate.start.y) > TOUCH_HOLD_SLOP_PX) {
        cancel(); // after short hold this only cancels the future lens, not the cursor
        return false;
      }
      candidate.latest = { ...point };
      return !candidate.cursorActivated;
    },
  };
}
