import type { ExchangeId, MarketType, RegularIndicatorValues, Timeframe } from '../types';

/**
 * Shared ordinary-screener OI reader for the server and browser fallback.
 * Keeps the same strict validation on both paths and is NEVER called by the
 * dedicated full-universe early W/M scan.
 */
const OI_INTERVALS: Partial<Record<Timeframe, { binance: string; bybit: string; ms: number }>> = {
  '5m': { binance: '5m', bybit: '5min', ms: 300_000 },
  '15m': { binance: '15m', bybit: '15min', ms: 900_000 },
  '1h': { binance: '1h', bybit: '1h', ms: 3_600_000 },
  '4h': { binance: '4h', bybit: '4h', ms: 14_400_000 },
  '1d': { binance: '1d', bybit: '1d', ms: 86_400_000 },
};

export type RegularOIReason =
  | 'available'
  | 'spot'
  | 'unsupported-timeframe'
  | 'invalid-symbol'
  | 'rate-limited'
  | 'http-error'
  | 'network-error'
  | 'invalid-response'
  | 'incomplete-history'
  | 'history-gap'
  | 'stale-history'
  | 'misaligned';

export interface VerifiedOIPoint {
  /** Exchange-provided period timestamp in milliseconds. */
  t: number;
  /** Native contract/coin OI quantity; never price-driven USD change. */
  amount: number;
  usd?: number;
}

export interface VerifiedOISnapshot {
  changePct: number;
  amount: number;
  timestamp: number;
  intervalMs: number;
  usd: number | null;
}

export interface RegularOIResult {
  snapshot: VerifiedOISnapshot | null;
  reason: RegularOIReason;
}

export function withAlignedRegularOI(
  indicators: RegularIndicatorValues, result: RegularOIResult, source: 'server' | 'browser',
): RegularIndicatorValues {
  const snapshot = result.snapshot;
  const aligned = snapshot && snapshot.timestamp === indicators.candleContext?.closedAt;
  return { ...indicators, oiChangePct: aligned ? snapshot.changePct : undefined,
    oiUpdatedAt: aligned ? snapshot.timestamp : undefined, oiSource: aligned ? source : undefined,
    oiAvailability: aligned ? 'available' : snapshot ? 'misaligned' : result.reason };
}

export function hasAlignedRegularOI(indicators: RegularIndicatorValues | undefined): boolean {
  return !!indicators?.candleContext && indicators.oiAvailability === 'available'
    && Number.isFinite(indicators.oiChangePct) && Number.isFinite(indicators.oiUpdatedAt)
    && indicators.oiUpdatedAt === indicators.candleContext.closedAt;
}

export function getRegularOIRequest(
  exchange: ExchangeId, market: MarketType, symbol: string, timeframe: Timeframe,
): { url: string; intervalMs: number } | RegularOIResult {
  if (market !== 'futures') return { snapshot: null, reason: 'spot' };
  const interval = OI_INTERVALS[timeframe];
  if (!interval) return { snapshot: null, reason: 'unsupported-timeframe' };
  if (!/^[A-Z0-9]{3,30}$/.test(symbol)) return { snapshot: null, reason: 'invalid-symbol' };
  const encoded = encodeURIComponent(symbol);
  return {
    intervalMs: interval.ms,
    // Request additional records because Binance can omit quiet intervals,
    // and Bybit returns newest observations first. Never manufacture gaps.
    url: exchange === 'binance'
      ? `https://fapi.binance.com/futures/data/openInterestHist?symbol=${encoded}&period=${interval.binance}&limit=8`
      : `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${encoded}&intervalTime=${interval.bybit}&limit=8`,
  };
}

export function verifyOIHistory(
  rows: VerifiedOIPoint[], intervalMs: number, nowMs: number,
): VerifiedOISnapshot | null {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0 || !Number.isFinite(nowMs)) return null;
  const ordered = rows.filter(row => Number.isFinite(row.t) && row.t > 0 &&
    Number.isFinite(row.amount) && row.amount > 0).sort((a,b) => a.t - b.t);
  if (ordered.length < 2 || ordered.length !== rows.length) return null;
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].t - ordered[i-1].t !== intervalMs) return null;
  }
  const last = ordered[ordered.length - 1], previous = ordered[ordered.length - 2];
  if (last.t > nowMs + 60_000 || nowMs - last.t > intervalMs * 2 + 90_000) return null;
  const usd = last.usd !== undefined && Number.isFinite(last.usd) && last.usd > 0
    ? last.usd : null;
  return {
    changePct: Number(((last.amount - previous.amount) / previous.amount * 100).toFixed(3)),
    amount: last.amount, timestamp: last.t, intervalMs, usd,
  };
}

export function parseBinanceOIHistory(payload: unknown): VerifiedOIPoint[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((row: any) => ({
    t: Number(row?.timestamp), amount: Number(row?.sumOpenInterest),
    usd: Number(row?.sumOpenInterestValue),
  }));
}

export function parseBybitOIHistory(payload: unknown): VerifiedOIPoint[] {
  const data = payload as { retCode?: number; result?: { list?: unknown[] } } | null;
  if (!data || data.retCode !== 0 || !Array.isArray(data.result?.list)) return [];
  return data.result.list.map((row: any) => ({
    t: Number(row?.timestamp), amount: Number(row?.openInterest),
  }));
}

/** Choose the three NEWEST consecutive exchange records regardless of API order. */
export function evaluateRegularOIHistory(
  exchange: ExchangeId, payload: unknown, intervalMs: number, nowMs: number,
): RegularOIResult {
  if (exchange === 'bybit' &&
    (!payload || (payload as { retCode?: number }).retCode !== 0)) {
    return { snapshot: null, reason: 'invalid-response' };
  }
  if (exchange === 'binance' && !Array.isArray(payload)) {
    return { snapshot: null, reason: 'invalid-response' };
  }
  const rows = exchange === 'binance' ? parseBinanceOIHistory(payload) : parseBybitOIHistory(payload);
  if (rows.some(r => !Number.isFinite(r.t) || r.t <= 0 || !Number.isFinite(r.amount) || r.amount <= 0)) {
    return { snapshot: null, reason: 'invalid-response' };
  }
  if (rows.length < 3) return { snapshot: null, reason: 'incomplete-history' };
  const latest = [...rows].sort((a,b) => a.t - b.t).slice(-3);
  const last = latest[2];
  if (last.t > nowMs + 60_000 || nowMs - last.t > intervalMs * 2 + 90_000) {
    return { snapshot: null, reason: 'stale-history' };
  }
  const snapshot = verifyOIHistory(latest, intervalMs, nowMs);
  return snapshot ? { snapshot, reason: 'available' } : { snapshot: null, reason: 'history-gap' };
}

/** Safe to call directly from a browser OR via the server's shared IP-budget fetcher. */
export async function requestRegularOI(
  exchange: ExchangeId, market: MarketType, symbol: string, timeframe: Timeframe,
  request: typeof fetch, options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<RegularOIResult> {
  const target = getRegularOIRequest(exchange, market, symbol, timeframe);
  if ('reason' in target) return target;
  try {
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 5000);
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    const response = await request(target.url, { signal });
    if (!response.ok) return {
      snapshot: null, reason: response.status === 429 || response.status === 418
        ? 'rate-limited' : 'http-error',
    };
    const payload: unknown = await response.json();
    return evaluateRegularOIHistory(exchange, payload, target.intervalMs, Date.now());
  } catch {
    return { snapshot: null, reason: 'network-error' };
  }
}

export const REGULAR_OI_REASON_UK: Record<RegularOIReason, string> = {
  available: 'Реальні дані OI отримані',
  spot: 'Для споту OI не застосовується',
  'unsupported-timeframe': 'OI за 1m не публікується біржею',
  'invalid-symbol': 'Некоректний символ пари',
  'rate-limited': 'Біржа тимчасово обмежує частоту запитів OI',
  'http-error': 'Біржа відхилила запит історії OI',
  'network-error': 'Не вдалося отримати OI з мережі (тайм-аут, CORS або недоступний API)',
  'invalid-response': 'Біржа повернула некоректні дані OI',
  'incomplete-history': 'Недостатньо історичних точок OI',
  'history-gap': 'Є пропуски між історичними точками OI',
  'stale-history': 'Остання точка OI застаріла або має некоректний час',
  misaligned: 'Період OI не збігається із закриттям свічки',
};
