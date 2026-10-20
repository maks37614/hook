import type { Timeframe } from '../types';

export interface DomTrade {
  id: string;
  price: number;
  qty: number;
  volumeUsd: number;
  isBuyerMaker: boolean;
  timestamp: number; // milliseconds
}

export interface DomBookRow {
  price: number;
  qty: number;
  volumeUsd: number;
  isAsk: boolean;
  isDensity: boolean;
}

export interface DomClusterLevel {
  price: number;
  buyVol: number;
  sellVol: number;
  totalVol: number;
  isPOC: boolean;
}

export interface DomClusterColumn {
  candleTime: number;
  label: string;
  totalVolume: number;
  pocPrice: number;
  maxLevelVol: number;
  levels: Record<number, DomClusterLevel>;
}

const INTERVAL_MS: Record<Timeframe, number> = {
  '1m': 60_000, '5m': 300_000, '15m': 900_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
};

export const validTrade = (trade: DomTrade): boolean =>
  typeof trade.id === 'string' && trade.id.length > 0 &&
  Number.isFinite(trade.price) && trade.price > 0 &&
  Number.isFinite(trade.qty) && trade.qty > 0 &&
  Number.isFinite(trade.volumeUsd) && trade.volumeUsd > 0 &&
  Number.isFinite(trade.timestamp) && trade.timestamp > 0;

/** WebSocket and REST must use the same execution identifiers, never combine unrelated symbols. */
export function mergeDomTrades<T extends DomTrade>(previous: T[], incoming: T[], limit: number): T[] {
  const byId = new Map<string, T>();
  for (const trade of previous) if (validTrade(trade)) byId.set(trade.id, trade);
  for (const trade of incoming) if (validTrade(trade)) byId.set(trade.id, trade);
  return Array.from(byId.values())
    .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id))
    .slice(0, limit);
}

/** Fallback only. Exchange tick metadata is preferred over observed price gaps. */
export function inferBookTickSize(bids: [number, number][], asks: [number, number][]): number {
  let minGap = Infinity;
  for (const side of [bids, asks]) {
    const ordered = side.slice(0, 100).map(([price]) => price).filter(p => Number.isFinite(p) && p > 0)
      .sort((a, b) => a - b);
    for (let i = 1; i < ordered.length; i++) {
      const gap = ordered[i] - ordered[i - 1];
      if (gap > 0 && gap < minGap) minGap = gap;
    }
  }
  if (Number.isFinite(minGap)) return Number(minGap.toPrecision(9));
  const nearest = bids[0]?.[0] || asks[0]?.[0] || 1;
  return Math.pow(10, Math.min(0, Math.floor(Math.log10(nearest)) - 3));
}

function precisionFromTick(tick: number): number {
  if (!Number.isFinite(tick) || tick <= 0) return 8;
  return (tick.toFixed(14).replace(/0+$/, '').split('.')[1] || '').length;
}

function roundByTick(value: number, tick: number): number {
  return Number(value.toFixed(precisionFromTick(tick)));
}

export function formatDomPrice(price: number, tickSize: number): string {
  if (!Number.isFinite(price)) return '—';
  const tick = Number.isFinite(tickSize) && tickSize > 0 ? tickSize : 0.00000001;
  const decimals = precisionFromTick(tick);
  return price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Bid buckets use their lower boundary, asks their upper boundary.
 *  The true spread always comes from the raw best levels, NOT these display labels.
 */
export function aggregateDomBook(
  rawBids: [number, number][],
  rawAsks: [number, number][],
  tickSize: number,
  compression: number,
  depthLimit: number,
  densityThresholdUsd: number,
) {
  const tick = Number.isFinite(tickSize) && tickSize > 0 ? tickSize : inferBookTickSize(rawBids, rawAsks);
  const factor = Number.isFinite(compression) && compression >= 1 ? Math.floor(compression) : 1;
  const compressSide = (orders: [number, number][], isAsk: boolean): DomBookRow[] => {
    const buckets = new Map<number, { qty: number; volumeUsd: number }>();
    for (const [price, qty] of orders) {
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(qty) || qty <= 0) continue;
      // Exchange prices should be multiples of tickSize. Round the floating division to the tick grid.
      const priceTicks = Math.round(price / tick);
      const bucket = factor === 1 ? price : Math.floor(priceTicks / factor);
      const existing = buckets.get(bucket) || { qty: 0, volumeUsd: 0 };
      existing.qty += qty;
      existing.volumeUsd += price * qty;
      buckets.set(bucket, existing);
    }
    return Array.from(buckets, ([bucket, values]) => {
      const displayedPrice = factor === 1 ? bucket :
        roundByTick((bucket * factor + (isAsk ? factor - 1 : 0)) * tick, tick);
      return {
        price: displayedPrice, qty: values.qty, volumeUsd: values.volumeUsd, isAsk,
        isDensity: values.volumeUsd >= densityThresholdUsd,
      };
    }).sort((a, b) => b.price - a.price);
  };
  const allAsks = compressSide(rawAsks, true);
  const allBids = compressSide(rawBids, false);
  const maxCount = Number.isFinite(depthLimit) && depthLimit >= 1 ? depthLimit : Infinity;
  const aggregatedAsks = allAsks.slice(-maxCount);
  const aggregatedBids = allBids.slice(0, maxCount);
  const bestAsk = rawAsks.filter(([p, q]) => p > 0 && q > 0).reduce((min, [p]) => Math.min(min, p), Infinity);
  const bestBid = rawBids.filter(([p, q]) => p > 0 && q > 0).reduce((max, [p]) => Math.max(max, p), 0);
  const spreadUsd = Number.isFinite(bestAsk) && bestBid > 0 ? bestAsk - bestBid : 0;
  const maxVolumeUsd = Math.max(1, ...aggregatedAsks.map(r => r.volumeUsd), ...aggregatedBids.map(r => r.volumeUsd));
  return {
    aggregatedAsks, aggregatedBids, bestAsk: Number.isFinite(bestAsk) ? bestAsk : 0, bestBid,
    spreadUsd, spreadPct: bestBid > 0 ? spreadUsd / bestBid * 100 : 0, maxVolumeUsd,
    totalRealOrdersCount: rawBids.length + rawAsks.length, // Number of price levels, NOT individual orders
  };
}

/** Uses observed executions only. Never invents price levels, directional volume or POC.
 *  Historical candles are partial until the entire execution stream has been collected.
 */
export function buildObservedClusters(
  trades: DomTrade[], timeframe: Timeframe, tickSize: number, nowMs: number,
): DomClusterColumn[] {
  const interval = INTERVAL_MS[timeframe];
  const current = Math.floor(nowMs / interval) * interval;
  const start = current - interval * 3;
  const byCandle = new Map<number, DomTrade[]>();
  for (const trade of trades) {
    if (!validTrade(trade) || trade.timestamp < start || trade.timestamp >= current + interval) continue;
    const candleStart = Math.floor(trade.timestamp / interval) * interval;
    const bucket = byCandle.get(candleStart) || [];
    bucket.push(trade);
    byCandle.set(candleStart, bucket);
  }
  const result: DomClusterColumn[] = [];
  for (let j = 0; j < 4; j++) {
    const candleStart = start + j * interval;
    const observed = byCandle.get(candleStart) || [];
    const minPrice = observed.length ? Math.min(...observed.map(t => t.price)) : 0;
    const maxPrice = observed.length ? Math.max(...observed.map(t => t.price)) : 0;
    const tick = tickSize > 0 && Number.isFinite(tickSize) ? tickSize : 0.00000001;
    // At most approximately 16 displayed buckets per candle; no synthetic volume.
    const bucketTicks = Math.max(1, Math.ceil((maxPrice - minPrice) / tick / 15));
    const step = tick * bucketTicks;
    const levels: Record<number, DomClusterLevel> = {};
    for (const trade of observed) {
      const bucket = roundByTick(Math.floor(Math.round(trade.price / tick) / bucketTicks) * step, tick);
      const currentLevel = levels[bucket] || { price: bucket, buyVol: 0, sellVol: 0, totalVol: 0, isPOC: false };
      if (trade.isBuyerMaker) currentLevel.sellVol += trade.volumeUsd;
      else currentLevel.buyVol += trade.volumeUsd;
      currentLevel.totalVol += trade.volumeUsd;
      levels[bucket] = currentLevel;
    }
    let pocPrice = 0;
    let maxLevelVol = 0;
    let totalVolume = 0;
    for (const level of Object.values(levels)) {
      totalVolume += level.totalVol;
      if (level.totalVol > maxLevelVol) {
        maxLevelVol = level.totalVol;
        pocPrice = level.price;
      }
    }
    if (levels[pocPrice]) levels[pocPrice].isPOC = true;
    const d = new Date(candleStart);
    result.push({
      candleTime: candleStart / 1000,
      label: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      totalVolume, pocPrice, maxLevelVol, levels,
    });
  }
  return result;
}
