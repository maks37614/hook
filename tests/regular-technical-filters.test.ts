import test from 'node:test';
import assert from 'node:assert/strict';
import type { DetectedFormation, Kline, ScannedCoin, ScreenerFilterState } from '../src/types';
import {
  calculateClosedRsi14, calculateRegularIndicatorValues,
  DEFAULT_REGULAR_INDICATOR_FILTERS, countActiveRegularIndicatorFilters,
  matchesRegularIndicatorFilters,
} from '../src/utils/regularFormationIndicators';
import { getVisibleFormations, groupVisibleFormations } from '../src/utils/formationList';

const bars = (closes: number[]): Kline[] => closes.map((close, i) => ({
  time: 1_700_000_000 + i * 900,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 100,
}));
const pattern = (id: string, volumeRatio: number, confirmed: boolean): DetectedFormation => ({
  id, patternKey: 'bear_flag', name: 'Ведмежий прапор', nameEn: 'Bear Flag',
  category: 'continuation', bias: 'bearish',
  confidence: 60, status: confirmed ? 'breakout' : 'forming',
  statusLabel: 'Тест',
  description: '',
  levels: { entryPrice: 100, stopLossPrice: 102, targetPrice: 96 },
  riskRewardRatio: 2, potentialProfitPct: 4, potentialRiskPct: 2,
  detectedAt: 1,
  validation: {
    passed: confirmed, confirmed, closedCandleOnly: true, lookAheadSafe: true,
    enoughData: true, finiteData: true, swingQuality: 60, equalExtremaTolerancePct: .2,
    atrPct: .75, breakoutConfirmed: confirmed,
    entryMode: confirmed ? 'BREAKOUT' : 'WAIT_BREAKOUT',
    entryPrice: 100, stopPrice: 102, targetPrice: 96, riskReward: 2,
    minRiskReward: 2, volumeRatio, volatilityPct: .75, nearbyLevelDistancePct: .5,
    filters: { volume: confirmed, volatility: true, nearbyLevel: true, structure: confirmed },
    rejectionReasons: [],
  },
});
const coin = (): ScannedCoin => ({
  symbol: 'TESTUSDT', baseAsset: 'TEST', quoteAsset: 'USDT',
  exchange: 'binance', marketType: 'futures', timeframe: '15m',
  currentPrice: 100, priceChange24h: 1, highPrice24h: 102, lowPrice24h: 99,
  volume24hUsd: 2_000_000,
  formations: [pattern('breakout', 1.6, true), pattern('forming', 4.3, false)],
  regularIndicators: { atrPct: 1.25, rsi14: 53 },
  exchangeUrl: '', lastUpdated: 1,
});
const standard: ScreenerFilterState = {
  exchange: 'binance', marketType: 'futures', timeframe: '15m',
  category: 'all', bias: 'all', status: 'all', minVolumeUsd: 0,
  densityConfirmedOnly: false, roundNumberOnly: false, searchQuery: '', sortBy: 'confidence', sortOrder: 'desc',
};

test('Wilder RSI14 handles flat, rising and falling prices without NaN', () => {
  assert.equal(calculateClosedRsi14(bars(Array.from({ length: 40 }, () => 100))), 50);
  assert.equal(calculateClosedRsi14(bars(Array.from({ length: 40 }, (_, i) => 50 + i))), 100);
  assert.equal(calculateClosedRsi14(bars(Array.from({ length: 40 }, (_, i) => 100 - i))), 0);
  assert.equal(calculateClosedRsi14(bars(Array.from({ length: 14 }, () => 100))), null);
  const bad = bars(Array.from({ length: 40 }, () => 100));
  bad[19].close = NaN;
  assert.equal(calculateClosedRsi14(bad), null);
});

test('RSI14 Wilder smoothing matches an independently published reference data series', () => {
  const prices = [44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,
    45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64,46.21];
  const actual = calculateClosedRsi14(bars(prices));
  assert.ok(actual !== null && actual > 60 && actual < 70, 'Wilder RSI must be finite and correctly smoothed');
});

test('ATR percent uses completed OHLC true ranges, and invalid candle histories do not pass', () => {
  const flat = bars(Array.from({ length: 35 }, () => 100));
  assert.deepEqual(calculateRegularIndicatorValues(flat), { atrPct: 2, atr: 2, rsi14: 50,
    candleContext: { previousClose: 100, close: 100, closedAt: 1700031500000 } });
  const shifted = bars(Array.from({ length: 35 }, (_, i) => 100 + i));
  assert.ok((calculateRegularIndicatorValues(shifted).atrPct ?? 0) > 0);
  const gaps = [...flat];
  gaps[10] = { ...gaps[10], time: gaps[9].time };
  assert.deepEqual(calculateRegularIndicatorValues(gaps), { atrPct: null, rsi14: null });
  assert.deepEqual(calculateRegularIndicatorValues(flat.filter((_, i) => i !== 10)), { atrPct: null, rsi14: null });
  const malformed = [...flat];
  malformed[20] = { ...malformed[20], high: 50 };
  assert.deepEqual(calculateRegularIndicatorValues(malformed), { atrPct: null, rsi14: null });
  assert.deepEqual(calculateRegularIndicatorValues(flat.slice(0, 14)), { atrPct: null, rsi14: null });
});

test('technical filter groups are independent and obey exact ATR/RSI inclusive boundaries', () => {
  const c = coin(), f = c.formations[0];
  assert.equal(countActiveRegularIndicatorFilters(DEFAULT_REGULAR_INDICATOR_FILTERS), 0);
  assert.equal(matchesRegularIndicatorFilters(c, f, DEFAULT_REGULAR_INDICATOR_FILTERS), true);
  assert.equal(matchesRegularIndicatorFilters(c, f, { ...DEFAULT_REGULAR_INDICATOR_FILTERS, atrBand: 'medium' }), true);
  assert.equal(matchesRegularIndicatorFilters(c, f, { ...DEFAULT_REGULAR_INDICATOR_FILTERS, atrBand: 'low' }), false);
  assert.equal(matchesRegularIndicatorFilters(c, f, { ...DEFAULT_REGULAR_INDICATOR_FILTERS, atrBand: 'high' }), false);
  assert.equal(matchesRegularIndicatorFilters(c, f, { ...DEFAULT_REGULAR_INDICATOR_FILTERS, rsiZone: 'neutral' }), true);
  assert.equal(matchesRegularIndicatorFilters(c, f, { ...DEFAULT_REGULAR_INDICATOR_FILTERS, rsiZone: 'bullish' }), false);
  c.regularIndicators = { atrPct: 0.5, rsi14: 30 };
  assert.equal(matchesRegularIndicatorFilters(c, f, { ...DEFAULT_REGULAR_INDICATOR_FILTERS, atrBand: 'medium', rsiZone: 'bearish' }), true);
  assert.equal(matchesRegularIndicatorFilters(c, f, { ...DEFAULT_REGULAR_INDICATOR_FILTERS, atrBand: 'low' }), false);
  c.regularIndicators = { atrPct: 3, rsi14: 70 };
  assert.equal(matchesRegularIndicatorFilters(c, f, { ...DEFAULT_REGULAR_INDICATOR_FILTERS, atrBand: 'veryHigh', rsiZone: 'overbought' }), true);
});

test('RVOL threshold checks the breakout candle and excludes unconfirmed setups even on high volume', () => {
  const c = coin();
  const technical = { ...DEFAULT_REGULAR_INDICATOR_FILTERS, minBreakoutRvol: 1.5 as const };
  const filtered = getVisibleFormations([c], standard, technical);
  assert.deepEqual(filtered.map(row => row.formation.id), ['breakout']);
  assert.equal(getVisibleFormations([c], standard, { ...technical, minBreakoutRvol: 2 }).length, 0);
  assert.equal(getVisibleFormations([c], standard).length, 2);
  assert.equal(groupVisibleFormations(filtered).length, 1);
});

test('finite RVOL marked unavailable cannot pass the breakout filter', () => {
  const c = coin();
  const f = c.formations[0];
  f.validation!.volumeAvailable = false;
  assert.equal(matchesRegularIndicatorFilters(c, f, { ...DEFAULT_REGULAR_INDICATOR_FILTERS, minBreakoutRvol: 1.5 }), false);
});

test('unavailable metrics fail closed only when their technical filter is active', () => {
  const c = coin();
  delete c.regularIndicators;
  assert.equal(getVisibleFormations([c], standard).length, 2);
  assert.equal(getVisibleFormations([c], standard, { ...DEFAULT_REGULAR_INDICATOR_FILTERS, atrBand: 'low' }).length, 0);
  assert.equal(getVisibleFormations([c], standard, { ...DEFAULT_REGULAR_INDICATOR_FILTERS, rsiZone: 'oversold' }).length, 0);
  assert.equal(getVisibleFormations([c], standard, { ...DEFAULT_REGULAR_INDICATOR_FILTERS, minBreakoutRvol: 1.5 }).length, 1);
  c.regularIndicators = { atrPct: NaN, rsi14: Infinity };
  assert.equal(getVisibleFormations([c], standard, { ...DEFAULT_REGULAR_INDICATOR_FILTERS, atrBand: 'high', rsiZone: 'overbought' }).length, 0);
});

test('ordinary category, status, direction, volume and grouping still work alongside indicators', () => {
  const c = coin();
  assert.equal(getVisibleFormations([c], { ...standard, status: 'forming' }).length, 1);
  assert.equal(getVisibleFormations([c], { ...standard, status: 'breakout' }).length, 1);
  assert.equal(getVisibleFormations([c], { ...standard, bias: 'bullish' }).length, 0);
  assert.equal(getVisibleFormations([c], { ...standard, category: 'reversal' }).length, 0);
  assert.equal(getVisibleFormations([c], { ...standard, minVolumeUsd: 3_000_000 }).length, 0);
  assert.equal(getVisibleFormations([c], { ...standard, searchQuery: 'other' }).length, 0);
  const settings = { ...DEFAULT_REGULAR_INDICATOR_FILTERS, atrBand: 'medium' as const, minBreakoutRvol: 1.5 as const };
  assert.equal(getVisibleFormations([c], standard, settings).length, 1);
  assert.equal(getVisibleFormations([c], standard).length, 2, 'unsetting technical controls restores normal view');
});
