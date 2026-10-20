import assert from 'node:assert/strict';
import test from 'node:test';
import { fitTerminalColumns, terminalChartHeight, terminalColumnSpan, terminalGridRows } from '../src/utils/terminalGridLayout';

test('terminal grid caps the selected columns to the actual available width', () => {
  assert.equal(fitTerminalColumns(320, 6), 1);
  assert.equal(fitTerminalColumns(390, 4), 1);
  assert.equal(fitTerminalColumns(650, 6), 2);
  assert.equal(fitTerminalColumns(1024, 6), 3);
  assert.equal(fitTerminalColumns(1440, 6), 4);
  assert.equal(fitTerminalColumns(1920, 6), 6);
  assert.equal(fitTerminalColumns(1920, 2), 2);
});

test('terminal charts fill a row while preserving a readable mobile minimum', () => {
  assert.equal(terminalChartHeight(700, 2, 2, true, 'medium'), '676px');
  assert.equal(terminalChartHeight(700, 2, 1, true, 'medium'), '332px');
  assert.equal(terminalChartHeight(600, 6, 1, true, 'medium'), '300px');
  assert.equal(terminalChartHeight(600, 4, 2, false, 'compact'), '280px');
  assert.equal(terminalChartHeight(600, 4, 2, false, 'large'), '500px');
});

test('auto-fit accounts for blocks that occupy an entire grid row', () => {
  assert.equal(terminalGridRows([2, 1, 1], 2), 2);
  assert.equal(terminalGridRows([2, 2, 1], 2), 3);
  assert.equal(terminalGridRows(['full', 1, 1], 2), 2);
  assert.equal(terminalChartHeight(700, 3, 2, true, 'medium', [2, 2, 1]), '300px');
});

test('chart spans never introduce implicit columns on small screens', () => {
  assert.equal(terminalColumnSpan(3, 1), 'span 1');
  assert.equal(terminalColumnSpan(3, 2), 'span 2');
  assert.equal(terminalColumnSpan('full', 1), '1 / -1');
  assert.equal(terminalColumnSpan(2, 4), 'span 2');
});
