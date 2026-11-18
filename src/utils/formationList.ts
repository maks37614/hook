import type { DetectedFormation, ScannedCoin, ScreenerFilterState } from '../types';
import { DEFAULT_REGULAR_INDICATOR_FILTERS, matchesRegularIndicatorFilters, type RegularIndicatorFilters } from './regularFormationIndicators';

export interface FormationListItem {
  coin: ScannedCoin;
  formation: DetectedFormation;
}

export interface FormationGroup {
  key: string;
  coin: ScannedCoin;
  formations: DetectedFormation[];
}

/** Filter each formation separately; hidden patterns must not leak back into the grouped view. */
export function getVisibleFormations(
  coins: ScannedCoin[], filters: ScreenerFilterState,
  regularIndicators: RegularIndicatorFilters = DEFAULT_REGULAR_INDICATOR_FILTERS,
): FormationListItem[] {
  const items: FormationListItem[] = [];
  const search = filters.searchQuery.trim().toLowerCase();
  for (const coin of coins) {
    if (filters.exchange !== 'all' && coin.exchange !== filters.exchange) continue;
    if (filters.marketType !== 'all' && coin.marketType !== filters.marketType) continue;
    if (coin.timeframe !== filters.timeframe) continue;
    if (filters.minVolumeUsd > 0 && coin.volume24hUsd < filters.minVolumeUsd) continue;
    if (search && !coin.symbol.toLowerCase().includes(search) && !coin.baseAsset.toLowerCase().includes(search)) continue;
    for (const formation of coin.formations) {
      if (filters.category !== 'all' && formation.category !== filters.category) continue;
      if (filters.bias !== 'all' && formation.bias !== filters.bias) continue;
      if (filters.status !== 'all' && formation.status !== filters.status) continue;
      // ROUND matches the same proximity evidence shown on the formation card.
      if (filters.roundNumberOnly && formation.roundNumberContext?.detected !== true) continue;
      // A round number without order-book evidence is not a confirmed density.
      if (filters.densityConfirmedOnly && formation.roundNumberContext?.densityConfirmed !== true) continue;
      if (!matchesRegularIndicatorFilters(coin, formation, regularIndicators)) continue;
      items.push({ coin, formation });
    }
  }

  const direction = filters.sortOrder === 'asc' ? 1 : -1;
  const metric = (item: FormationListItem): number => {
    switch (filters.sortBy) {
      case 'volume': return item.coin.volume24hUsd;
      case 'priceChange': return Math.abs(item.coin.priceChange24h);
      case 'profitPotential': return item.formation.potentialProfitPct;
      default: return item.formation.validation?.confluence?.total ?? item.formation.confidence;
    }
  };
  items.sort((a, b) =>
    (metric(a) - metric(b)) * direction ||
    a.coin.exchange.localeCompare(b.coin.exchange) ||
    a.coin.marketType.localeCompare(b.coin.marketType) ||
    a.coin.symbol.localeCompare(b.coin.symbol) ||
    a.formation.id.localeCompare(b.formation.id)
  );
  return items;
}

/** Only offer coin-only search results when a matching market has no patterns.
 * A hidden formation (bias/category/status) must never be described as absent,
 * and a previous scan's exchange or timeframe must not leak into the results.
 */
export function getMatchingUnformedCoins(coins: ScannedCoin[], filters: ScreenerFilterState): ScannedCoin[] {
  const search = filters.searchQuery.trim().toLowerCase();
  if (!search || filters.category !== 'all' || filters.bias !== 'all' || filters.status !== 'all'
    || filters.densityConfirmedOnly || filters.roundNumberOnly) return [];
  return coins.filter(coin =>
    (filters.exchange === 'all' || coin.exchange === filters.exchange)
    && (filters.marketType === 'all' || coin.marketType === filters.marketType)
    && coin.timeframe === filters.timeframe
    && coin.volume24hUsd >= filters.minVolumeUsd
    && (coin.formations?.length ?? 0) === 0
    && (coin.symbol.toLowerCase().includes(search) || coin.baseAsset.toLowerCase().includes(search))
  );
}

/** One visual record per symbol, exchange, market and timeframe, retaining all distinct patterns. */
export function groupVisibleFormations(items: FormationListItem[]): FormationGroup[] {
  const groups = new Map<string, FormationGroup>();
  const seen = new Map<string, Set<string>>();
  for (const { coin, formation } of items) {
    const key = [coin.exchange, coin.marketType, coin.symbol, coin.timeframe].join('|');
    let group = groups.get(key);
    if (!group) {
      group = { key, coin, formations: [] };
      groups.set(key, group);
      seen.set(key, new Set());
    }
    const identity = formation.id || [
      formation.patternKey,
      formation.candleStartIndex ?? -1,
      formation.candleEndIndex ?? -1,
      formation.levels.entryPrice,
    ].join('|');
    if (seen.get(key)!.has(identity)) continue;
    seen.get(key)!.add(identity);
    group.formations.push(formation);
  }
  return Array.from(groups.values());
}
