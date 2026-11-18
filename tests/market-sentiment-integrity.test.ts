import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketCoin } from '../src/types';
import { calculateMarketSentiment, SentimentDataUnavailableError } from '../server/sentimentService';
import { sentimentStateForScore, sentimentColorForScore } from '../src/utils/marketSentiment';

function coin(change24h: number, overrides: Partial<MarketCoin> = {}): MarketCoin {
  return {
    symbol: 'TESTUSDT', baseAsset: 'TEST', quoteAsset: 'USDT',
    exchange: 'binance', marketType: 'futures',
    price: 100, change24h, volumeUsd: 1_000_000,
    high24h: 105, low24h: 95, distanceToHighPct: 5,
    distanceToLowPct: 5, volatility24hPct: 10,
    isNearHigh: false, isNearLow: false, isActiveCoin: false,
    exchangeUrl: 'https://example.com', ...overrides,
  };
}

test('no real instruments => no fabricated baseline', async () => {
  await assert.rejects(calculateMarketSentiment([]), SentimentDataUnavailableError);
  await assert.rejects(calculateMarketSentiment([coin(0, { price: Number.NaN })]),
    SentimentDataUnavailableError);
});

test('unchanged prices are neutral, not 100% advancing', async () => {
  const sample = Array.from({ length: 100 }, (_, i) => coin(0, { symbol: `TEST${i}USDT` }));
  const result = await calculateMarketSentiment(sample);
  assert.equal(result.compositeScore, 50);
  assert.equal(result.sentimentState, 'neutral');
  assert.equal(result.priceTrendDynamics.advancingCount, 0);
  assert.equal(result.priceTrendDynamics.decliningCount, 0);
  assert.equal(result.priceTrendDynamics.unchangedCount, 100);
  assert.equal(result.marketBreadth.breadthScore, 50);
});

test('microscopic up/down movements cannot flip the index', async () => {
  const flat = await calculateMarketSentiment([coin(0)]);
  const up = await calculateMarketSentiment([coin(0.0001)]);
  const down = await calculateMarketSentiment([coin(-0.0001)]);
  assert.equal(flat.compositeScore, 50);
  assert.ok(Math.abs(up.compositeScore - down.compositeScore) <= 1);
  assert.equal(up.sentimentState, 'neutral');
  assert.equal(down.sentimentState, 'neutral');
});

test('strong opposing markets yield distinct scores without sharing synthetic cache', async () => {
  const up = await calculateMarketSentiment([coin(6)]);
  const down = await calculateMarketSentiment([coin(-6)]);
  assert.ok(up.compositeScore >= 78);
  assert.ok(down.compositeScore <= 25);
  assert.equal(up.sentimentState, 'extreme_greed');
  assert.equal(down.sentimentState, 'extreme_fear');
});

test('unavailable financial metrics are null instead of invented constants', async () => {
  const result = await calculateMarketSentiment([coin(2)]);
  assert.equal(result.tradingVolume.volumeVelocity, null);
  assert.equal(result.tradingVolume.volumeChangePct, null);
  assert.equal(result.capitalFlow.netInflow24hUsd, null);
  assert.equal(result.capitalFlow.direction, null);
  assert.equal(result.derivativesOverview.aggregatedOIUsd, null);
  assert.equal(result.derivativesOverview.oiChange24hPct, null);
  assert.equal(result.derivativesOverview.avgFundingRate, null);
  assert.equal(result.marketBreadth.aboveEma20Pct, null);
});

test('unavailable market location data is excluded from location coverage', async () => {
  const withLocation = coin(0, { location: {
    status: 'ready', score: 98, zone: 'extreme_high', historyDays: 90,
    through: 1700000000, ranges: [], trend: 'bullish',
    distanceHighATR: 0.1, distanceLowATR: 6,
  }, isNearHigh: true });
  const result = await calculateMarketSentiment([withLocation, coin(0)]);
  assert.equal(result.dataQuality?.locationCoveragePct, 50);
  assert.equal(result.marketBreadth.nearHighsPct, 100);
  assert.ok(result.compositeScore >= 50);
});

test('UI score bands use the same thresholds as the API state', () => {
  const samples: [number, string, string][] = [
    [0, 'extreme_fear', '#ff294e'], [25, 'extreme_fear', '#ff294e'],
    [26, 'fear', '#fb5263'], [42, 'fear', '#fb5263'],
    [43, 'neutral', '#ffdf40'], [59, 'neutral', '#ffdf40'],
    [60, 'greed', '#32e5b1'], [77, 'greed', '#32e5b1'],
    [78, 'extreme_greed', '#0fbc83'], [100, 'extreme_greed', '#0fbc83'],
  ];
  for (const [score, state, color] of samples) {
    assert.equal(sentimentStateForScore(score), state);
    assert.equal(sentimentColorForScore(score), color);
  }
});
