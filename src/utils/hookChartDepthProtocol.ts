import type { BookUpdate } from './binanceOrderBook';
import type { ExchangeId, MarketType } from '../types';
import { normalizeExchangeSymbol } from './marketSymbols';

export type ChartDepthStatus = 'connecting' | 'syncing' | 'live' | 'reconnecting' | 'unavailable' | 'disabled';
export type ChartDepthPacket = {
  scope: string;
  sampledAt: number;
  status: 'CONNECTING' | 'SYNCING' | 'LIVE' | 'STALE' | 'RESYNCING' | 'ERROR';
  update?: BookUpdate;
};

export const chartDepthScope = (exchange: ExchangeId, market: MarketType, symbol: string) =>
  `${exchange}:${market}:${normalizeExchangeSymbol(symbol)}`;
