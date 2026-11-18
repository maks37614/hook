import test from 'node:test';
import assert from 'node:assert/strict';
import type { DetectedFormation, Kline, RegularIndicatorValues, ScannedCoin } from '../src/types';
import { calculateRegularIndicatorValues } from '../src/utils/regularFormationIndicators';
import { reassessRegularFormationQuality } from '../src/utils/regularFormationQuality';
import { scoreRegularFlowQuality } from '../src/utils/regularFlowQuality';
import { REGULAR_BASE_MAX, REGULAR_SUPPLEMENTARY_MAX, REGULAR_BASE_QUALITY_WEIGHTS,
  REGULAR_SUPPLEMENTARY_WEIGHTS } from '../src/utils/regularFormationScore';
import { withAlignedRegularOI } from '../src/utils/regularOIHistory';
import { hydrateMissingRegularOIFromBrowser } from '../src/utils/directExchangeClient';
import { BybitFormationFlow, readBybitFormationFlow, registerBybitFormationFlow } from '../server/regularBybitFlow';

const timeframe = 300_000;
const closedAt = Math.floor(Date.now() / timeframe) * timeframe;

function fixture(direction: 1 | -1 = 1) {
  const price = (value: number) => direction === 1 ? value : 200 - value;
  const candles: Kline[] = Array.from({ length: 64 }, (_, i) => {
    const close = i === 62 ? 100.3 : i === 63 ? 100.55 : 99.8;
    const high = i === 63 ? 100.65 : close + .4;
    const low = i === 63 ? 100.32 : close - .4;
    return { time: closedAt / 1000 - (64 - i) * 300, open: price(close), close: price(close),
      high: price(direction === 1 ? high : low), low: price(direction === 1 ? low : high),
      volume: i === 62 ? 200 : 100, quoteVolume: 1_000, buyQuoteVolume: direction === 1 ? 650 : 350 };
  });
  const raw: DetectedFormation = {
    id: 'score-fixture', patternKey: 'flag', name: 'Flag', nameEn: 'Flag', category: 'continuation',
    bias: direction === 1 ? 'bullish' : 'bearish', confidence: 70, geometryQuality: 70,
    status: 'forming', statusLabel: 'Flag', detectedAt: closedAt - 3 * timeframe, description: '',
    candleStartIndex: 42, structureEndIndex: 60, candleEndIndex: 63,
    levels: { entryPrice: 100, necklinePrice: 100, stopLossPrice: price(99.6), targetPrice: price(102.6) },
    potentialProfitPct: 0, potentialRiskPct: 0, riskRewardRatio: 0,
  };
  const formation = reassessRegularFormationQuality(candles, raw);
  assert.equal(formation.validation?.passed, true);
  return { formation, indicators: calculateRegularIndicatorValues(candles) };
}

function observedOi(indicators: RegularIndicatorValues, changePct: number, timestamp = closedAt) {
  return withAlignedRegularOI(indicators, { reason: 'available',
    snapshot: { timestamp, intervalMs: timeframe, amount: 100, usd: null, changePct } }, 'server');
}

test('the structural scale and supplementary coverage use fixed verified weights', () => {
  const total = (weights: Record<string, number>) => Object.values(weights).reduce((sum, value) => sum + value, 0);
  assert.equal(total(REGULAR_BASE_QUALITY_WEIGHTS), REGULAR_BASE_MAX);
  assert.equal(total(REGULAR_SUPPLEMENTARY_WEIGHTS), REGULAR_SUPPLEMENTARY_MAX);
  assert.equal('rvol' in REGULAR_SUPPLEMENTARY_WEIGHTS, false);
  const { formation, indicators } = fixture();
  const missing = scoreRegularFlowQuality(formation, indicators, 'binance', 'futures');
  const observed = scoreRegularFlowQuality(formation, observedOi(indicators, -.6), 'binance', 'futures');
  const m = missing.validation!.confluence!, o = observed.validation!.confluence!;
  assert.equal(m.total, o.total);
  assert.equal(m.grade, o.grade);
  assert.equal(o.supplementaryAvailable, m.supplementaryAvailable! + 5);
  assert.equal(o.components.openInterest?.score, 0);
  assert.equal(o.supplementaryPoints, m.supplementaryPoints);
});

test('a matching OI observation and trade flow support mirrored long and short signals', () => {
  for (const direction of [1, -1] as const) {
    const { formation, indicators } = fixture(direction);
    const produced = scoreRegularFlowQuality(formation, observedOi(indicators, 1.8), 'binance', 'futures');
    const read = produced.validation!.confluence!;
    assert.equal(read.components.delta?.score, 5);
    assert.equal(read.components.cvd20?.score, 3);
    assert.equal(read.components.openInterest?.score, 5);
    assert.equal(read.flow?.independentSupport, 2);
    assert.equal(read.flow?.entryConfirmedWithFlow, true);
    assert.equal(produced.validation?.passed, true);
    assert.deepEqual(produced.levels, formation.levels);
    assert.equal(scoreRegularFlowQuality(produced, indicators, 'binance', 'futures'), produced);
  }
});

test('unmatched OI cannot earn any score and correlated delta and CVD count once', () => {
  const { formation, indicators } = fixture();
  for (const timestamp of [closedAt - 2 * timeframe, closedAt + timeframe]) {
    const old = observedOi(indicators, 2.1, timestamp);
    assert.equal(old.oiAvailability, 'misaligned');
    const produced = scoreRegularFlowQuality(formation, old, 'binance', 'futures');
    const read = produced.validation!.confluence!;
    assert.equal(read.components.openInterest?.available, false);
    assert.equal(read.flow?.supportive, 2);
    assert.equal(read.flow?.independentAvailable, 1);
    assert.equal(read.flow?.independentSupport, 1);
    assert.equal(read.flow?.entryConfirmedWithFlow, false);
  }
  const mismatchedDirection = { ...indicators, candleContext: { ...indicators.candleContext!,
    previousClose: indicators.candleContext!.close + 1 } };
  const opposite = scoreRegularFlowQuality(formation, observedOi(mismatchedDirection, 2), 'binance', 'futures');
  assert.equal(opposite.validation?.confluence?.components.openInterest?.score, 0);
});

test('flow conflicts block the entry without changing the structural score or trade levels', () => {
  const { formation, indicators } = fixture();
  const weak = scoreRegularFlowQuality(formation, { ...indicators, deltaPct: -30 },
    'binance', 'futures');
  const strong = scoreRegularFlowQuality(formation, { ...indicators, deltaPct: -30, cvd20Pct: -8 },
    'binance', 'futures');
  assert.equal(weak.validation?.passed, true);
  assert.equal(strong.validation?.passed, false);
  assert.equal(strong.validation?.confirmed, true);
  assert.equal(strong.validation?.confluence?.flow?.entryBlockedByFlow, true);
  assert.equal(strong.validation?.confluence?.total, weak.validation?.confluence?.total);
  assert.deepEqual(strong.levels, weak.levels);
});

test('market provenance, neutral flow, and exact candle timestamps control coverage', () => {
  const { formation, indicators } = fixture();
  const bybit = scoreRegularFlowQuality(formation, indicators, 'bybit', 'futures');
  assert.equal(bybit.validation?.confluence?.components.delta?.available, false);
  const bybitVerified = scoreRegularFlowQuality(formation, { ...indicators, tradeFlowSource: 'bybit-trades' }, 'bybit', 'futures');
  assert.equal(bybitVerified.validation?.confluence?.components.delta?.score, 5);
  const spot = scoreRegularFlowQuality(formation, observedOi(indicators, 2), 'binance', 'spot');
  assert.equal(spot.validation?.confluence?.components.openInterest?.availability, 'notApplicable');
  const flat = scoreRegularFlowQuality(formation, { ...indicators, deltaPct: 0, cvd20Pct: 0 }, 'binance', 'futures');
  assert.equal(flat.validation?.confluence?.components.delta?.available, true);
  assert.equal(flat.validation?.confluence?.components.delta?.score, 0);
  const mild = scoreRegularFlowQuality(formation, { ...indicators, deltaPct: 4.5 }, 'binance', 'futures');
  assert.equal(mild.validation?.confluence?.components.delta?.score, 2);
  const old = scoreRegularFlowQuality(formation, { ...indicators, candleContext: {
    ...indicators.candleContext!, closedAt: closedAt - timeframe,
  } }, 'binance', 'futures');
  assert.equal(old.validation?.confluence?.components.delta?.availability, 'unavailable');
});

test('book coverage is visible and wrong-side liquidity does not earn a point', () => {
  const { formation, indicators } = fixture();
  const round = { detected: true, step: 10, level: 100, distancePct: .05, strength: 95, densityConfirmed: false };
  const revised = { ...formation, roundNumberContext: round };
  const unchecked = scoreRegularFlowQuality(revised, indicators, 'binance', 'futures');
  const checked = scoreRegularFlowQuality(revised, indicators, 'binance', 'futures', true);
  assert.equal(unchecked.validation?.confluence?.components.density?.available, false);
  assert.equal(checked.validation?.confluence?.components.density?.score, 0);
  assert.equal(checked.validation?.confluence?.components.density?.available, true);
  const wall = scoreRegularFlowQuality({ ...revised, roundNumberContext: { ...round,
    densityConfirmed: true, densityUsd: 25_000, side: 'BID' } }, indicators, 'binance', 'futures', true);
  const wrong = scoreRegularFlowQuality({ ...revised, roundNumberContext: { ...round,
    densityConfirmed: true, densityUsd: 25_000, side: 'ASK' } }, indicators, 'binance', 'futures', true);
  assert.equal(wall.validation?.confluence?.components.density?.score, 5);
  assert.equal(wrong.validation?.confluence?.components.density?.score, 0);
  assert.equal(wall.validation?.confluence?.total, checked.validation?.confluence?.total);
});

test('browser supplementation reuses the exact scan candle and makes no candle request', async () => {
  const { formation, indicators } = fixture();
  const lackingOi = { ...indicators, oiAvailability: 'network-error' as const };
  const original = scoreRegularFlowQuality(formation, lackingOi, 'binance', 'futures');
  const coin = { exchange: 'binance', marketType: 'futures', symbol: 'XAUUSDT', timeframe: '5m',
    regularIndicators: lackingOi, formations: [original],
  } as ScannedCoin;
  const fetchBefore = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (url: string) => {
    requests.push(url);
    return Response.json([3, 2, 1].map((_, i) => ({
      timestamp: closedAt - (2 - i) * timeframe, sumOpenInterest: (100 + i * 2).toString(),
    })));
  }) as typeof fetch;
  try {
    const revised = await hydrateMissingRegularOIFromBrowser([coin]);
    assert.equal(requests.length, 1);
    assert.match(requests[0], /openInterestHist/);
    assert.equal(revised[0].regularIndicators?.oiSource, 'browser');
    assert.equal(revised[0].formations[0].validation?.confluence?.components.openInterest?.score, 5);
    assert.equal(revised[0].formations[0].validation?.confluence?.total, original.validation?.confluence?.total);
    assert.deepEqual(revised[0].formations[0].levels, original.levels);
    assert.equal((await hydrateMissingRegularOIFromBrowser(revised)), revised);
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = fetchBefore;
  }
});

test('Bybit trade flow requires matching closed volume and turnover, with duplicate trade IDs ignored', () => {
  const start = 1700001000;
  const candles: Kline[] = Array.from({ length: 20 }, (_, index) => ({
    time: start + index * 60, open: 100, high: 100, low: 100, close: 100, volume: 10, quoteVolume: 1000,
  }));
  const full = new BybitFormationFlow();
  const gapped = new BybitFormationFlow();
  for (const [index, candle] of candles.entries()) {
    const buy = { id: `b-${index}`, price: 100, quantity: 7, time: candle.time * 1000 + 100, side: 'BUY' as const, isBuyerMaker: false };
    const sell = { id: `s-${index}`, price: 100, quantity: 3, time: candle.time * 1000 + 200, side: 'SELL' as const, isBuyerMaker: true };
    full.add(buy);
    full.add(buy);
    full.add(sell);
    gapped.add(buy);
    if (index !== 8) gapped.add(sell);
  }
  assert.deepEqual(full.calculate(candles, 60), {
    deltaPct: 40, deltaUsd: 400, cvd20Pct: 40, cvd20Usd: 8000, tradeFlowSource: 'bybit-trades',
  });
  assert.deepEqual(gapped.calculate(candles, 60), { deltaPct: 40, deltaUsd: 400, tradeFlowSource: 'bybit-trades' });
  const wrongVolume = candles.map((bar, i) => i === 19 ? { ...bar, volume: 12, buyQuoteVolume: 100 } : bar);
  assert.deepEqual(full.calculate(wrongVolume, 60), {});
  assert.deepEqual(full.calculate(candles, 86_400), {});
  const now = candles.at(-1)!.time * 1000;
  const stream = registerBybitFormationFlow('spot', 'XAUUSDT');
  stream.add({ id: 'isolated', price: 100, quantity: 10, side: 'BUY', isBuyerMaker: false, time: now + 1 });
  assert.equal(readBybitFormationFlow('futures', 'XAUUSDT', candles, 60).deltaPct, undefined);
  assert.equal(readBybitFormationFlow('spot', 'XAUUSDT', candles, 60).deltaPct, 100);
  stream.release();
  assert.deepEqual(readBybitFormationFlow('spot', 'XAUUSDT', candles, 60), {});
});
