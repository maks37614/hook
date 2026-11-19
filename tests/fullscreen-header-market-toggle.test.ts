import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  fullscreenMarketCollision, fullscreenMarketKey, fullscreenChartSlots,
  toggleFullscreenExchange, toggleFullscreenMarketType, updateFullscreenChart,
  nextFullscreenChartSlotId,
} from '../src/utils/fullscreenMultiChart';
import type { TerminalChartBlock } from '../src/types';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const primary = { symbol: 'BTCUSDT', exchange: 'binance' as const, marketType: 'futures' as const };
const alt: TerminalChartBlock = {
  id: 'second', symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT',
  exchange: 'binance', marketType: 'futures', timeframe: '5m',
};

test('tapping the header coin cycles 1–4 open markets in their actual visible order', () => {
  const secondary = { ...alt };
  const third: TerminalChartBlock = { ...alt, id: 'third', symbol: 'SOLUSDT', baseAsset: 'SOL' };
  const fourth: TerminalChartBlock = { ...alt, id: 'fourth', symbol: 'XRPUSDT', baseAsset: 'XRP' };
  assert.equal(nextFullscreenChartSlotId([], 'primary'), 'primary');
  const single = fullscreenChartSlots(primary, [], ['primary']);
  assert.equal(nextFullscreenChartSlotId(single, 'primary'), 'primary');
  const double = fullscreenChartSlots(primary, [secondary], ['primary', secondary.id]);
  assert.equal(nextFullscreenChartSlotId(double, 'primary'), secondary.id);
  assert.equal(nextFullscreenChartSlotId(double, secondary.id), 'primary');
  const four = fullscreenChartSlots(primary, [secondary, third, fourth],
    ['third', 'primary', 'fourth', 'second']);
  let selected = four[0].id;
  for (const expected of ['primary', 'fourth', 'second', 'third']) {
    selected = nextFullscreenChartSlotId(four, selected);
    assert.equal(selected, expected);
  }
  // A removed chart must not leave the header selection stuck on a stale ID.
  assert.equal(nextFullscreenChartSlotId(four, 'removed'), 'third');
});

test('tapping the title changes header focus only, without scrolling or reconnecting chart streams', () => {
  const page = read('src/components/FullscreenChartModal.tsx');
  const multi = read('src/components/fullscreen/FullscreenMultiChart.tsx');
  const handlerStart = page.indexOf('const cycleHeaderChart = () => {');
  const handlerEnd = page.indexOf('const chooseHeaderChart =', handlerStart);
  assert.ok(handlerStart > 0 && handlerEnd > handlerStart);
  const handler = page.slice(handlerStart, handlerEnd);
  assert.match(handler, /chartSlots\.length < 2/);
  assert.match(handler, /setActiveChartSlotId\(currentId => nextFullscreenChartSlotId\(chartSlots, currentId\)\)/);
  assert.doesNotMatch(handler, /scrollIntoView|fetch\(|WebSocket|setActiveCoin\(|onPageCoinChange\(/);
  assert.match(page, /data-fullscreen-next-chart/);
  assert.match(page, /onClick=\{cycleHeaderChart\}/);
  assert.match(page, /const headerMarket = selectedHeaderSlot \?\? activeCoin/);
  assert.match(page, /headerSlotId !== 'primary'[\s\S]*?setMarketChangeRequest\(/);
  assert.match(page, /toggleFullscreenExchange\(headerMarket\.exchange\)/);
  assert.match(page, /toggleFullscreenMarketType\(headerMarket\.marketType\)/);
  assert.match(multi, /onSlotsChange\?\.\(fullscreenChartSlots\(primaryMarketRef\.current, blocks, chartOrder\)\)/);
  for (const text of [
    'Показати наступний відкритий графік', 'Show next open chart',
    'Pokaż następny otwarty wykres', 'Показать следующий открытый график',
  ]) assert.ok(page.includes(text), text);
});

test('one tap toggles only the desired market dimension, reversibly', () => {
  assert.equal(toggleFullscreenExchange('binance'), 'bybit');
  assert.equal(toggleFullscreenExchange('bybit'), 'binance');
  assert.equal(toggleFullscreenMarketType('futures'), 'spot');
  assert.equal(toggleFullscreenMarketType('spot'), 'futures');
  assert.deepEqual({ ...primary, exchange: toggleFullscreenExchange(primary.exchange) }, {
    ...primary, exchange: 'bybit',
  });
  assert.deepEqual({ ...primary, marketType: toggleFullscreenMarketType(primary.marketType) }, {
    ...primary, marketType: 'spot',
  });
  assert.notEqual(fullscreenMarketKey(primary), fullscreenMarketKey({ ...primary, exchange: 'bybit' }));
  assert.notEqual(fullscreenMarketKey(primary), fullscreenMarketKey({ ...primary, marketType: 'spot' }));
});

test('a secondary market switch retains chart slot, symbol and timeframe', () => {
  const blocks = [alt];
  const next = updateFullscreenChart(blocks, primary, alt.id, { exchange: 'bybit', marketType: 'spot', formationId: undefined });
  assert.equal(next.length, 1);
  assert.equal(next[0].id, alt.id);
  assert.equal(next[0].symbol, alt.symbol);
  assert.equal(next[0].timeframe, alt.timeframe);
  assert.equal(next[0].exchange, 'bybit');
  assert.equal(next[0].marketType, 'spot');
  assert.equal(blocks[0].exchange, 'binance');
});

test('switching to an already-open exact market focuses its chart instead of duplicating feeds', () => {
  const secondary = { ...alt, symbol: 'BTCUSDT', baseAsset: 'BTC', exchange: 'bybit' as const, marketType: 'spot' as const };
  const slots = fullscreenChartSlots(primary, [secondary], ['primary', secondary.id]);
  assert.equal(fullscreenMarketCollision(slots, 'primary', { ...primary, exchange: 'bybit', marketType: 'spot' })?.id, secondary.id);
  assert.equal(fullscreenMarketCollision(slots, secondary.id, primary)?.id, 'primary');
  assert.equal(fullscreenMarketCollision(slots, secondary.id, { ...secondary, exchange: 'binance' }), undefined);
});

test('fullscreen header shows live indicator before coin and has visible, clickable exchange and market', () => {
  const page = read('src/components/FullscreenChartModal.tsx');
  const header = page.slice(page.indexOf('{/* Top Fullscreen Header & Controls */}'), page.indexOf('{/* Right: Quick actions & Exit Button */}'));
  assert.ok(header.indexOf("headerSlotId === 'primary' && liveStatus.isConnected")
    < header.indexOf('{headerBase}/{headerQuote}'), 'live indicator must precede the ticker');
  assert.match(header, /data-fullscreen-exchange-toggle/);
  assert.match(header, /data-fullscreen-market-toggle/);
  assert.match(header, /toggleFullscreenExchange\(headerMarket\.exchange\)/);
  assert.match(header, /toggleFullscreenMarketType\(headerMarket\.marketType\)/);
  assert.match(header, /headerMarket\.marketType === 'futures' \? 'Futures' : 'Spot'/);
  assert.doesNotMatch(header.slice(header.indexOf('data-fullscreen-market-toggle')), /hidden xs:inline-block/);
});

test('market switching routes through the exact selected chart identity and scopes history', () => {
  const page = read('src/components/FullscreenChartModal.tsx');
  const multi = read('src/components/fullscreen/FullscreenMultiChart.tsx');
  assert.match(page, /const headerMarket = selectedHeaderSlot \?\? activeCoin/);
  assert.match(page, /fullscreenMarketCollision\(chartSlots, headerSlotId, target\)/);
  assert.match(page, /if \(headerSlotId !== 'primary'\) \{\s*setMarketChangeRequest\(/);
  assert.match(page, /onPageCoinChange\(nextScannedCoin\)/);
  assert.match(page, /const chartHistoryScope = fullscreenChartHistoryScope\(activeCoin\.exchange, activeCoin\.marketType, activeCoin\.symbol, timeframe\)/);
  assert.match(page, /scopedFullscreenChartKlines\(history, chartHistoryScope\)/);
  assert.match(page, /marketChangeRequest=\{pageMode && !earlyCandidate \? marketChangeRequest : null\}/);
  assert.match(multi, /handledMarketRequestId\.current === marketChangeRequest\.id/);
  assert.match(multi, /setBlocks\(previous => updateFullscreenChart\(previous, primaryMarketRef\.current, targetId,/);
  assert.match(multi, /\{ exchange, marketType, formationId: undefined \}/);
  assert.match(page, /currentPrice: exact\?\.currentPrice \?\? 0/);
  assert.match(page, /setTrackedPrice\(null\)/);
  assert.match(page, /setTrackedStatus\(null\)/);
});

test('after adding charts a mobile-friendly dropdown shows current block, ordered symbols, and selects existing slot', () => {
  const page = read('src/components/FullscreenChartModal.tsx');
  const multi = read('src/components/fullscreen/FullscreenMultiChart.tsx');
  assert.match(page, /pageMode && !earlyCandidate && chartSlots\.length > 1/);
  assert.match(page, /data-fullscreen-chart-selector/);
  assert.match(page, /data-fullscreen-chart-menu/);
  assert.match(page, /role="menuitem"/);
  assert.match(page, /createPortal\(/);
  assert.match(page, /chartSlots\.slice\(0, MAX_FULLSCREEN_CHARTS\)\.map\(/);
  assert.match(page, /onClick=\{\(\) => chooseHeaderChart\(slot\.id\)\}/);
  assert.match(page, /node\.dataset\.fullscreenChartId === id/);
  assert.match(page, /aria-current=\{headerSlotId === slot\.id \? 'true' : undefined\}/);
  assert.match(multi, /onSlotsChange\?\.\(fullscreenChartSlots\(primaryMarketRef\.current, blocks, chartOrder\)\)/);
  assert.match(multi, /onActiveSlotChange\?\.\(id\)/);
});

test('header actions and all four languages remain scoped to the selected market', () => {
  const page = read('src/components/FullscreenChartModal.tsx');
  assert.match(page, /symbol: headerMarket\.symbol,/);
  assert.match(page, /exchange: headerMarket\.exchange,/);
  assert.match(page, /marketType: headerMarket\.marketType,/);
  assert.match(page, /onSendMetaScalp\(headerActionCoin\)/);
  for (const label of ['Відкриті графіки', 'Open charts', 'Otwarte wykresy', 'Открытые графики']) {
    assert.ok(page.includes(label), 'missing translation: ' + label);
  }
});
