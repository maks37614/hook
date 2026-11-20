import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_TERMINAL_TOUCH_GAP_PX, MIN_TERMINAL_TOUCH_GAP_PX, MAX_TERMINAL_TOUCH_GAP_PX,
  normalizeTerminalTouchGapPx,
} from '../src/utils/terminalTouchGap';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('touch gap defaults to 20px and normalizes legacy/invalid settings', () => {
  assert.equal(DEFAULT_TERMINAL_TOUCH_GAP_PX, 20);
  assert.equal(normalizeTerminalTouchGapPx(undefined), 20);
  assert.equal(normalizeTerminalTouchGapPx('32'), 20);
  assert.equal(normalizeTerminalTouchGapPx(Number.POSITIVE_INFINITY), 20);
  assert.equal(normalizeTerminalTouchGapPx(-100), MIN_TERMINAL_TOUCH_GAP_PX);
  assert.equal(normalizeTerminalTouchGapPx(9999), MAX_TERMINAL_TOUCH_GAP_PX);
  assert.equal(normalizeTerminalTouchGapPx(25), 26);
  assert.equal(normalizeTerminalTouchGapPx(18), 18);
});

test('touch gap slider changes the Terminal grid but not the chart canvases', () => {
  const drawer = read('../src/components/terminal/TerminalSettingsDrawer.tsx');
  const page = read('../src/components/TerminalPage.tsx');
  const css = read('../src/index.css');
  assert.ok(drawer.includes('id="terminal-touch-gap"'));
  assert.ok(drawer.includes('onUpdateConfig({ touchGapPx: normalizeTerminalTouchGapPx'));
  assert.ok(page.includes("'--terminal-touch-gap':"));
  assert.ok(page.includes('normalizeTerminalTouchGapPx(config.touchGapPx)'));
  assert.ok(css.includes('gap: var(--terminal-touch-gap, 20px);'));
  assert.ok(css.includes('touch-action: pan-y;'));
  assert.ok(read('../src/components/hookchart/hookchart.css').includes('touch-action:none'));
});

test('touch gap survives workspace restoration and profile sync', () => {
  const workspace = read('../src/utils/useTerminalWorkspace.ts');
  const type = read('../src/types.ts');
  assert.ok(type.includes('touchGapPx?: number;'));
  assert.ok(workspace.includes('touchGapPx: DEFAULT_TERMINAL_TOUCH_GAP_PX'));
  assert.ok(workspace.includes('normalizeTerminalTouchGapPx(source.touchGapPx)'));
  assert.ok(workspace.includes('normalizeTerminalTouchGapPx(config.touchGapPx)'));
  assert.ok(workspace.includes('const { blocks: _blocks, ...config } = value.config;'));
});

test('gap slider is localized in Ukrainian, English, Russian and Polish', () => {
  const text = read('../src/locales/terminalSettingsDrawer20261115.ts');
  for (const key of ['touchGap', 'touchGapAria', 'touchGapHelp']) assert.ok(text.includes('"' + key + '"'));
  for (const label of ['Відступ між графіками', 'Gap between charts', 'Расстояние между графиками', 'Odstęp między wykresami'])
    assert.ok(text.includes(label));
});
