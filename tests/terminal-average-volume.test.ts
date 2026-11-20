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

test('AV 1m derives the mean from 24h quote turnover and does not require last-minute candles or 24h price change', () => {
  const candidate = quote('NEWUSDT', 451_106_979.95045, { change24h: Number.NaN, volume1mUsd: 0 });
  const all = { exchange: 'all', marketType: 'all' } as const;
  const qualified = selectMarketPresetCoins([candidate], 'av_1m', all, 10);
  assert.deepEqual(qualified.map(c => c.symbol), ['NEWUSDT']);
  assert.ok(Math.abs(qualified[0].volumeUsd / 1440 - 313_268.736) < 0.01);
  assert.deepEqual(selectMarketPresetCoins([candidate], 'top_gainers', all, 10), []);
  assert.deepEqual(selectMarketPresetCoins([quote('LOWUSDT', 287_999_999, {volume1mUsd: 999_999})], 'av_1m', all, 10), []);
  assert.deepEqual(selectMarketPresetCoins([quote('EDGEUSDT', 288_000_000)], 'av_1m', all, 10).map(c => c.symbol), ['EDGEUSDT']);
});

test('AV 1m relies on the full existing market quote snapshot and a shared quote retry', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/components/terminal/TerminalPresetPanel.tsx', import.meta.url), 'utf8');
  const loader = readFileSync(new URL('../src/utils/marketCoinLoader.ts', import.meta.url), 'utf8');
  assert.match(loader, /Array\.isArray\(result\.data\) && result\.data\.length > 0/);
  assert.match(page, /loadMarketCoins\(\{ exchange: 'all', marketType: 'all' \}, controller\.signal\)/);
  assert.match(panel, /const \[pendingMarketPreset, setPendingMarketPreset\]/);
  assert.match(panel, /pendingQuoteSnapshot\.current = snapshot/);
  assert.match(panel, /onRequestMarketRefresh\?\.\(\)/);
  assert.match(panel, /applyRef\.current\(matched, pendingMarketPreset\)/);
  assert.match(panel, /середнім AV 1m від 200 000 USDT/);
  assert.match(page, /onRequestMarketRefresh=\{\(\) => requestMarketRefreshRef\.current\?\.\(true\)\}/);
  assert.match(page, /exchange === 'binance' \|\| exchange === 'bybit' \? exchange : 'all'/);
  assert.match(page, /marketType === 'spot' \|\| marketType === 'futures' \? marketType : 'all'/);
  // No extra minute-candle scan just to rank the average volume.
  assert.doesNotMatch(page, /api\/market\/av1m\/top|minuteRequested|setMinuteRows|onRequestMinuteRefresh/);
});

test('AV shares existing quote refresh/preset pagination and does not trigger separate market-wide scans', () => {
  const panel = readFileSync(new URL('../src/components/terminal/TerminalPresetPanel.tsx', import.meta.url), 'utf8');
  const terminal = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(panel, /MARKET_PRESETS\.map\(preset => preset\.id\)/);
  assert.match(panel, /selectMarketPresetCoins\(snapshot\.coins, id, selection, Number\.POSITIVE_INFINITY\)/);
  assert.match(terminal, /applyPresetPage\(selected, presetPageRef\.current, preset === 'av_1m' \? MAX_TERMINAL_CHARTS : coinPresetLimit\)/);
});

test('HookChart AV footer uses only cached 24h quotes or a full day of existing candles', () => {
  const chart = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  const backend = readFileSync(new URL('../server/marketTickerFeed.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  assert.match(chart, /<HookChartFooterMinuteVolume/);
  const minute = readFileSync(new URL('../src/components/hookchart/HookChartFooterMinuteVolume.tsx', import.meta.url), 'utf8');
  assert.match(minute, /data-testid="hookchart-footer-av"/);
  assert.match(minute, /AV 1m:/);
  assert.match(minute, /parseMinuteVolumeResponse/);
  assert.match(minute, /'minute-volume'/);
  assert.match(server, /serverNow: Date.now\(\)/);
  assert.doesNotMatch(minute, /1440|AV 24h:/);
  assert.match(chart, /sharedPublicChartPolling\.subscribe/);
  assert.match(backend, /getCached24hVolumeUsd\(/);
  assert.match(backend, /entry\.symbolPositions\?\.get\(symbol\)/);
  assert.doesNotMatch(backend.split('getCached24hVolumeUsd(')[1].split('cached()')[0], /exchangeFetch\(|fetch\(/);
  assert.match(server, /volume24hUsd = marketTickerFeed\.getCached24hVolumeUsd/);
});

test('AV 1m shows every qualifying coin in descending 24h/1440 average, not only ten', () => {
  const all = { exchange: 'all', marketType: 'all' } as const;
  const coins = Array.from({ length: 72 }, (_, index) =>
    quote(`C${index}USDT`, (index + 1) * 144_000_000, { volume1mUsd: index === 71 ? 0 : 500_000 }));
  coins.push(quote('BROKENUSDT', Number.NaN), quote('MISSINGUSDT', 0), quote('NEGUSDT', -1));
  const original = [...coins];
  assert.ok(MARKET_PRESETS.some(preset => preset.id === 'av_1m' && preset.label === 'AV 1m'));
  const ranked = selectMarketPresetCoins(coins, 'av_1m', all, Number.POSITIVE_INFINITY);
  assert.equal(ranked.length, 71, 'all markets over the 200k/min threshold survive');
  assert.deepEqual(ranked.slice(0, 5).map(coin => coin.symbol),
    ['C71USDT','C70USDT','C69USDT','C68USDT','C67USDT']);
  assert.equal(ranked[0].volumeUsd / 1440, 7_200_000);
  assert.equal(ranked[70].volumeUsd / 1440, 200_000);
  assert.deepEqual(selectMarketPresetCoins(coins, 'av_1m', all, 50), ranked.slice(0, 50));
  assert.deepEqual(selectMarketPresetCoins(coins, 'av_1m', all, 4), ranked.slice(0, 4));
  // Preserve legacy internal AV sorting for other consumers.
  assert.equal(selectMarketPresetCoins(coins, 'av', all, Number.POSITIVE_INFINITY).length, 72);
  assert.deepEqual(coins, original);
});

test('AV 1m excludes BTC ETH XAU SOL on every exchange/market, preserves similarly named assets', () => {
  const coins = [
    quote('BTCUSDT', 9_000_000_000),
    quote('BTCUSDT', 8_000_000_000, {marketType:'spot'}),
    quote('ETHUSDT', 7_000_000_000, {exchange:'bybit'}),
    quote('XAUUSDT', 6_000_000_000, {exchange:'bybit',marketType:'spot'}),
    quote('SOLUSDT', 5_000_000_000),
    quote('AKEUSDT', 451_106_979.95045),
    quote('AKEUSDT', 600_000_000, {exchange:'bybit'}),
    quote('AKEUSDT', 800_000_000), // duplicate exchange+market must not replace first quote
    quote('WBTCUSDT', 720_000_000),
    quote('SOLVUSDT', 576_000_000),
    quote('STETHUSDT', 432_000_000, {exchange:'bybit',marketType:'spot'}),
    quote('XRPUSDT', 0, {exchange:'bybit',marketType:'spot'}),
  ];
  const all = {exchange:'all', marketType:'all'} as const;
  const ranked = selectMarketPresetCoins(coins, 'av_1m', all, Number.POSITIVE_INFINITY);
  assert.deepEqual(ranked.map(x=>[x.symbol,x.exchange,x.marketType]), [
    ['WBTCUSDT','binance','futures'],
    ['AKEUSDT','bybit','futures'],
    ['SOLVUSDT','binance','futures'],
    ['AKEUSDT','binance','futures'],
    ['STETHUSDT','bybit','spot'],
  ]);
  assert.deepEqual(selectMarketPresetCoins(coins, 'av_1m', {exchange:'binance',marketType:'futures'}, Number.POSITIVE_INFINITY)
    .map(x=>x.symbol), ['WBTCUSDT','SOLVUSDT','AKEUSDT']);
  assert.deepEqual(selectMarketPresetCoins(coins, 'av_1m', {exchange:'bybit',marketType:'spot'}, Number.POSITIVE_INFINITY)
    .map(x=>x.symbol), ['STETHUSDT']);
  assert.deepEqual(selectMarketPresetCoins(coins, 'av_1m', {exchange:'bybit',marketType:'futures'}, Number.POSITIVE_INFINITY)
    .map(x=>x.symbol), ['AKEUSDT']);
});

test('AV 1m exposes all ranked coins in paginated groups of up to 50 live charts', () => {
  const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/components/terminal/TerminalPresetPanel.tsx', import.meta.url), 'utf8');
  const locale = readFileSync(new URL('../src/locales/terminalPage20261115.ts', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../src/utils/marketPresets.ts', import.meta.url), 'utf8');
  assert.match(page, /const avOneMinuteActive = activeMarketPreset === 'av_1m'/);
  assert.match(page, /avOneMinuteActive \? MAX_TERMINAL_CHARTS : config\.coinPresetLimit/);
  assert.match(page, /const effectivePresetPageSize = avOneMinuteActive \? MAX_TERMINAL_CHARTS : coinPresetLimit/);
  assert.match(page, /getTerminalPresetPage\(presetMatches, presetPage, effectivePresetPageSize\)/);
  assert.match(page, /preset === 'av_1m' \? MAX_TERMINAL_CHARTS : coinPresetLimit/);
  assert.match(page, /visiblePresetPage\.pageCount > 1/);
  assert.match(page, /goToPresetPage\(visiblePresetPage\.page \+ direction\)/);
  assert.match(panel, /onApplyCoins\(readyCoins\[id\], id\)/);
  assert.match(panel, /applyRef\.current\(readyCoins\[activePreset\], activePreset\)/);
  assert.match(panel, /av_1m: BarChart3/);
  assert.match(config, /label: 'AV 1m'/);
  assert.doesNotMatch(config, /AV 1m TOP 10|slice\(0, 10\)/);
  assert.match(locale, /All coins averaging at least 200,000 USDT/);
  assert.doesNotMatch(locale, /AV 1m TOP 10|Top 10 coins/);
});
