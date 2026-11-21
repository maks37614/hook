import type { HookChartPreferences } from '../../types';
import type { BookUpdate } from '../../utils/binanceOrderBook';
import { isFreshDepthTime, ORDER_BOOK_MAX_AGE_MS, parseDepthLevels } from '../../utils/orderBookValidation';
import type { Density } from './engine';
import { assessDensityReaction } from './reactionPotential';
import { orderBookAutoThreshold, createOrderBookLocalShareFloorLookup, filterOrderBookDensities, getOrderBookDensityLevels, normalizeDensityDistance } from './marketAnalytics';

export type DensityAutoStats = {
  baseline: number; bidCut: number; askCut: number;
  buy5m: number; sell5m: number;
};
const EMPTY_AUTO_STATS: DensityAutoStats = { baseline: 0, bidCut: 0, askCut: 0, buy5m: 0, sell5m: 0 };

/** The chart only publishes densities backed by a current, complete exchange book. */
export class HookChartDensityBook {
  private bids = new Map<number, number>();
  private asks = new Map<number, number>();
  // Updated in O(changed levels) for ordinary deltas. A full scan is needed
  // only when the current best price is removed (or on initial snapshot).
  private bestBid = -Infinity;
  private bestAsk = Infinity;
  private tracked = new Map<string, Density>();
  private ready = false;
  private receivedAt = 0;
  private sourceTime = 0;
  private sequence = 0;
  private snapshotLow = 0;
  private snapshotHigh = 0;
  private thresholdAt = 0;
  private thresholdKey = '';
  private autoThreshold = 0;
  // The hold-time refresh needs new scores, not a full re-sort of unchanged
  // exchange depth. Invalidate implicitly on any new sequence or distance.
  private levelView: {
    sequence: number; distance: number;
    levels: ReturnType<typeof getOrderBookDensityLevels>;
    book: { b: { p: number; q: number }[]; a: { p: number; q: number }[] };
    // The local-share lookup only depends on these immutable level rows,
    // not on hold-time, ATR, absorption scores or individual chart renders.
    localShareFloor?: ReturnType<typeof createOrderBookLocalShareFloorLookup>;
  } | null = null;
  // Trade IDs deduplicate REST seed and WebSocket overlap.
  private tradeSeconds = new Map<number, { buy: number; sell: number }>();
  private seenTradeIds = new Map<string, number>();
  private tradePrunedAt = 0;
  private executions = new Map<string, Map<number, number>>();

  private pruneTrades(now: number) {
    if (now - this.tradePrunedAt < 10_000) return;
    const oldest = now - 300_000;
    for (const [id, time] of this.seenTradeIds) if (time < oldest) this.seenTradeIds.delete(id);
    for (const second of this.tradeSeconds.keys()) if (second * 1000 < oldest - 1000) this.tradeSeconds.delete(second);
    this.tradePrunedAt = now;
  }

  recordAggressiveTrade(trade: { t: number; usd: number; side: 'BUY' | 'SELL'; id: string; p?: number }, now = Date.now()) {
    if (!Number.isFinite(trade.t) || !Number.isFinite(trade.usd) || trade.usd <= 0 ||
        trade.t < now - 300_000 || trade.t > now + 5000 || !trade.id) return;
    this.pruneTrades(now);
    if (this.seenTradeIds.has(trade.id)) return;
    this.seenTradeIds.set(trade.id, trade.t);
    const second = Math.floor(trade.t / 1000);
    const bucket = this.tradeSeconds.get(second) || { buy: 0, sell: 0 };
    if (trade.side === 'BUY') bucket.buy += trade.usd;
    else bucket.sell += trade.usd;
    this.tradeSeconds.set(second, bucket);
    // Only trades executed at the exact exchange-reported level count as
    // evidence of absorption. Don't infer fills from aggregate volume nearby.
    if (Number.isFinite(trade.p) && trade.p! > 0 && this.ready) {
      const id = `${trade.side === 'SELL' ? 'BID' : 'ASK'}:${trade.p}`;
      const level = this.tracked.get(id);
      if (level && trade.t >= level.first) {
        const fills = this.executions.get(id) || new Map<number, number>();
        fills.set(second, (fills.get(second) || 0) + trade.usd);
        this.executions.set(id, fills);
        level.lastAbsorptionAt = Math.max(level.lastAbsorptionAt || 0, trade.t);
      }
    }
  }

  private opposingFlow(now: number) {
    this.pruneTrades(now);
    let buy = 0, sell = 0;
    const cutoff = now - 300_000;
    for (const [second, value] of this.tradeSeconds) {
      if ((second + 1) * 1000 <= cutoff) continue;
      buy += value.buy;
      sell += value.sell;
    }
    return { buy, sell };
  }

  /** Trade continuity failed: discard all buy/sell and absorption evidence,
   * but keep the independently verified LIVE order book intact. */
  clearTradeEvidence() {
    this.tradeSeconds.clear();
    this.seenTradeIds.clear();
    this.executions.clear();
    this.tradePrunedAt = 0;
    for (const level of this.tracked.values()) level.lastAbsorptionAt = 0;
  }

  clear() {
    this.bids.clear();
    this.asks.clear();
    this.bestBid = -Infinity;
    this.bestAsk = Infinity;
    this.tracked.clear();
    this.ready = false;
    this.receivedAt = this.sourceTime = this.sequence = this.thresholdAt = this.autoThreshold = 0;
    this.thresholdKey = '';
    this.levelView = null;
    this.snapshotLow = this.snapshotHigh = 0;
    this.tradeSeconds.clear();
    this.executions.clear();
    this.seenTradeIds.clear();
    this.tradePrunedAt = 0;
  }

  apply(update: BookUpdate, now = Date.now()): boolean {
    const bids = parseDepthLevels(update.bids), asks = parseDepthLevels(update.asks);
    if (!bids || !asks || !Number.isSafeInteger(update.sequence) || update.sequence <= 0 ||
        (update.eventTime !== undefined && !isFreshDepthTime(update.eventTime, now))) {
      this.clear();
      return false;
    }
    if (update.isSnapshot) this.clear();
    else if (!this.ready) return false;
    else if (update.sequence <= this.sequence) return true;

    const apply = (rows: [number, number][], target: Map<number, number>, bid: boolean) => {
      let removedBest = false;
      for (const [price, quantity] of rows) {
        if (quantity > 0) {
          target.set(price, quantity);
          if (bid && price > this.bestBid) this.bestBid = price;
          if (!bid && price < this.bestAsk) this.bestAsk = price;
        } else if (target.delete(price)) {
          // Reset age even if the wall returns between two visual frames.
          const id = `${bid ? 'BID' : 'ASK'}:${price}`;
          this.tracked.delete(id);
          this.executions.delete(id);
          if (price === (bid ? this.bestBid : this.bestAsk)) removedBest = true;
        }
      }
      // Only a deletion of the current best price requires scanning the
      // remaining levels. Regular quantity deltas are now constant time.
      if (removedBest) {
        let best = bid ? -Infinity : Infinity;
        for (const price of target.keys()) {
          if (bid ? price > best : price < best) best = price;
        }
        if (bid) this.bestBid = best;
        else this.bestAsk = best;
      }
    };
    apply(bids, this.bids, true);
    apply(asks, this.asks, false);
    if (!this.bids.size || !this.asks.size || this.bestBid >= this.bestAsk) {
      this.clear();
      return false;
    }
    if (update.isSnapshot) {
      this.snapshotLow = Infinity;
      for (const p of this.bids.keys()) this.snapshotLow = Math.min(this.snapshotLow,p);
      this.snapshotHigh = 0;
      for (const p of this.asks.keys()) this.snapshotHigh = Math.max(this.snapshotHigh,p);
    }
    this.sequence = update.sequence;
    this.receivedAt = now;
    this.sourceTime = update.eventTime ?? now;
    this.ready = true;
    return true;
  }

  read(settings: HookChartPreferences, atr: number, now = Date.now()) {
    if (!this.ready || now - this.receivedAt > ORDER_BOOK_MAX_AGE_MS || !isFreshDepthTime(this.sourceTime, now)) {
      this.clear();
      return { densities: [] as Density[], book: { b: [], a: [] }, densityCut: 0, depthReady: false, price: 0, autoStats: EMPTY_AUTO_STATS, snapshotCoverage: null };
    }
    const price = (this.bestBid + this.bestAsk) / 2;
    const distance = normalizeDensityDistance(settings.densityDiffPct);
    if (!this.levelView || this.levelView.sequence !== this.sequence || this.levelView.distance !== distance) {
      const levels = getOrderBookDensityLevels([...this.bids], [...this.asks], price, distance);
      const book = {
        b: levels.filter(row => row.side === 'BID').slice(0, 40).map(({ p, q }) => ({ p, q })),
        a: levels.filter(row => row.side === 'ASK').slice(0, 40).map(({ p, q }) => ({ p, q })),
      };
      this.levelView = { sequence: this.sequence, distance, levels, book };
    }
    const { levels, book } = this.levelView;
    const multiplier = Number.isFinite(settings.densityAutoMultiplier)
      ? Math.max(.1, Math.min(10, settings.densityAutoMultiplier!)) : 1;
    const key = `${distance}:${multiplier}`;
    if (!this.autoThreshold || this.thresholdKey !== key || now - this.thresholdAt >= 5000) {
      const baseline = orderBookAutoThreshold(levels.map(row => row.usd));
      const adjusted = baseline * multiplier;
      this.autoThreshold = Number.isFinite(adjusted) && adjusted > 0 ? Math.max(1, Math.ceil(adjusted)) : 0;
      this.thresholdKey = key;
      this.thresholdAt = now;
    }
    const manual = settings.densityMode === 'manual' && Number.isFinite(settings.densityThreshold) && settings.densityThreshold! > 0;
    const baseCut = manual ? Math.max(1, settings.densityThreshold!) : this.autoThreshold;
    const { buy, sell } = this.opposingFlow(now);
    // BID absorbs aggressive sells; ASK absorbs aggressive buys.
    const bidCut = !baseCut ? 0 : manual ? baseCut : Math.max(baseCut, Math.ceil(sell * .5));
    const askCut = !baseCut ? 0 : manual ? baseCut : Math.max(baseCut, Math.ceil(buy * .5));
    const cut = baseCut ? Math.min(bidCut, askCut) : 0;
    const autoStats: DensityAutoStats = {
      baseline: this.autoThreshold, bidCut, askCut, buy5m: buy, sell5m: sell,
    };
    if (settings.densityAnalysis === false || cut <= 0) { this.tracked.clear(); this.executions.clear(); }
    else {
      const seen = new Set<string>();
      const tolerance = Math.max(price * .00055, (atr || price * .001) * .18);
      // Hold-time refreshes run every second. Reuse the sorted local-share
      // index until a new depth sequence or distance invalidates levelView.
      // Manual thresholds never need this index, so build it lazily.
      const localShareFloor = manual ? null : (
        this.levelView.localShareFloor ??=
          createOrderBookLocalShareFloorLookup(levels)
      );
      for (const row of filterOrderBookDensities(levels, cut)) {
        if (localShareFloor && row.usd < Math.max(
          row.side === 'BID' ? bidCut : askCut,
          localShareFloor(row),
        )) continue;
        const id = `${row.side}:${row.p}`;
        seen.add(id);
        let density = this.tracked.get(id);
        if (!density) {
          density = { id, ...row, peakUsd: row.usd, first: now, last: now, active: true,
            touches: 0, lastTouch: 0, replenishments: 0, updates: 0, score: 0, mmScore: 0 };
          this.tracked.set(id, density);
        }
        if (this.receivedAt > density.last || row.q !== density.q) {
          if (row.usd > density.usd * 1.22) density.replenishments += 1;
          if (row.usd < density.usd * .7 && now - (density.lastAbsorptionAt || 0) > 3000)
            density.unexplainedReductions = (density.unexplainedReductions || 0) + 1;
          density.updates += 1;
        }
        density.q = row.q;
        density.usd = row.usd;
        density.peakUsd = Math.max(density.peakUsd, row.usd);
        density.last = this.receivedAt;
        if (Math.abs(price - density.p) <= tolerance && now - density.lastTouch > 15_000) {
          density.touches += 1;
          density.lastTouch = now;
        }
        const movedAway = row.side === 'BID' ? price > density.p : price < density.p;
        if (density.touches > 0 && movedAway &&
            Math.abs(price - density.p) >= Math.max(tolerance * 3, (atr || price * .001) * .35)) {
          density.reacted = true;
          density.reaction = Math.abs(price - density.p) / density.p * 100;
        }
        const age = Math.max(0, (now - density.first) / 1000);
        const size = Math.min(3, density.usd / Math.max(1, cut));
        const persistence = Math.min(1, Math.log1p(age) / Math.log(121));
        const replenishment = Math.min(1, density.replenishments / 3);
        const proximity = Math.max(0, 1 - Math.abs(density.p - price) / (price * distance / 100));
        density.score = size * .42 + persistence * .23 + replenishment * .2 + proximity * .1 + Math.min(1, density.touches / 4) * .05;
        density.mmScore = Math.max(0, Math.min(100, Math.round(100 * (
          persistence * .28 + replenishment * .28 + Math.min(1, density.touches / 4) * .2 + Math.min(1, size / 2) * .14 + (density.reacted ? .1 : 0)
        ))));
        // Recent trades at this exact price (not trades anywhere in the market).
        const fills = this.executions.get(id);
        let executedUsd90s = 0;
        if (fills) {
          for (const [second, usd] of fills) {
            if ((second + 1) * 1000 <= now - 90_000) fills.delete(second);
            else executedUsd90s += usd;
          }
          if (!fills.size) this.executions.delete(id);
        }
        const assessed = assessDensityReaction({
          usd: row.usd, peakUsd: density.peakUsd, thresholdUsd: row.side === 'BID' ? bidCut : askCut,
          ageSeconds: age, distancePct: Math.abs(price - row.p) / price * 100,
          touches: density.touches, lastTouchAgeSeconds: density.lastTouch ? (now - density.lastTouch) / 1000 : Infinity,
          replenishments: density.replenishments, unexplainedReductions: density.unexplainedReductions || 0,
          executedUsd90s,
        });
        density.executedUsd90s = executedUsd90s;
        density.reactionScore = assessed.score;
        density.reactionTier = assessed.tier;
      }
      // Removed, reduced and out-of-range orders must disappear on this very update.
      for (const id of this.tracked.keys()) if (!seen.has(id)) {
        this.tracked.delete(id);
        this.executions.delete(id);
      }
    }
    const minAge = Math.max(0, settings.densityTimeoutMin || 0) * 60_000;
    const densities = [...this.tracked.values()].filter(row => now - row.first >= minAge)
      .sort((a, b) => b.score - a.score).map(row => ({ ...row }));
    // Initial snapshot bounds relative to current midpoint, not a guarantee of current full depth.
    const snapshotCoverage = this.snapshotLow > 0 && this.snapshotHigh > 0
      ? {bidPct: Math.max(0, Math.floor((price-this.snapshotLow)/price*10000)/100), askPct: Math.max(0, Math.floor((this.snapshotHigh-price)/price*10000)/100)} : null;
    return { densities, book, densityCut: cut, depthReady: true, price, autoStats, snapshotCoverage };
  }
}
