import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Terminal chart body is never a native draggable element', () => {
  const widget = file('../src/components/terminal/TerminalChartWidget.tsx');
  const root = widget.slice(widget.indexOf('data-terminal-block-id={block.id}'), widget.indexOf('className={`terminal-chart-block'));
  assert.match(root, /draggable=\{false\}/);
  assert.doesNotMatch(root, /onDragStart=\{onDragStart\}/);
  assert.doesNotMatch(widget, /draggable=\{!compactFullscreenMode/);
});

test('only the existing Terminal grip initiates reorder, not the candle plot', () => {
  const widget = file('../src/components/terminal/TerminalChartWidget.tsx');
  const gripStart = widget.indexOf('draggable={Boolean(onDragStart)}');
  const gripEnd = widget.indexOf('<GripVertical', gripStart);
  assert.ok(gripStart > 0 && gripEnd > gripStart);
  const grip = widget.slice(gripStart, gripEnd);
  assert.match(grip, /onDragStart=\{event =>/);
  assert.match(grip, /event\.dataTransfer\.effectAllowed = 'move'/);
  assert.match(grip, /event\.dataTransfer\.setData\('text\/plain', block\.id\)/);
  assert.match(grip, /onDragStart\?\.\(event\)/);
  assert.match(grip, /onDragEnd=\{onDragEnd\}/);
  assert.match(widget, /className="terminal-chart-plot-area/);
  assert.match(widget, /hookchartToolbarActions=\{useIntegratedHookChartToolbar/);
});

test('Terminal preserves drop-to-reorder and clears aborted drags', () => {
  const grid = file('../src/components/terminal/TerminalGridItem.tsx');
  const page = file('../src/components/TerminalPage.tsx');
  assert.match(grid, /onDragStart=\{dragStart\}/);
  assert.match(grid, /onDragEnd=\{onDragEnd\}/);
  assert.match(grid, /onDrop=\{drop\}/);
  assert.match(page, /const handleDragEnd = useCallback\(\(\) => \{[\s\S]*?draggedBlockIndexRef\.current = null;/);
  assert.match(page, /onDragEnd=\{handleDragEnd\}/);
  assert.match(page, /onDrop=\{handleDrop\}/);
});
