import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createChartFrameScheduler } from '../src/components/hookchart/frameScheduler';

function manualFrameClock() {
  const tasks = new Map<number, () => void>();
  let id = 0;
  return {
    tasks,
    request(callback: () => void) { const next = ++id; tasks.set(next, callback); return next; },
    cancel(id: number) { tasks.delete(id); },
    tick() {
      const callbacks = [...tasks.values()];
      tasks.clear();
      callbacks.forEach(callback => callback());
    },
  };
}

test('Terminal full-canvas commits coalesce into one RAF and use latest market scene', () => {
  const clock = manualFrameClock();
  let drawn = 0;
  let currentExchangePrice = 100;
  const paintedPrices: number[] = [];
  const scheduler = createChartFrameScheduler({
    scene: () => { drawn++; paintedPrices.push(currentExchangePrice); },
    interaction: () => { throw new Error('full candle scene must not become pointer-only'); },
  }, clock);
  // Price, depth, liquidation and drawing state may all commit before one paint.
  for (let update = 0; update < 100; update++) {
    currentExchangePrice = 100 + update;
    scheduler.request(true);
  }
  assert.equal(clock.tasks.size, 1);
  clock.tick();
  assert.equal(drawn, 1);
  assert.deepEqual(paintedPrices, [199]);
  // An interactive scene already queued cannot be downgraded to pointer-only.
  scheduler.request(true);
  scheduler.request(false);
  clock.tick();
  assert.equal(drawn, 2);
});

test('all HookChart scenes coalesce render commits, including fullscreen and Replay', () => {
  const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  const commitEffect = engine.match(/\/\/ Every HookChart can receive multiple market\/viewport commits[\s\S]*?\},\[candles,vp,drawings,alerts/);
  assert.ok(commitEffect, 'the viewport-driven commit effect remains present');
  assert.match(commitEffect[0], /frames\.current\?\.request\(true\)/,
    'dragging and live updates must queue one complete scene per animation frame');
  assert.doesNotMatch(commitEffect[0], /frames\.current\?\.flush\(\)/,
    'commits must not synchronously block pointer events with a full DPR paint');
  assert.match(engine, /if\(document\.visibilityState==='hidden'\|\|!chartOnScreen\.current\)\{frames\.current\?\.cancel\(\);return\}/);
  assert.match(engine, /\[candles,vp,drawings,alerts,densities,marketPrints,liquidations,autoLevels,/);
  assert.match(engine, /strategyResult,scalperResult,scalperLineStyle,showScalperTouchPoints,showScalperLabels,/,
    'changing Scalper lines, points or captions must trigger a chart repaint');
  assert.match(engine, /liquidationCut,timezone,language,terminalMode,keyboardMagnifierActive\]\)/,
    'keyboard magnifier visibility must also trigger a chart repaint');
});

test('visibility cancellation prevents a stale queued market scene from rendering', () => {
  const clock = manualFrameClock();
  let painted = 0;
  const scheduler = createChartFrameScheduler({ scene: () => { painted++; }, interaction: () => {} }, clock);
  scheduler.request(true);
  const staleFrame = [...clock.tasks.values()][0];
  scheduler.cancel();
  staleFrame();
  clock.tick();
  assert.equal(painted, 0);
  scheduler.request(true);
  clock.tick();
  assert.equal(painted, 1);
});
