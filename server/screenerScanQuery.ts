import type { ExchangeId, MarketType, Timeframe } from '../src/types';
import { FORMATION_TIMEFRAMES } from './formationScanPlan';

export type ScreenerQuery = {
  exchange: 'all' | ExchangeId;
  marketType: 'all' | MarketType;
  timeframe: Timeframe;
  minVolumeUsd: number;
};

/** Validate before scheduling potentially expensive public formation scans.
 * Existing default filters and all legitimate numeric volumes stay unchanged. */
export function parseScreenerScanQuery(query: Record<string, unknown>): ScreenerQuery | null {
  const rawExchange = query.exchange === '' || query.exchange === undefined ? 'all' : query.exchange;
  const rawMarket = query.marketType === '' || query.marketType === undefined ? 'all' : query.marketType;
  const rawTimeframe = query.timeframe === '' || query.timeframe === undefined ? '1h' : query.timeframe;
  if ((rawExchange !== 'all' && rawExchange !== 'binance' && rawExchange !== 'bybit') ||
      (rawMarket !== 'all' && rawMarket !== 'spot' && rawMarket !== 'futures') ||
      typeof rawTimeframe !== 'string' ||
      !FORMATION_TIMEFRAMES.includes(rawTimeframe as Timeframe)) return null;
  const input = query.minVolume;
  const volume = input === undefined ? 50_000
    : typeof input === 'string' && input.trim() !== '' ? Number(input) : NaN;
  if (!Number.isFinite(volume) || volume < 0) return null;
  return {
    exchange: rawExchange, marketType: rawMarket, timeframe: rawTimeframe as Timeframe,
    minVolumeUsd: volume,
  };
}
