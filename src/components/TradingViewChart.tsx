import { normalizeExchangeSymbol } from '../utils/marketSymbols';
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  createChart,
  CandlestickSeries,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  Time,
  LineStyle,
  IPriceLine,
  CrosshairMode,
} from 'lightweight-charts';
import {
  Maximize2,
  ZoomIn,
  Activity,
  Clock,
  Expand,
  CheckCircle2,
  BarChart3,
  Target,
  ChevronUp,
} from 'lucide-react';
import { FormationArchiveIcon } from './FormationArchiveIcon';
import { Kline, DetectedFormation, Timeframe, ExchangeId, MarketType, ChartMarkerInfo, ChartRestoreParams } from '../types';
import { getChartPriceFormat, formatCryptoPrice } from '../utils/formatters';
import { fetchSharedHistoricalKlines } from '../utils/sharedHistoricalKlines';
import { terminalChartUiIntervalMs } from '../utils/terminalChartRefresh';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { interpolate, translatePhrase } from '../locales';
import { localizeFormationRuntime } from '../utils/localizeFormationRuntime';
import { useChartProvider } from '../utils/useChartProvider';
import { coalesceNecklinePriceMarkers, defaultFormationNecklineVisible, filterFormationNeckline, filterVisibleTradeMarkers, formationChartMarkers, hasCompleteTradeLevelSet, hasFormationNeckline, isOlderLiveCandle, mergeLiveCandle, mergeLiveChartHistory, mergeMissingExchangeKlines, toggleCombinedTradeLevels, withCalculatedNecklineMarker, withNewerTradePrice } from '../utils/hookchartData';
import { CHART_NECKLINE_VISIBILITY_EVENT, chartNecklineScopeKey, chartNecklineStorageKey, readChartNecklineOverride, saveChartNecklineOverride } from '../utils/chartNecklineVisibility';
import { CHART_TRADE_LEVELS_EVENT, chartTradeLevelStorageKey, normalizeChartTradeLevelVisibility, readChartTradeLevels, saveChartTradeLevels, type ChartTradeLevelVisibility } from '../utils/chartTradeLevelPreferences';
import { HookChart } from './HookChart';
import type { TerminalToolbarVisibility } from './hookchart/HookChartCanvas';
import type { ArchiveChartCapture } from '../utils/archiveChartSnapshot';
import type { HookChartHandle } from './hookchart/engine';
import { subscribeSharedKlines } from './hookchart/sharedKlineStream';
import { subscribeMarketTrades } from './hookchart/marketTradeStream';
import { subscribeTerminalThirtySecondCandles } from './hookchart/terminalThirtySecondCandles';
import { fetchSharedLiveFallbackKline, shouldApplyLiveFallbackKline } from './hookchart/sharedLiveFallback';
import { createLiveCandlePublisher } from './hookchart/liveCandlePublisher';
import type { VisualChartProfile, VisualContextId } from './hookchart/visualProfiles';

interface TradingViewChartProps {
  klines: Kline[];
  formation?: DetectedFormation | null;
  symbol: string;
  timeframe: string;
  exchange?: ExchangeId;
  marketType?: MarketType;
  historyLimit?: number;
  /** Parent owns the scoped history request and retry controls. */
  historyManagedByParent?: boolean;
  onHistoryLimitChange?: (limit: number) => void;
  onTimeframeChange?: (timeframe: Timeframe) => void;
  onLivePriceUpdate?: (price: number) => void;
  /** Optional price under the chart crosshair, for an expanded Telegram alert form. */
  onCrosshairPriceChange?: (price: number) => void;
  /** Called at most once when a new candle starts; reuses the existing chart feed. */
  onClosedCandle?: (candle: Kline) => void;
  onOpenFullscreen?: () => void;
  onAddToArchive?: (capture: ArchiveChartCapture) => void;
  isArchived?: boolean;
  isSavingArchive?: boolean;
  customMarkers?: ChartMarkerInfo[];
  /** Provisional W/M levels are a chart preview, independent of saved TP/SL visibility. */
  previewMarkers?: boolean;
  /** Optional controller from early W/M's own prediction-level toolbar. */
  earlyNecklineToggle?: { visible: boolean; available: boolean; onToggle: () => void };
  /** Always render the native HookChart in fullscreen, regardless of legacy provider settings. */
  forceHookChart?: boolean;
  savedChartParams?: ChartRestoreParams;
  fullHeight?: boolean;
  showNavigationControls?: boolean;
  hideHeaderLiveIndicator?: boolean;
  hideHeaderFormationBadge?: boolean;
  hideSymbolAndPrice?: boolean;
  terminalMode?: boolean;
  /** Single-panel Terminal can use real 30s data without switching HookChart to grid mode. */
  terminalThirtySecondMode?: boolean;
  terminalAutoScale?: boolean;
  terminalEcoMode?: boolean;
  /** Visual-only refresh interval, does not change exchange subscriptions. */
  terminalRefreshMs?: number;
  terminalActiveCharts?: number;
  terminalInitialView?: VisualChartProfile;
  terminalFitAllRequest?: number;
  visualContext?: VisualContextId;
  /** Only the manually opened Screener grid-card HookChart, never other chart pages. */
  compactScreenerCard?: boolean;
  terminalToolbarVisibility?: TerminalToolbarVisibility;
  hookchartToolbarActions?: React.ReactNode;
  hookchartToolbarOverlays?: React.ReactNode;
  onLiveStatusChange?: (status: { isConnected: boolean; mode: 'ws' | 'rest' }) => void;
}

// Calculate remaining time until the active candle closes based on the timeframe
function calculateBarCloseCountdown(tf: string): { totalSeconds: number; formatted: string; isUrgent: boolean } {
  const now = Date.now();
  let durationMs: number;
  let nextCloseMs: number;

  switch (tf) {
    case '1m':
      durationMs = 60 * 1000;
      nextCloseMs = Math.ceil(now / durationMs) * durationMs;
      break;
    case '5m':
      durationMs = 5 * 60 * 1000;
      nextCloseMs = Math.ceil(now / durationMs) * durationMs;
      break;
    case '15m':
      durationMs = 15 * 60 * 1000;
      nextCloseMs = Math.ceil(now / durationMs) * durationMs;
      break;
    case '30m':
      durationMs = 30 * 60 * 1000;
      nextCloseMs = Math.ceil(now / durationMs) * durationMs;
      break;
    case '1h':
      durationMs = 60 * 60 * 1000;
      nextCloseMs = Math.ceil(now / durationMs) * durationMs;
      break;
    case '4h':
      durationMs = 4 * 60 * 60 * 1000;
      nextCloseMs = Math.ceil(now / durationMs) * durationMs;
      break;
    case '1d': {
      // Closes at UTC 00:00:00
      const d = new Date(now);
      const nextDayUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0);
      nextCloseMs = nextDayUtc;
      durationMs = 24 * 60 * 60 * 1000;
      break;
    }
    default:
      durationMs = 60 * 60 * 1000;
      nextCloseMs = Math.ceil(now / durationMs) * durationMs;
  }

  if (nextCloseMs <= now) {
    nextCloseMs += (durationMs || 60000);
  }

  const diffMs = Math.max(0, nextCloseMs - now);
  const totalSeconds = Math.floor(diffMs / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let formatted: string;
  if (hours > 0) {
    formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // Urgent threshold when closing is imminent (triggers ticking animation)
  let urgentThreshold = 30;
  if (tf === '1m') urgentThreshold = 15;
  else if (tf === '5m') urgentThreshold = 30;
  else if (tf === '15m') urgentThreshold = 45;
  else if (tf === '1h') urgentThreshold = 90;
  else if (tf === '4h' || tf === '1d') urgentThreshold = 180;

  const isUrgent = totalSeconds <= urgentThreshold;
  return { totalSeconds, formatted, isUrgent };
}

export function TradingViewChart(props: TradingViewChartProps) {
  const scope = [props.exchange ?? 'binance', props.marketType ?? 'futures', props.symbol, props.timeframe].join('|');
  return <ScopedTradingViewChart key={scope} {...props} />;
}

const ScopedTradingViewChart: React.FC<TradingViewChartProps> = ({
  klines,
  formation,
  symbol,
  timeframe,
  exchange = 'binance',
  marketType = 'futures',
  historyLimit = 1000,
  historyManagedByParent = false,
  onHistoryLimitChange,
  onTimeframeChange,
  onLivePriceUpdate,
  onCrosshairPriceChange,
  onClosedCandle,
  onOpenFullscreen,
  onAddToArchive,
  isArchived,
  isSavingArchive,
  customMarkers,
  previewMarkers = false,
  earlyNecklineToggle,
  forceHookChart = false,
  savedChartParams,
  fullHeight = false,
  showNavigationControls = true,
  hideHeaderLiveIndicator = false,
  hideHeaderFormationBadge = false,
  hideSymbolAndPrice = false,
  terminalMode = false,
  terminalThirtySecondMode = false,
  terminalAutoScale = false,
  terminalEcoMode = false,
  terminalRefreshMs = 0,
  terminalActiveCharts = 0,
  terminalInitialView,
  terminalFitAllRequest,
  visualContext = 'screenerQuick',
  compactScreenerCard = false,
  terminalToolbarVisibility,
  hookchartToolbarActions,
  hookchartToolbarOverlays,
  onLiveStatusChange,
}) => {
  const { user, profile, updateProfileData } = useAuth();
  const { language } = useLanguage();
  const tr = (source: string) => translatePhrase(language, source);
  const tp = (source: string, values: Record<string, string | number>) => interpolate(tr(source), values);
  const savedChartProvider = useChartProvider();
  const chartProvider = forceHookChart ? 'hookchart' : savedChartProvider;
  const terminalTradeCandles = timeframe === '30s' && (terminalMode || terminalThirtySecondMode);
  const hookChartRef = useRef<HookChartHandle | null>(null);
  const onCrosshairPriceChangeRef = useRef(onCrosshairPriceChange);
  onCrosshairPriceChangeRef.current = onCrosshairPriceChange;
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const currentCandleRef = useRef<Kline | null>(klines.at(-1) ?? null);
  const latestPriceRef = useRef<number | null>(currentCandleRef.current?.close ?? null);
  const hasLiveCandleRef = useRef(false);
  const onClosedCandleRef = useRef(onClosedCandle);
  onClosedCandleRef.current = onClosedCandle;
  const lastNotifiedClosedRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  // ECO and user-selected slower rates use a trailing timeout. When trades
  // pause, the latest price still reaches the Terminal header.
  const ecoUiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUiModeRef = useRef<'ws' | 'rest'>('rest');
  useEffect(() => () => {
    if (ecoUiTimerRef.current !== null) clearTimeout(ecoUiTimerRef.current);
    ecoUiTimerRef.current = null;
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
  }, []);
  useEffect(() => {
    // A pending callback from the previous paint mode must never post a stale
    // price to the Terminal after the user flips ECO.
    if ((terminalEcoMode || terminalRefreshMs > 0) && rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (!terminalEcoMode && terminalRefreshMs === 0 && ecoUiTimerRef.current !== null) {
      clearTimeout(ecoUiTimerRef.current);
      ecoUiTimerRef.current = null;
    }
  }, [terminalEcoMode, terminalRefreshMs]);
  const pendingUiPriceRef = useRef<{ price: number; direction: 'up' | 'down' | 'neutral' } | null>(null);
  const lastUiUpdateTimestampRef = useRef<number>(0);
  const klinesLengthRef = useRef<number>(klines.length);
  const hasInitiallyCenteredRef = useRef<boolean>(false);

  // Real-time state
  const [currentPrice, setCurrentPrice] = useState<number | null>(() => {
    return klines.length > 0 ? klines[klines.length - 1].close : null;
  });
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'neutral'>('neutral');
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [liveMode, setLiveMode] = useState<'ws' | 'rest'>('rest');
  const [tickAnimation, setTickAnimation] = useState<boolean>(false);

  useEffect(() => {
    onLiveStatusChange?.({ isConnected: isLiveConnected, mode: liveMode });
  }, [isLiveConnected, liveMode, onLiveStatusChange]);
  // A single, account-scoped choice governs Entry, TP and SL on all charts.
  // Profiles remain authoritative for signed-in users; local storage covers guests.
  const initialTradeLevels = readChartTradeLevels(user?.uid, profile?.chartLabelSettings);
  const [showEntryLevel, setShowEntryLevel] = useState<boolean>(initialTradeLevels.entry);
  const [showTargetLevel, setShowTargetLevel] = useState<boolean>(initialTradeLevels.target);
  const [showStopLevel, setShowStopLevel] = useState<boolean>(initialTradeLevels.stop);

  useEffect(() => {
    const restored = readChartTradeLevels(user?.uid, profile?.chartLabelSettings);
    setShowEntryLevel(restored.entry);
    setShowTargetLevel(restored.target);
    setShowStopLevel(restored.stop);
  }, [user?.uid, profile?.chartLabelSettings?.entry, profile?.chartLabelSettings?.target, profile?.chartLabelSettings?.stop]);

  // A page may render multiple HookCharts at once. Keep their buttons and
  // plotted levels in sync immediately, before the remote profile write returns.
  useEffect(() => {
    const accountKey = user?.uid || 'guest';
    const apply = (levels: ChartTradeLevelVisibility) => {
      setShowEntryLevel(levels.entry);
      setShowTargetLevel(levels.target);
      setShowStopLevel(levels.stop);
    };
    const onSharedChange = (event: Event) => {
      const detail = (event as CustomEvent<{ accountKey: string; levels: ChartTradeLevelVisibility }>).detail;
      if (!detail || detail.accountKey !== accountKey) return;
      const levels = normalizeChartTradeLevelVisibility(detail.levels);
      if (levels) apply(levels);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== chartTradeLevelStorageKey(user?.uid) || !event.newValue) return;
      try {
        const levels = normalizeChartTradeLevelVisibility(JSON.parse(event.newValue));
        if (levels) apply(levels);
      } catch {}
    };
    window.addEventListener(CHART_TRADE_LEVELS_EVENT, onSharedChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHART_TRADE_LEVELS_EVENT, onSharedChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [user?.uid]);

  const applyTradeLevels = useCallback((levels: ChartTradeLevelVisibility) => {
    setShowEntryLevel(levels.entry);
    setShowTargetLevel(levels.target);
    setShowStopLevel(levels.stop);
    saveChartTradeLevels(user?.uid, levels);
    window.dispatchEvent(new CustomEvent(CHART_TRADE_LEVELS_EVENT, {
      detail: { accountKey: user?.uid || 'guest', levels },
    }));
    if (user) {
      void updateProfileData({ chartLabelSettings: levels })
        .catch(error => console.error('Не вдалося зберегти TP/SL у профілі', error));
    }
  }, [user?.uid, updateProfileData]);

  // Bar Close Countdown state
  const [barCountdown, setBarCountdown] = useState<{ totalSeconds: number; formatted: string; isUrgent: boolean }>(() =>
    calculateBarCloseCountdown(timeframe)
  );
  const [tickPulse, setTickPulse] = useState<boolean>(false);

  useEffect(() => {
    // HookChart has its own shared clock. This legacy countdown is never
    // rendered for HookChart and used to cause one redundant interval and
    // two React state updates per second per Terminal chart.
    if (chartProvider === 'hookchart') return;
    const updateCountdown = () => {
      const countdown = calculateBarCloseCountdown(timeframe);
      setBarCountdown(countdown);
      if (countdown.isUrgent) {
        setTickPulse((prev) => !prev);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [timeframe, chartProvider]);

  const [effectiveKlines, setEffectiveKlines] = useState<Kline[]>(klines);
  // This component remounts per instrument/timeframe. A live candle does not
  // mean that the initial historical batch has been received.
  const [initialHistoryLoaded, setInitialHistoryLoaded] = useState(klines.length > 1);
  const [liveCandles] = useState(() => createLiveCandlePublisher((latest, completed) => {
    setEffectiveKlines(previous => mergeLiveCandle(
      completed ? mergeLiveCandle(previous, completed) : previous, latest,
    ));
  }));
  useEffect(() => () => liveCandles.clear(), [liveCandles, chartProvider]);

  const hasParentHistory = klines.length > 1 || (historyManagedByParent && klines.length > 0);
  const gapRecoveryReadyRef = useRef(false);
  gapRecoveryReadyRef.current = hasParentHistory || initialHistoryLoaded;
  const gapRecoveryRef = useRef({ pending: false, attemptedAt: 0 });
  const recoverKlineGap = useCallback((from: number, to: number) => {
    const seconds = ({
      '1m': 60, '5m': 300, '15m': 900,
      '1h': 3600, '4h': 14400, '1d': 86400,
    } as Record<string, number>)[timeframe];
    if (!seconds || !gapRecoveryReadyRef.current || to - from <= seconds ||
        document.visibilityState === 'hidden') return;
    // Do not issue a request for every chart or every tick. Only a new,
    // measurable missing-bar gap can trigger one small, shared history page.
    const state = gapRecoveryRef.current;
    const now = Date.now();
    if (state.pending || now - state.attemptedAt < 60_000) return;
    const missing = Math.ceil((to - from) / seconds) - 1;
    if (missing > 96) return; // Large offline periods need a fresh full history load.
    state.pending = true;
    state.attemptedAt = now;
    const limit = Math.min(120, Math.max(24, missing + 8));
    void fetchSharedHistoricalKlines({
      exchange, marketType, symbol, timeframe: timeframe as Timeframe, limit,
      // A gap-specific history cursor bypasses a possibly stale "latest"
      // snapshot while still allowing short browser/server request coalescing.
      endTime: to * 1000,
    }).then(rows => {
      // The newest live candle remains authoritative; only insert missing
      // verified bars strictly between the two observed timestamps.
      if (rows.length) setEffectiveKlines(current =>
        mergeMissingExchangeKlines(current, rows, from, to));
    }).catch(() => {
      // Missing data is safer than inventing OHLC during an exchange outage.
    }).finally(() => { state.pending = false; });
  }, [exchange, marketType, symbol, timeframe]);
  const receiveHistory = useCallback((rows: Kline[]) => {
    const last = rows.at(-1);
    if (!last) return;
    const live = hasLiveCandleRef.current ? currentCandleRef.current : null;
    if (!live || isOlderLiveCandle(live, last)) {
      currentCandleRef.current = last;
      latestPriceRef.current = last.close;
    }
    // Queue any buffered candle before merging. Never restore the ingress
    // refs from a React commit, which may be older than a just-received tick.
    liveCandles.flush();
    setEffectiveKlines(previous => live
      ? mergeLiveChartHistory(rows, mergeLiveCandle(previous, live))
      : rows);
  }, [liveCandles]);

  useEffect(() => {
    if (hasParentHistory) receiveHistory(klines);
  }, [klines, hasParentHistory, receiveHistory]);

  // A few fast WebSocket bars do not replace the initial history request.
  useEffect(() => {
    // 30s does not exist on the exchange Kline REST endpoints. Use real trades,
    // not a fabricated split of each 1m candle or a silent 1h fallback.
    if (terminalTradeCandles || historyManagedByParent || hasParentHistory) return;
    let isCancelled = false;

    async function loadFullHistory() {
      try {
        const rows = await fetchSharedHistoricalKlines({
          exchange, marketType, symbol, timeframe: timeframe as Timeframe,
          limit: historyLimit || 1000,
        });
        if (!isCancelled && rows.length > 0) {
          receiveHistory(rows);
          setInitialHistoryLoaded(true);
        }
      } catch {
        // Do not mislabel an unavailable history as real candles. The shared
        // loader already attempts the public exchange fallback.
      }
    }

    loadFullHistory();

    return () => {
      isCancelled = true;
    };
  }, [symbol, timeframe, exchange, marketType, historyLimit, historyManagedByParent, hasParentHistory, terminalTradeCandles, receiveHistory]);

  // Terminal-only 30s OHLCV uses the deduplicated market trade stream.
  // Keep accumulating every exchange trade, but obey the user's Terminal
  // refresh/ECO preference for React paints. A new preference does not
  // reconnect the exchange WebSocket; buffered OHLCV remains authoritative.
  const terminalThirtySecondPriceRef = useRef(onLivePriceUpdate);
  terminalThirtySecondPriceRef.current = onLivePriceUpdate;
  const terminalThirtySecondUiMsRef = useRef(0);
  terminalThirtySecondUiMsRef.current = terminalChartUiIntervalMs(
    terminalRefreshMs, terminalEcoMode, terminalActiveCharts,
  );
  useEffect(() => {
    if (!terminalTradeCandles) return;
    let disposed = false;
    let pending: Kline[] | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRenderedAt = 0;
    const flush = () => {
      if (disposed || !pending) return;
      const rows = pending;
      pending = null;
      lastRenderedAt = Date.now();
      setEffectiveKlines(rows);
      const last = rows[rows.length - 1];
      if (last) terminalThirtySecondPriceRef.current?.(last.close);
      // Status comes from the shared exchange WebSocket, not candle-open time.
      // Quiet but connected markets must not be labelled offline.
    };
    const unsubscribe = subscribeTerminalThirtySecondCandles(
      { exchange, marketType, symbol: normalizeExchangeSymbol(symbol) },
      rows => {
        if (disposed) return;
        // An integrity loss must clear displayed candles without a 5s wait.
        if (!rows.length) {
          if (timer !== null) clearTimeout(timer);
          timer = null;
          pending = rows;
          flush();
          return;
        }
        pending = rows;
        const remaining = lastRenderedAt + terminalThirtySecondUiMsRef.current - Date.now();
        if (remaining <= 0) {
          if (timer !== null) clearTimeout(timer);
          timer = null;
          flush();
        } else if (timer === null) {
          timer = setTimeout(() => {
            timer = null;
            flush();
          }, remaining);
        }
      },
      connected => {
        if (disposed) return;
        setIsLiveConnected(connected);
        if (connected) setLiveMode('ws');
      },
    );
    return () => {
      disposed = true;
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
      pending = null;
    };
  }, [terminalTradeCandles, exchange, marketType, symbol]);

  useEffect(() => {
    klinesLengthRef.current = effectiveKlines.length;
    const last = effectiveKlines.at(-1);
    if (last && showNavigationControls && !hideSymbolAndPrice) {
      setCurrentPrice(previous => previous ?? last.close);
    }
  }, [effectiveKlines, showNavigationControls, hideSymbolAndPrice]);

  // For ordinary patterns the neckline is OFF by default. A real W/M neck
  // starts ON; only a deliberate user toggle overrides this automatic choice.
  // A local per-formation preference survives chart remounts and is isolated
  // by user, exchange, market, instrument, timeframe and formation identity.
  const necklineKey = chartNecklineStorageKey(user?.uid);
  const necklineScope = chartNecklineScopeKey({
    exchange, marketType, symbol, timeframe,
    formationId: formation?.id, patternKey: formation?.patternKey,
  });
  const [necklineRevision, refreshNeckline] = useState(0);
  const [localNecklineOverride, setLocalNecklineOverride] = useState<{
    key: string; scope: string; visible: boolean;
  } | null>(null);
  useEffect(() => {
    const onSharedChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; scope: string }>).detail;
      if (detail?.key === necklineKey && detail.scope === necklineScope) {
        setLocalNecklineOverride(null);
        refreshNeckline(value => value + 1);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === necklineKey) {
        setLocalNecklineOverride(null);
        refreshNeckline(value => value + 1);
      }
    };
    window.addEventListener(CHART_NECKLINE_VISIBILITY_EVENT, onSharedChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHART_NECKLINE_VISIBILITY_EVENT, onSharedChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [necklineKey, necklineScope]);
  const savedNecklineChoice = useMemo(
    () => readChartNecklineOverride(necklineKey, necklineScope),
    [necklineKey, necklineScope, necklineRevision],
  );
  const necklineOverride = localNecklineOverride?.key === necklineKey
    && localNecklineOverride.scope === necklineScope
    ? localNecklineOverride.visible : savedNecklineChoice;
  const showNeckline = necklineOverride ?? defaultFormationNecklineVisible(formation);
  const toggleNeckline = useCallback(() => {
    const next = !showNeckline;
    const saved = saveChartNecklineOverride(necklineKey, necklineScope, next);
    setLocalNecklineOverride(saved ? null : { key: necklineKey, scope: necklineScope, visible: next });
    if (saved) window.dispatchEvent(new CustomEvent(CHART_NECKLINE_VISIBILITY_EVENT, {
      detail: { key: necklineKey, scope: necklineScope },
    }));
    refreshNeckline(value => value + 1);
  }, [showNeckline, necklineKey, necklineScope]);

  // Early W/M preview has its own level visibility controls. Terminal's
  // selected standard formation also uses previewMarkers, so do not bypass
  // its neckline button merely because the other trade levels are previewed.
  const earlyPreviewOwnsNeckline = previewMarkers && !formation;
  const [earlyNecklineVisible, setEarlyNecklineVisible] = useState(true);
  const availableHookMarkers = useMemo(() => {
    const visibility = { entry: showEntryLevel, target: showTargetLevel, stop: showStopLevel };
    const markers = customMarkers?.length
      ? withCalculatedNecklineMarker(formation, customMarkers, timeframe as Timeframe)
      : formationChartMarkers(formation, visibility, timeframe as Timeframe);
    const displayed = previewMarkers ? markers : filterVisibleTradeMarkers(markers, visibility);
    return displayed.map(marker => ({ ...marker,
      label: marker.label ? localizeFormationRuntime(language, marker.label) : marker.label,
    }));
  }, [customMarkers, formation, showEntryLevel, showTargetLevel, showStopLevel, timeframe, previewMarkers, language]);
  const necklineAvailable = hasFormationNeckline(availableHookMarkers);
  const effectiveNecklineVisible = earlyPreviewOwnsNeckline
    ? (earlyNecklineToggle?.visible ?? earlyNecklineVisible) : showNeckline;
  const hookMarkers = useMemo(
    () => filterFormationNeckline(availableHookMarkers, effectiveNecklineVisible),
    [availableHookMarkers, effectiveNecklineVisible],
  );
  const necklineToolbarToggle = earlyPreviewOwnsNeckline
    ? (earlyNecklineToggle ?? { visible: earlyNecklineVisible, available: necklineAvailable,
        onToggle: () => setEarlyNecklineVisible(visible => !visible) })
    : { visible: showNeckline, available: necklineAvailable, onToggle: toggleNeckline };
  const hasTradeLevels = hasCompleteTradeLevelSet(formation, customMarkers);

  // Fit content helper
  const handleFitAll = useCallback(() => {
    if (chartProvider === 'hookchart') { hookChartRef.current?.fitContent(); return; }
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [chartProvider]);

  // Focus / Center on recent candles and latest price action
  const centerChartOnScreen = useCallback(() => {
    if (chartProvider === 'hookchart') { hookChartRef.current?.zoomToLatest(); return; }
    if (!chartRef.current || !candleSeriesRef.current || klinesLengthRef.current === 0) return;
    const total = klinesLengthRef.current;

    // Always focus on recent / latest candles where the current price and formation are active
    const visibleBars = Math.min(65, total);
    const rightPadding = Math.round(visibleBars * 0.35); // ~22 bars forward space
    chartRef.current.timeScale().setVisibleLogicalRange({
      from: Math.max(0, total - visibleBars),
      to: total + rightPadding,
    });

    // Auto-scale vertical price scale with comfortable margins for centered focus
    try {
      chartRef.current.priceScale('right').applyOptions({
        autoScale: true,
        scaleMargins: {
          top: 0.12,
          bottom: 0.12,
        },
      });
    } catch {
      // Ignored
    }
  }, [chartProvider]);

  // Zoom to recent candles
  const handleZoomRecent = useCallback(() => {
    if (chartProvider === 'hookchart') { hookChartRef.current?.zoomToLatest(); return; }
    if (chartRef.current && klinesLengthRef.current > 0) {
      const total = klinesLengthRef.current;
      const visible = Math.min(80, total);
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: total - visible,
        to: total + 4,
      });
    }
  }, [chartProvider]);

  const liveUiIntervalMs = terminalChartUiIntervalMs(terminalRefreshMs, terminalEcoMode, terminalActiveCharts);
  useEffect(() => {
    liveCandles.flush();
    lastUiUpdateTimestampRef.current = 0;
  }, [liveCandles, liveUiIntervalMs]);

  const handleLiveTick = useCallback(
    (candle: Kline, mode: 'ws' | 'rest') => {
      if (chartProvider !== 'hookchart' && !candleSeriesRef.current) return;
      const previousCandle = currentCandleRef.current;
      if (previousCandle && isOlderLiveCandle(candle, previousCandle)) return;
      const opensBar = !!previousCandle && candle.time > previousCandle.time;
      if (opensBar) recoverKlineGap(previousCandle.time, candle.time);
      if (opensBar && previousCandle.time !== lastNotifiedClosedRef.current) {
        lastNotifiedClosedRef.current = previousCandle.time;
        // A new exchange candle is the conservative, provider-independent
        // signal that the prior candle closed; do NOT emit on each trade tick.
        onClosedCandleRef.current?.(previousCandle);
      }
      hasLiveCandleRef.current = true;
      currentCandleRef.current = candle;
      if (chartProvider === 'hookchart') liveCandles.push(candle, liveUiIntervalMs, opensBar);

      try {
        if (klinesLengthRef.current > 0 && candleSeriesRef.current) {
          candleSeriesRef.current.update({
            time: candle.time as Time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          });
        }
      } catch {
        // Ignored
      }

      const prevPrice = latestPriceRef.current;
      latestPriceRef.current = candle.close;

      const direction: 'up' | 'down' | 'neutral' =
        prevPrice !== null
          ? candle.close > prevPrice
            ? 'up'
            : candle.close < prevPrice
            ? 'down'
            : 'neutral'
          : 'neutral';

      pendingUiPriceRef.current = { price: candle.close, direction };
      pendingUiModeRef.current = mode;

      const now = performance.now();
      if (now - lastUiUpdateTimestampRef.current >= liveUiIntervalMs) {
        if (ecoUiTimerRef.current !== null) {
          clearTimeout(ecoUiTimerRef.current);
          ecoUiTimerRef.current = null;
        }
        lastUiUpdateTimestampRef.current = now;
        const update = pendingUiPriceRef.current;
        if (update) {
          // Compact Terminal charts have no price badge. Updating its hidden
          // React state on every tick used to rerender the whole chart wrapper.
          if (showNavigationControls && !hideSymbolAndPrice) {
            setCurrentPrice(update.price);
            if (update.direction !== 'neutral') setPriceDirection(update.direction);
          }
          onLivePriceUpdate?.(update.price);
        }
        setIsLiveConnected(true);
        setLiveMode(mode);
      } else if (terminalEcoMode || terminalRefreshMs > 0) {
        if (ecoUiTimerRef.current === null) {
          const delay = Math.max(1, liveUiIntervalMs - (now - lastUiUpdateTimestampRef.current));
          ecoUiTimerRef.current = setTimeout(() => {
            ecoUiTimerRef.current = null;
            const update = pendingUiPriceRef.current;
            if (!update) return;
            lastUiUpdateTimestampRef.current = performance.now();
            if (showNavigationControls && !hideSymbolAndPrice) {
              setCurrentPrice(update.price);
              if (update.direction !== 'neutral') setPriceDirection(update.direction);
            }
            onLivePriceUpdate?.(update.price);
            setIsLiveConnected(true);
            setLiveMode(pendingUiModeRef.current);
          }, delay);
        }
      } else if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          const uNow = performance.now();
          if (uNow - lastUiUpdateTimestampRef.current >= liveUiIntervalMs && pendingUiPriceRef.current) {
            lastUiUpdateTimestampRef.current = uNow;
            const update = pendingUiPriceRef.current;
            if (showNavigationControls && !hideSymbolAndPrice) {
              setCurrentPrice(update.price);
              if (update.direction !== 'neutral') setPriceDirection(update.direction);
            }
            onLivePriceUpdate?.(update.price);
            setIsLiveConnected(true);
            setLiveMode(mode);
          }
        });
      }
    },
    [onLivePriceUpdate, chartProvider, showNavigationControls, hideSymbolAndPrice, liveCandles, liveUiIntervalMs, terminalEcoMode, terminalRefreshMs, recoverKlineGap]
  );

  // Initialize the selected renderer; both share the same exchange feeds.
  useEffect(() => {
    if (chartProvider === 'hookchart' || !chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      layout: {
        background: { color: '#090d16' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#64748b',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1e293b',
        },
        horzLine: {
          color: '#64748b',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1e293b',
        },
      },
      timeScale: {
        borderColor: 'rgba(51, 65, 85, 0.8)',
        timeVisible: true,
        secondsVisible: false,
        shiftVisibleRangeOnNewBar: true,
      },
      rightPriceScale: {
        borderColor: 'rgba(51, 65, 85, 0.8)',
        autoScale: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        alignLabels: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      kineticScroll: {
        touch: true,
        mouse: false,
      },
    });

    const removeTvLogo = () => {
      if (chartContainerRef.current) {
        const logo = chartContainerRef.current.querySelector('#tv-attr-logo');
        if (logo) {
          logo.remove();
        }
      }
    };
    removeTvLogo();
    const logoObserver = new MutationObserver(() => {
      removeTvLogo();
    });
    if (chartContainerRef.current) {
      logoObserver.observe(chartContainerRef.current, { childList: true, subtree: true });
    }

    const initialPrice = klines[klines.length - 1]?.close || formation?.levels.entryPrice || 1;
    const initialPriceFormat = getChartPriceFormat(initialPrice);

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      priceFormat: initialPriceFormat,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    const handleCrosshairMove = (param: { point?: { x: number; y: number } }) => {
      if (!param.point || !onCrosshairPriceChangeRef.current) return;
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price !== null && Number.isFinite(price) && price > 0) {
        onCrosshairPriceChangeRef.current(price);
      }
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    let resizeTimer: any;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (chartRef.current && chartContainerRef.current) {
          const width = chartContainerRef.current.clientWidth;
          const height = chartContainerRef.current.clientHeight;
          if (width > 0 && height > 0) {
            chartRef.current.resize(width, height);
          }
        }
      }, 50);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      clearTimeout(resizeTimer);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      resizeObserver.disconnect();
      logoObserver.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      priceLinesRef.current = [];
      hasInitiallyCenteredRef.current = false;
    };
  }, [chartProvider]);

  // Update data and price lines when klines change
  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current || !effectiveKlines.length) return;

    const refPrice = effectiveKlines[effectiveKlines.length - 1]?.close || formation?.levels.entryPrice || 1;
    const priceFormatConfig = getChartPriceFormat(refPrice);
    candleSeriesRef.current.applyOptions({
      priceFormat: priceFormatConfig,
    });

    const chartData: CandlestickData<Time>[] = effectiveKlines.map((k) => ({
      time: k.time as Time,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
    }));

    const uniqueSortedData = chartData
      .filter((item, index, self) => index === self.findIndex((t) => t.time === item.time))
      .sort((a, b) => (a.time as number) - (b.time as number));

    candleSeriesRef.current.setData(uniqueSortedData);

    // Initial positioning: auto-focus to center of chart strictly ONCE upon entering page (or restore saved range)
    const totalBars = uniqueSortedData.length;
    if (savedChartParams?.visibleRange && totalBars > 0) {
      chartRef.current.timeScale().setVisibleLogicalRange(savedChartParams.visibleRange);
      hasInitiallyCenteredRef.current = true;
    } else if (totalBars > 0 && !hasInitiallyCenteredRef.current) {
      hasInitiallyCenteredRef.current = true;
      centerChartOnScreen();
      requestAnimationFrame(() => {
        centerChartOnScreen();
      });
    }

    // Remove existing price lines
    priceLinesRef.current.forEach((pl) => {
      try {
        candleSeriesRef.current?.removePriceLine(pl);
      } catch {
        // Ignored
      }
    });
    priceLinesRef.current = [];

    // Draw custom markers if passed from archive
    if (Array.isArray(customMarkers) && customMarkers.length > 0 && candleSeriesRef.current) {
      // Respect the shared TP/SL visibility state for saved/archive markers, too.
      coalesceNecklinePriceMarkers(hookMarkers).forEach((marker) => {
        let style = LineStyle.Solid;
        if (marker.lineStyle === 'dashed') style = LineStyle.Dashed;
        else if (marker.lineStyle === 'dotted') style = LineStyle.Dotted;

        const line = candleSeriesRef.current?.createPriceLine({
          price: marker.price,
          color: marker.color,
          lineWidth: (marker.lineWidth as any) || 2,
          lineStyle: style,
          axisLabelVisible: true,
          title: marker.label ? localizeFormationRuntime(language, marker.label) : '',
        });
        if (line) {
          priceLinesRef.current.push(line);
        }
      });
    } else if (formation && candleSeriesRef.current) {
      // Draw formation price levels if available
      if (showEntryLevel && formation.levels.entryPrice
        && !(showNeckline && formation.levels.entryPrice === formation.levels.necklinePrice)) {
        const line = candleSeriesRef.current.createPriceLine({
          price: formation.levels.entryPrice,
          color: '#38bdf8',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: tr('Вхід'),
        });
        priceLinesRef.current.push(line);
      }

      if (showTargetLevel && formation.levels.targetPrice
        && !(showNeckline && formation.levels.targetPrice === formation.levels.necklinePrice)) {
        const line = candleSeriesRef.current.createPriceLine({
          price: formation.levels.targetPrice,
          color: '#10b981',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: tr('Ціль'),
        });
        priceLinesRef.current.push(line);
      }

      if (showStopLevel && formation.levels.stopLossPrice
        && !(showNeckline && formation.levels.stopLossPrice === formation.levels.necklinePrice)) {
        const line = candleSeriesRef.current.createPriceLine({
          price: formation.levels.stopLossPrice,
          color: '#ef4444',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: tr('Стоп'),
        });
        priceLinesRef.current.push(line);
      }

      if (showNeckline && typeof formation.levels.necklinePrice === 'number'
        && Number.isFinite(formation.levels.necklinePrice)
        && formation.levels.necklinePrice > 0) {
        const line = candleSeriesRef.current.createPriceLine({
          price: formation.levels.necklinePrice,
          color: '#f59e0b',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: '',
        });
        priceLinesRef.current.push(line);
      }

      if (
        formation.levels.resistancePrice &&
        Math.abs(formation.levels.resistancePrice - formation.levels.entryPrice) > 0.0001 &&
        Math.abs(formation.levels.resistancePrice - formation.levels.targetPrice) > 0.0001 &&
        (!formation.levels.necklinePrice || Math.abs(formation.levels.resistancePrice - formation.levels.necklinePrice) > 0.0001)
      ) {
        const line = candleSeriesRef.current.createPriceLine({
          price: formation.levels.resistancePrice,
          color: '#f59e0b',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: '',
        });
        priceLinesRef.current.push(line);
      }

      if (
        formation.levels.supportPrice &&
        Math.abs(formation.levels.supportPrice - formation.levels.stopLossPrice) > 0.0001 &&
        Math.abs(formation.levels.supportPrice - formation.levels.entryPrice) > 0.0001
      ) {
        const line = candleSeriesRef.current.createPriceLine({
          price: formation.levels.supportPrice,
          color: '#a855f7',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: '',
        });
        priceLinesRef.current.push(line);
      }
    }
  }, [effectiveKlines, formation, customMarkers, hookMarkers, showNeckline, showEntryLevel, showTargetLevel, showStopLevel, savedChartParams, chartProvider, previewMarkers, language]);

  // Shared ordering clock survives ECO toggles without restarting the kline WS.
  const liveStreamClockRef = useRef({ lastExchangePriceAt: 0, lastStreamTickReceivedAt: 0 });
  const liveTickHandlerRef = useRef(handleLiveTick);
  liveTickHandlerRef.current = handleLiveTick;

  // Live mode only: ReplayChart is a separate historical renderer and NEVER
  // subscribes to these public-market streams. A browser tab shares one
  // exchange kline feed per instrument/TF and one trade feed per instrument.
  useEffect(() => {
    if (terminalTradeCandles) return;
    let disposed = false;
    let wsConnected = false;
    const streamClock = { lastExchangePriceAt: 0, lastStreamTickReceivedAt: 0 };
    liveStreamClockRef.current = streamClock;
    let lastKlineReceivedAt = 0;
    let polling = false;
    let fallbackFailures = 0;
    let nextFallbackAt = Date.now() + 2000 + Math.floor(Math.random() * 1000);
    const cleanSymbol = normalizeExchangeSymbol(symbol);

    const stopKlines = subscribeSharedKlines(
      { exchange, marketType, symbol: cleanSymbol, timeframe },
      {
        onStatus: connected => {
          if (disposed) return;
          wsConnected = connected;
          setIsLiveConnected(connected);
          if (connected) { setLiveMode('ws'); fallbackFailures = 0; }
        },
        onCandle: candle => {
          if (disposed) return;
          const receivedAt = Date.now();
          lastKlineReceivedAt = receivedAt;
          const eventAt = Number(candle.eventTime) || receivedAt;
          const current = currentCandleRef.current;
          if (current && isOlderLiveCandle(candle, current)) return;
          streamClock.lastStreamTickReceivedAt = receivedAt;
          // Separate trade and kline sockets are not guaranteed to deliver in
          // global order. A slightly older kline still supplies authoritative
          // CUMULATIVE OHLCV, but must not undo a more recent trade price.
          const corrected = current && current.time === candle.time &&
            eventAt < streamClock.lastExchangePriceAt
            ? withNewerTradePrice(candle, current)
            : candle;
          if (!current || candle.time > current.time) streamClock.lastExchangePriceAt = eventAt;
          else streamClock.lastExchangePriceAt = Math.max(streamClock.lastExchangePriceAt, eventAt);
          liveTickHandlerRef.current(corrected, 'ws');
        },
      },
    );

    const runFastPoll = async () => {
      if (disposed || polling || document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (wsConnected && now - lastKlineReceivedAt < 5000) return;
      if (now < nextFallbackAt) return;
      // Exponential backoff + jitter prevents reconnect storms hitting VPS.
      const wait = wsConnected ? 30_000 :
        Math.min(20_000, 4000 * 2 ** Math.min(4, fallbackFailures));
      nextFallbackAt = now + wait + Math.floor(Math.random() * 1500);
      polling = true;
      const requestStartedAt = Date.now();
      try {
        const latest = await fetchSharedLiveFallbackKline(exchange, marketType, cleanSymbol, timeframe);
        if (disposed) return;
        if (!latest) { fallbackFailures++; return; }
        const current = currentCandleRef.current;
        if (!shouldApplyLiveFallbackKline(latest, current, requestStartedAt, lastKlineReceivedAt, wsConnected)) return;
        // Even a successful REST fallback must back off while WS stays down;
        // otherwise an exchange outage creates a permanent 4s VPS poll storm.
        if (!wsConnected) fallbackFailures++;
        else fallbackFailures = 0;
        // A stale kline socket can coexist with a healthy trade socket. Fill
        // its volume gap while preserving a trade price received during HTTP.
        const corrected = current && latest.time === current.time &&
          streamClock.lastStreamTickReceivedAt >= requestStartedAt
          ? withNewerTradePrice(latest, current) : latest;
        liveTickHandlerRef.current(corrected, 'rest');
      } catch {
        fallbackFailures++;
      } finally {
        polling = false;
      }
    };
    const pollInterval = setInterval(() => void runFastPoll(), 2000);
    return () => {
      disposed = true;
      clearInterval(pollInterval);
      stopKlines();
    };
  }, [symbol, timeframe, exchange, marketType, terminalTradeCandles]);

  // ECO skips the additional per-trade subscription entirely. Exchange kline
  // candles, live REST fallback and close-candle signals remain connected.
  // Keeping this effect separate prevents ECO toggles from reconnecting the
  // shared kline socket across every chart in the Terminal grid.
  useEffect(() => {
    if (terminalEcoMode) return;
    if (terminalTradeCandles) return;
    let disposed = false;
    const streamClock = liveStreamClockRef.current;
    const cleanSymbol = normalizeExchangeSymbol(symbol);
    const intervalMs = ({
      '1m': 60_000, '5m': 300_000, '15m': 900_000,
      '1h': 3600_000, '4h': 14400_000, '1d': 86400_000,
    } as Record<string, number>)[timeframe] || 3600_000;
    const stopTrades = subscribeMarketTrades(
      { exchange, marketType, symbol: cleanSymbol },
      {
        // REST seed is for analytics/density history, never a live candle tick.
        liveOnly: true,
        wantsPrints: () => false,
        onPrints: () => {},
        onTrade: trade => {
          if (disposed || !Number.isFinite(trade.p) || trade.p <= 0) return;
          const current = currentCandleRef.current;
          if (!current || trade.t <= streamClock.lastExchangePriceAt ||
              trade.t < current.time * 1000 ||
              trade.t >= current.time * 1000 + intervalMs) return;
          streamClock.lastExchangePriceAt = trade.t;
          streamClock.lastStreamTickReceivedAt = Date.now();
          liveTickHandlerRef.current({
            ...current, close: trade.p,
            high: Math.max(current.high, trade.p),
            low: Math.min(current.low, trade.p),
            // The kline stream is the authoritative source of candle volume.
            // Adding aggregate trades here double-counted overlapping ticks.
            volume: current.volume,
          }, 'ws');
        },
      },
    );
    return () => { disposed = true; stopTrades(); };
  }, [symbol, timeframe, exchange, marketType, terminalEcoMode, terminalTradeCandles]);

  // One control always changes all three plotted levels together, regardless
  // of chart provider, page or fullscreen state.
  const combinedTradeLevels = {
    visible: showEntryLevel && showTargetLevel && showStopLevel,
    available: hasTradeLevels,
    onToggle: () => applyTradeLevels(toggleCombinedTradeLevels({
      entry: showEntryLevel, target: showTargetLevel, stop: showStopLevel,
    })),
  };

  // Construct this chart's own immutable archive snapshot on explicit click
  // only; never start extra chart streams or use an adjacent Terminal panel.
  const captureForArchive = () => {
    if (!onAddToArchive || isSavingArchive) return;
    const chartSnapshot = hookChartRef.current?.captureArchiveSnapshot?.() || undefined;
    const visibleMarkers = hookMarkers.filter(marker =>
      (marker.type !== 'support' && marker.type !== 'resistance')
      || chartSnapshot?.overlays.includes('sr') || chartSnapshot?.srMarkersVisible);
    const capturedPrice = effectiveKlines.at(-1)?.close || latestPriceRef.current;
    onAddToArchive({
      markers: visibleMarkers, chartSnapshot,
      ...(typeof capturedPrice === 'number' && Number.isFinite(capturedPrice) && capturedPrice > 0
        ? { capturedPrice } : {}),
    });
  };

  const chartActions = (onAddToArchive || onOpenFullscreen) ? (
    <>
      {onAddToArchive && (
        <button
          type="button"
          onClick={captureForArchive}
          disabled={isSavingArchive}
          className="chart-archive-action p-1 sm:p-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
          title={tr(isArchived ? 'Формацію збережено в архіві' : 'Додати монету та формацію в архів')}
          aria-label={tr(isArchived ? 'Формацію збережено в архіві' : 'Додати монету та формацію в архів')}
        >
          {isArchived ? <CheckCircle2 className="w-3.5 h-3.5" /> : <FormationArchiveIcon className={`w-3.5 h-3.5 ${isSavingArchive ? 'animate-pulse' : ''}`} />}
        </button>
      )}
      {onOpenFullscreen && (
        <button
          type="button"
          onClick={onOpenFullscreen}
          className="chart-fullscreen-action p-1 sm:p-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 transition-colors cursor-pointer shrink-0"
          title={tr("Відкрити повний графік")}
          aria-label={tr("Відкрити повний графік")}
        >
          <Expand className="w-3.5 h-3.5" />
        </button>
      )}
    </>
  ) : null;

  return (
    <div className={`relative w-full rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-xl flex flex-col ${fullHeight ? 'h-full flex-1 min-h-0' : ''}`}>
      {/* Top Header Bar */}
      {showNavigationControls && (!hideSymbolAndPrice || !hideHeaderLiveIndicator || (!hideHeaderFormationBadge && !!formation)) && (
        <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 bg-slate-900/95 border-b border-slate-800 text-xs z-10 shrink-0">
          {/* Left: Symbol, Live Price, Badges */}
          <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
            {!hideSymbolAndPrice && (
              <>
                <span data-no-translate className="font-bold text-slate-100 font-mono text-xs sm:text-sm tracking-wide">{symbol}</span>

                {/* Live Price Tag */}
                {currentPrice !== null && (
                  <div
                    className={`flex items-center gap-1 font-mono font-bold px-1.5 sm:px-2 py-0.5 rounded-lg border text-[11px] sm:text-xs transition-all duration-300 ${
                      tickAnimation
                        ? priceDirection === 'up'
                          ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500 scale-105 shadow-sm shadow-emerald-500/20'
                          : 'bg-rose-500/30 text-rose-300 border-rose-500 scale-105 shadow-sm shadow-rose-500/20'
                        : priceDirection === 'up'
                        ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                        : priceDirection === 'down'
                        ? 'bg-rose-950/60 text-rose-400 border-rose-800/60'
                        : 'bg-slate-800 text-slate-200 border-slate-700'
                    }`}
                  >
                    <span>${formatCryptoPrice(currentPrice)}</span>
                    {priceDirection === 'up' ? (
                      <span className="text-[9px] sm:text-[10px] text-emerald-400 font-extrabold">▲</span>
                    ) : priceDirection === 'down' ? (
                      <span className="text-[9px] sm:text-[10px] text-rose-400 font-extrabold">▼</span>
                    ) : null}
                  </div>
                )}
              </>
            )}

            {/* Live Stream Status Indicator */}
            {!hideHeaderLiveIndicator && (
              <div
                className={`flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 rounded-full border text-[10px] sm:text-[11px] font-mono font-medium ${
                  isLiveConnected
                    ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400'
                }`}
                title={tp('Оновлення в реальному часі ({{mode}})', { mode: liveMode.toUpperCase() })}
              >
                <span className="relative flex h-2 w-2">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      isLiveConnected ? 'bg-emerald-400' : 'bg-slate-400'
                    }`}
                  ></span>
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      isLiveConnected ? 'bg-emerald-500' : 'bg-slate-500'
                    }`}
                  ></span>
                </span>
                <span className="font-bold tracking-wider">
                  {liveMode === 'ws' ? '⚡' : '●'}
                </span>
              </div>
            )}

            {!hideHeaderFormationBadge && formation && (
              <span
                className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-medium truncate max-w-[130px] sm:max-w-none ${
                  formation.bias === 'bullish'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : formation.bias === 'bearish'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
                title={localizeFormationRuntime(language, formation.name)}
              >
                {localizeFormationRuntime(language, formation.name)}
              </span>
            )}
          </div>
        </div>
      )}

      {chartProvider !== 'hookchart' && (onTimeframeChange || formation || Boolean(customMarkers?.length)) && (
        <div className="chart-above-controls flex items-center justify-between gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 bg-slate-900/90 border-b border-slate-800/80 overflow-x-auto no-scrollbar flex-nowrap w-full">
          <div className="flex items-center gap-1 sm:gap-1.5 flex-nowrap shrink-0">
            {/* Timeframe selector directly above the chart */}
            {onTimeframeChange && <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs font-mono shrink-0">
              {(['1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map((option) => (
                <button
                  key={option}
                  onClick={() => onTimeframeChange(option)}
                  className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded transition-colors cursor-pointer text-[11px] sm:text-xs shrink-0 ${
                    timeframe === option ? 'bg-cyan-600 text-white font-bold shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>}

            {!previewMarkers && (formation || customMarkers?.length) ? (
              <button
                type="button"
                onClick={combinedTradeLevels.onToggle}
                disabled={!combinedTradeLevels.available}
                aria-pressed={combinedTradeLevels.visible}
                aria-label={tr(combinedTradeLevels.available ? (combinedTradeLevels.visible
                  ? 'Приховати рівні Вхід, TP і SL' : 'Показати рівні Вхід, TP і SL') : 'TP/SL: немає трьох розрахованих рівнів')}
                title={tr(combinedTradeLevels.available ? 'Увімкнути або вимкнути всі три рівні: Вхід, TP, SL' : 'Потрібні ціни входу, цілі та стопу')}
                className={`flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${combinedTradeLevels.visible
                  ? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-200'
                  : 'border-slate-700 bg-slate-800 text-slate-300'} disabled:cursor-not-allowed disabled:opacity-45`}
              >
                <Target className="h-3.5 w-3.5" aria-hidden="true" />
                <span>TP/SL</span>
              </button>
            ) : null}
          </div>

          {/* Right: View Controls */}
          <div className="flex items-center gap-1 sm:gap-1.5 text-slate-300 text-[10px] sm:text-[11px] flex-nowrap shrink-0 ml-auto">
            {/* TradingView-only history controls. Hookchart has its own navigation controls. */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={handleZoomRecent}
                  className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 text-[10px] sm:text-[11px] cursor-pointer active:scale-95 shrink-0 whitespace-nowrap"
                  title={tr("Наблизити до останніх свічок")}
                >
                  <ZoomIn className="w-3 h-3 text-cyan-400" />
                  <span className="hidden md:inline">{tr('Останні свічки')}</span>
                </button>

                <button
                  onClick={handleFitAll}
                  className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 text-[10px] sm:text-[11px] cursor-pointer active:scale-95 shrink-0 whitespace-nowrap"
                  title={tr("Вписати всю завантажену історію свічок")}
                >
                  <Maximize2 className="w-3 h-3 text-cyan-400" />
                  <span className="hidden md:inline">{tr('Вся історія')}</span>
                  <span className="font-mono text-[9px] sm:text-[10px] text-slate-400">({klines.length})</span>
                </button>
              </div>

            <div className="flex items-center gap-1 shrink-0">
              {chartActions}
            </div>
          </div>
        </div>
      )}

      {/* Chart Canvas */}
      <div
        className={`relative w-full overflow-hidden ${fullHeight ? "flex-1 min-h-0" : "h-[520px] xs:h-[540px] sm:h-[540px] md:h-[350px] lg:h-[390px] xl:h-[430px]"}`}
        style={{ contain: 'content' }}
      >
        {/* TradingView Chart Container */}
        {chartProvider === 'hookchart' ? <><HookChart ref={hookChartRef} klines={effectiveKlines}
          symbol={symbol} timeframe={timeframe} exchange={exchange} marketType={marketType}
          terminalMode={terminalMode} terminalAutoScale={terminalAutoScale}
          terminalHistoryReady={terminalTradeCandles || initialHistoryLoaded || klines.length > 1}
          terminalInitialView={terminalInitialView} terminalFitAllRequest={terminalFitAllRequest} visualContext={visualContext} compactScreenerCard={compactScreenerCard} terminalToolbarVisibility={terminalToolbarVisibility} terminalArchiveSave={onAddToArchive && (terminalMode || visualContext === 'terminalLarge') ? { onSave: captureForArchive, saving: !!isSavingArchive } : undefined} focusFormation={formation}
          terminalEcoMode={terminalEcoMode}
          markers={hookMarkers} expandPriceScaleToMarkers={previewMarkers} savedChartParams={savedChartParams} onTimeframeChange={onTimeframeChange}
          onCrosshairPriceChange={onCrosshairPriceChange}
          tradeLevelToggle={previewMarkers ? undefined : combinedTradeLevels}
          necklineToggle={necklineToolbarToggle}
          toolbarActions={hookchartToolbarActions} toolbarOverlays={hookchartToolbarOverlays}
          chartActions={showNavigationControls ? chartActions : null} />
          {terminalTradeCandles && effectiveKlines.length === 0 && (
            <div role="status" className="pointer-events-none absolute inset-x-4 top-12 z-20 rounded-lg border border-cyan-500/30 bg-slate-950/90 p-2 text-center text-xs text-cyan-200">
              {({
                uk: '30s · Накопичення реальних свічок із біржових угод. Перший неповний інтервал приховано.',
                en: '30s · Building real candles from exchange trades. The first partial interval is hidden.',
                pl: '30s · Tworzenie prawdziwych świec z transakcji giełdowych. Pierwszy niepełny interwał jest ukryty.',
                ru: '30s · Формирование реальных свечей из биржевых сделок. Первый неполный интервал скрыт.',
              } as Record<string, string>)[language] || '30s · Live trade candles are being collected.'}
            </div>
          )}</> : <div
          ref={chartContainerRef}
          className="w-full h-full relative"
          data-chart-provider="tradingview"
          style={{ willChange: 'transform', transform: 'translateZ(0)' }}
        />}

        {/* Right-bottom countdown to candle close */}
        {chartProvider !== 'hookchart' && <div className="absolute right-2.5 sm:right-3 bottom-2.5 sm:bottom-3 z-30 flex items-center gap-1.5 sm:gap-2 select-none pointer-events-auto">
          {/* Time to Bar Close Countdown with Ticking */}
          <div
            className={`flex items-center gap-1.5 px-1 py-0.5 text-xs font-mono font-bold select-none transition-all duration-300 ${
              barCountdown.isUrgent
                ? `text-rose-300 ${
                    tickPulse ? 'scale-105 opacity-100 text-rose-200' : 'scale-100 opacity-90'
                  }`
                : 'text-slate-200 hover:text-white'
            }`}
            title={tp('Час до закриття поточної {{timeframe}} свічки: {{remaining}}', { timeframe, remaining: barCountdown.formatted })}
          >
            <Clock
              className={`w-3.5 h-3.5 ${
                barCountdown.isUrgent
                  ? 'text-rose-400 animate-spin'
                  : 'text-cyan-400'
              }`}
              style={{ animationDuration: barCountdown.isUrgent ? '3s' : '10s' }}
            />

            <span
              className={`tracking-wider ${
                barCountdown.isUrgent
                  ? 'text-rose-300 font-extrabold text-[12px]'
                  : 'text-white'
              }`}
            >
              {barCountdown.formatted}
            </span>

            {barCountdown.isUrgent && (
              <span className="relative flex h-2 w-2 ml-0.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
            )}
          </div>
        </div>}
      </div>
    </div>
  );
};

