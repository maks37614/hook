/**
 * The financial/market significance check (turnover + BID/ASK percentiles) is
 * done by densityOutlierThresholds before this function is invoked. In AUTO
 * and HYBRID, show only the strongest DISTINCT price levels that passed it.
 *
 * A single large liquidity cluster can span dozens of adjacent DOM ticks.
 * They remain separate exchange book levels, but highlighting every tick as
 * an independent opportunity is misleading and can flood notifications.
 * Keep the largest representative of nearby same-side levels; never add
 * quantities together or claim an individual trader placed the whole level.
 *
 * MANUAL retains its previous behavior: every user-qualified level is shown.
 * No extra exchange requests, subscriptions or per-owner DOM passes.
 */
export interface StandoutLevel {
  side: 'BID' | 'ASK';
  price: number;
  notionalUsd: number;
  distancePct: number;
}
export const AUTO_MAX_DISTINCT_LEVELS_PER_SIDE = 4;
export const AUTO_NEARBY_LEVEL_SEPARATION_PCT = 0.15;
export const AUTO_NEARBY_VIEW_DISTANCE_PCT = 3;
export const AUTO_RESERVED_NEARBY_PER_SIDE = 2;

export function selectStandoutLevels<T extends StandoutLevel>(
  qualified: readonly T[],
  mode: 'AUTO' | 'MANUAL' | 'HYBRID',
  midPrice: number,
): T[] {
  // Sort a copy: the original history/map iteration order is not a score.
  const ranked = [...qualified].sort((a, b) =>
    (b.notionalUsd - a.notionalUsd) ||
    (a.distancePct - b.distancePct) ||
    (a.price - b.price));

  if (mode === 'MANUAL') return ranked;
  if (!(midPrice > 0) || !Number.isFinite(midPrice)) return [];

  const selected: T[] = [];
  const ranks = (side: 'BID' | 'ASK') => ranked.filter(level =>
    level.side === side &&
    Number.isFinite(level.notionalUsd) && level.notionalUsd > 0 &&
    Number.isFinite(level.price) && level.price > 0);

  for (const side of ['BID', 'ASK'] as const) {
    const candidates = ranks(side);
    let picked = 0;
    const pickFrom = (pool: T[], limit: number) => {
      for (const level of pool) {
        if (picked >= limit) break;
        // A cluster of several adjacent ticks is one *highlighted region*.
        // Keep the strongest price level only; do NOT sum book quantities.
        if (selected.some(existing => existing.side === side &&
            Math.abs(existing.price - level.price) / midPrice * 100 <
              AUTO_NEARBY_LEVEL_SEPARATION_PCT)) continue;
        selected.push(level);
        picked++;
      }
    };

    // Preserve early-warning visibility within 1–3% of the market even when
    // the farthest observed book contains many much larger walls. Without
    // this reservation, the separate "within 3%" UI could become empty
    // despite genuinely unusual levels close enough to matter.
    pickFrom(candidates.filter(level => level.distancePct <= AUTO_NEARBY_VIEW_DISTANCE_PCT),
      AUTO_RESERVED_NEARBY_PER_SIDE);
    pickFrom(candidates, AUTO_MAX_DISTINCT_LEVELS_PER_SIDE);
  }

  return selected.sort((a, b) =>
    (b.notionalUsd - a.notionalUsd) ||
    (a.distancePct - b.distancePct) ||
    (a.price - b.price));
}
