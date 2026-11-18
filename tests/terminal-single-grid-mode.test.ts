import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('one Terminal coin uses the exact same normal resizable and removable grid tile', () => {
  const page = file('../src/components/TerminalPage.tsx');
  const item = file('../src/components/terminal/TerminalGridItem.tsx');
  const widget = file('../src/components/terminal/TerminalChartWidget.tsx');

  assert.doesNotMatch(page, /blocks\.length === 1 \? \(\s*\/\* Single Screen/);
  assert.equal((page.match(/<TerminalGridItem\s/g) ?? []).length, 1);
  assert.match(page, /visibleWorkspaceBlocks\.map\(\(block, index\)/);
  assert.match(page, /isMaximized=\{isMaximized\}/);
  assert.match(page, /onDragStart=\{handleDragStart\}/);
  assert.match(page, /onRemove=\{handleRemoveBlock\}/);
  assert.match(page, /onUpdateBlock=\{handleUpdateBlock\}/);
  assert.match(page, /onOpenCoinSelector=\{handleOpenCoinSelector\}/);
  assert.match(item, /isSingleBlock=\{false\}/);
  assert.match(item, /onToggleMaximize=\{toggle\}/);
  assert.match(item, /onRemove=\{remove\}/);
  assert.match(item, /onUpdateBlock=\{update\}/);
  assert.match(item, /onDragStart=\{dragStart\}/);
  assert.match(widget, /terminal-chart-drag-handle/);
  assert.match(widget, /onUpdateBlock\(\{ heightPx: height\.px \}\)/);
  assert.match(widget, /onUpdateBlock\(\{ colSpan: 2 \}\)/);
  assert.match(widget, /onClick=\{onRemove\}/);
  assert.match(widget, /hookchartToolbarActions=\{useIntegratedHookChartToolbar/);
  assert.doesNotMatch(page, /Sub-header: 24h Coin Market Stats Bar/);
});

test('first chart remains large with standard block resize and maximize controls', () => {
  const page = file('../src/components/TerminalPage.tsx');
  const widget = file('../src/components/terminal/TerminalChartWidget.tsx');
  assert.match(page, /if \(visibleWorkspaceBlocks\.length === 1\) return 'var\(--terminal-chart-height\)'/);
  assert.match(page, /terminalGridColumnClasses\(/);
  assert.doesNotMatch(page, /clamp\(300px, calc\(\(100dvh - 120px\) \/ 2\), 500px\)/);
  assert.match(widget, /block\.heightPx\s*\? `\$\{block\.heightPx\}px`/);
  assert.match(widget, /isMaximized\s*\? 'calc\(100vh - 2rem\)'/);
  assert.match(page, /\{terminalBelowCharts\}/);
});
