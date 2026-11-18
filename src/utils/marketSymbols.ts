import type { ExchangeId, MarketType } from '../types';

// Exchange APIs accept UTF-8 symbols. Preserve international asset names
// and combining marks while removing pair separators.
export function normalizeExchangeSymbol(symbol: string): string {
  return symbol.replace(/[^\p{L}\p{M}\p{N}]/gu, '').toUpperCase();
}

/** Validate normalized exchange instruments, including UTF-8 pair names used by Binance. */
export function isValidExchangeSymbol(symbol: string): boolean {
  return /^[\p{L}\p{M}\p{N}]{3,30}$/u.test(symbol);
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


// Surveillance is currently wired to USDT ticker catalogs and USDT book/stream
// subscriptions. Resolve user-entered base assets against the selected market,
// rather than silently starting a worker for a non-existent symbol like "BTC".
export type SurveillanceSymbolError =
  | 'INVALID_SYMBOL' | 'UNSUPPORTED_QUOTE' | 'UNKNOWN_PAIR' | 'MARKET_UNAVAILABLE';

export type SurveillanceSymbolResolution =
  | { ok: true; symbol: string; baseAsset: string; quoteAsset: 'USDT'; verified: boolean }
  | { ok: false; code: SurveillanceSymbolError };

export function resolveSurveillanceSymbol(
  value: string,
  catalog: readonly { symbol: string; baseAsset: string; quoteAsset: string }[],
): SurveillanceSymbolResolution {
  const input = value.trim();
  // Unlike generic chart search, a watch input must not silently discard
  // arbitrary punctuation and turn a mistyped token into a tradeable pair.
  if (!input || !/^[\p{L}\p{M}\p{N}\s/_-]+$/u.test(input)) {
    return { ok: false, code: 'INVALID_SYMBOL' };
  }
  const cleaned = normalizeExchangeSymbol(input);
  if (!cleaned || cleaned === 'USDT') {
    return { ok: false, code: 'INVALID_SYMBOL' };
  }

  // The shared ticker feed only verifies USDT markets. Do not misinterpret an
  // explicitly entered USDC/BUSD/... pair as a new "base" plus USDT.
  if (['USDC', 'BUSD', 'FDUSD', 'USD1'].some(quote =>
    cleaned.length > quote.length && cleaned.endsWith(quote))) {
    return { ok: false, code: 'UNSUPPORTED_QUOTE' };
  }
  const explicitPair = cleaned.endsWith('USDT') && cleaned.length > 4;
  const target = explicitPair ? cleaned : `${cleaned}USDT`;
  if (!isValidExchangeSymbol(target)) return { ok: false, code: 'INVALID_SYMBOL' };

  const matched = catalog.find(item => item.symbol === target && item.quoteAsset === 'USDT');
  if (matched) {
    return { ok: true, symbol: matched.symbol, baseAsset: matched.baseAsset,
      quoteAsset: 'USDT', verified: true };
  }
  if (catalog.length) return { ok: false, code: 'UNKNOWN_PAIR' };
  // Preserve the existing pending-analysis behavior during temporary exchange
  // outages for users who explicitly supplied a complete USDT instrument.
  // Bare assets cannot be verified while the selected catalog is unavailable.
  if (!explicitPair) return { ok: false, code: 'MARKET_UNAVAILABLE' };
  return { ok: true, symbol: target, baseAsset: target.slice(0, -4),
    quoteAsset: 'USDT', verified: false };
}

/**
 * Search the selected exchange/market's verified USDT universe. Both BTC and
 * BTCUSDT match the exact BTCUSDT instrument; other base tickers support
 * prefix/substring discovery without guessing which pairs are listed.
 * Catalog order is already volume-ranked by the shared ticker feed.
 */
export function searchSurveillanceSymbols<T extends {
  symbol: string; baseAsset: string; quoteAsset: string;
}>(input: string, catalog: readonly T[], limit = 8): T[] {
  if (!input.trim() || !/^[\p{L}\p{M}\p{N}\s/_-]+$/u.test(input) || input.length > 40) return [];
  const query = normalizeExchangeSymbol(input);
  if (!query || !Number.isFinite(limit) || limit < 1) return [];
  const matches: Array<{ row: T; rank: number; order: number }> = [];
  for (let i = 0; i < catalog.length; i++) {
    const row = catalog[i];
    if (row.quoteAsset !== 'USDT' || !row.symbol.endsWith('USDT')) continue;
    const base = normalizeExchangeSymbol(row.baseAsset);
    const symbol = normalizeExchangeSymbol(row.symbol);
    let rank: number;
    if (base === query) rank = 0;
    else if (symbol === query) rank = 1;
    // A complete BTCUSDT query must not also suggest unrelated prefixes
    // such as 1000BTCUSDT just because they contain those characters.
    else if (query.endsWith('USDT')) continue;
    else if (base.startsWith(query)) rank = 2;
    else if (symbol.startsWith(query)) rank = 3;
    else if (base.includes(query)) rank = 4;
    else if (symbol.includes(query)) rank = 5;
    else continue;
    matches.push({ row, rank, order: i });
  }
  matches.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return matches.slice(0, Math.min(12, Math.trunc(limit))).map(m => m.row);
}

/** A pasted pair such as BTC/USDT or BTC-USDT must match BTCUSDT. */
export function matchesExchangeInstrumentSearch(symbol: string, baseAsset: string, search: string): boolean {
  const query = normalizeExchangeSymbol(search);
  if (!query) return true;
  return normalizeExchangeSymbol(symbol).includes(query) || normalizeExchangeSymbol(baseAsset).includes(query);
}

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
