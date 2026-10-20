import { exchangeFetch as fetch } from './exchangeGateway';
import type { ExchangeId, MarketType } from '../src/types';
import { normalizeExchangeSymbol } from '../src/utils/marketSymbols';
import type { DomTrade } from '../src/utils/domOrderBook';

/** Trade pagination for historical DOM footprints.
 * A completed page means every execution in the requested interval has been read.
 * Never claim completeness when exchange history is too short or a fetch fails.
 */
export interface TradeHistoryPage {
  trades: DomTrade[];
  complete: boolean;
  nextFromId: number | null;
  source: 'binance-aggTrades' | 'bybit-recent-trade';
  coverageStart: number | null;
}

const headers = { 'User-Agent': 'SignalHook/1.0', Accept: 'application/json' };

async function fetchUncachedDomTradeHistoryPage(options: {
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  startTime: number;
  endTime: number;
  fromId?: number;
}, request: typeof fetch = fetch): Promise<TradeHistoryPage> {
  const { exchange, marketType, symbol, startTime, endTime, fromId } = options;
  if (!Number.isSafeInteger(startTime) || !Number.isSafeInteger(endTime) ||
      startTime < 0 || endTime <= startTime || endTime - startTime > 3_540_000 ||
      endTime > Date.now() + 5_000 ||
      (fromId !== undefined && (!Number.isSafeInteger(fromId) || fromId < 0))) {
    throw new RangeError('Invalid trade history window or cursor');
  }
  const normalized = normalizeExchangeSymbol(symbol);
  if (normalized.length < 4 || normalized.length > 60) throw new RangeError('Invalid market symbol');
  const params = new URLSearchParams({ symbol: normalized, limit: '1000' });
  if (exchange === 'binance') {
    // Futures allows a maximum 1-hour time range. Cursor and times cannot be mixed.
    if (fromId !== undefined) params.set('fromId', String(fromId));
    else {
      params.set('startTime', String(startTime));
      // Binance boundaries are inclusive; the UI uses exclusive endTime.
      params.set('endTime', String(endTime - 1));
    }
    const prefix = marketType === 'futures' ? '/fapi/v1' : '/api/v3';
    const hosts = marketType === 'futures'
      ? ['https://fapi.binance.com']
      : ['https://data-api.binance.vision', 'https://api.binance.com'];
    let lastError = 'Exchange aggregate-trade API unavailable';
    for (const host of hosts) {
      try {
        const url = `${host}${prefix}/aggTrades?${params.toString()}`;
        const response = await request(url, { headers, signal: AbortSignal.timeout(7500) });
        if (!response.ok) { lastError = `Binance history HTTP ${response.status}`; continue; }
        const rows = await response.json();
        if (!Array.isArray(rows)) { lastError = 'Invalid Binance history response'; continue; }
        const parsed = rows.map((t: any) => ({
          id: String(t.a), price: Number(t.p), qty: Number(t.q),
          volumeUsd: Number(t.p) * Number(t.q), isBuyerMaker: Boolean(t.m),
          timestamp: Number(t.T), seq: Number(t.a),
        })).filter((t: DomTrade & { seq: number }) =>
          Number.isSafeInteger(t.seq) && Number.isFinite(t.timestamp) &&
          t.price > 0 && t.qty > 0);
        const trades = parsed.filter((t: DomTrade) => t.timestamp >= startTime && t.timestamp < endTime)
          .map(({ seq, ...trade }: DomTrade & { seq: number }) => trade);
        const reachedEnd = parsed.some((t: DomTrade) => t.timestamp >= endTime);
        const lastId: number | undefined = parsed.at(-1)?.seq;
        const complete = rows.length < 1000 || reachedEnd;
        // Missing/invalid last ID must never loop the same page forever.
        if (!complete && (lastId === undefined || !Number.isSafeInteger(lastId) ||
            (fromId !== undefined && lastId < fromId))) {
          throw new Error('Exchange history did not advance');
        }
        return {
          trades, complete, nextFromId: complete ? null : (lastId as number) + 1,
          source: 'binance-aggTrades',
          coverageStart: trades.length ? Math.min(...trades.map(t => t.timestamp)) : null,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    throw new Error(lastError);
  }

  // Bybit public API only exposes *recent* market executions, not arbitrary history.
  // A candle is complete only if the returned contiguous recent-trade window starts
  // before that candle. Otherwise we must keep the partial-data indication.
  const bybitParams = new URLSearchParams({
    category: marketType === 'futures' ? 'linear' : 'spot',
    symbol: normalized,
    limit: marketType === 'futures' ? '1000' : '60',
  });
  let lastError = 'Bybit trade history unavailable';
  for (const host of ['https://api.bybit.com', 'https://api.bytick.com']) {
    try {
      const response = await request(`${host}/v5/market/recent-trade?${bybitParams}`, {
        headers, signal: AbortSignal.timeout(7500),
      });
      if (!response.ok) { lastError = `Bybit history HTTP ${response.status}`; continue; }
      const payload = await response.json();
      if (payload?.retCode !== 0 || !Array.isArray(payload?.result?.list)) {
        lastError = 'Invalid Bybit recent-trade response'; continue;
      }
      const all: DomTrade[] = payload.result.list.map((t: any) => ({
        id: String(t.execId ?? ''), price: Number(t.price), qty: Number(t.size),
        volumeUsd: Number(t.price) * Number(t.size),
        isBuyerMaker: t.side === 'Sell', timestamp: Number(t.time),
      })).filter((t: DomTrade) => t.id.length > 0 && t.price > 0 && t.qty > 0 && Number.isFinite(t.timestamp));
      const oldest = all.length ? Math.min(...all.map(t => t.timestamp)) : null;
      const newest = all.length ? Math.max(...all.map(t => t.timestamp)) : null;
      return {
        trades: all.filter(t => t.timestamp >= startTime && t.timestamp < endTime),
        complete: oldest !== null && (oldest <= startTime || (newest !== null && newest < startTime)),
        nextFromId: null,
        source: 'bybit-recent-trade',
        coverageStart: oldest,
      };
    } catch (err) { lastError = err instanceof Error ? err.message : String(err); }
  }
  throw new Error(lastError);
}

const historyCache = new Map<string, { expiresAt: number; result: Promise<TradeHistoryPage> }>();

/** Deduplicate repeated backfill requests across many open DOM widgets.
 *  Rejecting results are removed; successful pages are cached briefly.
 */
export function fetchDomTradeHistoryPage(options: Parameters<typeof fetchUncachedDomTradeHistoryPage>[0],
  request: typeof fetch = fetch): Promise<TradeHistoryPage> {
  if (request !== fetch) return fetchUncachedDomTradeHistoryPage(options, request);
  const key = JSON.stringify(options);
  const previous = historyCache.get(key);
  if (previous && previous.expiresAt > Date.now()) return previous.result;
  const result = fetchUncachedDomTradeHistoryPage(options, request);
  historyCache.set(key, { expiresAt: Date.now() + 30_000, result });
  if (historyCache.size > 120) historyCache.delete(historyCache.keys().next().value!);
  result.catch(() => {
    if (historyCache.get(key)?.result === result) historyCache.delete(key);
  });
  return result;
}
