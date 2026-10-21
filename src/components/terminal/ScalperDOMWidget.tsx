import { MarketWebSocket as WebSocket } from '../../utils/marketTransport';
import { normalizeExchangeSymbol } from '../../utils/marketSymbols';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Settings, Volume2, VolumeX, Crosshair, ChevronDown, Check, Sliders, BellRing, BarChart3, ChevronLeft, ChevronRight, PanelRightClose, CircleDot } from 'lucide-react';
import { ExchangeId, MarketType, Timeframe } from '../../types';
import { formatVolume, formatWholeSum, formatCompactWholeBubble } from '../../utils/formatters';
import { playDensityChime } from '../../utils/domSound';
import { useAuth } from '../../context/AuthContext';
import { BinanceOrderBookSync, binanceStreamUrls } from '../../utils/binanceOrderBook';
import {
  aggregateDomBook, buildObservedClusters, formatDomPrice, inferBookTickSize, mergeDomTrades, validTrade,
  type DomClusterColumn,
} from '../../utils/domOrderBook';
import {
  DOM_TIMEFRAME_MS, priceBucketStep, emptyHistoricalFootprint,
  appendHistoricalFootprint, type HistoricalFootprint,
} from '../../utils/domHistory';

function formatTradeTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatCompactClusterSum(vol: number | undefined | null): string {
  if (!vol || vol <= 0 || isNaN(vol)) return '0';
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}k`;
  return `${Math.round(vol)}`;
}

function formatCandleTotalSum(vol: number | undefined | null): string {
  if (!vol || vol <= 0 || isNaN(vol)) return '$0';
  if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(2)}B`;
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${Math.round(vol / 1_000)}k`;
  return `$${Math.round(vol)}`;
}

interface ScalperDOMWidgetProps {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
  currentPrice?: number;
  priceChange24h?: number;
  initialTimeframe?: Timeframe;
  initialCompression?: number;
  initialDepth?: 'all' | 'deep' | 'medium' | 'small';
  initialDensityThreshold?: number;
  initialBubbleThreshold?: number;
  initialSoundAlert?: boolean;
  onUpdateSettings?: (settings: {
    compression?: number;
    depth?: 'all' | 'deep' | 'medium' | 'small';
    densityThresholdUsd?: number;
    bubbleThresholdUsd?: number;
    soundAlertEnabled?: boolean;
    clusterTimeframe?: Timeframe;
    heightPreset?: 'md' | 'lg' | 'xl';
  }) => void;
  height?: string | number;
  domHeightPreset?: 'md' | 'lg' | 'xl';
  onDomHeightPresetChange?: (preset: 'md' | 'lg' | 'xl') => void;
  onToggleView?: () => void;
}

interface RecentTrade {
  id: string;
  price: number;
  qty: number;
  volumeUsd: number;
  isBuyerMaker: boolean;
  timestamp: number;
}

export const ScalperDOMWidget: React.FC<ScalperDOMWidgetProps> = ({
  symbol,
  baseAsset,
  quoteAsset,
  exchange,
  marketType,
  currentPrice: propPrice,
  priceChange24h = 0,
  initialTimeframe = '5m',
  initialCompression = 1,
  initialDepth = 'all',
  initialDensityThreshold = 100000, // $100K default
  initialBubbleThreshold = 5000, // $5K default
  initialSoundAlert = true,
  onUpdateSettings,
  height,
  domHeightPreset,
  onDomHeightPresetChange,
  onToggleView,
}: ScalperDOMWidgetProps) => {
  const { user, profile, updateProfileData } = useAuth();

  // DOM settings state
  const [internalHeightPreset, setInternalHeightPreset] = useState<'md' | 'lg' | 'xl'>(() => {
    try {
      if (profile?.orderbookSettings?.heightPreset) return profile.orderbookSettings.heightPreset;
      const key = user?.uid ? `scalper_dom_height_preset_${user.uid}` : 'scalper_dom_height_preset';
      const saved = localStorage.getItem(key) || localStorage.getItem('scalper_dom_height_preset');
      if (saved === 'md' || saved === 'lg' || saved === 'xl') return saved;
    } catch {}
    return domHeightPreset || 'lg';
  });

  const activeHeightPreset = domHeightPreset || internalHeightPreset;

  const [clusterTf, setClusterTf] = useState<Timeframe>(initialTimeframe);
  const [compression, setCompression] = useState<number>(() => {
    if ([1, 2, 5, 10, 20, 50, 100].includes(initialCompression)) return initialCompression;
    try {
      if (profile?.orderbookSettings?.compression) return profile.orderbookSettings.compression;
      const key = user?.uid ? `scalper_dom_compression_${user.uid}` : 'scalper_dom_compression';
      const saved = localStorage.getItem(key) || localStorage.getItem('scalper_dom_compression');
      if (saved && !isNaN(Number(saved))) return Number(saved);
    } catch {}
    return [1, 2, 5, 10, 20, 50, 100].includes(initialCompression) ? initialCompression : 10;
  });
  const [depthPreset, setDepthPreset] = useState<'all' | 'deep' | 'medium' | 'small'>(() => {
    if (initialDepth) return initialDepth;
    try {
      if (profile?.orderbookSettings?.depth) return profile.orderbookSettings.depth;
      const key = user?.uid ? `scalper_dom_depth_preset_${user.uid}` : 'scalper_dom_depth_preset';
      const saved = localStorage.getItem(key) || localStorage.getItem('scalper_dom_depth_preset');
      if (saved && ['all', 'deep', 'medium', 'small'].includes(saved)) {
        return saved as any;
      }
    } catch {}
    return initialDepth;
  });
  const [densityThresholdUsd, setDensityThresholdUsd] = useState<number>(() => {
    if (Number.isFinite(initialDensityThreshold) && initialDensityThreshold > 0) return initialDensityThreshold;
    try {
      if (profile?.orderbookSettings?.densityThresholdUsd) return profile.orderbookSettings.densityThresholdUsd;
      const key = user?.uid ? `scalper_dom_density_threshold_${user.uid}` : 'scalper_dom_density_threshold';
      const saved = localStorage.getItem(key) || localStorage.getItem('scalper_dom_density_threshold');
      if (saved && !isNaN(Number(saved)) && Number(saved) > 0) return Number(saved);
    } catch {}
    return initialDensityThreshold;
  });
  const [bubbleThresholdUsd, setBubbleThresholdUsd] = useState<number>(() => {
    try {
      if (profile?.orderbookSettings?.bubbleThresholdUsd !== undefined) return profile.orderbookSettings.bubbleThresholdUsd;
      const key = user?.uid ? `scalper_dom_bubble_threshold_${user.uid}` : 'scalper_dom_bubble_threshold';
      const saved = localStorage.getItem(key) || localStorage.getItem('scalper_dom_bubble_threshold');
      if (saved !== null && !isNaN(Number(saved))) return Number(saved);
    } catch {}
    return initialBubbleThreshold;
  });
  const [soundAlertEnabled, setSoundAlertEnabled] = useState<boolean>(() => {
    if (initialSoundAlert !== undefined) return initialSoundAlert;
    try {
      if (profile?.orderbookSettings?.soundAlertEnabled !== undefined) return profile.orderbookSettings.soundAlertEnabled;
      const key = user?.uid ? `scalper_dom_sound_alert_${user.uid}` : 'scalper_dom_sound_alert';
      const saved = localStorage.getItem(key) || localStorage.getItem('scalper_dom_sound_alert');
      if (saved !== null) return saved === 'true';
    } catch {}
    return initialSoundAlert;
  });

  // Persist orderbook settings to profile and user storage
  const persistOrderbookSettings = useCallback((updated: Partial<{
    depth: 'all' | 'deep' | 'medium' | 'small';
    compression: number;
    soundAlertEnabled: boolean;
    densityThresholdUsd: number;
    bubbleThresholdUsd: number;
    heightPreset: 'md' | 'lg' | 'xl';
  }>) => {
    const nextSettings = {
      depth: depthPreset, compression, soundAlertEnabled, densityThresholdUsd,
      bubbleThresholdUsd, heightPreset: activeHeightPreset, ...updated,
    };
    const suffix = user?.uid ? `_${user.uid}` : '';
    try {
      localStorage.setItem(`scalper_dom_depth_preset${suffix}`, nextSettings.depth);
      localStorage.setItem(`scalper_dom_compression${suffix}`, String(nextSettings.compression));
      localStorage.setItem(`scalper_dom_sound_alert${suffix}`, String(nextSettings.soundAlertEnabled));
      localStorage.setItem(`scalper_dom_density_threshold${suffix}`, String(nextSettings.densityThresholdUsd));
      localStorage.setItem(`scalper_dom_bubble_threshold${suffix}`, String(nextSettings.bubbleThresholdUsd));
      localStorage.setItem(`scalper_dom_height_preset${suffix}`, nextSettings.heightPreset);
    } catch {}
    if (user) updateProfileData({ orderbookSettings: nextSettings }).catch(() => {});
  }, [user, depthPreset, compression, soundAlertEnabled, densityThresholdUsd, bubbleThresholdUsd, activeHeightPreset, updateProfileData]);

  const handleDomHeightPresetChange = (preset: 'md' | 'lg' | 'xl') => {
    setInternalHeightPreset(preset);
    try {
      const key = user?.uid ? `scalper_dom_height_preset_${user.uid}` : 'scalper_dom_height_preset';
      localStorage.setItem(key, preset);
    } catch {}
    persistOrderbookSettings({ heightPreset: preset });
    onDomHeightPresetChange?.(preset);
    onUpdateSettings?.({ heightPreset: preset });
  };
  const [autoCenterEnabled, setAutoCenterEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('scalper_dom_auto_center');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true; // default true
  });

  // Settings popover toggle
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTfDropdownOpen, setIsTfDropdownOpen] = useState(false);
  const [isCompressionDropdownOpen, setIsCompressionDropdownOpen] = useState(false);

  // Collapsible trades tape (стрічка) state
  const [isTapeCollapsed, setIsTapeCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('scalper_dom_tape_collapsed');
      if (saved !== null) return saved === 'true';
    } catch {}
    return false;
  });

  // Collapsible cluster footprint history state (ALWAYS active by default on all devices)
  const [showClusters, setShowClusters] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('scalper_dom_show_clusters_v2');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  const handleToggleTape = useCallback(() => {
    setIsTapeCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('scalper_dom_tape_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  const handleToggleClusters = useCallback(() => {
    setShowClusters((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('scalper_dom_show_clusters_v2', String(next));
      } catch {}
      return next;
    });
  }, []);

  // Live orderbook state (persistent full book maintained in memory)
  const bidsBookRef = useRef<Map<number, number>>(new Map());
  const asksBookRef = useRef<Map<number, number>>(new Map());
  const flushPendingRef = useRef<boolean>(false);
  const binanceSyncRef = useRef<BinanceOrderBookSync | null>(null);
  const requestDomSnapshotRef = useRef<(() => Promise<void>) | null>(null);
  const lastBookReceivedAtRef = useRef(0);
  const lastRestReceivedAtRef = useRef(0);
  const bookSocketOpenRef = useRef(false);

  const [rawBids, setRawBids] = useState<[number, number][]>([]);
  const [rawAsks, setRawAsks] = useState<[number, number][]>([]);
  const [livePrice, setLivePrice] = useState<number>(propPrice || 0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [feedStatus, setFeedStatus] = useState<'connecting' | 'live' | 'polling' | 'stale' | 'offline'>('connecting');
  const [exchangeTickSize, setExchangeTickSize] = useState<number | null>(null);
  const [clusterClock, setClusterClock] = useState(() => Date.now());

  // Live trades tape
  const [trades, setTrades] = useState<RecentTrade[]>([]);
  useEffect(() => {
    if (Number.isFinite(propPrice) && (propPrice || 0) > 0 && trades.length === 0) {
      setLivePrice(propPrice!);
    }
  }, [propPrice, trades.length]);

  // Execution-derived footprint history. Never infer buyer/seller volumes from OHLC candles.
  const [observedTrades, setObservedTrades] = useState<RecentTrade[]>([]);
  const latestTradeTimestampRef = useRef(0);
  const appendTrades = useCallback((incoming: RecentTrade[]) => {
    if (!incoming.length) return;
    const valid = incoming.filter(validTrade);
    if (!valid.length) return;
    setTrades(previous => mergeDomTrades(previous, valid, 150));
    setObservedTrades(previous => mergeDomTrades(previous, valid, 20_000));
    const newest = valid.reduce((latest, trade) => trade.timestamp > latest.timestamp ? trade : latest);
    if (newest.timestamp > latestTradeTimestampRef.current) {
      latestTradeTimestampRef.current = newest.timestamp;
      setLivePrice(newest.price);
    }
  }, []);

  // Selected trade preset size
  // Read-only DOM: no live trading order controls.

  // Density sound alert tracking to prevent duplicates
  const alertedLevelsRef = useRef<Set<string>>(new Set());

  // Container ref for auto-centering
  const domScrollContainerRef = useRef<HTMLDivElement>(null);
  const spreadRowRef = useRef<HTMLDivElement>(null);

  // Clean symbol string
  const cleanSymbol = useMemo(() => normalizeExchangeSymbol(symbol), [symbol]);

  // Max levels based on depth preset
  const depthLevelCount = useMemo(() => {
    switch (depthPreset) {
      case 'small': return 50;
      case 'medium': return 100;
      case 'deep': return 250;
      case 'all': return 999999;
      default: return 999999;
    }
  }, [depthPreset]);

  // Instrument precision comes from exchange metadata, never from current price magnitude.
  useEffect(() => {
    const controller = new AbortController();
    setExchangeTickSize(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/dom/tick-size?symbol=${encodeURIComponent(cleanSymbol)}&exchange=${exchange}&marketType=${marketType}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!controller.signal.aborted && data.success && Number.isFinite(data.tickSize) && data.tickSize > 0) {
          setExchangeTickSize(data.tickSize);
        }
      } catch {
        // Fallback to observed exchange price gaps only when metadata is unavailable.
      }
    })();
    return () => controller.abort();
  }, [cleanSymbol, exchange, marketType]);

  const baseTickSize = useMemo(() =>
    exchangeTickSize || inferBookTickSize(rawBids, rawAsks),
    [exchangeTickSize, rawBids, rawAsks]);

  const effectiveStep = baseTickSize * compression;

  const clusterWindowStart = Math.floor(clusterClock / DOM_TIMEFRAME_MS[clusterTf]);
  const [historicalClusters, setHistoricalClusters] = useState<Record<number, HistoricalFootprint>>({});
  const [historyProgress, setHistoryProgress] = useState<'loading' | 'complete' | 'partial'>('loading');

  // Backfill the previous three CLOSED candles from executed trades. OHLC klines
  // define only the price grid: their volume is never used to invent executions.
  useEffect(() => {
    const controller = new AbortController();
    setHistoricalClusters({});
    setHistoryProgress('loading');
    if (!exchangeTickSize) {
      setHistoryProgress('partial');
      return () => controller.abort();
    }
    const tick = exchangeTickSize;
    let active = true;

    const backfill = async () => {
      let allComplete = true;
      let requestBudget = 48; // Prevent exchange rate-limit exhaustion on active markets.
      try {
        const response = await fetch(
          `/api/klines?symbol=${encodeURIComponent(cleanSymbol)}&exchange=${exchange}&market=${marketType}&timeframe=${clusterTf}&limit=6`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error('Свічки недоступні');
        const payload = await response.json();
        if (!Array.isArray(payload.data)) throw new Error('Невірна історія свічок');
        const timeframeMs = DOM_TIMEFRAME_MS[clusterTf];
        const currentStart = clusterWindowStart * timeframeMs;
        const candles = payload.data.filter((k: any) =>
          Number.isFinite(k.time) && k.time * 1000 < currentStart &&
          k.time * 1000 >= currentStart - 3 * timeframeMs)
          .sort((a: any, b: any) => b.time - a.time);
        if (candles.length < 3) allComplete = false;

        for (const k of candles) {
          if (!active || controller.signal.aborted) return;
          const candleStart = Number(k.time) * 1000;
          const candleEnd = candleStart + timeframeMs;
          const candleKey = candleStart / 1000;
          let footprint = emptyHistoricalFootprint(candleKey);
          const step = priceBucketStep(Number(k.high), Number(k.low), tick);
          let candleComplete = true;

          // Futures REST supports < 1h per time-window. Use 30-minute slices
          // for deterministic pagination even if cluster timeframe is 1d.
          for (let windowStart = candleStart; windowStart < candleEnd;) {
            if (!active || controller.signal.aborted) return;
            if (requestBudget <= 0) { candleComplete = false; break; }
            const windowEnd = Math.min(windowStart + 30 * 60_000, candleEnd);
            let cursor: number | null = null;
            let segmentComplete = false;
            while (!segmentComplete) {
              if (!active || controller.signal.aborted) return;
              if (requestBudget <= 0) { candleComplete = false; break; }
              requestBudget--;
              try {
                const params = new URLSearchParams({
                  symbol: cleanSymbol, exchange, marketType,
                  startTime: String(windowStart), endTime: String(windowEnd),
                });
                if (cursor !== null) params.set('fromId', String(cursor));
                const res = await fetch(`/api/dom/trade-history?${params}`, { signal: controller.signal });
                if (!res.ok) throw new Error('Історію угод не отримано');
                const page = await res.json();
                if (!page.success || !Array.isArray(page.trades)) throw new Error('Невірна сторінка угод');
                footprint = appendHistoricalFootprint(footprint, page.trades, step, tick, false);
                segmentComplete = page.complete === true;
                if (!segmentComplete && !(Number.isSafeInteger(page.nextFromId) && page.nextFromId >= 0)) {
                  candleComplete = false;
                  break;
                }
                cursor = segmentComplete ? null : page.nextFromId;
                if (exchange === 'bybit' && !segmentComplete) { candleComplete = false; break; }
                if (active) setHistoricalClusters(previous => ({
                  ...previous, [candleKey]: { ...footprint, complete: false },
                }));
              } catch (err) {
                if (controller.signal.aborted) return;
                candleComplete = false;
                break;
              }
              // Do not hammer Binance Futures (aggTrades consumes elevated weight).
              if (!segmentComplete) await new Promise(resolve => setTimeout(resolve, 180));
            }
            if (!segmentComplete) { candleComplete = false; break; }
            windowStart = windowEnd;
          }
          footprint = { ...footprint, complete: candleComplete };
          allComplete = allComplete && candleComplete;
          if (active) setHistoricalClusters(previous => ({ ...previous, [candleKey]: footprint }));
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        allComplete = false;
      } finally {
        if (active) setHistoryProgress(allComplete ? 'complete' : 'partial');
      }
    };

    void backfill();
    return () => { active = false; controller.abort(); };
  }, [cleanSymbol, exchange, marketType, clusterTf, exchangeTickSize, clusterWindowStart]);

  const clusters: DomClusterColumn[] = useMemo(
    () => buildObservedClusters(observedTrades, clusterTf, baseTickSize, clusterClock)
      .map(col => historicalClusters[col.candleTime] || col),
    [observedTrades, clusterTf, baseTickSize, clusterClock, historicalClusters],
  );
  useEffect(() => {
    const id = setInterval(() => setClusterClock(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  // Flush in-memory map to react state (throttled via requestAnimationFrame)
  const scheduleBookFlush = useCallback(() => {
    if (flushPendingRef.current) return;
    flushPendingRef.current = true;
    requestAnimationFrame(() => {
      flushPendingRef.current = false;
      const sortedBids = Array.from(bidsBookRef.current.entries())
        .filter(([, q]) => q > 0)
        .sort((a, b) => b[0] - a[0]); // Bids descending (highest near spread)

      const sortedAsks = Array.from(asksBookRef.current.entries())
        .filter(([, q]) => q > 0)
        .sort((a, b) => a[0] - b[0]); // Asks ascending (lowest near spread)

      setRawBids(sortedBids);
      setRawAsks(sortedAsks);

      // Last traded price is supplied by the trade feed; never replace it with mid-spread.
    });
  }, []);

  // 1. Initial snapshot fetch via REST proxy (full depth 500+ orders)
  useEffect(() => {
    let isMounted = true;
    let inFlight = false;
    bidsBookRef.current.clear();
    asksBookRef.current.clear();

    const fetchSnapshot = async () => {
      const needsBridge = exchange === 'binance' && binanceSyncRef.current?.needsSnapshot;
      const websocketFresh = Date.now() - lastBookReceivedAtRef.current < 10000;
      // A socket being OPEN does not make its orderbook fresh.
      if (inFlight || (websocketFresh && !needsBridge) ||
          (!needsBridge && Date.now() - lastRestReceivedAtRef.current < 3000)) return;
      inFlight = true;
      try {
        const start = Date.now();
        const res = await fetch(
          `/api/orderbook?symbol=${encodeURIComponent(cleanSymbol)}&exchange=${exchange}&marketType=${marketType}&limit=500`
        );
        const elapsed = Math.max(10, Date.now() - start);
        if (isMounted) setLatencyMs(elapsed);

        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.bids) && Array.isArray(data.asks)) {
          if (exchange === 'binance' && binanceSyncRef.current && binanceSyncRef.current.needsSnapshot && data.lastUpdateId) {
            binanceSyncRef.current.setSnapshot({ bids: data.bids, asks: data.asks, sequence: data.lastUpdateId });
          }
          // REST fallback is permitted even on OPEN-but-stalled WebSockets. Never
          // overwrite exchange deltas received during this HTTP request.
          if (lastBookReceivedAtRef.current > start) return;
          // REST returns a complete window; absent prices are no longer visible.
          bidsBookRef.current.clear();
          asksBookRef.current.clear();
          data.bids.forEach(([p, q]: [number, number]) => {
            if (q > 0) bidsBookRef.current.set(p, q);
            else bidsBookRef.current.delete(p);
          });
          data.asks.forEach(([p, q]: [number, number]) => {
            if (q > 0) asksBookRef.current.set(p, q);
            else asksBookRef.current.delete(p);
          });
          lastRestReceivedAtRef.current = Date.now();
          scheduleBookFlush();
          setFeedStatus('polling');
        }
      } catch (err) {
        console.warn('DOM snapshot fetch error:', err);
      } finally { inFlight = false; }
    };

    requestDomSnapshotRef.current = fetchSnapshot;
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 3000); // Polling sync to ensure zero drift

    return () => {
      isMounted = false;
      if (requestDomSnapshotRef.current === fetchSnapshot) requestDomSnapshotRef.current = null;
      clearInterval(interval);
    };
  }, [cleanSymbol, exchange, marketType, scheduleBookFlush]);

  // 1b. Fetch recent trades snapshot on mount & periodic sync
  useEffect(() => {
    let isMounted = true;

    const fetchTradesSnapshot = async () => {
      try {
        const res = await fetch(
          `/api/trades?symbol=${encodeURIComponent(cleanSymbol)}&exchange=${exchange}&marketType=${marketType}&limit=60`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.trades) && data.trades.length > 0) {
          appendTrades(data.trades);
        }
      } catch (err) {
        console.warn('Trades fetch error:', err);
      }
    };

    fetchTradesSnapshot();
    const interval = setInterval(fetchTradesSnapshot, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cleanSymbol, exchange, marketType, appendTrades]);

  // 3. Connect to live Binance/Bybit WebSocket for instant real depth & trades
  useEffect(() => {
    let ws: WebSocket | null = null;
    let marketWs: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let bybitHeartbeat: ReturnType<typeof setInterval> | null = null;
    let connectStartedAt = Date.now();
    let isSubscribed = true;
    let bybitReady = false;
    let bybitSequence = 0;
    lastBookReceivedAtRef.current = 0;
    bookSocketOpenRef.current = false;
    alertedLevelsRef.current.clear();
    const sync = new BinanceOrderBookSync(marketType, update => {
      if (!isSubscribed) return;
      if (update.isSnapshot) { bidsBookRef.current.clear(); asksBookRef.current.clear(); }
      for (const [book, levels] of [[bidsBookRef.current, update.bids], [asksBookRef.current, update.asks]] as const) {
        for (const [price, qty] of levels) {
          if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(qty) || qty < 0) continue;
          if (qty === 0) book.delete(price); else book.set(price, qty);
        }
      }
      lastBookReceivedAtRef.current = Date.now();
      setFeedStatus('live');
      scheduleBookFlush();
    }, () => {
      lastBookReceivedAtRef.current = 0;
      setFeedStatus('connecting');
      bidsBookRef.current.clear(); asksBookRef.current.clear(); scheduleBookFlush();
      void requestDomSnapshotRef.current?.();
    });
    binanceSyncRef.current = exchange === 'binance' ? sync : null;

    const connect = () => {
    if (!isSubscribed) return;
    if (bybitHeartbeat) { clearInterval(bybitHeartbeat); bybitHeartbeat = null; }
    if (ws) { ws.onclose = null; ws.close(); }
    if (marketWs) { marketWs.onclose = null; marketWs.close(); }
    bookSocketOpenRef.current = false;
    connectStartedAt = Date.now();
    setFeedStatus('connecting');
    sync.reset(); bybitReady = false; bybitSequence = 0;
    try {
      if (exchange === 'bybit') {
        const bybitCategory = marketType === 'futures' ? 'linear' : 'spot';
        const wsUrl = `wss://stream.bybit.com/v5/public/${bybitCategory}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (!isSubscribed) return;
          bookSocketOpenRef.current = true;
          try {
            ws?.send(
              JSON.stringify({
                op: 'subscribe',
                args: [`orderbook.200.${cleanSymbol}`, `publicTrade.${cleanSymbol}`],
              })
            );
            bybitHeartbeat = setInterval(() => {
              if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }));
            }, 20000);
          } catch {}
        };

        ws.onmessage = (event) => {
          if (!isSubscribed) return;
          try {
            const json = JSON.parse(event.data);
            const topic = json.topic || '';
            const data = json.data;

            if (topic.startsWith('orderbook') && data) {
              const sequence = Number(data.seq || data.u);
              const snapshot = json.type === 'snapshot' || data.u === 1;
              if (!snapshot && (!bybitReady || sequence <= bybitSequence)) return;
              bybitReady = true; bybitSequence = sequence;
              lastBookReceivedAtRef.current = Date.now();
              setFeedStatus('live');
              if (json.type === 'snapshot' || data.u === 1) {
                bidsBookRef.current.clear();
                asksBookRef.current.clear();
                (data.b || []).forEach(([pStr, qStr]: [string, string]) => {
                  const p = parseFloat(pStr);
                  const q = parseFloat(qStr);
                  if (Number.isFinite(p) && p > 0 && Number.isFinite(q) && q > 0) bidsBookRef.current.set(p, q);
                });
                (data.a || []).forEach(([pStr, qStr]: [string, string]) => {
                  const p = parseFloat(pStr);
                  const q = parseFloat(qStr);
                  if (Number.isFinite(p) && p > 0 && Number.isFinite(q) && q > 0) asksBookRef.current.set(p, q);
                });
              } else {
                // Delta update: q = 0 means remove level
                (data.b || []).forEach(([pStr, qStr]: [string, string]) => {
                  const p = parseFloat(pStr);
                  const q = parseFloat(qStr);
                  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(q) || q < 0) return;
                  if (q === 0) bidsBookRef.current.delete(p);
                  else bidsBookRef.current.set(p, q);
                });
                (data.a || []).forEach(([pStr, qStr]: [string, string]) => {
                  const p = parseFloat(pStr);
                  const q = parseFloat(qStr);
                  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(q) || q < 0) return;
                  if (q === 0) asksBookRef.current.delete(p);
                  else asksBookRef.current.set(p, q);
                });
              }
              scheduleBookFlush();
            } else if (topic.startsWith('publicTrade') && Array.isArray(data)) {
              const batch: RecentTrade[] = data.map((t: any) => {
                const tradePrice = Number(t.p);
                const tradeQty = Number(t.v);
                return {
                  id: String(t.i ?? ''),
                  price: tradePrice,
                  qty: tradeQty,
                  volumeUsd: tradePrice * tradeQty,
                  isBuyerMaker: t.S === 'Sell',
                  timestamp: Number(t.T),
                };
              });
              appendTrades(batch);
              // appendTrades also updates last traded price if the execution is newer.
            }
          } catch {}
        };
      } else {
        // Binance real depth stream (all changes) + aggTrade
        const urls = binanceStreamUrls(cleanSymbol, marketType);
        const wsUrl = urls[0];

        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          bookSocketOpenRef.current = true;
          void requestDomSnapshotRef.current?.();
        };

        ws.onmessage = (event) => {
          if (!isSubscribed) return;
          try {
            const msg = JSON.parse(event.data);
            const stream = msg.stream || '';
            const data = msg.data || msg;

            if (stream.includes('@depth') || data.e === 'depthUpdate') {
              sync.push(data);
            } else if (stream.includes('@aggTrade') || data.e === 'aggTrade') {
              const tradePrice = parseFloat(data.p);
              const tradeQty = parseFloat(data.q);
              const isBuyerMaker = !!data.m; // true = sell, false = buy
              const volumeUsd = tradePrice * tradeQty;

              const newTrade: RecentTrade = {
                id: String(data.a ?? ''),
                price: tradePrice,
                qty: tradeQty,
                volumeUsd,
                isBuyerMaker,
                timestamp: Number(data.T),
              };
              appendTrades([newTrade]);
            }
          } catch (e) {}
        };
        if (urls[1]) {
          marketWs = new WebSocket(urls[1]);
          marketWs.onmessage = ws.onmessage;
          marketWs.onerror = () => {};
        }
      }

      ws.onerror = () => { if (isSubscribed) setFeedStatus('offline'); };
      const reconnect = () => {
        if (!isSubscribed || reconnectTimer) return;
        bookSocketOpenRef.current = false;
        lastBookReceivedAtRef.current = 0;
        setFeedStatus('offline');
        if (bybitHeartbeat) { clearInterval(bybitHeartbeat); bybitHeartbeat = null; }
        sync.reset();
        bidsBookRef.current.clear(); asksBookRef.current.clear(); scheduleBookFlush();
        reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 3000);
      };
      ws.onclose = reconnect;
      if (marketWs) marketWs.onclose = reconnect;
    } catch (e) {}
    };
    connect();
    // An OPEN socket does not guarantee fresh data: watchdog stale or stalled streams.
    const watchdog = setInterval(() => {
      if (!isSubscribed) return;
      const age = Date.now() - (lastBookReceivedAtRef.current || connectStartedAt);
      if (age > 15000) {
        const recentRest = Date.now() - lastRestReceivedAtRef.current < 10000;
        setFeedStatus(recentRest ? 'polling' : 'stale');
      }
      if (age > 30000 && !reconnectTimer) connect();
    }, 5000);

    return () => {
      isSubscribed = false;
      bookSocketOpenRef.current = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (bybitHeartbeat) clearInterval(bybitHeartbeat);
      clearInterval(watchdog);
      if (marketWs) marketWs.close();
      if (binanceSyncRef.current === sync) binanceSyncRef.current = null;
      if (ws) {
        try {
          ws.close();
        } catch (e) {}
      }
    };
  }, [cleanSymbol, marketType, exchange, scheduleBookFlush, appendTrades]);

  // 4. Price-directional aggregation; preserve raw best bid/ask and exact quote notionals.
  const {
    aggregatedAsks, aggregatedBids, maxVolumeUsd,
    bestAsk, bestBid, spreadUsd, spreadPct, totalRealOrdersCount,
  } = useMemo(() => aggregateDomBook(
    rawBids, rawAsks, baseTickSize, compression, depthLevelCount, densityThresholdUsd,
  ), [rawBids, rawAsks, baseTickSize, compression, depthLevelCount, densityThresholdUsd]);

  // 5. Sound Alert detection for specified density
  useEffect(() => {
    if (!soundAlertEnabled) return;

    let hasNewDensity = false;
    const currentDenseLevels = new Set<string>();

    // Check asks
    aggregatedAsks.forEach((row) => {
      if (row.isDensity) {
        currentDenseLevels.add(`ASK_${row.price}`);
        if (!alertedLevelsRef.current.has(`ASK_${row.price}`)) {
          hasNewDensity = true;
        }
      }
    });

    // Check bids
    aggregatedBids.forEach((row) => {
      if (row.isDensity) {
        currentDenseLevels.add(`BID_${row.price}`);
        if (!alertedLevelsRef.current.has(`BID_${row.price}`)) {
          hasNewDensity = true;
        }
      }
    });

    if (hasNewDensity) {
      playDensityChime(false);
    }

    // Keep alert tracking updated
    alertedLevelsRef.current = currentDenseLevels;
  }, [aggregatedAsks, aggregatedBids, soundAlertEnabled]);

  // Root container ref and dimensions tracking
  const rootContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(0);

  // Auto-center on mount, on symbol change, or when block dimensions change
  const handleCenterDOM = useCallback(() => {
    if (spreadRowRef.current && domScrollContainerRef.current) {
      const container = domScrollContainerRef.current;
      const spreadEl = spreadRowRef.current;
      const topOffset = spreadEl.offsetTop - container.clientHeight / 2 + spreadEl.clientHeight / 2;
      container.scrollTo({ top: Math.max(0, topOffset), behavior: 'auto' });
    }
  }, []);

  useEffect(() => {
    if (!autoCenterEnabled) return;
    const timer = setTimeout(handleCenterDOM, 100);
    return () => clearTimeout(timer);
  }, [autoCenterEnabled, handleCenterDOM, aggregatedAsks.length, aggregatedBids.length, compression, depthPreset]);

  // ResizeObserver to detect any change in width or height of the widget/chart block
  useEffect(() => {
    if (!rootContainerRef.current) return;
    let resizeTimer: any = null;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerWidth(width);
        setContainerHeight(height);

        // When block height or width changes, re-center DOM spread smoothly so price is always in view
        if (autoCenterEnabled) {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            handleCenterDOM();
          }, 80);
        }
      }
    });

    ro.observe(rootContainerRef.current);
    return () => {
      clearTimeout(resizeTimer);
      ro.disconnect();
    };
  }, [handleCenterDOM, autoCenterEnabled]);

  useEffect(() => {
    if (autoCenterEnabled) {
      const timer = setTimeout(handleCenterDOM, 300);
      return () => clearTimeout(timer);
    }
  }, [handleCenterDOM, symbol, autoCenterEnabled]);

  // Timeframe switch handler
  const handleSelectClusterTf = (tf: Timeframe) => {
    setClusterTf(tf);
    setIsTfDropdownOpen(false);
    onUpdateSettings?.({ clusterTimeframe: tf });
  };

  // Compression switch handler
  const handleSelectCompression = (comp: number) => {
    setCompression(comp);
    setIsCompressionDropdownOpen(false);
    persistOrderbookSettings({ compression: comp });
    onUpdateSettings?.({ compression: comp });
  };

  // Depth switch handler
  const handleSelectDepth = (depth: 'all' | 'deep' | 'medium' | 'small') => {
    setDepthPreset(depth);
    persistOrderbookSettings({ depth });
    onUpdateSettings?.({ depth });
  };

  // Density threshold handler
  const handleSetDensityThreshold = (val: number) => {
    if (!Number.isFinite(val) || val <= 0) return;
    setDensityThresholdUsd(val);
    persistOrderbookSettings({ densityThresholdUsd: val });
    onUpdateSettings?.({ densityThresholdUsd: val });
  };

  // Trade bubbles threshold handler
  const handleSetBubbleThreshold = (val: number) => {
    setBubbleThresholdUsd(val);
    persistOrderbookSettings({ bubbleThresholdUsd: val });
    onUpdateSettings?.({ bubbleThresholdUsd: val });
  };

  // Sound toggle handler
  const handleToggleSound = () => {
    const next = !soundAlertEnabled;
    setSoundAlertEnabled(next);
    if (next) playDensityChime(true);
    persistOrderbookSettings({ soundAlertEnabled: next });
    onUpdateSettings?.({ soundAlertEnabled: next });
  };

  // Auto-center toggle handler
  const handleToggleAutoCenter = () => {
    setAutoCenterEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('scalper_dom_auto_center', String(next));
      } catch {}
      if (next) {
        setTimeout(handleCenterDOM, 50);
      }
      return next;
    });
  };

  // Calculate recent trade bubbles placed next to the price ladder (filtered by volume threshold)
  const tradeBubbles = useMemo(() => {
    const filtered = bubbleThresholdUsd > 0
      ? trades.filter((t) => t.volumeUsd >= bubbleThresholdUsd)
      : trades;

    return filtered.slice(0, 50).map((t, idx) => {
      // Scale bubble diameter from 20px to 38px based on volume
      const sizePx = Math.min(38, Math.max(20, Math.round(Math.log10(Math.max(t.volumeUsd, 10)) * 7.5)));
      return {
        ...t,
        sizePx,
        opacity: Math.max(0.4, 1 - idx * 0.015),
      };
    });
  }, [trades, bubbleThresholdUsd]);

  return (
    <div
      ref={rootContainerRef}
      className="relative flex flex-col w-full h-full bg-[#0b0e14] text-slate-200 select-none overflow-hidden font-mono text-[11px]"
      style={{ height: height || '100%' }}
    >
      {/* ================= TOP-LEFT OVERLAY (Responsive, mobile friendly) ================= */}
      <div className="absolute top-1 left-1.5 z-30 flex flex-col items-start gap-1 pointer-events-auto max-w-[calc(100%-80px)]">


        {/* Row 2: ⚙ | 5m | x10 | Стрічка [▾/▴] | Кластери | Center | Ping */}
        <div className="flex flex-wrap items-center gap-1 bg-[#090d16]/95 px-1.5 py-0.5 rounded-md border border-slate-800/80 text-[10px] text-slate-400 backdrop-blur-md shadow-sm">
          {/* Settings button ⚙ */}
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`p-1 rounded hover:text-white transition-colors cursor-pointer ${
              isSettingsOpen ? 'text-cyan-400 bg-slate-800' : 'text-slate-400'
            }`}
            title="Налаштування стакану та сповіщень"
          >
            <Settings className="w-3 h-3" />
          </button>

          {/* Timeframe for clusters (5m) */}
          <div className="relative">
            <button
              onClick={() => setIsTfDropdownOpen(!isTfDropdownOpen)}
              className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 font-semibold hover:text-white transition-colors cursor-pointer flex items-center gap-0.5"
              title="Таймфрейм історії кластерів"
            >
              <span>{clusterTf}</span>
              <ChevronDown className="w-2.5 h-2.5 opacity-60" />
            </button>

            {isTfDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 flex flex-col min-w-[70px]">
                {(['1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => handleSelectClusterTf(tf)}
                    className={`px-2 py-1 text-left hover:bg-slate-800 text-[10px] flex items-center justify-between ${
                      clusterTf === tf ? 'text-cyan-400 font-bold' : 'text-slate-300'
                    }`}
                  >
                    <span>{tf}</span>
                    {clusterTf === tf && <Check className="w-2.5 h-2.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Compression badge (x10) */}
          <div className="relative">
            <button
              onClick={() => setIsCompressionDropdownOpen(!isCompressionDropdownOpen)}
              className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 font-semibold hover:text-white transition-colors cursor-pointer flex items-center gap-0.5"
              title="Рівень зжаття стакану (до 100х)"
            >
              <span>x{compression}</span>
              <ChevronDown className="w-2.5 h-2.5 opacity-60" />
            </button>

            {isCompressionDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 flex flex-col min-w-[80px]">
                {[1, 2, 5, 10, 20, 50, 100].map((c) => (
                  <button
                    key={c}
                    onClick={() => handleSelectCompression(c)}
                    className={`px-2 py-1 text-left hover:bg-slate-800 text-[10px] flex items-center justify-between ${
                      compression === c ? 'text-amber-400 font-bold' : 'text-slate-300'
                    }`}
                  >
                    <span>x{c}</span>
                    {compression === c && <Check className="w-2.5 h-2.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="text-slate-600 hidden sm:inline">-</span>

          {/* Tape Toggle Button (Згортати / Розгортати стрічку) */}
          <button
            onClick={handleToggleTape}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer text-[9px] font-bold border shrink-0 ${
              !isTapeCollapsed
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title={isTapeCollapsed ? 'Розгорнути стрічку угод' : 'Згорнути стрічку угод'}
          >
            <CircleDot className="w-2.5 h-2.5 text-cyan-400" />
            <span>{!isTapeCollapsed ? 'Стрічка' : 'Стрічка +'}</span>
          </button>

          {/* Clusters Toggle Button (Кластери) - Visible on ALL screen sizes */}
          <button
            onClick={handleToggleClusters}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer text-[9px] font-bold border shrink-0 ${
              showClusters
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title={showClusters ? 'Згорнути кластери' : 'Показати кластери'}
          >
            <BarChart3 className="w-2.5 h-2.5 text-amber-400" />
            <span>{showClusters ? 'Кластери' : 'Кластери +'}</span>
          </button>

          {/* Latency ping indicator */}
          <div className="hidden sm:flex items-center gap-1 text-[9px] font-mono text-slate-400">
            <span className={`w-1.5 h-1.5 rounded-full ${feedStatus === 'live' ? 'bg-emerald-500 animate-pulse' : feedStatus === 'offline' || feedStatus === 'stale' ? 'bg-rose-500' : 'bg-amber-500'}`} />
            <span title="Час останнього REST-запиту, не затримка WebSocket">{latencyMs === null ? '—' : `${latencyMs}ms REST`}</span>
          </div>

          <span title="Стан потоку заявок" className={`text-[9px] font-bold ${
            feedStatus === 'live' ? 'text-emerald-400' : feedStatus === 'stale' || feedStatus === 'offline' ? 'text-rose-400' : 'text-amber-400'
          }`}>
            {feedStatus === 'live' ? 'LIVE' : feedStatus === 'stale' ? 'ЗАСТАРІЛО' : feedStatus === 'offline' ? 'НЕМА ЗВ’ЯЗКУ' : feedStatus === 'polling' ? 'REST' : 'СИНХР.'}
          </span>
          {/* Number of price levels, not individual orders */}
          <div
            className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono text-[9px] font-bold"
            title={`Кількість цінових рівнів (не окремих ордерів): ${rawAsks.length} Asks + ${rawBids.length} Bids`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span>{totalRealOrdersCount}</span>
          </div>

          {/* Auto Center Button */}
          <button
            onClick={handleCenterDOM}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-[9px] font-bold border border-slate-700"
            title="Центрувати стакан на спреді"
          >
            <Crosshair className="w-2.5 h-2.5 text-cyan-400" />
            <span className="hidden xs:inline">Центр</span>
          </button>
        </div>
      </div>



      {/* ================= SETTINGS POPOVER DIALOG ================= */}
      {isSettingsOpen && (
        <div
          className="absolute top-14 left-2.5 z-50 w-80 max-h-[85vh] overflow-y-auto no-scrollbar bg-slate-900/98 border border-slate-700 rounded-2xl shadow-2xl p-3.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
            <span className="font-bold text-xs text-white flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              Параметри стакану (DOM)
            </span>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Розмір блоку стакану: 600px 780px 950px */}
          <div className="mb-3 space-y-1.5 p-2 rounded-xl bg-slate-950/80 border border-slate-800/90">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>Розмір блоку стакану (висота):</span>
              </span>
              <span className="text-cyan-400 font-bold font-mono">
                {activeHeightPreset === 'md' ? '600px' : activeHeightPreset === 'xl' ? '950px' : '780px'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[11px]">
              {[
                { size: 'md' as const, label: '600px' },
                { size: 'lg' as const, label: '780px' },
                { size: 'xl' as const, label: '950px' },
              ].map((item) => (
                <button
                  key={item.size}
                  type="button"
                  onClick={() => handleDomHeightPresetChange(item.size)}
                  className={`py-1.5 rounded-lg border text-center font-bold transition-all cursor-pointer ${
                    activeHeightPreset === item.size
                      ? 'bg-cyan-500/25 border-cyan-500 text-cyan-300 shadow-sm shadow-cyan-950/60'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="text-[9.5px] text-slate-500 leading-tight">
              Змінює тільки довжину (висоту) стакану до низу. Ширина залежить від ширини графіка.
            </p>
          </div>

          {/* Автоцентрування */}
          <div className="mb-3 p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/15 flex items-center justify-center text-cyan-400">
                <Crosshair className="w-3.5 h-3.5" />
              </div>
              <div className="text-[11px]">
                <div className="font-semibold text-white">Автоцентрування</div>
                <div className="text-[9px] text-slate-400">Автоцентрувати стакан на спред</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleAutoCenter}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                autoCenterEnabled
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {autoCenterEnabled ? 'УВІМК' : 'ВИМК'}
            </button>
          </div>

          {/* 1. Плотність у стакані (Threshold) - від 100к, 300к, 500к, 1М */}
          <div className="mb-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">Поріг плотності (USD):</span>
              <span className="text-amber-400 font-bold font-mono">
                {formatVolume(densityThresholdUsd)}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 text-[10px]">
              {[
                { amt: 100000, label: '100к' },
                { amt: 300000, label: '300к' },
                { amt: 500000, label: '500к' },
                { amt: 1000000, label: '1М' },
              ].map(({ amt, label }) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleSetDensityThreshold(amt)}
                  className={`py-1.5 rounded-lg border text-center font-bold transition-all cursor-pointer ${
                    densityThresholdUsd === amt
                      ? 'bg-amber-500/25 border-amber-500 text-amber-300 shadow-sm shadow-amber-950/60'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="range"
                min={50000}
                max={2000000}
                step={25000}
                value={densityThresholdUsd}
                onChange={(e) => handleSetDensityThreshold(Number(e.target.value))}
                className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-mono shrink-0">
                <span className="text-slate-500">$</span>
                <input
                  type="number"
                  min={10000}
                  step={25000}
                  value={densityThresholdUsd}
                  onChange={(e) => handleSetDensityThreshold(Math.max(10000, Number(e.target.value)))}
                  className="w-18 bg-transparent text-white text-right focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 2. Сума показу кружечків у стрічці угод (Trade Bubbles Minimum Volume) */}
          <div className="mb-3 space-y-1.5 p-2 rounded-xl bg-slate-950/80 border border-slate-800/90">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <CircleDot className="w-3.5 h-3.5 text-cyan-400" />
                <span>Сума кружечків у стрічці:</span>
              </span>
              <span className="text-cyan-400 font-bold font-mono">
                {bubbleThresholdUsd === 0 ? 'Всі угоди' : `≥ ${formatVolume(bubbleThresholdUsd)}`}
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1 text-[10px]">
              {[
                { val: 0, label: 'Всі' },
                { val: 1000, label: '1к' },
                { val: 5000, label: '5к' },
                { val: 10000, label: '10к' },
                { val: 25000, label: '25к' },
                { val: 50000, label: '50к' },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => handleSetBubbleThreshold(item.val)}
                  className={`py-1 rounded border text-center font-bold transition-all cursor-pointer ${
                    bubbleThresholdUsd === item.val
                      ? 'bg-cyan-500/25 border-cyan-500 text-cyan-300 shadow-sm shadow-cyan-950/60'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="range"
                min={0}
                max={100000}
                step={500}
                value={bubbleThresholdUsd}
                onChange={(e) => handleSetBubbleThreshold(Number(e.target.value))}
                className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-mono shrink-0">
                <span className="text-slate-500">$</span>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={bubbleThresholdUsd}
                  onChange={(e) => handleSetBubbleThreshold(Math.max(0, Number(e.target.value)))}
                  className="w-16 bg-transparent text-white text-right focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 2. Звукове сповіщення при появі плотності */}
          <div className="mb-3 p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400">
                <BellRing className="w-3.5 h-3.5" />
              </div>
              <div className="text-[11px]">
                <div className="font-semibold text-white">Звук при плотності</div>
                <div className="text-[9px] text-slate-400">Дзвінок при появі великого об'єму</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => playDensityChime(true)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 hover:text-white"
                title="Тест звуку"
              >
                Тест
              </button>
              <button
                onClick={handleToggleSound}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  soundAlertEnabled
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {soundAlertEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* 3. Рівень зжаття (Compression до 100x) */}
          <div className="mb-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">Рівень зжаття стакану:</span>
              <span className="text-cyan-400 font-bold font-mono">x{compression}</span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-[10px]">
              {[1, 2, 5, 10, 20, 50, 100].map((c) => (
                <button
                  key={c}
                  onClick={() => handleSelectCompression(c)}
                  className={`py-1 rounded border text-center font-bold transition-all cursor-pointer ${
                    compression === c
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  x{c}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Глибина стакану (Depth: 50, 100, 250, ВСІ 500+) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">Глибина стакану:</span>
              <span className="text-cyan-400 text-[10px] font-mono font-bold">
                {depthPreset === 'small'
                  ? '50 рівнів'
                  : depthPreset === 'medium'
                  ? '100 рівнів'
                  : depthPreset === 'deep'
                  ? '250 рівнів'
                  : 'ВСІ реальні заявки (500+)'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-[10px]">
              {[
                { id: 'small', label: '50' },
                { id: 'medium', label: '100' },
                { id: 'deep', label: '250' },
                { id: 'all', label: 'ВСІ (500+)' },
              ].map((d) => (
                <button
                  key={d.id}
                  onClick={() => handleSelectDepth(d.id as any)}
                  className={`py-1.5 rounded-lg border text-center font-bold transition-all cursor-pointer ${
                    depthPreset === d.id
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-2 left-2 z-30 text-[9px] font-mono bg-[#090d16]/95 border border-slate-800 rounded px-2 py-1 text-slate-400"
        title="DOM показує ринок; ордери не виставляються. Кластери містять тільки отримані угоди.">
        Угод отримано: {observedTrades.length.toLocaleString('en-US')} · без торгівлі
      </div>

      {/* ================= MAIN SCALPER CANVAS (Clusters + Tape + DOM) ================= */}
      <div className="flex-1 w-full overflow-hidden relative flex divide-x divide-slate-900/60 min-h-0">
        {/* Subtle Horizontal Price Grid Lines across canvas */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <div
            className="w-full h-full opacity-15"
            style={{
              backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
              backgroundSize: '100% 22px',
            }}
          />
        </div>

        {/* 1. LEFT SECTION: Cluster History (collapsible/expandable footprint clusters with all sums visible) */}
        {showClusters ? (
          <div className="w-[36%] sm:w-48 md:w-60 lg:w-72 max-w-[42%] min-w-0 shrink-0 h-full flex flex-col relative z-10 select-none overflow-hidden bg-[#070a10]/90 border-r border-slate-900/80">
            {/* Clusters Sticky Header */}
            <div className="sticky top-0 z-20 flex items-center justify-between px-1.5 py-1 bg-slate-950/95 border-b border-slate-800/80 backdrop-blur-md shrink-0">
              <div className="flex items-center gap-1 min-w-0">
                <BarChart3 className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider truncate">
                  Кластери
                </span>
                <span className="text-[8px] font-mono text-amber-400/90 font-bold px-1 rounded bg-amber-500/10">
                  {clusterTf}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[7.5px] font-mono text-slate-500 hidden sm:inline">
                  (Куп/Разом)
                </span>
                <button
                  type="button"
                  onClick={handleToggleClusters}
                  className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
                  title="Згорнути кластери"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="px-1 text-[8px] text-amber-400" title="Історія формується виключно за фактичними виконаними угодами. Повнота залежить від API біржі.">
              {historyProgress === 'loading' ? 'Завантаження історії…' : historyProgress === 'complete' ? 'Закриті свічки: повна історія' : 'Деякі свічки: неповні дані'}
            </div>
            {/* Footprint Cluster Columns (all sums clearly visible, horizontal scroll if screen is narrow) */}
            <div className="flex-1 flex items-stretch h-full gap-1 p-1 overflow-x-auto overflow-y-hidden no-scrollbar touch-pan-x">
              {clusters.map((col) => {
                const maxLvl = col.maxLevelVol || 1;
                return (
                  <div
                    key={col.candleTime}
                    className="flex-1 min-w-[46px] sm:min-w-[52px] flex flex-col h-full items-center justify-between relative group border border-slate-800/40 rounded bg-slate-950/40 p-0.5"
                  >
                    {/* Previous candle completeness is verified only after its full execution-page scan. */}
                    <div className="text-[8.5px] text-slate-300 font-mono shrink-0 truncate py-0.5 font-bold"
                         title={(col as HistoricalFootprint).complete ? 'Усі виконані угоди свічки отримано' : 'Неповна історія угод'}>
                      {col.label} {(col as HistoricalFootprint).complete ? '✓' : '≈'}
                    </div>

                    {/* Footprint Cluster Levels Stack */}
                    <div className="flex-1 w-full flex flex-col justify-center gap-[2px] overflow-y-auto no-scrollbar my-0.5">
                      {Object.values(col.levels)
                        .sort((a, b) => b.price - a.price)
                        .map((lvl) => {
                          const isPOC = lvl.isPOC;
                          const fillPct = Math.min(100, Math.max(8, (lvl.totalVol / maxLvl) * 100));

                          return (
                            <div
                              key={lvl.price}
                              className={`w-full h-[18px] sm:h-[19px] relative flex items-center justify-between px-1 text-[8px] sm:text-[8.5px] rounded font-mono transition-all overflow-hidden ${
                                isPOC
                                  ? 'border border-amber-400 bg-amber-500/25 ring-1 ring-amber-400/40 shadow-sm shadow-amber-950/60'
                                  : lvl.buyVol >= lvl.sellVol
                                  ? 'bg-slate-900/60 hover:bg-slate-800 border-l border-emerald-500/80'
                                  : 'bg-slate-900/60 hover:bg-slate-800 border-l border-rose-500/80'
                              }`}
                              title={`Спостережені угоди (неповна історія)\nРівень: ${formatDomPrice(lvl.price, baseTickSize)}\nКупівля: ${formatVolume(lvl.buyVol)}\nПродаж: ${formatVolume(lvl.sellVol)}\nРазом: ${formatVolume(lvl.totalVol)}${isPOC ? ' (POC за отриманими угодами)' : ''}`}
                            >
                              {/* Horizontal relative volume fill bar */}
                              <div
                                className={`absolute left-0 top-0 bottom-0 pointer-events-none opacity-20 ${
                                  isPOC
                                    ? 'bg-amber-400'
                                    : lvl.buyVol >= lvl.sellVol
                                    ? 'bg-emerald-400'
                                    : 'bg-rose-400'
                                }`}
                                style={{ width: `${fillPct}%` }}
                              />

                              {/* Buy volume sum on left */}
                              <span className="relative z-10 text-[7.5px] sm:text-[8px] font-bold text-emerald-400/90 shrink-0 font-mono">
                                {formatCompactClusterSum(lvl.buyVol)}
                              </span>

                              {/* Total volume sum on right with POC badge if applicable */}
                              <div className="relative z-10 flex items-center gap-0.5 shrink-0 ml-auto font-mono">
                                {isPOC && (
                                  <span className="text-[6.5px] font-black px-0.5 rounded bg-amber-400 text-slate-950 uppercase tracking-tighter">
                                    POC
                                  </span>
                                )}
                                <span
                                  className={`text-[8px] sm:text-[8.5px] font-bold ${
                                    isPOC ? 'text-amber-200 font-extrabold' : 'text-slate-100'
                                  }`}
                                >
                                  {formatCompactClusterSum(lvl.totalVol)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>

                    {/* Column bottom: Total Candle Volume Sum (Fully visible) */}
                    <div
                      className="text-[8.5px] text-amber-300 font-mono shrink-0 truncate py-0.5 font-extrabold tracking-tight"
                      title={`${(col as HistoricalFootprint).complete ? 'Повний біржовий обсяг виконаних угод свічки' : 'Тільки обсяг отриманих угод (неповна історія)'}: ${formatVolume(col.totalVolume)}`}
                    >
                      {formatCandleTotalSum(col.totalVolume)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Collapsed Clusters Strip */
          <div
            onClick={handleToggleClusters}
            className="w-7 shrink-0 h-full relative z-10 flex flex-col items-center justify-between py-2 border-r border-slate-900/70 bg-[#070a10]/95 hover:bg-slate-900/90 cursor-pointer transition-colors group select-none"
            title="Розгорнути кластери"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleClusters();
              }}
              className="p-1 rounded text-amber-400 group-hover:text-amber-300 hover:bg-slate-800 transition-colors"
              title="Розгорнути кластери"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <div className="flex flex-col items-center gap-1.5 my-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span
                className="text-[9px] font-bold text-slate-400 group-hover:text-amber-300 uppercase tracking-widest"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                Кластери
              </span>
            </div>
            <span className="text-[10px] text-slate-500 group-hover:text-amber-400 font-bold">»</span>
          </div>
        )}

        {/* 2. MIDDLE SECTION: Trades Tape ("Стрічка угод / Лента сделок") */}
        {!isTapeCollapsed ? (
          <div className="w-[24%] sm:w-32 md:w-36 lg:w-44 max-w-[32%] min-w-0 shrink-0 h-full relative z-10 flex flex-col border-r border-slate-900/70 bg-[#070a10]/90 select-none">
            {/* Tape Sticky Header */}
            <div className="sticky top-0 z-20 flex flex-col px-2 py-1 bg-slate-950/95 border-b border-slate-800/80 backdrop-blur-md shrink-0">
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider truncate">
                    Стрічка
                  </span>
                  <span className="flex h-1.5 w-1.5 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Clickable threshold filter */}
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(true)}
                    className="flex items-center gap-0.5 text-[8px] font-mono px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-800 hover:border-cyan-500/50 transition-colors cursor-pointer"
                    title="Змінити поріг показу кружечків"
                  >
                    <CircleDot className="w-2 h-2 text-cyan-400" />
                    <span>{bubbleThresholdUsd === 0 ? 'Всі' : `≥${formatWholeSum(bubbleThresholdUsd)}`}</span>
                  </button>

                  {/* Collapse Tape Button */}
                  <button
                    type="button"
                    onClick={handleToggleTape}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                    title="Згорнути стрічку"
                  >
                    <PanelRightClose className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Column labels: ONLY Circle and Price */}
              <div className="flex items-center justify-between text-[8px] text-slate-500 font-mono mt-0.5 pt-0.5 border-t border-slate-900/80">
                <span>Кружечок</span>
                <span className="text-right">Ціна</span>
              </div>
            </div>

            {/* Trade bubbles / Tape live scroll: ONLY CIRCLES AND PRICE */}
            <div
              className="flex-1 w-full overflow-y-auto no-scrollbar p-1 flex flex-col gap-1 touch-pan-y"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {tradeBubbles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-2 text-slate-500 my-auto">
                  <CircleDot className="w-6 h-6 text-slate-700 animate-pulse" />
                  <span className="text-[10px] font-mono leading-tight">
                    Немає угод {bubbleThresholdUsd > 0 ? `≥ ${formatWholeSum(bubbleThresholdUsd)}` : ''}
                  </span>
                  {bubbleThresholdUsd > 0 && (
                    <button
                      type="button"
                      onClick={() => handleSetBubbleThreshold(0)}
                      className="text-[9px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                    >
                      Показати всі угоди
                    </button>
                  )}
                </div>
              ) : (
                tradeBubbles.map((tb) => {
                  const isBuy = !tb.isBuyerMaker;
                  const isWhale = tb.volumeUsd >= densityThresholdUsd;

                  return (
                    <div
                      key={tb.id}
                      className={`flex items-center justify-between px-1.5 py-1 rounded-md border text-xs font-mono transition-all duration-150 animate-in fade-in hover:brightness-125 cursor-default ${
                        isWhale
                          ? isBuy
                            ? 'bg-emerald-950/70 border-emerald-400/90 shadow-sm shadow-emerald-500/20'
                            : 'bg-rose-950/70 border-rose-400/90 shadow-sm shadow-rose-500/20'
                          : isBuy
                          ? 'bg-emerald-950/30 border-emerald-800/40 hover:border-emerald-500/60'
                          : 'bg-rose-950/30 border-rose-800/40 hover:border-rose-500/60'
                      }`}
                      title={`${isBuy ? 'BUY' : 'SELL'}: ${formatVolume(tb.volumeUsd)} @ ${formatDomPrice(tb.price, baseTickSize)} (${formatTradeTime(tb.timestamp)})`}
                    >
                      {/* ONLY THE CIRCLE (КРУЖЕЧОК) */}
                      <div
                        className={`flex items-center justify-center rounded-full font-extrabold shrink-0 shadow-sm transition-transform duration-100 ${
                          isBuy
                            ? 'bg-emerald-500 text-slate-950 shadow-emerald-900/50 ring-1 ring-emerald-400/60'
                            : 'bg-rose-500 text-white shadow-rose-900/50 ring-1 ring-rose-400/60'
                        }`}
                        style={{
                          width: `${tb.sizePx}px`,
                          height: `${tb.sizePx}px`,
                          minWidth: `${tb.sizePx}px`,
                          minHeight: `${tb.sizePx}px`,
                          fontSize: tb.sizePx >= 28 ? '8.5px' : '7.5px',
                        }}
                      >
                        <span className="truncate px-0.5 select-none font-bold">
                          {formatCompactWholeBubble(tb.volumeUsd)}
                        </span>
                      </div>

                      {/* ONLY THE PRICE (ЦІНА) */}
                      <span
                        className={`font-mono font-bold text-[10px] sm:text-[11px] shrink-0 text-right ml-auto select-all ${
                          isBuy ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        ${formatDomPrice(tb.price, baseTickSize)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* Collapsed Tape Strip */
          <div
            onClick={handleToggleTape}
            className="w-7 shrink-0 h-full relative z-10 flex flex-col items-center justify-between py-2 border-r border-slate-900/70 bg-[#070a10]/95 hover:bg-slate-900/90 cursor-pointer transition-colors group select-none"
            title="Розгорнути стрічку угод"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleTape();
              }}
              className="p-1 rounded text-cyan-400 group-hover:text-cyan-300 hover:bg-slate-800 transition-colors"
              title="Розгорнути стрічку"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div className="flex flex-col items-center gap-1.5 my-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span
                className="text-[9px] font-bold text-slate-400 group-hover:text-cyan-300 uppercase tracking-widest"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                Стрічка
              </span>
            </div>
            <span className="text-[10px] text-slate-500 group-hover:text-cyan-400 font-bold">»</span>
          </div>
        )}

        {/* 3. RIGHT SECTION: Order Book ("Стакан") - Dynamically stretches to 100% of chart width */}
        <div
          ref={domScrollContainerRef}
          className="flex-1 min-w-[96px] sm:min-w-[170px] w-0 h-full overflow-y-auto no-scrollbar relative flex flex-col bg-[#090d16]/40 touch-pan-y"
          style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}
        >
          {/* Header columns: Об'єм (ліворуч) | Ціна (праворуч, always visible) */}
          <div className="sticky top-0 z-20 flex items-center justify-between px-2 sm:px-2.5 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800/80 shrink-0 bg-slate-950/95 backdrop-blur-sm">
            <span className="flex items-center gap-1 min-w-0 truncate">
              <span>Об'єм</span>
              <span className="text-cyan-400/80 font-mono text-[8px]">({aggregatedAsks.length + aggregatedBids.length})</span>
            </span>
            <span className="shrink-0 text-right pl-1 text-slate-300">Ціна</span>
          </div>

          {/* Rows container */}
          <div className="flex flex-col py-1">
            {/* ASKS (TOP, Shorts) */}
            <div className="flex flex-col justify-end">
              {aggregatedAsks.map((row) => {
                const fillPct = Math.min(100, Math.max(3, (row.volumeUsd / maxVolumeUsd) * 100));
                const isDensity = row.isDensity;

                return (
                  <div
                    key={`ask-${row.price}`}
                    data-dom-side="ask" data-dom-price={row.price} data-dom-volume-usd={row.volumeUsd}
                    className={`relative flex items-center justify-between px-2 sm:px-2.5 h-[21px] transition-colors group cursor-crosshair ${
                      isDensity
                        ? 'bg-rose-950/70 border-y border-amber-400 shadow-sm shadow-amber-950/50'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    {/* Dark Crimson Red Horizontal Volume Bar */}
                    <div
                      className={`absolute left-0 top-0 bottom-0 pointer-events-none transition-all duration-150 ${
                        isDensity ? 'bg-gradient-to-r from-amber-600/70 to-rose-700/80' : 'bg-rose-900/60'
                      }`}
                      style={{ width: `${fillPct}%` }}
                    />

                    {/* Volume text on Left */}
                    <div className="relative z-10 flex items-center gap-1 min-w-0 pr-1 overflow-hidden">
                      <span className="font-mono text-white text-[9px] sm:text-[11px] font-medium truncate">
                        {formatVolume(row.volumeUsd)}
                      </span>
                      {isDensity && (
                        <span className="text-[7.5px] sm:text-[8px] font-bold px-1 py-0.2 rounded bg-amber-500 text-slate-950 uppercase tracking-tighter shrink-0">
                          Плотн
                        </span>
                      )}
                    </div>

                    {/* Price text on Right - ALWAYS VISIBLE ON ANY DEVICE */}
                    <span className="relative z-10 font-mono font-bold text-rose-400 text-[9px] sm:text-[11.5px] shrink-0 text-right pl-0.5 sm:pl-1.5 ml-auto select-all">
                      {formatDomPrice(row.price, baseTickSize)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* SPREAD AREA: Seamless flow with NO borders, NO boxes */}
            <div
              ref={spreadRowRef}
              className="flex items-center justify-between px-2 sm:px-2.5 h-[16px] bg-slate-900/60 text-slate-400 font-mono text-[9.5px] my-[1px] shrink-0"
            >
              <div className="flex items-center gap-1.5 min-w-0 truncate">
               
                <span className="text-[8.5px] sm:text-[9px] text-slate-500 hidden xs:inline">({spreadPct.toFixed(2)}%)</span>
              </div>
              <span className="text-cyan-400 font-bold text-[11px] sm:text-[12px] shrink-0 text-right pl-1.5 ml-auto">
                {formatDomPrice(livePrice, baseTickSize)}
              </span>
            </div>

            {/* BIDS (BOTTOM, Longs) */}
            <div className="flex flex-col justify-start">
              {aggregatedBids.map((row) => {
                const fillPct = Math.min(100, Math.max(3, (row.volumeUsd / maxVolumeUsd) * 100));
                const isDensity = row.isDensity;

                return (
                  <div
                    key={`bid-${row.price}`}
                    data-dom-side="bid" data-dom-price={row.price} data-dom-volume-usd={row.volumeUsd}
                    className={`relative flex items-center justify-between px-2 sm:px-2.5 h-[21px] transition-colors group cursor-crosshair ${
                      isDensity
                        ? 'bg-emerald-950/70 border-y border-amber-400 shadow-sm shadow-amber-950/50'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    {/* Dark Green Horizontal Volume Bar */}
                    <div
                      className={`absolute left-0 top-0 bottom-0 pointer-events-none transition-all duration-150 ${
                        isDensity ? 'bg-gradient-to-r from-amber-600/70 to-emerald-700/80' : 'bg-emerald-900/60'
                      }`}
                      style={{ width: `${fillPct}%` }}
                    />

                    {/* Volume text on Left */}
                    <div className="relative z-10 flex items-center gap-1 min-w-0 pr-1 overflow-hidden">
                      <span className="font-mono text-white text-[9px] sm:text-[11px] font-medium truncate">
                        {formatVolume(row.volumeUsd)}
                      </span>
                      {isDensity && (
                        <span className="text-[7.5px] sm:text-[8px] font-bold px-1 py-0.2 rounded bg-amber-500 text-slate-950 uppercase tracking-tighter shrink-0">
                          Плотн
                        </span>
                      )}
                    </div>

                    {/* Price text on Right - ALWAYS VISIBLE ON ANY DEVICE */}
                    <span className="relative z-10 font-mono font-bold text-emerald-400 text-[9px] sm:text-[11.5px] shrink-0 text-right pl-0.5 sm:pl-1.5 ml-auto select-all">
                      {formatDomPrice(row.price, baseTickSize)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

