import type { LiquidationHeatmapBin, LiquidationHeatmapPeriod, HeatmapCoords } from './liquidationHeatmap';

/**
 * A historical recurrence score, NOT future liquidation amounts, active
 * positions, exact stop levels, or calibrated probabilities.
 *
 * This intentionally creates NO new price levels: every suggested band must
 * have at least 3 distinct observed time buckets and >=5 reported events
 * at its actual 0.5% historical liquidation price range.
 */
export type HistoricalRecurrenceBand = {
  centerPrice: number;
  priceLow: number;
  priceHigh: number;
  dominantSide: 'LONG' | 'SHORT';
  /** 0–100 ranking relative to the strongest retained historical cluster. */
  relativeIntensity: number;
  observedEvents: number;
  distinctTimeBuckets: number;
  lastSeenAt: number;
};

const PRICE_STEP = 1.005;
const LOG_STEP = Math.log(PRICE_STEP);
const MAX_BANDS = 16;
const MIN_UNIQUE_WINDOWS = 3;
const MIN_EVENTS = 5;
const NEAR_PRICE_RATIO = 0.20;

type Bucket = {
  low: number; high: number;
  observedEvents: number; weightedVolume: number;
  longVolume: number; shortVolume: number;
  windows: Set<number>; lastSeenAt: number;
};

export function estimateHistoricalLiqRecurrence(
  bins: readonly LiquidationHeatmapBin[],
  period: LiquidationHeatmapPeriod,
  referencePrice: number,
  asOfMs: number,
): HistoricalRecurrenceBand[] {
  if (!bins.length || !Number.isFinite(referencePrice) || referencePrice <= 0 ||
      !Number.isFinite(asOfMs)) return [];
  const horizonMs = period === '24h' ? 86_400_000 : 7 * 86_400_000;
  const oldest = asOfMs - horizonMs;
  const grouped = new Map<number, Bucket>();
  for (const bin of bins) {
    if (!Number.isFinite(bin.time) || bin.time < oldest || bin.time > asOfMs ||
        !Number.isFinite(bin.price) || bin.price <= 0 ||
        !Number.isFinite(bin.usd) || bin.usd <= 0 ||
        !Number.isSafeInteger(bin.count) || bin.count <= 0 ||
        (bin.side !== 'LONG' && bin.side !== 'SHORT')) continue;
    // No extrapolated prices. The only allowed bands are verified price bins
    // derived from observed historical liquidation prices themselves.
    if (Math.abs(bin.price / referencePrice - 1) > NEAR_PRICE_RATIO) continue;
    const priceIndex = Math.floor(Math.log(bin.price) / LOG_STEP);
    if (!Number.isSafeInteger(priceIndex)) continue;
    let bucket = grouped.get(priceIndex);
    if (!bucket) {
      const low = PRICE_STEP ** priceIndex;
      bucket = {
        low, high: low * PRICE_STEP,
        observedEvents: 0, weightedVolume: 0,
        longVolume: 0, shortVolume: 0,
        windows: new Set<number>(), lastSeenAt: 0,
      };
      grouped.set(priceIndex, bucket);
    }
    const elapsed = Math.max(0, asOfMs - bin.time);
    const recencyWeight = Math.pow(0.5, elapsed / (horizonMs / 2));
    bucket.windows.add(bin.time);
    bucket.observedEvents += bin.count;
    // Relative rankings only: these historical USD aggregates are NOT
    // future liquidation USD amounts.
    const weighted = bin.usd * recencyWeight;
    bucket.weightedVolume += weighted;
    if (bin.side === 'LONG') bucket.longVolume += weighted;
    else bucket.shortVolume += weighted;
    bucket.lastSeenAt = Math.max(bucket.lastSeenAt, bin.time);
  }

  const candidates = [...grouped.values()]
    .filter(b => b.windows.size >= MIN_UNIQUE_WINDOWS &&
      b.observedEvents >= MIN_EVENTS && b.weightedVolume > 0);
  if (!candidates.length) return [];
  const max = Math.max(...candidates.map(b => b.weightedVolume));
  return candidates
    .map(bucket => ({
      centerPrice: Math.sqrt(bucket.low * bucket.high),
      priceLow: bucket.low,
      priceHigh: bucket.high,
      dominantSide: bucket.longVolume >= bucket.shortVolume ? 'LONG' as const : 'SHORT' as const,
      relativeIntensity: Math.max(1, Math.min(100,
        Math.round(100 * Math.log1p(bucket.weightedVolume) / Math.log1p(max)))),
      observedEvents: bucket.observedEvents,
      distinctTimeBuckets: bucket.windows.size,
      lastSeenAt: bucket.lastSeenAt,
      rawWeightedVolume: bucket.weightedVolume,
    }))
    .sort((a, b) => b.rawWeightedVolume - a.rawWeightedVolume)
    .slice(0, MAX_BANDS)
    .map(({rawWeightedVolume: _discard, ...band}) => band);
}

/**
 * CoinGlass-like horizontal *model* bands, explicitly distinguished from
 * actual time/price event rectangles. No monetary figures or probability
 * values are drawn on the bands. They only mark historical recurrence.
 *
 * Rendering is called inside the optional map branch and uses the exact
 * existing HookChart Y(price) scale. No new canvas, WS, REST or timer.
 */
export function paintHistoricalLiqRecurrence(
  q: CanvasRenderingContext2D,
  bands: readonly HistoricalRecurrenceBand[],
  g: Pick<HeatmapCoords, 'plotW' | 'plotH' | 'y'>,
) {
  if (!bands.length || g.plotW <= 0 || g.plotH <= 0) return;
  q.save();
  for (const band of [...bands].reverse()) {
    const y0 = g.y(band.priceHigh), y1 = g.y(band.priceLow);
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
    const top = Math.max(0, Math.min(y0, y1));
    const bottom = Math.min(g.plotH, Math.max(y0, y1));
    if (top >= bottom) continue;
    // Very thin price bins still get a visible 2px highlight, strictly
    // centered on the observed price; no invented price *center*.
    const height = Math.max(2, bottom - top);
    const center = (top + bottom) / 2;
    const drawTop = Math.max(0, center - height / 2);
    const drawBottom = Math.min(g.plotH, center + height / 2);
    if (drawTop >= drawBottom) continue;
    const intensity = band.relativeIntensity / 100;
    const gradient = q.createLinearGradient(0, 0, g.plotW, 0);
    gradient.addColorStop(0, 'rgba(58, 40, 125, 0.05)');
    gradient.addColorStop(0.20, 'rgba(84, 58, 160, 0.12)');
    gradient.addColorStop(0.58, `rgba(102, 76, 183, ${(0.10 + intensity * 0.14).toFixed(3)})`);
    gradient.addColorStop(0.91, `rgba(255, 195, 62, ${(0.12 + intensity * 0.37).toFixed(3)})`);
    gradient.addColorStop(1, `rgba(255, 226, 97, ${(0.14 + intensity * 0.46).toFixed(3)})`);
    q.fillStyle = gradient;
    q.fillRect(0, drawTop, g.plotW, drawBottom - drawTop);
  }
  q.restore();
}
