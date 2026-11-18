import { ExchangeId, MarketType } from '../../src/types';
import { RawDepthDelta } from './exchangeStream';
import { DensityItem, OrderBookLevel, OrderBookState, OrderBookStatus } from './types';
import { ORDER_BOOK_MAX_AGE_MS, isFreshDepthTime, parseDepthLevels, type NormalizedDepthLevels } from '../../src/utils/orderBookValidation';
import { depthOutlierProfile, densityOutlierThresholds, type DepthOutlierProfile } from './depthOutlierProfile';
import { sharedPublicDepthMedian } from './sharedDepthMedian';
import { selectStandoutLevels } from './standoutDensitySelection';
import type { SharedPublicOrderBook } from './sharedExchangeStream';

export interface DensityConfig {
  mode: 'AUTO' | 'MANUAL' | 'HYBRID';
  manualThresholdUsd: number;
  minPersistenceSeconds: number;
  minDistancePct: number;
}

interface DensityStats {
  firstSeenAt: number;
  lastSeenAt: number;
  samples: number;
  presentSamples: number;
  sizeSumUsd: number;
  maxSizeUsd: number;
  lastSizeUsd: number;
  lastSizeChangeAt: number;
  cancellations: number;
  replenishments: number;
  nearestApproachPct: number;
}

export class OrderBookEngine {
  // In production these may point to one shared public market book. All
  // private density history, thresholds and alert state remain per owner.
  private bids: ReadonlyMap<number, number> = new Map();
  private asks: ReadonlyMap<number, number> = new Map();
  private sharedBookActive = false;
  private sharedBookRevision: number | null = null;
  private privateBookCopies = 0;
  private activeDensities = new Map<string, DensityItem>();
  private densityHistory: DensityItem[] = [];
  private densityStats = new Map<string, DensityStats>();

  public bestBid = 0;
  public bestAsk = 0;
  public spread = 0;
  public spreadPct = 0;
  public lastUpdateId = 0;
  public lastReceivedAt = 0;
  public lastExchangeTimestamp = 0;
  public dataValid = false;
  public sequenceGap = false;
  public status: OrderBookStatus = 'CONNECTING';
  private volume24hUsd = 0;
  private bookRevision = 0;
  private thresholdMemo: {revision: number; volume: number; mode: string;
    manual: number; value: {common:number;bid:number;ask:number}} | null = null;
  private medianComputations = 0;
  private privateProfileMemo: {revision:number;profile:DepthOutlierProfile|null} | null = null;
  // OrderBookState and imbalance callers may both request the same top
  // levels many times between depth packets. Cache *price ordering only*;
  // return new level objects so consumers cannot mutate another read.
  private sortedPricesMemo: {
    revision: number; bids?: number[]; asks?: number[];
  } | null = null;
  private sortedPriceComputations = 0;
  private bestPriceFullScans = 0;
  // Empty depth heartbeats advance freshness but do not change book levels.
  // Keep time-driven persistence classification accurate at 1-second cadence
  // without re-scanning all bids/asks for every no-op packet.
  private lastDensityEvaluationAt = 0;
  private densityInputsDirty = false;
  private densityEvaluations = 0;
  // The web UI may show a wall immediately, but AUTO/HYBRID events only
  // confirm it after a meaningful observed lifetime and size stability.
  private static readonly MIN_AUTO_AGE_SECONDS = 15;
  private static readonly MIN_AUTO_SIZE_STABLE_MS = 8_000;
  // Diagnostics only: a shared public packet should not need reparsing once
  // for every personalized 24/7 worker. Offline/direct callers still parse.
  private depthParseFallbacks = 0;
  // Farthest validated levels in the subscribed depth (not a guarantee that
  // the exchange exposes the entire market book at any requested distance).
  private bidCoveragePct = 0;
  private askCoveragePct = 0;

  constructor(
    public readonly symbol: string,
    public readonly exchange: ExchangeId,
    public readonly marketType: MarketType,
    private config: DensityConfig = {
      mode: 'AUTO', manualThresholdUsd: 1000000, minPersistenceSeconds: 15, minDistancePct: 0.1,
    }
  ) {}

  public updateConfig(newConfig: Partial<DensityConfig>) {
    const previous = JSON.stringify(this.config);
    this.config = { ...this.config, ...newConfig };
    if (!(this.config.manualThresholdUsd > 0) || !Number.isFinite(this.config.manualThresholdUsd)) this.config.manualThresholdUsd = 1000000;
    if (previous !== JSON.stringify(this.config)) {
      this.thresholdMemo = null;
      this.densityInputsDirty = true;
      if (this.dataValid && Date.now() - this.lastReceivedAt <= 5000) this.evaluateDensities();
    }
  }
  public setVolume24hUsd(volume: number) {
    const next = Number.isFinite(volume) && volume > 0 ? volume : 0;
    if (this.volume24hUsd !== next) {
      this.volume24hUsd = next;
      this.thresholdMemo = null;
      this.densityInputsDirty = true;
    }
  }
  public setStatus(newStatus: OrderBookStatus) {
    this.status = newStatus;
    if (newStatus !== 'LIVE') {
      this.dataValid = false;
      this.sharedBookRevision = null;
      // A reconnect/STALE status invalidates incremental continuity. Another
      // delta alone must never make the old book LIVE without a fresh snapshot.
      this.sequenceGap = true;
      this.activeDensities.clear();
      this.densityStats.clear();
      this.newlyAppearedDensities = [];
    }
  }

  public applyDepth(delta: RawDepthDelta, validated?: NormalizedDepthLevels | null,
    publicBook?: SharedPublicOrderBook | null) {
    const now = Date.now();
    // The shared exchange stream has already validated these public tuples.
    // Otherwise (manual, isolated or late-replay callers), parse and fail
    // closed exactly as before. Price/sequence/timestamp checks below always
    // run independently for each owner's book.
    if (!validated) this.depthParseFallbacks++;
    const bids = validated?.bids ?? parseDepthLevels(delta.bids);
    const asks = validated?.asks ?? parseDepthLevels(delta.asks);
    if (!Number.isSafeInteger(delta.sequence) || delta.sequence! <= 0 ||
        !bids || !asks ||
        (delta.eventTime !== undefined && !isFreshDepthTime(delta.eventTime, now))) {
      this.sequenceGap = true;
      this.setStatus(delta.eventTime !== undefined && !isFreshDepthTime(delta.eventTime, now) ? 'STALE' : 'RESYNCING');
      return;
    }
    // Even a fresh incremental update cannot repair a book whose previous
    // observation expired during a socket/REST pause. Require a new snapshot,
    // including when getState() was never called during the outage.
    const previousBookExpired = this.lastReceivedAt > 0 &&
      (now - this.lastReceivedAt > ORDER_BOOK_MAX_AGE_MS || !isFreshDepthTime(this.lastReceivedAt, now) ||
       (this.lastExchangeTimestamp > 0 && !isFreshDepthTime(this.lastExchangeTimestamp, now)));
    if (previousBookExpired) {
      this.setStatus('STALE');
      if (!delta.isSnapshot) return;
    }
    const seq = delta.sequence!;
    // Old/duplicate deltas are harmless; never invalidate a good book for them.
    if (!delta.isSnapshot && this.lastUpdateId > 0 && seq <= this.lastUpdateId) return;
    if (!delta.isSnapshot && (this.lastUpdateId === 0 || this.sequenceGap || !this.dataValid)) {
      this.status = 'SYNCING';
      return;
    }
    const previousSharedRevision = this.sharedBookRevision;
    if (publicBook && validated) {
      // One immutable-by-convention canonical *public* book for all owners.
      // No personal calculator ever writes to these maps.
      this.bids = publicBook.bids;
      this.asks = publicBook.asks;
      this.sharedBookActive = true;
      this.sharedBookRevision = publicBook.revision;
    } else {
      if (this.sharedBookActive) {
        // Offline/fallback packets must never mutate the canonical book.
        this.bids = new Map(this.bids);
        this.asks = new Map(this.asks);
        this.privateBookCopies++;
      }
      this.sharedBookActive = false;
      this.sharedBookRevision = null;
    }

    // Upstream may repeat the same quantities as a delta without using an
    // empty packet. Avoid a full per-owner median/density pass in that case.
    // The public market revision also catches changes already applied to the
    // shared maps *before* personal EventEmitter callbacks execute.
    const unchangedBook = !delta.isSnapshot && (
      this.sharedBookActive
        ? previousSharedRevision === this.sharedBookRevision
        : bids.every(([p, q]) => (this.bids.get(p) ?? 0) === q) &&
          asks.every(([p, q]) => (this.asks.get(p) ?? 0) === q)
    );
    if (unchangedBook) {
      // Valid heartbeats still advance freshness/sequence. Re-evaluate age
      // every second or immediately when user configuration/volume changes.
      this.lastReceivedAt = now;
      this.lastExchangeTimestamp = delta.eventTime || 0;
      this.lastUpdateId = seq;
      this.sequenceGap = false;
      if (this.densityInputsDirty || !this.lastDensityEvaluationAt ||
          now < this.lastDensityEvaluationAt || now - this.lastDensityEvaluationAt >= 1000) {
        this.evaluateDensities();
      }
      return;
    }
    this.lastReceivedAt = now;
    this.bookRevision++;
    this.thresholdMemo = null;
    this.sortedPricesMemo = null;
    this.lastExchangeTimestamp = delta.eventTime || 0;
    this.sequenceGap = false;
    this.lastUpdateId = seq;
    if (delta.isSnapshot) {
      if (!this.sharedBookActive) {
        this.bids = new Map();
        this.asks = new Map();
      }
      this.activeDensities.clear();
      this.densityStats.clear();
      this.newlyAppearedDensities = [];
      this.dataValid = true;
      this.status = 'SYNCING';
    }

    // Most incremental depth packets do not remove the current best price.
    // Track top-of-book directly from changed levels; only search the whole
    // side when that exact best price is deleted. A snapshot starts afresh.
    let bestBid = delta.isSnapshot ? 0 : this.bestBid;
    let bestAsk = delta.isSnapshot ? Infinity : (this.bestAsk || Infinity);
    let bidDeletedAtBest = false;
    let askDeletedAtBest = false;
    for (const [price, qty] of bids) {
      if (!Number.isFinite(price) || price <= 0 ||
          !Number.isFinite(qty) || qty < 0) continue;
      if (qty === 0) {
        if (!this.sharedBookActive) (this.bids as Map<number, number>).delete(price);
        if (price === bestBid) bidDeletedAtBest = true;
      } else {
        if (!this.sharedBookActive) (this.bids as Map<number, number>).set(price, qty);
        if (price > bestBid) bestBid = price;
      }
    }
    for (const [price, qty] of asks) {
      if (!Number.isFinite(price) || price <= 0 ||
          !Number.isFinite(qty) || qty < 0) continue;
      if (qty === 0) {
        if (!this.sharedBookActive) (this.asks as Map<number, number>).delete(price);
        if (price === bestAsk) askDeletedAtBest = true;
      } else {
        if (!this.sharedBookActive) (this.asks as Map<number, number>).set(price, qty);
        if (price < bestAsk) bestAsk = price;
      }
    }
    if (bidDeletedAtBest) {
      bestBid = 0;
      for (const price of this.bids.keys()) if (price > bestBid) bestBid = price;
      this.bestPriceFullScans++;
    }
    if (askDeletedAtBest) {
      bestAsk = Infinity;
      for (const price of this.asks.keys()) if (price < bestAsk) bestAsk = price;
      this.bestPriceFullScans++;
    }
    this.bestBid = bestBid;
    this.bestAsk = bestAsk === Infinity ? 0 : bestAsk;
    if (this.bestBid > 0 && this.bestAsk > this.bestBid) {
      this.spread = this.bestAsk - this.bestBid;
      this.spreadPct = (this.spread / this.bestBid) * 100;
      this.status = 'LIVE';
      this.dataValid = true;
    } else {
      this.sequenceGap = true;
      this.setStatus('RESYNCING');
    }
    if (this.dataValid) this.evaluateDensities();
    // An initial or resync snapshot describes already-existing liquidity.
    // It is not proof that an order has *just appeared* in the market.
    if (delta.isSnapshot) this.newlyAppearedDensities = [];
  }

  private getSortedPrices(side: 'bids' | 'asks'): number[] {
    let memo = this.sortedPricesMemo;
    if (!memo || memo.revision !== this.bookRevision) {
      memo = { revision: this.bookRevision };
      this.sortedPricesMemo = memo;
    }
    if (!memo[side]) {
      memo[side] = Array.from((side === 'bids' ? this.bids : this.asks).keys())
        .sort(side === 'bids' ? (a,b)=>b-a : (a,b)=>a-b);
      this.sortedPriceComputations++;
    }
    return memo[side]!;
  }

  public getSortedBids(limit = 30): OrderBookLevel[] {
    return this.getSortedPrices('bids').slice(0,limit).map(price=>{
      const quantity = this.bids.get(price) || 0;
      return {price,quantity,notionalUsd:price*quantity};
    });
  }
  public getSortedAsks(limit = 30): OrderBookLevel[] {
    return this.getSortedPrices('asks').slice(0,limit).map(price=>{
      const quantity = this.asks.get(price) || 0;
      return {price,quantity,notionalUsd:price*quantity};
    });
  }

  public getState(): OrderBookState {
    if (this.lastReceivedAt > 0 && !this.hasFreshData()) this.setStatus('STALE');
    const live = this.dataValid && this.status === 'LIVE';
    return {
      symbol:this.symbol, exchange:this.exchange, marketType:this.marketType,
      bids:live ? this.getSortedBids(20) : [], asks:live ? this.getSortedAsks(20) : [], bestBid:live ? this.bestBid : 0, bestAsk:live ? this.bestAsk : 0,
      spread:live ? this.spread : 0, spreadPct:live ? Number(this.spreadPct.toFixed(4)) : 0, lastUpdateId:this.lastUpdateId,
      sequence:this.lastUpdateId, timestamp:this.lastExchangeTimestamp || this.lastReceivedAt, status:this.status, lastReceivedAt:this.lastReceivedAt,
      dataValid: this.dataValid, sequenceGap: this.sequenceGap,
      bidDepth: this.bids.size, askDepth: this.asks.size,
      bidCoveragePct: live ? this.bidCoveragePct : 0,
      askCoveragePct: live ? this.askCoveragePct : 0,
    };
  }

  /** AUTO uses both market turnover and the upper-tail DOM level distribution.
   * Each price level is compared against BID/ASK's separate distribution.
   * MANUAL remains an exact fixed minimum; HYBRID keeps the stricter rule.
   */
  public calculateDensityThresholds(volume24hUsd = this.volume24hUsd): {
    common: number; bid: number; ask: number;
  } {
    if (this.config.mode === 'MANUAL') {
      const amount = this.config.manualThresholdUsd;
      return { common: amount, bid: amount, ask: amount };
    }
    const memo = this.thresholdMemo;
    if (memo && memo.revision === this.bookRevision &&
        memo.volume === volume24hUsd && memo.mode === this.config.mode &&
        memo.manual === this.config.manualThresholdUsd) return memo.value;

    // Compute the public order-book profile once for all owners of an exact
    // exchange:market:symbol WebSocket revision, not once per user.
    let profile: DepthOutlierProfile | null;
    if (this.sharedBookActive && this.sharedBookRevision !== null) {
      profile = sharedPublicDepthMedian.getProfile(this.bids, this.asks, this.sharedBookRevision);
    } else if (this.privateProfileMemo?.revision === this.bookRevision) {
      profile = this.privateProfileMemo.profile;
    } else {
      profile = depthOutlierProfile(this.bids, this.asks);
      this.privateProfileMemo = { revision: this.bookRevision, profile };
      if (profile) this.medianComputations++; // Empty/unsynchronized books have no distribution to compute.
    }
    const value = densityOutlierThresholds(profile, volume24hUsd,
      this.config.manualThresholdUsd, this.config.mode);
    this.thresholdMemo = { revision: this.bookRevision, volume: volume24hUsd,
      mode: this.config.mode, manual: this.config.manualThresholdUsd, value };
    return value;
  }

  public calculateAdaptiveThreshold(volume24hUsd = this.volume24hUsd): number {
    return this.calculateDensityThresholds(volume24hUsd).common;
  }

  public thresholdStats() {
    return { medianComputations: this.medianComputations, bookRevision: this.bookRevision,
      sortedPriceComputations: this.sortedPriceComputations,
      bestPriceFullScans: this.bestPriceFullScans,
      densityEvaluations: this.densityEvaluations,
      depthParseFallbacks: this.depthParseFallbacks,
      sharedBookActive: this.sharedBookActive,
      privateBookCopies: this.privateBookCopies };
  }

  private newlyAppearedDensities: DensityItem[] = [];

  private isDensityConfirmed(item: DensityItem, now: number): boolean {
    const observedSeconds = (now - item.firstSeenAt) / 1000;
    if (this.config.mode === 'MANUAL') {
      // Preserve original manual persistence classification exactly.
      return observedSeconds >= this.config.minPersistenceSeconds && item.persistenceRatio >= 0.65;
    }
    return observedSeconds >= Math.max(OrderBookEngine.MIN_AUTO_AGE_SECONDS, this.config.minPersistenceSeconds) &&
      (item.persistenceSamples || 0) >= 3 &&
      item.persistenceRatio >= 0.65 &&
      now - (item.lastSizeChangeAt || item.firstSeenAt) >= OrderBookEngine.MIN_AUTO_SIZE_STABLE_MS;
  }

  public pollNewlyAppearedDensities(): DensityItem[] {
    const visible = new Map(this.getDensities().map((d) => [d.id, d]));
    const emitted: DensityItem[] = [];
    const pending: DensityItem[] = [];
    const seen = new Set<string>();
    const now = Date.now();
    const thresholds = this.calculateDensityThresholds();
    for (const candidate of this.newlyAppearedDensities) {
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      const item = visible.get(candidate.id);
      if (!item) {
        // A qualified wall hidden by the AUTO top-rank / nearby-level filter
        // may later become the strongest. Keep it pending briefly rather
        // than permanently losing a signal on a legitimately new level.
        // Never claim a level observed long ago has *just* appeared.
        const waiting = this.activeDensities.get(candidate.id);
        if (this.config.mode !== 'MANUAL' && waiting &&
            now - waiting.firstSeenAt <= 60_000 &&
            (waiting.side === 'BID' ? this.bids : this.asks).get(waiting.price) === waiting.quantity &&
            waiting.notionalUsd >= (waiting.side === 'BID' ? thresholds.bid : thresholds.ask)) {
          pending.push(waiting);
        }
        continue;
      }
      if (this.config.mode === 'MANUAL' || this.isDensityConfirmed(item, now)) {
        emitted.push(item);
      } else {
        pending.push(item); // Wait for two fresh book observations for AUTO.
      }
    }
    this.newlyAppearedDensities = pending;
    return emitted;
  }

  private evaluateDensities() {
    const now = Date.now();
    this.lastDensityEvaluationAt = now;
    this.densityInputsDirty = false;
    this.densityEvaluations++;
    const mid = (this.bestBid + this.bestAsk) / 2 || this.bestBid || this.bestAsk || 1;
    const thresholds = this.calculateDensityThresholds();
    const seen = new Set<string>();

    // Track the book edges during the existing density pass instead of
    // allocating spread arguments for two additional full-book scans.
    let minBidInBook = Infinity;
    let maxAskInBook = 0;
    const scan = (book: ReadonlyMap<number, number>, side: 'BID'|'ASK') => {
      for (const [price, qty] of book.entries()) {
        if (side === 'BID') minBidInBook = Math.min(minBidInBook, price);
        else maxAskInBook = Math.max(maxAskInBook, price);
        const notional = price * qty;
        if (notional < (side === 'BID' ? thresholds.bid : thresholds.ask)) continue;
        const id = `${side.toLowerCase()}_${price}`;
        seen.add(id);
        const dist = Math.abs((price-mid)/mid)*100;
        this.updateOrAddDensity(id, side, price, qty, notional, dist, now);
      }
    };
    scan(this.bids,'BID'); scan(this.asks,'ASK');
    this.bidCoveragePct = this.bestBid > 0 && Number.isFinite(minBidInBook)
      ? Math.max(0, Number(((this.bestBid - minBidInBook) / this.bestBid * 100).toFixed(3))) : 0;
    this.askCoveragePct = this.bestAsk > 0 && maxAskInBook > 0
      ? Math.max(0, Number(((maxAskInBook - this.bestAsk) / this.bestAsk * 100).toFixed(3))) : 0;
    if (!this.bids.size) minBidInBook = 0;
    if (!this.asks.size) maxAskInBook = Infinity;

    for (const [id, item] of this.activeDensities.entries()) {
      if (seen.has(id)) continue;

      // #10 & #12: Check if order simply stepped out of visible top-20 window
      const isOutsideVisibleWindow = (item.side === 'BID' && item.price < minBidInBook) ||
                                     (item.side === 'ASK' && item.price > maxAskInBook);

      if (isOutsideVisibleWindow) {
        // Missing outside the snapshot is unknown, not a cancellation or continuous persistence.
        this.activeDensities.delete(id);
        this.densityStats.delete(id);
        continue;
      }

      const stats = this.densityStats.get(id);
      if (stats) stats.cancellations += 1;
      const age = Math.max(0.1, (now-item.firstSeenAt)/1000);
      const disappearedNearPrice = item.distancePct <= 0.25;
      const cancellationRate = stats ? stats.cancellations / Math.max(1, stats.samples) : 1;
      item.cancellationRate = Number(cancellationRate.toFixed(3));
      if (disappearedNearPrice && age < 60 && cancellationRate > 0.15) item.classification='POSSIBLE_SPOOF';
      else if (age < this.config.minPersistenceSeconds) item.classification='TRANSIENT_LIQUIDITY';
      item.qualityScore = this.calculateQuality(item, stats);
      this.densityHistory.unshift(item);
      if (this.densityHistory.length > 100) this.densityHistory.pop();
      this.activeDensities.delete(id);
      this.densityStats.delete(id);
    }
  }

  private updateOrAddDensity(id:string, side:'BID'|'ASK', price:number, qty:number, notional:number, distPct:number, now:number) {
    let stats = this.densityStats.get(id);
    const isBrandNew = !stats;
    if (!stats) {
      stats = { firstSeenAt:now,lastSeenAt:now,samples:0,presentSamples:0,sizeSumUsd:0,maxSizeUsd:notional,lastSizeUsd:notional,lastSizeChangeAt:now,cancellations:0,replenishments:0,nearestApproachPct:distPct };
      this.densityStats.set(id,stats);
    }
    stats.samples += 1; stats.presentSamples += 1; stats.lastSeenAt=now; stats.sizeSumUsd += notional;
    stats.maxSizeUsd=Math.max(stats.maxSizeUsd,notional); stats.nearestApproachPct=Math.min(stats.nearestApproachPct,distPct);
    if (notional > stats.lastSizeUsd * 1.05 && stats.lastSizeUsd > 0) stats.replenishments += 1;
    if (Math.abs(notional-stats.lastSizeUsd)/Math.max(stats.lastSizeUsd,1) > 0.1) stats.lastSizeChangeAt=now;
    stats.lastSizeUsd=notional;

    const existing=this.activeDensities.get(id);
    if(existing){
      existing.quantity=qty; existing.notionalUsd=notional; existing.distancePct=Number(distPct.toFixed(3)); existing.lastSeenAt=now;
      existing.ageSeconds=Math.floor((now-existing.firstSeenAt)/1000); existing.maxSizeUsd=Math.max(existing.maxSizeUsd,notional);
      existing.averageSizeUsd=stats.sizeSumUsd/Math.max(1,stats.presentSamples); existing.persistenceRatio=stats.presentSamples/Math.max(1,stats.samples);
      existing.persistenceSamples=stats.presentSamples; existing.cancellationRate=stats.cancellations/Math.max(1,stats.samples);
      existing.replenishmentRate=stats.replenishments/Math.max(1,stats.samples); existing.lastSizeChangeAt=stats.lastSizeChangeAt;
      existing.confirmed = this.isDensityConfirmed(existing, now);
      // Do not leave a previously persistent label on a wall that has just
      // lost a significant chunk of its size.
      existing.classification = existing.confirmed ? 'PERSISTENT_LIQUIDITY' : 'TRANSIENT_LIQUIDITY';
      existing.qualityScore=this.calculateQuality(existing,stats);
    } else {
      const item:DensityItem={id,price,side,quantity:qty,notionalUsd:notional,distancePct:Number(distPct.toFixed(3)),firstSeenAt:now,lastSeenAt:now,ageSeconds:0,maxSizeUsd:notional,averageSizeUsd:notional,persistenceRatio:1,classification:'TRANSIENT_LIQUIDITY',confirmed:false,persistenceSamples:1,cancellationRate:0,replenishmentRate:0,qualityScore:20,lastSizeChangeAt:now};
      this.activeDensities.set(id,item);
      if (isBrandNew) {
        this.newlyAppearedDensities.push(item);
      }
    }
  }

  private calculateQuality(item:DensityItem, stats?:DensityStats):number {
    if (!stats) return item.qualityScore || 0;
    const persistence = Math.min(25, (item.persistenceRatio || 0) * 25);
    const duration = Math.min(20, (item.ageSeconds / Math.max(1,this.config.minPersistenceSeconds)) * 20);
    const sizeStability = Math.min(15, item.averageSizeUsd > 0 ? Math.min(1.5,item.notionalUsd/item.averageSizeUsd) * 10 : 0);
    const maxDistance = Math.max(this.config.minDistancePct, 0.6);
    const proximity = item.distancePct <= this.config.minDistancePct ? 15 : Math.max(0, 15 * (1 - Math.min(1, item.distancePct / maxDistance)));
    const replenishment = Math.min(15, (item.replenishmentRate || 0) * 60);
    const spoofPenalty = item.classification === 'POSSIBLE_SPOOF' ? 40 : Math.min(20,(item.cancellationRate||0)*50);
    return Math.max(0,Math.min(100,Math.round(persistence+duration+sizeStability+proximity+replenishment-spoofPenalty)));
  }

  public getOrderBookImbalance(levels=20):number {
    if (!this.dataValid || !this.hasFreshData()) return 0;
    const bids=this.getSortedBids(levels).reduce((s,l)=>s+l.notionalUsd,0);
    const asks=this.getSortedAsks(levels).reduce((s,l)=>s+l.notionalUsd,0);
    if(bids+asks===0)return 0;
    return (bids-asks)/(bids+asks);
  }

  public getDensityQualityAtPrice(side:'BID'|'ASK', price:number, maxDistancePct=0.6):DensityItem|undefined {
    return this.getDensities().filter(d=>d.side===side && d.classification!=='POSSIBLE_SPOOF' && Math.abs(d.price-price)/Math.max(price,1e-12)*100<=maxDistancePct).sort((a,b)=>(b.qualityScore||0)-(a.qualityScore||0))[0];
  }

  /** A synchronized, recently observed public DOM is sufficient for
   * liquidity-wall notifications even when the last TRADE ticker is quiet.
   * The depth engine's mid-price, not a cached trade, determines distance.
   */
  public hasFreshSynchronizedDepth(): boolean {
    return this.dataValid && this.status === 'LIVE' && !this.sequenceGap && this.hasFreshData();
  }

  public getDensities(): DensityItem[] {
    if (!this.hasFreshSynchronizedDepth()) return [];
    const thresholds = this.calculateDensityThresholds();
    const qualified = Array.from(this.activeDensities.values())
      .filter(d => (d.side === 'BID' ? this.bids : this.asks).get(d.price) === d.quantity &&
        d.notionalUsd >= (d.side === 'BID' ? thresholds.bid : thresholds.ask));
    // AUTO/HYBRID require not just sufficient USD value, but an outstanding
    // rank among the observed levels. Nearby price ticks form one visual
    // liquidity cluster; do not flood users with every qualified tick.
    return selectStandoutLevels(qualified, this.config.mode,
      (this.bestBid + this.bestAsk) / 2);
  }
  public getSignificantDensities(minNotional=500000):DensityItem[]{return this.getDensities().filter(d=>d.notionalUsd>=minNotional);}
  private hasFreshData(): boolean {
    return isFreshDepthTime(this.lastReceivedAt) && (!this.lastExchangeTimestamp || isFreshDepthTime(this.lastExchangeTimestamp));
  }
  public clear(){this.bookRevision++;this.privateProfileMemo=null;this.thresholdMemo=null;this.sortedPricesMemo=null;this.lastDensityEvaluationAt=0;this.densityInputsDirty=false;this.sharedBookActive=false;this.sharedBookRevision=null;this.bids=new Map();this.asks=new Map();this.activeDensities.clear();this.densityStats.clear();this.dataValid=false;this.sequenceGap=false;this.status='CONNECTING';this.lastUpdateId=0;this.lastReceivedAt=0;this.lastExchangeTimestamp=0;this.bestBid=0;this.bestAsk=0;this.bidCoveragePct=0;this.askCoveragePct=0;this.newlyAppearedDensities=[];}
}
