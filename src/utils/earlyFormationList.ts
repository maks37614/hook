import type { ScannedCoin, ScreenerFilterState } from '../types';
import type { EarlyFormationCandidate, EarlyFormationStage } from './earlyFormations';

/** Keep standard filters untouched; early W/M gets its own independent settings. */
export function createEarlyModeFilters(standard: ScreenerFilterState): ScreenerFilterState {
  return { ...standard, category: 'all', status: 'all', densityConfirmedOnly: false, roundNumberOnly: false };
}

export type EarlyStageFilter = 'all' | EarlyFormationStage;

export interface EarlyFormationListItem {
  coin: ScannedCoin;
  candidate: EarlyFormationCandidate;
}

/** Locate the current version of an open setup; never reuse its old projected prices. */
export function findCurrentEarlyFormation(
  selected: EarlyFormationListItem,
  coins: ScannedCoin[],
): EarlyFormationListItem | null {
  const coin = coins.find(row => row.symbol === selected.coin.symbol
    && row.exchange === selected.coin.exchange
    && row.marketType === selected.coin.marketType
    && row.timeframe === selected.coin.timeframe);
  const candidate = coin?.earlyFormations?.find(row => row.id === selected.candidate.id);
  return coin && candidate ? { coin, candidate } : null;
}

export function getVisibleEarlyFormations(
  coins: ScannedCoin[], filters: ScreenerFilterState, stage: EarlyStageFilter = 'all',
): EarlyFormationListItem[] {
  const query = filters.searchQuery.trim().toLowerCase();
  const result: EarlyFormationListItem[] = [];
  if (filters.category !== 'all' && filters.category !== 'reversal') return result;
  if (filters.status !== 'all' && filters.status !== 'forming') return result;
  // Round-number and order-book evidence from regular formations cannot filter prospective W/M structures.
  if (filters.densityConfirmedOnly || filters.roundNumberOnly) return result;

  for (const coin of coins) {
    if (filters.exchange !== 'all' && coin.exchange !== filters.exchange) continue;
    if (filters.marketType !== 'all' && coin.marketType !== filters.marketType) continue;
    if (filters.timeframe !== coin.timeframe) continue;
    if (coin.volume24hUsd < filters.minVolumeUsd) continue;
    if (query && !coin.symbol.toLowerCase().includes(query) && !coin.baseAsset.toLowerCase().includes(query)) continue;
    for (const candidate of coin.earlyFormations || []) {
      if (stage !== 'all' && candidate.stage !== stage) continue;
      if (filters.status === 'forming' && candidate.stage !== 'forming') continue;
      if (filters.bias !== 'all' && candidate.bias !== filters.bias) continue;
      result.push({ coin, candidate });
    }
  }
  const sortValue = ({ coin, candidate }: EarlyFormationListItem) => {
    if (filters.sortBy === 'volume') return coin.volume24hUsd;
    if (filters.sortBy === 'priceChange') return Math.abs(coin.priceChange24h);
    if (filters.sortBy === 'profitPotential') return candidate.earlyRiskReward;
    // An ordering of stage is not a calibrated probability of success.
    return candidate.stage === 'forming' ? 2 : 1;
  };
  const direction = filters.sortOrder === 'asc' ? 1 : -1;
  return result.sort((a,b) => (sortValue(a)-sortValue(b))*direction ||
    a.coin.symbol.localeCompare(b.coin.symbol) || a.candidate.id.localeCompare(b.candidate.id));
}
