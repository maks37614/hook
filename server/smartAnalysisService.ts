import { exchangeFetch, chartExchangeFetch } from './exchangeHttp';
import { storeBoundedAnalysis } from './boundedAnalysisCache';
import { getVerifiedBtcContext } from './verifiedBtcContext';
import { calculatePOC } from './estimatedPoc';
import { ExchangeId, MarketType, Timeframe, Kline, SmartAnalysisData, DetectedFormation } from '../src/types';
import { fetchKlines } from './marketService';
import { fetchHookChartOIHistory } from './hookchartOI';
import { summarizeVerifiedUsdOI } from './oiIntegrity';

// In-memory cache for smart analysis
const analysisCache = new Map<string, { timestamp: number; data: SmartAnalysisData }>();
const CACHE_TTL_MS = 15 * 1000; // 15s cache
const MAX_ANALYSIS_CACHE_ENTRIES = 512;
const isUsdLikeQuote = (symbol: string) => /(USDT|USDC|BUSD|FDUSD|USD)$/.test(symbol);
const MIN_TECHNICAL_BARS = 50;
// A missing exchange history is a temporary data-source outage, not a code
// exception; never map it to HTTP 500 or fabricate 200 EMA bars.
export class SmartAnalysisDataUnavailableError extends Error {
  readonly code = 'SMART_ANALYSIS_CANDLES_UNAVAILABLE';
  constructor(message: string) {
    super(message);
    this.name = 'SmartAnalysisDataUnavailableError';
  }
}

// Technical calculations
function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
}

function calculateEMA(closes: number[], period: number): number {
  if (closes.length === 0) return 0;
  if (closes.length < period) return closes[closes.length - 1];

  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateATR(klines: Kline[], period: number = 14): number {
  if (klines.length < 2) return 0;
  const trs: number[] = [];

  for (let i = 1; i < klines.length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevClose = klines[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }

  const slice = trs.slice(-period);
  if (slice.length === 0) return 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// BTC structure is measured from the same confirmed exchange candles as charts,
// shared across all symbols and users by verifiedBtcContext.ts.

// Exchange-specific, time-bounded orderbook snapshot. No fabricated bids/asks
// on REST failure, and never substitute Binance Futures for Bybit or spot.
async function fetchOrderbookAnalysis(
  symbol: string, exchange: ExchangeId, marketType: MarketType,
): Promise<SmartAnalysisData['orderbook'] & { spread: SmartAnalysisData['spread'] }> {
  const source = exchange + ' ' + marketType;
  const missing: SmartAnalysisData['orderbook'] & { spread: SmartAnalysisData['spread'] } = {
    available: false, source, bidAskRatio: null, dominantSide: 'unavailable',
    bidWallUsd: null, bidWallPrice: null, askWallUsd: null, askWallPrice: null,
    largeOrders: [], spread: { spreadUsd: null, spreadPct: null, quality: 'unavailable' },
  };
  // price × quantity is denominated in the QUOTE asset, not always USD.
  // Without an exchange-rate conversion, showing BTC or ETH quote balances
  // as "$" would be fabricated. Keep such orderbooks n/d in USD-based cards.
  if (!isUsdLikeQuote(symbol)) return missing;
  try {
    const url = exchange === 'bybit'
      ? 'https://api.bybit.com/v5/market/orderbook?category=' +
        (marketType === 'spot' ? 'spot' : 'linear') +
        '&symbol=' + encodeURIComponent(symbol) + '&limit=50'
      : marketType === 'spot'
        ? 'https://data-api.binance.vision/api/v3/depth?symbol=' +
          encodeURIComponent(symbol) + '&limit=50'
        : 'https://fapi.binance.com/fapi/v1/depth?symbol=' +
          encodeURIComponent(symbol) + '&limit=50';
    const response = await exchangeFetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return missing;
    const payload = await response.json();
    const book = exchange === 'bybit'
      ? (payload?.retCode === 0 ? payload?.result : null) : payload;
    const validate = (side: unknown): [number, number][] => Array.isArray(side)
      ? side.map((row: unknown) => {
        if (!Array.isArray(row)) return [NaN, NaN] as [number, number];
        return [Number(row[0]), Number(row[1])] as [number, number];
      }).filter(([price, quantity]) =>
        Number.isFinite(price) && price > 0 &&
        Number.isFinite(quantity) && quantity > 0)
      : [];
    const bids = validate(exchange === 'bybit' ? book?.b : book?.bids);
    const asks = validate(exchange === 'bybit' ? book?.a : book?.asks);
    if (!bids.length || !asks.length) return missing;
    bids.sort((a,b) => b[0] - a[0]);
    asks.sort((a,b) => a[0] - b[0]);
    const bestBid = bids[0][0], bestAsk = asks[0][0];
    if (!(bestAsk > bestBid)) return missing;
    const spreadUsd = Number((bestAsk - bestBid).toPrecision(6));
    const spreadPct = Number(((bestAsk - bestBid) / bestBid * 100).toFixed(5));
    const usd = ([price, qty]: [number,number]) => price * qty;
    const totalBidUsd = bids.reduce((sum,row) => sum + usd(row), 0);
    const totalAskUsd = asks.reduce((sum,row) => sum + usd(row), 0);
    if (!(totalAskUsd > 0) || !(totalBidUsd > 0)) return missing;
    const bidWall = bids.reduce((largest,row) => usd(row) > usd(largest) ? row : largest,bids[0]);
    const askWall = asks.reduce((largest,row) => usd(row) > usd(largest) ? row : largest,asks[0]);
    const meanOrderUsd = (totalBidUsd + totalAskUsd) / (bids.length + asks.length);
    const threshold = meanOrderUsd * 2.8;
    const largeOrders = [
      ...bids.map(row => ({row,side:'bid' as const})),
      ...asks.map(row => ({row,side:'ask' as const})),
    ].filter(({row}) => usd(row) >= threshold)
      .sort((a,b) => usd(b.row) - usd(a.row)).slice(0,16)
      .map(({row,side}) => ({
        side, price: row[0], amountUsd: Math.round(usd(row)),
        distancePct: Number((Math.abs(row[0] - (side === 'bid' ? bestBid : bestAsk)) /
          (side === 'bid' ? bestBid : bestAsk) * 100).toFixed(3)),
        // A large resting order is NOT evidence of an executed whale transaction.
        significance: usd(row) > threshold * 1.5 ? 'large' as const : 'medium' as const,
      }));
    const bidAskRatio = Number((totalBidUsd / totalAskUsd).toFixed(3));
    return {
      available: true, source, bidAskRatio,
      dominantSide: bidAskRatio > 1.25 ? 'bids' : bidAskRatio < .8 ? 'asks' : 'balanced',
      bidWallUsd: Math.round(usd(bidWall)), bidWallPrice: bidWall[0],
      askWallUsd: Math.round(usd(askWall)), askWallPrice: askWall[0],
      largeOrders,
      spread: {
        spreadUsd, spreadPct,
        quality: spreadPct <= .03 ? 'ultra_tight' : spreadPct <= .1 ? 'normal' : 'wide',
      },
    };
  } catch {
    return missing;
  }
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

// Real derivatives data only; never manufacture OI, change or sparkline history.
async function fetchDerivatives(
  symbol: string, marketType: MarketType,
): Promise<SmartAnalysisData['derivatives']> {
  const absent = { currentUsd: null, change1hPct: null, history: [] as number[] };
  if (marketType !== 'futures') return {
    hasPerpFutures: false, fundingRate: null, predictedFundingRate: null,
    fundingBias: 'neutral', binanceOI: absent, bybitOI: absent,
    totalOIUsd: null, oiCoverage: 'spot', oiTrend: 'unknown',
  };

  let fundingRate: number | null = null;
  let predictedFundingRate: number | null = null;
  const [oiResult] = await Promise.allSettled([
    fetchHookChartOIHistory(symbol, '1h'),
  ]);
  const oi = oiResult.status === 'fulfilled' ? oiResult.value : null;
  const now = Date.now();
  const binanceOI = oi ? summarizeVerifiedUsdOI(oi.binance, now) : absent;
  const bybitOI = oi ? summarizeVerifiedUsdOI(oi.bybit, now) : absent;

  try {
    const res = await chartExchangeFetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`, {
      headers: BROWSER_HEADERS, signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const payload = await res.json();
      const value = Number(payload?.lastFundingRate);
      if (payload?.lastFundingRate !== null && payload?.lastFundingRate !== undefined
        && Number.isFinite(value)) fundingRate = Number((value * 100).toFixed(4));
    }
  } catch { /* No funding estimate on network failure. */ }
  try {
    const res = await chartExchangeFetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${encodeURIComponent(symbol)}`, {
      headers: BROWSER_HEADERS, signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const payload = await res.json();
      const ticker = payload?.retCode === 0 ? payload.result?.list?.[0] : undefined;
      const raw = ticker?.predictedFundingRate ?? ticker?.fundingRate;
      if (raw !== null && raw !== undefined && raw !== '') {
        const value = Number(raw);
        if (Number.isFinite(value)) predictedFundingRate = Number((value * 100).toFixed(4));
      }
    }
  } catch { /* Unknown, not 0%. */ }

  const hasBinance = binanceOI.currentUsd !== null;
  const hasBybit = bybitOI.currentUsd !== null;
  const count = Number(hasBinance) + Number(hasBybit);
  const totalOIUsd = count ? (binanceOI.currentUsd ?? 0) + (bybitOI.currentUsd ?? 0) : null;
  const changes = [binanceOI.change1hPct, bybitOI.change1hPct]
    .filter((value): value is number => value !== null);
  const average = changes.length
    ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null;
  return {
    hasPerpFutures: true,
    fundingRate,
    predictedFundingRate,
    fundingBias: fundingRate === null ? 'neutral'
      : fundingRate > 0.04 ? 'bullish' : fundingRate < -0.01 ? 'bearish' : 'neutral',
    binanceOI, bybitOI, totalOIUsd,
    oiCoverage: count === 2 ? 'complete' : count === 1 ? 'partial' : 'none',
    oiTrend: average === null ? 'unknown'
      : average > 1.2 ? 'increasing' : average < -1.2 ? 'decreasing' : 'stable',
  };
}

// Generate Comprehensive Smart Analysis
type SmartAnalysisParams = {
  symbol: string;
  exchange?: ExchangeId;
  marketType?: MarketType;
  timeframe?: Timeframe;
  formation?: DetectedFormation | null;
  currentPrice?: number;
  klines?: Kline[];
};

// Visitors asking for the same public instrument share one analysis request.
// Private candle/formation inputs never join another visitor's calculation.
const activePublicAnalyses = new Map<string, Promise<SmartAnalysisData>>();
export function generateSmartAnalysis(params: SmartAnalysisParams): Promise<SmartAnalysisData> {
  if (params.formation || params.klines?.length) return calculateSmartAnalysis(params);
  const key = [params.symbol.toUpperCase(), params.exchange ?? 'binance',
    params.marketType ?? 'futures', params.timeframe ?? '1h'].join(':');
  const pending = activePublicAnalyses.get(key);
  if (pending) return pending;
  const operation = calculateSmartAnalysis(params);
  activePublicAnalyses.set(key, operation);
  void operation.finally(() => {
    if (activePublicAnalyses.get(key) === operation) activePublicAnalyses.delete(key);
  }).catch(() => {}); // A rejected shared operation must not create an unhandled rejection.
  return operation;
}

async function calculateSmartAnalysis(params: SmartAnalysisParams): Promise<SmartAnalysisData> {
  const symbol = params.symbol.toUpperCase();
  const exchange = params.exchange || 'binance';
  const marketType = params.marketType || 'futures';
  const tf = params.timeframe || '1h';

  const cacheKey = `${symbol}_${exchange}_${marketType}_${tf}`;
  // A supplied formation changes the quality score, and supplied candles may
  // represent a different verified snapshot. Do not return an unrelated result
  // from the shared instrument cache or overwrite it with private inputs.
  const shareable = !params.formation && !params.klines?.length;
  const cached = shareable ? analysisCache.get(cacheKey) : undefined;
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // This panel opens on explicit user action, so its candles have the SAME
  // reserved REST priority as /api/klines chart requests. The previous
  // background-class fetch was throttled while chart-class fetch still worked,
  // producing HTTP 500 on BTC/USDT despite 220 healthy candles on the chart.
  let klines = params.klines || [];
  if (klines.length < 201) {
    klines = (await fetchKlines(exchange, marketType, symbol, tf, 220,
      undefined, undefined, { chart: true }).catch(() => [])) || [];
  }
  const finiteBar = (c: Kline) => c &&
    [c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite) &&
    c.close > 0 && c.open > 0 && c.high >= Math.max(c.open, c.close) &&
    c.low <= Math.min(c.open, c.close) && c.low > 0 && c.volume >= 0;
  const secondsPerBar: Record<Timeframe, number> = { '5s': 5, '30s': 30,
    '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
  };
  const seconds = secondsPerBar[tf] ?? 3600;
  const nowSeconds = Date.now() / 1000;
  const verified = klines.filter((bar) => finiteBar(bar) &&
    bar.time + seconds <= nowSeconds).sort((a, b) => a.time - b.time);
  // EMA requires consecutive closed candles; ignore gaps and malformed
  // candles instead of making a synthetic uninterrupted price series.
  let contiguousStart = verified.length - 1;
  while (contiguousStart > 0 &&
    verified[contiguousStart].time - verified[contiguousStart - 1].time === seconds) {
    contiguousStart -= 1;
  }
  klines = verified.slice(Math.max(0, contiguousStart));
  if (klines.length < MIN_TECHNICAL_BARS) {
    throw new SmartAnalysisDataUnavailableError(
      'Недостатньо підтверджених закритих свічок (' + klines.length +
      '/' + MIN_TECHNICAL_BARS + ') на ' + exchange + ' ' + marketType +
      ' ' + tf + '. Перевірте доступність біржового API або спробуйте пізніше.'
    );
  }
  // Use the last CONFIRMED exchange close, not browser price / invented $100.
  const currentPrice = klines[klines.length - 1].close;

  const closes = klines.map((k) => k.close);
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);

  // Technical calculations
  const rsi = calculateRSI(closes, 14);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = klines.length >= 200 ? calculateEMA(closes, 200) : null;
  const atr = calculateATR(klines, 14);

  // Cross signals & alignment
  let crossSignal: SmartAnalysisData['trend']['crossSignal'] = 'compression';
  let crossSignalLabel = 'Консолідація та стиснення середніх (EMA Compression)';

  if (ema200 !== null && ema20 > ema50 && ema50 > ema200) {
    crossSignal = 'bullish_alignment';
    crossSignalLabel = 'Ідеальне бичаче вирівнювання (EMA 20 > 50 > 200)';
  } else if (ema200 !== null && ema20 < ema50 && ema50 < ema200) {
    crossSignal = 'bearish_alignment';
    crossSignalLabel = 'Повне низхідне вирівнювання (EMA 20 < 50 < 200)';
  } else if (ema200 !== null && ema20 > ema50 && closes[closes.length - 1] > ema50) {
    crossSignal = 'golden_cross';
    crossSignalLabel = 'Бичачий золотий перетин (Golden Cross EMA 20/50)';
  } else if (ema200 !== null && ema20 < ema50 && closes[closes.length - 1] < ema50) {
    crossSignal = 'death_cross';
    crossSignalLabel = 'Ведмежий перетин (Death Cross EMA 20/50)';
  }
  if (ema200 === null) {
    crossSignalLabel = 'EMA200: н/д — менше 200 закритих послідовних свічок; EMA20/50 доступні';
  }

  const priceVsEma =
    currentPrice > ema20
      ? `Ціна вище EMA20 на +${(((currentPrice - ema20) / ema20) * 100).toFixed(2)}% (Імпульсний контроль покупців)`
      : `Ціна нижче EMA20 на -${(((ema20 - currentPrice) / ema20) * 100).toFixed(2)}% (Корекційний відкат під опір)`;

  // Independently measure 24h from 24 *completed* one-hour candles, never
  // from 24 bars of an arbitrary selected timeframe.
  const hourly = tf === '1h' ? klines :
    (await fetchKlines(exchange, marketType, symbol, '1h', 26,
      undefined, undefined, { chart: true }).catch(() => [])) || [];
  const closedHours = hourly.filter((c) => finiteBar(c) &&
    c.time * 1000 + 60 * 60_000 <= Date.now()).slice(-24);
  // Genuine 24h series must be consecutive and end within the last 2 hours.
  // Otherwise show n/d instead of a misleading stale "24h" volume or POC.
  const lastClosedHour = closedHours.at(-1);
  const valid24hWindow = closedHours.length === 24 && lastClosedHour !== undefined &&
    Date.now() / 1000 - (lastClosedHour.time + 3600) <= 7200 &&
    closedHours.every((bar, i) =>
      i === 0 || bar.time - closedHours[i - 1].time === 3600);
  // USD-equivalent volume only for USD-like quoted pairs. Never label BTC
  // quote turnover as USD or compare it against USD thresholds.
  const quoteIsUsdLike = isUsdLikeQuote(symbol);
  const has24h = quoteIsUsdLike && valid24hWindow;
  const barUsd = (bar: Kline) => Number.isFinite(bar.quoteVolume)
    ? bar.quoteVolume! : bar.volume * bar.close;
  const total24hVolUsd = has24h
    ? closedHours.reduce((sum, c) => sum + barUsd(c), 0) : null;
  const last1hVolUsd = has24h ? barUsd(closedHours[closedHours.length - 1]) : null;
  const mean1h = has24h
    ? closedHours.slice(0, -1).reduce((sum,c) => sum + barUsd(c),0) / 23 : null;
  const volume1hSpikeRatio = mean1h !== null && mean1h > 0 && last1hVolUsd !== null
    ? Number((last1hVolUsd / mean1h).toFixed(2)) : null;
  const hasVolumeSpike = volume1hSpikeRatio !== null && volume1hSpikeRatio >= 1.7;

  const dayHigh = has24h ? Math.max(...closedHours.map(c => c.high)) : null;
  const dayLow = has24h ? Math.min(...closedHours.map(c => c.low)) : null;
  const dayRange = dayHigh !== null && dayLow !== null ? dayHigh - dayLow : null;
  const positionInDayRangePct = dayRange !== null && dayRange > 0 && dayLow !== null
    ? Math.max(0,Math.min(100,Math.round((currentPrice-dayLow)/dayRange*100))) : null;
  const dailyRangePct = dayRange !== null && dayLow !== null && dayLow > 0
    ? Number((dayRange/dayLow*100).toFixed(2)) : null;

  // The POC is a candle-typical-price approximation, NOT executed volume-at-price.
  // Use the SAME latest 24 CLOSED 1h bars as 24h High/Low. A nine-day POC
  // contradicting the displayed 24h high/low was a period mismatch.
  const { pocPrice, pocVolumePct } = calculatePOC(has24h ? closedHours : []);
  const strongSupport = Number((Math.min(...lows.slice(-15)) * .996).toPrecision(6));
  const strongResistance = Number((Math.max(...highs.slice(-15)) * 1.004).toPrecision(6));
  const liquidityLevels: SmartAnalysisData['levels']['liquidityLevels'] = [];
  if (dayHigh !== null && dayLow !== null) {
    liquidityLevels.push({
      label: 'Максимум 24 закритих 1h свічок (можлива зона стопів)',
      price: dayHigh, type: 'sell_side',
      distancePct: Number(((dayHigh-currentPrice)/currentPrice*100).toFixed(2)),
    }, {
      label: 'Мінімум 24 закритих 1h свічок (можлива зона стопів)',
      price: dayLow, type: 'buy_side',
      distancePct: Number(((currentPrice-dayLow)/currentPrice*100).toFixed(2)),
    });
  }
  if (pocPrice !== null) {
    liquidityLevels.push({
      label: 'Оціночний POC за 24 закриті 1h свічки OHLCV (не ордери стопів)',
      price: pocPrice, type: 'buy_side',
      distancePct: Number(((pocPrice-currentPrice)/currentPrice*100).toFixed(2)),
    });
  }

  // Async parallel external data
  const [btcContext, orderbookData, derivatives] = await Promise.all([
    getVerifiedBtcContext(),
    fetchOrderbookAnalysis(symbol, exchange, marketType),
    fetchDerivatives(symbol, marketType),
  ]);

  // Scoring engine (1 to 10)
  let score = 6.0;

  // RSI score
  if (rsi >= 45 && rsi <= 62) score += 1.2; // Healthy momentum
  else if (rsi < 35) score += 0.8; // Oversold potential bounce
  else if (rsi > 75) score -= 1.0; // Overheated

  // Trend EMA score
  if (crossSignal === 'bullish_alignment') score += 1.4;
  else if (crossSignal === 'golden_cross') score += 1.1;
  else if (crossSignal === 'death_cross') score -= 1.2;
  else if (crossSignal === 'bearish_alignment') score -= 1.4;

  // BTC alignment
  if (btcContext.overallStructure === 'HH_HL') score += 1.0;
  else if (btcContext.overallStructure === 'LH_LL') score -= 1.0;

  // Volume confirmation
  if (hasVolumeSpike) score += 0.9;

  // Orderbook bias
  if (orderbookData.dominantSide === 'bids') score += 0.6;
  else if (orderbookData.dominantSide === 'asks') score -= 0.6;

  // Pattern presence
  if (params.formation) {
    if (params.formation.bias === 'bullish') score += 0.8;
    else if (params.formation.bias === 'bearish') score -= 0.5;
  }

  score = Math.min(Math.max(parseFloat(score.toFixed(1)), 1.0), 9.9);

  let verdict: SmartAnalysisData['verdict'] = 'NEUTRAL_WAIT';
  let verdictLabel = 'НЕЙТРАЛЬНО / ОЧІКУВАННЯ ПІДТВЕРДЖЕННЯ';

  if (score >= 8.2) {
    verdict = 'STRONG_BUY';
    verdictLabel = 'СИЛЬНИЙ ВХІД В ЛОНГ (STRONG BUY)';
  } else if (score >= 6.8) {
    verdict = 'BUY';
    verdictLabel = 'ПЕРЕВАГА ПОКУПЦЯ (BUY)';
  } else if (score <= 3.4) {
    verdict = 'AVOID';
    verdictLabel = 'ВИСОКИЙ РИЗИК / УНИКАТИ ВХОДУ (AVOID)';
  } else if (score <= 4.8) {
    verdict = 'SELL';
    verdictLabel = 'ТИСК ПРОДАВЦІВ / ПРІОРИТЕТ ШОРТ (SELL)';
  }

  // Recommended Trade Scenario
  const entryMin = Number((currentPrice * 0.993).toPrecision(6));
  const entryMax = Number((currentPrice * 1.002).toPrecision(6));
  const optimalEntry = currentPrice;

  const slPct = Math.max(parseFloat(((atr / currentPrice) * 1.6 * 100).toFixed(2)), 1.2);
  const stopLoss = Number((currentPrice * (1 - slPct / 100)).toPrecision(6));

  const tp1Pct = parseFloat((slPct * 1.6).toFixed(2));
  const tp2Pct = parseFloat((slPct * 2.8).toFixed(2));
  const tp3Pct = parseFloat((slPct * 4.5).toFixed(2));

  const tp1 = Number((currentPrice * (1 + tp1Pct / 100)).toPrecision(6));
  const tp2 = Number((currentPrice * (1 + tp2Pct / 100)).toPrecision(6));
  const tp3 = Number((currentPrice * (1 + tp3Pct / 100)).toPrecision(6));
  const riskRewardRatio = parseFloat((tp2Pct / slPct).toFixed(2));

  const positionSizingRecommendation =
    'Не визначається без параметрів ризику користувача. Технічний індикатор не є сигналом або рекомендацією плеча.';

  // 1. Actual holder concentration and wallet activity require an on-chain
  // indexer. OHLCV and depth cannot establish who owns tokens or where they move.
  const holdersStatus: SmartAnalysisData['participants']['holders']['status'] = 'unavailable';
  const holdersStatusLabel = 'Ончейн-дані не підключено';
  const top10ConcentrationPct: number | null = null;
  const activeWalletsGrowthPct: number | null = null;
  const retailVsWhaleRatio: string | null = null;
  const phaseDescription = 'Немає підтверджених ончейн-даних про топ-10 гаманців, активні адреси та накопичення. Біржовий обсяг не дозволяє встановити ці показники.';

  // 2. A snapshot shows RESTING LIMIT ORDERS, never executed whale trades,
  // institutional identity, TWAP executions, iceberg orders or absorption.
  const whaleOrders = orderbookData.largeOrders;
  const largePlayerDetected: boolean | null = orderbookData.available ? whaleOrders.length > 0 : null;
  const clusterVolumeUsd: number | null = orderbookData.available
    ? whaleOrders.reduce((sum, order) => sum + order.amountUsd, 0) : null;
  const actionType: SmartAnalysisData['participants']['largePlayer']['actionType'] = 'none';
  const actionLabel = orderbookData.available
    ? 'Великі лімітні заявки у поточному стакані (не виконані угоди)'
    : 'Немає даних стакана';
  const trackedClusters: SmartAnalysisData['participants']['largePlayer']['trackedClusters'] =
    whaleOrders.slice(0, 8).map(order => ({
      type: 'limit_order',
      side: order.side === 'bid' ? 'buy' : 'sell',
      price: order.price, volumeUsd: order.amountUsd,
      timestampDesc: 'Поточний знімок стакана, виконання не підтверджено',
    }));
  const largePlayerNote = orderbookData.available
    ? 'Ці заявки реально присутні у знімку стакана ' + orderbookData.source +
      '. Особа власника, виконання, айсберги та інституційна активність не встановлені.'
    : 'Дані про великі заявки недоступні для вибраного ринку.';

  // 3. Maker identity, HFT algorithm and replenishment speed cannot be
  // verified from one snapshot. The actual quoted spread is shown separately.
  const marketMakerDetected: boolean | null = null;
  const activityLevel: SmartAnalysisData['participants']['marketMaker']['activityLevel'] = 'unknown';
  const activityLabel = 'Немає підтверджених даних про маркет-мейкера';
  const algorithmType: SmartAnalysisData['participants']['marketMaker']['algorithmType'] = null;
  const spreadSupportScore: number | null = null;
  const orderbookReplenishmentSpeed: SmartAnalysisData['participants']['marketMaker']['orderbookReplenishmentSpeed'] = 'unknown';
  const antiSqueezeProtection: boolean | null = null;
  const marketMakerNote = 'Один знімок стакана не визначає HFT/grid-алгоритм, швидкість поновлення заявок або захист від сквизів.';

  // 4. Quantitative MARKET VULNERABILITY signals (not proof of manipulation).
  // Skip each factor completely when its required market data is unavailable.
  const signals: SmartAnalysisData['participants']['manipulativeCoin']['signals'] = [];
  let riskPoints = 10;
  let measuredSignals = 0;
  if (total24hVolUsd !== null) {
    const thinVolume = total24hVolUsd < 800_000;
    measuredSignals++;
    if (thinVolume) riskPoints += 35;
    signals.push({
      name: 'Низький обсяг за 24 закриті 1h свічки (<800k USDT)',
      detected: thinVolume, severity: thinVolume ? 'high' : 'low',
      description: 'Виміряний обсяг ≈ $' +
        (total24hVolUsd >= 1e9
          ? (total24hVolUsd / 1e9).toFixed(2) + 'B'
          : total24hVolUsd >= 1e6
            ? (total24hVolUsd / 1e6).toFixed(2) + 'M'
            : (total24hVolUsd / 1e3).toFixed(0) + 'K') +
        ' в USD-подібній котируваній валюті. Це ліквідність, не доказ маніпуляції.',
    });
  }
  if (dailyRangePct !== null) {
    const highRange = dailyRangePct > 24;
    measuredSignals++;
    if (highRange) riskPoints += 25;
    signals.push({
      name: 'Великий діапазон 24 закритих 1h свічок (>24%)',
      detected: highRange, severity: highRange ? 'high' : 'low',
      description: 'Виміряний діапазон ' + dailyRangePct +
        '%. Велика волатильність сама по собі не доводить маніпуляцій.',
    });
  }
  if (orderbookData.bidAskRatio !== null) {
    const extremeImbalance = orderbookData.bidAskRatio > 3 ||
      orderbookData.bidAskRatio < 1/3;
    measuredSignals++;
    if (extremeImbalance) riskPoints += 20;
    signals.push({
      name: 'Значний дисбаланс заявок Bid/Ask (>3× або <1/3×)',
      detected: extremeImbalance, severity: extremeImbalance ? 'medium' : 'low',
      description: 'Зріз стакана ' + orderbookData.source + ': Bid/Ask = ' +
        orderbookData.bidAskRatio + '. Дисбаланс не доводить спуфінгу.',
    });
  }
  const riskScore: number | null = measuredSignals >= 2
    ? Math.max(0, Math.min(100, riskPoints)) : null;
  const manipulativeRiskLevel: SmartAnalysisData['participants']['manipulativeCoin']['riskLevel'] =
    riskScore === null ? 'unknown' : riskScore >= 75 ? 'extreme' :
    riskScore >= 50 ? 'high' : riskScore >= 30 ? 'medium' : 'low';
  const riskLabel = riskScore === null
    ? 'Індекс вразливості: даних недостатньо'
    : manipulativeRiskLevel === 'low'
      ? 'Низька вразливість за доступними факторами'
      : manipulativeRiskLevel === 'medium'
        ? 'Помірна вразливість за доступними факторами'
        : manipulativeRiskLevel === 'high'
          ? 'Підвищена вразливість за доступними факторами'
          : 'Висока вразливість за доступними факторами';
  const warningSummary = riskScore === null
    ? 'Недостатньо виміряних показників, щоб оцінювати ринкову вразливість.'
    : 'Це евристичний індекс вразливості на основі ' + measuredSignals +
      ' виміряних індикаторів. Маніпуляції, спуфінг і Pump & Dump не доведені.';
  const isManipulativeCoin: boolean | null = null;
  const manipulativeReasons = signals.filter(item => item.detected === true).map(item => item.description);

  // Describe observed data and limitations, never imply institutional proof.
  const summary = 'Технічні показники ' + symbol + ' (' + exchange + ' ' + marketType +
    ', ' + tf + '): RSI14=' + rsi + ', ' + crossSignalLabel + '. ' +
    (btcContext.overallStructure === 'unknown' ? 'BTC: немає структури. ' :
      'BTC: ' + btcContext.overallStructureLabel + '. ') +
    (orderbookData.spread.spreadPct === null
      ? 'Стакан: дані недоступні. '
      : 'Спред у поточному стакані: ' + orderbookData.spread.spreadPct + '%. ') +
    (pocPrice === null ? 'Оціночний POC недоступний. '
      : 'Оціночний POC з OHLCV: ' + pocPrice + '. ') +
    (derivatives.totalOIUsd === null ? 'OI не підтверджено. '
      : 'Перевірений OI: ' + (derivatives.totalOIUsd / 1e6).toFixed(1) + 'M (' +
      (derivatives.oiCoverage === 'partial' ? 'одна біржа' : 'дві біржі') + '). ') +
    'Ончейн-дані не входять у Quant: Holders від CoinGecko завантажуються окремо. ' +
    'Особа власників заявок і маніпуляції не підтверджені.';

  const result: SmartAnalysisData = {
    symbol,
    exchange,
    marketType,
    currentPrice,
    lastUpdated: Date.now(),
    score,
    verdict,
    verdictLabel,
    summary,
    positionSizingRecommendation,
    tradeScenario: {
      entryZoneMin: entryMin,
      entryZoneMax: entryMax,
      optimalEntry,
      stopLoss,
      stopLossPct: slPct,
      tp1,
      tp1Pct,
      tp2,
      tp2Pct,
      tp3,
      tp3Pct,
      riskRewardRatio,
    },
    trend: {
      rsi14: rsi,
      rsiStatus: rsi >= 70 ? 'overbought' : rsi <= 30 ? 'oversold' : 'neutral',
      rsiLabel: rsi >= 70 ? 'Перекупленість (>70)' : rsi <= 30 ? 'Перепроданість (<30)' : 'Нейтральний баланс',
      ema20: Number(ema20.toPrecision(6)),
      ema50: Number(ema50.toPrecision(6)),
      ema200: ema200 === null ? null : Number(ema200.toPrecision(6)),
      priceVsEma,
      crossSignal,
      crossSignalLabel,
      strengthPct: Math.min(Math.max(Math.round(Math.abs(rsi - 50) * 2 + 40), 20), 98),
    },
    btcContext,
    volumeMetrics: {
      volume24hUsd: total24hVolUsd,
      volume1hUsd: last1hVolUsd,
      volume1hSpikeRatio,
      hasVolumeSpike,
    },
    spread: orderbookData.spread,
    volatility: {
      dailyRangePct,
      atr: Number(atr.toPrecision(5)),
      atrPct: parseFloat(((atr / currentPrice) * 100).toFixed(2)),
      positionInDayRangePct,
      high24h: dayHigh,
      low24h: dayLow,
    },
    orderbook: {
      available: orderbookData.available,
      source: orderbookData.source,
      bidAskRatio: orderbookData.bidAskRatio,
      dominantSide: orderbookData.dominantSide,
      bidWallUsd: orderbookData.bidWallUsd,
      bidWallPrice: orderbookData.bidWallPrice,
      askWallUsd: orderbookData.askWallUsd,
      askWallPrice: orderbookData.askWallPrice,
      largeOrders: orderbookData.largeOrders,
    },
    derivatives,
    levels: {
      pocPrice,
      pocVolumePct,
      liquidityLevels,
      strongSupport,
      strongResistance,
    },
    participants: {
      holders: {
        status: holdersStatus,
        statusLabel: holdersStatusLabel,
        top10ConcentrationPct,
        activeWalletsGrowthPct,
        retailVsWhaleRatio,
        phaseDescription,
      },
      largePlayer: {
        detected: largePlayerDetected,
        confidencePct: null,
        actionType,
        actionLabel,
        clusterVolumeUsd,
        details: largePlayerNote,
        trackedClusters,
      },
      marketMaker: {
        detected: marketMakerDetected,
        activityLevel,
        activityLabel,
        algorithmType,
        spreadSupportScore,
        orderbookReplenishmentSpeed,
        antiSqueezeProtection,
        details: marketMakerNote,
      },
      manipulativeCoin: {
        isManipulative: isManipulativeCoin,
        riskScore,
        riskLevel: manipulativeRiskLevel,
        riskLabel,
        signals,
        warningSummary,
      },
      // Backwards compatibility legacy fields
      holdersStatus,
      holdersConcentrationPct: top10ConcentrationPct,
      largePlayerDetected,
      largePlayerNote,
      marketMakerDetected,
      marketMakerNote,
      isManipulativeCoin,
      manipulativeRiskLevel,
      manipulativeReasons,
    },
  };

  if (shareable) {
    storeBoundedAnalysis(analysisCache, cacheKey, result, {
      now: Date.now(), ttlMs: CACHE_TTL_MS, maxEntries: MAX_ANALYSIS_CACHE_ENTRIES,
    });
  }
  return result;
}
