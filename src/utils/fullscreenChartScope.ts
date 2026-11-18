import type { ExchangeId, Kline, MarketType } from '../types';
import { normalizeExchangeSymbol } from './marketSymbols';

export type FullscreenChartHistory = { scope: string; rows: Kline[] };

/** Chart data belongs to one exact exchange, market, instrument and interval. */
export function fullscreenChartHistoryScope(
  exchange: ExchangeId, market: MarketType, symbol: string, timeframe: string,
): string {
  return [exchange, market, normalizeExchangeSymbol(symbol), timeframe].join(':');
}

/** Never draw another market's candles while the next history is loading. */
export function scopedFullscreenChartKlines(
  snapshot: FullscreenChartHistory | null, activeScope: string,
): Kline[] {
  return snapshot?.scope === activeScope ? snapshot.rows : [];
}

export function sameFullscreenMarket(
  a: Pick<{ symbol: string; exchange: ExchangeId; marketType: MarketType }, 'symbol' | 'exchange' | 'marketType'>,
  b: Pick<{ symbol: string; exchange: ExchangeId; marketType: MarketType }, 'symbol' | 'exchange' | 'marketType'>,
): boolean {
  return a.exchange === b.exchange && a.marketType === b.marketType
    && normalizeExchangeSymbol(a.symbol) === normalizeExchangeSymbol(b.symbol);
}
