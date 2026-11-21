import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ExchangeId, HookChartPreferences, MarketType } from '../../types';
import { atr, type MarketPrint } from './marketAnalytics';
import { getSharedMarketPrints, subscribeMarketTrades } from './marketTradeStream';
import { EMPTY_FUNDING, subscribeSharedHookChartFunding, type FundingSnapshot } from './sharedFundingStream';
import { calcCascadeRisk, type Candle, type Density, type Liquidation } from './engine';
import { normalizeExchangeSymbol } from '../../utils/marketSymbols';
import type { ChartDepthStatus } from '../../utils/hookChartDepthProtocol';
import { connectSharedHookChartDepth } from './sharedDepthStream';
import { sharedChartClock } from './sharedChartClock';
import { sharedLiquidationViews } from './sharedLiquidationView';
import { HookChartDensityBook, type DensityAutoStats } from './densityBook';
import { EMPTY_SESSION_LIQUIDATIONS, getSessionLiquidationTotals, sessionLiquidationScope, subscribeSessionLiquidations } from './liquidationSession';
import { filterVisibleLiquidations } from './liquidationDisplay';
import { equalDepthAutoStats, shouldPublishDepthView } from './feedPublishPolicy';
import { hookChartAuxFeedPolicy } from './hookChartAuxFeedPolicy';

type BookLevel = { p: number; q: number };

type LiveFeedArgs = {
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  settings: HookChartPreferences;
  candles: Candle[];
  replay?: boolean;
  needsFunding: boolean;
  /** Some selected strategies require the best BID/ASK even with density overlays off. */
  needsStrategyBook?: boolean;
  /** Disable auxiliary Terminal feeds while keeping candles connected upstream. */
  lightweight?: boolean;
};

const EMPTY_DEPTH_BOOK: { b: BookLevel[]; a: BookLevel[] } = { b: [], a: [] };
const EMPTY_DENSITIES: Density[] = [];
const EMPTY_MARKET_PRINTS: MarketPrint[] = [];
const EMPTY_LIQUIDATIONS: Liquidation[] = [];
const EMPTY_CASCADE_RISK = calcCascadeRisk(EMPTY_LIQUIDATIONS, 0, 0, 0);
const EMPTY_AUTO_STATS: DensityAutoStats = {
  baseline: 0, bidCut: 0, askCut: 0, buy5m: 0, sell5m: 0,
};

export function useOriginalHookChartLiveFeed({
  exchange,
  marketType,
  symbol: rawSymbol,
  settings,
  candles,
  replay = false,
  needsFunding,
  needsStrategyBook = false,
  lightweight = false,
}: LiveFeedArgs) {
  const symbol = normalizeExchangeSymbol(rawSymbol);
  const { depth: depthEnabled, trades: tradesEnabled } = hookChartAuxFeedPolicy(settings, needsStrategyBook, replay, lightweight);
  // Key deliberately excludes candle timeframe and display threshold.
  const liquidationScope = sessionLiquidationScope(exchange, marketType, symbol);
  const sessionSubscription = useMemo(() => (replay || lightweight)
    ? ({
      // Replay is historical-only: no live liquidation session subscription,
      // even when another live HookChart tracks the same exchange and symbol.
      subscribe: (_notify: () => void) => () => {},
      snapshot: () => EMPTY_SESSION_LIQUIDATIONS,
    })
    : ({
      subscribe: (notify: () => void) => subscribeSessionLiquidations(liquidationScope, notify),
      snapshot: () => getSessionLiquidationTotals(liquidationScope),
    }), [liquidationScope, replay, lightweight]);
  const sessionTotals = useSyncExternalStore(sessionSubscription.subscribe, sessionSubscription.snapshot, () => EMPTY_SESSION_LIQUIDATIONS);
  const [densities, setDensities] = useState<Density[]>(EMPTY_DENSITIES);
  const [marketPrints, setMarketPrints] = useState<MarketPrint[]>(EMPTY_MARKET_PRINTS);
  const tradeIntegrityRef = useRef<'verified' | 'recovering' | 'incomplete'>('verified');
  const [tradeIntegrity, setTradeIntegrity] = useState<'verified' | 'recovering' | 'incomplete'>('verified');
  const [liquidations, setLiquidations] = useState<Liquidation[]>(EMPTY_LIQUIDATIONS);
  const [cascadeClock, setCascadeClock] = useState(() => Date.now());
  const [liquidationCut, setLiquidationCut] = useState(0);
  const [liquidationStreamLive, setLiquidationStreamLive] = useState(false);
  const [liquidationLastEventAt, setLiquidationLastEventAt] = useState<number | null>(null);
  const [densityCut, setDensityCut] = useState(0);
  const [densityAutoStats, setDensityAutoStats] = useState<DensityAutoStats>(EMPTY_AUTO_STATS);
  const [book, setBook] = useState<{ b: BookLevel[]; a: BookLevel[] }>(EMPTY_DEPTH_BOOK);
  const [funding, setFunding] = useState<FundingSnapshot>(EMPTY_FUNDING);
  const [depthReady, setDepthReady] = useState(false);
  const [depthStatus, setDepthStatus] = useState<ChartDepthStatus>('connecting');
  const depthScopeRef = useRef('');
  const depthScope = `${exchange}:${marketType}:${symbol}:${replay}`;
  const priceRef = useRef(0);
  const atrRef = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const applyBookRef = useRef<(() => void) | null>(null);
  const depthBookRef = useRef<HookChartDensityBook | null>(null);

  useEffect(() => {
    // ECO has no depth book: skip the per-tick ATR calculation entirely.
    if (!depthEnabled) { atrRef.current = 0; return; }
    const last = candles.at(-1);
    if (last?.c) priceRef.current = last.c;
    atrRef.current = atr(candles, 50);
  }, [candles, depthEnabled]);

  useEffect(() => {
    const exchangeSymbol = /^[\p{L}\p{M}\p{N}]+$/u.test(symbol);
    if (replay || lightweight || !exchangeSymbol || !depthEnabled) {
      depthScopeRef.current = '';
      depthBookRef.current = null;
      applyBookRef.current = null;
      setDepthStatus(!exchangeSymbol && !replay && !lightweight ? 'unavailable' : 'disabled');
      setDensities([]);
      setBook(EMPTY_DEPTH_BOOK);
      setDepthReady(false);
      setDensityCut(0);
      setDensityAutoStats({ baseline: 0, bidCut: 0, askCut: 0, buy5m: 0, sell5m: 0 });
      return;
    }

    let dead = false;
    const depthBook = new HookChartDensityBook();
    depthBookRef.current = depthBook;
    let depthPublishTimer: ReturnType<typeof setTimeout> | null = null;
    let stopDepthHoldClockSubscription: (() => void) | null = null;
    let lastDepthPublishAt = 0;
    const stopDepthHoldClock = () => {
      stopDepthHoldClockSubscription?.();
      stopDepthHoldClockSubscription = null;
    };
    const clearDepth = () => {
      stopDepthHoldClock();
      if (depthPublishTimer !== null) {
        clearTimeout(depthPublishTimer);
        depthPublishTimer = null;
      }
      depthScopeRef.current = '';
      depthBook.clear();
      setDepthReady(false);
      setDensities([]);
      setBook(EMPTY_DEPTH_BOOK);
      setDensityCut(0);
      setDensityAutoStats({ baseline: 0, bidCut: 0, askCut: 0, buy5m: 0, sell5m: 0 });
    };
    const applyBook = () => {
      if (dead) return false;
      const next = depthBook.read(settingsRef.current, atrRef.current, Date.now(), tradeIntegrityRef.current === 'verified');
      // Holding-time and reaction scores need a periodic refresh only while
      // a complete, fresh book exists. Otherwise an empty Terminal chart
      // would run an unnecessary per-second JS timer indefinitely.
      if (next.depthReady) {
        if (stopDepthHoldClockSubscription === null) {
          stopDepthHoldClockSubscription = sharedChartClock.subscribe(() => { applyBook(); });
        }
      } else stopDepthHoldClock();
      const wasReady = depthScopeRef.current === depthScope;
      if (!shouldPublishDepthView(next.depthReady, wasReady)) {
        // We must still withdraw LIVE transport status if a snapshot was
        // never accepted, without forcing new empty arrays each second.
        setDepthStatus(current => current === 'live' ? 'reconnecting' : current);
        return false;
      }
      depthScopeRef.current = next.depthReady ? depthScope : '';
      if (next.price) priceRef.current = next.price;
      // Empty books and identical counters should not invalidate every
      // Terminal chart's React tree on each hold-time clock tick.
      setDensities(current => !current.length && !next.densities.length ? current : next.densities);
      // densityBook memoizes its levelView.book until the exchange depth
      // sequence changes; keep the same React object across 1s hold clocks.
      setBook(current => current === next.book ? current : next.book);
      setDensityCut(next.densityCut);
      setDensityAutoStats(current => equalDepthAutoStats(current, next.autoStats) ? current : next.autoStats);
      setDepthReady(next.depthReady);
      if (!next.depthReady) setDepthStatus(current => current === 'live' ? 'reconnecting' : current);
      return next.depthReady;
    };
    // Apply every depth delta to each chart's exact local order book, but
    // throttle only expensive derived-density rendering (at most 5 per second).
    // Never throttle or drop a deletion/sequence update itself.
    const queueDepthPublish = () => {
      if (depthPublishTimer !== null || dead) return;
      const remaining = 200 - (Date.now() - lastDepthPublishAt);
      if (remaining <= 0) {
        lastDepthPublishAt = Date.now();
        applyBook();
      } else {
        depthPublishTimer = setTimeout(() => {
          depthPublishTimer = null;
          if (!dead) {
            lastDepthPublishAt = Date.now();
            applyBook();
          }
        }, remaining);
      }
    };
    applyBookRef.current = applyBook;
    clearDepth();
    const stopDepth = connectSharedHookChartDepth({
      exchange, marketType, symbol,
      onBook: update => {
        if (dead || !depthBook.apply(update)) return false;
        queueDepthPublish();
        return true;
      },
      onStatus: status => {
        if (dead) return;
        setDepthStatus(status);
        if (status !== 'live') clearDepth();
      },
    });
    // The holding-time clock starts upon the first valid book snapshot;
    // it stops immediately on disconnect, invalid data or final unmount.

    return () => {
      dead = true;
      if (applyBookRef.current === applyBook) applyBookRef.current = null;
      stopDepth();
      stopDepthHoldClock();
      if (depthBookRef.current === depthBook) depthBookRef.current = null;
      if (depthPublishTimer !== null) clearTimeout(depthPublishTimer);
      depthBook.clear();
    };
  }, [
    exchange, marketType, symbol, replay, lightweight, depthEnabled, depthScope,
  ]);

  // Market prints can run without the depth engine. A market-trade stream is
  // only needed by the depth absorption analysis or the explicit print overlay.
  // Candle price updates have their own independently managed upstream feed.
  useEffect(() => {
    const exchangeSymbol = /^[\p{L}\p{M}\p{N}]+$/u.test(symbol);
    if (!tradesEnabled || !exchangeSymbol) {
      setMarketPrints(EMPTY_MARKET_PRINTS);
      tradeIntegrityRef.current = 'verified';
      setTradeIntegrity('verified');
      return;
    }
    let dead = false;
    setMarketPrints(settingsRef.current.showMarketPrintSums === true
      ? getSharedMarketPrints({ exchange, marketType, symbol }) : EMPTY_MARKET_PRINTS);
    const stopTrades = subscribeMarketTrades(
      { exchange, marketType, symbol },
      {
        onTrade: trade => {
          if (!dead) depthBookRef.current?.recordAggressiveTrade(trade);
        },
        onPrints: prints => {
          if (!dead && settingsRef.current.showMarketPrintSums === true)
            setMarketPrints(prints);
        },
        wantsPrints: () => settingsRef.current.showMarketPrintSums === true,
        onIntegrity: status => {
          if (dead) return;
          tradeIntegrityRef.current = status;
          setTradeIntegrity(status);
          if (status === 'incomplete') {
            depthBookRef.current?.clearTradeEvidence();
            setMarketPrints(EMPTY_MARKET_PRINTS);
          }
          applyBookRef.current?.();
        },
      },
    );
    return () => { dead = true; stopTrades(); };
  }, [exchange, marketType, symbol, tradesEnabled]);

  // The drawing toggle does not reopen the exchange connection. Hide print
  // updates entirely while disabled, but restore the shared snapshot on enable.
  useEffect(() => {
    setMarketPrints(settings.showMarketPrintSums === true && tradesEnabled
      ? getSharedMarketPrints({ exchange, marketType, symbol }) : EMPTY_MARKET_PRINTS);
  }, [settings.showMarketPrintSums, exchange, marketType, symbol, tradesEnabled]);

  useEffect(() => {
    applyBookRef.current?.();
  }, [settings.densityAnalysis, settings.densityDiffPct, settings.densityAutoMultiplier,
    settings.densityMode, settings.densityThreshold, settings.densityTimeoutMin]);

  useEffect(() => {
    const exchangeSymbol = /^[\p{L}\p{M}\p{N}]+$/u.test(symbol);
    if (replay || lightweight || !exchangeSymbol || marketType !== 'futures') {
      setLiquidations([]);
      setLiquidationCut(0);
      setLiquidationStreamLive(false);
      setLiquidationLastEventAt(null);
      return;
    }

    // The shared market view owns ONE Liq buffer, adaptive cutoff calculation
    // and 2s expiry clock per exchange/symbol. Each chart only retains its
    // personal Long/Short display filters and chart-specific risk price.
    setLiquidations(EMPTY_LIQUIDATIONS);
    setLiquidationCut(0);
    setLiquidationLastEventAt(null);
    return sharedLiquidationViews.subscribe({
      exchange, symbol,
      onView: view => {
        setLiquidations(view.rows);
        setLiquidationCut(view.automaticCut);
        setCascadeClock(view.cascadeClock);
        setLiquidationLastEventAt(view.lastEventAt);
      },
      onStatus: setLiquidationStreamLive,
    });
  }, [exchange, marketType, symbol, replay, lightweight]);

  // Funding has one exchange/symbol timer and parsed snapshot per tab,
  // regardless of the number of HookCharts watching the same instrument.
  useEffect(() => {
    const exchangeSymbol = /^[\p{L}\p{M}\p{N}]+$/u.test(symbol);
    if (replay || lightweight || !exchangeSymbol || marketType !== 'futures' || !needsFunding) {
      setFunding(EMPTY_FUNDING);
      return;
    }
    return subscribeSharedHookChartFunding(exchange, symbol, setFunding);
  }, [exchange, marketType, symbol, replay, lightweight, needsFunding]);

  // Display thresholds never mutate the incoming events or the session totals.
  // Only the four display filters invalidate the computed liquidation view.
  // Do not reopen market sockets for a cosmetic threshold change.
  const { showLiquidationLong, showLiquidationShort, liquidationLongMinUsd,
    liquidationShortMinUsd } = settings;
  const visibleLiquidations = useMemo(() => lightweight ? EMPTY_LIQUIDATIONS : filterVisibleLiquidations(
    liquidations, liquidationCut, {
      ...settingsRef.current, showLiquidationLong, showLiquidationShort,
      liquidationLongMinUsd, liquidationShortMinUsd,
    }),
    [lightweight, liquidations, liquidationCut, showLiquidationLong,
      showLiquidationShort, liquidationLongMinUsd, liquidationShortMinUsd]);
  const lastCandlePrice = candles.at(-1)?.c || 0;
  const risk = useMemo(
    // The clock state invalidates this memo at 1m/5m event boundaries.
    // On price/cut changes use real wall-clock time too, never a stale tick.
    () => {
      // A new clock tick invalidates expired liquidation cascades even if
      // there were no fresh exchange events during the window.
      void cascadeClock;
      return lightweight ? EMPTY_CASCADE_RISK : calcCascadeRisk(liquidations, liquidationCut, lastCandlePrice);
    },
    [lightweight, liquidations, liquidationCut, lastCandlePrice, cascadeClock],
  );
  const liquidationSource = marketType === 'futures'
    ? (exchange === 'binance' ? 'BIN forceOrder' : 'BYB allLiq')
    : '';

  const currentDepth = depthEnabled && depthScopeRef.current === depthScope && depthReady;
  return {
    densities: !lightweight && currentDepth ? densities : EMPTY_DENSITIES,
    marketPrints: lightweight || tradeIntegrity !== 'verified' ? EMPTY_MARKET_PRINTS : marketPrints,
    tradeIntegrity: lightweight ? 'verified' as const : tradeIntegrity,
    liquidations: visibleLiquidations,
    allLiquidations: lightweight ? EMPTY_LIQUIDATIONS : liquidations,
    sessionLiquidationsUsd: lightweight ? 0 : sessionTotals.totalUsd,
    sessionLiquidationsLongUsd: lightweight ? 0 : sessionTotals.longUsd,
    sessionLiquidationsShortUsd: lightweight ? 0 : sessionTotals.shortUsd,
    liquidationCut: lightweight ? 0 : liquidationCut,
    liquidationStreamLive: !lightweight && liquidationStreamLive,
    liquidationLastEventAt: lightweight ? null : liquidationLastEventAt,
    liquidationSource,
    cascadeRisk: risk,
    densityCut: !lightweight && currentDepth ? densityCut : 0,
    densityAutoStats: !lightweight && currentDepth ? densityAutoStats : EMPTY_AUTO_STATS,
    book: !lightweight && currentDepth ? book : EMPTY_DEPTH_BOOK,
    fundingRate: lightweight ? EMPTY_FUNDING.rate : funding.rate,
    fundingHistory: lightweight ? EMPTY_FUNDING.history : funding.history,
    depthReady: !lightweight && currentDepth,
    depthStatus: !depthEnabled ? 'disabled' as ChartDepthStatus : depthStatus,
  };
}
