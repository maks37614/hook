import type { ExchangeId, MarketType } from '../types';
import { normalizeExchangeSymbol } from './marketSymbols';

const tickCache = new Map<string, { tick: number | null; updatedAt: number }>();
const pending = new Map<string, Promise<number | null>>();
const SUCCESS_TTL = 30 * 60_000;
const FAILURE_TTL = 60_000;
let futuresInfoRequest: Promise<void> | null = null;
const keyOf = (exchange: ExchangeId, market: MarketType, symbol: string) =>
  `${exchange}:${market}:${normalizeExchangeSymbol(symbol)}`;

function readTick(raw: unknown): number | null {
  const value = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function readJson(url: string, request: typeof fetch): Promise<any> {
  const response = await request(url, { signal: AbortSignal.timeout(3500) });
  if (!response.ok) throw new Error(`Instrument metadata HTTP ${response.status}`);
  return response.json();
}

/**
 * Public exchange instrument metadata, cached to avoid fetching exchangeInfo
 * separately for each candidate. When metadata is unavailable the caller must
 * label projected levels as non-verified, not imply the prices are executable.
 */
export async function fetchExchangeTickSize(
  exchange: ExchangeId, market: MarketType, symbol: string,
  request: typeof fetch = fetch,
): Promise<number | null> {
  const normalized = normalizeExchangeSymbol(symbol);
  const key = keyOf(exchange, market, normalized);
  const now = Date.now();
  const cached = tickCache.get(key);
  if (cached && now - cached.updatedAt < (cached.tick ? SUCCESS_TTL : FAILURE_TTL)) return cached.tick;
  const running = pending.get(key);
  if (running) return running;

  const lookup = (async () => {
    let tick: number | null = null;
    try {
      if (exchange === 'binance' && market === 'futures') {
        if (!futuresInfoRequest) {
          futuresInfoRequest = (async () => {
            const json = await readJson('https://fapi.binance.com/fapi/v1/exchangeInfo', request);
            const at = Date.now();
            for (const row of json?.symbols || []) {
              if (typeof row.symbol !== 'string') continue;
              const priceFilter = row.filters?.find((filter: any) => filter.filterType === 'PRICE_FILTER');
              const candidate = readTick(priceFilter?.tickSize);
              if (candidate) tickCache.set(keyOf('binance', 'futures', row.symbol), { tick: candidate, updatedAt: at });
            }
          })().finally(() => { futuresInfoRequest = null; });
        }
        await futuresInfoRequest;
        tick = tickCache.get(key)?.tick || null;
      } else if (exchange === 'binance') {
        const json = await readJson(`https://api.binance.com/api/v3/exchangeInfo?symbol=${encodeURIComponent(normalized)}`, request);
        const row = json?.symbols?.find((item: any) => item.symbol === normalized);
        const filter = row?.filters?.find((item: any) => item.filterType === 'PRICE_FILTER');
        tick = readTick(filter?.tickSize);
      } else {
        const category = market === 'futures' ? 'linear' : 'spot';
        const json = await readJson(
          `https://api.bybit.com/v5/market/instruments-info?category=${category}&symbol=${encodeURIComponent(normalized)}`,
          request,
        );
        if (json?.retCode === 0) {
          const row = json?.result?.list?.find((item: any) => item.symbol === normalized);
          tick = readTick(row?.priceFilter?.tickSize);
        }
      }
    } catch {
      // Loss of the metadata service must not generate a fabricated tick size.
    }
    tickCache.set(key, { tick, updatedAt: Date.now() });
    return tick;
  })();
  pending.set(key, lookup);
  try {
    return await lookup;
  } finally {
    pending.delete(key);
  }
}
