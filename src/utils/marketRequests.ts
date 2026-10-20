import type { ExchangeId, MarketType } from '../types';

/** Only public, read-only market GETs use this retry policy. Never use it for orders. */
export class MarketRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
    readonly retryAfterMs = 0,
    readonly payload?: any,
  ) {
    super(message);
    this.name = 'MarketRequestError';
  }
}

export interface MarketRequestOptions {
  request?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  attempts?: number;
  retryDelayMs?: number;
  headers?: HeadersInit;
  now?: () => number;
  validate?: (data: any, response: Response) => void;
  shouldRetry?: (error: MarketRequestError) => boolean;
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
}

export function waitForMarketRetry(ms: number, signal?: AbortSignal): Promise<void> {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function retryAfter(response: Response, now: number): number {
  const value = response.headers.get('retry-after');
  if (!value) return 0;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(value) - now) || 0;
}

/** Cancels timers/listeners after reading the body; works without AbortSignal.any/timeout. */
export async function requestMarketJson<T = any>(urls: string[], options: MarketRequestOptions = {}): Promise<T> {
  if (!urls.length) throw new Error('No market endpoint');
  const request = options.request ?? fetch;
  const attempts = Math.max(1, options.attempts ?? 2);
  for (let attempt = 0; attempt < attempts; attempt++) {
    checkAbort(options.signal);
    if (attempt) await waitForMarketRetry((options.retryDelayMs ?? 250) * 2 ** (attempt - 1), options.signal);
    const controller = new AbortController();
    const cancel = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('Market request timed out', 'TimeoutError')), options.timeoutMs ?? 4000);
    let failure: MarketRequestError | undefined;
    try {
      const response = await request(urls[attempt % urls.length], {
        signal: controller.signal, cache: 'no-store', headers: options.headers,
      });
      let data: any;
      try { data = await response.json(); } catch (error) {
        // Preserve HTTP denials/rate limits even when the exchange sends an HTML error page.
        if (response.ok) throw error;
      }
      checkAbort(options.signal);
      if (!response.ok) {
        throw new MarketRequestError(`HTTP ${response.status}`, response.status === 408 || response.status >= 500,
          response.status, retryAfter(response, (options.now ?? Date.now)()), data);
      }
      checkAbort(controller.signal);
      options.validate?.(data, response);
      return data as T;
    } catch (error) {
      checkAbort(options.signal);
      failure = error instanceof MarketRequestError ? error : new MarketRequestError(
        controller.signal.aborted ? 'Біржа не відповіла вчасно' : 'Тимчасова помилка з’єднання з біржею', true,
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    }
    // A provider-requested cooldown must not be bypassed by another host or attempt.
    if (!failure!.retryable || failure!.retryAfterMs > 0 || (options.shouldRetry && !options.shouldRetry(failure!)) || attempt + 1 === attempts) throw failure;
  }
  throw new Error('Market request failed');
}

export interface MarketTicker {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
  price: number;
  change24h: number;
  volumeUsd: number;
  high24h: number;
  low24h: number;
}

export async function requestMarketTickers(
  exchange: ExchangeId,
  market: MarketType,
  options: MarketRequestOptions = {},
  quoteAssets: readonly ('USDT' | 'USDC')[] = ['USDT'],
): Promise<MarketTicker[]> {
  const urls = exchange === 'binance'
    ? market === 'spot'
      ? ['https://data-api.binance.vision/api/v3/ticker/24hr', 'https://api.binance.com/api/v3/ticker/24hr']
      : ['https://fapi.binance.com/fapi/v1/ticker/24hr']
    : ['https://api.bybit.com', 'https://api.bytick.com']
      .map(host => `${host}/v5/market/tickers?category=${market === 'spot' ? 'spot' : 'linear'}`);
  const json = await requestMarketJson(urls, { ...options, validate(data, response) {
    if (exchange === 'bybit' && typeof data?.retCode === 'number' && data.retCode !== 0) {
      const reset = Number(response.headers.get('X-Bapi-Limit-Reset-Timestamp'));
      throw new MarketRequestError(`Bybit retCode ${data.retCode}`, [10000, 10016].includes(data.retCode), undefined,
        data.retCode === 10006 ? Math.max(60_000, Number.isFinite(reset) ? reset - (options.now ?? Date.now)() : 0) : 0, data);
    }
    if (!Array.isArray(exchange === 'binance' ? data : data?.result?.list) || (exchange === 'bybit' && data?.retCode !== 0)) {
      throw new MarketRequestError('Некоректна відповідь біржі', true);
    }
  } });
  const list: any[] = exchange === 'binance' ? json : json.result.list;
  return list.filter(item => typeof item?.symbol === 'string' &&
      quoteAssets.some(quote => item.symbol.endsWith(quote)))
    .map((item): MarketTicker => {
      const quoteAsset = quoteAssets.find(quote => item.symbol.endsWith(quote))!;
      return {
      symbol: item.symbol, baseAsset: item.symbol.slice(0, -quoteAsset.length), quoteAsset, exchange, marketType: market,
      price: Number(item.lastPrice),
      change24h: exchange === 'binance' ? Number(item.priceChangePercent) : Number(item.price24hPcnt) * 100,
      volumeUsd: Number(exchange === 'binance' ? item.quoteVolume : item.turnover24h),
      high24h: Number(exchange === 'binance' ? item.highPrice : item.highPrice24h),
      low24h: Number(exchange === 'binance' ? item.lowPrice : item.lowPrice24h),
      };
    })
    .filter(t => Number.isFinite(t.price) && t.price > 0 && Number.isFinite(t.volumeUsd) && t.volumeUsd >= 0
      && Number.isFinite(t.change24h) && Number.isFinite(t.high24h) && Number.isFinite(t.low24h))
    .sort((a, b) => b.volumeUsd - a.volumeUsd);
}
