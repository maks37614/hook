import type { Express } from 'express';
import type { Kline } from '../src/types';
import { normalizeExchangeSymbol } from '../src/utils/marketSymbols';

/**
 * On-demand four-hour history of genuine five-second candles, aggregated from
 * exchange-reported one-second OHLCV. Never split a minute candle.
 * No cron, database writes, idle polling or collection of inactive symbols.
 */
export const TERMINAL_5S_INTERVAL_MS = 5_000;
export const TERMINAL_5S_LOOKBACK_MS = 4 * 60 * 60 * 1_000;
const MAX_PAGE_COUNT = 17;
const MAX_CACHE_ENTRIES = 16;
const CACHE_TTL_MS = 5_000;
const MAX_CONCURRENT_BACKFILLS = 2;
const MAX_WAITING_BACKFILLS = 12;

export interface TerminalFiveSecondHistoryResult {
  success: boolean;
  complete: boolean;
  source: string;
  data: Kline[];
  from: number;
  until: number;
  reason?: string;
}

function decimal(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Order is the original one-second open-time order, with missing seconds left empty. */
export function aggregateExchangeOneSecondCandles(rows: readonly unknown[], fromMs: number, untilMs: number): Kline[] {
  const buckets = new Map<number, Kline>();
  for (const raw of rows) {
    if (!Array.isArray(raw) || raw.length < 11) continue;
    const timeMs = Number(raw[0]);
    const open = decimal(raw[1]), high = decimal(raw[2]);
    const low = decimal(raw[3]), close = decimal(raw[4]);
    const volume = decimal(raw[5]), quoteVolume = decimal(raw[7]);
    const buyVolume = decimal(raw[9]), buyQuoteVolume = decimal(raw[10]);
    if (!Number.isSafeInteger(timeMs) || timeMs < fromMs || timeMs >= untilMs ||
        open === null || high === null || low === null || close === null ||
        volume === null || open <= 0 || low <= 0 ||
        high < Math.max(open, close, low) || low > Math.min(open, close) ||
        volume === 0) continue;
    const time = Math.floor(timeMs / TERMINAL_5S_INTERVAL_MS) * TERMINAL_5S_INTERVAL_MS / 1000;
    const count = decimal(raw[8]) ?? 0;
    const bar = buckets.get(time);
    if (!bar) {
      buckets.set(time, {
        time, open, high, low, close, volume,
        quoteVolume: quoteVolume ?? undefined,
        buyVolume: buyVolume ?? undefined,
        buyQuoteVolume: buyQuoteVolume ?? undefined,
        tradeCount: count,
      });
    } else {
      bar.high = Math.max(bar.high, high);
      bar.low = Math.min(bar.low, low);
      bar.close = close;
      bar.volume += volume;
      bar.tradeCount = (bar.tradeCount ?? 0) + count;
      if (quoteVolume !== null) bar.quoteVolume = (bar.quoteVolume ?? 0) + quoteVolume;
      if (buyVolume !== null) bar.buyVolume = (bar.buyVolume ?? 0) + buyVolume;
      if (buyQuoteVolume !== null) bar.buyQuoteVolume = (bar.buyQuoteVolume ?? 0) + buyQuoteVolume;
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time).slice(-2_880);
}

async function loadBinanceOneSecondRows(market: 'spot' | 'futures', symbol: string, from: number, until: number): Promise<unknown[]> {
  const rows: unknown[] = [];
  let cursor = from;
  for (let page = 0; page < MAX_PAGE_COUNT && cursor < until; page++) {
    const endpoint = market === 'spot'
      ? new URL('https://data-api.binance.vision/api/v3/klines')
      : new URL('https://fapi.binance.com/fapi/v1/continuousKlines');
    if (market === 'spot') endpoint.searchParams.set('symbol', symbol);
    else {
      endpoint.searchParams.set('pair', symbol);
      endpoint.searchParams.set('contractType', 'PERPETUAL');
    }
    endpoint.searchParams.set('interval', '1s');
    endpoint.searchParams.set('startTime', String(cursor));
    endpoint.searchParams.set('endTime', String(until - 1));
    endpoint.searchParams.set('limit', '1000');
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(9_000) });
    if (!response.ok) throw new Error('exchange_1s_http_' + response.status);
    const batch: unknown = await response.json();
    if (!Array.isArray(batch)) throw new Error('exchange_1s_bad_response');
    let newest = cursor - 1;
    for (const bar of batch) {
      if (!Array.isArray(bar) || !Number.isSafeInteger(Number(bar[0]))) continue;
      const time = Number(bar[0]);
      if (time < cursor || time >= until) continue;
      rows.push(bar);
      newest = Math.max(newest, time);
    }
    if (newest < cursor) break;
    cursor = newest + 1000;
    if (batch.length < 1000) break;
  }
  return rows;
}

const cache = new Map<string, { at: number; value: TerminalFiveSecondHistoryResult }>();
const pending = new Map<string, Promise<TerminalFiveSecondHistoryResult>>();
const waiting: Array<() => void> = [];
let active = 0;
async function limited<T>(action: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT_BACKFILLS) {
    if (waiting.length >= MAX_WAITING_BACKFILLS) throw new Error('five_second_history_busy');
    await new Promise<void>(resolve => waiting.push(resolve));
  } else active++;
  try { return await action(); }
  finally {
    const wake = waiting.shift();
    if (wake) wake();
    else active--;
  }
}

async function historyFor(exchange: string, market: string, symbol: string, now = Date.now()): Promise<TerminalFiveSecondHistoryResult> {
  const until = Math.floor(now / TERMINAL_5S_INTERVAL_MS) * TERMINAL_5S_INTERVAL_MS;
  const from = until - TERMINAL_5S_LOOKBACK_MS;
  const unsupported = (reason: string): TerminalFiveSecondHistoryResult =>
    ({ success: false, complete: false, source: exchange, data: [], from, until, reason });
  // Bybit's last-N public trades are not a paginatable four-hour history API.
  // Do not mislabel incomplete recent trades or fabricated bars as full history.
  if (exchange === 'bybit') return unsupported('bybit_historical_5s_unavailable');
  if (exchange !== 'binance' || (market !== 'spot' && market !== 'futures'))
    return unsupported('market_unsupported');
  const key = [exchange, market, symbol, until].join(':');
  const cached = cache.get(key);
  if (cached && now - cached.at <= CACHE_TTL_MS) return cached.value;
  const existing = pending.get(key);
  if (existing) return existing;
  const work = limited(async (): Promise<TerminalFiveSecondHistoryResult> => {
    const oneSecond = await loadBinanceOneSecondRows(market, symbol, from, until);
    const data = aggregateExchangeOneSecondCandles(oneSecond, from, until);
    const first = (data[0]?.time ?? NaN) * 1000;
    const last = (data[data.length - 1]?.time ?? NaN) * 1000;
    const complete = data.length > 0 && Number.isFinite(first) && Number.isFinite(last)
      && first <= from + 10_000 && last >= until - 15_000;
    return { success: data.length > 0, complete, source: 'binance_1s_ohlcv', data, from, until,
      ...(data.length ? {} : { reason: 'empty_exchange_1s_history' }) };
  }).then(value => {
    cache.set(key, { at: Date.now(), value });
    if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, work);
  return work;
}

export function installTerminalFiveSecondHistory(app: Express): void {
  app.get('/api/terminal/5s-history', async (req, res) => {
    const exchange = String(req.query.exchange || '');
    const market = String(req.query.market || '');
    const symbol = normalizeExchangeSymbol(String(req.query.symbol || ''));
    if (!['binance', 'bybit'].includes(exchange) || !['spot', 'futures'].includes(market) ||
        !/^[A-Z0-9]{3,32}$/.test(symbol)) {
      res.status(400).json({ success: false, reason: 'invalid_market_scope' }); return;
    }
    try {
      const answer = await historyFor(exchange, market, symbol);
      res.setHeader('Cache-Control', 'public, max-age=3');
      res.json(answer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_history_failure';
      res.status(message === 'five_second_history_busy' ? 503 : 502)
        .json({ success: false, reason: message });
    }
  });
}
