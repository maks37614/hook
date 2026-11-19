import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { TerminalChartBlock } from '../src/types';
import {
  MAX_FULLSCREEN_CHARTS, appendFullscreenChart, fullscreenMarketKey, updateFullscreenChart,
  reorderFullscreenCharts, shiftFullscreenChart, replaceFullscreenChart, fullscreenChartSlots,
  fullscreenFavoriteDestination, fullscreenFavoriteMenuPosition,
} from '../src/utils/fullscreenMultiChart';

const primary = { symbol: 'SOLUSDT', exchange: 'binance' as const, marketType: 'futures' as const };
const btc = { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', exchange: 'binance' as const, marketType: 'futures' as const };
const eth = { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', exchange: 'bybit' as const, marketType: 'futures' as const };
const xrp = { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT', exchange: 'binance' as const, marketType: 'spot' as const };

test('fullscreen keeps its original chart and can add at most three distinct Terminal charts', () => {
  assert.equal(MAX_FULLSCREEN_CHARTS, 4);
  const empty: TerminalChartBlock[] = [];
  const one = appendFullscreenChart(empty, primary, btc, '1h', undefined, () => 'first');
  assert.equal(one.length, 1);
  assert.equal(one[0].timeframe, '1h');
  assert.equal(one[0].id, 'first');
  assert.equal(empty.length, 0);
  const two = appendFullscreenChart(one, primary, eth, '5m', undefined, () => 'second');
  assert.equal(two.length + 1, 3);
  assert.equal(two[1].timeframe, '5m');
  const three = appendFullscreenChart(two, primary, xrp, '1d', undefined, () => 'third');
  assert.equal(three.length + 1, 4);
  assert.equal(three[2].marketType, 'spot');
  const ada = { ...btc, symbol: 'ADAUSDT', baseAsset: 'ADA' };
  assert.strictEqual(appendFullscreenChart(three, primary, ada, '1h'), three);
  assert.equal(two.length, 2, 'previous charts must not be mutated');
});

test('same instrument cannot mount twice even when add requests race', () => {
  const one = appendFullscreenChart([], primary, btc, '15m', undefined, () => 'btc');
  assert.strictEqual(appendFullscreenChart(one, primary, { ...btc, symbol: 'SOLUSDT' }, '15m'), one);
  assert.strictEqual(appendFullscreenChart(one, primary, btc, '1m'), one);
  assert.notEqual(fullscreenMarketKey(btc), fullscreenMarketKey({ ...btc, exchange: 'bybit' }));
  assert.notEqual(fullscreenMarketKey(btc), fullscreenMarketKey({ ...btc, marketType: 'spot' }));
});

test('existing Terminal widget cannot change into another open instrument', () => {
  const one = appendFullscreenChart([], primary, btc, '1h', undefined, () => 'btc');
  const two = appendFullscreenChart(one, primary, eth, '15m', undefined, () => 'eth');
  assert.strictEqual(updateFullscreenChart(two, primary, 'btc', { symbol: 'SOLUSDT' }), two);
  assert.strictEqual(updateFullscreenChart(two, primary, 'btc', { symbol: 'ETHUSDT', exchange: 'bybit' }), two);
  assert.strictEqual(updateFullscreenChart(two, primary, 'missing', { timeframe: '5m' }), two);
  assert.strictEqual(updateFullscreenChart(two, primary, 'btc', { timeframe: '1h' }), two);
  const changed = updateFullscreenChart(two, primary, 'btc', { timeframe: '4h' });
  assert.equal(changed[0].timeframe, '4h');
  assert.equal(changed[0].id, 'btc');
  assert.equal(changed[1], two[1]);
});

test('picker and chart widgets are lazy-loaded only when additional charts are requested', () => {
  const source = readFileSync(new URL('../src/components/fullscreen/FullscreenMultiChart.tsx', import.meta.url), 'utf8');
  const modal = readFileSync(new URL('../src/components/terminal/AddChartModal.tsx', import.meta.url), 'utf8');
  const widget = readFileSync(new URL('../src/components/terminal/TerminalChartWidget.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/components/fullscreen/fullscreenMultiChart.css', import.meta.url), 'utf8');
  assert.match(source, /React\.lazy\(\(\) => import\('\.\.\/terminal\/AddChartModal'\)/);
  assert.match(source, /React\.lazy\(\(\) => import\('\.\.\/terminal\/TerminalChartWidget'\)/);
  assert.match(source, /onTouchStart=\{onDockTouchStart\} onTouchEnd=\{onDockTouchEnd\}/);
  assert.match(source, /count >= MAX_FULLSCREEN_CHARTS/);
  assert.doesNotMatch(source, /\b(fetch|setInterval)\s*\(/);
  assert.match(modal, /context\?: 'terminal' \| 'fullscreen'/);
  assert.match(widget, /compactFullscreenMode\?: boolean/);
  assert.match(css, /grid-template-rows:repeat\(var\(--fullscreen-chart-count\),minmax\(300px,1fr\)\)/);
});

test('all four mounted charts can be reordered without replacing the primary or changing chart IDs', () => {
  const order = ['primary', 'btc', 'eth', 'xrp'];
  const shifted = shiftFullscreenChart(order, 'primary', 1);
  assert.deepEqual(shifted, ['btc', 'primary', 'eth', 'xrp']);
  assert.deepEqual(reorderFullscreenCharts(order, 'xrp', 'primary'), ['xrp', 'primary', 'btc', 'eth']);
  assert.deepEqual(reorderFullscreenCharts(order, 'primary', 'xrp'), ['btc', 'eth', 'primary', 'xrp']);
  assert.strictEqual(reorderFullscreenCharts(order, 'btc', 'btc'), order);
  assert.strictEqual(shiftFullscreenChart(order, 'xrp', 1), order);
  assert.strictEqual(shiftFullscreenChart(order, 'primary', -1), order);
  assert.strictEqual(reorderFullscreenCharts(order, 'nonexistent', 'eth'), order);
  assert.deepEqual(order, ['primary', 'btc', 'eth', 'xrp']);
});

test('the standalone fullscreen header uses exact favorite market identity, not a matching symbol on another exchange', async () => {
  const { resolveWatchlistEntries, watchlistEntryToChartCoin } = await import('../src/utils/watchlistUtils');
  const entries = resolveWatchlistEntries(['binance:futures:BTCUSDT', 'bybit:spot:BTCUSDT'], []);
  const coins = entries.map(entry => watchlistEntryToChartCoin(entry, '5m'));
  assert.equal(coins.length, 2);
  assert.notEqual(fullscreenMarketKey(coins[0]), fullscreenMarketKey(coins[1]));
  assert.deepEqual(coins.map(coin => coin.exchange), ['binance', 'bybit']);
  assert.deepEqual(coins.map(coin => coin.marketType), ['futures', 'spot']);
  const fullscreen = readFileSync(new URL('../src/components/FullscreenChartModal.tsx', import.meta.url), 'utf8');
  assert.match(fullscreen, /favoriteToAdd=\{pageMode && !earlyCandidate \? favoriteToAdd : null\}/);
  assert.match(fullscreen, /fullscreenFavoriteDestination\(chartSlots, requestedId, favCoin\)/);
  assert.match(fullscreen, /applyFavoriteToSlot\(favCoin, activeChartSlotId\)/);
  assert.match(fullscreen, /resolveWatchlistEntries\(localWatchlist, \[\.\.\.marketFavoriteQuotes, \.\.\.allCoins\]\)/);
  assert.match(fullscreen, /setIsFavoritesDrawerOpen\(false\)/);
});

test('fullscreen dock is compact, footer-colored and icon-only even at the chart limit', () => {
  const source = readFileSync(new URL('../src/components/fullscreen/FullscreenMultiChart.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/components/fullscreen/fullscreenMultiChart.css', import.meta.url), 'utf8');
  assert.match(css, /fullscreen-multi-dock\{[^}]+width:94px/);
  assert.match(css, /fullscreen-multi-dock\{[^}]+background:rgba\(2,6,23,\.9\)/);
  assert.match(css, /fullscreen-multi-dock\.is-open\{width:102px\}/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /data-count="4"/);
  assert.match(source, /<Plus size=\{19\} aria-hidden="true"\/>/);
  assert.doesNotMatch(source, /className="fullscreen-multi-count"/);
  assert.match(source, /reorderFullscreenCharts\(active, source, target\)/);
  assert.match(source, /onPointerUp=\{event =>/);
  assert.match(source, /onDrop=\{event =>/);
});

test('fullscreen multi-chart reuses the HookChart toolbar for dragging, without a duplicate title row', () => {
  const source = readFileSync(new URL('../src/components/fullscreen/FullscreenMultiChart.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/components/fullscreen/fullscreenMultiChart.css', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /className="fullscreen-multi-reorder"/);
  assert.doesNotMatch(css, /\.fullscreen-multi-reorder\{/);
  assert.match(source, /className="fullscreen-multi-drag-anchor"/);
  assert.match(source, /className="fullscreen-multi-move"/);
  assert.match(source, /!block && <span data-no-translate className="fullscreen-multi-drag-symbol"/);
  assert.match(source, /onKeyDown=\{event =>/);
  assert.match(source, /count > 1 \? ' is-reorderable' : ''/);
  assert.match(css, /\.fullscreen-multi-cell\.is-reorderable \.hookchart-root>\.hookchart-toolbar/);
  assert.match(css, /@media\(pointer:coarse\)/);
});

test('a favorite replaces the selected chart without changing its ID, timeframe, or layout', () => {
  const one = appendFullscreenChart([], primary, btc, '1h', undefined, () => 'btc');
  const two = appendFullscreenChart(one, primary, eth, '5m', undefined, () => 'eth');
  const replacement = { ...xrp, symbol: 'ADAUSDT', baseAsset: 'ADA', marketType: 'futures' as const };
  const next = replaceFullscreenChart(two, primary, 'btc', replacement);
  assert.equal(next.length, 2);
  assert.equal(next[0].id, 'btc');
  assert.equal(next[0].symbol, 'ADAUSDT');
  assert.equal(next[0].timeframe, '1h');
  assert.equal(next[0].colSpan, 1);
  assert.strictEqual(next[1], two[1], 'untouched chart must keep its object');
  assert.strictEqual(replaceFullscreenChart(next, primary, 'btc', eth), next,
    'a favorite already open on another chart cannot be duplicated');
  assert.strictEqual(replaceFullscreenChart(next, primary, 'btc', { ...btc, symbol: primary.symbol }), next,
    'the primary chart cannot be duplicated');
  assert.strictEqual(replaceFullscreenChart(next, primary, 'missing', btc), next);
});

test('favorite picker uses the live visual slot order after drag reordering', () => {
  const one = appendFullscreenChart([], primary, btc, '1h', undefined, () => 'btc');
  const two = appendFullscreenChart(one, primary, eth, '5m', undefined, () => 'eth');
  const slots = fullscreenChartSlots(primary, two, ['btc', 'primary', 'eth']);
  assert.deepEqual(slots.map(slot => slot.id), ['btc', 'primary', 'eth']);
  assert.deepEqual(slots.map(slot => slot.symbol), ['BTCUSDT', 'SOLUSDT', 'ETHUSDT']);
  assert.equal(fullscreenChartSlots(primary, two, [])[0].id, 'primary');
});

test('favorite click opens a compact dark menu only when there are 2–4 chart blocks', () => {
  const page = readFileSync(new URL('../src/components/FullscreenChartModal.tsx', import.meta.url), 'utf8');
  assert.match(page, /if \(chartSlots\.length > 1 && event\)/);
  assert.match(page, /favoriteSlotMenu && favoriteSlotCoin && typeof document !== 'undefined' && createPortal\(/);
  assert.match(page, /data-fullscreen-favorite-slot-menu/);
  assert.match(page, /chartSlots\.slice\(0, MAX_FULLSCREEN_CHARTS\)\.map\(\(slot, index\)/);
  assert.match(page, /applyFavoriteToSlot\(favoriteSlotCoin, slot\.id\)/);
  assert.match(page, /if \(chartSlots\.length > 0\) applyFavoriteToSlot\(favCoin, activeChartSlotId\)/);
  assert.match(page, /document\.addEventListener\('pointerdown', onPointerDown, true\)/);
  assert.match(page, /document\.addEventListener\('scroll', dismiss, true\)/);
  assert.match(page, /if \(favoriteSlotMenu\) \{/);
  assert.match(page, /onDragEnd=\{clearFavoriteDrag\}/);
  for (const lang of ['uk', 'en', 'pl', 'ru']) {
    const line = page.split('\n').find(line => line.startsWith('  ' + lang + ': { choose:'));
    assert.ok(line?.includes('pickBlock:') && line?.includes('block:'), lang + ': missing translations');
  }
});

test('favorite destination menu stays inside the viewport on small screens', () => {
  assert.deepEqual(fullscreenFavoriteMenuPosition(
    {left: 30, top: 80, bottom: 111}, {width: 700, height: 600}, 4),
    {left: 38, top: 115, width: 176});
  assert.deepEqual(fullscreenFavoriteMenuPosition(
    {left: 30, top: 500, bottom: 531}, {width: 700, height: 600}, 4),
    {left: 38, top: 340, width: 176});
  assert.deepEqual(fullscreenFavoriteMenuPosition(
    {left: 150, top: 180, bottom: 210}, {width: 230, height: 380}, 2),
    {left: 46, top: 214, width: 176});
  assert.equal(fullscreenFavoriteMenuPosition(
    {left: 50, top: 90, bottom: 110}, {width: 170, height: 260}, 9).width, 154);
});

test('fullscreen favorites show a real 24h quote or an unavailable mark, never a synthetic zero', () => {
  const page = readFileSync(new URL('../src/components/FullscreenChartModal.tsx', import.meta.url), 'utf8');
  const multi = readFileSync(new URL('../src/components/fullscreen/FullscreenMultiChart.tsx', import.meta.url), 'utf8');
  assert.match(page, /fetch\('\/api\/market\/favorite-quotes'/);
  assert.match(page, /\.filter\(isWatchlistMarketQuote\)/);
  assert.match(page, /source\?\.status === 'live'/);
  assert.match(page, /favCoin\.currentPrice > 0 \? chart24hPercent\(favCoin, null\) : null/);
  assert.match(page, /percent === null \? '—'/);
  assert.doesNotMatch(page, /favCoin\.priceChange24h\.toFixed\(2\)/);
  assert.match(page, /activeSlotId=\{pageMode && !earlyCandidate \? activeChartSlotId : undefined\}/);
  assert.match(page, /onActiveSlotChange=\{pageMode && !earlyCandidate \? setActiveChartSlotId : undefined\}/);
  assert.match(page, /onSlotsChange=\{setChartSlots\}/);
  assert.doesNotMatch(page, /showSlotMenu|selectFavoriteDestination/);
  assert.match(page, /copyTextToClipboard\(normalizeExchangeSymbol\(favCoin\.symbol\)\.toUpperCase\(\)\)/);
  assert.match(page, /onSendMetaScalp\(favCoin\)/);
  assert.match(page, /event\.stopPropagation\(\); void copyFavoriteSymbol\(favCoin\)/);
  assert.match(multi, /replaceFullscreenChart\(previous, primaryMarketRef\.current, targetId, coin\)/);
  assert.match(multi, /fullscreenChartSlots\(primaryMarketRef\.current, blocks, chartOrder\)/);
});

test('favorites target the active fullscreen chart without adding new charts or duplicating a market', () => {
  const one = appendFullscreenChart([], primary, btc, '1h', undefined, () => 'btc');
  const two = appendFullscreenChart(one, primary, eth, '5m', undefined, () => 'eth');
  const slots = fullscreenChartSlots(primary, two, ['btc', 'primary', 'eth']);
  const ada = { ...xrp, symbol: 'ADAUSDT', baseAsset: 'ADA' };

  assert.deepEqual(fullscreenFavoriteDestination(slots, 'btc', ada),
    { targetId: 'btc', alreadyOpen: false });
  assert.deepEqual(fullscreenFavoriteDestination(slots, 'primary', ada),
    { targetId: 'primary', alreadyOpen: false });
  assert.deepEqual(fullscreenFavoriteDestination(slots, 'eth', ada),
    { targetId: 'eth', alreadyOpen: false });
  assert.deepEqual(fullscreenFavoriteDestination(slots, 'removed-chart', ada),
    { targetId: 'primary', alreadyOpen: false });

  // Clicking an already-open favorite selects its real slot, even after reordering.
  assert.deepEqual(fullscreenFavoriteDestination(slots, 'primary', eth),
    { targetId: 'eth', alreadyOpen: true });
  assert.deepEqual(fullscreenFavoriteDestination(slots, 'eth', primary),
    { targetId: 'primary', alreadyOpen: true });
  assert.deepEqual(fullscreenFavoriteDestination(slots, 'btc', btc),
    { targetId: 'btc', alreadyOpen: true });
  assert.deepEqual(fullscreenFavoriteDestination(slots, 'btc', { ...btc, exchange: 'bybit' }),
    { targetId: 'btc', alreadyOpen: false }, 'exchange identity must not be mixed');

  const onlyPrimary = fullscreenChartSlots(primary, [], ['primary']);
  assert.deepEqual(fullscreenFavoriteDestination(onlyPrimary, 'primary', ada),
    { targetId: 'primary', alreadyOpen: false }, 'with one chart, click replaces rather than adds');
});

test('fullscreen chart focus uses pointer/keyboard activation and a size-neutral selection outline', () => {
  const page = readFileSync(new URL('../src/components/FullscreenChartModal.tsx', import.meta.url), 'utf8');
  const grid = readFileSync(new URL('../src/components/fullscreen/FullscreenMultiChart.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/components/fullscreen/fullscreenMultiChart.css', import.meta.url), 'utf8');
  assert.match(grid, /onPointerDownCapture=\{\(\) => \{ if \(activeSlotId !== id\) onActiveSlotChange\?\.\(id\); \}\}/);
  assert.match(grid, /onFocusCapture=\{\(\) => \{ if \(activeSlotId !== id\) onActiveSlotChange\?\.\(id\); \}\}/);
  assert.match(grid, /onActiveSlotChange && activeSlotId === id \? ' is-active-slot' : ''/);
  assert.match(grid, /if \(activeSlotId === id\) onActiveSlotChange\?\.\('primary'\)/);
  assert.match(css, /\.fullscreen-multi-cell\.is-active-slot \.fullscreen-multi-cell-content::after/);
  assert.match(css, /pointer-events:none/);
  assert.match(page, /const selectedChart = chartSlots\.find\(slot => slot\.id === activeChartSlotId\) \?\? activeCoin/);
  assert.match(page, /if \(targetId === 'primary'\) onPageCoinChange\?\.\(favCoin\)/);
  assert.match(page, /else setFavoriteToAdd\(\{ id: \+\+favoriteRequestId\.current, coin: favCoin, targetId \}\)/);
});

test('standalone full chart uses icons without labels but retains actionable tooltips', () => {
  const page = readFileSync(new URL('../src/components/FullscreenChartModal.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /<span[^>]*>\{tr\("Сповіщення"\)\}<\/span>/);
  assert.doesNotMatch(page, /<span[^>]*>\{tr\("Лінковка"\)\}<\/span>/);
  assert.match(page, /className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/);
  assert.match(page, /className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/);
  assert.match(page, /aria-label=\{tr\("Створити сповіщення в Telegram"\)\}/);
  assert.match(page, /aria-label=\{tp\('Надіслати в обраний термінал/);
  assert.match(page, /<Send className="w-3\.5 h-3\.5 text-sky-400" \/>/);
  assert.match(page, /<Zap className="w-3\.5 h-3\.5 text-amber-400 fill-amber-400\/20" \/>/);
});

test('fullscreen favorite names can be dragged onto any mounted chart without changing chart order', () => {
  const page = readFileSync(new URL('../src/components/FullscreenChartModal.tsx', import.meta.url), 'utf8');
  const grid = readFileSync(new URL('../src/components/fullscreen/FullscreenMultiChart.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/components/fullscreen/fullscreenMultiChart.css', import.meta.url), 'utf8');
  assert.match(page, /draggable=\{favoriteCanDrag\}/);
  assert.match(page, /chartSlots\.length > 0/);
  assert.match(page, /setDraggedFavoriteKey\(favoriteKey\)/);
  assert.match(page, /setData\('application\/x-h00k-fullscreen-favorite', favoriteKey\)/);
  assert.match(page, /Math\.hypot\(event\.clientX - gesture\.startX, event\.clientY - gesture\.startY\) >= 12/);
  assert.match(page, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/);
  assert.match(page, /document\.elementFromPoint\(x, y\)\?\.closest\('\[data-fullscreen-chart-id\]'\)/);
  assert.match(page, /if \(targetId\) acceptFavoriteDrop\(targetId\)/);
  assert.match(page, /if \(alreadyOpen\) return/);
  assert.match(page, /if \(targetId === 'primary'\) onPageCoinChange\?\.\(favCoin\)/);
  assert.match(page, /else setFavoriteToAdd\(\{ id: \+\+favoriteRequestId\.current, coin: favCoin, targetId \}\)/);
  assert.match(page, /favoriteDragging=\{!!draggedFavoriteKey\}/);
  assert.match(page, /onFavoriteDrop=\{acceptFavoriteDrop\}/);
  assert.match(grid, /favoriteDragging && favoriteDropTargetId === id \? ' is-favorite-drop-target'/);
  assert.match(grid, /else if \(favoriteDragging && onFavoriteDrop\)/);
  assert.match(grid, /onFavoriteDrop\(id\)/);
  assert.match(grid, /if \(source\) \{\s*event\.preventDefault\(\);\s*draggingId\.current = null;\s*move\(source, id\);/);
  assert.match(css, /\.fullscreen-multi-cell\.is-favorite-drop-target \.fullscreen-multi-cell-content::before/);
  assert.match(css, /pointer-events:none/);
  assert.doesNotMatch(page, /reorderFullscreenCharts/);
  assert.doesNotMatch(grid, /onFavoriteDrop\(source\)/);
});

test('target-specific favorite replacement preserves all four chart IDs and independent timeframes', () => {
  const existing = [btc, eth, xrp].reduce<TerminalChartBlock[]>((blocks, selected, i) =>
    appendFullscreenChart(blocks, primary, selected, (['1h','5m','1d'] as const)[i], undefined, () => ['btc','eth','xrp'][i]), []);
  const next = replaceFullscreenChart(existing, primary, 'eth',
    { ...eth, symbol:'ADAUSDT', baseAsset:'ADA', quoteAsset:'USDT' });
  assert.equal(next.length, 3);
  assert.deepEqual(next.map(chart => chart.id), ['btc','eth','xrp']);
  assert.deepEqual(next.map(chart => chart.timeframe), ['1h','5m','1d']);
  assert.strictEqual(next[0], existing[0]);
  assert.strictEqual(next[2], existing[2]);
  assert.equal(next[1].symbol, 'ADAUSDT');
  assert.strictEqual(replaceFullscreenChart(existing, primary, 'eth', btc), existing);
  assert.strictEqual(replaceFullscreenChart(existing, primary, 'eth',
    { ...eth, symbol: 'SOLUSDT', exchange: 'binance', marketType: 'futures' }), existing);
});

test('fullscreen drawer stays over chart move handles and mouse drag has a reliable drop fallback', () => {
  const page = readFileSync(new URL('../src/components/FullscreenChartModal.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/components/fullscreen/fullscreenMultiChart.css', import.meta.url), 'utf8');
  assert.match(css, /\.fullscreen-multi-chart\{position:relative;z-index:0;isolation:isolate;/);
  assert.match(page, /document\.addEventListener\('pointermove', handlePointerMove, true\)/);
  assert.match(page, /document\.addEventListener\('pointerup', handlePointerUp, true\)/);
  assert.match(page, /document\.addEventListener\('dragover', onFavoriteNativeDragOver, true\)/);
  assert.match(page, /document\.addEventListener\('drop', onFavoriteNativeDrop, true\)/);
  assert.match(page, /event\.dataTransfer\.setData\('text\/plain', 'h00k-favorite:' \+ favoriteKey\)/);
  assert.match(page, /touchFavoriteGestureRef\.current = null;\s*favoriteDraggingRef\.current = favCoin;/);
  assert.match(page, /if \(targetId\) acceptFavoriteDrop\(targetId\)/);
});
