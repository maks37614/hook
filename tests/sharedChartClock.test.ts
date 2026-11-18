import assert from 'node:assert/strict';
import test from 'node:test';
import { CHART_CLOCK_PHASE_MS, createSharedChartClock } from '../src/components/hookchart/sharedChartClock';

test('ten HookCharts share one phased timer, each receiving one update per second', () => {
  const jobs = new Map<number, () => void>();
  let nextId = 0;
  let starts = 0;
  let stops = 0;
  const clock = createSharedChartClock({
    schedule: (callback, ms) => {
      assert.equal(ms, CHART_CLOCK_PHASE_MS);
      const id = ++nextId;
      starts++;
      jobs.set(id, callback);
      return id as unknown as ReturnType<typeof setInterval>;
    },
    cancel: timer => { stops++; jobs.delete(timer as unknown as number); },
  });
  let renders = 0;
  const off = Array.from({ length: 10 }, () => clock.subscribe(() => { renders++; }));
  assert.equal(starts, 1);
  assert.equal(jobs.size, 1);
  assert.equal(clock.activeSubscribers(), 10);
  for (let i = 0; i < 5; i++) for (const tick of jobs.values()) tick();
  assert.equal(renders, 10);
  off.slice(0, 9).forEach(stop => stop());
  assert.equal(clock.activeSubscribers(), 1);
  assert.equal(stops, 0);
  for (let i = 0; i < 5; i++) for (const tick of jobs.values()) tick();
  assert.equal(renders, 11);
  off.at(-1)!();
  off.at(-1)!();
  assert.equal(clock.activeSubscribers(), 0);
  assert.equal(stops, 1);
  assert.equal(jobs.size, 0);
});

test('chart exceptions and unsubscribe during dispatch never affect other charts', () => {
  const jobs: Array<() => void> = [];
  const clock = createSharedChartClock({
    schedule: callback => { jobs.push(callback); return jobs.length as unknown as ReturnType<typeof setInterval>; },
    cancel: () => {},
  });
  let called = 0;
  let stopOther = () => {};
  const stopBroken = clock.subscribe(() => { stopOther(); throw new Error('stale chart'); });
  stopOther = clock.subscribe(() => { called++; });
  const stopHealthy = clock.subscribe(() => { called++; });
  for (let i = 0; i < 5; i++) jobs[0]();
  assert.equal(called, 1);
  stopBroken();
  stopHealthy();
  assert.equal(clock.activeSubscribers(), 0);
});

test('unmounted charts do not keep timers or lose the next subscription', () => {
  let starts = 0;
  const clock = createSharedChartClock({
    schedule: () => (++starts) as unknown as ReturnType<typeof setInterval>,
    cancel: () => {},
  });
  clock.subscribe(() => {})();
  clock.subscribe(() => {})();
  assert.equal(starts, 2);
});

test('reusing the same maintenance callback is safely reference counted', () => {
  let pulse: () => void = () => {};
  const clock = createSharedChartClock({
    schedule: fn => { pulse = fn; return 1 as unknown as ReturnType<typeof setInterval>; },
    cancel: () => {},
  });
  let calls = 0;
  const callback = () => { calls++; };
  const unsubscribeA = clock.subscribe(callback);
  const unsubscribeB = clock.subscribe(callback);
  assert.equal(clock.activeSubscribers(), 1);
  for (let i = 0; i < 5; i++) pulse();
  assert.equal(calls, 1);
  unsubscribeA();
  assert.equal(clock.activeSubscribers(), 1);
  for (let i = 0; i < 5; i++) pulse();
  assert.equal(calls, 2);
  unsubscribeB();
  assert.equal(clock.activeSubscribers(), 0);
});

