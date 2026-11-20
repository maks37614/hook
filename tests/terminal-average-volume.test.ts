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
  assert.ok(MARKET_PRESETS.some(p => p.id === 'av' && p.label === 'AV'));
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
