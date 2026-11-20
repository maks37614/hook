import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { subscribeTerminalWidgetVisibility } from '../src/utils/terminalVisibilityScheduler';

test('Terminal widget visibility only publishes transitions during fast scrolling', () => {
  const previousWindow = (globalThis as any).window;
  const previousDocument = (globalThis as any).document;
  const previousIntersection = (globalThis as any).IntersectionObserver;
  const previousResize = (globalThis as any).ResizeObserver;
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  const browser = Object.assign(new EventTarget(), {
    innerWidth: 1000,
    innerHeight: 800,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id: number) => { frames.delete(id); },
  });
  const doc = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
    documentElement: {},
  });
  const root = Object.assign(new EventTarget(), {
    scrollTop: 800,
    getBoundingClientRect: () => ({ top: 80, left: 0, bottom: 800, right: 1000 }),
  });
  let rectReads = 0;
  const tile = {
    closest: (selector: string) => selector === '[data-terminal-scroll-viewport]' ? root : null,
    getBoundingClientRect: () => {
      rectReads++;
      const top = 900 - root.scrollTop;
      return { top, left: 0, bottom: top + 200, right: 600 };
    },
  } as unknown as HTMLElement;
  function flushFrames() {
    const scheduled = [...frames.values()];
    frames.clear();
    for (const callback of scheduled) callback(0);
  }

  (globalThis as any).window = browser;
  (globalThis as any).document = doc;
  (globalThis as any).IntersectionObserver = undefined;
  (globalThis as any).ResizeObserver = undefined;
  try {
    const changes: boolean[] = [];
    const unsubscribe = subscribeTerminalWidgetVisibility(tile, value => changes.push(value));
    flushFrames();
    assert.deepEqual(changes, [true]);
    const initialRectReads = rectReads;
    // Repeated scroll events without a geometry transition must not schedule
    // any React state updates, even though a geometry check is coalesced.
    for (let i = 0; i < 30; i++) browser.dispatchEvent(new Event('scroll'));
    root.dispatchEvent(new Event('scroll'));
    assert.equal(frames.size, 1);
    flushFrames();
    assert.deepEqual(changes, [true]);
    assert.ok(rectReads <= initialRectReads + 1,
      'ordinary scroll frames must reuse card geometry instead of measuring all cards');

    root.scrollTop = 0;
    root.dispatchEvent(new Event('scroll'));
    flushFrames();
    assert.deepEqual(changes, [true, false]);
    root.dispatchEvent(new Event('scroll'));
    flushFrames();
    assert.deepEqual(changes, [true, false]);

    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    assert.deepEqual(changes, [true, false]);
    root.scrollTop = 800;
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    flushFrames();
    assert.deepEqual(changes, [true, false, true]);

    unsubscribe();
    root.dispatchEvent(new Event('scroll'));
    assert.equal(frames.size, 0, 'last subscriber removes the shared listeners');
  } finally {
    (globalThis as any).window = previousWindow;
    (globalThis as any).document = previousDocument;
    (globalThis as any).IntersectionObserver = previousIntersection;
    (globalThis as any).ResizeObserver = previousResize;
  }
});

test('Terminal live prices do not trigger whole-canvas React rerenders', () => {
  const widget = readFileSync(new URL('../src/components/terminal/TerminalChartWidget.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(widget, /const livePriceRef = useRef\(initialPrice\)/);
  assert.match(widget, /livePriceRef\.current = price/);
  assert.match(widget, /onLivePriceUpdate=\{useIntegratedHookChartToolbar \? handleChartPrice/);
  assert.match(widget, /currentPrice: livePriceRef\.current \|\| detailCoin\.currentPrice/);
  assert.doesNotMatch(widget, /setLivePrice\(|setCurrentPrice\(|headerPriceTimerRef/);
  assert.doesNotMatch(widget, /transition-all duration-150/);
  assert.doesNotMatch(page, /terminal-workspace-grid[^\n]*transition-all/);
});
