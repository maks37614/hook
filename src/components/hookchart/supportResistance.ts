import type { Candle } from './marketAnalytics';

export interface SupportResistanceLevel {
  kind: 'R' | 'S';
  p: number;
  t: number;
  prominence: number;
}

// Use confirmed pivots at exact wick prices. The latest, still forming candle
// cannot confirm a pivot or a break. Broken levels are not automatically flipped.
export function supportResistanceLevels(candles: Candle[], tf: string): SupportResistanceLevel[] {
  const rows = candles.slice(-520);
  const span = tf === '1m' || tf === '3m' ? 4 : tf === '5m' || tf === '15m' ? 5 : 6;
  const last = rows.at(-1);
  if (!last || !Number.isFinite(last.c) || last.c <= 0) return [];
  const candidates: SupportResistanceLevel[] = [];
  for (let i = span; i + span < rows.length - 1; i++) {
    const candle = rows[i];
    const before = rows.slice(i - span, i);
    const after = rows.slice(i + 1, i + span + 1);
    const average = [...before, candle, ...after].reduce((sum, row) => sum + row.c, 0) / (span * 2 + 1);
    for (const kind of ['R', 'S'] as const) {
      const p = kind === 'R' ? candle.h : candle.l;
      if (!Number.isFinite(p) || p <= 0) continue;
      const pivot = kind === 'R'
        ? before.every(row => row.h < p) && after.every(row => row.h <= p)
        : before.every(row => row.l > p) && after.every(row => row.l >= p);
      if (!pivot || (kind === 'R' ? p < last.c : p > last.c)) continue;
      let closesBeyond = 0;
      let broken = false;
      for (let j = i + 1; j < rows.length - 1; j++) {
        closesBeyond = (kind === 'R' ? rows[j].c > p : rows[j].c < p) ? closesBeyond + 1 : 0;
        if (closesBeyond >= 2) { broken = true; break; }
      }
      if (!broken) candidates.push({ kind, p, t: candle.t, prominence: Math.abs(p - average) / Math.max(average, 1e-12) });
    }
  }
  const picked: SupportResistanceLevel[] = [];
  for (const level of candidates.sort((a, b) => b.prominence - a.prominence || b.t - a.t)) {
    const sameSide = picked.filter(row => row.kind === level.kind);
    if (sameSide.length >= 3 || sameSide.some(row => Math.abs(row.p - level.p) / level.p < 0.0018)) continue;
    picked.push(level);
  }
  return picked;
}
