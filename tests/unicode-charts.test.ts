import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AuthContext, AuthProvider, type H00kUser } from '../src/context/AuthContext';
import { ArchiveProvider } from '../src/context/ArchiveContext';
import { TerminalChartWidget } from '../src/components/terminal/TerminalChartWidget';
import { TerminalPage } from '../src/components/TerminalPage';
import { FullscreenChartModal } from '../src/components/FullscreenChartModal';
import { getTradingViewSymbol, normalizeExchangeSymbol } from '../src/utils/marketSymbols';
import { binanceStreamUrls } from '../src/utils/binanceOrderBook';
import { terminalStorageKey } from '../src/utils/terminalPresets';
import { fetchKlines, fetchOrderBook } from '../server/marketService';
import { fetchDirectKlines, getFallbackScannedCoins } from '../src/utils/directExchangeClient';
import type { ExchangeId, MarketType, TerminalChartBlock } from '../src/types';

Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, configurable: true,
});
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

test('server and direct history and depth request distinct UTF-8 pairs on both exchanges', async (t) => {
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
    throw new Error(`Unexpected market request: ${url.pathname}`);
  });
  for (const exchange of ['binance', 'bybit'] as ExchangeId[]) {
    for (const market of ['spot', 'futures'] as MarketType[]) {
      for (const [symbol, price] of prices) {
        const history = await fetchKlines(exchange, market, symbol.replace('USDT', '/USDT'), '5m', 70);
        const direct = await fetchDirectKlines(exchange, market, symbol, '5m', 70);
        const book = await fetchOrderBook(exchange, market, symbol);
        assert.equal(history[0]?.close, price, `${exchange}:${market}:${symbol} server history`);
        assert.equal(direct[0]?.close, price, `${exchange}:${market}:${symbol} direct history`);
        assert.equal(book.symbol, symbol);
        assert.equal(book.bids[0]?.[0], price);
      }
    }
  }
  assert.equal(requests.length, 36, 'different asset names do not share a truncated USDT cache key');
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

test('TradingView aliases are scoped to verified exchange markets and regular symbols keep working', () => {
  assert.equal(getTradingViewSymbol('龙虾/USDT', 'binance', 'futures'), 'BINANCE:LONGXIAUSDT.P');
  assert.equal(getTradingViewSymbol('币安人生/USDT', 'binance', 'futures'), 'BINANCE:BIANRENSHENGUSDT.P');
  assert.equal(getTradingViewSymbol('币安人生/USDC', 'binance', 'spot'), 'BINANCE:BIANRENSHENGUSDC');
  assert.equal(getTradingViewSymbol('龙虾USDT', 'bybit', 'futures'), null);
  assert.equal(getTradingViewSymbol('新币USDT', 'binance', 'futures'), null);
  assert.equal(getTradingViewSymbol('BTC/USDT', 'binance', 'spot'), 'BINANCE:BTCUSDT');
  assert.equal(getTradingViewSymbol('1000BONK/USDT', 'bybit', 'futures'), 'BYBIT:1000BONKUSDT.P');
});

test('Terminal and fullscreen always render native HookChart, including legacy TradingView account preferences', (t) => {
  const uid = 'chart-render-test';
  let savedBlocks: TerminalChartBlock[] = [];
  t.mock.method(localStorage, 'getItem', (key: string) =>
    [terminalStorageKey('crypto_screener_terminal_blocks'), terminalStorageKey('crypto_screener_terminal_blocks', uid)].includes(key)
      ? JSON.stringify(savedBlocks) : null);
  for (const provider of ['tradingview', 'hookchart', undefined] as const) {
    const auth: NonNullable<React.ContextType<typeof AuthContext>> = {
      user: { uid } as H00kUser, profile: { uid, defaultChartProvider: provider }, loading: false,
      signInWithEmail: async () => {}, registerWithEmail: async () => {},
      updateProfileData: async () => {}, updateTerminalWorkspace: async () => null, refreshProfile: async () => ({ uid: 'chart-render-test' }), logout: async () => {},
      resendVerification: async () => {}, requestPasswordReset: async () => {}, resetPassword: async () => {},
      resetToken: null, authNotice: null, listSessions: async () => [], revokeSession: async () => {}, logoutAll: async () => {},
      authError: null, authErrorCode: null, clearAuthError: noop,
    };
    for (const [symbol, expected] of [
      ['龙虾USDT', 'BINANCE:LONGXIAUSDT.P'],
      ['币安人生USDT', 'BINANCE:BIANRENSHENGUSDT.P'],
      ['BTCUSDT', 'BINANCE:BTCUSDT.P'],
      ['新币USDT', null],
    ]) {
      const coin = { ...getFallbackScannedCoins()[0], symbol: symbol!, baseAsset: symbol!.replace('USDT', '') };
      const block: TerminalChartBlock = { id: 'unicode-chart', symbol: coin.symbol, baseAsset: coin.baseAsset,
        quoteAsset: 'USDT', exchange: 'binance', marketType: 'futures', timeframe: '15m', colSpan: 1 };
      savedBlocks = [block];
      const widget = (isSingleBlock: boolean, isMaximized: boolean) => React.createElement(TerminalChartWidget, {
        block, coin, allCoins: [coin], isSingleBlock, isMaximized,
        onToggleMaximize: noop, onRemove: noop, onUpdateBlock: noop,
      });
      const render = (view: React.ReactNode) => {
        // The real app mounts Terminal below ArchiveProvider. Keep this
        // server-rendering test faithful to that dependency instead of
        // treating an absent archive provider as a HookChart regression.
        const withArchive = React.createElement(ArchiveProvider, { children: view });
        return renderToString(provider
          ? React.createElement(AuthContext.Provider, { value: auth, children: withArchive })
          : React.createElement(AuthProvider, { children: withArchive }));
      };
      const views = [
        ['terminal', React.createElement(TerminalPage, { coins: [coin], watchlist: [], onToggleWatchlist: noop })],
        ['single widget', widget(true, false)],
        ['maximized widget', widget(false, true)],
        ['fullscreen', React.createElement(FullscreenChartModal, { isOpen: true, onClose: noop, coin, currentTimeframe: '15m' })],
      ] as const;
      for (const [name, view] of views) {
        const label = `${provider || 'default'}:${symbol}:${name}`;
        const html = render(view);
        const iframe = html.match(/src="([^"]*widgetembed[^\"]*)"/);
        assert.equal(iframe, null, `${label} must never embed legacy TradingView`);
        // Terminal tiles are intentionally viewport-virtualized. SSR runs
        // no observer/effect, so neither a Canvas nor its loader should mount
        // until the card is actually visible on the client.
        if (name === 'fullscreen') {
          assert.ok(html.includes('Завантаження hookchart…'), `${label} renders native HookChart`);
        } else if (name === 'terminal') {
          assert.match(html, /data-terminal-scroll-viewport|terminal-empty-workspace/,
            `${label} keeps the native Terminal workspace shell`);
        } else {
          assert.ok(html.includes(symbol!), `${label} preserves exact symbol while deferred`);
          assert.ok(html.includes('Віджет призупинено поза видимою областю.'),
            `${label} defers HookChart until browser visibility is known`);
        }
        assert.ok(!html.includes('Завантаження графіку'), 'iframe loader cannot cover native HookChart');
      }
      const deferredGrid = render(widget(false, false));
      assert.ok(!deferredGrid.includes('widgetembed'), 'an offscreen grid card does not embed TradingView');
      assert.ok(!deferredGrid.includes('Завантаження hookchart…'), 'an offscreen grid card defers HookChart');
      assert.ok(deferredGrid.includes(symbol!), 'the deferred card still identifies its complete symbol');
      assert.ok(deferredGrid.includes('Віджет призупинено поза видимою областю.'));
    }
  }
});
