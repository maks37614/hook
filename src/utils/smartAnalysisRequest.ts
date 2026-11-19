import type { ScannedCoin, Timeframe } from '../types';
import { isValidExchangeSymbol, normalizeExchangeSymbol } from './marketSymbols';

type AnalysisInstrument = Pick<ScannedCoin, 'symbol' | 'exchange' | 'marketType' | 'timeframe'>;
const EXCHANGE_ANALYSIS_TIMEFRAMES = new Set<Timeframe>(['1m', '5m', '15m', '1h', '4h', '1d']);

/**
 * Build only parameters accepted by /api/market/smart-analysis.
 *
 * A Terminal chart can display 30s candles reconstructed from 1m data,
 * whereas remote Quant needs real closed exchange candles: use 1m for 30s.
 * Do not forward coin.currentPrice: the server intentionally calculates price
 * from verified closed candles, and a quote not yet loaded becomes a 400 error.
 * This is a pure formatter; it makes no extra HTTP requests or subscriptions.
 */
export function buildSmartAnalysisQuery(
  coin: AnalysisInstrument,
  selectedTimeframe?: Timeframe,
): URLSearchParams {
  const symbol = normalizeExchangeSymbol(coin.symbol || '');
  if (!isValidExchangeSymbol(symbol)) {
    throw new Error('Некоректний символ монети для розумного аналізу');
  }
  if (coin.exchange !== 'binance' && coin.exchange !== 'bybit') {
    throw new Error('Некоректна біржа для розумного аналізу');
  }
  if (coin.marketType !== 'spot' && coin.marketType !== 'futures') {
    throw new Error('Некоректний тип ринку для розумного аналізу');
  }
  const requestedTimeframe = selectedTimeframe || coin.timeframe || '1h';
  const analysisTimeframe: Timeframe = requestedTimeframe === '30s'
    ? '1m'
    : EXCHANGE_ANALYSIS_TIMEFRAMES.has(requestedTimeframe) ? requestedTimeframe : '1h';
  return new URLSearchParams({
    symbol, exchange: coin.exchange, marketType: coin.marketType, timeframe: analysisTimeframe,
  });
}
