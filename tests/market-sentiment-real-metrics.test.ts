import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { MarketCoin } from '../src/types';
import { aggregateBybitDerivatives, parseBinanceDailyTakerDelta, getSampledTakerDelta } from '../server/sentimentMarketMetrics';
import { MarketTickerFeed } from '../server/marketTickerFeed';

const coin = (exchange: 'bybit' | 'binance', oi?: number, funding?: number): MarketCoin => ({
  symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', exchange, marketType: 'futures',
  price: 100, change24h: 1, volumeUsd: 100000, high24h: 110, low24h: 90,
  distanceToHighPct: 10, distanceToLowPct: 10, volatility24hPct: 12,
  isNearHigh: false, isNearLow: false, isActiveCoin: true, exchangeUrl: '',
  ...(oi === undefined ? {} : { openInterestUsd: oi }),
  ...(funding === undefined ? {} : { fundingRatePct: funding }),
});

test('real Bybit ticker OI sums across observed contracts, never guessed from turnover', () => {
  const metrics = aggregateBybitDerivatives([
    coin('bybit', 100_000_000, 0.02),
    { ...coin('bybit', 200_000_000, 0.005), symbol: 'ETHUSDT' },
    coin('binance', 900_000_000, 0.25),
  ]);
  assert.equal(metrics.aggregatedOIUsd, 300_000_000);
  assert.equal(metrics.instrumentCount, 2);
  assert.equal(metrics.fundingInstrumentCount, 2);
  assert.equal(metrics.avgFundingRate, 0.01);
  assert.equal(metrics.oiChange24hPct, null);
  assert.match(metrics.sourceLabel ?? '', /Bybit USDT Linear/);
});

test('no observed OI/funding returns nulls, including malformed amounts', () => {
  const metrics = aggregateBybitDerivatives([coin('bybit'), coin('bybit', Number.NaN, 0.02)]);
  assert.equal(metrics.aggregatedOIUsd, null);
  assert.equal(metrics.avgFundingRate, null);
  assert.equal(metrics.instrumentCount, 0);
  assert.equal(metrics.fundingBias, null);
});

test('Binance UTC candle taker delta is signed BUY - SELL, not net money inflow', () => {
  const now = Date.UTC(2026, 10, 12, 15, 30);
  const row: unknown[] = [Date.UTC(2026, 10, 12), '100', '110', '90', '105', '10',
    now + 1000, '1000', 100, '7', '650', '0'];
  assert.equal(parseBinanceDailyTakerDelta([row], now), 300);
  row[10] = '400';
  assert.equal(parseBinanceDailyTakerDelta([row], now), -200);
});

test('reject stale and inconsistent Binance candles instead of displaying fake flow', () => {
  const now = Date.UTC(2026, 10, 12, 15);
  const valid: unknown[] = [Date.UTC(2026, 10, 12), '1', '1', '1', '1', '1', now,
    '1000', 20, '1', '600', '0'];
  assert.equal(parseBinanceDailyTakerDelta([[...valid.slice(0, 7), '1000', 20, '1', '1200', '0']], now), null);
  assert.equal(parseBinanceDailyTakerDelta([[Date.UTC(2026, 10, 11), ...valid.slice(1)]], now), null);
  assert.equal(parseBinanceDailyTakerDelta('not a kline', now), null);
  assert.equal(parseBinanceDailyTakerDelta([valid], now), 200);
});

test('market coverage is explicit and low coverage cannot affect live sentiment', () => {
  const src = readFileSync(new URL('../server/sentimentService.ts', import.meta.url), 'utf8');
  assert.match(src, /locationCount >= 50 && locationCoverage >= 0\.30/);
  assert.match(src, /locationCoverageReliable && locationCount > 0/);
  assert.match(src, /locationPairs: locationCount/);
  assert.match(src, /locationReliable: locationCoverageReliable/);
});

test('Binance sample is rate-limited globally and clearly scoped to UTC day', () => {
  const src = readFileSync(new URL('../server/sentimentMarketMetrics.ts', import.meta.url), 'utf8');
  assert.match(src, /const SAMPLE_SIZE = 8/);
  assert.match(src, /const CACHE_MS = 5 \* 60_000/);
  assert.match(src, /if \(inflight\) return inflight/);
  assert.match(src, /interval=1d&limit=1/);
  assert.match(src, /futures.count >= 3/);
  assert.match(src, /spot.count >= 3/);
  assert.match(src, /FUTURES_GEO_COOLDOWN_MS = 30 \* 60_000/);
});

test('Bybit shared ticker feed parses genuine USD OI and percentage funding', async () => {
  const feed = new MarketTickerFeed(async () => new Response(JSON.stringify({
    retCode: 0,
    result: { list: [{
      symbol: 'BTCUSDT', lastPrice: '95000', price24hPcnt: '0.01', turnover24h: '30000000',
      highPrice24h: '96000', lowPrice24h: '90000', openInterestValue: '740000000',
      fundingRate: '0.0001',
    }] },
  }), { status: 200 }), () => 1_700_000_000_000);
  const tickers = await feed.get('bybit', 'futures');
  assert.equal(tickers.length, 1);
  assert.equal(tickers[0].openInterestUsd, 740_000_000);
  assert.equal(tickers[0].fundingRatePct, 0.01);
  assert.equal(tickers[0].volumeUsd, 30_000_000);
});

test('geo-blocked Binance Futures switches to real Binance Spot klines and caches for all visitors', async () => {
  const now = Date.UTC(2026, 10, 12, 15, 0);
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
  const instruments: MarketCoin[] = symbols.flatMap(symbol => [
    { ...coin('binance'), symbol, marketType: 'futures' },
    { ...coin('binance'), symbol, marketType: 'spot' },
  ]);
  let futuresRequests = 0;
  let spotRequests = 0;
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('fapi.binance.com')) {
      futuresRequests++;
      return new Response('restricted', { status: 451 });
    }
    if (!url.includes('data-api.binance.vision')) throw new Error('Unexpected exchange host');
    spotRequests++;
    const candle = [Date.UTC(2026, 10, 12), '1', '1', '1', '1', '1', now, '1000',
      100, '1', '600', '0'];
    return new Response(JSON.stringify([candle]), { status: 200 });
  };
  const snapshot = await getSampledTakerDelta(instruments, now, fetcher);
  assert.equal(snapshot?.marketType, 'spot');
  assert.equal(snapshot?.sampledPairs, 4);
  assert.equal(snapshot?.deltaUsd, 800);
  assert.ok(futuresRequests >= 1);
  assert.equal(spotRequests, 4);

  const repeat = await getSampledTakerDelta(instruments, now + 30_000, fetcher);
  assert.deepEqual(repeat, snapshot);
  assert.equal(spotRequests, 4, 'cached sample must not issue a request per visitor');
});
