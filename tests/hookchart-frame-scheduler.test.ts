import test from 'node:test';
import assert from 'node:assert/strict';
import { createChartFrameScheduler } from '../src/components/hookchart/frameScheduler';

function frameClock() {
  let next = 0;
  const queue = new Map<number, () => void>();
  return {
    request(callback: () => void) { queue.set(++next, callback); return next; },
    cancel(id: number) { queue.delete(id); },
    tick() { const callbacks = [...queue.values()]; queue.clear(); callbacks.forEach(callback => callback()); },
    get size() { return queue.size; },
    queue,
  };
}

test('a burst of pointer events paints only one interaction layer, with no candle repaint', () => {
  const clock = frameClock();
  let scenes = 0, overlays = 0;
  const frames = createChartFrameScheduler({scene:()=>{scenes++;},interaction:()=>{overlays++;}},clock);
  for (let move = 0; move < 1_000; move++) frames.request(false);
  assert.equal(clock.size, 1);
  clock.tick();
  assert.equal(scenes, 0);
  assert.equal(overlays, 1);
});

test('continuous pointer-only motion never schedules expensive scene work', () => {
  const clock = frameClock();
  let scenes = 0, overlays = 0;
  const frames = createChartFrameScheduler({scene:()=>{scenes++;},interaction:()=>{overlays++;}},clock);
  for (let frame = 0; frame < 200; frame++) {
    frames.request(false);
    clock.tick();
  }
  assert.equal(scenes, 0);
  assert.equal(overlays, 200);
});

test('new prices, viewport changes or drawing previews upgrade a pending pointer frame', () => {
  const clock = frameClock();
  let scenes = 0, overlays = 0;
  const frames = createChartFrameScheduler({scene:()=>{scenes++;},interaction:()=>{overlays++;}},clock);
  frames.request(false);
  frames.request();
  frames.request(false);
  assert.equal(clock.size, 1);
  clock.tick();
  assert.equal(scenes, 1);
  assert.equal(overlays, 0);
  frames.request(false);
  clock.tick();
  assert.equal(overlays, 1);
});

test('a React scene commit drops stale queued frames and paints the new scene once', () => {
  const clock = frameClock();
  let scenes = 0, overlays = 0;
  const frames = createChartFrameScheduler({scene:()=>{scenes++;},interaction:()=>{overlays++;}},clock);
  frames.request(false);
  const stale = [...clock.queue.values()][0];
  frames.flush();
  stale();
  clock.tick();
  assert.equal(scenes, 1);
  assert.equal(overlays, 0);
  assert.equal(clock.size, 0);
});

test('cleanup cancels pending work without disabling remount or visibility recovery', () => {
  const clock = frameClock();
  let scenes = 0, overlays = 0;
  const frames = createChartFrameScheduler({scene:()=>{scenes++;},interaction:()=>{overlays++;}},clock);
  frames.request();
  const stale = [...clock.queue.values()][0];
  frames.cancel();
  frames.request(false);
  stale();
  clock.tick();
  assert.equal(scenes, 0);
  assert.equal(overlays, 1);
  frames.flush();
  assert.equal(scenes, 1);
});
