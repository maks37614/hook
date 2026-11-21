import type { Candle } from './marketAnalytics';
/** Use only a near-complete already-loaded 24h candle range; never extrapolate
 * a 1h/6h partial sample to a whole day or fetch additional market data.
 * Close×base-volume is a bounded approximation if the authoritative ticker's
 * 24h quote turnover is unavailable. Returns null for insufficient history.
 */
export function estimateDensity24hQuoteVolume(candles: readonly Candle[], now = Date.now()): number | null {
  if (candles.length < 20 || !Number.isFinite(now)) return null;
  const first = candles[0], last = candles[candles.length - 1];
  if (!Number.isFinite(first.t) || !Number.isFinite(last.t) || last.t > now + 60_000) return null;
  // Exclude daily+ candles: 24h turnover from one candle has no safe granularity.
  const period = last.t - candles[candles.length - 2].t;
  if (period <= 0 || period > 3_600_000 || !Number.isFinite(period)) return null;
  const start = now - 86_400_000;
  if (first.t > start + Math.min(period * 2, 900_000) || last.t < now - Math.max(period * 2, 900_000)) return null;
  let sum = 0;
  for (let i = candles.length - 1; i >= 0; i--) {
    const c = candles[i];
    if (c.t < start) break;
    if (!Number.isFinite(c.v) || c.v < 0 || !Number.isFinite(c.c) || c.c <= 0) return null;
    sum += c.v * c.c;
    if (!Number.isFinite(sum)) return null;
  }
  return sum > 0 ? sum : null;
}
