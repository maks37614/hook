import type { Kline } from '../types';

export const DAY_SECONDS = 86_400;
// Only complete windows participate. Weights are renormalized for young listings.
// A bounded exchange history is deliberately never labelled ATH/ATL.
const WINDOWS = [[30, 10], [90, 15], [180, 20], [365, 20], [730, 15]] as const;
export interface LocationHistory {
  through: number;
  historyDays: number;
  ranges: { days: number; high: number; low: number; weight: number }[];
  atr: number;
  trend: 'bullish' | 'bearish' | 'mixed';
}
export interface MarketLocation {
  status: 'ready' | 'insufficient_history';
  score: number | null;
  zone: 'extreme_low' | 'low' | 'lower' | 'middle' | 'upper' | 'high' | 'extreme_high' | 'unknown';
  historyDays: number;
  through: number | null;
  ranges: { days: number; position: number }[];
  trend: 'bullish' | 'bearish' | 'mixed' | 'unknown';
  distanceHighATR: number | null;
  distanceLowATR: number | null;
}
const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Closed daily candles only; reject gaps, invalid OHLC, stale tails and duplicates. */
export function prepareLocationHistory(input: Kline[], now = Date.now()): LocationHistory | null {
  const today = Math.floor(now / 1000 / DAY_SECONDS) * DAY_SECONDS;
  const sorted = input.filter(c => c.time < today).slice().sort((a, b) => a.time - b.time);
  const tail = sorted.slice(-730);
  if (tail.length < 30 || tail.at(-1)!.time !== today - DAY_SECONDS) return null;
  for (let i = 0; i < tail.length; i++) {
    const c = tail[i];
    if (![c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite)
      || c.time % DAY_SECONDS !== 0 || c.low <= 0 || c.volume < 0
      || c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close)
      || (i > 0 && c.time - tail[i - 1].time !== DAY_SECONDS)) return null;
  }
  const ranges = WINDOWS.filter(([days]) => days <= tail.length).map(([days, weight]) => {
    const candles = tail.slice(-days);
    return { days, weight, high: Math.max(...candles.map(c => c.high)), low: Math.min(...candles.map(c => c.low)) };
  }).filter(r => r.high > r.low);
  if (!ranges.length) return null;
  // Wilder ATR(14) is context, never a directional input into location.
  const tr = tail.map((c, i) => Math.max(c.high - c.low,
    i ? Math.abs(c.high - tail[i - 1].close) : 0, i ? Math.abs(c.low - tail[i - 1].close) : 0));
  let atr = tr.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
  for (const value of tr.slice(14)) atr = (atr * 13 + value) / 14;
  const highs: number[] = [], lows: number[] = [];
  // Fractals require two subsequent closed candles: no unconfirmed pivot lookahead.
  const recent = tail.slice(-90);
  for (let i = 2; i < recent.length - 2; i++) {
    const neighbours = [recent[i - 2], recent[i - 1], recent[i + 1], recent[i + 2]];
    if (neighbours.every(c => c.high < recent[i].high)) highs.push(recent[i].high);
    if (neighbours.every(c => c.low > recent[i].low)) lows.push(recent[i].low);
  }
  let trend: LocationHistory['trend'] = 'mixed';
  if (highs.length >= 3 && lows.length >= 3) {
    const up = (v: number[]) => v.at(-1)! > v.at(-2)! && v.at(-2)! > v.at(-3)!;
    const down = (v: number[]) => v.at(-1)! < v.at(-2)! && v.at(-2)! < v.at(-3)!;
    if (up(highs) && up(lows)) trend = 'bullish';
    if (down(highs) && down(lows)) trend = 'bearish';
  }
  return { through: tail.at(-1)!.time + DAY_SECONDS, historyDays: tail.length, ranges, atr, trend };
}

export function classifyMarketLocation(price: number, history: LocationHistory | null, now = Date.now()): {
  isNearHigh: boolean; isNearLow: boolean; location: MarketLocation;
} {
  const unknown = { isNearHigh: false, isNearLow: false, location: {
    status: 'insufficient_history', score: null, zone: 'unknown', historyDays: 0,
    through: null, ranges: [], trend: 'unknown', distanceHighATR: null, distanceLowATR: null,
  } as MarketLocation };
  if (!Number.isFinite(price) || price <= 0 || !history || !history.ranges.length
    || now / 1000 - history.through > 36 * 3600 || history.through > now / 1000) return unknown;
  const ranges = history.ranges.map(r => ({ days: r.days, position: clamp((price - r.low) / (r.high - r.low) * 100) }));
  const weight = history.ranges.reduce((sum, r) => sum + r.weight, 0);
  const score = ranges.reduce((sum, r, i) => sum + r.position * history.ranges[i].weight, 0) / weight;
  const zone = score >= 90 ? 'extreme_high' : score >= 75 ? 'high' : score >= 60 ? 'upper'
    : score >= 40 ? 'middle' : score > 25 ? 'lower' : score > 10 ? 'low' : 'extreme_low';
  const reference = history.ranges.at(-1)!;
  return {
    isNearHigh: score >= 75,
    isNearLow: score <= 25,
    location: { status: 'ready', score, zone, historyDays: history.historyDays, through: history.through,
      ranges, trend: history.trend,
      // Signed distances distinguish a breakout from a test of an existing bound.
      distanceHighATR: history.atr > 0 ? (reference.high - price) / history.atr : null,
      distanceLowATR: history.atr > 0 ? (price - reference.low) / history.atr : null },
  };
}
