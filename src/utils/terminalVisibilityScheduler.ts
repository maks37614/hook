import { isTerminalWidgetNearViewport } from './terminalWidgetVisibility';

type Listener = (near: boolean) => void;

interface VisibilityTracker {
  subscribe: (node: HTMLElement, listener: Listener) => () => void;
}

// One tracker per Terminal scroll viewport, rather than one set of window,
// scroll, resize and intersection listeners per chart (up to 50 cards).
const trackers = new WeakMap<HTMLElement, VisibilityTracker>();

function createTracker(root: HTMLElement | null, key: HTMLElement): VisibilityTracker {
  const listeners = new Map<HTMLElement, Listener>();
  let frame: number | null = null;
  const onChange = () => {
    if (frame === null) frame = window.requestAnimationFrame(check);
  };
  const check = () => {
    frame = null;
    const screen = {
      top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth,
    };
    // Read the scroll container once per frame for ALL Terminal cards.
    const bounds = root?.getBoundingClientRect() ?? screen;
    for (const [node, listener] of listeners) {
      listener(isTerminalWidgetNearViewport(node.getBoundingClientRect(), bounds, screen));
    }
  };
  const intersection = typeof IntersectionObserver === 'undefined' ? null
    : new IntersectionObserver(onChange, { root, rootMargin: '160px 0px' });
  const resize = typeof ResizeObserver === 'undefined' ? null
    : new ResizeObserver(onChange);
  if (root) {
    root.addEventListener('scroll', onChange, { passive: true });
    resize?.observe(root);
  }
  window.addEventListener('scroll', onChange, { passive: true });
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
  document.addEventListener('visibilitychange', onChange);

  return {
    subscribe(node, listener) {
      listeners.set(node, listener);
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
        document.removeEventListener('visibilitychange', onChange);
        trackers.delete(key);
      };
    },
  };
}

/**
 * Keep the Safari geometry fallback and 160px preload margin intact, but
 * coalesce expensive page-visibility geometry checks for the whole Terminal.
 * Widget state still updates independently only when its near state changes.
 */
export function subscribeTerminalWidgetVisibility(node: HTMLElement, listener: Listener): () => void {
  const root = node.closest<HTMLElement>('[data-terminal-scroll-viewport]');
  const key = root ?? document.documentElement;
  let tracker = trackers.get(key);
  if (!tracker) {
    tracker = createTracker(root, key);
    trackers.set(key, tracker);
  }
  return tracker.subscribe(node, listener);
}
