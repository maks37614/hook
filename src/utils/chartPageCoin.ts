import type { MarketCoin, ScannedCoin, Timeframe } from '../types';

/** A shared chart link should still open a working chart without a full-market formation scan. */
export function marketQuoteToChartCoin(quote: MarketCoin, timeframe: Timeframe): ScannedCoin {
  return {
    symbol: quote.symbol,
    baseAsset: quote.baseAsset,
    quoteAsset: quote.quoteAsset,
    exchange: quote.exchange,
    marketType: quote.marketType,
    currentPrice: quote.price,
    priceChange24h: quote.change24h,
    volume24hUsd: quote.volumeUsd,
    highPrice24h: quote.high24h,
    lowPrice24h: quote.low24h,
    high24h: quote.high24h,
    low24h: quote.low24h,
    timeframe,
    lastUpdated: Date.now(),
    formations: [],
    hasFormations: false,
    exchangeUrl: quote.exchangeUrl,
  };
}
