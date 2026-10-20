import type { ExchangeId, MarketType, Timeframe, Kline, SmartAnalysisData, DetectedFormation } from '../src/types';
import { normalizeExchangeSymbol } from '../src/utils/marketSymbols';
import { fetchKlines, fetchOrderBook, fetchDualExchangeOI } from './marketService';
import { marketTickerFeed } from './marketTickerFeed';
import { fetchHookChartOIHistory, type OIHistoryPoint } from './hookchartOI';
import { exchangeFetch } from './exchangeGateway';

const cache = new Map<string, { until: number; value: SmartAnalysisData }>();
const pending = new Map<string, Promise<SmartAnalysisData>>();
function ema(values: number[], period: number) {
  const alpha = 2 / (period + 1); return values.reduce((previous, value) => previous + alpha * (value - previous), values[0]);
}
function rsi(values: number[], period = 14) {
  let gains = 0, losses = 0;
  for (let n = 1; n <= period; n++) { const diff = values[n] - values[n - 1]; gains += Math.max(diff, 0); losses += Math.max(-diff, 0); }
  gains /= period; losses /= period;
  for (let n = period + 1; n < values.length; n++) { const diff = values[n] - values[n - 1]; gains = (gains * (period - 1) + Math.max(diff, 0)) / period; losses = (losses * (period - 1) + Math.max(-diff, 0)) / period; }
  return gains === 0 && losses === 0 ? 50 : losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
}
function validCandles(rows: Kline[]) {
  return rows.length >= 50 && rows.every(row => [row.time, row.open, row.high, row.low, row.close, row.volume].every(Number.isFinite) && row.close > 0 && row.low > 0 && row.high >= Math.max(row.open, row.close) && row.low <= Math.min(row.open, row.close) && row.volume >= 0);
}
function poc(rows: Kline[]): number | null {
  const low = Math.min(...rows.map(row => row.low)), high = Math.max(...rows.map(row => row.high));
  if (!rows.some(row => row.volume > 0)) return null;
  if (high === low) return low;
  const width = (high - low) / 40, bins = new Array<number>(40).fill(0);
  for (const row of rows) { const index = Math.min(39, Math.max(0, Math.floor(((row.high + row.low + row.close) / 3 - low) / width))); bins[index] += row.volume; }
  const index = bins.indexOf(Math.max(...bins)); return low + (index + .5) * width;
}
async function json(url: string) {
  const response = await exchangeFetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const body = await response.json(); return body?.retCode !== undefined && body.retCode !== 0 ? null : body;
}
async function book(exchange: ExchangeId, market: MarketType, symbol: string): Promise<SmartAnalysisData['orderbook']> {
  try {
    const data = await fetchOrderBook(exchange, market, symbol, 50);
    const bids = data.bids.filter(([price, amount]) => price > 0 && amount > 0 && Number.isFinite(price * amount));
    const asks = data.asks.filter(([price, amount]) => price > 0 && amount > 0 && Number.isFinite(price * amount));
    if (!bids.length || !asks.length || asks[0][0] <= bids[0][0]) return null;
    const sum = (rows: number[][]) => rows.reduce((total, [price, amount]) => total + price * amount, 0);
    const wall = (rows: number[][]) => rows.reduce((largest, level) => level[0] * level[1] > largest[0] * largest[1] ? level : largest);
    const bid = wall(bids), ask = wall(asks);
    return { bidAskRatio: sum(bids) / sum(asks), spreadPct: (asks[0][0] - bids[0][0]) / bids[0][0] * 100,
      bestBid: bids[0][0], bestAsk: asks[0][0], bidWallPrice: bid[0], bidWallUsd: bid[0] * bid[1], askWallPrice: ask[0], askWallUsd: ask[0] * ask[1] };
  } catch { return null; }
}
async function btc(): Promise<SmartAnalysisData['btcContext']> {
  try {
    const [tickers, ...candles] = await Promise.all([marketTickerFeed.get('binance', 'futures'), ...(['15m', '5m', '1m'] as Timeframe[]).map(tf => fetchKlines('binance', 'futures', 'BTCUSDT', tf, 60))]);
    const ticker = tickers.find(row => row.symbol === 'BTCUSDT');
    if (!ticker || marketTickerFeed.status('binance', 'futures').status !== 'live' || candles.some(rows => !validCandles(rows))) return null;
    return { price: ticker.price, change24h: ticker.change24h, timeframes: candles.map((rows, index) => {
      const first = rows.at(-6)!.close, last = rows.at(-1)!.close, change = (last - first) / first;
      return { timeframe: ['15m', '5m', '1m'][index], direction: change > .001 ? 'up' : change < -.001 ? 'down' : 'sideways' };
    }) };
  } catch { return null; }
}
function history(currentUsd: number | undefined, rows: OIHistoryPoint[]) {
  if (currentUsd === undefined || !Number.isFinite(currentUsd) || currentUsd < 0) return null;
  const latest = rows.at(-1), before = latest ? [...rows].reverse().find(row => row.t <= latest.t - 3600_000) : undefined;
  return { currentUsd, history: rows.slice(-13).map(row => row.v), change1hPct: before && before.v > 0 && latest && Date.now() - latest.t < 15 * 60_000 ? (latest.v - before.v) / before.v * 100 : null };
}
async function derivatives(symbol: string, price: number): Promise<SmartAnalysisData['derivatives']> {
  const [oi, past, binance, bybit] = await Promise.allSettled([
    fetchDualExchangeOI(symbol, undefined, price), fetchHookChartOIHistory(symbol, '5m'),
    json('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=' + encodeURIComponent(symbol)),
    json('https://api.bybit.com/v5/market/tickers?category=linear&symbol=' + encodeURIComponent(symbol)),
  ]);
  const current = oi.status === 'fulfilled' ? oi.value : undefined;
  const rows = past.status === 'fulfilled' ? past.value : undefined;
  const rate = (value: unknown) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) * 100 : null;
  return {
    binanceOI: history(current?.binance?.valueUsd, rows?.binance || []), bybitOI: history(current?.bybit?.valueUsd, rows?.bybit || []),
    binanceFundingRate: rate(binance.status === 'fulfilled' ? binance.value?.lastFundingRate : undefined),
    bybitFundingRate: rate(bybit.status === 'fulfilled' ? bybit.value?.result?.list?.[0]?.fundingRate : undefined),
  };
}

export async function generateSmartAnalysis(params: { symbol: string; exchange?: ExchangeId; marketType?: MarketType; timeframe?: Timeframe; formation?: DetectedFormation | null; currentPrice?: number; klines?: Kline[] }): Promise<SmartAnalysisData> {
  const symbol = normalizeExchangeSymbol(params.symbol), exchange = params.exchange || 'binance', marketType = params.marketType || 'futures', timeframe = params.timeframe || '1h';
  if (!/^[\p{L}\p{M}\p{N}]{2,30}$/u.test(symbol) || !['binance', 'bybit'].includes(exchange) || !['spot', 'futures'].includes(marketType) || !['1m', '5m', '15m', '1h', '4h', '1d'].includes(timeframe)) throw new Error('Непідтримуваний інструмент');
  const key = [exchange, marketType, symbol, timeframe].join(':');
  const cached = cache.get(key); if (cached && cached.until > Date.now()) return cached.value;
  if (pending.has(key)) return pending.get(key)!;
  const work = (async () => {
    // User-supplied prices never enter a cache shared with other accounts.
    const rows = await fetchKlines(exchange, marketType, symbol, timeframe, 300);
    if (!validCandles(rows)) throw new Error('Недостатньо перевірених біржових свічок для розрахунку');
    const interval = ({ '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': 86400000 } as Record<string, number>)[timeframe];
    if (Date.now() - rows.at(-1)!.time * 1000 > interval * 2) throw new Error('Свічки джерела застаріли; поточний аналіз призупинено');
    const close = rows.map(row => row.close), price = close.at(-1)!;
    const ema20 = ema(close, 20), ema50 = ema(close, 50), ema200 = close.length >= 200 ? ema(close, 200) : null, rsi14 = rsi(close);
    const trueRanges = rows.slice(1).map((row, index) => {
      const previous = rows[index].close;
      return Math.max(row.high - row.low, Math.abs(row.high - previous), Math.abs(row.low - previous));
    });
    let atr = trueRanges.slice(0, 14).reduce((sum, value) => sum + value, 0) / 14;
    for (const value of trueRanges.slice(14)) atr = (atr * 13 + value) / 14;
    const [tickers, orderbook, btcContext, derivativeData] = await Promise.all([marketTickerFeed.get(exchange, marketType), book(exchange, marketType, symbol), btc(), derivatives(symbol, price)]);
    const ticker = marketTickerFeed.status(exchange, marketType).status === 'live' ? tickers.find(row => row.symbol === symbol) : undefined;
    const score = Math.min(10, Math.max(0, 5 + (price > ema50 ? 1 : -1) + (ema20 > ema50 ? 1 : -1) + (rsi14 > 50 && rsi14 < 70 ? 1 : rsi14 < 30 || rsi14 > 75 ? -1 : 0)));
    const verdict = score >= 7 ? 'BUY' : score <= 3 ? 'SELL' : 'NEUTRAL_WAIT';
    const direction = verdict === 'SELL' ? 'short' : 'long', sign = direction === 'long' ? 1 : -1, risk = Math.max(atr * 1.5, price * .005);
    const unavailable = [!ticker && 'Котирування за 24 години', !orderbook && 'Стакан', !btcContext && 'Контекст BTC', !derivativeData.binanceOI && 'OI Binance', !derivativeData.bybitOI && 'OI Bybit', derivativeData.binanceFundingRate === null && 'Фандинг Binance', derivativeData.bybitFundingRate === null && 'Фандинг Bybit'].filter((value): value is string => typeof value === 'string');
    const value: SmartAnalysisData = {
      symbol, exchange, marketType, currentPrice: price, lastUpdated: Date.now(), score, verdict,
      verdictLabel: verdict === 'BUY' ? 'Перевага висхідного руху' : verdict === 'SELL' ? 'Перевага низхідного руху' : 'Очікування підтвердження',
      summary: 'Технічна оцінка за RSI, EMA та ATR на біржових свічках. Стакан і деривативи показані окремо за наявності підтверджених даних.',
      trend: { rsi14, ema20, ema50, ema200, atr }, volumeMetrics: { volume24hUsd: ticker?.volumeUsd ?? null, change24h: ticker?.change24h ?? null },
      tradeScenario: { direction, entry: price, stopLoss: price - sign * risk, tp1: price + sign * 2 * risk, tp2: price + sign * 3 * risk, riskRewardRatio: 2 },
      levels: { pocEstimate: poc(rows), support: Math.min(...rows.slice(-30).map(row => row.low)), resistance: Math.max(...rows.slice(-30).map(row => row.high)) },
      btcContext, orderbook, derivatives: derivativeData, unavailable,
    };
    cache.set(key, { until: Date.now() + 15_000, value }); if (cache.size > 200) cache.delete(cache.keys().next().value!);
    return value;
  })();
  pending.set(key, work); try { return await work; } finally { pending.delete(key); }
}
