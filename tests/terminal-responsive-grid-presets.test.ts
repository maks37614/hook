import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { terminalResponsiveColumns, terminalResponsiveRows, terminalResponsiveAutoHeights, terminalResponsiveLayoutColumns, terminalGridColumnClasses, terminalResponsiveSpanClasses } from '../src/utils/terminalResponsiveGrid';
import type { TerminalChartBlock } from '../src/types';

const blocks = (spans: TerminalChartBlock['colSpan'][]): Pick<TerminalChartBlock, 'colSpan'>[] =>
  spans.map(colSpan => ({ colSpan }));

test('a three-coin saved preset occupies three rows on a phone, not one fullscreen row', () => {
  const three = blocks([1, 1, 1]);
  assert.equal(terminalResponsiveColumns(3, 'mobile'), 1);
  assert.equal(terminalResponsiveColumns(3, 'tablet'), 2);
  assert.equal(terminalResponsiveColumns(3, 'desktop'), 2);
  assert.equal(terminalResponsiveColumns(3, 'wide'), 3);
  assert.equal(terminalResponsiveRows(three, 3, 'mobile'), 3);
  assert.equal(terminalResponsiveRows(three, 3, 'tablet'), 2);
  assert.equal(terminalResponsiveRows(three, 3, 'wide'), 1);
  const heights = terminalResponsiveAutoHeights(three, 3);
  assert.equal(heights.mobile, 'calc((100dvh - 130px) / 3)');
  assert.equal(heights.tablet, 'calc((100dvh - 120px) / 2)');
  assert.equal(heights.wide, 'calc(100dvh - 110px)');
});

test('full-width blocks add rows; wide saved charts do not conceal other coins', () => {
  const resized = blocks(['full', 1, 1]);
  assert.equal(terminalResponsiveRows(resized, 3, 'wide'), 2);
  assert.equal(terminalResponsiveRows(resized, 3, 'mobile'), 3);
  assert.equal(terminalResponsiveRows(blocks([2, 1, 1]), 2, 'tablet'), 2);
  assert.equal(terminalResponsiveRows(blocks([1]), 3, 'mobile'), 1);
  assert.equal(terminalResponsiveRows([], 3, 'mobile'), 0);
});


test('free grid auto-adapts 1, 2, 3, 4, 5 and 10 coins to the viewport', () => {
  const specs = [
    [1, 1, 1, 'grid-cols-1'],
    [2, 2, 2, 'grid-cols-1 md:grid-cols-2'],
    [3, 2, 3, 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'],
    [4, 2, 2, 'grid-cols-1 md:grid-cols-2'],
    [5, 2, 3, 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'],
    [10, 3, 4, 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'],
  ] as const;
  for (const [count, desktop, wide, css] of specs) {
    assert.equal(terminalGridColumnClasses('custom', 2, count), css);
    assert.equal(terminalResponsiveLayoutColumns(2, count, 'mobile'), 1);
    assert.equal(terminalResponsiveLayoutColumns(2, count, 'desktop'), desktop);
    assert.equal(terminalResponsiveLayoutColumns(2, count, 'wide'), wide);
    const charts = blocks(Array(count).fill(1));
    assert.equal(terminalResponsiveRows(charts, 2, 'wide', 'custom', true), Math.ceil(count / wide));
    assert.ok(terminalResponsiveAutoHeights(charts, 2, 'custom', true).wide.includes('100dvh'));
  }
});

test('fixed presets and manually selected columns override auto-layout', () => {
  assert.equal(terminalGridColumnClasses('4x4', 4, 4), 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4');
  assert.equal(terminalGridColumnClasses('2x2', 2, 4), 'grid-cols-1 md:grid-cols-2');
  assert.equal(terminalGridColumnClasses('1x1', 1, 5), 'grid-cols-1');
  assert.equal(terminalGridColumnClasses('custom', 1, 4, false), 'grid-cols-1');
  assert.equal(terminalResponsiveLayoutColumns(1, 4, 'wide', 'custom', false), 1);
  assert.equal(terminalResponsiveLayoutColumns(4, 4, 'wide', '4x4'), 4);
  assert.equal(terminalGridColumnClasses('4x4', 4, 1), 'grid-cols-1');
  assert.equal(terminalResponsiveAutoHeights(blocks([1]), 4, '4x4').wide, 'calc(100dvh - 110px)');
});

test('Terminal grid keeps regular tile heights for one or many coins without additional polling', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(page, /terminalResponsiveAutoHeights\(/);
  assert.match(page, /visibleWorkspaceBlocks, config\.columns, config\.layoutPreset/);
  assert.match(page, /style=\{terminalHeightVariables\}/);
  assert.match(page, /return 'var\(--terminal-chart-height\)'/);
  assert.match(page, /if \(visibleWorkspaceBlocks\.length === 1\) return 'var\(--terminal-chart-height\)'/);
  assert.match(page, /terminalGridColumnClasses\(/);
  assert.doesNotMatch(page, /Math\.ceil\(visibleWorkspaceBlocks\.length \/ cols\)/);
  for (const size of ['mobile', 'tablet', 'desktop', 'wide']) {
    assert.ok(css.includes(`--terminal-height-${size}`), size);
  }
  assert.match(css, /min-width: 768px/);
  assert.match(css, /min-width: 1024px/);
  assert.match(css, /min-width: 1280px/);
});

test('manual and fixed grid choices survive automatic market preset refresh', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /current\.layoutPreset !== 'custom' \|\| current\.freeLayoutAutoColumns === false/);
  assert.match(page, /terminalGridColumnClasses\(/);
});

test('widened chart never creates implicit tracks beyond the responsive grid', () => {
  assert.equal(terminalResponsiveSpanClasses(3, 1, 3, 'custom', false),
    'col-span-1 md:col-span-1 lg:col-span-1 xl:col-span-1');
  assert.equal(terminalResponsiveSpanClasses(3, 2, 3, 'custom', true),
    'col-span-1 md:col-span-2 lg:col-span-2 xl:col-span-3');
  assert.equal(terminalResponsiveSpanClasses(3, 2, 4, '2x2', false),
    'col-span-1 md:col-span-2 lg:col-span-2 xl:col-span-2');
  assert.equal(terminalResponsiveSpanClasses(3, 4, 4, '4x4', false),
    'col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-3');
  assert.equal(terminalResponsiveSpanClasses('full', 1, 4), 'col-span-full');
  assert.equal(terminalResponsiveSpanClasses(1, 2, 1), 'col-span-full');
  const widget = readFileSync(new URL('../src/components/terminal/TerminalChartWidget.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(widget, /if \(responsiveSpanClass\) return responsiveSpanClass/);
  assert.match(page, /responsiveSpanClass=\{terminalResponsiveSpanClasses\(/);
});
