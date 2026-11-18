import type { Kline } from '../../types';
import type { MarketContext } from './model';
import { aggregateClosed, atr, clamp, linePrice, median, wickLines, wickPivots, type Pivot, type WickLine } from './geometry';

export type ContextSnapshot = {
  rows: Kline[];
  highs: Pivot[];
  lows: Pivot[];
  upperLines: WickLine[];
  lowerLines: WickLine[];
  upper: number;
  lower: number;
  volatility: number;
  tolerance: number;
  preDistancePct: number;
  pumpAt?: number;
  behavior: Record<'horizontal' | 'trendline', Record<'up' | 'down', { tests: number; failures: number }>>;
  context: MarketContext;
};

function direction(rows: Kline[]): MarketContext['h1'] {
  if (rows.length < 2) return 'unavailable';
  const sample = rows.slice(-6), change = sample.at(-1)!.close - sample[0].open;
  const noise = median(sample.map(b => b.high - b.low)) * .5;
  return Math.abs(change) <= noise ? 'flat' : change > 0 ? 'up' : 'down';
}

function regimeFor(rows: Kline[], volatility: number, pumpAt?: number): MarketContext['regime'] {
  const recent = rows.slice(-10), last = recent.at(-1)!;
  const movement = (last.close / recent[0].open - 1) * 100;
  const path = recent.slice(1).reduce((sum, b, i) => sum + Math.abs(b.close - recent[i].close), 0);
  const efficiency = path ? Math.abs(last.close - recent[0].close) / path : 0;
  const dump = last.close / Math.max(...recent.map(b => b.high)) <= .8;
  if (movement >= 40) return 'pump';
  if (dump) return 'dump';
  if (pumpAt !== undefined && last.time - pumpAt >= 30 * 60 && movement < 0) return 'post_pump';
  if (efficiency > .45 && Math.abs(last.close - recent[0].close) > volatility * 3) return movement > 0 ? 'up' : 'down';
  return efficiency < .13 && path > volatility * 12 ? 'chop' : 'range';
}

export function contextSnapshot(rows: Kline[]): ContextSnapshot | null {
  if (rows.length < 36) return null;
  const volatility = atr(rows);
  if (!(volatility > 0)) return null;
  const price = rows.at(-1)!.close, tolerance = volatility * .22;
  // The final completed candle may break a line. Fit only what preceded it.
  const geometry = rows.slice(0, -1);
  const highs = wickPivots(rows, 'up'), lows = wickPivots(rows, 'down');
  const referenceBefore = rows.at(-1)!.time - 30 * 60;
  const upper = Math.max(0, ...highs.filter(p => p.time <= referenceBefore).map(p => p.price));
  const lower = Math.min(Infinity, ...lows.filter(p => p.time <= referenceBefore).map(p => p.price));
  const recent = rows.slice(-10), movementPct = (recent.at(-1)!.close / recent[0].open - 1) * 100;
  const pumpTimes: number[] = [];
  let pumpAt: number | undefined;
  for (let i = 6; i < rows.length; i++) {
    const start = rows.slice(Math.max(0, i - 9), i - 4);
    if (start.some(b => rows[i].high / b.open >= 1.4)) { pumpAt = rows[i].time; pumpTimes.push(pumpAt); }
  }
  const regime = regimeFor(rows, volatility, pumpAt);

  // Count outcomes only after the response bars actually exist. These are
  // observations, never an estimated win probability. Only recent same-side
  // level events are used; no statistics from outside the 24h input.
  let priorTests = 0, priorFailures = 0;
  const seen = new Set<string>();
  const behavior = { horizontal: { up: { tests: 0, failures: 0 }, down: { tests: 0, failures: 0 } },
    trendline: { up: { tests: 0, failures: 0 }, down: { tests: 0, failures: 0 } } };
  const record = (kind: 'horizontal' | 'trendline', side: 'up' | 'down', start: number,
    priceAt: (time: number) => number) => {
    const end = Math.min(rows.length - 3, start + 36);
    for (let i = start; i < end; i++) {
      const thenVol = atr(rows.slice(0, i + 1)), level = priceAt(rows[i].time), buffer = thenVol * .22;
      if (!(level > 0) || !(thenVol > 0)) continue;
      if (!(side === 'up' ? rows[i].close > level + buffer : rows[i].close < level - buffer)) continue;
      const id = kind + ':' + side + ':' + rows[i].time;
      if (seen.has(id)) break;
      const prefix = rows.slice(0, i + 1), knownPump = pumpTimes.filter(time => time <= rows[i].time).at(-1);
      if (regimeFor(prefix, thenVol, knownPump) !== regime) break;
      seen.add(id); priorTests++; behavior[kind][side].tests++;
      const failed = rows.slice(i + 1, i + 4).some(b =>
        side === 'up' ? b.close < priceAt(b.time) - buffer : b.close > priceAt(b.time) + buffer);
      if (failed) { priorFailures++; behavior[kind][side].failures++; }
      break;
    }
  };
  for (const side of ['up', 'down'] as const) {
    const points = side === 'up' ? highs : lows;
    for (const p of points.slice(-10)) record('horizontal', side, p.i + 3, () => p.price);
    const recentPoints = points.slice(-6);
    for (let a = 0; a < recentPoints.length; a++) for (let b = a + 1; b < recentPoints.length; b++) {
      const second = recentPoints[b], prefix = rows.slice(0, second.i + 3);
      // Reconstruct each line only as it could have been known at that time.
      for (const line of wickLines(prefix, [recentPoints[a], second], side, atr(prefix), 2)) {
        record('trendline', side, second.i + 3, time => linePrice(line, time));
      }
    }
  }
  return {
    rows, highs, lows, upper, lower, volatility, tolerance,
    preDistancePct: clamp(volatility / price * 100 * 4, 2, 4), pumpAt, behavior,
    upperLines: wickLines(geometry, highs, 'up', volatility, 2),
    lowerLines: wickLines(geometry, lows, 'down', volatility, 2),
    context: { regime, coverageMinutes: (rows.at(-1)!.time + 300 - rows[0].time) / 60,
      volatilityPct: volatility / price * 100, movementPct,
      h1: direction(aggregateClosed(rows, 3600)), h4: direction(aggregateClosed(rows, 14_400)),
      dailyTrendAvailable: false, priorTests, priorFailures },
  };
}
