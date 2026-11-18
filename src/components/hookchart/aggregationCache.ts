import type { Candle } from './engine';

// Keep exactly the same timeframe conversion and OHLCV aggregation rules
// as HookChart's previous full-array implementation.
const TF_MS: Record<string, number> = {
  '1s': 1000, '5s': 5000, '15s': 15000, '30s': 30_000, '1m': 60_000,
  '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
};

/**
 * Several higher timeframes evaluate the same immutable source-array change.
 * Cache the shared prefix comparison by old/new array identities, so 5m, 15m,
 * 1h, 4h do not each walk several thousand unchanged candle references.
 *
 * Both keys are weak; discarded histories and price ticks are collectible.
 * The input contract is the same immutable-array contract already required
 * by updateHookChartAggregation. A mutable in-place edit must be represented
 * by a fresh candle object/array.
 */
type PrefixCheck = { matched: number; mismatchAt: number | null };
const sharedPrefixChecks = new WeakMap<Candle[], WeakMap<Candle[], PrefixCheck>>();

export function haveSameCandlePrefix(old: Candle[], next: Candle[], prefixLength: number): boolean {
  if (!Number.isSafeInteger(prefixLength) || prefixLength < 0 ||
      prefixLength > old.length || prefixLength > next.length) return false;
  if (old === next || prefixLength === 0) return true;
  let comparisons = sharedPrefixChecks.get(old);
  if (!comparisons) {
    comparisons = new WeakMap<Candle[], PrefixCheck>();
    sharedPrefixChecks.set(old, comparisons);
  }
  const check = comparisons.get(next);
  if (check?.mismatchAt !== null && check?.mismatchAt !== undefined &&
      check.mismatchAt < prefixLength) return false;
  if (check && check.matched >= prefixLength) return true;
  const startingAt = check?.matched ?? 0;
  for (let i = startingAt; i < prefixLength; i++) {
    if (old[i] !== next[i]) {
      comparisons.set(next, { matched: i, mismatchAt: i });
      return false;
    }
  }
  comparisons.set(next, { matched: prefixLength, mismatchAt: null });
  return true;
}

export type AggregationCache = Readonly<{
  source: Candle[];
  sourceTf: string;
  targetTf: string;
  candles: Candle[];
}>;

function mergeCandle(current: Candle, next: Candle): Candle {
  return {
    ...current,
    h: Math.max(current.h, next.h),
    l: Math.min(current.l, next.l),
    c: next.c,
    v: current.v + (next.v || 0),
    n: current.n + (next.n || 0),
    tb: (current.tb || 0) + (next.tb || 0),
  };
}

/** Full, reference-equivalent aggregation. Used for resets and Replay. */
export function aggregateHookChartCandles(source: Candle[], sourceTf: string, targetTf: string): Candle[] {
  const sourceMs = TF_MS[sourceTf] || 0;
  const targetMs = TF_MS[targetTf] || 0;
  if (!source.length || !sourceMs || !targetMs || targetMs < sourceMs)
    return targetTf === sourceTf ? source : [];
  if (targetMs === sourceMs) return source;
  const out: Candle[] = [];
  let current: Candle | null = null;
  let bucket = -1;
  for (const candle of source) {
    const nextBucket = Math.floor(candle.t / targetMs) * targetMs;
    if (!current || nextBucket !== bucket) {
      if (current) out.push(current);
      bucket = nextBucket;
      current = { ...candle, t: nextBucket };
    } else {
      current.h = Math.max(current.h, candle.h);
      current.l = Math.min(current.l, candle.l);
      current.c = candle.c;
      current.v += candle.v || 0;
      current.n += candle.n || 0;
      current.tb = (current.tb || 0) + (candle.tb || 0);
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Live charts receive immutable candle arrays. Update at most the latest
 * aggregate after a last-bar replacement or append, preserving historical
 * aggregate identities. Validate *all* prefix references before fast-pathing:
 * restored history, revisions, rewinds or changed inputs must fully rebuild.
 */
export function updateHookChartAggregation(
  source: Candle[],
  sourceTf: string,
  targetTf: string,
  previous: AggregationCache | null = null,
): AggregationCache {
  const full = () => ({
    source, sourceTf, targetTf, candles: aggregateHookChartCandles(source, sourceTf, targetTf),
  });
  if (previous?.source === source && previous.sourceTf === sourceTf && previous.targetTf === targetTf)
    return previous;
  const sourceMs = TF_MS[sourceTf] || 0;
  const targetMs = TF_MS[targetTf] || 0;
  if (!source.length || !sourceMs || !targetMs || targetMs <= sourceMs ||
      !previous || previous.sourceTf !== sourceTf || previous.targetTf !== targetTf ||
      !previous.source.length || !previous.candles.length) return full();

  const old = previous.source;
  const append = source.length === old.length + 1;
  const replaceLast = source.length === old.length;
  if (!append && !replaceLast) return full();

  const prefixLength = replaceLast ? old.length - 1 : old.length;
  if (!haveSameCandlePrefix(old, source, prefixLength)) return full();

  const oldLast = old.at(-1)!;
  const newest = source.at(-1)!;
  if (replaceLast && newest === oldLast)
    return { source, sourceTf, targetTf, candles: previous.candles };
  if (!Number.isFinite(oldLast.t) || !Number.isFinite(newest.t)) return full();

  const oldBucket = Math.floor(oldLast.t / targetMs) * targetMs;
  const newBucket = Math.floor(newest.t / targetMs) * targetMs;
  if (previous.candles.at(-1)!.t !== oldBucket) return full();

  if (append && newest.t > oldLast.t && newBucket >= oldBucket) {
    const candles = newBucket === oldBucket
      ? [...previous.candles.slice(0, -1), mergeCandle(previous.candles.at(-1)!, newest)]
      : [...previous.candles, { ...newest, t: newBucket }];
    return { source, sourceTf, targetTf, candles };
  }

  if (replaceLast && newest.t === oldLast.t && newBucket === oldBucket) {
    // A modified current candle may reduce the old bucket's high or raise
    // its low. Rebuild only that bucket instead of trying to subtract OHLCV.
    let start = source.length - 1;
    while (start > 0 && Math.floor(source[start - 1].t / targetMs) * targetMs === newBucket)
      start--;
    const latest = aggregateHookChartCandles(source.slice(start), sourceTf, targetTf);
    if (latest.length !== 1 || latest[0].t !== newBucket) return full();
    return {
      source, sourceTf, targetTf,
      candles: [...previous.candles.slice(0, -1), latest[0]],
    };
  }
  return full();
}
