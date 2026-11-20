import { isTerminalWidgetNearViewport } from './terminalWidgetVisibility';

type Listener = (near: boolean) => void;
type Bounds = { top: number; bottom: number; left: number; right: number };
type TrackedListener = { listener: Listener; last: boolean | null; bounds?: Bounds };

interface VisibilityTracker {
  subscribe: (node: HTMLElement, listener: Listener) => () => void;
}

// One tracker per Terminal scroll viewport, rather than one set of window,
// scroll, resize and intersection listeners per chart (up to 50 cards).
const trackers = new WeakMap<HTMLElement, VisibilityTracker>();

function createTracker(root: HTMLElement | null, key: HTMLElement): VisibilityTracker {
  const listeners = new Map<HTMLElement, TrackedListener>();
  let frame: number | null = null;
  let layoutDirty = true;
  let measuredScrollTop = 0;
  let lastFullMeasure = 0;
  const maxCacheAgeMs = 250; // Safari can shift layout without ResizeObserver firing.
  const publish = (entry: TrackedListener, visible: boolean) => {
    // Scrolling can fire at 120 Hz on tablets. Never enqueue 50 identical
    // React setState actions per frame: publish only real entry/exit changes.
    if (entry.last === visible) return;
    entry.last = visible;
    entry.listener(visible);
  };
  const onChange = () => {
    if (frame === null) frame = window.requestAnimationFrame(check);
  };
  const invalidateLayout = () => {
    layoutDirty = true;
    onChange();
  };
  const check = () => {
    frame = null;
    // A background tab has no visible charts. Suspend chart-level feeds and
    // Canvas work even if an observer reports an old intersection.
    if (document.visibilityState === 'hidden') {
      for (const entry of listeners.values()) publish(entry, false);
      return;
    }
    const screen = {
      top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth,
    };
    // Reading 50 getBoundingClientRect() values every animation frame on
    // iPad can force repeated layout. During plain scroll, tile geometry is
    // translated by scrollTop; no element layout read is necessary. Re-measure
    // on resize/intersection changes and at least every 250 ms as a safeguard
    // against Safari's delayed ResizeObserver/layout notifications.
    const scrollTop = root?.scrollTop ?? 0;
    const now = performance.now();
    const measureAll = !root || layoutDirty || now - lastFullMeasure >= maxCacheAgeMs;
    const bounds = root?.getBoundingClientRect() ?? screen;
    const scrollDelta = measuredScrollTop - scrollTop;
    for (const [node, entry] of listeners) {
      const rect = measureAll || !entry.bounds ? node.getBoundingClientRect() : {
        top: entry.bounds.top + scrollDelta, bottom: entry.bounds.bottom + scrollDelta,
        left: entry.bounds.left, right: entry.bounds.right,
      };
      if (measureAll || !entry.bounds) entry.bounds = rect;
      publish(entry, isTerminalWidgetNearViewport(rect, bounds, screen));
    }
    if (measureAll) {
      lastFullMeasure = now;
      measuredScrollTop = scrollTop;
      layoutDirty = false;
    }
  };
  const intersection = typeof IntersectionObserver === 'undefined' ? null
    : new IntersectionObserver(invalidateLayout, { root, rootMargin: '0px' });
  const resize = typeof ResizeObserver === 'undefined' ? null
    : new ResizeObserver(invalidateLayout);
  if (root) {
    root.addEventListener('scroll', onChange, { passive: true });
    resize?.observe(root);
  }
  window.addEventListener('scroll', invalidateLayout, { passive: true });
  window.addEventListener('resize', invalidateLayout);
  window.addEventListener('orientationchange', invalidateLayout);
  const onVisibilityChange = () => {
    if (document.visibilityState !== 'hidden') { invalidateLayout(); return; }
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    for (const entry of listeners.values()) publish(entry, false);
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    subscribe(node, listener) {
      listeners.set(node, { listener, last: null });
      invalidateLayout();
      intersection?.observe(node);
      resize?.observe(node);
      onChange();
      return () => {
        listeners.delete(node);
        layoutDirty = true;
        intersection?.unobserve(node);
        resize?.unobserve(node);
        if (listeners.size) return;
        if (frame !== null) window.cancelAnimationFrame(frame);
        frame = null;
        intersection?.disconnect();
        resize?.disconnect();
        root?.removeEventListener('scroll', onChange);
        window.removeEventListener('scroll', invalidateLayout);
        window.removeEventListener('resize', invalidateLayout);
        window.removeEventListener('orientationchange', invalidateLayout);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        trackers.delete(key);
      };
    },
  };
}

/**
 * Preserve the Safari geometry fallback without an offscreen preload band.
 * Coalesce viewport geometry checks for all Terminal chart cards.
 * Widget state still updates independently only when its near state changes.
 */
export function subscribeTerminalWidgetVisibility(
  node: HTMLElement, listener: Listener, useScreenViewport = false,
): () => void {
  // Maximized charts are fixed to the screen, not constrained by the
  // scrolling panel that contains their DOM element.
  const root = useScreenViewport ? null : node.closest<HTMLElement>('[data-terminal-scroll-viewport]');
  const key = root ?? document.documentElement;
  let tracker = trackers.get(key);
  if (!tracker) {
    tracker = createTracker(root, key);
    trackers.set(key, tracker);
  }
  return tracker.subscribe(node, listener);
}
