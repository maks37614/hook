import type { Kline, SmartAnalysisData, Timeframe } from '../src/types';
import { chartExchangeFetch } from './exchangeHttp';
import { fetchKlines } from './marketService';

type BTCContext = SmartAnalysisData['btcContext'];
type Structure = BTCContext['timeframes']['15m'];
type TF = '15m' | '5m' | '1m';
const SECONDS: Record<TF, number> = { '15m': 900, '5m': 300, '1m': 60 };
const BTC = 'BTCUSDT';
const CACHE_MS = 30_000;

const unavailable: Structure = {
  direction: 'sideways', structure: 'unknown', label: 'Немає підтверджених свічок Binance Futures',
};

/** Accept closed, contiguous, recent candles; timestamps from fetchKlines are seconds. */
export function getVerifiedClosedBtcCandles(raw: Kline[], timeframe: TF, now = Date.now()): Kline[] {
  const seconds = SECONDS[timeframe];
  const limit = now / 1000;
  const valid = (raw || []).filter(c =>
    c && [c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite) &&
    c.open > 0 && c.close > 0 && c.high >= Math.max(c.open, c.close) &&
    c.low > 0 && c.low <= Math.min(c.open, c.close) &&
    c.volume >= 0 && c.time + seconds <= limit && c.time > 1_000_000_000)
    .sort((a, b) => a.time - b.time);
  // Reject stale candles. Live BTC structure must not be inferred from yesterday.
  if (!valid.length || limit - (valid[valid.length - 1].time + seconds) > seconds * 2 + 120) return [];
  let start = valid.length - 1;
  while (start > 0 && valid[start].time - valid[start - 1].time === seconds) start--;
  return valid.slice(start);
}

export function describeVerifiedBtcStructure(bars: Kline[]): Structure {
  if (bars.length < 6) return unavailable;
  const previous = bars.slice(-6, -3);
  const recent = bars.slice(-3);
  const prevHigh = Math.max(...previous.map(b => b.high));
  const prevLow = Math.min(...previous.map(b => b.low));
  const recentHigh = Math.max(...recent.map(b => b.high));
  const recentLow = Math.min(...recent.map(b => b.low));
  if (recentHigh > prevHigh && recentLow > prevLow) return {
    direction: 'up', structure: 'HH_HL', label: 'Вищі максимуми та мінімуми',
  };
  if (recentHigh < prevHigh && recentLow < prevLow) return {
    direction: 'down', structure: 'LH_LL', label: 'Нижчі максимуми та мінімуми',
  };
  return {
    direction: 'sideways', structure: 'range', label: 'Змішана структура / діапазон',
  };
}

/** Truthful ticker priority: public Binance 24h ticker, then verified last CLOSED 1m bar.
 * Never treat a candle close as a real-time quote without attribution.
 */
export function buildVerifiedBtcContext(
  candles: Record<TF, Kline[]>, rawTicker: unknown, now = Date.now(),
): BTCContext {
  const c15 = getVerifiedClosedBtcCandles(candles['15m'], '15m', now);
  const c5 = getVerifiedClosedBtcCandles(candles['5m'], '5m', now);
  const c1 = getVerifiedClosedBtcCandles(candles['1m'], '1m', now);
  const tf15 = describeVerifiedBtcStructure(c15);
  const tf5 = describeVerifiedBtcStructure(c5);
  const tf1 = describeVerifiedBtcStructure(c1);
  const ticker = rawTicker && typeof rawTicker === 'object'
    ? rawTicker as Record<string, unknown> : null;
  const tickerValid = ticker?.symbol === BTC &&
    Number.isFinite(Number(ticker?.lastPrice)) && Number(ticker?.lastPrice) > 0 &&
    Number.isFinite(Number(ticker?.closeTime)) &&
    Math.abs(now - Number(ticker?.closeTime)) < 3 * 60_000;
  const btcPrice = tickerValid ? Number(ticker!.lastPrice) :
    c1.length ? c1[c1.length - 1].close : null;
  const priceSource: BTCContext['priceSource'] = tickerValid ? 'binance_ticker' :
    c1.length ? 'closed_1m_candle' : null;
  const changeRaw = Number(ticker?.priceChangePercent);
  const change24h = tickerValid && ticker?.priceChangePercent != null &&
    Number.isFinite(changeRaw) ? changeRaw : null;
  const valid15 = tf15.structure !== 'unknown';
  const valid5 = tf5.structure !== 'unknown';
  const overallStructure: BTCContext['overallStructure'] = !valid15 || !valid5
    ? 'unknown' : tf15.structure === tf5.structure ? tf15.structure : 'range';
  const overallStructureLabel = overallStructure === 'unknown'
    ? 'Структура BTC недоступна: потрібні актуальні закриті свічки 15m і 5m Binance Futures'
    : overallStructure === 'HH_HL'
      ? 'Вищі максимуми та мінімуми BTC на 15m і 5m'
      : overallStructure === 'LH_LL'
        ? 'Нижчі максимуми та мінімуми BTC на 15m і 5m'
        : 'Структура BTC неоднозначна на 15m і 5m';
  const last5 = c5.at(-1);
  const change5 = last5 ? (last5.close / last5.open - 1) * 100 : null;
  const hasSharpImpulse = change5 !== null && Math.abs(change5) >= 0.75;
  const impulseType: BTCContext['impulseType'] = hasSharpImpulse
    ? change5! > 0 ? 'pump' : 'dump' : 'none';
  const impulseDescription = change5 === null
    ? 'Дані останньої закритої 5m свічки BTC недоступні'
    : hasSharpImpulse
      ? 'Остання закрита 5m свічка BTC: ' + (change5 >= 0 ? '+' : '') +
        change5.toFixed(2) + '%'
      : 'Немає підтвердженого імпульсу в останній закритій 5m свічці';
  return {
    btcPrice, change24h, priceSource,
    available: btcPrice !== null || valid15 || valid5 || tf1.structure !== 'unknown',
    timeframes: { '15m': tf15, '5m': tf5, '1m': tf1 },
    overallStructure, overallStructureLabel,
    hasSharpImpulse, impulseType, impulseDescription,
    upcomingNews: [], // Macro calendar provider not connected; do not invent CPI/FED.
  };
}

let saved: { at: number; value: BTCContext } | null = null;
let inflight: Promise<BTCContext> | null = null;

/** One shared BTC context for all symbols/users instead of four REST calls
 * per Smart Analysis panel. Uses the same chart-priority exchange budget
 * as the working /api/klines endpoint, not background-scan headroom.
 */
export function getVerifiedBtcContext(): Promise<BTCContext> {
  const now = Date.now();
  if (saved && now - saved.at < CACHE_MS) return Promise.resolve(saved.value);
  if (inflight) return inflight;
  const candle = async (tf: TF) =>
    fetchKlines('binance', 'futures', BTC, tf, 25,
      undefined, undefined, { chart: true }).catch(() => [] as Kline[]);
  const ticker = async (): Promise<unknown> => {
    try {
      const response = await chartExchangeFetch(
        'https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=' + BTC,
        { signal: AbortSignal.timeout(4_000) },
      );
      return response.ok ? await response.json() : null;
    } catch { return null; }
  };
  inflight = Promise.all([candle('15m'), candle('5m'), candle('1m'), ticker()])
    .then(([a,b,c,d]) => {
      const value = buildVerifiedBtcContext({ '15m': a, '5m': b, '1m': c }, d);
      saved = { at: Date.now(), value };
      return value;
    })
    .finally(() => { inflight = null; });
  return inflight;
}
