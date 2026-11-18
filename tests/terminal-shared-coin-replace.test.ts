import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = read('../src/components/TerminalPage.tsx');
const grid = read('../src/components/terminal/TerminalGridItem.tsx');
const widget = read('../src/components/terminal/TerminalChartWidget.tsx');
const modal = read('../src/components/terminal/AddChartModal.tsx');

test('clicking a Terminal chart symbol opens the same shared market picker as Add Chart', () => {
  assert.match(widget, /onOpenCoinSelector\?: \(\) => void/);
  assert.match(widget, /if \(onOpenCoinSelector\) \{[\s\S]*?onOpenCoinSelector\(\)/);
  assert.match(grid, /onOpenCoinSelector=\{openCoinSelector\}/);
  assert.match(page, /onOpenCoinSelector=\{handleOpenCoinSelector\}/);
  assert.match(page, /setReplaceBlockId\(blockId\);\s*setIsAddModalOpen\(true\)/);
  assert.match(page, /<AddChartModal[\s\S]*?mode=\{replaceBlockId !== null \? 'replace' : 'add'\}/);
});

test('replacement preserves chart identity and settings without creating a new chart', () => {
  const replacement = page.slice(page.indexOf('if (replaceBlockId !== null) {'),
    page.indexOf('const newBlock: TerminalChartBlock'));
  assert.match(replacement, /setBlocks\(previous => previous\.map\(block => block\.id !== replaceBlockId \? block : \{/);
  assert.match(replacement, /\.\.\.block,/);
  for (const key of ['symbol', 'baseAsset: base', 'quoteAsset: quote', 'exchange', 'marketType',
    'timeframe: tf || block.timeframe', 'formationId']) {
    assert.ok(replacement.includes(key), `Missing replacement field ${key}`);
  }
  assert.match(replacement, /return;/);
  assert.doesNotMatch(replacement, /fetch\(|new WebSocket\(|\.push\(/);
  assert.match(page, /atChartLimit=\{replaceBlockId === null && blocks\.length >= MAX_TERMINAL_CHARTS\}/);
  assert.match(page, /initialTimeframe=\{replaceBlockId !== null[\s\S]*?blocks\.find\(block => block\.id === replaceBlockId\)\?\.timeframe/);
  assert.match(page, /setReplaceBlockId\(null\)/);
});

test('shared picker consumes the Terminal catalog even before first quote refresh finishes', () => {
  assert.match(page, /terminalMarketCoins=\{marketCoins\}/);
  assert.match(modal, /const availableMarketCoins = terminalMarketCoins \?\? marketCoins/);
  assert.match(modal, /if \(terminalMarketCoins !== undefined\) \{[\s\S]*?return;/);
  assert.match(modal, /mode === 'replace'/);
  assert.match(modal, /Змінити монету на графіку/);
  assert.match(modal, /Zmień monetę na wykresie/);
  assert.match(modal, /Change chart coin/);
  assert.match(modal, /Изменить монету на графике/);
});
