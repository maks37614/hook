import { fetchMarketCoins, fetchOrderBook } from './marketService';
import type { ExchangeId, MarketType, MarketCoin } from '../src/types';
import { requestMarketTickers } from '../src/utils/marketRequests';
import { exchangeLevelAppearance, watchExchangeOrderbooks } from './densityExchangeTimes';

export type DensitySide = 'bid' | 'ask';
export type DensityCategory = 'all' | 'crypto' | 'stocks' | 'custom';
export type DensityQuoteAsset = 'all' | 'USDT' | 'USDC';

export interface DensityScanOptions {
  exchange: 'all' | ExchangeId;
  marketType: 'all' | MarketType;
  category: DensityCategory;
  quoteAsset: DensityQuoteAsset;
  symbols: string[];
  search: string;
  side: 'both' | DensitySide;
  minNotionalUsd: number;
  minVolumeUsd: number;
  strengthMultiplier: number;
  maxDistancePct: number;
  bucketPct: number;
  limit: number;
  offset: number;
}

export interface DensityLevel {
  side: DensitySide;
  price: number;
  quantity: number;
  notionalUsd: number;
  distancePct: number;
  strength: number;
  isWall: boolean;
  firstSeenAt?: number;
  lastSeenAt?: number;
  observations?: number;
  /** Set only after a real exchange WebSocket depth delta showed a new wall. */
  exchangeAppearedAt?: number;
}

type DensityCandidate = Pick<MarketCoin, 'symbol' | 'baseAsset' | 'quoteAsset' |
  'exchange' | 'marketType' | 'exchangeUrl' | 'change24h' | 'volumeUsd'>;

export interface DensityCoin {
  symbol: string;
  baseAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
  exchangeUrl: string;
  category: 'crypto' | 'stocks';
  currentPrice: number;
  change24h: number;
  volume24hUsd: number;
  spreadPct: number;
  timestamp: number;
  walls: DensityLevel[];
  bids: DensityLevel[];
  asks: DensityLevel[];
}

const STOCK_ROOTS = new Set([
  'AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'GOOG', 'META',
  'MSTR', 'COIN', 'PLTR', 'SPY', 'QQQ', 'AMD', 'INTC', 'NFLX', 'HOOD',
  'BABA', 'JPM', 'BA', 'PFE', 'DIS', 'PYPL', 'UBER', 'ORCL', 'COST',
  'AVGO', 'ARM', 'MU', 'IBM', 'WMT', 'NKE', 'GS', 'V', 'MA', 'GLD',
  'SLV', 'IWM', 'SMCI', 'CRCL', 'OPEN', 'RBLX', 'SOFI', 'GME', 'AMC',
]);

export function isTokenizedStock(baseAsset: string): boolean {
  const base = baseAsset.toUpperCase();
  return STOCK_ROOTS.has(base) ||
    (base.endsWith('X') && STOCK_ROOTS.has(base.slice(0, -1))) ||
    (base.endsWith('ON') && STOCK_ROOTS.has(base.slice(0, -2)));
}

function groupSide(
  raw: [number, number][],
  side: DensitySide,
  mid: number,
  options: DensityScanOptions,
): DensityLevel[] {
  // Cap the configured bucket width to the visible snapshot span, so a
  // tight BTC book does not collapse 200 raw levels into a single false wall.
  const eligiblePrices = raw.filter(([price, quantity]) => price > 0 && quantity > 0 &&
    Math.abs(price / mid - 1) * 100 <= options.maxDistancePct).map(([price]) => price);
  const span = eligiblePrices.length ? Math.max(...eligiblePrices) - Math.min(...eligiblePrices) : 0;
  const step = Math.min(mid * options.bucketPct / 100, Math.max(span / 12, mid * 0.0000001));
  const bins = new Map<number, { totalUsd: number; quantity: number }>();
  for (const [price, qty] of raw) {
    if (!(price > 0 && qty > 0 && Number.isFinite(price) && Number.isFinite(qty))) continue;
    if (Math.abs(price / mid - 1) * 100 > options.maxDistancePct) continue;
    const bin = side === 'bid' ? Math.floor(price / step) : Math.ceil(price / step);
    const entry = bins.get(bin) || { totalUsd: 0, quantity: 0 };
    entry.totalUsd += price * qty;
    entry.quantity += qty;
    bins.set(bin, entry);
  }
  const values = [...bins.values()].map(entry => entry.totalUsd).filter(v => v > 0);
  const baseline = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  return [...bins.entries()].map(([bin, entry]): DensityLevel => {
    const price = entry.quantity > 0 ? entry.totalUsd / entry.quantity : bin * step;
    const strength = baseline > 0 ? entry.totalUsd / baseline : 0;
    return {
      side,
      price,
      quantity: entry.quantity,
      notionalUsd: entry.totalUsd,
      distancePct: Math.abs(price / mid - 1) * 100,
      strength,
      isWall: entry.totalUsd >= options.minNotionalUsd &&
        strength >= options.strengthMultiplier,
    };
  }).sort((a, b) => side === 'bid' ? b.price - a.price : a.price - b.price);
}

function previewRows(levels: DensityLevel[]): DensityLevel[] {
  // The first rows are always nearest to the spread; include stronger walls farther out.
  const selected = new Map<number, DensityLevel>();
  for (const row of levels.slice(0, 4)) selected.set(row.price, row);
  for (const row of levels.filter(row => row.isWall).sort((a, b) => b.notionalUsd - a.notionalUsd).slice(0, 2)) {
    selected.set(row.price, row);
  }
  return [...selected.values()].sort((a, b) => a.side === 'bid' ? b.price - a.price : a.price - b.price).slice(0, 6);
}

// Share a rate-friendly snapshot queue across all density scans within this
// process instead of opening thousands of exchange requests simultaneously.
let nextSnapshotAt = 0;
async function waitForSnapshotSlot() {
  const now = Date.now();
  const slot = Math.max(now, nextSnapshotAt);
  const delay = slot - now;
  if (delay > 10_000) throw new Error('Черга сканування переповнена. Спробуйте трохи пізніше.');
  nextSnapshotAt = slot + 350;
  if (delay > 0) await new Promise<void>(resolve => setTimeout(resolve, delay));
}

// Observed wall lifetime, NOT the order creation time (orderbook snapshots
// do not expose that). A wall survives a rescan only while its level is still
// present and meets the same thresholds. In-memory history resets on deploy.
interface WallObservation {
  price: number;
  firstSeenAt: number;
  lastSeenAt: number;
  observations: number;
  exchangeAppearedAt?: number;
}
const wallHistory = new Map<string, { seenAt: number; levels: WallObservation[] }>();
const MAX_WALL_GAP_MS = 6 * 60_000;
function updateWallLifetime(coin: DensityCandidate, options: DensityScanOptions, side: DensitySide,
  levels: DensityLevel[], mid: number, seenAt: number) {
  const key = [coin.exchange, coin.marketType, coin.symbol, side,
    options.bucketPct, options.minNotionalUsd, options.strengthMultiplier, options.maxDistancePct].join(':');
  const old = wallHistory.get(key);
  const previous = old && seenAt - old.seenAt <= MAX_WALL_GAP_MS ? [...old.levels] : [];
  const next: WallObservation[] = [];
  const tolerance = Math.max(mid * options.bucketPct / 200, mid * 0.00005);
  // Track only levels that are still walls. If the price level or its order
  // size changes enough to stop qualifying, reset the observation.
  for (const level of levels) {
    if (!level.isWall) continue;
    const matchIndex = previous.findIndex(item => Math.abs(item.price - level.price) <= tolerance);
    const match = matchIndex >= 0 ? previous.splice(matchIndex, 1)[0] : null;
    const streamAppearance = exchangeLevelAppearance(
      coin, side, level.price, options.minNotionalUsd, options.bucketPct,
    );
    // Do not backdate an already-existing level using the timestamp of a
    // fresh REST snapshot: only live exchange depth transitions count.
    const exchangeAppearedAt = streamAppearance && streamAppearance >= (match?.firstSeenAt || 0)
      ? streamAppearance
      : match?.exchangeAppearedAt;
    const observation: WallObservation = {
      price: level.price,
      firstSeenAt: match?.firstSeenAt ?? seenAt,
      lastSeenAt: seenAt,
      observations: (match?.observations ?? 0) + 1,
      exchangeAppearedAt,
    };
    next.push(observation);
    level.firstSeenAt = observation.firstSeenAt;
    level.lastSeenAt = observation.lastSeenAt;
    level.observations = observation.observations;
    level.exchangeAppearedAt = observation.exchangeAppearedAt;
  }
  if (next.length) wallHistory.set(key, { seenAt, levels: next });
  else wallHistory.delete(key);
  if (wallHistory.size > 15_000) {
    for (const [oldKey, value] of wallHistory) {
      if (seenAt - value.seenAt > MAX_WALL_GAP_MS) wallHistory.delete(oldKey);
    }
  }
}

async function scanCoin(coin: DensityCandidate, options: DensityScanOptions): Promise<DensityCoin | null> {
  // 500 is supported by Binance Futures (200 is not), and yields deeper walls.
  // Bybit is limited to 200 here to keep snapshots inexpensive.
  const depth = coin.exchange === 'binance' && coin.marketType === 'futures' ? 500 : 200;
  await waitForSnapshotSlot();
  const book = await fetchOrderBook(coin.exchange, coin.marketType, coin.symbol, depth);
  if (!book.asks.length || !book.bids.length) {
    throw new Error(book.error || 'Порожній стакан');
  }
  const bestBid = Math.max(...book.bids.map(row => row[0]).filter(Number.isFinite));
  const bestAsk = Math.min(...book.asks.map(row => row[0]).filter(Number.isFinite));
  if (!(bestBid > 0 && bestAsk > 0 && bestAsk >= bestBid)) return null;
  const mid = (bestBid + bestAsk) / 2;
  const bids = groupSide(book.bids, 'bid', mid, options);
  const asks = groupSide(book.asks, 'ask', mid, options);
  const observedAt = Date.now();
  updateWallLifetime(coin, options, 'bid', bids, mid, observedAt);
  updateWallLifetime(coin, options, 'ask', asks, mid, observedAt);
  const walls = [...(options.side !== 'ask' ? bids.filter(level => level.isWall) : []),
    ...(options.side !== 'bid' ? asks.filter(level => level.isWall) : [])]
    .sort((a, b) => b.notionalUsd - a.notionalUsd).slice(0, 5);

  return {
    symbol: coin.symbol,
    baseAsset: coin.baseAsset,
    exchange: coin.exchange,
    marketType: coin.marketType,
    exchangeUrl: coin.exchangeUrl,
    category: isTokenizedStock(coin.baseAsset) ? 'stocks' : 'crypto',
    currentPrice: mid,
    change24h: coin.change24h,
    volume24hUsd: coin.volumeUsd,
    spreadPct: (bestAsk - bestBid) / mid * 100,
    timestamp: book.timestamp || Date.now(),
    walls,
    bids: previewRows(bids),
    asks: previewRows(asks),
  };
}

const scanCache = new Map<string, { timestamp: number; promise: Promise<Awaited<ReturnType<typeof scanDensitiesInternal>>> }>();
const CACHE_MS = 12_000;

// USDC pairs are loaded only for density searches so the main screener's
// existing USDT-only universe and its user filters stay unchanged.
const additionalMarkets = new Map<string, { at: number; promise: Promise<DensityCandidate[]> }>();
async function fetchUsdcPairs(exchange: ExchangeId, marketType: MarketType): Promise<DensityCandidate[]> {
  const key = exchange + ':' + marketType;
  const cached = additionalMarkets.get(key);
  if (cached && Date.now() - cached.at < 60_000) return cached.promise;
  const promise = requestMarketTickers(exchange, marketType, {
    timeoutMs: 4500, attempts: 1,
  }, ['USDC']).then(rows => rows.map(ticker => ({
    symbol: ticker.symbol,
    baseAsset: ticker.baseAsset,
    quoteAsset: ticker.quoteAsset,
    exchange: ticker.exchange,
    marketType: ticker.marketType,
    volumeUsd: ticker.volumeUsd,
    change24h: ticker.change24h,
    exchangeUrl: ticker.exchange === 'binance'
      ? ticker.marketType === 'futures'
        ? 'https://www.binance.com/en/futures/' + ticker.symbol
        : 'https://www.binance.com/en/trade/' + ticker.baseAsset + '_' + ticker.quoteAsset
      : ticker.marketType === 'futures'
        ? 'https://www.bybit.com/trade/usdt/' + ticker.symbol
        : 'https://www.bybit.com/en/trade/spot/' + ticker.baseAsset + '/' + ticker.quoteAsset,
  }))).catch(() => [] as DensityCandidate[]);
  additionalMarkets.set(key, { at: Date.now(), promise });
  return promise;
}

const candidateCache = new Map<string, { at: number; promise: Promise<DensityCandidate[]> }>();
// A full 3000-pair scan can take over 20 minutes. Keep its ordered
// catalog stable until the client finishes paginating all pairs.
const CANDIDATE_CACHE_MS = 60 * 60_000;

async function getDensityCandidates(options: DensityScanOptions): Promise<DensityCandidate[]> {
  const key = JSON.stringify([options.exchange, options.marketType, options.category,
    options.quoteAsset, options.minVolumeUsd, options.search, options.symbols]);
  const cached = candidateCache.get(key);
  if (cached && Date.now() - cached.at < CANDIDATE_CACHE_MS) return cached.promise;
  // Keep catalog snapshots stable across paginated requests and bound memory.
  for (const [oldKey, entry] of candidateCache) {
    if (Date.now() - entry.at > CANDIDATE_CACHE_MS) candidateCache.delete(oldKey);
  }
  if (candidateCache.size > 24) candidateCache.delete(candidateCache.keys().next().value!);

  const promise = (async () => {
    const coins: DensityCandidate[] = options.quoteAsset === 'USDC' ? [] : await fetchMarketCoins({
      exchange: options.exchange,
      marketType: options.marketType,
      minVolumeUsd: 0,
      maxVolumeUsd: 100_000_000_000_000,
    });

    const venues: ExchangeId[] = options.exchange === 'all' ? ['binance', 'bybit'] : [options.exchange];
    const markets: MarketType[] = options.marketType === 'all' ? ['futures', 'spot'] : [options.marketType];
    const usdc = options.quoteAsset === 'USDT' ? [] : await Promise.all(venues.flatMap(venue =>
      markets.map(market => fetchUsdcPairs(venue, market))));
    const selectedSymbols = new Set(options.symbols);
    const seen = new Set<string>();
    return [...coins, ...usdc.flat()].filter(coin => {
      if (coin.quoteAsset !== 'USDT' && coin.quoteAsset !== 'USDC') return false;
      if (options.quoteAsset !== 'all' && coin.quoteAsset !== options.quoteAsset) return false;
      if (coin.volumeUsd < (options.category === 'custom' ? 0 : options.minVolumeUsd)) return false;
      if (options.category === 'custom' && !selectedSymbols.has(coin.symbol.toUpperCase())) return false;
      if (options.category === 'stocks' && !isTokenizedStock(coin.baseAsset)) return false;
      if (options.category === 'crypto' && isTokenizedStock(coin.baseAsset)) return false;
      if (options.search && !coin.symbol.toUpperCase().includes(options.search)) return false;
      const id = coin.exchange + ':' + coin.marketType + ':' + coin.symbol;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }).sort((a, b) =>
      b.volumeUsd - a.volumeUsd ||
      a.symbol.localeCompare(b.symbol) ||
      a.exchange.localeCompare(b.exchange) ||
      a.marketType.localeCompare(b.marketType));
  })();
  candidateCache.set(key, { at: Date.now(), promise });
  try { return await promise; } catch (error) {
    candidateCache.delete(key);
    throw error;
  }
}

async function scanDensitiesInternal(options: DensityScanOptions) {
  const candidateCoins = await getDensityCandidates(options);
  const selected = candidateCoins.slice(options.offset, options.offset + options.limit);
  const nextOffset = options.offset + selected.length;

  let nextIndex = 0;
  let successful = 0;
  let failed = 0;
  const failures: string[] = [];
  const results: DensityCoin[] = [];
  await Promise.all(Array.from({ length: Math.min(4, selected.length) }, async () => {
    while (nextIndex < selected.length) {
      const coin = selected[nextIndex++];
      try {
        const result = await scanCoin(coin, options);
        if (result) {
          successful++;
          if (result.walls.length) results.push(result);
        } else failed++;
      } catch (error) {
        failed++;
        if (failures.length < 5) {
          failures.push(`${coin.exchange} ${coin.symbol}: ${error instanceof Error ? error.message : 'невідома помилка'}`);
        }
      }
    }
  }));

  results.sort((a, b) => (b.walls[0]?.notionalUsd || 0) - (a.walls[0]?.notionalUsd || 0));
  return {
    // A failed snapshot is not a failed catalog scan. Continue with the
    // remaining batches so one blocked market cannot stop all 2996 pairs.
    success: true,
    offset: options.offset,
    nextOffset,
    hasMore: nextOffset < candidateCoins.length,
    timestamp: Date.now(),
    totalCandidates: candidateCoins.length,
    byExchange: {
      binance: candidateCoins.filter(coin => coin.exchange === 'binance').length,
      bybit: candidateCoins.filter(coin => coin.exchange === 'bybit').length,
    },
    scanned: selected.length,
    received: successful,
    failed,
    matched: results.length,
    data: results,
    error: selected.length > 0 && successful === 0
      ? `Біржові стакани недоступні. ${failures.slice(0, 2).join('; ') || 'Спробуйте ще раз.'}`
      : undefined,
  };
}

export async function watchDensityWalls(options: DensityScanOptions, ids: string[]) {
  const candidates = await getDensityCandidates(options);
  const matching = new Map(candidates.map(coin => [
    [coin.exchange, coin.marketType, coin.symbol].join(':'), coin,
  ]));
  const selected = ids.slice(0, 8).map(id => matching.get(id)).filter(
    (coin): coin is DensityCandidate => !!coin);
  // Start a bounded real exchange depth stream for the visible markets.
  // An existing level is undatable; only a subsequent new wall transition
  // can receive an exchange-side timestamp.
  watchExchangeOrderbooks(selected);
  const data: DensityCoin[] = [];
  const unavailable: string[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(2, selected.length) }, async () => {
    while (i < selected.length) {
      const coin = selected[i++];
      const id = [coin.exchange, coin.marketType, coin.symbol].join(':');
      try {
        const snapshot = await scanCoin(coin, options);
        if (snapshot) data.push(snapshot);
        else unavailable.push(id);
      } catch {
        unavailable.push(id);
      }
    }
  }));
  return {
    success: true,
    timestamp: Date.now(),
    data,
    unavailable,
    // Requested coins not found in the catalog are unavailable, too.
    requested: ids,
  };
}

export async function scanDensities(options: DensityScanOptions) {
  const key = JSON.stringify(options);
  const now = Date.now();
  const cached = scanCache.get(key);
  if (cached && now - cached.timestamp < CACHE_MS) return cached.promise;
  for (const [oldKey, entry] of scanCache) {
    if (now - entry.timestamp > CACHE_MS) scanCache.delete(oldKey);
  }
  const promise = scanDensitiesInternal(options);
  scanCache.set(key, { timestamp: now, promise });
  try { return await promise; } catch (err) {
    scanCache.delete(key);
    throw err;
  }
}
