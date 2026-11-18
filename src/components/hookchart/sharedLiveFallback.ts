import type { ExchangeId, Kline, MarketType } from '../../types';
import { normalizeExchangeSymbol } from '../../utils/marketSymbols';
import { validCandle } from '../../utils/hookchartData';
import { createTimedRequestCache } from '../../utils/sharedAnalysisKlines';

/** Short request coalescing is only for reconnect fallback, never for replay history. */
const fallback = createTimedRequestCache<Kline | null>(1800, 96);

export function fetchSharedLiveFallbackKline(
  exchange: ExchangeId, marketType: MarketType, symbol: string, timeframe: string,
): Promise<Kline | null> {
  const normalized = normalizeExchangeSymbol(symbol);
  const key = [exchange, marketType, normalized, timeframe].join(':');
  return fallback.load(key, async () => {
    const params = new URLSearchParams({
      exchange, market: marketType, symbol: normalized, timeframe, limit: '3',
    });
    const response = await fetch('/api/klines?' + params, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error('Live fallback HTTP ' + response.status);
    const json = await response.json();
    if (!json?.success || !Array.isArray(json.data)) return null;
    for (let i = json.data.length - 1; i >= 0; i--) {
      const row = json.data[i] as Kline;
      if (validCandle(row)) return row;
    }
    return null;
  });
}

/**
 * Guard against asynchronous REST fallback overwriting a newer live tick.
 * A kline volume is cumulative within one candle and must not move backwards
 * when HTTP returns an older exchange snapshot.
 */
export function shouldApplyLiveFallbackKline(
  latest: Kline,
  current: { time: number; volume?: number } | null,
  requestStartedAt: number,
  lastKlineReceivedAt: number,
  wsConnected: boolean,
): boolean {
  if (!validCandle(latest)) return false;
  if (!current) return true;
  if (latest.time < current.time) return false;
  if (latest.time > current.time) return true;
  if (wsConnected && lastKlineReceivedAt >= requestStartedAt) return false;
  // Equal cumulative volume carries no new execution and may contain an
  // outdated price, so it should not replace a fresher trade-driven close.
  if (Number.isFinite(current.volume) && latest.volume <= (current.volume ?? 0)) return false;
  return true;
}
