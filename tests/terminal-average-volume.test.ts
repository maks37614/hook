import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { MarketCoin } from '../src/types';
import { MARKET_PRESETS, selectMarketPresetCoins } from '../src/utils/marketPresets';

function quote(symbol: string, volumeUsd: number, extra: Partial<MarketCoin> = {}): MarketCoin {
  return {
    symbol, baseAsset: symbol.replace('USDT', ''), quoteAsset: 'USDT',
    exchange: 'binance', marketType: 'futures', price: 100, change24h: 2,
    volumeUsd, high24h: 110, low24h: 90, distanceToHighPct: 9,
    distanceToLowPct: 11, volatility24hPct: 5,
    isNearHigh: false, isNearLow: false, isActiveCoin: false, exchangeUrl: '',
    ...extra,
  };
}

test('AV preset ranks all valid spot/futures coins by average USDT volume per minute over 24h', () => {
  const coins = [
    quote('SOLUSDT', 1_440_000), quote('BTCUSDT', 144_000_000),
    quote('ETHUSDT', 14_400_000), quote('BTCUSDT', 43_200_000, { marketType: 'spot' }),
    quote('DOGEUSDT', 5_000_000, { exchange: 'bybit', marketType: 'spot' }),
    quote('BROKENUSDT', Number.NaN),
    quote('NEGATIVEUSDT', -10),
  ];
  const all = { exchange: 'all', marketType: 'all' } as const;
  assert.ok(!MARKET_PRESETS.some(p => p.id === 'av'), 'obsolete AV button must not be offered');
  assert.ok(MARKET_PRESETS.some(p => p.id === 'av_1m' && p.label === 'AV 1m'));
  const ranked = selectMarketPresetCoins(coins, 'av', all, Number.POSITIVE_INFINITY);
  assert.deepEqual(ranked.map(c => [c.symbol, c.exchange, c.marketType]), [
    ['BTCUSDT', 'binance', 'futures'],
    ['BTCUSDT', 'binance', 'spot'],
    ['ETHUSDT', 'binance', 'futures'],
    ['DOGEUSDT', 'bybit', 'spot'],
    ['SOLUSDT', 'binance', 'futures'],
  ]);
  assert.deepEqual(selectMarketPresetCoins(coins, 'av', { exchange: 'bybit', marketType: 'spot' }, 50)
    .map(c => c.symbol), ['DOGEUSDT']);
  assert.deepEqual(selectMarketPresetCoins(coins, 'av', all, 2).map(c => c.symbol),
    ['BTCUSDT', 'BTCUSDT']);
  assert.equal(coins[0].symbol, 'SOLUSDT');
});

test('AV 1m does not reject a tradable market solely for missing 24h change', () => {
  const candidate = quote('NEWUSDT', 1_440_000, { change24h: Number.NaN });
  const all = { exchange: 'all', marketType: 'all' } as const;
  assert.deepEqual(selectMarketPresetCoins([candidate], 'av_1m', all, 10).map(c => c.symbol), ['NEWUSDT']);
  assert.deepEqual(selectMarketPresetCoins([candidate], 'top_gainers', all, 10), []);
});

test('empty market feed triggers a shared quote retry, not a false no-coins conclusion', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/components/terminal/TerminalPresetPanel.tsx', import.meta.url), 'utf8');
  const loader = readFileSync(new URL('../src/utils/marketCoinLoader.ts', import.meta.url), 'utf8');
  assert.match(loader, /Array\.isArray\(result\.data\) && result\.data\.length > 0/);
  assert.match(panel, /const \[pendingMarketPreset, setPendingMarketPreset\]/);
  assert.match(panel, /pendingQuoteSnapshot\.current = snapshot/);
  assert.match(panel, /onRequestMarketRefresh\?\.\(\)/);
  assert.match(panel, /applyRef\.current\(matched, pendingMarketPreset\)/);
  assert.match(page, /onRequestMarketRefresh=\{\(\) => requestMarketRefreshRef\.current\?\.\(true\)\}/);
  assert.match(page, /exchange === 'binance' \|\| exchange === 'bybit' \? exchange : 'all'/);
  assert.match(page, /marketType === 'spot' \|\| marketType === 'futures' \? marketType : 'all'/);
});

test('AV shares existing quote refresh/preset pagination and does not trigger separate market-wide scans', () => {
  const panel = readFileSync(new URL('../src/components/terminal/TerminalPresetPanel.tsx', import.meta.url), 'utf8');
  const terminal = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(panel, /MARKET_PRESETS\.map\(preset => preset\.id\)/);
  assert.match(panel, /selectMarketPresetCoins\(snapshot\.coins, id, selection, Number\.POSITIVE_INFINITY\)/);
  assert.match(terminal, /applyPresetPage\(selected, presetPageRef\.current\)/);
});

test('HookChart AV footer uses only cached 24h quotes or a full day of existing candles', () => {
  const chart = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  const backend = readFileSync(new URL('../server/marketTickerFeed.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  assert.match(chart, /data-testid="hookchart-footer-av"/);
  assert.match(chart, /AV 24h:/);
  assert.match(chart, /quotedVolume24hUsd \/ 1440/);
  assert.match(chart, /hasFullDayHistory/);
  assert.match(chart, /sharedPublicChartPolling\.subscribe/);
  assert.match(backend, /getCached24hVolumeUsd\(/);
  assert.match(backend, /entry\.symbolPositions\?\.get\(symbol\)/);
  assert.doesNotMatch(backend.split('getCached24hVolumeUsd(')[1].split('cached()')[0], /exchangeFetch\(|fetch\(/);
  assert.match(server, /volume24hUsd = marketTickerFeed\.getCached24hVolumeUsd/);
});

test('AV 1m ranks exactly the top ten markets by cached average minute turnover', () => {
  const all = { exchange: 'all', marketType: 'all' } as const;
  const coins = Array.from({ length: 16 }, (_, index) =>
    quote(`C${index}USDT`, (index + 1) * 1_440_000));
  coins.push(quote('BROKENUSDT', Number.NaN), quote('MISSINGUSDT', 0), quote('NEGUSDT', -1));
  const original = [...coins];
  assert.ok(MARKET_PRESETS.some(preset => preset.id === 'av_1m' && preset.label === 'AV 1m'));
  const ranked = selectMarketPresetCoins(coins, 'av_1m', all, Number.POSITIVE_INFINITY);
  assert.equal(ranked.length, 10);
  assert.deepEqual(ranked.map(coin => coin.symbol),
    ['C15USDT','C14USDT','C13USDT','C12USDT','C11USDT',
      'C10USDT','C9USDT','C8USDT','C7USDT','C6USDT']);
  assert.equal(ranked[0].volumeUsd / 1440, 16_000);
  assert.equal(ranked[9].volumeUsd / 1440, 7_000);
  assert.deepEqual(selectMarketPresetCoins(coins, 'av_1m', all, 4), ranked.slice(0, 4));
  // The old AV preset still contains the full universe, unchanged.
  assert.equal(selectMarketPresetCoins(coins, 'av', all, Number.POSITIVE_INFINITY).length, 17);
  assert.deepEqual(coins, original);
});

test('AV 1m honors exact exchange and Spot/Futures filters, deduplicates and uses stable ordering', () => {
  const coins = [
    quote('BTCUSDT', 14_400_000),
    quote('BTCUSDT', 999_000_000), // duplicate market must not replace its first authoritative quote
    quote('BTCUSDT', 43_200_000, { marketType: 'spot' }),
    quote('ETHUSDT', 72_000_000, { exchange: 'bybit' }),
    quote('SOLUSDT', 72_000_000, { exchange: 'bybit', marketType: 'spot' }),
    quote('XRPUSDT', 0, { exchange: 'bybit', marketType: 'spot' }),
  ];
  const all = { exchange: 'all', marketType: 'all' } as const;
  const ranked = selectMarketPresetCoins(coins, 'av_1m', all, Number.POSITIVE_INFINITY);
  assert.deepEqual(ranked.map(x => [x.symbol, x.exchange, x.marketType]), [
    ['ETHUSDT', 'bybit', 'futures'], ['SOLUSDT', 'bybit', 'spot'],
    ['BTCUSDT', 'binance', 'spot'], ['BTCUSDT', 'binance', 'futures'],
  ]);
  assert.deepEqual(selectMarketPresetCoins(coins, 'av_1m', { exchange: 'binance', marketType: 'spot' }, 10)
    .map(x => x.symbol), ['BTCUSDT']);
  assert.deepEqual(selectMarketPresetCoins(coins, 'av_1m', { exchange: 'bybit', marketType: 'futures' }, 10)
    .map(x => x.symbol), ['ETHUSDT']);
});

test('AV 1m shows all ten terminal charts even when ordinary presets page at four', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/components/terminal/TerminalPresetPanel.tsx', import.meta.url), 'utf8');
  const locale = readFileSync(new URL('../src/locales/terminalPage20261115.ts', import.meta.url), 'utf8');
  assert.match(page, /const avOneMinuteActive = activeMarketPreset === 'av_1m'/);
  assert.match(page, /avOneMinuteActive \? 10 : config\.coinPresetLimit/);
  assert.match(page, /const effectivePresetPageSize = avOneMinuteActive \? 10 : coinPresetLimit/);
  assert.match(page, /getTerminalPresetPage\(presetMatches, presetPage, effectivePresetPageSize\)/);
  assert.match(page, /preset === 'av_1m' \? 10 : coinPresetLimit/);
  assert.match(panel, /onApplyCoins\(readyCoins\[id\], id\)/);
  assert.match(panel, /applyRef\.current\(readyCoins\[activePreset\], activePreset\)/);
  assert.match(panel, /av_1m: BarChart3/);
  assert.match(locale, /Top 10 coins by average trading turnover per minute/);
});
