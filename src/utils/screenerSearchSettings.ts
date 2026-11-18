import type {
  ExchangeId, MarketCoin, MarketType, ScreenerPresetFilter, ScreenerSearchConfig,
  ScreenerSearchPreset, ScreenerSortBy, SearchUserSettings, ScannedCoin,
} from '../types';
import { getCoinDistanceToHigh, getCoinDistanceToLow, getCoinVol5m } from './marketPresets';

export const MAX_SCREENER_SEARCH_PRESETS = 12;

export const SCREENER_SEARCH_SORT_OPTIONS: ReadonlyArray<{ value: ScreenerSortBy; label: string }> = [
  { value: 'volume', label: 'Обсяг 24г' },
  { value: 'priceChange', label: 'Зміна ціни 24г' },
  { value: 'price', label: 'Ціна' },
  { value: 'volatility', label: 'Волатильність' },
  { value: 'distanceToHigh', label: 'Відстань до максимуму' },
  { value: 'distanceToLow', label: 'Відстань до мінімуму' },
];

const presetFilters: ScreenerPresetFilter[] = ['all', 'active', 'top_gainers', 'top_losers', 'near_highs', 'near_lows'];
const sortKeys = new Set<ScreenerSortBy>(SCREENER_SEARCH_SORT_OPTIONS.map(option => option.value));

export const DEFAULT_SCREENER_SEARCH_CONFIG: ScreenerSearchConfig = {
  searchQuery: '',
  exchange: 'all',
  marketType: 'futures',
  maxVolumeUsd: 0,
  volumeMode: 'to',
  minVolatility5mPct: 0,
  minPriceUsd: 0,
  maxPriceUsd: 0,
  maxDistanceToHighPct: null,
  maxDistanceToLowPct: null,
  onlyWithFormations: false,
  minOpenInterestUsd: 0,
  fundingRateDirection: 'any',
  minFundingRateAbsPct: 0,
  minBreakoutRvol: 0,
  presetFilter: 'all',
  sortBy: 'volume',
  sortOrder: 'desc',
  secondarySortBy: 'none',
  secondarySortOrder: 'desc',
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function validSort(value: unknown): value is ScreenerSortBy {
  return typeof value === 'string' && sortKeys.has(value as ScreenerSortBy);
}

function nonNegativeNumber(value: unknown, fallback: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(0, value)) : fallback;
}

function optionalPercent(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value)) : fallback;
}

/** Avoid taking arbitrary, oversized or stale values from persisted profile JSON. */
export function normalizeScreenerSearchConfig(
  source: unknown,
  fallback: Partial<ScreenerSearchConfig> = DEFAULT_SCREENER_SEARCH_CONFIG,
): ScreenerSearchConfig {
  const raw = record(source);
  const base = { ...DEFAULT_SCREENER_SEARCH_CONFIG, ...fallback };
  const sortBy = validSort(raw.sortBy) ? raw.sortBy : base.sortBy;
  const secondarySortBy = validSort(raw.secondarySortBy) && raw.secondarySortBy !== sortBy
    ? raw.secondarySortBy : 'none';
  return {
    searchQuery: typeof raw.searchQuery === 'string' ? raw.searchQuery.slice(0, 80) : base.searchQuery,
    exchange: raw.exchange === 'all' || raw.exchange === 'binance' || raw.exchange === 'bybit'
      ? raw.exchange as 'all' | ExchangeId : base.exchange,
    marketType: raw.marketType === 'all' || raw.marketType === 'spot' || raw.marketType === 'futures'
      ? raw.marketType as 'all' | MarketType : base.marketType,
    maxVolumeUsd: typeof raw.maxVolumeUsd === 'number' && Number.isFinite(raw.maxVolumeUsd)
      ? Math.max(0, Math.min(1_000_000_000_000_000, raw.maxVolumeUsd)) : base.maxVolumeUsd,
    volumeMode: raw.volumeMode === 'from' || raw.volumeMode === 'to' ? raw.volumeMode : base.volumeMode,
    minVolatility5mPct: nonNegativeNumber(raw.minVolatility5mPct, base.minVolatility5mPct, 1000),
    minPriceUsd: nonNegativeNumber(raw.minPriceUsd, base.minPriceUsd, 1e12),
    maxPriceUsd: nonNegativeNumber(raw.maxPriceUsd, base.maxPriceUsd, 1e12),
    maxDistanceToHighPct: optionalPercent(raw.maxDistanceToHighPct, base.maxDistanceToHighPct),
    maxDistanceToLowPct: optionalPercent(raw.maxDistanceToLowPct, base.maxDistanceToLowPct),
    onlyWithFormations: typeof raw.onlyWithFormations === 'boolean' ? raw.onlyWithFormations : base.onlyWithFormations,
    minOpenInterestUsd: nonNegativeNumber(raw.minOpenInterestUsd, base.minOpenInterestUsd, 1e16),
    fundingRateDirection: raw.fundingRateDirection === 'positive' || raw.fundingRateDirection === 'negative'
      || raw.fundingRateDirection === 'any' ? raw.fundingRateDirection : base.fundingRateDirection,
    minFundingRateAbsPct: nonNegativeNumber(raw.minFundingRateAbsPct, base.minFundingRateAbsPct, 100),
    minBreakoutRvol: nonNegativeNumber(raw.minBreakoutRvol, base.minBreakoutRvol, 50),
    presetFilter: presetFilters.includes(raw.presetFilter as ScreenerPresetFilter)
      ? raw.presetFilter as ScreenerPresetFilter : base.presetFilter,
    sortBy,
    sortOrder: raw.sortOrder === 'asc' || raw.sortOrder === 'desc' ? raw.sortOrder : base.sortOrder,
    secondarySortBy,
    secondarySortOrder: raw.secondarySortOrder === 'asc' || raw.secondarySortOrder === 'desc'
      ? raw.secondarySortOrder : base.secondarySortOrder,
  };
}

export function normalizeScreenerSearchSettings(
  input: unknown,
  fallback: Partial<ScreenerSearchConfig> = DEFAULT_SCREENER_SEARCH_CONFIG,
): SearchUserSettings {
  const raw = record(input);
  const defaultConfig = normalizeScreenerSearchConfig(raw.defaultConfig, {
    ...DEFAULT_SCREENER_SEARCH_CONFIG, ...fallback,
    ...(presetFilters.includes(raw.presetFilter as ScreenerPresetFilter) ? { presetFilter: raw.presetFilter as ScreenerPresetFilter } : {}),
    ...(validSort(raw.sortBy) ? { sortBy: raw.sortBy } : {}),
    ...(raw.sortDirection === 'asc' || raw.sortDirection === 'desc' ? { sortOrder: raw.sortDirection } : {}),
  });
  const seen = new Set<string>();
  const presets: ScreenerSearchPreset[] = [];
  for (const item of Array.isArray(raw.presets) ? raw.presets.slice(0, MAX_SCREENER_SEARCH_PRESETS * 3) : []) {
    const value = record(item);
    const id = typeof value.id === 'string' ? value.id.slice(0, 80) : '';
    const name = typeof value.name === 'string' ? value.name.trim().slice(0, 40) : '';
    if (!id || !name || seen.has(id) || presets.length >= MAX_SCREENER_SEARCH_PRESETS) continue;
    seen.add(id);
    presets.push({ id, name, config: normalizeScreenerSearchConfig(value.config, defaultConfig) });
  }
  const defaultPresetId = typeof raw.defaultPresetId === 'string' && presets.some(x => x.id === raw.defaultPresetId)
    ? raw.defaultPresetId : null;
  return { defaultConfig, presets, defaultPresetId };
}

export function effectiveScreenerSearchConfig(
  input: unknown,
  fallback: Partial<ScreenerSearchConfig> = DEFAULT_SCREENER_SEARCH_CONFIG,
): ScreenerSearchConfig {
  const settings = normalizeScreenerSearchSettings(input, fallback);
  const preset = settings.presets?.find(item => item.id === settings.defaultPresetId);
  return preset?.config ?? settings.defaultConfig ?? normalizeScreenerSearchConfig(undefined, fallback);
}

function sortValue(coin: MarketCoin, field: ScreenerSortBy): number {
  switch (field) {
    case 'volume': return coin.volumeUsd;
    case 'priceChange': return coin.change24h;
    case 'price': return coin.price;
    case 'volatility': return getCoinVol5m(coin);
    case 'distanceToHigh': return getCoinDistanceToHigh(coin);
    case 'distanceToLow': return getCoinDistanceToLow(coin);
  }
}

/** Sort the already loaded Screener coin array; never starts exchange/network requests. */
export function compareScreenerSearchCoins(
  a: MarketCoin,
  b: MarketCoin,
  config: Pick<ScreenerSearchConfig, 'sortBy' | 'sortOrder' | 'secondarySortBy' | 'secondarySortOrder'>,
): number {
  const compare = (field: ScreenerSortBy, order: 'asc' | 'desc') => {
    const left = sortValue(a, field), right = sortValue(b, field);
    if (!Number.isFinite(left) && !Number.isFinite(right)) return 0;
    if (!Number.isFinite(left)) return 1;
    if (!Number.isFinite(right)) return -1;
    return order === 'asc' ? left - right : right - left;
  };
  const primary = compare(config.sortBy, config.sortOrder);
  if (primary !== 0) return primary;
  if (config.secondarySortBy !== 'none' && config.secondarySortBy !== config.sortBy) {
    const secondary = compare(config.secondarySortBy, config.secondarySortOrder);
    if (secondary !== 0) return secondary;
  }
  return a.symbol.localeCompare(b.symbol) || a.exchange.localeCompare(b.exchange)
    || a.marketType.localeCompare(b.marketType);
}

/**
 * Extra Screener-only filters. The scanner lookup is supplied by the existing
 * App state; this function neither fetches candles nor triggers another scan.
 * Missing OI, funding and validated breakout RVOL fail closed if their
 * corresponding filter is active (never interpreted as zero).
 */
export function matchesAdvancedScreenerFilters(
  coin: MarketCoin,
  config: Pick<ScreenerSearchConfig,
    'minVolatility5mPct' | 'minPriceUsd' | 'maxPriceUsd'
    | 'maxDistanceToHighPct' | 'maxDistanceToLowPct'
    | 'onlyWithFormations' | 'minOpenInterestUsd'
    | 'fundingRateDirection' | 'minFundingRateAbsPct' | 'minBreakoutRvol'>,
  scanned?: ScannedCoin,
): boolean {
  if (config.minVolatility5mPct > 0 && (!Number.isFinite(coin.volatility5mPct)
    || (coin.volatility5mPct ?? -1) < config.minVolatility5mPct)) return false;
  if (config.minPriceUsd > 0 && (!Number.isFinite(coin.price) || coin.price < config.minPriceUsd)) return false;
  if (config.maxPriceUsd > 0 && (!Number.isFinite(coin.price) || coin.price > config.maxPriceUsd)) return false;
  if (config.maxDistanceToHighPct !== null && (!Number.isFinite(coin.distanceToHighPct)
    || coin.distanceToHighPct < 0 || coin.distanceToHighPct > config.maxDistanceToHighPct)) return false;
  if (config.maxDistanceToLowPct !== null && (!Number.isFinite(coin.distanceToLowPct)
    || coin.distanceToLowPct < 0 || coin.distanceToLowPct > config.maxDistanceToLowPct)) return false;
  if (config.onlyWithFormations && !(scanned?.formations?.length)) return false;
  if (config.minOpenInterestUsd > 0 && (!Number.isFinite(coin.openInterestUsd)
    || (coin.openInterestUsd ?? 0) < config.minOpenInterestUsd)) return false;
  if (config.fundingRateDirection !== 'any' || config.minFundingRateAbsPct > 0) {
    const funding = coin.fundingRatePct;
    if (funding === undefined || !Number.isFinite(funding)) return false;
    if (config.fundingRateDirection === 'positive' && funding <= 0) return false;
    if (config.fundingRateDirection === 'negative' && funding >= 0) return false;
    if (config.minFundingRateAbsPct > 0 && Math.abs(funding) < config.minFundingRateAbsPct) return false;
  }
  if (config.minBreakoutRvol > 0 && !scanned?.formations?.some(formation =>
    formation.validation?.breakoutConfirmed === true
    && formation.validation?.closedCandleOnly === true
    && formation.validation?.lookAheadSafe === true
    && formation.validation?.finiteData === true
    && formation.validation?.enoughData === true
    && Number.isFinite(formation.validation.volumeRatio)
    && formation.validation.volumeRatio >= config.minBreakoutRvol)) return false;
  return true;
}
