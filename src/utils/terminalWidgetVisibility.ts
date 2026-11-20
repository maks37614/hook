/** Geometry fallback for Terminal cards when IntersectionObserver reports stale
 * intersections (notably after iPad Safari scroll and orientation changes).
 * Intersect the scroll container with the real screen before adding preload room.
 */
export interface TerminalWidgetBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function isTerminalWidgetNearViewport(
  widget: TerminalWidgetBounds,
  scrollContainer: TerminalWidgetBounds,
  screen: TerminalWidgetBounds,
  preloadMargin = 160,
): boolean {
  const top = Math.max(scrollContainer.top, screen.top);
  const bottom = Math.min(scrollContainer.bottom, screen.bottom);
  const left = Math.max(scrollContainer.left, screen.left);
  const right = Math.min(scrollContainer.right, screen.right);

  return bottom > top
    && right > left
    && widget.bottom > widget.top
    && widget.right > widget.left
    && widget.bottom > top - preloadMargin
    && widget.top < bottom + preloadMargin
    && widget.right > left
    && widget.left < right;
}
