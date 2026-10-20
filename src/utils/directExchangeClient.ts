import { requestMarketTickers } from './marketRequests';
import { MarketLocationCache } from './marketLocationCache';
import { normalizeExchangeSymbol } from './marketSymbols';
import { ExchangeId, MarketType, Timeframe, Kline, ScannedCoin, MarketCoin } from '../types';
import { detectFormations } from './patternRecognition';

// Popular top crypto pairs for immediate search & zero-latency fallback
export const TOP_POPULAR_PAIRS: { symbol: string; baseAsset: string; name: string }[] = [
  { symbol: 'BTCUSDT', baseAsset: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', name: 'Ethereum' },
  { symbol: 'SOLUSDT', baseAsset: 'SOL', name: 'Solana' },
  { symbol: 'XRPUSDT', baseAsset: 'XRP', name: 'Ripple' },
  { symbol: 'DOGEUSDT', baseAsset: 'DOGE', name: 'Dogecoin' },
  { symbol: 'ADAUSDT', baseAsset: 'ADA', name: 'Cardano' },
  { symbol: 'BNBUSDT', baseAsset: 'BNB', name: 'BNB' },
  { symbol: 'SUIUSDT', baseAsset: 'SUI', name: 'Sui' },
  { symbol: 'PEPEUSDT', baseAsset: 'PEPE', name: 'Pepe' },
  { symbol: 'NEARUSDT', baseAsset: 'NEAR', name: 'NEAR Protocol' },
  { symbol: 'AVAXUSDT', baseAsset: 'AVAX', name: 'Avalanche' },
  { symbol: 'LINKUSDT', baseAsset: 'LINK', name: 'Chainlink' },
  { symbol: 'APTUSDT', baseAsset: 'APT', name: 'Aptos' },
  { symbol: 'ARBUSDT', baseAsset: 'ARB', name: 'Arbitrum' },
  { symbol: 'OPUSDT', baseAsset: 'OP', name: 'Optimism' },
  { symbol: 'TIAUSDT', baseAsset: 'TIA', name: 'Celestia' },
  { symbol: 'INJUSDT', baseAsset: 'INJ', name: 'Injective' },
  { symbol: 'SEIUSDT', baseAsset: 'SEI', name: 'Sei' },
  { symbol: 'FETUSDT', baseAsset: 'FET', name: 'Artificial Superintelligence' },
  { symbol: 'RENDERUSDT', baseAsset: 'RENDER', name: 'Render' },
  { symbol: 'SHIBUSDT', baseAsset: 'SHIB', name: 'Shiba Inu' },
  { symbol: 'WIFUSDT', baseAsset: 'WIF', name: 'dogwifhat' },
  { symbol: 'FLOKIUSDT', baseAsset: 'FLOKI', name: 'Floki' },
  { symbol: 'BONKUSDT', baseAsset: 'BONK', name: 'Bonk' },
  { symbol: 'TONUSDT', baseAsset: 'TON', name: 'Toncoin' },
  { symbol: 'DOTUSDT', baseAsset: 'DOT', name: 'Polkadot' },
  { symbol: 'LTCUSDT', baseAsset: 'LTC', name: 'Litecoin' },
  { symbol: 'BCHUSDT', baseAsset: 'BCH', name: 'Bitcoin Cash' },
  { symbol: 'KASUSDT', baseAsset: 'KAS', name: 'Kaspa' },
  { symbol: 'JUPUSDT', baseAsset: 'JUP', name: 'Jupiter' },
  { symbol: 'PYTHUSDT', baseAsset: 'PYTH', name: 'Pyth Network' },
  { symbol: 'STXUSDT', baseAsset: 'STX', name: 'Stacks' },
  { symbol: 'TAOUSDT', baseAsset: 'TAO', name: 'Bittensor' },
  { symbol: 'ICPUSDT', baseAsset: 'ICP', name: 'Internet Computer' },
  { symbol: 'UNIUSDT', baseAsset: 'UNI', name: 'Uniswap' },
  { symbol: 'AAVEUSDT', baseAsset: 'AAVE', name: 'Aave' },
  { symbol: 'MKRUSDT', baseAsset: 'MKR', name: 'Maker' },
  { symbol: 'PENGUUSDT', baseAsset: 'PENGU', name: 'Pudgy Penguins' },
  { symbol: 'VIRTUALUSDT', baseAsset: 'VIRTUAL', name: 'Virtuals Protocol' },
  { symbol: 'TRUMPUSDT', baseAsset: 'TRUMP', name: 'Official Trump' },
  { symbol: 'MOVEUSDT', baseAsset: 'MOVE', name: 'Movement' },
  { symbol: 'HYPEUSDT', baseAsset: 'HYPE', name: 'Hyperliquid' },
  { symbol: 'ONDOUSDT', baseAsset: 'ONDO', name: 'Ondo' },
  { symbol: 'OMUSDT', baseAsset: 'OM', name: 'MANTRA' },
];

function toBinanceInterval(tf: Timeframe): string {
  switch (tf) {
    case '1m': return '1m';
    case '5m': return '5m';
    case '15m': return '15m';
    case '1h': return '1h';
    case '4h': return '4h';
    case '1d': return '1d';
    default: return '1h';
  }
}

function toBybitInterval(tf: Timeframe): string {
  switch (tf) {
    case '1m': return '1';
    case '5m': return '5';
    case '15m': return '15';
    case '1h': return '60';
    case '4h': return '240';
    case '1d': return 'D';
    default: return '60';
  }
}

function getExchangeUrl(exchange: ExchangeId, market: MarketType, symbol: string): string {
  if (exchange === 'binance') {
    return market === 'futures'
      ? `https://www.binance.com/en/futures/${symbol}`
      : `https://www.binance.com/en/trade/${symbol}`;
  } else {
    return market === 'futures'
      ? `https://www.bybit.com/trade/usdt/${symbol}`
      : `https://www.bybit.com/en/trade/spot/${symbol.replace('USDT', '')}/USDT`;
  }
}

/**
 * Direct client-side fetch from Binance (with multi-mirror fallback)
 */
/**
 * Direct client-side fetch from Binance (Futures + Spot multi-mirror)
 */
export interface DirectTickerSourceStatus {
  exchange: ExchangeId;
  marketType: MarketType;
  status: 'live' | 'unavailable';
  updatedAt: number | null;
  error?: string;
}

export interface DirectTickerOptions {
  marketType?: 'all' | MarketType;
  minVolumeUsd?: number;
  signal?: AbortSignal;
  onSourceStatus?: (source: DirectTickerSourceStatus) => void;
}

async function fetchDirectTickers(exchange: ExchangeId, options: DirectTickerOptions): Promise<MarketCoin[]> {
  const markets: MarketType[] = options.marketType && options.marketType !== 'all' ? [options.marketType] : ['futures', 'spot'];
  const batches = await Promise.all(markets.map(async marketType => {
    try {
      const tickers = await requestMarketTickers(exchange, marketType, { signal: options.signal });
      const seen = new Set<string>();
      const coins: MarketCoin[] = [];
      for (const ticker of tickers) {
        const { symbol, baseAsset, quoteAsset, price, volumeUsd, change24h } = ticker;
        if (seen.has(symbol) || volumeUsd < (options.minVolumeUsd ?? 50_000) || volumeUsd > 10_000_000_000) continue;
        seen.add(symbol);
        const high = ticker.high24h > 0 ? ticker.high24h : price;
        const low = ticker.low24h > 0 ? ticker.low24h : price;
        const volatility24hPct = Math.max(0, ((high - low) / low) * 100);
        coins.push({
          symbol, baseAsset, quoteAsset, exchange, marketType, price, volumeUsd,
          change24h: Number(change24h.toFixed(2)), high24h: high, low24h: low,
          distanceToHighPct: Number(Math.max(0, ((high - price) / high) * 100).toFixed(2)),
          distanceToLowPct: Number(Math.max(0, ((price - low) / low) * 100).toFixed(2)),
          volatility24hPct: Number(volatility24hPct.toFixed(2)),
          isNearHigh: false, isNearLow: false,
          isActiveCoin: (volatility24hPct >= 4 && volumeUsd >= 2_000_000) || Math.abs(change24h) >= 5,
          exchangeUrl: getExchangeUrl(exchange, marketType, symbol),
        });
      }
      options.onSourceStatus?.({ exchange, marketType, status: 'live', updatedAt: Date.now() });
      return coins;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      options.onSourceStatus?.({ exchange, marketType, status: 'unavailable', updatedAt: null,
        error: error instanceof Error ? error.message : 'Помилка з’єднання' });
      return [];
    }
  }));
  return directLocationCache.enrich(batches.flat().sort((a, b) => b.volumeUsd - a.volumeUsd));
}

export function fetchDirectBinanceTickers(options: DirectTickerOptions = {}): Promise<MarketCoin[]> {
  return fetchDirectTickers('binance', options);
}

export function fetchDirectBybitTickers(options: DirectTickerOptions = {}): Promise<MarketCoin[]> {
  return fetchDirectTickers('bybit', options);
}

// Fast client-side memory cache for direct exchange kline calls
const directKlinesCache = new Map<string, { data: Kline[]; timestamp: number }>();
const CLIENT_CACHE_TTL_MS = 1500;

/**
 * Direct client-side fetch of Klines
 */
export async function fetchDirectKlines(
  exchange: ExchangeId,
  market: MarketType,
  symbol: string,
  timeframe: Timeframe,
  limit: number = 70,
  startTime?: number,
  endTime?: number
): Promise<Kline[]> {
  const cleanSymbol = normalizeExchangeSymbol(symbol);
  const safeLimit = Math.min(Math.max(limit, 10), 1000);
  const cacheKey = `${exchange}:${market}:${cleanSymbol}:${timeframe}:${safeLimit}:${startTime || ''}:${endTime || ''}`;

  const cached = directKlinesCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < CLIENT_CACHE_TTL_MS && cached.data.length > 0) {
    return cached.data;
  }

  const extraBybit = `${startTime ? `&start=${startTime}` : ''}${endTime ? `&end=${endTime}` : ''}`;
  const extraBinance = `${startTime ? `&startTime=${startTime}` : ''}${endTime ? `&endTime=${endTime}` : ''}`;

  if (exchange === 'bybit') {
    const interval = toBybitInterval(timeframe);
    const primaryCategory = market === 'futures' ? 'linear' : 'spot';

    const categories = [primaryCategory];
    const hosts = [
      'https://api.bybit.com',
      'https://api.bytick.com',
      'https://api.bybit.nl',
    ];

    for (const cat of categories) {
      for (const host of hosts) {
        try {
          const url = `${host}/v5/market/kline?category=${cat}&symbol=${encodeURIComponent(cleanSymbol)}&interval=${interval}&limit=${safeLimit}${extraBybit}`;
          const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
          if (!res.ok) continue;
          const json = await res.json();
          const list = json?.result?.list;
          if (!Array.isArray(list) || list.length === 0) continue;

          const result: Kline[] = list
            .slice()
            .reverse()
            .map((d: any) => ({
              time: Math.floor(parseInt(d[0], 10) / 1000),
              open: parseFloat(d[1]),
              high: parseFloat(d[2]),
              low: parseFloat(d[3]),
              close: parseFloat(d[4]),
              volume: parseFloat(d[5]),
            }));

          directKlinesCache.set(cacheKey, { data: result, timestamp: Date.now() });
          return result;
        } catch {
          // Try next
        }
      }
    }
    return cached?.data || [];
  }

  // Binance
  const interval = toBinanceInterval(timeframe);
  const mirrors = market === 'futures'
    ? [`https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(cleanSymbol)}&interval=${interval}&limit=${safeLimit}${extraBinance}`]
    : [
        `https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(cleanSymbol)}&interval=${interval}&limit=${safeLimit}${extraBinance}`,
        `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(cleanSymbol)}&interval=${interval}&limit=${safeLimit}${extraBinance}`,
        `https://api1.binance.com/api/v3/klines?symbol=${encodeURIComponent(cleanSymbol)}&interval=${interval}&limit=${safeLimit}${extraBinance}`,
      ];

  for (const url of mirrors) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const result: Kline[] = data.map((d: any) => ({
        time: Math.floor(d[0] / 1000),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));

      directKlinesCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch {
      // Try next
    }
  }

  return cached?.data || [];
}

/**
 * Direct client-side scan fallback
 */
export async function runDirectClientScan(params: {
  exchange: 'all' | ExchangeId;
  marketType: 'all' | MarketType;
  timeframe: Timeframe;
}): Promise<ScannedCoin[]> {
  try {
    const [binanceCoins, bybitCoins] = await Promise.all([
      params.exchange === 'all' || params.exchange === 'binance' ? fetchDirectBinanceTickers() : Promise.resolve([]),
      params.exchange === 'all' || params.exchange === 'bybit' ? fetchDirectBybitTickers() : Promise.resolve([]),
    ]);

    const allCoins = [...binanceCoins, ...bybitCoins].filter(c => params.marketType === 'all' || c.marketType === params.marketType);
    if (allCoins.length === 0) {
      return getFallbackScannedCoins(params.timeframe);
    }

    // Top 30 coins by volume for fast client pattern recognition
    const topCandidates = allCoins.slice(0, 30);
    const scanned: ScannedCoin[] = [];

    await Promise.all(
      topCandidates.map(async (coin) => {
        try {
          const klines = await fetchDirectKlines(coin.exchange, coin.marketType, coin.symbol, params.timeframe, 60);
          const formations = klines.length >= 20 ? detectFormations(klines, coin.symbol).filter((f) => f.validation && f.validation.enoughData && f.validation.finiteData) : [];

          scanned.push({
            symbol: coin.symbol,
            baseAsset: coin.baseAsset,
            quoteAsset: coin.quoteAsset,
            exchange: coin.exchange,
            marketType: coin.marketType,
            currentPrice: coin.price,
            priceChange24h: coin.change24h,
            highPrice24h: coin.high24h,
            lowPrice24h: coin.low24h,
            volume24hUsd: coin.volumeUsd,
            formations,
            timeframe: params.timeframe,
            lastUpdated: Date.now(),
            exchangeUrl: coin.exchangeUrl,
          });
        } catch {
          // ignore individual coin fail
        }
      })
    );

    scanned.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
    return scanned.length > 0 ? scanned : getFallbackScannedCoins(params.timeframe);
  } catch (err) {
    console.warn('Client-side scan fallback error:', err);
    return getFallbackScannedCoins(params.timeframe);
  }
}

/**
 * Emergency static fallback coins (ensures coin search and selection ALWAYS work)
 */
export function getFallbackScannedCoins(timeframe: Timeframe = '1h'): ScannedCoin[] {
  return TOP_POPULAR_PAIRS.map((p, idx) => ({
    symbol: p.symbol,
    baseAsset: p.baseAsset,
    quoteAsset: 'USDT',
    exchange: 'binance',
    marketType: 'futures',
    currentPrice: 0,
    priceChange24h: 0,
    highPrice24h: 0,
    lowPrice24h: 0,
    volume24hUsd: 0,
    formations: [],
    timeframe,
    lastUpdated: Date.now(),
    exchangeUrl: getExchangeUrl('binance', 'futures', p.symbol),
  }));
}

const directLocationCache = new MarketLocationCache((exchange, market, symbol) =>
  fetchDirectKlines(exchange, market, symbol, '1d', 731));
