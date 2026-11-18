/** Data-only volume profile; positioning is always calculated by HookChart.
 * Candles are immutable snapshots and may be replaced on each live tick.
 * Never reuse histograms across different snapshots: even the last candle's
 * OHLCV can change while its timestamp stays the same.
 */
export type ProfileCandle = Readonly<{ o: number; h: number; l: number; c: number; v: number }>;
export type ProfileBin = { buy: number; sell: number; total: number };
export type ProfileHistogram = {
  pLo: number; pHi: number; step: number;
  bins: ProfileBin[]; maxV: number; poc: number;
};

export function buildVolumeProfileHistogram(
  candles: readonly ProfileCandle[], first: number, last: number, binCount: number,
): ProfileHistogram | null {
  if (!candles.length || first < 0 || last >= candles.length || first > last ||
      !Number.isSafeInteger(binCount) || binCount < 1 || binCount > 256) return null;
  let pLo = Infinity, pHi = -Infinity;
  for (let i = first; i <= last; i++) {
    const candle = candles[i];
    if (candle.l < pLo) pLo = candle.l;
    if (candle.h > pHi) pHi = candle.h;
  }
  if (!Number.isFinite(pLo) || !Number.isFinite(pHi) || pHi <= pLo) return null;
  const step = (pHi - pLo) / binCount;
  const bins: ProfileBin[] = Array.from({ length: binCount }, () => ({ buy: 0, sell: 0, total: 0 }));
  for (let i = first; i <= last; i++) {
    const candle = candles[i];
    const low = Math.max(0, Math.min(binCount - 1, Math.floor((candle.l - pLo) / step)));
    const high = Math.max(low, Math.min(binCount - 1, Math.floor((candle.h - pLo) / step)));
    const share = candle.v / Math.max(1, high - low + 1);
    const isBuy = candle.c >= candle.o;
    for (let bin = low; bin <= high; bin++) {
      bins[bin].total += share;
      if (isBuy) bins[bin].buy += share;
      else bins[bin].sell += share;
    }
  }
  let maxV = 0, poc = 0;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i].total > maxV) { maxV = bins[i].total; poc = i; }
  }
  return { pLo, pHi, step, bins, maxV, poc };
}

/** Per-canvas bounded cache: one snapshot reference and at most eight ranges.
 * Scrolling and scale changes may reuse the bins but never their screen coordinates.
 * A replaced candle snapshot invalidates the whole cache immediately.
 */
export function createVolumeProfileHistogramCache(maxEntries = 8) {
  let snapshot: readonly ProfileCandle[] | null = null;
  const entries = new Map<string, ProfileHistogram | null>();
  let builds = 0;
  const capacity = Math.max(1, Math.min(32, Math.floor(maxEntries) || 8));
  return {
    get(candles: readonly ProfileCandle[], first: number, last: number, binCount: number) {
      if (snapshot !== candles) {
        snapshot = candles;
        entries.clear();
      }
      const key = first + ':' + last + ':' + binCount;
      if (entries.has(key)) {
        const existing = entries.get(key)!;
        // A small LRU retains the most recently interacted profile ranges.
        entries.delete(key);
        entries.set(key, existing);
        return existing;
      }
      builds++;
      const result = buildVolumeProfileHistogram(candles, first, last, binCount);
      entries.set(key, result);
      if (entries.size > capacity) entries.delete(entries.keys().next().value!);
      return result;
    },
    activeEntries: () => entries.size,
    calculations: () => builds,
  };
}
