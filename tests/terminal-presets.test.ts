import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { MarketCoin, ScannedCoin, TerminalChartBlock } from '../src/types';
import { MARKET_PRESETS, matchesMarketPreset, selectFormationPresetCoins, selectMarketPresetCoins } from '../src/utils/marketPresets';
import { blocksForMarketPreset, blocksForSavedFavorites, normalizeTerminalBlocks, normalizeTerminalMarketPair, formatTerminalQuotedPrice, normalizeTerminalPresets, terminalStorageKey, TERMINAL_PRESETS_STORAGE_KEY } from '../src/utils/terminalPresets';
import { loadTerminalWorkspace, parseTerminalWorkspaceBackup } from '../src/utils/useTerminalWorkspace';

const coin = (symbol: string, change24h: number, values: Partial<MarketCoin> = {}): MarketCoin => ({
  symbol, baseAsset: symbol.replace('USDT', ''), quoteAsset: 'USDT', exchange: 'binance', marketType: 'futures',
  price: 100, change24h, volumeUsd: 5_000_000, high24h: 101, low24h: 99,
  distanceToHighPct: 1, distanceToLowPct: 1, volatility24hPct: 8, volatility5mPct: 1,
  isNearHigh: true, isNearLow: true, isActiveCoin: true, exchangeUrl: '', ...values,
});
const all = { exchange: 'all', marketType: 'all' } as const;
const key = (item: MarketCoin) => `${item.symbol}:${item.exchange}:${item.marketType}`;

test('Formations preset uses the exact visible list, preserving order, timeframe and formation markers', () => {
  assert.ok(MARKET_PRESETS.some(preset => preset.id === 'formations' && preset.label === 'Формації'));
  const scanned = (symbol: string, extra: Partial<ScannedCoin> = {}): ScannedCoin => ({
    symbol, baseAsset: symbol.replace('USDT', ''), quoteAsset: 'USDT',
    exchange: 'binance', marketType: 'futures',
    currentPrice: 10, priceChange24h: 0, highPrice24h: 11, lowPrice24h: 9,
    volume24hUsd: 100000, formations: [], timeframe: '5m', lastUpdated: 1,
    exchangeUrl: '', ...extra,
  });
  const visible = [
    scanned('SOLUSDT', { exchange: 'bybit', marketType: 'spot',
      formations: [{ id: 'visible-formation' }] as ScannedCoin['formations'], timeframe: '15m' }),
    scanned('BTCUSDT', { timeframe: '1h', formations: [{ id: 'btc-pattern' }] as ScannedCoin['formations'] }),
    scanned('SOLUSDT', { exchange: 'bybit', marketType: 'spot',
      formations: [{ id: 'duplicate' }] as ScannedCoin['formations'] }),
    scanned('BTCUSDT', { marketType: 'spot', timeframe: '4h',
      formations: [{ id: 'btc-spot-pattern' }] as ScannedCoin['formations'] }),
    scanned('BROKENUSDT', { currentPrice: 0 }),
  ];
  const selected = selectFormationPresetCoins(visible);
  assert.deepEqual(selected.map(c => c.symbol + ':' + c.exchange + ':' + c.marketType),
    ['SOLUSDT:bybit:spot', 'BTCUSDT:binance:futures', 'BTCUSDT:binance:spot']);
  assert.deepEqual(selected.map(c => c.timeframe), ['15m', '1h', '4h']);
  assert.deepEqual(selected.map(c => c.formationId), ['visible-formation', 'btc-pattern', 'btc-spot-pattern']);
  assert.deepEqual(selectFormationPresetCoins([]), []);

  const opened = blocksForMarketPreset([], selected, '1m');
  assert.deepEqual(opened.map(c => c.timeframe), ['15m', '1h', '4h']);
  assert.deepEqual(opened.map(c => c.formationId), ['visible-formation', 'btc-pattern', 'btc-spot-pattern']);
  const userBlock = { ...opened[0], colSpan: 2 as const, heightPx: 420 };
  const after = blocksForMarketPreset([userBlock], [{ ...selected[0], formationId: 'updated-formation' }], '1m');
  assert.equal(after[0].id, userBlock.id);
  assert.equal(after[0].heightPx, 420);
  assert.equal(after[0].formationId, 'updated-formation');
  assert.equal(blocksForMarketPreset(after, [{ ...selected[0], formationId: 'updated-formation' }], '30s'), after);
});

test('Terminal Formations preset is wired to existing filtered results without extra scanning', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const terminal = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/components/terminal/TerminalPresetPanel.tsx', import.meta.url), 'utf8');
  assert.match(app, /earlyMode\s*\? earlyItems\.map\(item => item\.coin\)/);
  assert.match(app, /groupedItems\.map\(group => \(\{ \.\.\.group\.coin, formations: group\.formations \}\)\)/);
  assert.match(app, /formationPresetCoins=\{terminalFormationPresetCoins\}/);
  assert.match(terminal, /formationCoins=\{formationPresetCoins\}/);
  assert.match(panel, /selectFormationPresetCoins\(formationCoins\)/);
  assert.match(panel, /id === 'formations'\s*\? selectFormationPresetCoins/);
  assert.match(panel, /preset\.id !== 'formations' && loading/);
  assert.match(panel, /onActivePresetChange\(id\);\s*onApplyCoins\(readyCoins\[id\]\)/);
  const locale = readFileSync(new URL('../src/locales/terminalPage20261115.ts', import.meta.url), 'utf8');
  assert.ok(locale.includes('No coins match the current Formations filters.'));
  assert.ok(locale.includes('Monety z bieżącej listy formacji'));
});

test('terminal gainers and losers use the screener categories and correct 24h ranking', () => {
  const data = [coin('FLATUSDT', 0), coin('AUSDT', 8), coin('BUSDT', -2), coin('CUSDT', 20), coin('DUSDT', -15)];
  assert.deepEqual(selectMarketPresetCoins(data, 'top_gainers', all, 4).map(item => item.symbol), ['CUSDT', 'AUSDT']);
  assert.deepEqual(selectMarketPresetCoins(data, 'top_losers', all, 4).map(item => item.symbol), ['DUSDT', 'BUSDT']);
  for (const preset of ['active', 'top_gainers', 'top_losers', 'near_highs', 'near_lows'] as const) {
    assert.equal(selectMarketPresetCoins(data, preset, all, 36).length, data.filter(item => matchesMarketPreset(item, preset)).length);
  }
});

test('active coins sort by 5m volatility; high and low categories sort by proximity', () => {
  const data = [coin('AUSDT', 1, { volatility5mPct: 0.8, distanceToHighPct: 1.5, distanceToLowPct: 0.1 }),
    coin('BUSDT', 1, { volatility5mPct: 3, distanceToHighPct: 0.1, distanceToLowPct: 1.5 }),
    coin('CUSDT', 1, { isActiveCoin: false, isNearHigh: false, isNearLow: false, volatility5mPct: 5 })];
  assert.deepEqual(selectMarketPresetCoins(data, 'active', all, 2).map(item => item.symbol), ['BUSDT', 'AUSDT']);
  assert.deepEqual(selectMarketPresetCoins(data, 'near_highs', all, 2).map(item => item.symbol), ['BUSDT', 'AUSDT']);
  assert.deepEqual(selectMarketPresetCoins(data, 'near_lows', all, 2).map(item => item.symbol), ['AUSDT', 'BUSDT']);
});

test('presets distinguish spot and futures on both exchanges and discard duplicate quotes', () => {
  const data = [coin('BTCUSDT', 2), coin('BTCUSDT', 2), coin('BTCUSDT', 4, { marketType: 'spot' }),
    coin('BTCUSDT', 8, { exchange: 'bybit' }), coin('BTCUSDT', 6, { exchange: 'bybit', marketType: 'spot' })];
  assert.equal(selectMarketPresetCoins(data, 'active', all, 9).length, 4);
  assert.deepEqual(selectMarketPresetCoins(data, 'top_gainers', { exchange: 'bybit', marketType: 'spot' }, 4).map(key), ['BTCUSDT:bybit:spot']);
});

test('limits and invalid prices cannot generate extra or fake charts; inputs remain untouched', () => {
  const data = Array.from({ length: 50 }, (_, index) => coin(`C${index}USDT`, index + 1));
  data.push(coin('BROKENUSDT', 100, { price: NaN }), coin('ZEROPRICEUSDT', 100, { price: 0 }));
  const original = [...data];
  assert.equal(selectMarketPresetCoins(data, 'top_gainers', all, 4).length, 4);
  assert.equal(selectMarketPresetCoins(data, 'top_gainers', all, 100).length, 36);
  // Terminal pages must be able to browse the same complete category as the screener.
  const allMatches = selectMarketPresetCoins(data, 'top_gainers', all, Number.POSITIVE_INFINITY);
  assert.equal(allMatches.length, 50);
  assert.equal(allMatches[0].symbol, 'C49USDT');
  assert.equal(allMatches.slice(0, 12).length + allMatches.slice(12, 24).length + allMatches.slice(24).length, 50);
  assert.equal(new Set(allMatches.map(key)).size, 50);
  assert.equal(selectMarketPresetCoins(data, 'top_gainers', all, -1).length, 0);
  assert.equal(selectMarketPresetCoins(data, 'top_gainers', all, NaN).length, 0);
  assert.deepEqual(selectMarketPresetCoins([], 'near_highs', all, 4), []);
  assert.deepEqual(data, original);
});

test('automatic refresh preserves widget IDs, timeframes and layout settings for unchanged coins', () => {
  const quotes = [coin('BTCUSDT', 4), coin('ETHUSDT', 3)];
  const blocks = blocksForMarketPreset([], quotes, '15m');
  blocks[0] = { ...blocks[0], timeframe: '1h', colSpan: 2 };
  assert.equal(blocksForMarketPreset(blocks, quotes, '5m'), blocks);
  const next = blocksForMarketPreset(blocks, [quotes[1], quotes[0], coin('SOLUSDT', 2)], '5m');
  assert.equal(next[1], blocks[0]);
  assert.equal(next[1].colSpan, 2);
  assert.equal(next[2].timeframe, '5m');
  assert.equal(new Set(next.map(block => block.id)).size, 3);
});

test('custom presets migrate legacy orderbook blocks to charts and preserve chart settings', () => {
  const blocks: TerminalChartBlock[] = blocksForMarketPreset([], [coin('BTCUSDT', 2, { exchange: 'bybit', marketType: 'spot' })], '4h');
  const legacyBlocks = blocks.map(block => ({ ...block, mode: 'combined', colSpan: 2,
    domSettings: { depth: 'deep', compression: 20 } }));
  const preset = { id: 'my-preset', name: 'Мої монети', blocks: legacyBlocks, columns: 3, blockHeight: 'large', createdAt: 123 };
  const normalized = normalizeTerminalPresets(JSON.parse(JSON.stringify([preset])));
  assert.equal(normalized[0].blocks[0].exchange, 'bybit');
  assert.equal(normalized[0].blocks[0].marketType, 'spot');
  assert.equal(normalized[0].blocks[0].timeframe, '4h');
  assert.equal(normalized[0].blocks[0].colSpan, 2);
  assert.equal('mode' in normalized[0].blocks[0], false);
  assert.equal('domSettings' in normalized[0].blocks[0], false);
  assert.deepEqual(normalizeTerminalPresets([{ ...preset, blocks: [] }]), []);
  assert.deepEqual(normalizeTerminalPresets([{ ...preset, blocks: [{ symbol: 'FAKEUSDT' }] }]), []);
  assert.equal(normalizeTerminalPresets([preset, preset]).length, 1);
  assert.deepEqual(normalizeTerminalPresets([]), []);
});

test('custom preset caches are isolated between users and guests', () => {
  const keys = [terminalStorageKey(TERMINAL_PRESETS_STORAGE_KEY, 'user-a'),
    terminalStorageKey(TERMINAL_PRESETS_STORAGE_KEY, 'user-b'), terminalStorageKey(TERMINAL_PRESETS_STORAGE_KEY)];
  assert.equal(new Set(keys).size, 3);
  const storage = new Map<string, string>();
  storage.set(keys[0], JSON.stringify([{ id: 'private-a', name: 'Мій пресет' }]));
  assert.equal(storage.get(keys[1]), undefined);
  assert.equal(storage.get(keys[2]), undefined);
});

test('loaded Terminal workspaces repair duplicate chart IDs without discarding their markets or preferences', () => {
  const previous: TerminalChartBlock[] = [
    { id: 'reused', symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', exchange: 'binance', marketType: 'futures', timeframe: '4h', colSpan: 2 },
    { id: 'reused', symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', exchange: 'bybit', marketType: 'spot', timeframe: '15m', colSpan: 1 },
    { id: 'another', symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', exchange: 'binance', marketType: 'spot', timeframe: '1m', colSpan: 1 },
  ];
  const next = normalizeTerminalBlocks(previous);
  assert.equal(next.length, 3);
  assert.equal(new Set(next.map(block => block.id)).size, 3);
  assert.equal(next[0].id, 'reused');
  assert.notEqual(next[1].id, 'reused');
  assert.equal(next[1].exchange, 'bybit');
  assert.equal(next[1].marketType, 'spot');
  assert.equal(next[0].timeframe, '4h');
  assert.equal(next[0].colSpan, 2);
  assert.equal(next[2].id, 'another');
  assert.equal(previous[1].id, 'reused', 'must not mutate persisted data');
  assert.deepEqual(normalizeTerminalBlocks(next), next, 'migrated keys remain stable on reload');
});

test('Terminal keeps each exchange instrument quote currency instead of appending USDT', () => {
  assert.deepEqual(normalizeTerminalMarketPair('BTCUSDT', 'USDT'), { symbol: 'BTCUSDT', quoteAsset: 'USDT' });
  assert.deepEqual(normalizeTerminalMarketPair('BTCUSDC', 'USDC'), { symbol: 'BTCUSDC', quoteAsset: 'USDC' });
  assert.deepEqual(normalizeTerminalMarketPair('ETH/BTC', 'BTC'), { symbol: 'ETHBTC', quoteAsset: 'BTC' });
  assert.deepEqual(normalizeTerminalMarketPair('ETH', 'USDT'), { symbol: 'ETHUSDT', quoteAsset: 'USDT' });
  assert.deepEqual(normalizeTerminalMarketPair('SOLFDUSD', 'FDUSD'), { symbol: 'SOLFDUSD', quoteAsset: 'FDUSD' });
  assert.deepEqual(normalizeTerminalMarketPair('ETHBTC'), { symbol: 'ETHBTC', quoteAsset: 'BTC' });
  assert.deepEqual(normalizeTerminalMarketPair('SOLBTC', 'USDT'), { symbol: 'SOLBTC', quoteAsset: 'BTC' });
  assert.deepEqual(normalizeTerminalMarketPair('BTCUSDC', 'USDT'), { symbol: 'BTCUSDC', quoteAsset: 'USDC' });
  assert.deepEqual(normalizeTerminalMarketPair('WBTC'), { symbol: 'WBTCUSDT', quoteAsset: 'USDT' });
  assert.deepEqual(normalizeTerminalMarketPair('WBTCUSDT'), { symbol: 'WBTCUSDT', quoteAsset: 'USDT' });
});

test('Terminal preserves quote denominations without labeling stablecoins as USD', () => {
  assert.equal(formatTerminalQuotedPrice(0.025, 'BTC'), '0.02500 BTC');
  assert.equal(formatTerminalQuotedPrice(3.5, 'ETH'), '3.50 ETH');
  assert.equal(formatTerminalQuotedPrice(10, 'USDT'), '10.00');
  assert.equal(formatTerminalQuotedPrice(10, 'USDC'), '10.00');
  assert.equal(formatTerminalQuotedPrice(10, 'USD'), '$10.00');
});

test('saved custom coin presets survive profile hydration with exact markets and chart order', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  } });
  const selected: TerminalChartBlock[] = [
    { id: 'btc-binance', symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', exchange: 'binance', marketType: 'futures', timeframe: '1m', colSpan: 1 },
    { id: 'btc-bybit', symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', exchange: 'bybit', marketType: 'spot', timeframe: '15m', colSpan: 2 },
    { id: 'eth-usdc', symbol: 'ETHUSDC', baseAsset: 'ETH', quoteAsset: 'USDC', exchange: 'binance', marketType: 'spot', timeframe: '4h', colSpan: 1 },
    { id: 'sol-bybit', symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', exchange: 'bybit', marketType: 'futures', timeframe: '30s', colSpan: 1 },
  ];
  const preset = { id: 'my-coins', name: 'My four coins', blocks: selected, columns: 3 as const,
    blockHeight: 'large' as const, createdAt: 123 };
  const profile = { columns: 3, blockHeight: 'large' as const,
    blocks: [selected[0]], config: { layoutPreset: 'custom' as const, columns: 3 as const,
      blockHeight: 'large' as const, autoFitScreen: true, showFormations: true },
    customPresets: [preset], version: 'server-version' };
  try {
    const workspace = loadTerminalWorkspace('preset-owner', profile);
    assert.equal(workspace.presets.length, 1);
    assert.deepEqual(workspace.presets[0].blocks, selected);
    assert.deepEqual(normalizeTerminalBlocks(workspace.presets[0].blocks), selected);
    assert.equal(workspace.presets[0].columns, 3);
    assert.equal(workspace.presets[0].blockHeight, 'large');
    // A guest with the same browser must not inherit the account's saved coins.
    assert.equal(loadTerminalWorkspace().presets.length, 0);
    // Guest-owned saved presets must still survive a local reload.
    entries.set(terminalStorageKey(TERMINAL_PRESETS_STORAGE_KEY), JSON.stringify([preset]));
    assert.deepEqual(loadTerminalWorkspace().presets[0].blocks, selected);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('loading a custom preset closes its menu and visibly restores the first coin', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/components/terminal/TerminalPresetPanel.tsx', import.meta.url), 'utf8');
  const start = page.indexOf('const handleLoadCoinPreset =');
  const end = page.indexOf('const handleResetWorkspace =', start);
  assert.ok(start !== -1 && end > start);
  const handler = page.slice(start, end);
  assert.match(handler, /normalizeTerminalBlocks\(preset\.blocks\)/);
  assert.match(handler, /setBlocks\(restored\)/);
  assert.match(handler, /setWorkspacePage\(0\)/);
  assert.match(handler, /chartListRef\.current\?\.scrollTo\(\{ top: 0 \}\)/);
  assert.match(page, /setActiveMarketPreset\(null\);[\s\S]*?updateBlocks\(update\)/);
  assert.match(page, /visibleWorkspaceBlocks\.map\(\(block, index\) =>/);
  assert.match(panel, /onLoadPreset\(preset\);[\s\S]*?onPresetChosen\?\.\(\)/);
});

test('explicit custom preset Save, Apply and Delete promptly sync the account workspace', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  const saveStart = page.indexOf('const handleSaveCoinPreset =');
  const loadStart = page.indexOf('const handleLoadCoinPreset =', saveStart);
  const resetStart = page.indexOf('const handleResetWorkspace =', loadStart);
  assert.ok(saveStart >= 0 && loadStart > saveStart && resetStart > loadStart);
  assert.match(page.slice(saveStart, loadStart), /requestImmediateWorkspaceSync\(\);\s*setCustomPresets/);
  assert.match(page.slice(loadStart, resetStart), /requestImmediateWorkspaceSync\(\);\s*setBlocks\(restored\)/);
  assert.match(page, /onDeletePreset=\{id => \{\s*requestImmediateWorkspaceSync\(\);\s*setCustomPresets/);
});

test('Terminal preset draft creation never deactivates automatic market refresh', () => {
  const panel = readFileSync(new URL('../src/components/terminal/TerminalPresetPanel.tsx', import.meta.url), 'utf8');
  const start = panel.indexOf('const openForm = useCallback(');
  const end = panel.indexOf('const savePreset =', start);
  assert.ok(start >= 0 && end > start);
  const handler = panel.slice(start, end);
  assert.doesNotMatch(handler, /onActivePresetChange\(null\)/);
  assert.match(handler, /setShowForm\(true\)/);
});

test('Terminal favorite preset construction indexes quotes and workspace blocks once', () => {
  const panel = readFileSync(new URL('../src/components/terminal/TerminalPresetPanel.tsx', import.meta.url), 'utf8');
  const helper = readFileSync(new URL('../src/utils/terminalPresets.ts', import.meta.url), 'utf8');
  assert.match(panel, /const favoritesQuotesBySymbol = useMemo\(\(\) => \{/);
  assert.match(panel, /const workspaceBlocksByMarket = useMemo\(\(\) =>/);
  assert.match(panel, /blocksForSavedFavorites\(/);
  assert.match(helper, /quotesBySymbol\.get\(favoriteSymbol\)/);
  assert.match(helper, /blocksByMarket\.get\(key\)/);
  assert.doesNotMatch(panel, /snapshot\.coins\.filter\(coin => coin\.symbol === symbol/);
});

test('three scoped favorites create three chart blocks without requiring three live quotes', () => {
  // Only Binance Futures is currently in the market snapshot. The Bybit Spot
  // and Binance Spot favorites must NOT disappear from the save dialog.
  const quotes = new Map<string, MarketCoin[]>([
    ['BTCUSDT', [coin('BTCUSDT', 2, { exchange: 'binance', marketType: 'futures' })]],
  ]);
  const existing = new Map<string, TerminalChartBlock>();
  const favorites = ['binance:futures:BTCUSDT', 'bybit:spot:BTCUSDT', 'binance:spot:ETHUSDC'];
  const blocks = blocksForSavedFavorites(favorites, quotes, existing, '5m');
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks.map(x => [x.symbol, x.exchange, x.marketType, x.timeframe]), [
    ['BTCUSDT', 'binance', 'futures', '5m'],
    ['BTCUSDT', 'bybit', 'spot', '5m'],
    ['ETHUSDC', 'binance', 'spot', '5m'],
  ]);
  assert.deepEqual(blocks.map(block => block.quoteAsset), ['USDT', 'USDT', 'USDC']);
  assert.equal(new Set(blocks.map(block => block.id)).size, 3);
  const roundtrip = normalizeTerminalPresets([{
    id: 'three', name: 'Три монети', blocks, columns: 3,
    blockHeight: 'medium', createdAt: 1,
  }]);
  assert.deepEqual(roundtrip[0].blocks, blocks);
  assert.equal(roundtrip[0].blocks.length, 3);
  // A missing quote must not let a BTCUSDT market overwrite a different
  // exchange's BTCUSDT chart. Legacy bare favorites stay Binance Futures.
  assert.deepEqual(blocksForSavedFavorites(['BTCUSDT', 'binance:futures:BTCUSDT'], quotes, existing, '15m')
    .map(x => x.id), ['favorite-binance:futures:BTCUSDT']);
});


test('Terminal favorites drawer preserves scoped symbols used for user presets', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /resolveWatchlistEntries\(localWatchlist, coins\)/);
  assert.match(page, /entry\.coin \?\? watchlistEntryToChartCoin\(entry, timeframe\)/);
  assert.match(page, /handleRemoveFromWatchlist\(getCoinWatchlistKey\(favCoin\), e\)/);
  assert.match(page, /getCoinWatchlistKey\(s\) !== sym/);
  assert.doesNotMatch(page, /bySymbol\.get\(symbol\) \|\| \[\]/);
});

test('hidden Terminal market-presets menu only ranks the active category while preserving auto-refresh', () => {
  const panel = readFileSync(new URL('../src/components/terminal/TerminalPresetPanel.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /menuOpen=\{showCoinPresets\}/);
  assert.match(panel, /const ids = menuOpen \? MARKET_PRESETS\.map\(preset => preset\.id\)/);
  assert.match(panel, /: activePreset && autoUpdate \? \[activePreset\] : \[\]/);
  assert.match(panel, /activePreset && autoUpdate && readyCoins\[activePreset\]\.length/);
  assert.match(panel, /activePreset === 'formations' \|\| \(!error && !snapshot\.warning\)/);
  assert.match(panel, /selectMarketPresetCoins\(snapshot\.coins, id, selection, Number\.POSITIVE_INFINITY\)/);
});

test('Terminal reload always trusts the cloud, even when an obsolete browser conflict backup exists', () => {
  const uid = 'terminal-conflict-recovery-test';
  const entries = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  } });
  const cloud: any = {
    columns: 2, blockHeight: 'medium', config: { layoutPreset: 'custom', columns: 2, autoFitScreen: true, blockHeight: 'medium' },
    blocks: [{ id: 'cloud', symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures', timeframe: '15m', colSpan: 1 }],
    customPresets: [], version: 'server-revision',
  };
  try {
    const conflictKey = terminalStorageKey('crypto_screener_terminal_conflict_backup', uid);
    entries.set(conflictKey, JSON.stringify({
      config: { ...cloud.config, columns: 3 },
      blocks: [{ id: 'local', symbol: 'ETHUSDT', exchange: 'bybit', marketType: 'spot', timeframe: '5m', colSpan: 1 }],
      presets: [],
    }));
    const restored = loadTerminalWorkspace(uid, cloud);
    assert.equal(restored.blocks.length, 1);
    assert.equal(restored.blocks[0].symbol, 'BTCUSDT');
    assert.equal(restored.config.columns, 2);
    entries.set(conflictKey, JSON.stringify({ blocks: 'invalid' }));
    assert.equal(loadTerminalWorkspace(uid, cloud).blocks[0].symbol, 'BTCUSDT');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('Terminal JSON backup roundtrip restores charts, layout and presets without silent loss', () => {
  const input = {
    exportedAt: new Date().toISOString(),
    blocks: [
      { id: 'btc', symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', exchange: 'binance', marketType: 'futures', timeframe: '5m', colSpan: 2 },
      { id: 'eth', symbol: 'ETHUSDC', baseAsset: 'ETH', quoteAsset: 'USDC', exchange: 'bybit', marketType: 'spot', timeframe: '1h', colSpan: 1 },
    ],
    config: { layoutPreset: 'custom', columns: 3, autoFitScreen: false, blockHeight: 'large', showFormations: true,
      initialChartView: { visibleBars: 90, verticalZoom: 1.2, autoPriceScale: true, rightGapBars: 12 } },
    presets: [{ id: 'mine', name: 'Мій пресет', blocks: [
      { id: 'btc', symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', exchange: 'binance', marketType: 'futures', timeframe: '5m', colSpan: 2 },
    ], columns: 2, blockHeight: 'medium', createdAt: 1 }],
  };
  const restored = parseTerminalWorkspaceBackup(JSON.stringify(input));
  assert.deepEqual(restored.blocks, input.blocks);
  assert.equal(restored.config.columns, 3);
  assert.equal(restored.config.blockHeight, 'large');
  assert.equal(restored.config.autoFitScreen, false);
  assert.equal(restored.presets.length, 1);
  assert.equal(restored.presets[0].name, 'Мій пресет');
  assert.deepEqual(parseTerminalWorkspaceBackup(JSON.stringify(restored)), restored);
});

test('Terminal JSON import rejects corrupt and oversized backups without changing the workspace', () => {
  for (const input of [
    '{broken', '{}', JSON.stringify({ blocks: [], presets: [], config: null }),
    JSON.stringify({ blocks: [{ id: 'bad', symbol: 'BTCUSDT' }], presets: [], config: {} }),
    JSON.stringify({ blocks: [{ id: '', symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
      exchange: 'binance', marketType: 'futures', timeframe: '15m' }], presets: [], config: {} }),
    JSON.stringify({ blocks: [{ id: 'untrusted', symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
      exchange: 'binance', marketType: 'futures', timeframe: '15m', heightPx: -120 }], presets: [], config: {} }),
    JSON.stringify({ blocks: [{ id: 'badSymbol', symbol: 'BTC/USDT', baseAsset: 'BTC', quoteAsset: 'USDT',
      exchange: 'binance', marketType: 'futures', timeframe: '15m' }], presets: [], config: {} }),
    JSON.stringify({ blocks: [], presets: [{ id: 'invalid', name: 'Empty', blocks: [] }], config: {} }),
    JSON.stringify({ blocks: Array(251).fill({ id: 'btc', symbol: 'BTCUSDT' }), presets: [], config: {} }),
    JSON.stringify({ blocks: [], config: {}, presets: [{
      id: 'too-many', name: '51 графік', columns: 2, blockHeight: 'medium', createdAt: 1,
      blocks: Array.from({ length: 51 }, (_, i) => ({
        id: 'chart-' + i, symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
        exchange: 'binance', marketType: 'futures', timeframe: '15m',
      })),
    }] }),
    ' '.repeat(2_000_001),
  ]) assert.throws(() => parseTerminalWorkspaceBackup(input));
});

test('Terminal chart refresh menu controls live market preset auto-updates without new exchange polling', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  const picker = readFileSync(new URL('../src/components/terminal/TerminalChartRefreshPicker.tsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/components/terminal/TerminalPresetPanel.tsx', import.meta.url), 'utf8');

  assert.match(picker, /data-terminal-preset-auto-update=\{presetAutoUpdate \? 'on' : 'off'\}/);
  assert.match(picker, /checked=\{presetAutoUpdate\} onChange=\{event => onPresetAutoUpdateChange\(event\.target\.checked\)\}/);
  assert.match(picker, /preset \? `\$\{copy\.presetSelected\}/);
  for (const text of ['Автооновлення з пресету', 'Auto-update from preset', 'Autoaktualizacja z presetu', 'Автообновление из пресета']) {
    assert.ok(picker.includes(text), `missing preset auto-update localization: ${text}`);
  }
  // Auto-refresh is now stored in each account's versioned Terminal profile,
  // not a single browser-wide key shared between different users.
  assert.match(page, /const presetAutoUpdate = config\.presetAutoUpdate !== false/);
  assert.match(page, /setConfig\(current => current\.presetAutoUpdate === value/);
  assert.doesNotMatch(page, /localStorage\.getItem\(TERMINAL_PRESET_AUTO_UPDATE_STORAGE_KEY\)/);
  assert.match(page, /autoUpdate=\{presetAutoUpdate\}/);
  assert.match(page, /activePreset=\{activeMarketPreset\} presetAutoUpdate=\{presetAutoUpdate\}/);
  assert.match(page, /marketRefreshDemandRef\.current = showCoinPresets \|\| \(presetAutoUpdate && activeMarketPreset !== null\)/);
  assert.match(panel, /: activePreset && autoUpdate \? \[activePreset\] : \[\]/);
  assert.match(panel, /!snapshot\.warning/);
  assert.match(page, /blocksForMarketPreset\(current, pageCoins, timeframe\)/);
  assert.match(page, /setActiveMarketPreset\(null\);/);
  assert.doesNotMatch(picker, /setInterval|fetch\(/);
});

test('new preset toggle does not change candle update frequency or WebSocket handling', () => {
  const picker = readFileSync(new URL('../src/components/terminal/TerminalChartRefreshPicker.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(picker, /TERMINAL_CHART_REFRESH_OPTIONS\.map/);
  assert.match(page, /terminalRefreshMs=\{terminalRefreshMs\}/);
  assert.match(page, /ordinaryTimer = setInterval\(\(\) => \{ void load\(\); \}, 30_000\)/);
  assert.doesNotMatch(picker, /onPresetAutoUpdateChange\(true\);\s*onChange/);
});
