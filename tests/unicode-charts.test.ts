import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { terminate } from 'firebase/firestore';
import { db } from '../src/firebase';
import { AuthProvider } from '../src/context/AuthContext';
import { TerminalChartWidget } from '../src/components/terminal/TerminalChartWidget';
import { TerminalPage } from '../src/components/TerminalPage';
import { FullscreenChartModal } from '../src/components/FullscreenChartModal';
import { getTradingViewSymbol, normalizeExchangeSymbol } from '../src/utils/marketSymbols';
import { binanceStreamUrls } from '../src/utils/binanceOrderBook';
import { fetchKlines, fetchOrderBook, fetchRecentTrades } from '../server/marketService';
import { fetchDirectKlines, getFallbackScannedCoins } from '../src/utils/directExchangeClient';
import type { ExchangeId, MarketType, TerminalChartBlock } from '../src/types';
import { ExchangeStreamClient } from '../server/surveillance/exchangeStream';

Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, configurable: true,
});
test.after(() => terminate(db));
const noop = () => {};
const json = (data: unknown) => new Response(JSON.stringify(data), {
  headers: { 'content-type': 'application/json' },
});

test('international symbols keep their full identity, including combining marks and numeric prefixes', () => {
  for (const [input, expected] of [
    [' 龙虾/USDT ', '龙虾USDT'], ['币安人生/usdc', '币安人生USDC'],
    ['我踏马来了-USDT', '我踏马来了USDT'], ['1000BONK/USDT', '1000BONKUSDT'],
    ['é/USDT', 'ÉUSDT'], ['e\u0301/USDT', 'E\u0301USDT'],
  ]) assert.equal(normalizeExchangeSymbol(input), expected);
});

test('server and direct history, depth, and trades request distinct UTF-8 pairs on both exchanges', async (t) => {
  const prices = new Map([['龙虾USDT', 1], ['币安人生USDT', 2], ['我踏马来了USDT', 3]]);
  const requests: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    requests.push(url);
    const price = String(prices.get(url.searchParams.get('symbol')!) ?? -1);
    if (url.pathname.endsWith('/klines')) return json([[1700000000000, price, price, price, price, '2']]);
    if (url.pathname.endsWith('/kline')) return json({ retCode: 0, result: { list: [['1700000000000', price, price, price, price, '2']] } });
    if (url.pathname.endsWith('/depth')) return json({ lastUpdateId: 1, bids: [[price, '2']], asks: [[price, '3']] });
    if (url.pathname.endsWith('/orderbook')) return json({ retCode: 0, result: { ts: 1700000000000, b: [[price, '2']], a: [[price, '3']] } });
    if (url.pathname.endsWith('/aggTrades')) return json([{ a: 1, p: price, q: '2', T: 1700000000000, m: false }]);
    if (url.pathname.endsWith('/recent-trade')) return json({ retCode: 0, result: { list: [{ execId: '1', price, size: '2', time: '1700000000000', side: 'Buy' }] } });
    throw new Error(`Unexpected market request: ${url.pathname}`);
  });
  for (const exchange of ['binance', 'bybit'] as ExchangeId[]) {
    for (const market of ['spot', 'futures'] as MarketType[]) {
      for (const [symbol, price] of prices) {
        const history = await fetchKlines(exchange, market, symbol.replace('USDT', '/USDT'), '5m', 70);
        const direct = await fetchDirectKlines(exchange, market, symbol, '5m', 70);
        const book = await fetchOrderBook(exchange, market, symbol);
        const trades = await fetchRecentTrades(exchange, market, symbol);
        assert.equal(history[0]?.close, price, `${exchange}:${market}:${symbol} server history`);
        assert.equal(direct[0]?.close, price, `${exchange}:${market}:${symbol} direct history`);
        assert.equal(book.symbol, symbol);
        assert.equal(book.bids[0]?.[0], price);
        assert.equal(trades[0]?.price, price);
      }
    }
  }
  assert.equal(requests.length, 48, 'different asset names do not share a truncated USDT cache key');
  for (const request of requests) {
    assert.ok(prices.has(request.searchParams.get('symbol')!));
    assert.match(request.href, /symbol=%/);
    assert.ok(!request.href.includes('symbol=LONGXIA'), 'TradingView aliases are not exchange symbols');
  }
});

test('Binance depth, trades, and ticker streams preserve the complete international asset name', () => {
  for (const market of ['spot', 'futures'] as MarketType[]) {
    const streams = binanceStreamUrls('龙虾/USDT', market)
      .flatMap(url => new URL(url).searchParams.get('streams')!.split('/'));
    assert.deepEqual(streams.map(stream => stream.split('@')[0]), ['龙虾usdt', '龙虾usdt', '龙虾usdt']);
    assert.deepEqual(streams.map(stream => stream.slice(stream.indexOf('@'))), ['@depth@100ms', '@ticker', '@aggTrade']);
  }
});

test('background surveillance subscribes to complete international symbols on both exchanges', () => {
  const stream = Object.create(ExchangeStreamClient.prototype) as any;
  for (const symbol of ['龙虾USDT', '币安人生USDT', 'E\u0301USDT', '1000BONKUSDT']) {
    stream.symbol = symbol;
    assert.equal(stream.cleanSymbol(), symbol);
    stream.exchange = 'binance'; stream.marketType = 'futures';
    const subscriptions = new URL(stream.getWebSocketUrl()).searchParams.get('streams')!.split('/');
    assert.ok(subscriptions.every(s => s.split('@')[0] === symbol.toLowerCase()));
    stream.exchange = 'bybit';
    assert.equal(stream.cleanSymbol(), symbol, 'Bybit subscription payload keeps the full symbol');
  }
});

test('TradingView aliases are scoped to verified exchange markets and regular symbols keep working', () => {
  assert.equal(getTradingViewSymbol('龙虾/USDT', 'binance', 'futures'), 'BINANCE:LONGXIAUSDT.P');
  assert.equal(getTradingViewSymbol('币安人生/USDT', 'binance', 'futures'), 'BINANCE:BIANRENSHENGUSDT.P');
  assert.equal(getTradingViewSymbol('币安人生/USDC', 'binance', 'spot'), 'BINANCE:BIANRENSHENGUSDC');
  assert.equal(getTradingViewSymbol('龙虾USDT', 'bybit', 'futures'), null);
  assert.equal(getTradingViewSymbol('新币USDT', 'binance', 'futures'), null);
  assert.equal(getTradingViewSymbol('BTC/USDT', 'binance', 'spot'), 'BINANCE:BTCUSDT');
  assert.equal(getTradingViewSymbol('1000BONK/USDT', 'bybit', 'futures'), 'BYBIT:1000BONKUSDT.P');
});

test('default terminal and fullscreen charts use HookChart with complete international exchange symbols', (t) => {
  let savedBlocks: TerminalChartBlock[] = [];
  t.mock.method(localStorage, 'getItem', (key: string) =>
    key === 'crypto_screener_terminal_blocks_guest' ? JSON.stringify(savedBlocks) : null);
  for (const symbol of ['龙虾USDT', '币安人生USDT', 'BTCUSDT', '新币USDT']) {
    const coin = { ...getFallbackScannedCoins()[0], symbol: symbol!, baseAsset: symbol!.replace('USDT', '') };
    const block: TerminalChartBlock = { id: 'unicode-chart', symbol: coin.symbol, baseAsset: coin.baseAsset,
      quoteAsset: 'USDT', exchange: 'binance', marketType: 'futures', timeframe: '15m', mode: 'tradingview', colSpan: 1 };
    savedBlocks = [block];
    const views = [
      React.createElement(TerminalPage, { coins: [coin], watchlist: [], onToggleWatchlist: noop }),
      React.createElement(TerminalChartWidget, { block, coin, allCoins: [coin], isSingleBlock: false,
        isMaximized: false, onToggleMaximize: noop, onRemove: noop, onUpdateBlock: noop }),
      React.createElement(TerminalChartWidget, { block: { ...block, mode: 'combined' }, coin, allCoins: [coin],
        isSingleBlock: false, isMaximized: false, onToggleMaximize: noop, onRemove: noop, onUpdateBlock: noop }),
      React.createElement(FullscreenChartModal, { isOpen: true, onClose: noop, coin, currentTimeframe: '15m' }),
    ];
    for (const view of views) {
      const html = renderToString(React.createElement(AuthProvider, { children: view }));
      const iframe = html.match(/src="([^"]*widgetembed[^\"]*)"/);
      assert.equal(iframe, null, 'the default renderer does not embed TradingView');
      assert.ok(html.includes(symbol), 'the complete exchange symbol remains visible');
      assert.ok(html.includes('Завантаження hookchart') || html.includes('data-chart-provider="hookchart"'), 'HookChart is loaded by default');
      assert.ok(!html.includes('Завантаження графіку'), 'iframe loading overlay cannot obscure the exchange chart');
    }
  }
});
