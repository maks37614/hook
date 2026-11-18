import type { DetectedFormation, ExchangeId, Kline, MarketType, RegularIndicatorValues, ScannedCoin } from '../types';
import { calculateATR, normalizeKlineTimeMs } from './formationValidation';
import { hasAlignedRegularOI } from './regularOIHistory';

/** Read a quote turnover only when the provider actually supplied it. */
export function readQuoteTurnover(raw: unknown): number | undefined {
  if (typeof raw !== 'number' && (typeof raw !== 'string' || !raw.trim())) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function verifiedDelta(candle: Kline | undefined): { total: number; value: number } | undefined {
  const total = candle?.quoteVolume, buys = candle?.buyQuoteVolume;
  if (typeof total !== 'number' || typeof buys !== 'number' || !Number.isFinite(total)
    || !Number.isFinite(buys) || total < 0 || buys < 0 || buys > total * (1 + 1e-8)) return undefined;
  return { total, value: 2 * Math.min(total, buys) - total };
}

/** Binance's kline turnover and taker buys. The last bar and CVD have independent coverage. */
export function calculateBinanceQuoteTradeDelta(
  candles: Kline[],
): Pick<RegularIndicatorValues, 'deltaPct' | 'deltaUsd' | 'cvd20Pct' | 'cvd20Usd'> {
  const last = verifiedDelta(candles.at(-1));
  const delta = last && last.total > 0 ? {
    deltaPct: Number((last.value / last.total * 100).toFixed(2)), deltaUsd: Number(last.value.toFixed(2)),
  } : {};
  const selected = candles.slice(-20);
  if (selected.length !== 20) return delta;
  const interval = selected[1].time - selected[0].time;
  if (!Number.isFinite(interval) || interval <= 0) return delta;
  let sumTotal = 0, sumDelta = 0;
  for (let i = 0; i < selected.length; i++) {
    if (i && selected[i].time - selected[i - 1].time !== interval) return delta;
    const verified = verifiedDelta(selected[i]);
    if (!verified) return delta;
    sumTotal += verified.total;
    sumDelta += verified.value;
  }
  if (sumTotal <= 0) return delta;
  return {
    ...delta,
    cvd20Pct: Number((sumDelta / sumTotal * 100).toFixed(2)),
    cvd20Usd: Number(sumDelta.toFixed(2)),
  };
}


/** These settings belong only to the regular screener, never the early W/M mode. */
export interface RegularIndicatorFilters {
  atrBand: 'all' | 'low' | 'medium' | 'high' | 'veryHigh';
  /** Volume of the confirmed breakout candle versus its 20 prior closed candles. */
  minBreakoutRvol: 0 | 1 | 1.2 | 1.5 | 2;
  rsiZone: 'all' | 'oversold' | 'bearish' | 'neutral' | 'bullish' | 'overbought';
  oiChange: 'all' | 'rising' | 'falling' | 'stable';
  delta: 'all' | 'positive' | 'negative' | 'strongPositive' | 'strongNegative';
  cvd20: 'all' | 'positive' | 'negative';
}

export const DEFAULT_REGULAR_INDICATOR_FILTERS: Readonly<RegularIndicatorFilters> = Object.freeze({
  atrBand: 'all',
  minBreakoutRvol: 0,
  rsiZone: 'all',
  oiChange: 'all',
  delta: 'all',
  cvd20: 'all',
});

/** Wilder's RSI(14), computed exclusively from the already closed candle set. */
export function calculateClosedRsi14(candles: Kline[]): number | null {
  const period = 14;
  if (candles.length < period + 1 || !candles.every(c => Number.isFinite(c.close) && c.close > 0)) return null;
  let totalGain = 0;
  let totalLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    totalGain += Math.max(0, change);
    totalLoss += Math.max(0, -change);
  }
  let averageGain = totalGain / period;
  let averageLoss = totalLoss / period;
  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    averageGain = (averageGain * (period - 1) + Math.max(0, change)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(0, -change)) / period;
  }
  if (averageGain === 0 && averageLoss === 0) return 50;
  if (averageLoss === 0) return 100;
  if (averageGain === 0) return 0;
  const rsi = 100 - 100 / (1 + averageGain / averageLoss);
  return Number.isFinite(rsi) ? Math.max(0, Math.min(100, rsi)) : null;
}

/**
 * Only supply candles already confirmed closed by the market data pipeline.
 * Reject gapped / invalid datasets instead of displaying invented indicators.
 */
export function calculateRegularIndicatorValues(candles: Kline[]): RegularIndicatorValues {
  const missing: RegularIndicatorValues = { atrPct: null, rsi14: null };
  if (candles.length < 15) return missing;
  const interval = candles[1].time - candles[0].time;
  if (!Number.isFinite(interval) || interval <= 0 || !candles.every((c, i) =>
    Number.isFinite(c.time) && (!i || c.time - candles[i - 1].time === interval) &&
    [c.open, c.high, c.low, c.close].every(v => Number.isFinite(v) && v > 0) &&
    Number.isFinite(c.volume) && c.volume >= 0 &&
    c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close) &&
    c.high >= c.low)) return missing;
  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const atr = calculateATR(candles, 14);
  const closedAt = 2 * normalizeKlineTimeMs(last.time) - normalizeKlineTimeMs(previous.time);
  const flow = calculateBinanceQuoteTradeDelta(candles);
  return {
    atr: Number.isFinite(atr) ? atr : undefined,
    atrPct: Number.isFinite(atr) && atr >= 0 ? atr / last.close * 100 : null,
    rsi14: calculateClosedRsi14(candles),
    candleContext: { closedAt, previousClose: previous.close, close: last.close },
    ...flow,
    ...(flow.deltaPct !== undefined || flow.cvd20Pct !== undefined ? { tradeFlowSource: 'binance-klines' as const } : {}),
  };
}

export function countActiveRegularIndicatorFilters(filters: RegularIndicatorFilters): number {
  return Number(filters.atrBand !== 'all')
    + Number(filters.minBreakoutRvol > 0)
    + Number(filters.rsiZone !== 'all')
    + Number(filters.oiChange !== 'all')
    + Number(filters.delta !== 'all')
    + Number(filters.cvd20 !== 'all');
}

/** The same raw evidence is used for scoring, display and filters. */
export function readRegularFormationEvidence(
  indicators: RegularIndicatorValues | undefined, exchange: ExchangeId, marketType: MarketType,
  closedAt: number | undefined,
) {
  const candle = indicators?.candleContext;
  const aligned = closedAt === undefined || candle?.closedAt === closedAt;
  const expectedSource = exchange === 'binance' ? 'binance-klines' : 'bybit-trades';
  const flowAligned = aligned && !!candle && indicators?.tradeFlowSource === expectedSource;
  const read = (value: number | null | undefined, min: number, max = Infinity) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined;
  return {
    atrPct: aligned ? read(indicators?.atrPct, 0) : undefined,
    rsi14: aligned ? read(indicators?.rsi14, 0, 100) : undefined,
    oiChangePct: aligned && marketType === 'futures' && hasAlignedRegularOI(indicators)
      ? indicators?.oiChangePct : undefined,
    deltaPct: flowAligned ? read(indicators?.deltaPct, -100, 100) : undefined,
    cvd20Pct: flowAligned ? read(indicators?.cvd20Pct, -100, 100) : undefined,
  };
}

/** RVOL belongs to the breakout candle, not the latest candle in the scan. */
export function readRegularBreakoutRvol(validation: DetectedFormation['validation']): number | undefined {
  return validation?.breakoutConfirmed && validation.volumeAvailable !== false &&
    Number.isFinite(validation.volumeRatio) && validation.volumeRatio >= 0 ? validation.volumeRatio : undefined;
}

export function matchesRegularIndicatorFilters(
  coin: ScannedCoin, formation: DetectedFormation, filters: RegularIndicatorFilters,
): boolean {
  if (countActiveRegularIndicatorFilters(filters) === 0) return true;
  const indicators = readRegularFormationEvidence(coin.regularIndicators, coin.exchange, coin.marketType,
    formation.validation?.regularPlan?.closedAt);
  if (filters.atrBand !== 'all') {
    const atr = indicators.atrPct;
    if (atr === undefined) return false;
    if (filters.atrBand === 'low' && !(atr < 0.5)) return false;
    if (filters.atrBand === 'medium' && !(atr >= 0.5 && atr < 1.5)) return false;
    if (filters.atrBand === 'high' && !(atr >= 1.5 && atr < 3)) return false;
    if (filters.atrBand === 'veryHigh' && !(atr >= 3)) return false;
  }
  if (filters.rsiZone !== 'all') {
    const rsi = indicators.rsi14;
    if (rsi === undefined) return false;
    if (filters.rsiZone === 'oversold' && !(rsi < 30)) return false;
    if (filters.rsiZone === 'bearish' && !(rsi >= 30 && rsi < 45)) return false;
    if (filters.rsiZone === 'neutral' && !(rsi >= 45 && rsi < 55)) return false;
    if (filters.rsiZone === 'bullish' && !(rsi >= 55 && rsi < 70)) return false;
    if (filters.rsiZone === 'overbought' && !(rsi >= 70)) return false;
  }
  if (filters.oiChange !== 'all') {
    const oi = indicators.oiChangePct;
    if (oi === undefined) return false;
    if (filters.oiChange === 'rising' && oi < 1) return false;
    if (filters.oiChange === 'falling' && oi > -1) return false;
    if (filters.oiChange === 'stable' && Math.abs(oi) >= 1) return false;
  }
  if (filters.delta !== 'all') {
    const delta = indicators.deltaPct;
    if (delta === undefined) return false;
    if (filters.delta === 'positive' && delta <= 0) return false;
    if (filters.delta === 'negative' && delta >= 0) return false;
    if (filters.delta === 'strongPositive' && delta < 20) return false;
    if (filters.delta === 'strongNegative' && delta > -20) return false;
  }
  if (filters.cvd20 !== 'all') {
    const cvd = indicators.cvd20Pct;
    if (cvd === undefined) return false;
    if (filters.cvd20 === 'positive' && cvd <= 0) return false;
    if (filters.cvd20 === 'negative' && cvd >= 0) return false;
  }
  if (filters.minBreakoutRvol > 0) {
    const rvol = readRegularBreakoutRvol(formation.validation);
    if (rvol === undefined || rvol < filters.minBreakoutRvol) return false;
  }
  return true;
}
