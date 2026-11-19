import assert from 'node:assert/strict';
import test from 'node:test';
import { enableTerminalGutterTouchScroll } from '../src/utils/terminalGutterTouchScroll';

// Exercise the native touch handlers without a browser or network requests.
function fixture(scrollHeight = 1600) {
  const handlers = new Map<string, (event: any) => void>();
  const removed: string[] = [];
  const grid = { closest: (selector: string) => selector === '.terminal-workspace-grid' ? grid : null };
  const chart = { closest: (selector: string) => selector === '.terminal-workspace-grid' ? grid : null };
  const viewport = {
    scrollTop: 150, scrollHeight, clientHeight: 500,
    contains: (el: unknown) => el === grid || el === chart,
    addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler),
    removeEventListener: (type: string) => { removed.push(type); handlers.delete(type); },
  };
  const cleanup = enableTerminalGutterTouchScroll(viewport as unknown as HTMLElement);
  const send = (type: string, target: unknown, ys: Array<{ identifier: number; clientY: number }>, cancelable = true) => {
    let prevented = false;
    const event = {
      target, touches: type === 'touchend' ? [] : ys,
      changedTouches: ys, cancelable,
      preventDefault: () => { prevented = true; },
    };
    handlers.get(type)?.(event);
    return prevented;
  };
  return { viewport, grid, chart, send, cleanup, removed };
}

test('first gesture in the gap scrolls immediately without a preparatory tap', () => {
  const f = fixture();
  const finger = (clientY: number) => [{ identifier: 7, clientY }];
  f.send('touchstart', f.grid, finger(220));
  assert.equal(f.send('touchmove', f.grid, finger(185)), true);
  assert.equal(f.viewport.scrollTop, 185);
  assert.equal(f.send('touchmove', f.grid, finger(120)), true);
  assert.equal(f.viewport.scrollTop, 250);
  f.send('touchend', f.grid, finger(120));
  f.send('touchstart', f.grid, finger(250));
  assert.equal(f.send('touchmove', f.grid, finger(210)), true, 'next gesture starts without prior tap');
  assert.equal(f.viewport.scrollTop, 290);
  f.cleanup();
});

test('chart touch and pinch still belong to HookChart', () => {
  const f = fixture();
  const touch = [{ identifier: 1, clientY: 220 }];
  f.send('touchstart', f.chart, touch);
  assert.equal(f.send('touchmove', f.chart, [{ identifier: 1, clientY: 140 }]), false);
  assert.equal(f.viewport.scrollTop, 150);
  f.send('touchstart', f.grid, touch);
  assert.equal(f.send('touchmove', f.grid, [
    { identifier: 1, clientY: 160 }, { identifier: 2, clientY: 170 },
  ]), false);
  assert.equal(f.viewport.scrollTop, 150);
  f.cleanup();
});

test('non-scrollable view and non-cancelable native gestures are not blocked', () => {
  const f = fixture(200);
  f.send('touchstart', f.grid, [{ identifier: 5, clientY: 100 }]);
  assert.equal(f.send('touchmove', f.grid, [{ identifier: 5, clientY: 40 }]), false);
  assert.equal(f.viewport.scrollTop, 150);
  f.cleanup();
  const g = fixture();
  g.send('touchstart', g.grid, [{ identifier: 5, clientY: 100 }]);
  assert.equal(g.send('touchmove', g.grid, [{ identifier: 5, clientY: 40 }], false), false);
  assert.equal(g.viewport.scrollTop, 150);
  g.cleanup();
  assert.deepEqual(g.removed.sort(), ['touchcancel', 'touchend', 'touchmove', 'touchstart']);
});

test('Terminal binds touch scrolling once to the scroll viewport, not every chart', async () => {
  const page = (await import('node:fs')).readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /return enableTerminalGutterTouchScroll\(scrollViewport\)/);
  assert.equal((page.match(/enableTerminalGutterTouchScroll\(scrollViewport\)/g) ?? []).length, 1);
});
