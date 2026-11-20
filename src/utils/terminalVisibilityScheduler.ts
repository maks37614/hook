import { isTerminalWidgetNearViewport } from './terminalWidgetVisibility';

type Listener = (near: boolean) => void;
type TrackedListener = { listener: Listener; last: boolean | null };

interface VisibilityTracker {
  subscribe: (node: HTMLElement, listener: Listener) => () => void;
}

// One tracker per Terminal scroll viewport, rather than one set of window,
// scroll, resize and intersection listeners per chart (up to 50 cards).
const trackers = new WeakMap<HTMLElement, VisibilityTracker>();

function createTracker(root: HTMLElement | null, key: HTMLElement): VisibilityTracker {
  const listeners = new Map<HTMLElement, TrackedListener>();
  let frame: number | null = null;
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
    // Read the scroll container once per frame for ALL Terminal cards.
    const bounds = root?.getBoundingClientRect() ?? screen;
    for (const [node, entry] of listeners) {
      publish(entry, isTerminalWidgetNearViewport(node.getBoundingClientRect(), bounds, screen));
    }
  };
  const intersection = typeof IntersectionObserver === 'undefined' ? null
    : new IntersectionObserver(onChange, { root, rootMargin: '0px' });
  const resize = typeof ResizeObserver === 'undefined' ? null
    : new ResizeObserver(onChange);
  if (root) {
    root.addEventListener('scroll', onChange, { passive: true });
    resize?.observe(root);
  }
  window.addEventListener('scroll', onChange, { passive: true });
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
  const onVisibilityChange = () => {
    if (document.visibilityState !== 'hidden') { onChange(); return; }
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    for (const entry of listeners.values()) publish(entry, false);
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    subscribe(node, listener) {
      listeners.set(node, { listener, last: null });
      intersection?.observe(node);
      resize?.observe(node);
      onChange();
      return () => {
        listeners.delete(node);
        intersection?.unobserve(node);
        resize?.unobserve(node);
        if (listeners.size) return;
        if (frame !== null) window.cancelAnimationFrame(frame);
        frame = null;
        intersection?.disconnect();
        resize?.disconnect();
        root?.removeEventListener('scroll', onChange);
        window.removeEventListener('scroll', onChange);
        window.removeEventListener('resize', onChange);
        window.removeEventListener('orientationchange', onChange);
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
