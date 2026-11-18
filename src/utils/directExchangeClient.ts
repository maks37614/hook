import { normalizeExchangeSymbol } from './marketSymbols';
import { MarketLocationCache } from './marketLocationCache';
import { ExchangeId, MarketType, Timeframe, Kline, ScannedCoin, MarketCoin } from '../types';
import { detectFormations, regularFormationCandidates } from './patternRecognition';
import { CANDLE_SECONDS, readRegularFormationCandles } from './regularFormationCandles';
import { refineRegularFormationSet } from './regularFormationSetup';
import { scoreRegularFlowQuality } from './regularFlowQuality';
import { calculateRegularIndicatorValues, readQuoteTurnover } from './regularFormationIndicators';
import { hasAlignedRegularOI, requestRegularOI, withAlignedRegularOI } from './regularOIHistory';
import { alignEarlyFormationToTick, detectEarlyReversalFormations, prepareEarlyFormationCandles } from './earlyFormations';
import { fetchExchangeTickSize } from './exchangeTickSize';

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

function toBinanceInterval(tf: Timeframe | '30m'): string {
  switch (tf) {
    case '1m': return '1m';
    case '5m': return '5m';
    case '15m': return '15m';
    case '30m': return '30m';
    case '1h': return '1h';
    case '4h': return '4h';
    case '1d': return '1d';
    default: return '1h';
  }
}

function toBybitInterval(tf: Timeframe | '30m'): string {
  switch (tf) {
    case '1m': return '1';
    case '5m': return '5';
    case '15m': return '15';
    case '30m': return '30';
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

function tickerSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(4000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function fetchDirectBinanceTickers(options: DirectTickerOptions = {}): Promise<MarketCoin[]> {
  const futuresMirrors = [
    'https://fapi.binance.com/fapi/v1/ticker/24hr',
    'https://fapi1.binance.com/fapi/v1/ticker/24hr',
  ];
  const spotMirrors = [
    'https://data-api.binance.vision/api/v3/ticker/24hr',
    'https://api.binance.com/api/v3/ticker/24hr',
    'https://api1.binance.com/api/v3/ticker/24hr',
  ];

  const coins: MarketCoin[] = [];
  const seen = new Set<string>();

  // 1. Fetch Binance Futures
  let futuresStatus: DirectTickerSourceStatus = {
    exchange: 'binance', marketType: 'futures', status: 'unavailable', updatedAt: null,
  };
  for (const url of options.marketType === 'spot' ? [] : futuresMirrors) {
    if (options.signal?.aborted) return coins;
    try {
      const res = await fetch(url, { signal: tickerSignal(options.signal) });
      if (!res.ok) {
        futuresStatus.error = `HTTP ${res.status}`;
        if ([403, 451, 429].includes(res.status)) break;
        continue;
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        futuresStatus.error = 'Некоректна відповідь біржі';
        continue;
      }

      for (const item of data) {
        if (!item.symbol || !item.symbol.endsWith('USDT')) continue;
        const symbol = item.symbol;
        const key = `binance_${symbol}_futures`;
        if (seen.has(key)) continue;

        const base = symbol.replace('USDT', '');
        const price = parseFloat(item.lastPrice) || 0;
        const volumeUsd = parseFloat(item.quoteVolume) || 0;
        const change24h = parseFloat(item.priceChangePercent) || 0;
        const high = parseFloat(item.highPrice) || price;
        const low = parseFloat(item.lowPrice) || price;

        if (price <= 0 || volumeUsd < (options.minVolumeUsd ?? 50_000)) continue;
        seen.add(key);

        const distanceToHighPct = high > 0 ? Math.max(0, ((high - price) / high) * 100) : 0;
        const distanceToLowPct = low > 0 ? Math.max(0, ((price - low) / low) * 100) : 0;
        const volatility24hPct = low > 0 ? Math.max(0, ((high - low) / low) * 100) : 0;

        coins.push({
          symbol,
          baseAsset: base,
          quoteAsset: 'USDT',
          exchange: 'binance',
          marketType: 'futures',
          price,
          change24h: Number(change24h.toFixed(2)),
          volumeUsd,
          high24h: high,
          low24h: low,
          distanceToHighPct: Number(distanceToHighPct.toFixed(2)),
          distanceToLowPct: Number(distanceToLowPct.toFixed(2)),
          volatility24hPct: Number(volatility24hPct.toFixed(2)),
          volatility5mPct: Number((volatility24hPct * 0.12).toFixed(2)),
          isNearHigh: false,
          isNearLow: false,
          isActiveCoin: (volatility24hPct >= 4 && volumeUsd >= 2_000_000) || Math.abs(change24h) >= 5,
          exchangeUrl: getExchangeUrl('binance', 'futures', symbol),
        });
      }
      futuresStatus = { exchange: 'binance', marketType: 'futures', status: 'live', updatedAt: Date.now() };
      break;
    } catch (error) {
      futuresStatus.error = error instanceof Error ? error.message : 'Помилка з’єднання';
    }
  }
  if (options.marketType !== 'spot') options.onSourceStatus?.(futuresStatus);

  // 2. Fetch Binance Spot
  let spotStatus: DirectTickerSourceStatus = {
    exchange: 'binance', marketType: 'spot', status: 'unavailable', updatedAt: null,
  };
  for (const url of options.marketType === 'futures' ? [] : spotMirrors) {
    if (options.signal?.aborted) return coins;
    try {
      const res = await fetch(url, { signal: tickerSignal(options.signal) });
      if (!res.ok) {
        spotStatus.error = `HTTP ${res.status}`;
        if ([403, 451, 429].includes(res.status)) break;
        continue;
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        spotStatus.error = 'Некоректна відповідь біржі';
        continue;
      }

      for (const item of data) {
        if (!item.symbol || !item.symbol.endsWith('USDT')) continue;
        const symbol = item.symbol;
        const key = `binance_${symbol}_spot`;
        if (seen.has(key)) continue;

        const base = symbol.replace('USDT', '');
        const price = parseFloat(item.lastPrice) || 0;
        const volumeUsd = parseFloat(item.quoteVolume) || 0;
        const change24h = parseFloat(item.priceChangePercent) || 0;
        const high = parseFloat(item.highPrice) || price;
        const low = parseFloat(item.lowPrice) || price;

        if (price <= 0 || volumeUsd < (options.minVolumeUsd ?? 50_000)) continue;
        seen.add(key);

        const distanceToHighPct = high > 0 ? Math.max(0, ((high - price) / high) * 100) : 0;
        const distanceToLowPct = low > 0 ? Math.max(0, ((price - low) / low) * 100) : 0;
        const volatility24hPct = low > 0 ? Math.max(0, ((high - low) / low) * 100) : 0;

        coins.push({
          symbol,
          baseAsset: base,
          quoteAsset: 'USDT',
          exchange: 'binance',
          marketType: 'spot',
          price,
          change24h: Number(change24h.toFixed(2)),
          volumeUsd,
          high24h: high,
          low24h: low,
          distanceToHighPct: Number(distanceToHighPct.toFixed(2)),
          distanceToLowPct: Number(distanceToLowPct.toFixed(2)),
          volatility24hPct: Number(volatility24hPct.toFixed(2)),
          volatility5mPct: Number((volatility24hPct * 0.12).toFixed(2)),
          isNearHigh: false,
          isNearLow: false,
          isActiveCoin: (volatility24hPct >= 4 && volumeUsd >= 2_000_000) || Math.abs(change24h) >= 5,
          exchangeUrl: getExchangeUrl('binance', 'spot', symbol),
        });
      }
      spotStatus = { exchange: 'binance', marketType: 'spot', status: 'live', updatedAt: Date.now() };
      break;
    } catch (error) {
      spotStatus.error = error instanceof Error ? error.message : 'Помилка з’єднання';
    }
  }
  if (options.marketType !== 'futures') options.onSourceStatus?.(spotStatus);

  coins.sort((a, b) => b.volumeUsd - a.volumeUsd);
  return directLocationCache.enrich(coins);
}

/**
 * Direct client-side fetch from Bybit (Linear Futures + Spot)
 */
export async function fetchDirectBybitTickers(options: DirectTickerOptions = {}): Promise<MarketCoin[]> {
  const categories = [
    { cat: 'linear', market: 'futures' as MarketType },
    { cat: 'spot', market: 'spot' as MarketType },
  ];
  const mirrors = [
    'https://api.bybit.com',
    'https://api.bytick.com',
  ];

  const coins: MarketCoin[] = [];
  const seen = new Set<string>();

  for (const { cat, market } of categories) {
    if (options.marketType && options.marketType !== 'all' && options.marketType !== market) continue;
    let sourceStatus: DirectTickerSourceStatus = {
      exchange: 'bybit', marketType: market, status: 'unavailable', updatedAt: null,
    };
    for (const host of mirrors) {
      if (options.signal?.aborted) return coins;
      try {
        const url = `${host}/v5/market/tickers?category=${cat}`;
        const res = await fetch(url, { signal: tickerSignal(options.signal) });
        if (!res.ok) {
          sourceStatus.error = `HTTP ${res.status}`;
          if ([403, 451, 429].includes(res.status)) break;
          continue;
        }
        const json = await res.json();
        if (json?.retCode !== 0) {
          sourceStatus.error = `Bybit retCode ${json?.retCode ?? 'unknown'}`;
          continue;
        }
        const list = json?.result?.list;
        if (!Array.isArray(list)) {
          sourceStatus.error = 'Некоректна відповідь біржі';
          continue;
        }

        for (const item of list) {
          if (!item.symbol || !item.symbol.endsWith('USDT')) continue;
          const symbol = item.symbol;
          const key = `bybit_${symbol}_${market}`;
          if (seen.has(key)) continue;

          const base = symbol.replace('USDT', '');
          const price = parseFloat(item.lastPrice) || 0;
          const volumeUsd = parseFloat(item.turnover24h) || 0;
          const change24h = (parseFloat(item.price24hPcnt) || 0) * 100;
          const high = parseFloat(item.highPrice24h) || price;
          const low = parseFloat(item.lowPrice24h) || price;

          if (price <= 0 || volumeUsd < (options.minVolumeUsd ?? 50_000)) continue;
          seen.add(key);

          const distanceToHighPct = high > 0 ? Math.max(0, ((high - price) / high) * 100) : 0;
          const distanceToLowPct = low > 0 ? Math.max(0, ((price - low) / low) * 100) : 0;
          const volatility24hPct = low > 0 ? Math.max(0, ((high - low) / low) * 100) : 0;

          coins.push({
            symbol,
            baseAsset: base,
            quoteAsset: 'USDT',
            exchange: 'bybit',
            marketType: market,
            price,
            change24h: Number(change24h.toFixed(2)),
            volumeUsd,
            high24h: high,
            low24h: low,
            distanceToHighPct: Number(distanceToHighPct.toFixed(2)),
            distanceToLowPct: Number(distanceToLowPct.toFixed(2)),
            volatility24hPct: Number(volatility24hPct.toFixed(2)),
            volatility5mPct: Number((volatility24hPct * 0.12).toFixed(2)),
            isNearHigh: false,
            isNearLow: false,
            isActiveCoin: (volatility24hPct >= 4 && volumeUsd >= 2_000_000) || Math.abs(change24h) >= 5,
            exchangeUrl: getExchangeUrl('bybit', market, symbol),
          });
        }
        sourceStatus = { exchange: 'bybit', marketType: market, status: 'live', updatedAt: Date.now() };
        break; // Successfully loaded this category
      } catch (error) {
        sourceStatus.error = error instanceof Error ? error.message : 'Помилка з’єднання';
      }
    }
    options.onSourceStatus?.(sourceStatus);
  }

  coins.sort((a, b) => b.volumeUsd - a.volumeUsd);
  return directLocationCache.enrich(coins);
}

// Fast client-side memory cache for direct exchange kline calls
const directKlinesCache = new Map<string, { data: Kline[]; timestamp: number; requestedAt: number }>();
const CLIENT_CACHE_TTL_MS = 1500;

/**
 * Direct client-side fetch of Klines
 */
export async function fetchDirectKlines(
  exchange: ExchangeId,
  market: MarketType,
  symbol: string,
  timeframe: Timeframe | '30m',
  limit: number = 70,
  startTime?: number,
  endTime?: number
): Promise<Kline[]> {
  // Exchanges do not expose native 30s Klines; Terminal builds them from trades.
  if (timeframe === '30s') return [];
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
          const requestedAt = Date.now();
          const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
          if (!res.ok) continue;
          const json = await res.json();
          const list = json?.result?.list;
          if (json.retCode !== 0 || (json.result.category && json.result.category !== primaryCategory)
            || (json.result.symbol && json.result.symbol !== cleanSymbol) || !Array.isArray(list) || list.length === 0) continue;

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

          directKlinesCache.set(cacheKey, { data: result, timestamp: Date.now(), requestedAt });
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
      const requestedAt = Date.now();
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
        quoteVolume: readQuoteTurnover(d[7]),
        buyVolume: Number(d[9]),
        buyQuoteVolume: readQuoteTurnover(d[10]),
      }));

      directKlinesCache.set(cacheKey, { data: result, timestamp: Date.now(), requestedAt });
      return result;
    } catch {
      // Try next
    }
  }

  return cached?.data || [];
}

/** One combined, volume-ranked pool across exchanges and markets. */
export function selectDirectEarlyScanCandidates(coins: MarketCoin[], budget = 60): MarketCoin[] {
  return [...coins]
    .filter(c => Number.isFinite(c.volumeUsd) && c.volumeUsd > 0)
    .sort((a, b) => b.volumeUsd - a.volumeUsd
      || a.exchange.localeCompare(b.exchange)
      || a.marketType.localeCompare(b.marketType)
      || a.symbol.localeCompare(b.symbol))
    .slice(0, Math.max(0, Math.floor(budget)));
}

/**
 * Direct client-side scan fallback
 */
export async function runDirectClientScan(params: {
  exchange: 'all' | ExchangeId;
  marketType: 'all' | MarketType;
  timeframe: Timeframe;
  minVolumeUsd?: number;
}, options: {
  /** Full W/M fallback scans the entire exchange ticker universe, not the top 60. */
  completeEarly?: boolean;
  /** Preserve the legacy placeholder list only for consumers that explicitly want it. */
  allowStaticFallback?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: {
    processed: number; total: number; failed: number; skipped: number;
    data: ScannedCoin[]; missingSources: string[];
  }) => void;
} = {}): Promise<ScannedCoin[]> {
  try {
    const missingSources: string[] = [];
    const tickerOptions: DirectTickerOptions = {
      marketType: params.marketType,
      // Full scan must include low-volume and newly listed pairs; regular
      // fallback preserves its previous default volume threshold.
      minVolumeUsd: options.completeEarly ? (params.minVolumeUsd ?? 0) : undefined,
      signal: options.signal,
      onSourceStatus: row => {
        if (row.status === 'unavailable') missingSources.push(`${row.exchange} ${row.marketType}: ${row.error || 'недоступно'}`);
      },
    };
    const [binanceCoins, bybitCoins] = await Promise.all([
      params.exchange === 'all' || params.exchange === 'binance'
        ? fetchDirectBinanceTickers(tickerOptions) : Promise.resolve([]),
      params.exchange === 'all' || params.exchange === 'bybit'
        ? fetchDirectBybitTickers(tickerOptions) : Promise.resolve([]),
    ]);

    // Rank the combined market by volume, not by provider insertion order.
    // A bounded budget keeps the browser fallback responsive.
    const allCoins = [...binanceCoins, ...bybitCoins].filter(
      c => params.marketType === 'all' || c.marketType === params.marketType,
    );
    if (allCoins.length === 0) {
      if (options.completeEarly) throw new Error('Біржі не повернули доступних USDT-пар.');
      return options.allowStaticFallback === false ? [] : getFallbackScannedCoins(params.timeframe);
    }

    const topCandidates = selectDirectEarlyScanCandidates(allCoins,
      options.completeEarly ? allCoins.length : 60);
    const scanned: ScannedCoin[] = [];
    // Browser OI is fetched ONLY for ordinary futures formations. Limit
    // concurrent OI calls to avoid flooding the exchange during a batch scan.
    const activeOiRequests: Array<Promise<unknown>> = [];
    const boundedOiRequest = async (coin: MarketCoin) => {
      while (activeOiRequests.length >= 4) await Promise.race(activeOiRequests);
      const pending = requestRegularOI(coin.exchange, coin.marketType, coin.symbol,
        params.timeframe, fetch, { signal: options.signal, timeoutMs: 5000 });
      activeOiRequests.push(pending);
      try { return await pending; }
      finally {
        const index = activeOiRequests.indexOf(pending);
        if (index >= 0) activeOiRequests.splice(index, 1);
      }
    };
    let failed = 0;
    let skipped = 0;
    const batchSize = options.completeEarly ? 3 : 20;
    options.onProgress?.({ processed: 0, total: topCandidates.length, failed, skipped,
      data: [], missingSources: [...missingSources] });
    for (let start = 0; start < topCandidates.length; start += batchSize) {
      if (options.signal?.aborted) throw new Error('Сканування скасовано');
      await Promise.all(topCandidates.slice(start, start + batchSize).map(async (coin) => {
        try {
          const klines = await fetchDirectKlines(coin.exchange, coin.marketType, coin.symbol, params.timeframe, 70);
          const cached = directKlinesCache.get(`${coin.exchange}:${coin.marketType}:${normalizeExchangeSymbol(coin.symbol)}:${params.timeframe}:70::`);
          const now = Date.now();
          const regularWindow = !options.completeEarly && cached?.data === klines
            ? readRegularFormationCandles(klines, params.timeframe, cached.timestamp, now, cached.requestedAt)
            : null;
          const collectedAt = regularWindow?.provenance.collectedAt ?? now;
          const closedKlines = options.completeEarly
            ? prepareEarlyFormationCandles(klines, params.timeframe, now, true)
            : regularWindow?.closed;
          if (!closedKlines) {
            if (klines.length > 0 && klines.length < 35) skipped++;
            else failed++;
            return;
          }
          const baseFormations = detectFormations(closedKlines, coin.symbol)
            .filter(f => f.validation && f.validation.enoughData && f.validation.finiteData);
          const rawEarly = detectEarlyReversalFormations(closedKlines, coin.symbol, baseFormations, collectedAt);
          const candidates = options.completeEarly ? baseFormations
            : regularFormationCandidates(closedKlines, baseFormations, coin.symbol, params.timeframe, null);
          const tickSize = rawEarly.length || (!options.completeEarly && candidates.length)
            ? await fetchExchangeTickSize(coin.exchange, coin.marketType, coin.symbol)
            : null;
          // Full early W/M mode sees the unmodified detector result; only the
          // ordinary screener receives the conservative target/stop model.
          const formations = options.completeEarly
            ? baseFormations : refineRegularFormationSet(closedKlines, candidates, tickSize);
          const earlyFormations = rawEarly.flatMap(candidate => {
            const aligned = alignEarlyFormationToTick(candidate, tickSize);
            return aligned ? [aligned] : [];
          });
          let regularIndicators = options.completeEarly ? undefined
            : calculateRegularIndicatorValues(closedKlines);
          if (regularIndicators && coin.marketType === 'spot') {
            regularIndicators.oiAvailability = 'spot';
          }
          if (!options.completeEarly && regularIndicators
            && formations.length > 0 && coin.marketType === 'futures') {
            const oi = await boundedOiRequest(coin);
            regularIndicators = withAlignedRegularOI(regularIndicators, oi, 'browser');
          }
          const scoredFormations = options.completeEarly ? formations
            : formations.map(formation => scoreRegularFlowQuality(formation,
                regularIndicators, coin.exchange, coin.marketType));
          const seconds = CANDLE_SECONDS[params.timeframe];
          if (!options.completeEarly || earlyFormations.length) scanned.push({
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
            formations: scoredFormations,
            earlyFormations,
            regularIndicators,
            timeframe: params.timeframe,
            lastUpdated: collectedAt,
            formationData: regularWindow?.provenance ?? {
              collectedAt,
              lastClosedAt: (closedKlines[closedKlines.length - 1].time + seconds) * 1000,
              contiguous: true,
            },
            exchangeUrl: coin.exchangeUrl,
          });
        } catch {
          failed++;
        }
      }));
      if (options.signal?.aborted) throw new Error('Сканування скасовано');
      options.onProgress?.({
        processed: Math.min(start + batchSize, topCandidates.length),
        total: topCandidates.length, failed, skipped,
        data: [...scanned], missingSources: [...missingSources],
      });
      // Browser fallback respects rate limits instead of flooding both exchanges.
      if (options.completeEarly && start + batchSize < topCandidates.length) {
        await new Promise(resolve => setTimeout(resolve, 650));
      }
    }
    scanned.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
    if (options.completeEarly) return scanned;
    return scanned.length > 0 ? scanned
      : options.allowStaticFallback === false ? [] : getFallbackScannedCoins(params.timeframe);
  } catch (err) {
    if (options.completeEarly) throw err;
    console.warn('Client-side scan fallback error:', err);
    return options.allowStaticFallback === false ? [] : getFallbackScannedCoins(params.timeframe);
  }
}

/**
 * Server-side ordinary scans may have valid formations but no OI because its
 * cloud IP cannot reach Binance/Bybit. Supplement just those missing OI values
 * directly from the user's browser; NEVER run this for early W/M results.
 * Match the period to the server's original candles and update evidence only.
 */
export async function hydrateMissingRegularOIFromBrowser(
  coins: ScannedCoin[], options: { signal?: AbortSignal } = {},
): Promise<ScannedCoin[]> {
  const needed = coins.filter(coin => coin.marketType === 'futures'
    && coin.formations.some(f => f.validation?.confluence?.scoreVersion === 2)
    && coin.regularIndicators?.candleContext
    && !hasAlignedRegularOI(coin.regularIndicators)
    && coin.regularIndicators.oiAvailability !== 'misaligned'
    && coin.regularIndicators.oiAvailability !== 'unsupported-timeframe');
  if (!needed.length) return coins;
  const results = new Map<ScannedCoin, ScannedCoin>();
  for (let index = 0; index < needed.length; index += 4) {
    if (options.signal?.aborted) return coins;
    const batch = needed.slice(index, index + 4);
    await Promise.all(batch.map(async coin => {
      if (options.signal?.aborted) return;
      const oi = await requestRegularOI(coin.exchange, coin.marketType, coin.symbol,
        coin.timeframe, fetch, { signal: options.signal, timeoutMs: 5000 });
      if (options.signal?.aborted) return;
      const indicators = withAlignedRegularOI(coin.regularIndicators!, oi, 'browser');
      results.set(coin, {
        ...coin,
        regularIndicators: indicators,
        formations: coin.formations.map(formation => {
          const densityChecked = formation.validation?.confluence?.components.density?.available === true;
          return scoreRegularFlowQuality(formation, indicators, coin.exchange,
            coin.marketType, densityChecked, true);
        }),
      });
    }));
  }
  return coins.map(coin => results.get(coin) ?? coin);
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

