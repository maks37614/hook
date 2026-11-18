import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { terminalResponsiveColumns, terminalResponsiveRows, terminalResponsiveAutoHeights } from '../src/utils/terminalResponsiveGrid';
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

test('Terminal grid auto-heights follow responsive breakpoints without resize or market polling', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(page, /terminalResponsiveAutoHeights\(visibleWorkspaceBlocks, config\.columns\)/);
  assert.match(page, /style=\{terminalHeightVariables\}/);
  assert.match(page, /return 'var\(--terminal-chart-height\)'/);
  assert.doesNotMatch(page, /Math\.ceil\(visibleWorkspaceBlocks\.length \/ cols\)/);
  for (const size of ['mobile', 'tablet', 'desktop', 'wide']) {
    assert.ok(css.includes(`--terminal-height-${size}`), size);
  }
  assert.match(css, /min-width: 768px/);
  assert.match(css, /min-width: 1024px/);
  assert.match(css, /min-width: 1280px/);
});
