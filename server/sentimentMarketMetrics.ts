import type { MarketCoin, MarketSentimentData } from '../src/types';
import { exchangeFetch } from './exchangeHttp';

/** No synthetic OI: Bybit's already-fetched linear USDT tickers expose USD OI and funding. */
export function aggregateBybitDerivatives(coins: readonly MarketCoin[]): MarketSentimentData['derivativesOverview'] {
  let openInterestUsd = 0;
  let fundingWeightedSum = 0;
  let fundingWeight = 0;
  let fundingCount = 0;
  let count = 0;
  for (const coin of coins) {
    if (coin.exchange !== 'bybit' || coin.marketType !== 'futures' ||
        !Number.isFinite(coin.openInterestUsd) || (coin.openInterestUsd ?? 0) <= 0) continue;
    const oi = coin.openInterestUsd!;
    openInterestUsd += oi;
    count++;
    if (Number.isFinite(coin.fundingRatePct)) {
      fundingWeightedSum += coin.fundingRatePct! * oi;
      fundingWeight += oi;
      fundingCount++;
    }
  }
  const avgFundingRate = fundingWeight > 0 ? Number((fundingWeightedSum / fundingWeight).toFixed(5)) : null;
  return {
    aggregatedOIUsd: count > 0 ? Math.round(openInterestUsd) : null,
    oiChange24hPct: null, // A one-time ticker cannot establish a 24-hour OI change.
    avgFundingRate,
    fundingBias: avgFundingRate === null ? null : avgFundingRate > 0.01 ? 'long_heavy'
      : avgFundingRate < -0.01 ? 'short_heavy' : 'balanced',
    instrumentCount: count,
    fundingInstrumentCount: fundingCount,
    sourceLabel: count > 0 ? `Bybit USDT Linear · OI ${count} / Funding ${fundingCount} контрактів` : undefined,
  };
}

export type TakerDeltaSnapshot = {
  deltaUsd: number;
  sampledPairs: number;
  requestedPairs: number;
  sampledAt: number;
  /** Futures if accessible; otherwise the public Binance Spot market-data API. */
  marketType: 'futures' | 'spot';
};

/** One unfinished UTC-day candle; not a rolling 24-hour net capital inflow. */
export function parseBinanceDailyTakerDelta(payload: unknown, now: number): number | null {
  const row = Array.isArray(payload) && Array.isArray(payload[0]) ? payload[0] : null;
  if (!row || row.length < 11) return null;
  const day = Math.floor(now / 86_400_000) * 86_400_000;
  if (Number(row[0]) !== day) return null;
  const quote = Number(row[7]);
  const buy = Number(row[10]);
  if (![quote, buy].every(Number.isFinite) || quote <= 0 || buy < 0 || buy > quote) return null;
  // Quote volume of taker buys minus taker sells, in USDT.
  return 2 * buy - quote;
}

// Server-wide, never per-user. Both sources share the existing global IP limiter.
const SAMPLE_SIZE = 8;
const CACHE_MS = 5 * 60_000;
const FUTURES_GEO_COOLDOWN_MS = 30 * 60_000;
let cache: { at: number; utcDay: number; value: TakerDeltaSnapshot | null } | null = null;
let inflight: Promise<TakerDeltaSnapshot | null> | null = null;
let futuresGeoBlockedUntil = 0;

function sampleSymbols(coins: readonly MarketCoin[], marketType: 'futures' | 'spot'): string[] {
  return [...new Set(coins
    .filter(c => c.exchange === 'binance' && c.marketType === marketType && c.volumeUsd > 0 &&
      /^[A-Z0-9]{3,20}USDT$/.test(c.symbol))
    .sort((a, b) => b.volumeUsd - a.volumeUsd)
    .map(c => c.symbol))].slice(0, SAMPLE_SIZE);
}

type MarketSample = { deltaUsd: number; count: number; blockedStatus: number | null };

/**
 * A fixed-size, current-UTC-day sample. Never join Spot and Futures values:
 * they are separate markets with distinct activity and must be labeled.
 */
async function sampleMarket(
  marketType: 'futures' | 'spot',
  symbols: readonly string[],
  now: number,
  request: typeof fetch,
): Promise<MarketSample> {
  let current = 0;
  let deltaUsd = 0;
  let count = 0;
  let blockedStatus: number | null = null;
  const endpoint = marketType === 'futures'
    ? 'https://fapi.binance.com/fapi/v1/klines'
    : 'https://data-api.binance.vision/api/v3/klines';

  await Promise.all(Array.from({ length: Math.min(4, symbols.length) }, async () => {
    while (current < symbols.length && blockedStatus === null) {
      const symbol = symbols[current++];
      try {
        const response = await request(
          `${endpoint}?symbol=${encodeURIComponent(symbol)}&interval=1d&limit=1`,
          { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4_000) },
        );
        if (!response.ok) {
          if (response.status === 403 || response.status === 451 || response.status === 429) {
            blockedStatus = response.status;
          }
          continue;
        }
        const observed = parseBinanceDailyTakerDelta(await response.json(), now);
        if (observed === null) continue;
        deltaUsd += observed;
        count++;
      } catch {
        // No synthetic fallback. Try the independent Spot market below.
      }
    }
  }));
  return { deltaUsd, count, blockedStatus };
}

/**
 * Prefer Binance USD-M Futures; when its REST endpoint is blocked (for example
 * geo HTTP 451), fall back to the officially published Binance Spot data API.
 * Restrict both sources to eight symbols every five minutes globally.
 * Uses shared exchangeFetch IP budgets, not per-browser REST requests.
 */
export async function getSampledTakerDelta(
  coins: readonly MarketCoin[],
  now = Date.now(),
  request: typeof fetch = exchangeFetch,
): Promise<TakerDeltaSnapshot | null> {
  const utcDay = Math.floor(now / 86_400_000);
  if (cache && cache.utcDay === utcDay && now - cache.at >= 0 && now - cache.at < CACHE_MS) {
    return cache.value;
  }
  if (inflight) return inflight;

  const futuresSymbols = sampleSymbols(coins, 'futures');
  const spotSymbols = sampleSymbols(coins, 'spot');
  if (!futuresSymbols.length && !spotSymbols.length) return null;

  inflight = (async () => {
    if (futuresSymbols.length >= 3 && now >= futuresGeoBlockedUntil) {
      const futures = await sampleMarket('futures', futuresSymbols, now, request);
      if (futures.blockedStatus === 403 || futures.blockedStatus === 451) {
        futuresGeoBlockedUntil = now + FUTURES_GEO_COOLDOWN_MS;
        console.warn(`[SentimentFlow] Binance Futures klines unavailable (HTTP ${futures.blockedStatus}); switching to Spot`);
      }
      if (futures.count >= 3) {
        return {
          deltaUsd: Math.round(futures.deltaUsd),
          sampledPairs: futures.count,
          requestedPairs: futuresSymbols.length,
          sampledAt: Date.now(),
          marketType: 'futures' as const,
        };
      }
    }

    if (spotSymbols.length >= 3) {
      const spot = await sampleMarket('spot', spotSymbols, now, request);
      if (spot.count >= 3) {
        return {
          deltaUsd: Math.round(spot.deltaUsd),
          sampledPairs: spot.count,
          requestedPairs: spotSymbols.length,
          sampledAt: Date.now(),
          marketType: 'spot' as const,
        };
      }
    }

    return null;
  })();
  try {
    const value = await inflight;
    cache = { at: now, utcDay, value };
    return value;
  } finally {
    inflight = null;
  }
}
