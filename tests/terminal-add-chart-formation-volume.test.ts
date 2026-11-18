import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { AddChartModal } from '../src/components/terminal/AddChartModal';
import type { MarketCoin, ScannedCoin, Timeframe } from '../src/types';
import { isVolumeWithinCap } from '../src/utils/screenerVolume';

const source = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const pair = (symbol: string, volumeUsd: number): MarketCoin => ({
  exchange: 'binance', marketType: 'futures', symbol, baseAsset: symbol.replace('USDT', ''),
  quoteAsset: 'USDT', volumeUsd, price: 100, change24h: 3.2,
  high24h: 105, low24h: 95, distanceToHighPct: 5, distanceToLowPct: 5,
  volatility24hPct: 6, isNearHigh: false, isNearLow: false, isActiveCoin: true, exchangeUrl: '',
});
const fakeFormation: ScannedCoin = {
  symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', exchange: 'binance',
  marketType: 'futures', timeframe: '5m', lastUpdated: Date.now(),
  currentPrice: 100, volume24hUsd: 100_000, priceChange24h: 3.2,
  highPrice24h: 105, lowPrice24h: 95, exchangeUrl: '',
  formations: [{
    id: 'scan-form-1', name: 'W / TEST', nameEn: 'W / TEST', patternKey: 'w',
    category: 'reversal', bias: 'bullish', confidence: 88, status: 'forming',
    statusLabel: 'forming', description: 'Test fixture only',
    levels: { entryPrice: 100, targetPrice: 106, stopLossPrice: 95 },
    riskRewardRatio: 1.2, potentialProfitPct: 6,
  } as ScannedCoin['formations'][number]],
};

test('Terminal picker uses Screener volume threshold/direction without adding scan sockets', () => {
  const code = source('src/components/terminal/AddChartModal.tsx');
  const screener = source('src/components/CoinScreenerPage.tsx');
  const dropdown = source('src/components/ScreenerVolumeDropdown.tsx');
  assert.match(code, /<ScreenerVolumeDropdown/);
  assert.match(screener, /<ScreenerVolumeDropdown/);
  assert.match(code, /isVolumeWithinCap\(c\.volume24hUsd \|\| 0, selectedVolumeCap, selectedVolumeMode\)/);
  assert.match(code, /preferredVolumeSortOrder\(selectedVolumeMode\)/);
  assert.match(code, /portalZIndex=\{280\}/);
  assert.match(dropdown, /zIndex: portalZIndex/);
  assert.doesNotMatch(code, /Таймфрейм:/);
  assert.equal(isVolumeWithinCap(100_000, 100_000, 'to'), true);
  assert.equal(isVolumeWithinCap(100_000, 100_000, 'from'), true);
  assert.equal(isVolumeWithinCap(90_000, 100_000, 'from'), false);
  assert.equal(isVolumeWithinCap(110_000, 100_000, 'to'), false);
});

test('Formations tab performs one user-triggered shared scan and shows true formation candidates', async t => {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'https://h00k.top/' });
  const previous = {
    window: (globalThis as any).window,
    document: (globalThis as any).document,
    flag: (globalThis as any).IS_REACT_ACT_ENVIRONMENT,
    fetch: (globalThis as any).fetch,
  };
  (globalThis as any).window = dom.window;
  (globalThis as any).document = dom.window.document;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const calls: string[] = [];
  const selected: Array<{ symbol: string; tf: Timeframe; formation?: string }> = [];
  (globalThis as any).fetch = async (request: string) => {
    calls.push(String(request));
    if (!String(request).startsWith('/api/screener/scan?')) {
      throw new Error('Picker must not make an unrequested full-market request');
    }
    return new Response(JSON.stringify({ success: true, data: [fakeFormation] }), {
      headers: { 'content-type': 'application/json' },
    });
  };
  const root = createRoot(dom.window.document.querySelector('#root')!);
  const props = {
    isOpen: true, onClose: () => {}, coins: [] as ScannedCoin[],
    terminalMarketCoins: [pair('BTCUSDT', 100_000), pair('ETHUSDT', 250_000)],
    initialTimeframe: '5m' as Timeframe, watchlist: [] as string[],
    onAddChart: (coin: { symbol: string }, tf: Timeframe, formationId?: string) => {
      selected.push({ symbol: coin.symbol, tf, formation: formationId });
    },
  };
  const click = async (node: Element | null) => {
    assert.ok(node, 'interactive control must exist');
    await act(async () => {
      node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
  };
  try {
    await act(async () => { root.render(React.createElement(AddChartModal, props)); });
    assert.equal(calls.length, 0, 'regular picker open never launches a formation scan');
    const button = [...dom.window.document.querySelectorAll('button')]
      .find(button => button.textContent?.includes('З формаціями'));
    await click(button ?? null);
    assert.equal(calls.length, 1, 'only a deliberate Formations-tab click requests a scan');
    assert.match(calls[0], /timeframe=5m/);
    assert.match(calls[0], /exchange=all/);
    assert.match(calls[0], /marketType=all/);
    await act(async () => { await Promise.resolve(); });
    const rows = dom.window.document.querySelectorAll('.terminal-add-chart-coin-row');
    assert.equal(rows.length, 1, 'unformed ETH must be excluded from Formations tab');
    assert.match(rows[0].textContent || '', /BTCUSDT/);
    assert.match(rows[0].textContent || '', /W \/ TEST/);
    await click(rows[0]);
    assert.deepEqual(selected, [{ symbol: 'BTCUSDT', tf: '5m', formation: 'scan-form-1' }]);
  } finally {
    await act(async () => { root.unmount(); });
    (globalThis as any).fetch = previous.fetch;
    (globalThis as any).window = previous.window;
    (globalThis as any).document = previous.document;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous.flag;
    dom.window.close();
  }
});

test('Formations tab reuses already scanned formations and has no background analysis polling', () => {
  const code = source('src/components/terminal/AddChartModal.tsx');
  assert.match(code, /if \(haveIncomingFormations \|\| onDemandFormations\.length/);
  assert.match(code, /if \(isOpen\) return;\s*formationScanController\.current\?\.abort\(\)/);
  assert.match(code, /setFilterTab\('formations'\); setDisplayCount\(80\); loadFormationsOnDemand\(\)/);
  assert.doesNotMatch(code, /setInterval\(|WebSocket\(/);
  assert.match(code, /scanned\.volume24hUsd/);
  const page = source('src/components/TerminalPage.tsx');
  assert.match(page, /config\.globalTimeframe \|\| timeframe/);
});
