import type { Kline } from '../../types';
import { CONTEXT_SECONDS } from './model';

export type Pivot = { i: number; time: number; price: number };
export type WickLine = { a: Pivot; b: Pivot; side: 'up' | 'down'; touches: Pivot[] };
export const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export function validBar(row: Kline): boolean {
  return !!row && Number.isSafeInteger(row.time) && row.time > 0
    && [row.open, row.high, row.low, row.close].every(v => Number.isFinite(v) && v > 0)
    && row.high >= Math.max(row.open, row.close) && row.low <= Math.min(row.open, row.close)
    && row.low <= row.high && Number.isFinite(row.volume) && row.volume >= 0;
}

/** Use only the contiguous, timestamp-correct tail inside the authorised 24h. */
export function boundedBars(input: readonly Kline[], seconds: number, at: number): Kline[] {
  const now = Math.floor(at / 1000), bucket = Math.floor(now / seconds) * seconds;
  const byTime = new Map<number, Kline>();
  for (const row of input) if (validBar(row) && row.time % seconds === 0
      && row.time >= now - CONTEXT_SECONDS && row.time <= bucket) byTime.set(row.time, row);
  const rows = [...byTime.values()].sort((a, b) => a.time - b.time);
  let start = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i].time - rows[i - 1].time !== seconds) start = i;
  return rows.slice(start, start + Math.ceil(CONTEXT_SECONDS / seconds) + 1);
}

export function atr(rows: readonly Kline[]): number {
  const ranges: number[] = [];
  for (let i = Math.max(1, rows.length - 24); i < rows.length; i++)
    ranges.push(Math.max(rows[i].high - rows[i].low,
      Math.abs(rows[i].high - rows[i - 1].close), Math.abs(rows[i].low - rows[i - 1].close)));
  return median(ranges);
}

/** Both right-hand confirmation bars must already be CLOSED at observation time. */
export function wickPivots(closed: readonly Kline[], side: 'up' | 'down'): Pivot[] {
  const found: Pivot[] = [];
  for (let i = 2; i < closed.length - 2; i++) {
    const value = side === 'up' ? closed[i].high : closed[i].low;
    if (!closed.slice(i - 2, i + 3).every((bar, offset) => {
      if (offset === 2) return true;
      const other = side === 'up' ? bar.high : bar.low;
      return side === 'up' ? (offset < 2 ? value >= other : value > other)
        : (offset < 2 ? value <= other : value < other);
    })) continue;
    if (found.length && i - found.at(-1)!.i < 3) continue;
    found.push({ i, time: closed[i].time, price: value });
  }
  return found;
}

export function linePrice(line: WickLine, time: number): number {
  return line.a.price + (line.b.price - line.a.price) * (time - line.a.time) / (line.b.time - line.a.time);
}

/** Exact wick anchors, never an averaged regression line. Bounded pair search. */
export function wickLines(rows: readonly Kline[], points: Pivot[], side: 'up' | 'down',
  volatility: number, minimumTouches: number): WickLine[] {
  const recent = points.slice(-12), result: WickLine[] = [];
  const tolerance = volatility * .22;
  for (let a = 0; a < recent.length; a++) for (let b = a + 1; b < recent.length; b++) {
    const first = recent[a], second = recent[b];
    if (second.i - first.i < (minimumTouches >= 3 ? 6 : 3)) continue;
    if (rows.length - second.i > 36) continue;
    if (side === 'up' ? second.price >= first.price : second.price <= first.price) continue;
    const line: WickLine = { a: first, b: second, side, touches: [] };
    let pierced = 0, broken = false;
    for (let i = first.i + 1; i < rows.length; i++) {
      const price = linePrice(line, rows[i].time);
      if (!(price > 0)) { broken = true; break; }
      if (side === 'up' ? rows[i].close > price + tolerance : rows[i].close < price - tolerance) {
        broken = true; break;
      }
      if (side === 'up' ? rows[i].high > price + volatility * .55 : rows[i].low < price - volatility * .55) pierced++;
    }
    if (broken || pierced > 2) continue;
    line.touches = recent.filter(p => p.i >= first.i && Math.abs(p.price - linePrice(line, p.time)) <= tolerance);
    if (line.touches.length >= minimumTouches) result.push(line);
  }
  return result.sort((a, b) => b.touches.length - a.touches.length).slice(0, 4);
}

export type TradingRange = { high: number; low: number; upperTouches: number; lowerTouches: number; start: number };
export function tradingRange(rows: readonly Kline[], volatility: number, minimum = 4): TradingRange | null {
  if (rows.length < minimum || !(volatility > 0)) return null;
  const sample = rows.slice(-Math.max(minimum, 8));
  const high = Math.max(...sample.map(b => b.high)), low = Math.min(...sample.map(b => b.low));
  if (high - low > volatility * 3.5 || high - low < volatility * .35) return null;
  const independent = (side: 'high' | 'low', price: number) => {
    let count = 0, last = -3;
    for (let i = 0; i < sample.length; i++) {
      if (i - last < 2 || Math.abs(sample[i][side] - price) > volatility * .25) continue;
      if (last >= 0 && !sample.slice(last + 1, i).some(b =>
        side === 'high' ? price - b.low >= volatility * .6 : b.high - price >= volatility * .6)) continue;
      last = i; count++;
    }
    return count;
  };
  const upperTouches = independent('high', high), lowerTouches = independent('low', low);
  return Math.max(upperTouches, lowerTouches) >= 2
    ? { high, low, upperTouches, lowerTouches, start: sample[0].time } : null;
}

/** Never aggregate a partial child bucket into a completed 1H / 4H candle. */
export function aggregateClosed(rows: readonly Kline[], seconds: number): Kline[] {
  const groups = new Map<number, Kline[]>();
  for (const row of rows) {
    const time = Math.floor(row.time / seconds) * seconds;
    const bucket = groups.get(time) || []; bucket.push(row); groups.set(time, bucket);
  }
  const result: Kline[] = [];
  for (const [time, bars] of groups) if (bars.length === seconds / 300 && bars[0].time === time
      && bars.at(-1)!.time + 300 === time + seconds)
    result.push({ time, open: bars[0].open, close: bars.at(-1)!.close,
      high: Math.max(...bars.map(b => b.high)), low: Math.min(...bars.map(b => b.low)),
      volume: bars.reduce((sum, b) => sum + b.volume, 0) });
  return result;
}
