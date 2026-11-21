import type { Kline, ScannedCoin, Timeframe } from '../types';

export const CANDLE_SECONDS: Record<Timeframe, number> = { '5s': 5, '30s': 30, '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };

function isFreshCollection(collectedAt: number, now: number): boolean {
  return Number.isFinite(collectedAt) && Number.isFinite(now)
    && collectedAt <= now && now - collectedAt <= 180_000;
}

export function hasFreshRegularFormationData(
  data: NonNullable<ScannedCoin['formationData']>, timeframe: Timeframe, now: number,
): boolean {
  const { collectedAt, lastClosedAt, contiguous } = data;
  const intervalMs = CANDLE_SECONDS[timeframe] * 1000;
  return contiguous === true && isFreshCollection(collectedAt, now)
    && lastClosedAt > 0 && lastClosedAt <= collectedAt && lastClosedAt % intervalMs === 0
    && now - lastClosedAt <= intervalMs + 90_000;
}

/** A successful cache read must not relabel old, gapped or invalid candles as a live signal. */
export function readRegularFormationCandles(
  klines: Kline[], timeframe: Timeframe, collectedAt: number, now = Date.now(), knownClosedBefore = collectedAt,
) {
  const seconds = CANDLE_SECONDS[timeframe];
  if (!isFreshCollection(collectedAt, now) || !Number.isFinite(knownClosedBefore)) return null;
  const closed = klines.filter(c => (c.time + seconds) * 1000 <= Math.min(now, collectedAt, knownClosedBefore));
  if (closed.length < 35) return null;
  if (closed.some((c, i) => ![c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite)
    || !Number.isInteger(c.time) || c.time <= 0 || c.time % seconds !== 0
    || Math.min(c.open, c.high, c.low, c.close) <= 0 || c.volume < 0
    || c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close) || c.high < c.low
    || (i > 0 && c.time !== closed[i - 1].time + seconds))) return null;
  const lastClosedAt = (closed[closed.length - 1].time + seconds) * 1000;
  const provenance = { collectedAt, lastClosedAt, contiguous: true as const };
  return hasFreshRegularFormationData(provenance, timeframe, now) ? { closed, provenance } : null;
}
