import test from 'node:test';
import assert from 'node:assert/strict';
import { measurementStats, measurementLabelLayout, measurementHit, paintMeasurement } from '../src/components/hookchart/measurementTool';

const candles = [
  { t: 0, o: 100, h: 100, l: 100, c: 100, v: 10, n: 1 },
  { t: 60000, o: 103, h: 103, l: 103, c: 103, v: 20, n: 1 },
  { t: 120000, o: 90, h: 90, l: 90, c: 90, v: 30, n: 1 },
];
const view = { x: (t: number) => 20 + t / 1200, y: (p: number) => (110 - p) * 10, plotW: 330, plotH: 380 };
const start = { t: 0, p: 100 }, end = { t: 120000, p: 90 };

test('measurement metrics include actual volume of candles in both endpoints and signed price change', () => {
  const stats = measurementStats(candles, start, end, 60000);
  assert.equal(stats.pct, -10);
  assert.equal(stats.delta, -10);
  assert.equal(stats.bars, 2);
  assert.equal(stats.ms, 120000);
  assert.equal(stats.volume, 60);
  assert.equal(stats.quoteVolume, 5760);
  assert.deepEqual(measurementStats(candles, end, start, 60000), { ...stats, pct: 100 / 9, delta: 10 });
});

test('measurements in the right-side future space show elapsed bars but do not invent volume', () => {
  const stats = measurementStats(candles, { t: 180000, p: 95 }, { t: 480000, p: 92 }, 60000);
  assert.equal(stats.bars, 5);
  assert.equal(stats.volume, 0);
  assert.equal(stats.quoteVolume, 0);
});

test('hit testing supports free resize, dragging the shaded range and deleting from hovered tooltip', () => {
  const label = measurementLabelLayout(view, start, end);
  assert.equal(measurementHit(view, start, end, view.x(start.t), view.y(start.p)), 'start');
  assert.equal(measurementHit(view, start, end, view.x(end.t), view.y(end.p)), 'end');
  assert.equal(measurementHit(view, start, end, 70, 150), 'body');
  assert.equal(measurementHit(view, start, end, label.deleteX, label.deleteY), 'delete');
  assert.equal(measurementHit(view, start, end, 315, 300), null);
});

test('measurement painter includes four metric rows and only reveals trash when hovered', () => {
  const labels: string[] = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, strokeRect() {},
    moveTo() {}, lineTo() {}, stroke() {}, setLineDash() {}, arc() {}, fill() {},
    fillText(text: string) { labels.push(text); }
  } as unknown as CanvasRenderingContext2D;
  paintMeasurement(ctx, view, start, end, measurementStats(candles, start, end, 60000), 'uk', true, false);
  assert.equal(labels.length, 4);
  assert.match(labels[0], /-10\.00%/);
  assert.match(labels[2], /2 барів/);
  assert.match(labels[3], /Обсяг/);
});
