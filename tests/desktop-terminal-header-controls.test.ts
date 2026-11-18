import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { applyTerminalTimeframe } from '../src/utils/terminalTimeframe';
import type { TerminalChartBlock, Timeframe } from '../src/types';

const blocks: TerminalChartBlock[] = Array.from({ length: 12 }, (_, i) => ({
  id: 'chart-' + i, symbol: i % 2 ? 'ETHUSDT' : 'BTCUSDT',
  baseAsset: i % 2 ? 'ETH' : 'BTC', quoteAsset: 'USDT',
  exchange: i % 2 ? 'bybit' : 'binance',
  marketType: 'futures',
  timeframe: (i % 2 ? '1m' : '15m') as Timeframe,
  colSpan: (i % 2 ? 1 : 2) as 1 | 2,
}));

test('Terminal header timeframe updates all twelve existing HookChart blocks', () => {
  for (const tf of ['1m','5m','15m','1h','4h','1d'] as Timeframe[]) {
    const next = applyTerminalTimeframe(blocks, tf);
    assert.ok(next.every(block=>block.timeframe === tf),'all charts must adopt '+tf);
    next.forEach((block,i)=>{
      assert.equal(block.id,blocks[i].id);
      assert.equal(block.symbol,blocks[i].symbol);
      assert.equal(block.exchange,blocks[i].exchange);
      assert.equal(block.colSpan,blocks[i].colSpan);
    });
  }
});

test('unchanged timeframe retains blocks and avoids unnecessary live-stream restarts', () => {
  const all = applyTerminalTimeframe(blocks,'4h');
  assert.equal(applyTerminalTimeframe(all,'4h'),all);
  const changed = applyTerminalTimeframe(all,'1m');
  const mixed = applyTerminalTimeframe(blocks,'1m');
  assert.strictEqual(mixed[1],blocks[1],'already matching chart keeps its object identity');
  assert.notStrictEqual(mixed[0],blocks[0],'changed chart receives a new block object');
  assert.notEqual(changed,all);
  assert.equal(changed[0].timeframe,'1m');
});

test('header timeframe controls update chart blocks, not only the highlighted pill', () => {
  const terminal=readFileSync(new URL('../src/components/TerminalPage.tsx',import.meta.url),'utf8');
  assert.match(terminal,/updateBlocks\(previous => applyTerminalTimeframe\(previous, tf\)\)/);
  assert.match(terminal,/onClick=\{\(\) => handleApplyGlobalTimeframe\(tf\)\}/);
  assert.match(terminal,/aria-pressed=\{activeTimeframe === tf\}/);
  // Both one-coin and multi-coin layouts now use the same grid widget.
  const widget=readFileSync(new URL('../src/components/terminal/TerminalChartWidget.tsx',import.meta.url),'utf8');
  assert.match(terminal,/<TerminalGridItem/);
  assert.match(widget,/timeframe=\{block\.timeframe\}/);
});

test('workspace conflict no longer covers charts but recovery remains inside settings', () => {
  const terminal=readFileSync(new URL('../src/components/TerminalPage.tsx',import.meta.url),'utf8');
  const drawer=readFileSync(new URL('../src/components/terminal/TerminalSettingsDrawer.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(terminal,/<div role="alert" className="z-30 flex shrink-0/);
  assert.match(terminal,/syncConflict=\{syncConflict\} backupFailed=\{backupFailed\}/);
  assert.match(drawer,/syncConflict && \(/);
  assert.match(drawer,/onClick=\{onDownloadLocalBackup\}/);
  assert.match(drawer,/onClick=\{onRestoreCloudWorkspace\}/);
  assert.match(drawer,/role="alert"/);
});
