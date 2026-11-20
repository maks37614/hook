/** Touch-only scroll gutter shared by Terminal settings and restored workspaces. */
export const DEFAULT_TERMINAL_TOUCH_GAP_PX = 20;
export const MIN_TERMINAL_TOUCH_GAP_PX = 12;
export const MAX_TERMINAL_TOUCH_GAP_PX = 40;
export const TERMINAL_TOUCH_GAP_STEP_PX = 2;

export function normalizeTerminalTouchGapPx(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TERMINAL_TOUCH_GAP_PX;
  const clamped = Math.max(MIN_TERMINAL_TOUCH_GAP_PX, Math.min(MAX_TERMINAL_TOUCH_GAP_PX, value));
  return Math.round(clamped / TERMINAL_TOUCH_GAP_STEP_PX) * TERMINAL_TOUCH_GAP_STEP_PX;
}
