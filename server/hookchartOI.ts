import { chartExchangeFetch } from './exchangeHttp';
import { normalizeExchangeSymbol } from '../src/utils/marketSymbols';

export interface OIHistoryPoint { t: number; v: number }
interface OIHistory { binance: OIHistoryPoint[]; bybit: OIHistoryPoint[] }
const cache = new Map<string, { expires: number; data: OIHistory }>();
const pending = new Map<string, Promise<OIHistory>>();

export function oiHistoryPeriod(timeframe: string) {
  const binance = ['15m', '30m', '1h', '4h', '1d'].includes(timeframe) ? timeframe : '5m';
  const bybit = ({ '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1h', '4h': '4h', '1d': '1d' } as Record<string, string>)[binance];
  const interval = ({ '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D' } as Record<string, string>)[binance];
  return { binance, bybit, interval };
}

export function normalizeOIHistory(rows: OIHistoryPoint[]): OIHistoryPoint[] {
  const points = new Map<number, OIHistoryPoint>();
  for (const row of rows) if (Number.isFinite(row.t) && row.t > 0 && Number.isFinite(row.v) && row.v >= 0) points.set(row.t, row);
  return [...points.values()].sort((a, b) => a.t - b.t);
}

/** Bybit linear reports coin quantities; convert using the matching historical candle. */
export function bybitOIToUsd(rows: Array<{ timestamp: string; openInterest: string }>, klines: string[][]): OIHistoryPoint[] {
  const prices = klines.map(row => ({ t: Number(row[0]), v: Number(row[4]) })).filter(row => row.t > 0 && row.v > 0).sort((a, b) => a.t - b.t);
  return normalizeOIHistory(rows.flatMap(row => {
    const t = Number(row.timestamp), amount = Number(row.openInterest);
    let lo = 0, hi = prices.length - 1, index = -1;
    while (lo <= hi) { const middle = (lo + hi) >> 1; if (prices[middle].t <= t) { index = middle; lo = middle + 1; } else hi = middle - 1; }
    const priceAge = index >= 0 ? t - prices[index].t : Infinity;
    const candleMs = prices.length >= 2 ? prices[1].t - prices[0].t : 0;
    // Never convert OI using an arbitrarily old price candle.
    return index < 0 || !Number.isFinite(amount) || amount <= 0
      || candleMs <= 0 || priceAge < 0 || priceAge > candleMs + 60_000
      ? [] : [{ t, v: amount * prices[index].v }];
  }));
}

async function json(url: URL): Promise<any> {
  // Historical OI is requested by an open chart, so it shares the chart
  // reservation with candles while retaining the same exchange safety limits.
  const response = await chartExchangeFetch(url, { headers: { 'User-Agent': 'SignalHook/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Open interest source HTTP ${response.status}`);
  const data = await response.json();
  const numeric = (value: unknown, positive = false) =>
    (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
    Number.isFinite(Number(value)) && (positive ? Number(value) > 0 : Number(value) >= 0);
  if (url.hostname === 'api.bybit.com') {
    if (typeof data?.retCode !== 'number') throw new Error('Open interest source invalid response');
    if (data.retCode !== 0) throw new Error(`Open interest source API ${data.retCode}`);
    const rows = data.result?.list;
    const prices = url.pathname.endsWith('/kline');
    if (!Array.isArray(rows) || !rows.every(row => prices
      ? Array.isArray(row) && numeric(row[0], true) && numeric(row[4], true)
      : row && numeric(row.timestamp, true) && numeric(row.openInterest))) {
      throw new Error('Open interest source invalid response');
    }
  } else {
    if (!Array.isArray(data)) {
      if (typeof data?.code === 'number') throw new Error(`Open interest source API ${data.code}`);
      throw new Error('Open interest source invalid response');
    }
    if (!data.every(row => row && numeric(row.timestamp, true) && numeric(row.sumOpenInterestValue))) {
      throw new Error('Open interest source invalid response');
    }
  }
  return data;
}

export async function fetchHookChartOIHistory(symbol: string, timeframe: string): Promise<OIHistory> {
  const cleanSymbol = normalizeExchangeSymbol(symbol);
  const periods = oiHistoryPeriod(timeframe);
  const key = `${cleanSymbol}:${periods.binance}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  if (pending.has(key)) return pending.get(key)!;
  const request = (async () => {
    const binance = new URL('https://fapi.binance.com/futures/data/openInterestHist');
    binance.search = new URLSearchParams({ symbol: cleanSymbol, period: periods.binance, limit: '500' }).toString();
    const bybit = new URL('https://api.bybit.com/v5/market/open-interest');
    bybit.search = new URLSearchParams({ category: 'linear', symbol: cleanSymbol, intervalTime: periods.bybit, limit: '200' }).toString();
    const prices = new URL('https://api.bybit.com/v5/market/kline');
    prices.search = new URLSearchParams({ category: 'linear', symbol: cleanSymbol, interval: periods.interval, limit: '200' }).toString();
    const [b, y, p] = await Promise.allSettled([json(binance), json(bybit), json(prices)]);
    for (const [source, result] of [['binance', b], ['bybit', y], ['bybit-price', p]] as const) {
      if (result.status === 'rejected') {
        console.warn('[HookChart OI] source request failed', {
          source, symbol: cleanSymbol, period: periods.binance,
          error: result.reason instanceof Error
            ? `${result.reason.name}: ${result.reason.message}` : 'Unknown error',
        });
      }
    }
    const bRows = b.status === 'fulfilled' && Array.isArray(b.value) ? b.value : [];
    const yRows = y.status === 'fulfilled' && y.value?.retCode === 0 && Array.isArray(y.value.result?.list) ? y.value.result.list : [];
    const pRows = p.status === 'fulfilled' && p.value?.retCode === 0 && Array.isArray(p.value.result?.list) ? p.value.result.list : [];
    const data = { binance: normalizeOIHistory(bRows.map((row: any) => ({ t: Number(row.timestamp), v: Number(row.sumOpenInterestValue) }))), bybit: bybitOIToUsd(yRows, pRows) };
    if (!data.binance.length && !data.bybit.length) throw new Error('Open interest unavailable for this symbol');
    cache.set(key, { data, expires: Date.now() + 60_000 });
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    return data;
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}
