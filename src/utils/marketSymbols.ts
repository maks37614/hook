import type { ExchangeId, MarketType } from '../types';

// Exchange APIs accept UTF-8 symbols. Preserve international asset names
// and combining marks while removing pair separators.
export function normalizeExchangeSymbol(symbol: string): string {
  return symbol.replace(/[^\p{L}\p{M}\p{N}]/gu, '').toUpperCase();
}

// TradingView identifiers must never replace symbols in exchange API calls.
// https://www.tradingview.com/symbols/LONGXIAUSDT.P/?exchange=BINANCE
// https://www.tradingview.com/symbols/BIANRENSHENGUSDT.P/markets/
const TRADINGVIEW_ALIASES: Readonly<Record<string, string>> = {
  'binance:futures:龙虾USDT': 'LONGXIAUSDT.P',
  'binance:futures:币安人生USDT': 'BIANRENSHENGUSDT.P',
  'binance:spot:币安人生USDT': 'BIANRENSHENGUSDT',
  'binance:spot:币安人生USDC': 'BIANRENSHENGUSDC',
  'binance:spot:币安人生USD1': 'BIANRENSHENGUSD1',
};

export function getTradingViewSymbol(
  symbol: string,
  exchange: ExchangeId,
  market: MarketType,
): string | null {
  const normalized = normalizeExchangeSymbol(symbol);
  const alias = TRADINGVIEW_ALIASES[`${exchange}:${market}:${normalized}`];
  if (alias) return `${exchange.toUpperCase()}:${alias}`;

  // Unknown international names use an exchange-data candlestick chart.
  if (!/^[A-Z0-9]+$/.test(normalized)) return null;
  return `${exchange.toUpperCase()}:${normalized}${market === 'futures' ? '.P' : ''}`;
}
