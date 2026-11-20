import type { ExchangeId, Kline, MarketType, Timeframe } from '../types';
import { normalizeExchangeSymbol } from './marketSymbols';

/**
 * Small browser-memory history cache for Terminal tiles removed by strict
 * viewport virtualization. It stores REAL previously received OHLCV only:
 * no user drawings, account state, WebSockets, or background requests.
 *
 * The regular history loader ALWAYS revalidates on remount. Cache entries
 * allow the returning chart to paint immediately while fresh candles arrive.
 */
const MAX_SERIES = 32;
const MAX_BARS = 180;
const MAX_AGE_MS = 120_000;
type Market = { exchange: ExchangeId; marketType: MarketType; symbol: string; timeframe: Timeframe | string };
type Saved = { at: number; rows: readonly Kline[] };
const histories = new Map<string, Saved>();

function key(market: Market): string {
  return [market.exchange, market.marketType, normalizeExchangeSymbol(market.symbol).toUpperCase(), market.timeframe].join(':');
}

/** 30s uses exchange trades, not official 30s candles; never warm it with REST data. */
export function saveTerminalChartHistory(market: Market, rows: readonly Kline[], now = Date.now()): void {
  if (market.timeframe === '30s' || rows.length < 2) return;
  const recent = rows.slice(-MAX_BARS);
  const id = key(market);
  histories.delete(id);
  histories.set(id, { at: now, rows: recent });
  while (histories.size > MAX_SERIES) histories.delete(histories.keys().next().value!);
}

export function readTerminalChartHistory(market: Market, now = Date.now()): Kline[] | null {
  if (market.timeframe === '30s') return null;
  const id = key(market);
  const entry = histories.get(id);
  if (!entry) return null;
  if (now - entry.at > MAX_AGE_MS || now < entry.at) {
    histories.delete(id);
    return null;
  }
  histories.delete(id);
  histories.set(id, entry);
  return entry.rows as Kline[];
}

export function clearTerminalChartHistory(): void { histories.clear(); }
