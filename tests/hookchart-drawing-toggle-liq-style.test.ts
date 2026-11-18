import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
const integration = readFileSync(new URL('../src/components/hookchart/integration.css', import.meta.url), 'utf8');

test('Drawing tools toggle uses the same expanded/collapsed triangle as the Liq toggle', () => {
  assert.match(engine, /liqHudOpen\?'▴':'▾'/);
  assert.match(canvas, /\{drawingToolbarOpen \? '▴' : '▾'\}/);
  assert.match(canvas, /aria-expanded=\{drawingToolbarOpen\}/);
  assert.match(canvas, /onClick=\{toggleDrawingToolbar\}/);
});

test('Drawing tools toggle matches Liq styling but retains its original position and dimensions', () => {
  assert.match(integration, /\.drawPanelToggle \{[^}]*left: 6px; top: 8px; width: 25px; height: 28px;[^}]*color: #778495; font-size: 16px; line-height: 1;[^}]*\}/);
  assert.match(integration, /\.drawPanelToggle\{left:6px;top:8px;width:25px;height:30px;border-radius:0\}/);
  assert.match(integration, /\.drawPanelToggle\.open\{left:48px\}/);
  assert.match(integration, /\.drawPanelToggle:hover \{ color: #dce5ef; \}/);
});
