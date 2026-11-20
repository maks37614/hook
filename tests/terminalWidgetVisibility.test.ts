import test from 'node:test';
import assert from 'node:assert/strict';
import { isTerminalWidgetNearViewport } from '../src/utils/terminalWidgetVisibility';

const screen = { top: 0, left: 0, bottom: 1024, right: 768 };
const scroller = { top: 80, left: 0, bottom: 960, right: 768 };
const tile = (top: number, bottom: number, left = 20, right = 340) =>
  ({ top, bottom, left, right });

test('loads visible Terminal tiles, even if IntersectionObserver is stale', () => {
  assert.equal(isTerminalWidgetNearViewport(tile(300, 500), scroller, screen), true);
  assert.equal(isTerminalWidgetNearViewport(tile(955, 1200), scroller, screen), true);
});

test('preloads a nearby row but suspends distant rows', () => {
  assert.equal(isTerminalWidgetNearViewport(tile(1000, 1300), scroller, screen), true);
  assert.equal(isTerminalWidgetNearViewport(tile(1300, 1500), scroller, screen), false);
  assert.equal(isTerminalWidgetNearViewport(tile(-400, -150), scroller, screen), false);
});

test('respects the intersection of the scroll container and screen', () => {
  const partiallyOffscreenScroller = { top: -200, left: 100, bottom: 400, right: 700 };
  assert.equal(isTerminalWidgetNearViewport(tile(250, 350, 120, 480), partiallyOffscreenScroller, screen), true);
  assert.equal(isTerminalWidgetNearViewport(tile(700, 900, 120, 480), partiallyOffscreenScroller, screen), false);
  assert.equal(isTerminalWidgetNearViewport(tile(250, 350, 710, 760), partiallyOffscreenScroller, screen), false);
});

test('does not mount zero-size or fully clipped cards', () => {
  assert.equal(isTerminalWidgetNearViewport(tile(300, 300), scroller, screen), false);
  assert.equal(isTerminalWidgetNearViewport(tile(300, 500, 20, 20), scroller, screen), false);
  assert.equal(isTerminalWidgetNearViewport(tile(300, 500), { top: 1100, bottom: 1300, left: 0, right: 768 }, screen), false);
});
