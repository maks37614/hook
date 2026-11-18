/** Only a recent, verified exchange value may survive a transient OI error.
 * Never convert a historical observation into a new timestamp or market quote.
 */
export interface ChartOiReading {
  valueUsd: number;
  amountCoins: number;
  change5mPct: number | null;
  lastUpdated: number;
}
export type ChartOiDisplay = { reading: ChartOiReading | null; stale: boolean };
export const CHART_OI_MAX_STALE_MS = 90_000;
export const CHART_OI_FRESH_MS = 65_000;

function isVerified(reading: ChartOiReading | null, now: number): reading is ChartOiReading {
  return !!reading && Number.isFinite(reading.valueUsd) && reading.valueUsd > 0 &&
    Number.isFinite(reading.amountCoins) && reading.amountCoins >= 0 &&
    Number.isFinite(reading.lastUpdated) && reading.lastUpdated > 0 &&
    reading.lastUpdated <= now + 2_000 && now - reading.lastUpdated <= CHART_OI_MAX_STALE_MS &&
    (reading.change5mPct === null || Number.isFinite(reading.change5mPct));
}

export function reconcileChartOi(
  previous: ChartOiReading | null, incoming: ChartOiReading | null, now = Date.now(),
): ChartOiDisplay {
  if (isVerified(incoming, now)) {
    return { reading: incoming, stale: now - incoming.lastUpdated > CHART_OI_FRESH_MS };
  }
  if (isVerified(previous, now)) return { reading: previous, stale: true };
  return { reading: null, stale: false };
}
