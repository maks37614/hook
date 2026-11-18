import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createChartCrosshairStore } from '../src/components/hookchart/crosshairState';
import { CrosshairTimeLabel } from '../src/components/hookchart/CrosshairTimeLabel';

test('crosshair snapshots stay cached between updates and identical positions do not notify', () => {
  const store = createChartCrosshairStore();
  let updates = 0;
  const unsubscribe = store.subscribe(() => { updates++; });
  assert.equal(store.getSnapshot(), null);
  store.set({ x: 20, time: 1_700_000_000_000 });
  const snapshot = store.getSnapshot();
  assert.equal(store.getSnapshot(), snapshot);
  store.set({ x: 20, time: 1_700_000_000_000 });
  assert.equal(store.getSnapshot(), snapshot);
  assert.equal(updates, 1);
  store.set(null);
  store.set(null);
  assert.equal(updates, 2);
  unsubscribe();
  store.set({ x: 30, time: 1_700_000_000_000 });
  assert.equal(updates, 2);
});

test('rapid pointer updates are local to the subscribed chart label', () => {
  const first = createChartCrosshairStore(), second = createChartCrosshairStore();
  let firstLabels = 0, secondLabels = 0;
  const stop = first.subscribe(() => { firstLabels++; });
  second.subscribe(() => { secondLabels++; });
  for (let x = 0; x < 2_000; x++) first.set({ x, time: 1_700_000_000_000 + x * 60_000 });
  assert.equal(firstLabels, 2_000);
  assert.equal(secondLabels, 0);
  assert.equal(second.getSnapshot(), null);
  stop();
  first.set(null);
  assert.equal(firstLabels, 2_000);
});

test('snapshots cannot be silently mutated by the caller and invalid coordinates clear the label', () => {
  const store = createChartCrosshairStore();
  const point = { x: 10, time: 1_700_000_000_000 };
  store.set(point);
  point.x = 100;
  assert.equal(store.getSnapshot()?.x, 10);
  store.set({ x: NaN, time: point.time });
  assert.equal(store.getSnapshot(), null);
  store.set({ x: 10, time: Infinity });
  assert.equal(store.getSnapshot(), null);
});

test('the isolated label keeps date/time, timezone and mobile edge clamping', () => {
  const store = createChartCrosshairStore();
  const time = Date.UTC(2026, 10, 9, 6, 32, 18);
  for (const plotWidth of [190, 340, 1_316]) {
    for (const x of [0, plotWidth / 2, plotWidth - 1]) {
      store.set({ x, time });
      const html = renderToStaticMarkup(React.createElement(CrosshairTimeLabel, {
        store, plotWidth, timezone: 'Europe/Warsaw', language: 'uk',
      }));
      assert.match(html, /07:32/);
      assert.match(html, /2026/);
      const style = html.match(/style="left:([\d.]+)(?:px)?;width:([\d.]+)px"/);
      assert.ok(style, html);
      assert.ok(Number(style[1]) >= 0);
      assert.ok(Number(style[1]) + Number(style[2]) <= plotWidth);
    }
  }
  const utc = renderToStaticMarkup(React.createElement(CrosshairTimeLabel, {
    store, plotWidth: 340, timezone: 'UTC', language: 'en', seconds: true,
  }));
  assert.match(utc, /06:32:18/);
  store.set(null);
  assert.equal(renderToStaticMarkup(React.createElement(CrosshairTimeLabel, {
    store, plotWidth: 340, timezone: 'UTC', language: 'uk',
  })), '');
});
