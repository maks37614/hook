import type { Candle } from './marketAnalytics';
import { haveSameCandlePrefix } from './aggregationCache';

export interface SupportResistanceLevel {
  kind: 'R' | 'S';
  p: number;
  t: number;
  prominence: number;
}

function confirmedPivots(rows: Candle[], tf: string): SupportResistanceLevel[] {
  const span = tf === '1m' || tf === '3m' ? 4 : tf === '5m' || tf === '15m' ? 5 : 6;
  const candidates: SupportResistanceLevel[] = [];
  for (let i = span; i + span < rows.length; i++) {
    const candle = rows[i];
    const before = rows.slice(i - span, i);
    const after = rows.slice(i + 1, i + span + 1);
    for (const kind of ['R', 'S'] as const) {
      const p = kind === 'R' ? candle.h : candle.l;
      if (!Number.isFinite(p) || p <= 0) continue;
      const pivot = kind === 'R'
        ? before.every(row => row.h < p) && after.every(row => row.h <= p)
        : before.every(row => row.l > p) && after.every(row => row.l >= p);
      if (!pivot) continue;
      let closesBeyond = 0;
      let broken = false;
      for (let j = i + 1; j < rows.length; j++) {
        closesBeyond = (kind === 'R' ? rows[j].c > p : rows[j].c < p) ? closesBeyond + 1 : 0;
        if (closesBeyond >= 2) { broken = true; break; }
      }
      if (!broken) {
        let total = 0;
        for (let j = i - span; j <= i + span; j++) total += rows[j].c;
        const average = total / (span * 2 + 1);
        candidates.push({ kind, p, t: candle.t, prominence: Math.abs(p - average) / Math.max(average, 1e-12) });
      }
    }
  }
  return candidates.sort((a, b) => b.prominence - a.prominence || b.t - a.t);
}

/** Forming candles can move price across a level. Only closed bars can confirm a pivot or break. */
export function createSupportResistanceCalculator(tf: string) {
  let previous: Candle[] | undefined;
  let candidates: SupportResistanceLevel[] = [];
  return (candles: Candle[]): SupportResistanceLevel[] => {
    const last = candles.at(-1);
    if (!last || !Number.isFinite(last.c) || last.c <= 0) return [];
    if (!previous || previous.length !== candles.length ||
        !haveSameCandlePrefix(previous, candles, candles.length - 1)) {
      candidates = confirmedPivots(candles.slice(-520, -1), tf);
    }
    previous = candles;

    const picked: SupportResistanceLevel[] = [];
    for (const level of candidates) {
      if (level.kind === 'R' ? level.p < last.c : level.p > last.c) continue;
      const sameSide = picked.filter(row => row.kind === level.kind);
      if (sameSide.length >= 3 || sameSide.some(row => Math.abs(row.p - level.p) / level.p < 0.0018)) continue;
      picked.push(level);
    }
    return picked;
  };
}
