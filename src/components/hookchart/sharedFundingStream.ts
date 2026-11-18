import type { ExchangeId } from '../../types';
import { fetchSharedChartJson } from '../../utils/sharedChartRequests';

const BINANCE_FUTURES_API = 'https://fapi.binance.com';
const BYBIT_API = 'https://api.bybit.com';
const FUNDING_POLL_MS = 60_000;
const HISTORY_POLL_MS = 15 * 60_000;

export type FundingSnapshot = Readonly<{ rate: number; history: number[] }>;
export type FundingPacket = {
  rate: number;
  history?: number[];
  nextFundingAt?: number;
};
export const EMPTY_FUNDING: FundingSnapshot = Object.freeze({
  rate: Number.NaN, history: [],
});

type Loader = (exchange: ExchangeId, symbol: string, refreshHistory: boolean) => Promise<FundingPacket>;
type Listener = (snapshot: FundingSnapshot) => void;
type Clock = {
  now: () => number;
  every: (callback: () => void, interval: number) => unknown;
  cancel: (timer: unknown) => void;
};
type Entry = {
  listeners: Set<Listener>;
  snapshot: FundingSnapshot;
  lastHistoryFetchAt: number;
  nextFundingAt: number;
  pulling: boolean;
  stopped: boolean;
  timer: unknown;
};

const realClock: Clock = {
  now: () => Date.now(),
  every: (callback, interval) => setInterval(callback, interval),
  cancel: timer => clearInterval(timer as ReturnType<typeof setInterval>),
};

/** Fetch the same exchange endpoints as the old chart-local funding timer. */
export async function fetchHookChartFunding(
  exchange: ExchangeId, symbol: string, refreshHistory: boolean,
): Promise<FundingPacket> {
  if (exchange === 'binance') {
    const [premium, history] = await Promise.all([
      fetchSharedChartJson(`${BINANCE_FUTURES_API}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`),
      refreshHistory
        ? fetchSharedChartJson(`${BINANCE_FUTURES_API}/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=100`, 'funding-history')
          .catch(() => null) // Optional history must not invalidate a fresh rate.
        : Promise.resolve(null),
    ]);
    return {
      rate: premium?.lastFundingRate == null ? Number.NaN : Number(premium.lastFundingRate),
      history: refreshHistory && Array.isArray(history)
        ? history.map((row: any) => Number(row.fundingRate)).filter(Number.isFinite)
        : undefined,
      nextFundingAt: Number(premium?.nextFundingTime),
    };
  }
  const [ticker, history] = await Promise.all([
    fetchSharedChartJson(`${BYBIT_API}/v5/market/tickers?category=linear&symbol=${encodeURIComponent(symbol)}`),
    refreshHistory
      ? fetchSharedChartJson(`${BYBIT_API}/v5/market/funding/history?category=linear&symbol=${encodeURIComponent(symbol)}&limit=100`, 'funding-history')
        .catch(() => null) // Rate and historical endpoint have separate reliability.
      : Promise.resolve(null),
  ]);
  const value = ticker?.result?.list?.[0]?.fundingRate;
  return {
    rate: ticker?.retCode === 0 && value != null ? Number(value) : Number.NaN,
    history: refreshHistory && history?.retCode === 0 && Array.isArray(history?.result?.list)
      ? history.result.list.map((row: any) => Number(row.fundingRate)).filter(Number.isFinite)
      : undefined,
    nextFundingAt: Number(ticker?.result?.list?.[0]?.nextFundingTime),
  };
}

function equalHistory(a: readonly number[], b: readonly number[]) {
  return a === b || (a.length === b.length && a.every((value, index) => Object.is(value, b[index])));
}

/**
 * Exactly one funding poll, history timer and parsed snapshot per
 * exchange/symbol/browser tab, regardless of how many chart components use it.
 * Indicator visibility and per-chart styling never change the shared data.
 */
export function createSharedFundingSubscriptions(loader: Loader = fetchHookChartFunding, clock: Clock = realClock) {
  const entries = new Map<string, Entry>();

  const subscribe = (exchange: ExchangeId, symbol: string, listener: Listener): (() => void) => {
    const key = `${exchange}:${symbol.trim().toUpperCase()}`;
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        listeners: new Set(), snapshot: EMPTY_FUNDING, pulling: false, stopped: false,
        lastHistoryFetchAt: 0, nextFundingAt: 0, timer: null,
      };
      entries.set(key, entry);
      const current = entry;
      const poll = async () => {
        if (current.stopped || current.pulling) return;
        current.pulling = true;
        const now = clock.now();
        const refreshHistory = now - current.lastHistoryFetchAt >= HISTORY_POLL_MS ||
          (current.nextFundingAt > 0 && now >= current.nextFundingAt);
        try {
          const packet = await loader(exchange, symbol.trim().toUpperCase(), refreshHistory);
          if (current.stopped || entries.get(key) !== current) return;
          // A historical rate-limit/error must not erase the last valid
          // series, nor postpone the next attempt for fifteen minutes.
          const history = refreshHistory && packet.history !== undefined
            ? packet.history : current.snapshot.history;
          const nextHistory = equalHistory(current.snapshot.history, history) ? current.snapshot.history : history;
          if (!Object.is(current.snapshot.rate, packet.rate) || nextHistory !== current.snapshot.history) {
            current.snapshot = Object.freeze({ rate: packet.rate, history: nextHistory });
            for (const subscriber of [...current.listeners]) {
              try { subscriber(current.snapshot); } catch { /* one chart must not interrupt another */ }
            }
          }
          if (refreshHistory && packet.history !== undefined)
            current.lastHistoryFetchAt = clock.now();
          if (Number.isFinite(packet.nextFundingAt) && packet.nextFundingAt! > clock.now()) {
            current.nextFundingAt = packet.nextFundingAt!;
          } else if (refreshHistory && packet.history !== undefined &&
                     current.nextFundingAt > 0 && current.nextFundingAt <= clock.now()) {
            // After settlement, an API response without a new settlement time
            // must not force an identical history download every minute.
            current.nextFundingAt = 0;
          }
        } catch {
          if (current.stopped || entries.get(key) !== current) return;
          if (!Number.isNaN(current.snapshot.rate) || current.snapshot.history.length) {
            current.snapshot = EMPTY_FUNDING;
            for (const subscriber of [...current.listeners]) {
              try { subscriber(current.snapshot); } catch {}
            }
          }
        } finally {
          current.pulling = false;
        }
      };
      entry.timer = clock.every(() => { void poll(); }, FUNDING_POLL_MS);
      void poll();
    }
    entry.listeners.add(listener);
    try { listener(entry.snapshot); } catch {}
    const registered = entry;
    return () => {
      registered.listeners.delete(listener);
      if (!registered.listeners.size && entries.get(key) === registered) {
        registered.stopped = true;
        clock.cancel(registered.timer);
        entries.delete(key);
      }
    };
  };

  return { subscribe, activeScopes: () => entries.size };
}

export const subscribeSharedHookChartFunding = createSharedFundingSubscriptions().subscribe;
