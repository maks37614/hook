import type { ExchangeId, MarketType } from '../types';
export interface SmartAnalysisData {
  symbol: string; exchange: ExchangeId; marketType: MarketType; currentPrice: number; lastUpdated: number;
  score: number; verdict: 'BUY' | 'SELL' | 'NEUTRAL_WAIT'; verdictLabel: string; summary: string;
  trend: { rsi14: number; ema20: number; ema50: number; ema200: number | null; atr: number };
  volumeMetrics: { volume24hUsd: number | null; change24h: number | null };
  tradeScenario: { direction: 'long' | 'short'; entry: number; stopLoss: number; tp1: number; tp2: number; riskRewardRatio: number };
  levels: { pocEstimate: number | null; support: number; resistance: number };
  btcContext: { price: number; change24h: number; timeframes: Array<{ timeframe: string; direction: 'up' | 'down' | 'sideways' }> } | null;
  orderbook: { bidAskRatio: number; spreadPct: number; bestBid: number; bestAsk: number; bidWallPrice: number; bidWallUsd: number; askWallPrice: number; askWallUsd: number } | null;
  derivatives: {
    binanceOI: { currentUsd: number; change1hPct: number | null; history: number[] } | null;
    bybitOI: { currentUsd: number; change1hPct: number | null; history: number[] } | null;
    binanceFundingRate: number | null; bybitFundingRate: number | null;
  };
  unavailable: string[];
}
