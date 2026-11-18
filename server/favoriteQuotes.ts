import type { Express } from 'express';
import type { ExchangeId, MarketType } from '../src/types';
import { getCoinWatchlistKey, parseWatchlistKey } from '../src/utils/watchlistUtils';
import { marketTickerFeed, type RawTicker, type MarketSourceStatus } from './marketTickerFeed';

type Feed = Pick<typeof marketTickerFeed, 'get' | 'status'>;
const KEY_PATTERN = /^(binance|bybit):(futures|spot):[A-Z0-9]{2,40}$/;

/** Only exact instruments, never ambiguous symbol-only or free-form exchange queries. */
export function validateFavoriteQuoteKeys(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 150) return null;
  if (input.some(key => typeof key !== 'string' || !KEY_PATTERN.test(key))) return null;
  return Array.from(new Set(input as string[]));
}

export interface FavoriteQuotesResult {
  data: RawTicker[];
  sources: MarketSourceStatus[];
}

/**
 * Read just the requested pairs from the shared market ticker feed.
 * get() already coalesces and throttles its source refreshes; this endpoint
 * never starts per-user exchange subscriptions or OHLCV/formation scans.
 */
export async function getFavoriteQuotes(
  keys: readonly string[],
  feed: Feed = marketTickerFeed,
): Promise<FavoriteQuotesResult> {
  const wanted = new Set(keys);
  const sourceIds = Array.from(new Set(keys.map(key => {
    const pair = parseWatchlistKey(key);
    return pair.exchange + ':' + pair.marketType;
  })));
  const results = await Promise.all(sourceIds.map(async id => {
    const [exchange, marketType] = id.split(':') as [ExchangeId, MarketType];
    let rows: RawTicker[] = [];
    try { rows = await feed.get(exchange, marketType); }
    catch { /* The source status below reports an unavailable feed. */ }
    return { rows, source: feed.status(exchange, marketType) };
  }));

  const quotes = new Map<string, RawTicker>();
  for (const { rows } of results) {
    for (const row of rows) {
      if (!(row.price > 0) || !Number.isFinite(row.price)) continue;
      const key = getCoinWatchlistKey(row);
      if (wanted.has(key)) quotes.set(key, row);
    }
  }

  return { data: [...quotes.values()], sources: results.map(result => result.source) };
}

export function installFavoriteQuoteRoutes(app: Express, feed: Feed = marketTickerFeed): void {
  app.post('/api/market/favorite-quotes', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const keys = validateFavoriteQuoteKeys(req.body?.keys);
    if (!keys) {
      res.status(400).json({ success: false, error: 'Некоректний список обраних монет' });
      return;
    }
    try {
      const result = await getFavoriteQuotes(keys, feed);
      res.json({ success: true, ...result });
    } catch {
      res.status(503).json({ success: false, error: 'Котирування тимчасово недоступні' });
    }
  });
}
