import type { MarketCoin, TerminalChartBlock, TerminalSavedPreset, Timeframe } from '../types';
import { coinMarketKey, type TerminalPresetCoin } from './marketPresets';
import { formatCryptoPrice } from './formatters';
import { normalizeExchangeSymbol } from './marketSymbols';
import { getCoinWatchlistKey, parseWatchlistKey } from './watchlistUtils';

const TERMINAL_KNOWN_QUOTES = ['FDUSD', 'USDT', 'USDC', 'BUSD', 'BTC'] as const;

/** Keep an existing pair's quote asset; never turn ETHBTC into ETHBTCUSDT. */
export function normalizeTerminalMarketPair(symbolInput: string, quoteInput?: string): { symbol: string; quoteAsset: string } {
  const cleanSymbol = normalizeExchangeSymbol(symbolInput || 'BTCUSDT') || 'BTCUSDT';
  const specifiedQuote = (quoteInput || 'USDT').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'USDT';
  // A 3+ character base avoids mistaking short ticker names such as WBTC for
  // a BTC-quoted pair when the user intends to trade WBTC/USDT.
  const detectedQuote = TERMINAL_KNOWN_QUOTES.find(quote => {
    const baseAsset = cleanSymbol.slice(0, -quote.length);
    // Keep the legacy 3-character rule for Latin tickers, but international
    // asset names can be shorter (for example, 龙虾BTC).
    return cleanSymbol.endsWith(quote) &&
      (baseAsset.length >= 3 || /[^\x00-\x7F]/.test(baseAsset));
  });
  if (detectedQuote) return { symbol: cleanSymbol, quoteAsset: detectedQuote };
  return {
    symbol: cleanSymbol.length > specifiedQuote.length && cleanSymbol.endsWith(specifiedQuote)
      ? cleanSymbol : `${cleanSymbol}${specifiedQuote}`,
    quoteAsset: specifiedQuote,
  };
}

/** A BTC/ETH quoted instrument is not priced in dollars. */
export function formatTerminalQuotedPrice(price: number | null | undefined, quoteAsset?: string): string {
  const quote = (quoteAsset || 'USDT').toUpperCase();
  const formatted = formatCryptoPrice(price);
  // Only a real USD quote receives a dollar sign. Stablecoins are quoted in
  // their own assets; the chart toolbar displays that asset separately.
  if (quote === 'USD') return `$${formatted}`;
  return ['USDT', 'USDC', 'BUSD', 'FDUSD'].includes(quote)
    ? formatted
    : `${formatted} ${quote}`;
}

/** Maximum number of newly added live HookCharts in one Terminal workspace. */
export const MAX_TERMINAL_CHARTS = 50;

export const TERMINAL_PRESETS_STORAGE_KEY = 'crypto_screener_terminal_presets';
export function terminalStorageKey(key: string, uid?: string): string {
  return `${key}_${uid || 'guest'}`;
}

export function normalizeTerminalBlocks(value: unknown): TerminalChartBlock[] {
  if (!Array.isArray(value)) return [];
  const usedIds = new Set<string>();
  return value.flatMap((entry, index): TerminalChartBlock[] => {
    if (!entry || typeof entry !== 'object') return [];
    const block = entry as Record<string, unknown>;
    if (typeof block.id !== 'string' || typeof block.symbol !== 'string' || !block.symbol.length
      || !['binance', 'bybit'].includes(String(block.exchange))
      || !['spot', 'futures'].includes(String(block.marketType))
      || !['30s', '1m', '5m', '15m', '1h', '4h', '1d'].includes(String(block.timeframe))) return [];

    // Older saved workspaces included orderbook blocks; retain their symbol as a chart.
    const { mode: _legacyMode, domSettings: _legacyDomSettings, ...chartBlock } = block;
    // Old/imported workspaces can contain duplicate block IDs. Keeping duplicate
    // React keys would swap chart state between instruments after reordering.
    let id = block.id as string;
    if (usedIds.has(id)) {
      id = `${id}-restored-${index}`;
      while (usedIds.has(id)) id += '-1';
    }
    usedIds.add(id);
    return [{ ...chartBlock, id } as unknown as TerminalChartBlock];
  });
}

export function normalizeTerminalPresets(value: unknown): TerminalSavedPreset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(preset => {
    if (!preset || typeof preset.id !== 'string' || seen.has(preset.id)
      || typeof preset.name !== 'string' || !preset.name.trim()) return [];
    const blocks = normalizeTerminalBlocks(preset.blocks).slice(0, 50);
    if (!blocks.length) return [];
    seen.add(preset.id);
    return [{ ...preset, name: preset.name.trim().slice(0, 60), blocks,
      columns: [1, 2, 3, 4, 5, 6].includes(preset.columns) ? preset.columns : 2,
      blockHeight: ['compact', 'medium', 'large'].includes(preset.blockHeight) ? preset.blockHeight : 'medium',
      createdAt: Number.isFinite(preset.createdAt) ? preset.createdAt : 0 }];
  }).slice(0, 30);
}

/**
 * Build custom preset candidates from exact saved favorite identities.
 * Watchlist entries now use "exchange:market:symbol", not bare symbols. An
 * absent ticker must not silently remove that coin from a user's preset.
 * The pre-indexed market quotes and open blocks avoid repeated full scans.
 */
export function blocksForSavedFavorites(
  watchlist: readonly string[],
  quotesBySymbol: ReadonlyMap<string, readonly MarketCoin[]>,
  blocksByMarket: ReadonlyMap<string, TerminalChartBlock>,
  timeframe: Timeframe,
): TerminalChartBlock[] {
  const keys = [...new Set(watchlist.filter(value => typeof value === 'string' && value.trim()).map(getCoinWatchlistKey))];
  return keys.flatMap((key): TerminalChartBlock[] => {
    const { symbol: favoriteSymbol, exchange, marketType } = parseWatchlistKey(key);
    if (!favoriteSymbol) return [];
    const coin = (quotesBySymbol.get(favoriteSymbol) || []).find(value => coinMarketKey(value) === key);
    const previous = blocksByMarket.get(key);
    const { symbol: normalized, quoteAsset: fallbackQuote } = normalizeTerminalMarketPair(favoriteSymbol);
    const symbol = coin?.symbol ?? previous?.symbol ?? normalized;
    const quoteAsset = coin?.quoteAsset ?? previous?.quoteAsset ?? fallbackQuote;
    const baseAsset = coin?.baseAsset ?? previous?.baseAsset ?? symbol.slice(0, -quoteAsset.length);
    return [{
      id: `favorite-${key}`, symbol, baseAsset, quoteAsset,
      exchange, marketType, timeframe, colSpan: 1,
    }];
  });
}

/** Keep existing widget IDs and settings when the market ranking is unchanged. */
export function blocksForMarketPreset(current: TerminalChartBlock[], coins: readonly TerminalPresetCoin[], timeframe: Timeframe): TerminalChartBlock[] {
  // Reuse blocks in O(n + m) instead of searching every open chart for each
  // market candidate on every automatic preset update.
  const currentByMarket = new Map(current.map(block => [coinMarketKey(block), block] as const));
  const next = coins.map(coin => {
    const existing = currentByMarket.get(coinMarketKey(coin));
    if (existing) {
      // Formation preset uses the scanner's actual timeframe and selected pattern.
      // Preserve the existing chart ID, drawings, size and user settings.
      if (coin.timeframe && (existing.timeframe !== coin.timeframe || existing.formationId !== coin.formationId))
        return { ...existing, timeframe: coin.timeframe, formationId: coin.formationId };
      return existing;
    }
    return { id: `market-${coinMarketKey(coin)}`, symbol: coin.symbol, baseAsset: coin.baseAsset,
      quoteAsset: coin.quoteAsset, exchange: coin.exchange, marketType: coin.marketType,
      timeframe: coin.timeframe ?? timeframe, formationId: coin.formationId, colSpan: 1 as const };
  });
  return next.length === current.length && next.every((block, index) => block === current[index]) ? current : next;
}
