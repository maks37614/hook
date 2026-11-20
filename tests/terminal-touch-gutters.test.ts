import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Terminal has native vertical scrolling from chart gutters on touch screens', () => {
  const page = read('../src/components/TerminalPage.tsx');
  const css = read('../src/index.css');

  assert.match(page, /ref=\{chartListRef\} data-terminal-scroll-viewport className="w-full h-full p-2 sm:p-3 overflow-y-auto no-scrollbar"/);
  assert.match(page, /terminal-workspace-grid grid/);
  assert.match(css, /@media \(pointer: coarse\)\s*\{\s*\.terminal-workspace-grid\s*\{\s*gap: var\(--terminal-touch-gap, 20px\);\s*touch-action: pan-y;/);
});

test('Terminal gutter scrolling does not change the HookChart canvas gestures', () => {
  const chartCss = read('../src/components/hookchart/hookchart.css');
  const css = read('../src/index.css');

  assert.match(chartCss, /\.hookchart-root \.chartWrap\{position:relative;touch-action:none;/);
  assert.doesNotMatch(css, /\.hookchart-root.*touch-action:\s*pan-y/);
});
