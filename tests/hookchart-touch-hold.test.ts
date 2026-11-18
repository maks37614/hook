import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createChartTouchHold, isChartControlTarget,
  TOUCH_CURSOR_HOLD_MS, TOUCH_MAGNIFIER_HOLD_MS,
} from '../src/components/hookchart/touchHold';

function clock() {
  let nextId = 0;
  const callbacks = new Map<number, { callback: () => void; delay: number }>();
  const cancelled: number[] = [];
  return {
    schedule(callback: () => void, delay: number) {
      callbacks.set(++nextId, { callback, delay });
      return nextId;
    },
    cancel(handle: unknown) {
      cancelled.push(Number(handle));
      callbacks.delete(Number(handle));
    },
    fire() {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach(({ callback }) => callback());
    },
    get count() { return callbacks.size; },
    get delays() { return [...callbacks.values()].map(x => x.delay); },
    callbacks, cancelled,
  };
}

test('short hold reveals only the cursor, longer still hold enables the magnifier', () => {
  const t = clock(), hold = createChartTouchHold(t);
  const modes: string[] = [];
  hold.start(1, {x:100,y:200}, () => modes.push('cursor'), () => modes.push('magnifier'));
  assert.deepEqual(t.delays, [TOUCH_CURSOR_HOLD_MS]);
  assert.equal(hold.pending(), true);
  t.fire();
  assert.deepEqual(modes, ['cursor']);
  assert.deepEqual(t.delays, [TOUCH_MAGNIFIER_HOLD_MS - TOUCH_CURSOR_HOLD_MS]);
  assert.equal(hold.pending(), false);
  t.fire();
  assert.deepEqual(modes, ['cursor', 'magnifier']);
  assert.equal(t.count, 0);
});

test('short cursor mode works at the chart boundaries, volume and price scale', () => {
  for (const point of [{x:1,y:1},{x:389,y:1},{x:389,y:699},{x:1,y:699},{x:365,y:250},{x:200,y:650}]) {
    const t = clock(), hold = createChartTouchHold(t);
    let selected: {x:number;y:number}|null = null;
    hold.start(1, point, p => { selected = p; });
    t.fire();
    assert.deepEqual(selected, point);
    assert.equal(hold.pending(), false);
    assert.equal(t.count, 0);
  }
});

test('small initial finger tremor still activates cursor at the latest point', () => {
  const t = clock(), hold = createChartTouchHold(t);
  let selected: {x:number;y:number}|null = null;
  hold.start(1, {x:100,y:200}, p => { selected = p; });
  assert.equal(hold.move(1, {x:106,y:205}), true);
  assert.equal(hold.move(1, {x:108,y:206}), true);
  t.fire();
  assert.deepEqual(selected, {x:108,y:206});
  assert.equal(hold.move(1, {x:125,y:225}), false);
});

test('a swipe before the short hold cancels inspection and preserves panning', () => {
  const t = clock(), hold = createChartTouchHold(t);
  const modes: string[] = [];
  hold.start(1, {x:100,y:200}, () => modes.push('cursor'), () => modes.push('magnifier'));
  assert.equal(hold.move(1, {x:115,y:200}), false);
  assert.equal(hold.pending(), false);
  t.fire();
  assert.deepEqual(modes, []);
});

test('moving the freely selected cursor cancels the longer lens timer', () => {
  const t = clock(), hold = createChartTouchHold(t);
  const modes: string[] = [];
  hold.start(1, {x:100,y:200}, () => modes.push('cursor'), () => modes.push('magnifier'));
  t.fire();
  assert.equal(hold.move(1, {x:125,y:230}), false);
  t.fire();
  assert.deepEqual(modes, ['cursor']);
  assert.equal(t.count, 0);
});

test('release and a second pointer cancel delayed magnification', () => {
  const t = clock(), hold = createChartTouchHold(t);
  const modes: string[] = [];
  hold.start(1, {x:100,y:200}, () => modes.push('cursor'), () => modes.push('magnifier'));
  t.fire();
  const stale = [...t.callbacks.values()][0]?.callback;
  hold.cancel();
  stale?.();
  assert.deepEqual(modes, ['cursor']);
  hold.start(2, {x:150,y:250}, () => modes.push('cursor2'), () => modes.push('magnifier2'));
  hold.start(3, {x:175,y:275}, () => modes.push('cursor3'), () => modes.push('magnifier3'));
  t.fire();t.fire();
  assert.deepEqual(modes, ['cursor','cursor3','magnifier3']);
});

test('only the original pointer is allowed to move or trigger its long hold', () => {
  const t = clock(), hold = createChartTouchHold(t);
  const modes: string[] = [];
  hold.start(1, {x:100,y:200}, () => modes.push('cursor'), () => modes.push('lens'));
  assert.equal(hold.move(2, {x:220,y:300}), false);
  t.fire();
  assert.equal(hold.move(2, {x:220,y:300}), false);
  t.fire();
  assert.deepEqual(modes, ['cursor','lens']);
});

test('real controls are excluded while passive HUD descendants and the canvas are not', () => {
  // The DOM supplies closest(); this checks that no blanket overlay/chart selector is used.
  const element = (ancestor: string) => ({
    closest(selector: string) {
      return selector.split(',').map(s => s.trim()).includes(ancestor) ? this : null;
    },
  }) as unknown as EventTarget;
  for (const ancestor of ['button','input','select','textarea','a','[role="button"]','.timeJumpDock','.chartScaleDock'])
    assert.equal(isChartControlTarget(element(ancestor)), true);
  for (const ancestor of ['canvas','.liqRiskHud','.liqRiskContent','.chartWrap'])
    assert.equal(isChartControlTarget(element(ancestor)), false);
  assert.equal(isChartControlTarget(null), false);
});
