import type { PriceAlert } from '../types';

/** Chart alert lines are scoped to the exact exchange, market and instrument.
 * A cross-market alert must never appear on the wrong chart. */
export function chartTelegramAlerts(
  alerts: PriceAlert[],
  symbol: string,
  exchange: string,
  marketType: string,
) {
  const clean = symbol.replace('/', '').trim().toUpperCase();
  return alerts
    .filter(item => item.symbol.replace('/', '').trim().toUpperCase() === clean &&
      item.exchange === exchange && item.marketType === marketType &&
      item.isActive && !item.triggered && Number.isFinite(item.targetPrice) && item.targetPrice > 0)
    .map(item => ({
      id: `${symbol}:telegram:${item.id}`,
      p: item.targetPrice,
      kind: 'level' as const,
      created: item.createdAt,
    }));
}

export function telegramIdFromChartMarker(markerId: string, symbol: string): string | null {
  const prefix = `${symbol}:telegram:`;
  return markerId.startsWith(prefix) && markerId.length > prefix.length
    ? markerId.slice(prefix.length) : null;
}

/** Price alerts are one-shot: trigger when the observed price reaches or
 * crosses the selected price, whichever side it is on at creation. */
export function alertConditionForPrice(target: number, current: number): 'gte' | 'lte' {
  return target >= current ? 'gte' : 'lte';
}
