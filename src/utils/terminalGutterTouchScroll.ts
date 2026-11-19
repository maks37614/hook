/**
 * Scroll the Terminal on the very first finger swipe that begins in the
 * whitespace BETWEEN chart tiles. HookChart deliberately owns touch gestures
 * inside every tile, so this never starts from a chart, toolbar, or overlay.
 *
 * Native touchmove listeners (passive:false) are necessary on iOS/WebKit:
 * React's delegated touchmove listeners are passive and cannot prevent the
 * browser from treating the initial gesture as a tap/selection.
 */
export function enableTerminalGutterTouchScroll(scrollViewport: HTMLElement): () => void {
  let active: { identifier: number; y: number } | null = null;

  const onTouchStart = (event: TouchEvent) => {
    active = null;
    if (event.touches.length !== 1 || scrollViewport.scrollHeight <= scrollViewport.clientHeight) return;
    const target = event.target as Element | null;
    // A touch on the GRID ITSELF is a real gutter hit. A chart descendant may
    // also have the grid as its closest ancestor, but it must retain its own
    // drag, pinch, toolbar, and drawing interactions.
    if (!target || typeof target.closest !== 'function'
        || target.closest('.terminal-workspace-grid') !== target
        || !scrollViewport.contains(target)) return;
    const touch = event.changedTouches[0];
    if (touch) active = { identifier: touch.identifier, y: touch.clientY };
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!active) return;
    if (event.touches.length !== 1) { active = null; return; }
    const touch = Array.from(event.touches).find(item => item.identifier === active?.identifier);
    if (!touch) { active = null; return; }
    if (!event.cancelable) {
      // If the browser already owns scrolling, let it scroll natively.
      active = null;
      return;
    }
    // Prevent native page gestures for gutter-only touches. This takes effect
    // on the FIRST movement without waiting for a tap, long-press, or focus.
    event.preventDefault();
    scrollViewport.scrollTop += active.y - touch.clientY;
    active.y = touch.clientY;
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (active && Array.from(event.changedTouches).some(touch => touch.identifier === active?.identifier))
      active = null;
  };
  const onTouchCancel = () => { active = null; };

  // Capture the gesture before descendants can react. Touches on the chart
  // never activate the gutter state, even if the finger crosses the gap later.
  scrollViewport.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  scrollViewport.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
  scrollViewport.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
  scrollViewport.addEventListener('touchcancel', onTouchCancel, { capture: true, passive: true });
  return () => {
    active = null;
    scrollViewport.removeEventListener('touchstart', onTouchStart, true);
    scrollViewport.removeEventListener('touchmove', onTouchMove, true);
    scrollViewport.removeEventListener('touchend', onTouchEnd, true);
    scrollViewport.removeEventListener('touchcancel', onTouchCancel, true);
  };
}
