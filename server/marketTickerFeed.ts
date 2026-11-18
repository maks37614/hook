import { ExchangeBudgetError, exchangeFetch } from './exchangeHttp';
import type { ExchangeId, MarketType } from '../src/types';

export interface RawTicker {
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
  /** Source-provided Bybit linear derivatives values only. */
  openInterestUsd?: number;
  fundingRatePct?: number;
}

export interface MarketSourceStatus {
  exchange: ExchangeId;
  marketType: MarketType;
  status: 'live' | 'stale' | 'unavailable';
  updatedAt: number | null;
  error?: string;
  httpStatus?: number;
}

interface FeedEntry {
  data: RawTicker[];
  updatedAt: number | null;
  retryAt: number;
  error?: string;
  httpStatus?: number;
  pending?: Promise<RawTicker[]>;
  snapshotAt?: number;
  /** Reuse Binance's verified all-market 24h count without per-chart REST. */
  binanceTradeCounts?: Map<string, number>;
  streamAt?: number;
  /** WS changes arriving after the current REST reconciliation started. */
  inFlightWsUpdates?: Map<string, RawTicker>;
  /** Bybit WS can push hundreds of changes per second. Keep O(1) symbol lookup. */
  symbolPositions?: Map<string, number>;
  lastWsSymbolAt?: Map<string, number>;
  /** Bounded WS-only fallback when VPS REST is geo-blocked but browser has a verified catalog. */
  transientBybit?: Map<string, RawTicker>;
  restSuccesses?: number;
  restFailures?: number;
  lastRestFailureAt?: number;
  lastRestFailure?: string;
  lastRestSuccessAt?: number;
}

const FRESH_MS = 15_000;
// The full Bybit universe is REST-reconciled around every 40s. Selected
// visible symbols also receive WS deltas; 45s avoids false stale warnings.
const BYBIT_REST_FRESH_MS = 45_000;
const STALE_MS = 120_000;

/** Shares requests across screener, sentiment and formation scans. */
export class MarketTickerFeed {
  private entries = new Map<string, FeedEntry>();
  // Forward only validated PUBLIC quote changes to the shared screener WS.
  // Personal profile data and alerts are never part of this stream.
  private liveListeners = new Set<(updates: RawTicker[]) => void>();

  subscribeLive(listener: (updates: RawTicker[]) => void): () => void {
    this.liveListeners.add(listener);
    return () => { this.liveListeners.delete(listener); };
  }

  private publishLive(updates: RawTicker[]) {
    if (!updates.length) return;
    for (const listener of this.liveListeners) {
      try { listener(updates); } catch { /* a slow browser relay cannot interrupt exchange data */ }
    }
  }

  /**
   * Bybit WS sends spot snapshots and linear snapshots/deltas. Apply partial
   * linear messages to the previously REST-verified symbol (never create new
   * listings from an incomplete delta); only supplied fields may change.
   */
  applyBybitTicker(market: MarketType, raw: Record<string, unknown>, eventAt = this.now()): boolean {
    const entry = this.entry('bybit', market);
    if (!raw || typeof raw.symbol !== 'string' ||
        !Number.isFinite(eventAt) || eventAt > this.now() + 2_000 ||
        this.now() - eventAt > 15_000) return false;
    const symbol = raw.symbol;
    const index = entry.symbolPositions?.get(symbol) ??
      entry.data.findIndex(item => item.symbol === symbol);
    const known = index >= 0 && index < entry.data.length && entry.data[index].symbol === symbol;
    if ((entry.lastWsSymbolAt?.get(symbol) ?? 0) > eventAt) return false;
    let current = known ? entry.data[index] : entry.transientBybit?.get(symbol);
    if (!current) {
      // The VPS may receive a geo-blocked Bybit REST response while a
      // user's browser can still discover this instrument. Since this frame
      // came from an ACTUAL subscribed Bybit WS topic, forward only complete
      // ticker snapshots; do not invent rows in the canonical REST universe.
      if (!symbol.endsWith('USDT') || symbol.length > 35 ||
          !['lastPrice', 'price24hPcnt', 'turnover24h', 'highPrice24h', 'lowPrice24h']
            .every(key => raw[key] !== undefined && raw[key] !== '')) return false;
      current = {
        symbol, baseAsset: symbol.slice(0, -4), quoteAsset: 'USDT',
        exchange: 'bybit', marketType: market, price: 0, change24h: 0,
        volumeUsd: 0, high24h: 0, low24h: 0,
      };
    }
    const positive = (key: string, fallback: number): number | null => {
      if (raw[key] === undefined || raw[key] === '') return fallback;
      const value = Number(raw[key]);
      return Number.isFinite(value) && value > 0 ? value : null;
    };
    const nonnegative = (key: string, fallback: number): number | null => {
      if (raw[key] === undefined || raw[key] === '') return fallback;
      const value = Number(raw[key]);
      return Number.isFinite(value) && value >= 0 ? value : null;
    };
    const price = positive('lastPrice', current.price);
    const high24h = positive('highPrice24h', current.high24h);
    const low24h = positive('lowPrice24h', current.low24h);
    const volumeUsd = nonnegative('turnover24h', current.volumeUsd);
    const fraction = raw.price24hPcnt === undefined || raw.price24hPcnt === ''
      ? current.change24h / 100 : Number(raw.price24hPcnt);
    if (price === null || high24h === null || low24h === null || high24h < low24h ||
        volumeUsd === null || !Number.isFinite(fraction)) return false;
    const openInterestUsd = market === 'futures' && raw.openInterestValue !== undefined &&
      raw.openInterestValue !== '' ? positive('openInterestValue', current.openInterestUsd || 0) : undefined;
    const funding = market === 'futures' && raw.fundingRate !== undefined &&
      raw.fundingRate !== '' ? Number(raw.fundingRate) * 100 : undefined;
    if (openInterestUsd === null || (funding !== undefined && !Number.isFinite(funding))) return false;
    const updated: RawTicker = {
      ...current, price, high24h, low24h, volumeUsd, change24h: fraction * 100,
      ...(openInterestUsd !== undefined ? { openInterestUsd } : {}),
      ...(funding !== undefined ? { fundingRatePct: funding } : {}),
    };
    // Bybit WS may arrive during a slow REST reconciliation. Preserve these
    // newer values when applying the historical REST response.
    entry.inFlightWsUpdates?.set(updated.symbol, updated);
    // Replace only this entry. Readers create their own MarketCoin views;
    // copying the complete market array for every ticker causes GC spikes.
    if (known) {
      entry.data[index] = updated;
      entry.updatedAt = eventAt;
      entry.streamAt = eventAt;
      entry.error = undefined;
      entry.httpStatus = undefined;
    } else {
      entry.transientBybit ??= new Map();
      entry.transientBybit.set(symbol, updated);
      while (entry.transientBybit.size > 350) {
        const oldest = entry.transientBybit.keys().next().value;
        if (oldest === undefined) break;
        entry.transientBybit.delete(oldest);
        if (!entry.symbolPositions?.has(oldest)) entry.lastWsSymbolAt?.delete(oldest);
      }
      // Important: a WS-only quote cannot magically certify the entire
      // exchange universe. REST reconciliation status is unaffected.
    }
    entry.lastWsSymbolAt ??= new Map();
    entry.lastWsSymbolAt.set(symbol, eventAt);
    this.publishLive([updated]);
    return true;
  }

  /** A recent Binance 24h REST catalog already includes each instrument's true trade count.
   * No request is made here. An expired/missing count must use the existing fallback.
   */
  getBinance24hTradeCount(market: MarketType, symbol: string): number | null {
    const entry = this.entries.get(`binance:${market}`);
    if (!entry || entry.snapshotAt === undefined || !entry.binanceTradeCounts) return null;
    const age = this.now() - entry.snapshotAt;
    if (age < 0 || age >= 60_000) return null;
    return entry.binanceTradeCounts.get(symbol) ?? null;
  }

  /** Preserve original collection times without performing any network work. */
  cached() {
    return Array.from(this.entries.entries()).map(([key, entry]) => ({
      key, data: entry.data, updatedAt: entry.updatedAt,
    }));
  }

  constructor(
    private request: typeof fetch = (input, init) => exchangeFetch(input, init),
    private now: () => number = Date.now,
  ) {}

  private entry(exchange: ExchangeId, market: MarketType): FeedEntry {
    const key = `${exchange}:${market}`;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { data: [], updatedAt: null, retryAt: 0 };
      this.entries.set(key, entry);
    }
    return entry;
  }

  status(exchange: ExchangeId, market: MarketType): MarketSourceStatus {
    const entry = this.entry(exchange, market);
    const now = this.now();
    const age = entry.updatedAt === null ? Infinity : now - entry.updatedAt;
    // A failed once-per-minute REST reconciliation must not mark the screener
    // stale while validated live miniTicker frames are still arriving.
    const wsFresh = entry.streamAt !== undefined && now - entry.streamAt >= 0 && now - entry.streamAt < FRESH_MS;
    const effectiveError = wsFresh ? undefined : entry.error;
    const freshMs = exchange === 'bybit' ? BYBIT_REST_FRESH_MS : FRESH_MS;
    return {
      exchange, marketType: market,
      status: age >= 0 && age < freshMs && !effectiveError ? 'live' : age >= 0 && age < STALE_MS ? 'stale' : 'unavailable',
      updatedAt: entry.updatedAt,
      ...(effectiveError ? { error: effectiveError } : {}),
      ...(effectiveError && entry.httpStatus ? { httpStatus: entry.httpStatus } : {}),
    };
  }

  diagnostics() {
    const now = this.now();
    return Array.from(this.entries.entries(), ([source, entry]) => ({
      source, status: this.status(source.split(':')[0] as ExchangeId, source.split(':')[1] as MarketType).status,
      quoteAgeMs: entry.updatedAt === null ? null : now - entry.updatedAt,
      wsAgeMs: entry.streamAt === undefined ? null : now - entry.streamAt,
      restSuccesses: entry.restSuccesses ?? 0, restFailures: entry.restFailures ?? 0,
      lastRestSuccessAt: entry.lastRestSuccessAt ?? null,
      lastRestFailureAt: entry.lastRestFailureAt ?? null,
      lastRestFailure: entry.lastRestFailure ?? null,
      lastHttpStatus: entry.httpStatus ?? null,
    }));
  }

  async get(exchange: ExchangeId, market: MarketType): Promise<RawTicker[]> {
    const entry = this.entry(exchange, market);
    const now = this.now();
    const fresh = this.status(exchange, market).status === 'live';
    const streamAlive = entry.streamAt !== undefined && now - entry.streamAt < 15_000;
    // Full-market REST snapshots reconcile symbols about every 40 seconds, but must
    // not block *any* browser while the WS is already delivering fresh data.
    const needReconcile = streamAlive && (!entry.snapshotAt || now - entry.snapshotAt >= 40_000);
    if (fresh && streamAlive) {
      if (needReconcile && !entry.pending && now >= entry.retryAt) {
        const background = this.load(exchange, market, entry);
        entry.pending = background;
        background.then(() => { if (entry.pending === background) entry.pending = undefined; },
          () => { if (entry.pending === background) entry.pending = undefined; });
      }
      return entry.data;
    }
    if (entry.pending) return entry.pending;
    // Bybit without a live ticker subscription must actually reconcile its
    // symbol universe on the 40s client cycle. Its 45s freshness window is
    // for UI status, not an excuse to silently skip this network refresh.
    if (exchange === 'bybit' && !streamAlive && entry.snapshotAt !== undefined &&
        now - entry.snapshotAt >= 40_000 && now >= entry.retryAt) {
      entry.pending = this.load(exchange, market, entry);
      try { return await entry.pending; } finally { entry.pending = undefined; }
    }
    if (fresh) return entry.data;
    if (now < entry.retryAt) {
      return this.status(exchange, market).status === 'unavailable' ? [] : entry.data;
    }
    entry.pending = this.load(exchange, market, entry);
    try { return await entry.pending; } finally { entry.pending = undefined; }
  }

  /**
   * Merge verified Binance mini-ticker WS values into the current REST
   * universe. Never invent new symbols from an incomplete WS change batch.
   * Full REST refreshes still discover listings and reconcile every minute.
   */
  applyBinanceMiniTickers(market: MarketType, ticks: unknown[]): number {
    const entry = this.entry('binance', market);
    if (!entry.data.length || !ticks.length) return 0;
    // Previously recreated and sorted the whole market on EVERY mini-ticker
    // batch. Keep a stable symbol index and patch only actually changed rows.
    const positions = entry.symbolPositions ??=
      new Map(entry.data.map((item, index) => [item.symbol, index]));
    entry.lastWsSymbolAt ??= new Map();
    let accepted = 0;
    const changedRows: RawTicker[] = [];
    for (const raw of ticks) {
      if (!raw || typeof raw !== 'object') continue;
      const tick = raw as Record<string, unknown>;
      const symbol = tick.s;
      // Binance Futures all-market streams can include COIN-M contracts after
      // market-stream unification. The screener is USD-M only (st=1).
      if (market === 'futures' && tick.st !== undefined && Number(tick.st) !== 1) continue;
      // A reconnect can replay older frames. Never let them roll a newer
      // per-symbol quote backwards, even if both events are <15s old.
      const eventAt = tick.E === undefined ? this.now() : Number(tick.E);
      if (!Number.isSafeInteger(eventAt) || eventAt > this.now() + 2_000 ||
          eventAt <= 0 || this.now() - eventAt > 15_000) continue;
      if (typeof symbol !== 'string') continue;
      const index = positions.get(symbol);
      if (index === undefined || entry.data[index]?.symbol !== symbol ||
          (entry.lastWsSymbolAt.get(symbol) ?? 0) > eventAt) continue;
      const price = Number(tick.c), open = Number(tick.o);
      const high = Number(tick.h), low = Number(tick.l), volume = Number(tick.q);
      if (![price, open, high, low, volume].every(Number.isFinite) ||
          price <= 0 || open <= 0 || high < low || volume < 0) continue;
      const old = entry.data[index];
      const change24h = (price - open) / open * 100;
      entry.lastWsSymbolAt.set(symbol, eventAt);
      accepted++;
      if (old.price === price && old.high24h === high && old.low24h === low &&
          old.volumeUsd === volume && old.change24h === change24h) continue;
      const update = { ...old, price, high24h: high, low24h: low,
        volumeUsd: volume, change24h };
      entry.data[index] = update;
      // A slow REST snapshot must never overwrite the newer WS tick.
      entry.inFlightWsUpdates?.set(symbol, update);
      changedRows.push(update);
    }
    if (accepted) {
      // fetchMarketCoins() applies its own requested volume sort; internal
      // ticker order is not used by the WebSocket subscriber lookup.
      entry.streamAt = this.now();
      entry.updatedAt = this.now();
      entry.error = undefined;
      entry.httpStatus = undefined;
      this.publishLive(changedRows);
    }
    return accepted;
  }

  private async load(exchange: ExchangeId, market: MarketType, entry: FeedEntry): Promise<RawTicker[]> {
    const urls = exchange === 'binance'
      ? market === 'spot'
        ? ['https://data-api.binance.vision/api/v3/ticker/24hr', 'https://api.binance.com/api/v3/ticker/24hr']
        : ['https://fapi.binance.com/fapi/v1/ticker/24hr']
      : ['https://api.bybit.com', 'https://api.bytick.com']
        .map(host => `${host}/v5/market/tickers?category=${market === 'spot' ? 'spot' : 'linear'}`);
    // Track only WS updates received while this REST request is pending.
    // This is bounded by the existing known-symbol universe.
    const overlay = new Map<string, RawTicker>();
    if (overlay) entry.inFlightWsUpdates = overlay;
    let error = 'Біржа не відповідає або повернула некоректні дані';
    let httpStatus: number | undefined;
    let retryMs = 15_000;
    let failureDetail = 'No valid response';
    for (const url of urls) {
      try {
        const response = await this.request(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'SignalHook/1.0' },
          signal: AbortSignal.timeout(4000),
        });
        if (!response.ok) {
          httpStatus = response.status;
          failureDetail = `HTTP ${response.status} from ${new URL(url).hostname}`;
          error = response.status === 451
            ? 'Біржа відхилила запит через обмеження доступу (HTTP 451)'
            : response.status === 403
              ? 'Біржа відхилила запит (HTTP 403): можлива IP-квота або обмеження доступу'
              : response.status === 429
                ? 'Перевищено ліміт запитів біржі (HTTP 429)'
                : `Помилка біржі (HTTP ${response.status})`;
          // Do not retry denied or rate-limited requests through another hostname.
          if ([403, 451, 429].includes(response.status)) {
            const retryAfter = response.headers.get('retry-after');
            const seconds = retryAfter === null ? NaN : Number(retryAfter);
            const retryDate = retryAfter ? Date.parse(retryAfter) : NaN;
            retryMs = response.status === 403 && exchange === 'bybit' ? 600_000 : 60_000;
            if (Number.isFinite(seconds) && seconds >= 0) retryMs = Math.max(retryMs, seconds * 1000);
            else if (Number.isFinite(retryDate)) retryMs = Math.max(retryMs, retryDate - this.now());
            break;
          }
          continue;
        }
        const json = await response.json();
        if (exchange === 'bybit' && json?.retCode !== 0) {
          failureDetail = `Bybit retCode ${json?.retCode ?? 'unknown'} from ${new URL(url).hostname}`;
          error = `Помилка API Bybit (код ${json?.retCode ?? 'невідомий'})`;
          if (json?.retCode === 10006) { retryMs = 60_000; break; }
          continue;
        }
        const list = exchange === 'binance' ? json : json?.result?.list;
        if (!Array.isArray(list) || list.length === 0) {
          failureDetail = `Invalid or empty ticker array from ${new URL(url).hostname}`;
          continue;
        }
        let data = list.filter(item => typeof item?.symbol === 'string' && item.symbol.endsWith('USDT'))
          .map((item): RawTicker => ({
            symbol: item.symbol, baseAsset: item.symbol.slice(0, -4), quoteAsset: 'USDT', exchange, marketType: market,
            price: Number(item.lastPrice),
            change24h: exchange === 'binance' ? Number(item.priceChangePercent) : Number(item.price24hPcnt) * 100,
            volumeUsd: Number(exchange === 'binance' ? item.quoteVolume : item.turnover24h),
            high24h: Number(exchange === 'binance' ? item.highPrice : item.highPrice24h),
            low24h: Number(exchange === 'binance' ? item.lowPrice : item.lowPrice24h),
            // The existing Bybit all-linear-tickers response already contains
            // real openInterestValue and fundingRate; no additional HTTP call.
            ...(exchange === 'bybit' && market === 'futures' &&
              item.openInterestValue !== undefined && item.openInterestValue !== '' &&
              Number.isFinite(Number(item.openInterestValue)) && Number(item.openInterestValue) > 0
              ? { openInterestUsd: Number(item.openInterestValue) } : {}),
            ...(exchange === 'bybit' && market === 'futures' &&
              item.fundingRate !== undefined && item.fundingRate !== '' &&
              Number.isFinite(Number(item.fundingRate))
              ? { fundingRatePct: Number(item.fundingRate) * 100 } : {}),
          }))
          .filter(t => Number.isFinite(t.price) && t.price > 0 && Number.isFinite(t.volumeUsd) && t.volumeUsd >= 0
            && Number.isFinite(t.change24h) && Number.isFinite(t.high24h) && Number.isFinite(t.low24h))
          .sort((a, b) => b.volumeUsd - a.volumeUsd);
        if (!data.length) {
          failureDetail = `No valid USDT tickers from ${new URL(url).hostname}`;
          error = 'Біржа повернула порожні або некоректні USDT-котирування';
          continue;
        }
        if (overlay.size) {
          const latest = new Map(data.map(t => [t.symbol, t]));
          for (const [symbol, tick] of overlay) {
            if (latest.has(symbol)) latest.set(symbol, tick);
          }
          data = [...latest.values()].sort((a, b) => b.volumeUsd - a.volumeUsd);
        }
        if (entry.inFlightWsUpdates === overlay) entry.inFlightWsUpdates = undefined;
        if (exchange === 'binance') {
          // Do not copy this extra field into every public ticker / browser payload.
          const counts = new Map<string, number>();
          for (const item of list) {
            if (typeof item?.symbol === 'string' && item.symbol.endsWith('USDT') &&
                Number.isSafeInteger(item.count) && item.count >= 0) {
              counts.set(item.symbol, item.count);
            }
          }
          entry.binanceTradeCounts = counts;
        }
        entry.data = data;
        entry.symbolPositions = new Map(data.map((ticker, index) => [ticker.symbol, index]));
        for (const symbol of entry.lastWsSymbolAt?.keys() ?? []) {
          if (!entry.symbolPositions.has(symbol)) entry.lastWsSymbolAt?.delete(symbol);
        }
        if (exchange === 'bybit') {
          // New REST catalog may delist pairs; prevent retaining old keys.
          if (entry.lastWsSymbolAt) {
            for (const symbol of entry.lastWsSymbolAt.keys()) {
              if (!entry.symbolPositions.has(symbol)) entry.lastWsSymbolAt.delete(symbol);
            }
          }
        }
        entry.snapshotAt = this.now();
        entry.updatedAt = this.now();
        entry.restSuccesses = (entry.restSuccesses ?? 0) + 1;
        entry.lastRestSuccessAt = this.now();
        entry.retryAt = 0;
        entry.error = undefined;
        entry.httpStatus = undefined;
        return data;
      } catch (cause) {
        // An application IP-budget cooldown is authoritative. Attempting a
        // second Bybit hostname would not evade the same outgoing IP limit.
        if (cause instanceof ExchangeBudgetError) {
          error = 'Тимчасова пауза локального ліміту запитів біржі';
          failureDetail = `Local REST budget: ${cause.message}`.slice(0, 240);
          retryMs = 15_000;
          break;
        }
        // Keep the precise transport cause in operator metrics / VPS logs.
        // Never expose backend addresses, credentials or request headers.
        const reason = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
        failureDetail = `${new URL(url).hostname}: ${reason}`.slice(0, 240);
      }
    }
    if (entry.inFlightWsUpdates === overlay) entry.inFlightWsUpdates = undefined;
    const lastLogged = entry.lastRestFailureAt ?? 0;
    entry.restFailures = (entry.restFailures ?? 0) + 1;
    entry.lastRestFailureAt = this.now();
    entry.lastRestFailure = failureDetail;
    if (this.now() - lastLogged > 60_000) {
      console.warn(`[MarketTickerFeed] ${exchange}:${market} REST reconciliation failed: ${error}; ${failureDetail}`);
    }
    entry.error = error;
    entry.httpStatus = httpStatus;
    entry.retryAt = this.now() + retryMs;
    return this.status(exchange, market).status === 'unavailable' ? [] : entry.data;
  }
}

export const marketTickerFeed = new MarketTickerFeed();

export function getMarketSourceStatuses(params: {
  exchange?: 'all' | ExchangeId;
  marketType?: 'all' | MarketType;
}): MarketSourceStatus[] {
  const exchanges: ExchangeId[] = params.exchange && params.exchange !== 'all' ? [params.exchange] : ['binance', 'bybit'];
  const markets: MarketType[] = params.marketType && params.marketType !== 'all' ? [params.marketType] : ['futures', 'spot'];
  return exchanges.flatMap(exchange => markets.map(market => marketTickerFeed.status(exchange, market)));
}
