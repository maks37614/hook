import { ExchangeId, MarketType, ScannedCoin, type Timeframe } from '../types';

export interface CoinIdentifier {
  symbol: string;
  exchange?: ExchangeId | string;
  marketType?: MarketType | string;
}

/**
 * Returns a standardized, unique key for a coin: `${exchange}:${marketType}:${symbol}`
 * e.g. "bybit:futures:BTCUSDT", "binance:futures:BTCUSDT", "binance:spot:ETHUSDT"
 */
export function getCoinWatchlistKey(coin: CoinIdentifier | string): string {
  if (typeof coin === 'string') {
    const trimmed = coin.trim();
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      if (parts.length >= 3) {
        return `${parts[0].toLowerCase()}:${parts[1].toLowerCase()}:${parts.slice(2).join(':').toUpperCase()}`;
      }
      if (parts.length === 2) {
        return `${parts[0].toLowerCase()}:futures:${parts[1].toUpperCase()}`;
      }
    }
    // Default legacy symbol to binance:futures
    return `binance:futures:${trimmed.toUpperCase()}`;
  }

  const ex = (coin.exchange || 'binance').toLowerCase().trim();
  const mt = (coin.marketType || 'futures').toLowerCase().trim();
  const sym = coin.symbol.toUpperCase().trim();
  return `${ex}:${mt}:${sym}`;
}

/**
 * Parses a standardized watchlist key back into its component parts:
 * exchange, marketType, and symbol.
 */
export function parseWatchlistKey(key: string): { exchange: ExchangeId; marketType: MarketType; symbol: string } {
  const parts = key.trim().split(':');
  if (parts.length >= 3) {
    return {
      exchange: (parts[0].toLowerCase() === 'bybit' ? 'bybit' : 'binance') as ExchangeId,
      marketType: (parts[1].toLowerCase() === 'spot' ? 'spot' : 'futures') as MarketType,
      symbol: parts.slice(2).join(':').toUpperCase(),
    };
  }
  if (parts.length === 2) {
    return {
      exchange: (parts[0].toLowerCase() === 'bybit' ? 'bybit' : 'binance') as ExchangeId,
      marketType: 'futures',
      symbol: parts[1].toUpperCase(),
    };
  }
  return {
    exchange: 'binance',
    marketType: 'futures',
    symbol: key.toUpperCase(),
  };
}

/**
 * Checks whether a given coin matches any item in the watchlist.
 * Guarantees that adding a coin on one exchange (e.g. Bybit) does NOT
 * falsely match or add the coin on another exchange (e.g. Binance).
 */
export function isCoinInWatchlist(
  watchlist: string[] | undefined,
  coin: CoinIdentifier | string
): boolean {
  if (!watchlist || !Array.isArray(watchlist) || watchlist.length === 0) return false;

  const targetKey = getCoinWatchlistKey(coin);
  // Legacy plain-symbol entries are treated as historical Binance Futures
  // entries. Never mark a Bybit (or Spot) coin as saved merely because
  // another exchange has the same ticker.
  if (watchlist.some((item) => getCoinWatchlistKey(item) === targetKey)) return true;

  if (typeof coin !== 'string') {
    const ex = (coin.exchange || '').toLowerCase().trim();
    const mt = (coin.marketType || '').toLowerCase().trim();
    const sym = coin.symbol.toUpperCase().trim();

    if (!ex) return false;

    for (const item of watchlist) {
      if (item === targetKey) return true;
      if (item.includes(':')) {
        const itemParsed = parseWatchlistKey(item);
        if (itemParsed.symbol === sym && itemParsed.exchange === ex) {
          if (!mt || itemParsed.marketType === mt) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Normalizes an array of watchlist keys to ensure backwards compatibility
 * while guaranteeing each entry has an explicit exchange identifier.
 */
export function normalizeWatchlist(list: string[] | undefined): string[] {
  if (!list || !Array.isArray(list)) return [];
  const normalized = list.map((item) => getCoinWatchlistKey(item));
  return Array.from(new Set(normalized));
}

/** Toggle a single exact exchange+market+symbol pair without losing old entries. */
export function toggleCoinWatchlist(
  watchlist: string[],
  coin: CoinIdentifier | string
): string[] {
  const key = getCoinWatchlistKey(coin);
  const existing = watchlist.some((item) => getCoinWatchlistKey(item) === key);
  return existing
    ? watchlist.filter((item) => getCoinWatchlistKey(item) !== key)
    : [...watchlist, key];
}

/** Clear old folder assignments only when a favorite is explicitly removed.
 * Adding a favorite must NEVER auto-place it in an existing folder.
 */
export function removeCoinFromWatchlistFolders(
  folders: Record<string, string[]>,
  coin: CoinIdentifier | string
): Record<string, string[]> {
  const key = getCoinWatchlistKey(coin);
  const result: Record<string, string[]> = {};
  for (const [name, entries] of Object.entries(folders)) {
    result[name] = Array.isArray(entries)
      ? entries.filter((entry) => getCoinWatchlistKey(entry) !== key)
      : [];
  }
  return result;
}

/** A saved favorite can outlive the current scan. Keep it visible and removable. */
export interface ResolvedWatchlistEntry {
  key: string;
  sourceKeys: string[];
  symbol: string;
  exchange: string;
  marketType: string;
  coin: ScannedCoin | null;
}

/**
 * Resolve both legacy symbol-only and fully qualified saved favorites.
 * Scanner results can temporarily omit a saved coin; an unresolved favorite
 * must remain visible (and removable), rather than inflate a hidden counter.
 */
export function resolveWatchlistEntries(
  watchlist: string[] | undefined,
  scannedCoins: ScannedCoin[]
): ResolvedWatchlistEntry[] {
  const available = new Map<string, ScannedCoin>();
  for (const coin of scannedCoins) {
    const key = getCoinWatchlistKey(coin);
    if (!available.has(key)) available.set(key, coin);
  }
  const resolved = new Map<string, ResolvedWatchlistEntry>();
  for (const raw of Array.isArray(watchlist) ? watchlist : []) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const sourceKey = raw.trim();
    const normalized = getCoinWatchlistKey(sourceKey);
    const parsed = parseWatchlistKey(normalized);
    if (!parsed.symbol.trim()) continue;
    // Legacy plain symbols had no exchange recorded. Treat them as the
    // historical Binance Futures default; do not substitute a Bybit quote
    // merely because it shares the same symbol.
    const coin = available.get(normalized) ?? null;
    const existing = resolved.get(normalized);
    if (existing) {
      if (!existing.sourceKeys.includes(raw)) existing.sourceKeys.push(raw);
      if (!existing.coin && coin) existing.coin = coin;
    } else {
      resolved.set(normalized, {
        key: normalized,
        sourceKeys: [raw],
        symbol: parsed.symbol,
        exchange: coin?.exchange || parsed.exchange,
        marketType: coin?.marketType || parsed.marketType,
        coin,
      });
    }
  }
  return [...resolved.values()];
}


/** Display the same short name in the drawer and in its copy action. */
export function watchlistDisplayName(entry: ResolvedWatchlistEntry): string {
  return entry.coin?.baseAsset || entry.symbol.replace(/(USDT|USDC|BUSD)$/, '') || entry.symbol;
}

/** Build a chart coin from the exact favorite identity, even when its ticker
 * hasn't arrived. Do not attach stale formation entry/SL/TP levels.
 */
export function watchlistEntryToChartCoin(entry: ResolvedWatchlistEntry, timeframe: Timeframe): ScannedCoin & { timeframe: Timeframe } {
  const { exchange, marketType, symbol } = parseWatchlistKey(entry.key);
  if (entry.coin) {
    return {
      ...entry.coin, exchange, marketType, symbol, timeframe,
      formations: [], hasFormations: false,
    };
  }
  const quoteAsset = ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH'].find(quote =>
    symbol.endsWith(quote) && symbol.length > quote.length) ?? 'USDT';
  const baseAsset = symbol.endsWith(quoteAsset) && symbol.length > quoteAsset.length
    ? symbol.slice(0, -quoteAsset.length) : symbol;
  return {
    exchange, marketType, symbol, baseAsset, quoteAsset, timeframe,
    currentPrice: 0, priceChange24h: 0, volume24hUsd: 0,
    highPrice24h: 0, lowPrice24h: 0, lastUpdated: Date.now(),
    formations: [], hasFormations: false, exchangeUrl: '',
  };
}

/** Minimal quote data delivered by the shared-market favorite-quotes endpoint.
 * It is not a formation scan: synthetic technical indicators are never added.
 */
export interface WatchlistMarketQuote {
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volumeUsd: number;
}

export function isWatchlistMarketQuote(value: unknown): value is WatchlistMarketQuote {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<WatchlistMarketQuote>;
  return (item.exchange === 'binance' || item.exchange === 'bybit')
    && (item.marketType === 'futures' || item.marketType === 'spot')
    && typeof item.symbol === 'string' && /^[A-Z0-9]{2,40}$/.test(item.symbol)
    && typeof item.baseAsset === 'string' && typeof item.quoteAsset === 'string'
    && typeof item.price === 'number' && Number.isFinite(item.price) && item.price > 0
    && typeof item.change24h === 'number' && Number.isFinite(item.change24h)
    && typeof item.volumeUsd === 'number' && Number.isFinite(item.volumeUsd)
    && typeof item.high24h === 'number' && Number.isFinite(item.high24h)
    && typeof item.low24h === 'number' && Number.isFinite(item.low24h);
}

/** Reuse the existing Watchlist UI and MetaScalp identity without triggering a
 * heavy formation scan. This quote has no detected formation by design.
 */
export function watchlistQuoteToScannedCoin(quote: WatchlistMarketQuote, updatedAt: number): ScannedCoin {
  const { exchange, marketType, symbol } = quote;
  const exchangeUrl = exchange === 'binance'
    ? marketType === 'futures'
      ? 'https://www.binance.com/en/futures/' + symbol
      : 'https://www.binance.com/en/trade/' + symbol
    : marketType === 'futures'
      ? 'https://www.bybit.com/trade/usdt/' + symbol
      : 'https://www.bybit.com/en/trade/spot/' + symbol.replace(/USDT$/, '') + '/USDT';
  return {
    exchange, marketType, symbol,
    baseAsset: quote.baseAsset,
    quoteAsset: quote.quoteAsset,
    currentPrice: quote.price,
    priceChange24h: quote.change24h,
    highPrice24h: quote.high24h,
    lowPrice24h: quote.low24h,
    volume24hUsd: quote.volumeUsd,
    volumeUsd: quote.volumeUsd,
    formations: [],
    timeframe: '1h',
    lastUpdated: updatedAt,
    exchangeUrl,
  };
}
