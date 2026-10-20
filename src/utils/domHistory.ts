import type { DomTrade, DomClusterColumn, DomClusterLevel } from './domOrderBook';
import { formatDomPrice, validTrade } from './domOrderBook';
import type { Timeframe } from '../types';

export const DOM_TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000, '5m': 300_000, '15m': 900_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
};

export type HistoricalFootprint = DomClusterColumn & {
  complete: boolean;
  tradeCount: number;
};

export function priceBucketStep(high: number, low: number, tick: number): number {
  if (!(Number.isFinite(tick) && tick > 0)) throw new RangeError('Tick size unavailable');
  const spread = Number.isFinite(high) && Number.isFinite(low) ? Math.max(0, high - low) : 0;
  return tick * Math.max(1, Math.ceil(spread / tick / 16));
}

/** Each server page carries consecutive execution IDs, without overlap.
 *  Accumulated footprint data is independent of the number of individual trades kept in the tape.
 */
export function appendHistoricalFootprint(
  previous: HistoricalFootprint,
  executions: DomTrade[],
  step: number,
  tick: number,
  complete: boolean,
): HistoricalFootprint {
  if (!(Number.isFinite(step) && step > 0)) throw new RangeError('Invalid footprint aggregation step');
  const levels: Record<number, DomClusterLevel> = { ...previous.levels };
  let totalVolume = previous.totalVolume;
  let tradeCount = previous.tradeCount;
  for (const trade of executions) {
    if (!validTrade(trade)) continue;
    const units = Math.floor(Math.round(trade.price / tick) / Math.max(1, Math.round(step / tick)));
    const price = Number(formatDomPrice(units * step, tick).replaceAll(',', ''));
    const level = levels[price] || {
      price, buyVol: 0, sellVol: 0, totalVol: 0, isPOC: false,
    };
    const updated = { ...level, isPOC: false };
    if (trade.isBuyerMaker) updated.sellVol += trade.volumeUsd;
    else updated.buyVol += trade.volumeUsd;
    updated.totalVol += trade.volumeUsd;
    levels[price] = updated;
    totalVolume += trade.volumeUsd;
    tradeCount++;
  }
  let pocPrice = 0;
  let maxLevelVol = 0;
  for (const level of Object.values(levels)) {
    level.isPOC = false;
    if (level.totalVol > maxLevelVol) {
      maxLevelVol = level.totalVol;
      pocPrice = level.price;
    }
  }
  if (levels[pocPrice]) levels[pocPrice].isPOC = true;
  return {
    ...previous, levels, totalVolume, pocPrice,
    maxLevelVol, tradeCount, complete,
  };
}

export function emptyHistoricalFootprint(candleTime: number): HistoricalFootprint {
  const date = new Date(candleTime * 1000);
  return {
    candleTime,
    label: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
    levels: {}, totalVolume: 0, pocPrice: 0, maxLevelVol: 0,
    tradeCount: 0, complete: false,
  };
}
