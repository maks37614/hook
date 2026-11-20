import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/terminal/AddChartModal.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/terminal/addChartModal.css', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

test('Terminal coin picker renders in body portal, closes on Escape, and locks background scrolling', () => {
  assert.match(source, /import \{ createPortal \} from 'react-dom'/);
  assert.match(source, /return createPortal\(/);
  assert.match(source, /document\.body/);
  assert.match(source, /fixed inset-0 z-\[260\]/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby="terminal-add-chart-title"/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /document\.body\.style\.overflow = originalBody/);
});

test('Terminal coin picker has bounded viewport layout and scrollable filters/coins', () => {
  assert.match(entry, /import '\.\/components\/terminal\/addChartModal\.css'/);
  assert.doesNotMatch(source, /import ['"].*\.css['"]/);
  assert.match(source, /terminal-add-chart-modal flex w-full min-w-0/);
  assert.match(source, /terminal-add-chart-body flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden/);
  assert.match(source, /terminal-add-chart-filters min-h-0 min-w-0 shrink-0/);
  assert.match(source, /terminal-add-chart-list min-h-0 min-w-0 flex-1/);
  assert.match(css, /height: min\(92dvh, 900px\)/);
  assert.match(css, /max-height: calc\(100dvh - 16px\)/);
  assert.match(css, /@media \(max-width: 580px\)/);
  assert.match(css, /@media \(max-height: 540px\)/);
  assert.match(css, /overflow-y: auto/);
});

test('Terminal coin rows wrap, core filters and add actions remain wired', () => {
  assert.doesNotMatch(source, /autoFocus/);
  assert.match(source, /terminal-add-chart-coin-row group flex min-w-0/);
  assert.match(source, /terminal-add-chart-coin-action flex min-w-0 shrink-0/);
  assert.doesNotMatch(source, /setSelectedTimeframe\(tf\)/, 'timeframe selector removed from Add Chart modal');
  assert.doesNotMatch(source, /Таймфрейм:/, 'no timeframe row in the picker');
  assert.match(source, /initialTimeframe \|\| '15m'/, 'the chart keeps its assigned timeframe internally');
  assert.match(source, /setSelectedMarket\('futures'\)/);
  assert.match(source, /setSelectedExchange\('binance'\)/);
  assert.match(source, /onAddChart\(coin, selectedTimeframe, firstFormation\?\.id\)/);
  assert.match(source, /setDisplayCount\(\(prev\) => prev \+ 80\)/);
});

test('Add Chart reuses the Terminal quote snapshot instead of making duplicate market requests', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /terminalMarketCoins=\{marketCoins\}/);
  assert.match(source, /terminalMarketCoins\?: MarketCoin\[\]/);
  assert.match(source, /if \(terminalMarketCoins !== undefined\) \{/);
  assert.match(source, /const availableMarketCoins = terminalMarketCoins \?\? marketCoins/);
  assert.match(source, /availableMarketCoins\.filter\(mc => mc\.volumeUsd >= 50_000 && mc\.volumeUsd <= 10_000_000_000\)/);
  assert.match(source, /\}, \[isOpen, terminalMarketCoins\]\)/);
});

test('Add Chart cancels its fallback quote requests when modal closes or Terminal data arrives', () => {
  assert.match(source, /const controller = new AbortController\(\)/);
  assert.match(source, /fetch\('\/api\/screener\/coins\?minVolume=50000&maxVolume=10000000000', \{/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /fetchDirectBinanceTickers\(\{ signal: controller\.signal \}\)/);
  assert.match(source, /fetchDirectBybitTickers\(\{ signal: controller\.signal \}\)/);
  assert.match(source, /controller\.abort\(\)/);
});

test('Terminal quick add preserves a selected market quote instead of inventing a USDT pair', () => {
  assert.match(source, /const knownPair = unifiedCoins\.find\(c => c\.symbol === cleanSearchSymbol\)/);
  assert.match(source, /const inferredQuote = knownPair\?\.quoteAsset/);
  assert.match(source, /exactMarket\?\.quoteAsset \|\| inferredQuote/);
  assert.match(source, /normalizeTerminalMarketPair\(\s*cleanSearchSymbol/);
  assert.match(source, /\{quickAddInstrument\.symbol\}/);
  assert.doesNotMatch(source, /\{cleanSearchSymbol\}USDT/);
});

test('closed Terminal Add Chart modal skips full-market recomputation', () => {
  assert.match(source, /const formationsMap = useMemo\(\(\) => \{[\s\S]*?if \(!isOpen\) return map;/);
  assert.match(source, /const unifiedCoins = useMemo\(\(\) => \{\s*if \(!isOpen\) return \[\];/);
  assert.match(source, /const filteredCoins = useMemo\(\(\) => \{\s*if \(!isOpen\) return \[\];/);
});

test('Terminal Add Chart visibly enforces the workspace chart limit without silent deletion', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /atChartLimit=\{replaceBlockId === null && blocks\.length >= MAX_TERMINAL_CHARTS\}/);
  assert.match(page, /prev\.length >= MAX_TERMINAL_CHARTS \? prev : \[\.\.\.prev, newBlock\]/);
  assert.match(source, /Досягнуто ліміт 50 графіків/);
  assert.match(source, /disabled=\{atChartLimit\}/);
  assert.match(source, /if \(mode === 'preset' \|\| atChartLimit\) return;/);
  assert.match(source, /const rowAtLimit = atChartLimit && !inPreset/);
  assert.match(source, /if \(rowAtLimit\) return;/);
});
