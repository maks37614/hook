import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  drawingActionsPosition, freeDrawingPoint, translateDrawingPoints,
  type DrawingGeometry,
} from '../src/components/hookchart/drawingManipulation';

const geometry: DrawingGeometry = {
  plotH: 200,
  x: time => time / 1000,
  y: price => 200 - price,
  p: y => 200 - y,
  timeAtX: x => x * 1000,
};

test('moving a drawing translates all price and time anchors, preserving their spacing', () => {
  const initial = [{ t: 10_000, p: 50 }, { t: 30_000, p: 70 }];
  const moved = translateDrawingPoints(initial, { x: 20, y: 80 }, { x: 36, y: 65 }, geometry);
  assert.deepEqual(moved, [{ t: 26_000, p: 65 }, { t: 46_000, p: 85 }]);
  assert.deepEqual(initial, [{ t: 10_000, p: 50 }, { t: 30_000, p: 70 }]);
});

test('changing one endpoint does not require changing the other endpoint', () => {
  const p = freeDrawingPoint(18, 140, geometry);
  assert.deepEqual(p, { t: 18_000, p: 60 });
  const points = [{ t: 10_000, p: 40 }, { t: 30_000, p: 70 }];
  const next = points.map((point, index) => index === 1 ? p : point);
  assert.deepEqual(next[0], points[0]);
  assert.deepEqual(next[1], p);
});

test('free edits clamp price to the visible plot instead of snapping to candle OHLC', () => {
  assert.deepEqual(freeDrawingPoint(250, -20, geometry), { t: 250_000, p: 200 });
  assert.deepEqual(freeDrawingPoint(250, 240, geometry), { t: 250_000, p: 0 });
});

test('context controls remain in chart bounds even near edges and on small charts', () => {
  assert.deepEqual(drawingActionsPosition(400, 180, 440, 220), { x: 370, y: 139 });
  const small = drawingActionsPosition(0, 0, 70, 35);
  assert.ok(small.x >= 0 && small.y >= 0);
  assert.ok(small.x <= 70 && small.y <= 35);
});

test('compact icon-only toolbar stays inside small plots at every corner', () => {
  for (const [x, y] of [[0, 0], [120, 0], [0, 80], [120, 80]]) {
    const p = drawingActionsPosition(x, y, 120, 80);
    assert.ok(p.x >= 2 && p.x + 68 <= 120, '34px touch buttons must remain visible');
    assert.ok(p.y >= 2 && p.y + 34 <= 80, 'toolbar must remain vertically visible');
  }
});

test('edit and delete actions for drawings and alerts use the same compact, borderless toolbar', () => {
  const css = readFileSync(new URL('../src/components/hookchart/hookchart.css', import.meta.url), 'utf8');
  const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  assert.match(css, /\.chartDrawingActions\s*\{[^}]*background:transparent!important/);
  assert.match(css, /\.chartDrawingActions button\s*\{[^}]*border:0!important/);
  assert.match(css, /\.chartDrawingActions button svg\s*\{[^}]*width:13px!important/);
  assert.match(css, /@media\(pointer:coarse\)\s*\{[^}]*chartDrawingActions button/);
  assert.match(engine, /aria-label=\{translateHookChartPhrase\(language,'Дії з інструментом графіка'\)\}/);
  assert.match(engine, /aria-label=\{translateHookChartPhrase\(language,'Дії з сигнальним рівнем'\)\}/);
});
