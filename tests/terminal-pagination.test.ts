import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { getTerminalPresetPage, pageAfterLimitChange, resolveTerminalPresetPageSize, TERMINAL_PRESET_PAGE_SIZES } from '../src/utils/terminalPresetPaging';
import { blocksForMarketPreset, normalizeTerminalPresets } from '../src/utils/terminalPresets';
import type { MarketCoin } from '../src/types';

test('terminal page size supports 50 charts and validates saved preferences', () => {
  assert.deepEqual([...TERMINAL_PRESET_PAGE_SIZES], [4, 6, 9, 10, 12, 16, 25, 36, 50]);
  assert.equal(resolveTerminalPresetPageSize(10), 10);
  assert.equal(resolveTerminalPresetPageSize(50), 50);
  assert.equal(resolveTerminalPresetPageSize(36), 36);
  assert.equal(resolveTerminalPresetPageSize(51), 12);
  assert.equal(resolveTerminalPresetPageSize('50'), 12);
});

test('changing the selected chart count changes the actual visible slice', () => {
  const all = Array.from({ length: 123 }, (_, index) => index);
  assert.deepEqual(getTerminalPresetPage(all, 0, 12).coins, all.slice(0, 12));
  assert.deepEqual(getTerminalPresetPage(all, 0, 36).coins, all.slice(0, 36));
  assert.deepEqual(getTerminalPresetPage(all, 0, 50).coins, all.slice(0, 50));
  const second = getTerminalPresetPage(all, 1, 50);
  assert.deepEqual(second.coins, all.slice(50, 100));
  assert.equal(second.pageCount, 3);
  const last = getTerminalPresetPage(all, 100, 50);
  assert.deepEqual(last.coins, all.slice(100));
  assert.equal(last.page, 2);
  assert.equal(last.start, 100);
  assert.equal(last.end, 123);
});

test('changing page size preserves the first visible coin and produces 50 distinct charts', () => {
  assert.equal(pageAfterLimitChange(3, 12, 50), 0);
  assert.equal(pageAfterLimitChange(2, 36, 50), 1);
  assert.equal(pageAfterLimitChange(1, 50, 12), 4);

  const coins: MarketCoin[] = Array.from({ length: 65 }, (_, index) => ({
    symbol: `C${index}USDT`, baseAsset: `C${index}`, quoteAsset: 'USDT', exchange: 'binance', marketType: 'futures',
    price: 1, change24h: 1, volumeUsd: 1_000_000, high24h: 1, low24h: 1, distanceToHighPct: 0,
    distanceToLowPct: 0, volatility24hPct: 1, isNearHigh: true, isNearLow: true, isActiveCoin: true, exchangeUrl: '',
  }));
  const first = blocksForMarketPreset([], getTerminalPresetPage(coins, 0, 12).coins, '15m');
  const resized = blocksForMarketPreset(first, getTerminalPresetPage(coins, 0, 50).coins, '15m');
  assert.equal(resized.length, 50);
  assert.equal(new Set(resized.map(block => block.id)).size, 50);
  assert.equal(resized[0], first[0]);

  const saved = normalizeTerminalPresets([{
    id: 'fifty', name: '50 монет', blocks: resized, columns: 4, blockHeight: 'medium', createdAt: 1,
  }]);
  assert.equal(saved[0].blocks.length, 50);
  assert.equal(saved[0].blocks.at(-1)?.symbol, 'C49USDT');
});

test('30 saved manual charts show exactly 10 per page without losing block identities or settings', () => {
  const blocks = Array.from({ length: 30 }, (_, index) => ({
    id: `chart-${index}`, symbol: `C${index}USDT`, baseAsset: `C${index}`,
    quoteAsset: 'USDT', exchange: index % 2 ? 'bybit' : 'binance',
    marketType: index % 3 ? 'futures' : 'spot', timeframe: index % 2 ? '1m' : '15m',
    colSpan: 1,
  }));
  const slices = [0, 1, 2].map(page => getTerminalPresetPage(blocks, page, 10));
  assert.deepEqual(slices.map(page => page.coins.length), [10, 10, 10]);
  assert.deepEqual(slices.map(page => page.pageCount), [3, 3, 3]);
  assert.deepEqual(slices.flatMap(page => page.coins), blocks);
  assert.deepEqual(getTerminalPresetPage(blocks, 0, 30).coins, blocks);
  assert.equal(pageAfterLimitChange(2, 10, 12), 1, 'keep the first formerly visible coin nearby');
  const component = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(component, /const workspacePageSize = resolveTerminalPresetPageSize\(config\.coinPresetLimit\)/);
  assert.match(component, /Math\.ceil\(blocks\.length \/ workspacePageSize\)/);
  assert.match(component, /visibleWorkspacePage \* workspacePageSize/);
  assert.match(component, /blocks\.slice\(\s*visibleWorkspaceStart, visibleWorkspaceStart \+ workspacePageSize/);
  assert.match(component, /setWorkspacePage\(current => pageAfterLimitChange\(current, workspacePageSize, nextLimit\)\)/);
  assert.match(component, /terminalAnalysisAllowed\(terminalAnalysisLimit, visibleWorkspaceBlocks\.length\)/);
  assert.match(component, /setMaximizedBlockId\(null\)/);
  assert.doesNotMatch(component, /const workspacePageCount = Math\.max\(1, Math\.ceil\(blocks\.length \/ MAX_TERMINAL_CHARTS\)\)/);
});

test('changing Terminal timeframe keeps the selected automatic market preset and current page', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  const start = page.indexOf('const handleApplyGlobalTimeframe =');
  const end = page.indexOf('const handleApplyPreset =', start);
  assert.ok(start >= 0 && end > start);
  const handler = page.slice(start, end);
  assert.match(handler, /updateBlocks\(previous => applyTerminalTimeframe\(previous, tf\)\)/);
  assert.doesNotMatch(handler, /setBlocks\(/);
  assert.match(page, /const setBlocks: typeof updateBlocks = useCallback/);
});
