import type { Kline } from '../src/types';

/** Candle midpoint histogram; NOT an exchange trade-volume profile.
 * The caller must select and label the exact lookback period.
 */
// Calculate Volume POC (Point of Control)
export function calculatePOC(klines: Kline[]): { pocPrice: number | null; pocVolumePct: number | null } {
  const valid = klines.filter(bar => bar &&
    [bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) &&
    bar.high >= Math.max(bar.open, bar.close) &&
    bar.low > 0 && bar.low <= Math.min(bar.open, bar.close) &&
    bar.volume >= 0);
  if (valid.length < 10) return { pocPrice: null, pocVolumePct: null };

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  for (const k of valid) {
    if (k.low < minPrice) minPrice = k.low;
    if (k.high > maxPrice) maxPrice = k.high;
  }

  if (minPrice >= maxPrice || minPrice === Infinity) {
    return { pocPrice: null, pocVolumePct: null };
  }

  const BINS = 24;
  const binSize = (maxPrice - minPrice) / BINS;
  const bins = new Array(BINS).fill(0);
  let totalVol = 0;

  for (const k of valid) {
    const mid = (k.high + k.low + k.close) / 3;
    const binIdx = Math.min(Math.max(Math.floor((mid - minPrice) / binSize), 0), BINS - 1);
    bins[binIdx] += k.volume;
    totalVol += k.volume;
  }

  let maxBinIdx = 0;
  let maxBinVol = 0;
  bins.forEach((vol, idx) => {
    if (vol > maxBinVol) {
      maxBinVol = vol;
      maxBinIdx = idx;
    }
  });

  const pocPrice = minPrice + (maxBinIdx + 0.5) * binSize;
  if (totalVol <= 0 || maxBinVol <= 0) return { pocPrice: null, pocVolumePct: null };
  const pocVolumePct = Math.round((maxBinVol / totalVol) * 100);
  return {
    pocPrice: Number(pocPrice.toPrecision(6)),
    pocVolumePct,
  };
}

