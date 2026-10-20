import type { MarketCoin, TerminalChartBlock, TerminalSavedPreset, Timeframe } from '../types';
import { coinMarketKey } from './marketPresets';

export const TERMINAL_PRESETS_STORAGE_KEY = 'crypto_screener_terminal_presets';
export function terminalStorageKey(key: string, uid?: string): string {
  return `${key}_${uid || 'guest'}`;
}

export function normalizeTerminalBlocks(value: unknown): TerminalChartBlock[] {
  if (!Array.isArray(value)) return [];
  return value.filter((block): block is TerminalChartBlock => Boolean(block)
    && typeof block.id === 'string' && typeof block.symbol === 'string' && block.symbol.length > 0
    && ['binance', 'bybit'].includes(block.exchange) && ['spot', 'futures'].includes(block.marketType)
    && ['1m', '5m', '15m', '1h', '4h', '1d'].includes(block.timeframe)
    && ['tradingview', 'pattern', 'orderbook', 'combined'].includes(block.mode));
}

export function normalizeTerminalPresets(value: unknown): TerminalSavedPreset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(preset => {
    if (!preset || typeof preset.id !== 'string' || seen.has(preset.id)
      || typeof preset.name !== 'string' || !preset.name.trim()) return [];
    const blocks = normalizeTerminalBlocks(preset.blocks).slice(0, 36);
    if (!blocks.length) return [];
    seen.add(preset.id);
    return [{ ...preset, name: preset.name.trim().slice(0, 60), blocks,
      columns: [1, 2, 3, 4, 5, 6].includes(preset.columns) ? preset.columns : 2,
      blockHeight: ['compact', 'medium', 'large'].includes(preset.blockHeight) ? preset.blockHeight : 'medium',
      createdAt: Number.isFinite(preset.createdAt) ? preset.createdAt : 0 }];
  }).slice(0, 30);
}

/** Keep existing widget IDs and settings when the market ranking is unchanged. */
export function blocksForMarketPreset(current: TerminalChartBlock[], coins: MarketCoin[], timeframe: Timeframe): TerminalChartBlock[] {
  const next = coins.map(coin => {
    const existing = current.find(block => coinMarketKey(block) === coinMarketKey(coin));
    if (existing) return existing;
    return { id: `market-${coinMarketKey(coin)}`, symbol: coin.symbol, baseAsset: coin.baseAsset,
      quoteAsset: coin.quoteAsset, exchange: coin.exchange, marketType: coin.marketType,
      timeframe, mode: 'tradingview' as const, colSpan: 1 as const };
  });
  return next.length === current.length && next.every((block, index) => block === current[index]) ? current : next;
}
