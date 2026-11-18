/** Pure visible-range Point Of Control computation for HookChart's candle-volume model.
 * Rendering and price-axis transforms are deliberately kept outside this cache.
 * Each chart owns one entry; a new immutable candle array or viewport invalidates it.
 */
export type PocCandle = Readonly<{ l: number; h: number; v: number }>;
export type AutoPocZone = Readonly<{ pLo: number; pHi: number; pMid: number }>;

export function calculateAutoPocZone(
  candles: readonly PocCandle[],
  start = 0,
  end = candles.length,
): AutoPocZone | null {
  if (end - start <= 4) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = start; i < end; i++) {
    const candle = candles[i];
    if (candle.l < lo) lo = candle.l;
    if (candle.h > hi) hi = candle.h;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
  const count = 48;
  const step = (hi - lo) / count;
  const bins = new Float64Array(count);
  for (let i = start; i < end; i++) {
    const candle = candles[i];
    const a = Math.max(0, Math.min(count - 1, Math.floor((candle.l - lo) / step)));
    const b = Math.max(a, Math.min(count - 1, Math.floor((candle.h - lo) / step)));
    const share = candle.v / Math.max(1, b - a + 1);
    for (let j = a; j <= b; j++) bins[j] += share;
  }
  let poc = 0;
  let max = 0;
  for (let i = 0; i < count; i++) {
    if (bins[i] > max) { max = bins[i]; poc = i; }
  }
  let z0 = poc;
  let z1 = poc;
  if (poc > 0 && bins[poc - 1] >= max * .72) z0--;
  if (poc < count - 1 && bins[poc + 1] >= max * .72) z1++;
  return { pLo: lo + z0 * step, pHi: lo + (z1 + 1) * step, pMid: lo + (poc + .5) * step };
}

export function createAutoPocZoneCache() {
  let cached: {
    candles: readonly PocCandle[];
    start: number;
    end: number;
    zone: AutoPocZone | null;
  } | null = null;
  return {
    get(candles: readonly PocCandle[], start: number, end: number): AutoPocZone | null {
      if (cached && cached.candles === candles && cached.start === start && cached.end === end)
        return cached.zone;
      const zone = calculateAutoPocZone(candles, start, end);
      cached = { candles, start, end, zone };
      return zone;
    },
  };
}
