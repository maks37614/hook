import type { MarketCoin } from '../types';

type ScreenerPreviewQuote = Pick<MarketCoin, 'price' | 'high24h' | 'low24h' | 'change24h'>;

const validPrice = (value: number): boolean => Number.isFinite(value) && value > 0;
const roundPct = (value: number): number => Number(value.toFixed(2));

/**
 * Informational 24h range preview shown when the Screener has no detected
 * formation for a coin. This is NOT a scanner-validated trading signal.
 * Always align Entry, TP, SL and percentages with the same side; do not
 * derive TP/SL returns from the unrelated 24h percentage change.
 */
export function screenerPreviewTradeLevels(coin: ScreenerPreviewQuote) {
  const entryPrice = coin.price;
  // If quote data disagree or the daily move is flat, open the actual
  // chart without inventing a 3% price target or a bullish/bearish prediction.
  if (!validPrice(entryPrice) || !Number.isFinite(coin.change24h) || coin.change24h === 0) return null;
  const high = coin.high24h;
  const low = coin.low24h;
  if (!validPrice(high) || !validPrice(low) || !(low < entryPrice && entryPrice < high)) return null;

  const bullish = coin.change24h > 0;
  const targetPrice = bullish ? high : low;
  const stopLossPrice = bullish ? low : high;
  const reward = bullish ? targetPrice - entryPrice : entryPrice - targetPrice;
  const risk = bullish ? entryPrice - stopLossPrice : stopLossPrice - entryPrice;
  if (!(reward > 0 && risk > 0)) return null;

  return {
    bias: bullish ? 'bullish' as const : 'bearish' as const,
    entryPrice,
    targetPrice,
    stopLossPrice,
    potentialProfitPct: roundPct(reward / entryPrice * 100),
    potentialRiskPct: roundPct(risk / entryPrice * 100),
    riskRewardRatio: roundPct(reward / risk),
  };
}
