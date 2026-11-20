import { HookChart } from '../HookChart';
import type { HookChartHandle } from '../hookchart/engine';
import { useChartProvider } from '../../utils/useChartProvider';
import { replayChartMarkers } from '../../utils/hookchartData';
import { replayHistoryChange } from '../../utils/replayHistoryChange';
import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  Time,
  LineStyle,
  IPriceLine,
  CrosshairMode,
} from 'lightweight-charts';
import { Kline, Timeframe, ExchangeId, MarketType, ReplayPosition, ReplayPendingOrder } from '../../types';
import { getChartPriceFormat, formatCryptoPrice } from '../../utils/formatters';
import { Maximize2, Minimize2, RotateCcw, Camera, History } from 'lucide-react';
import { requestFullscreenSafe, exitFullscreenSafe, isCurrentlyFullscreen } from '../../utils/fullscreenUtils';
import { createPortal } from 'react-dom';
import { ReplaySpeedPicker } from './ReplaySpeedPicker';
import { ReplayFullscreenActions } from './ReplayFullscreenActions';
import { useLanguage } from '../../context/LanguageContext';
import { translateKey } from '../../locales';

export interface ReplayChartHandle {
  takeScreenshot: () => string | null;
  fitContent: () => void;
  zoomToLatest: () => void;
}

interface ReplayChartProps {
  visibleCandles: Kline[];
  symbol: string;
  timeframe: Timeframe;
  onTimeframeChange: (timeframe: Timeframe) => void;
  isLoadingHistoricalData?: boolean;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
  historyExpanded: boolean;
  isHistoryLoading: boolean;
  onToggleHistory: () => void;
  isPlaying: boolean;
  /** The last displayed candle is a reconstructed, not tick-recorded, live-looking bar. */
  isIntrabarPreview?: boolean;
  /** Actual verified 1s Binance history, pending fetch, or OHLC approximation. */
  intrabarSource?: 'seconds' | 'loading' | 'simulated';
  canAdvance: boolean;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onRandomHistoricalDate: () => void;
  exchange: ExchangeId;
  marketType: MarketType;
  position: ReplayPosition | null;
  pendingOrders: ReplayPendingOrder[];
  isReplaying: boolean;
  focusTrigger?: number;
  onTakeScreenshotNotification?: () => void;
}

export const ReplayChart = forwardRef<ReplayChartHandle, ReplayChartProps>(({
  visibleCandles,
  symbol,
  timeframe,
  onTimeframeChange,
  isLoadingHistoricalData = false,
  playbackSpeed,
  onSpeedChange,
  historyExpanded,
  isHistoryLoading,
  onToggleHistory,
  isPlaying,
  isIntrabarPreview = false,
  intrabarSource = 'simulated',
  canAdvance,
  onTogglePlay,
  onStepForward,
  onRandomHistoricalDate,
  exchange,
  marketType,
  position,
  pendingOrders,
  isReplaying,
  focusTrigger = 0,
  onTakeScreenshotNotification,
}, ref) => {
  const { language, t } = useLanguage();
  const chartProvider = useChartProvider();
  const hookChartRef = useRef<HookChartHandle | null>(null);
  const hookMarkers = useMemo(() => replayChartMarkers(position, pendingOrders).filter(marker => marker.id !== 'liquidation'), [position, pendingOrders]);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartContainer, setChartContainer] = useState<HTMLDivElement | null>(null);
  const bindChartContainer = useCallback((node: HTMLDivElement | null) => {
    chartContainerRef.current = node;
    setChartContainer(node);
  }, []);
  const visibleCandlesRef = useRef(visibleCandles);
  visibleCandlesRef.current = visibleCandles;
  const rendererScope = `${exchange}:${marketType}:${symbol}:${timeframe}`;
  const savedRangeRef = useRef<{ scope: string; range: { from: number; to: number } } | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const renderedHistoricalRows = useRef<{ scope: string; rows: readonly Kline[] } | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Same sizing as the Screener fullscreen chart: the surrounding block
  // controls layout; HookChart independently responds to its canvas size.
  const fullscreenRootRef = useRef<HTMLDivElement>(null);
  const nativeFullscreenRef = useRef(false);
  const inlineBlockHeightRef = useRef(540);

  // Price lines refs
  const entryLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);
  const tpLineRef = useRef<IPriceLine | null>(null);
  const pendingLinesRef = useRef<IPriceLine[]>([]);

  // Hovered or active candle state for tooltip
  const [activeCandle, setActiveCandle] = useState<Kline | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Like Screener fullscreen: always occupy the viewport, without resize handles.
  // Native fullscreen escapes transformed ancestors; the fixed overlay is a fallback.
  const closeFullscreen = useCallback(async () => {
    if (nativeFullscreenRef.current) {
      await exitFullscreenSafe();
      nativeFullscreenRef.current = false;
    }
    setIsFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (isFullscreen) {
      await closeFullscreen();
      return;
    }
    const root = fullscreenRootRef.current;
    if (!root) return;
    // Preserve the original space on the page when a mobile browser requires
    // the Screener-style body portal instead of native fullscreen.
    inlineBlockHeightRef.current = Math.round(root.getBoundingClientRect().height) || 540;
    nativeFullscreenRef.current = await requestFullscreenSafe(root);
    setIsFullscreen(true);
  }, [isFullscreen, closeFullscreen]);

  useEffect(() => {
    const onNativeFullscreenChange = () => {
      if (nativeFullscreenRef.current && !isCurrentlyFullscreen()) {
        nativeFullscreenRef.current = false;
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onNativeFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onNativeFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onNativeFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onNativeFullscreenChange);
    };
  }, []);

  // Follow the same body-level fullscreen modal behavior as Screener.
  // Do not reposition the body or apply VisualViewport offsets: on mobile
  // this previously pushed the chart down instead of centering the overlay.
  React.useLayoutEffect(() => {
    if (!isFullscreen) return;
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const savedX = window.scrollX;
    const savedY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !nativeFullscreenRef.current) {
        event.preventDefault();
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      if (!nativeFullscreenRef.current) window.scrollTo(savedX, savedY);
    };
  }, [isFullscreen]);

  const [isFocusedBadge, setIsFocusedBadge] = useState(false);

  // Helper to center/focus on candles with optimal spacing
  const focusOnCandles = useCallback((scrollIntoView = false) => {
    if (chartProvider === 'hookchart') { hookChartRef.current?.zoomToLatest(); return; }
    if (!chartRef.current || visibleCandles.length === 0) return;
    const total = visibleCandles.length;
    const visibleBars = Math.min(65, total);

    // Set visible logical range focused on recent cutoff candles + 16 bars of forward breathing room
    chartRef.current.timeScale().setVisibleLogicalRange({
      from: Math.max(0, total - visibleBars),
      to: total + 16,
    });

    if (scrollIntoView && chartContainerRef.current) {
      chartContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Flash a brief focus confirmation badge
    setIsFocusedBadge(true);
    setTimeout(() => setIsFocusedBadge(false), 2400);
  }, [visibleCandles.length, chartProvider]);

  // Capture canvas screenshot
  const captureScreenshot = useCallback((): string | null => {
    try {
      if (chartProvider === 'hookchart') return hookChartRef.current?.takeScreenshot() || null;
      if (chartRef.current) {
        // Lightweight-charts native screenshot
        const screenshotCanvas = chartRef.current.takeScreenshot();
        if (screenshotCanvas) {
          return screenshotCanvas.toDataURL('image/png');
        }
      }
      if (chartContainerRef.current) {
        const canvas = chartContainerRef.current.querySelector('canvas');
        if (canvas) {
          return canvas.toDataURL('image/png');
        }
      }
    } catch (e) {
      console.warn('Failed to capture screenshot:', e);
    }
    return null;
  }, [chartProvider]);

  useImperativeHandle(ref, () => ({
    takeScreenshot: captureScreenshot,
    fitContent: () => {
      if (chartProvider === 'hookchart') { hookChartRef.current?.fitContent(); return; }
      chartRef.current?.timeScale().fitContent();
    },
    zoomToLatest: () => {
      if (chartProvider === 'hookchart') { hookChartRef.current?.zoomToLatest(); return; }
      if (chartRef.current && visibleCandles.length > 0) {
        const total = visibleCandles.length;
        const visible = Math.min(80, total);
        chartRef.current.timeScale().setVisibleLogicalRange({
          from: total - visible,
          to: total + 4,
        });
      }
    },
  }), [captureScreenshot, visibleCandles.length, chartProvider]);

  // Fit all confirmed, already-visible past candles on History toggle.
  // Do not refit on each new replay step; the user may pan/zoom manually.
  useEffect(() => {
    if (!visibleCandles.length) return;
    const timeout = window.setTimeout(() => {
      if (historyExpanded) {
        if (chartProvider === 'hookchart') hookChartRef.current?.fitContent();
        else chartRef.current?.timeScale().fitContent();
      } else if (chartProvider === 'hookchart') hookChartRef.current?.zoomToLatest();
      else focusOnCandles();
    }, 35);
    return () => window.clearTimeout(timeout);
  // first candle changes only when old cached history is prepended or new date loads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyExpanded, visibleCandles[0]?.time, chartProvider, symbol, exchange, marketType, timeframe]);

  // Set latest candle as active candle when visible candles change
  useEffect(() => {
    if (visibleCandles.length > 0) {
      const latest = visibleCandles[visibleCandles.length - 1];
      setActiveCandle(latest);
    }
  }, [visibleCandles]);

  // Initialize the selected chart renderer.
  useEffect(() => {
    if (chartProvider === 'hookchart' || !chartContainer) return;

    chartContainer.innerHTML = '';

    const chart = createChart(chartContainer, {
      layout: {
        background: { color: '#090d16' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace, -apple-system, BlinkMacSystemFont',
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.45)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(30, 41, 59, 0.45)', style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#38bdf8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#0284c7',
        },
        horzLine: {
          color: '#38bdf8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#0284c7',
        },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: {
          top: 0.08,
          bottom: 0.18,
        },
        autoScale: true,
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 8,
        minBarSpacing: 3,
        rightOffset: 8,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    });

    // Remove watermark/logo if any
    const logo = chartContainer.querySelector('#tv-attr-logo');
    if (logo) logo.remove();

    const samplePrice = visibleCandlesRef.current.at(-1)?.close || 100;
    const priceFormat = getChartPriceFormat(samplePrice);

    // Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      priceFormat,
    });

    // Volume Histogram Series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '', // overlay
    });
    chart.priceScale('').applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Crosshair move handler to update candle info display
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        if (visibleCandlesRef.current.length > 0) {
          setActiveCandle(visibleCandlesRef.current.at(-1)!);
        }
        return;
      }
      const data = param.seriesData.get(candleSeries) as any;
      if (data && data.open !== undefined) {
        setActiveCandle({
          time: Number(param.time),
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          volume: 0,
        });
      }
    });

    // Handle responsive resize
    let resizeTimer: any;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (chartRef.current && chartContainerRef.current) {
          const w = chartContainerRef.current.clientWidth;
          const h = chartContainerRef.current.clientHeight;
          if (w > 0 && h > 0) {
            chartRef.current.resize(w, h);
          }
        }
      }, 50);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainer);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(resizeTimer);
      const range = chart.timeScale().getVisibleLogicalRange();
      savedRangeRef.current = range ? { scope: rendererScope, range } : null;
      chart.remove();
      chartRef.current = null;
      renderedHistoricalRows.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      entryLineRef.current = null;
      slLineRef.current = null;
      tpLineRef.current = null;
      pendingLinesRef.current = [];
    };
  }, [chartProvider, chartContainer, rendererScope]);

  // Historical-only incremental renderer. Moving one saved candle forward
  // updates two series in O(1); rewind, another date or changed earlier bars
  // perform an exact full reset. Never use a live market feed for Replay.
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    const previous = renderedHistoricalRows.current;
    const change = replayHistoryChange(
      previous?.scope === rendererScope ? previous.rows : null,
      visibleCandles,
    );
    if (change === 'same') return;
    if (!visibleCandles.length) {
      candleSeriesRef.current.setData([]);
      volumeSeriesRef.current.setData([]);
      renderedHistoricalRows.current = { scope: rendererScope, rows: visibleCandles };
      return;
    }
    const newest = visibleCandles.at(-1)!;
    const candle = (c: Kline) => ({
      time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
    });
    const volume = (c: Kline) => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)',
    });
    candleSeriesRef.current.applyOptions({ priceFormat: getChartPriceFormat(newest.close) });
    if (change === 'append' || change === 'replace-last') {
      candleSeriesRef.current.update(candle(newest));
      volumeSeriesRef.current.update(volume(newest));
    } else {
      candleSeriesRef.current.setData(visibleCandles.map(candle));
      volumeSeriesRef.current.setData(visibleCandles.map(volume));
    }
    renderedHistoricalRows.current = { scope: rendererScope, rows: visibleCandles };
    const savedRange = savedRangeRef.current;
    if (savedRange?.scope === rendererScope) {
      chartRef.current?.timeScale().setVisibleLogicalRange(savedRange.range);
    }
    savedRangeRef.current = null;
  }, [visibleCandles, chartProvider, chartContainer, rendererScope]);

  const focusOnCandlesRef = useRef(focusOnCandles);
  useEffect(() => {
    focusOnCandlesRef.current = focusOnCandles;
  }, [focusOnCandles]);

  // Refit only on a new date/coin or the first available candle.
  // Do not schedule another 80ms refit on every Replay playback candle.
  const hasVisibleCandles = visibleCandles.length > 0;
  // Auto-focus on candles whenever a new date/coin is loaded (focusTrigger increments)
  useEffect(() => {
    if (!hasVisibleCandles) return;
    const timer = setTimeout(() => {
      focusOnCandlesRef.current(true);
    }, 80);
    return () => clearTimeout(timer);
  }, [focusTrigger, hasVisibleCandles]);

  // Replay playback auto-follow: ensure newly stepped-in candles stay comfortably inside visible range
  useEffect(() => {
    if (!chartRef.current || visibleCandles.length === 0) return;
    const total = visibleCandles.length;
    const timeScale = chartRef.current.timeScale();
    const logicalRange = timeScale.getVisibleLogicalRange();

    if (logicalRange) {
      // If candle moves past the visible right edge or within 4 bars of it, scroll forward smoothly
      if (total >= logicalRange.to - 4) {
        const barSpan = Math.max(30, logicalRange.to - logicalRange.from);
        timeScale.setVisibleLogicalRange({
          from: total - Math.round(barSpan * 0.75),
          to: total + Math.round(barSpan * 0.25),
        });
      }
    }
  }, [visibleCandles.length]);

  // Update Position Price Lines (Entry, SL, TP, Liquidation)
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    // Clean up old lines
    if (entryLineRef.current) {
      candleSeriesRef.current.removePriceLine(entryLineRef.current);
      entryLineRef.current = null;
    }
    if (slLineRef.current) {
      candleSeriesRef.current.removePriceLine(slLineRef.current);
      slLineRef.current = null;
    }
    if (tpLineRef.current) {
      candleSeriesRef.current.removePriceLine(tpLineRef.current);
      tpLineRef.current = null;
    }

    if (position) {
      // Entry Line
      entryLineRef.current = candleSeriesRef.current.createPriceLine({
        price: position.entryPrice,
        color: position.side === 'long' ? '#10b981' : '#f43f5e',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: translateKey(language, 'replay.chart.chart.entryLine', { side: position.side.toUpperCase(), price: formatCryptoPrice(position.entryPrice) }),
      });

      // SL Line
      if (position.slPrice && position.slPrice > 0) {
        slLineRef.current = candleSeriesRef.current.createPriceLine({
          price: position.slPrice,
          color: '#ef4444',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `Stop-Loss: ${formatCryptoPrice(position.slPrice)}`,
        });
      }

      // TP Line
      if (position.tpPrice && position.tpPrice > 0) {
        tpLineRef.current = candleSeriesRef.current.createPriceLine({
          price: position.tpPrice,
          color: '#10b981',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `Take-Profit: ${formatCryptoPrice(position.tpPrice)}`,
        });
      }

    }
  }, [position, chartProvider, chartContainer, rendererScope, language]);

  // Update Pending Orders Lines
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    // Remove existing pending lines
    for (const line of pendingLinesRef.current) {
      candleSeriesRef.current.removePriceLine(line);
    }
    pendingLinesRef.current = [];

    // Add new lines for pending limit / stop orders
    for (const order of pendingOrders) {
      const line = candleSeriesRef.current.createPriceLine({
        price: order.price,
        color: '#f59e0b',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `${order.orderType.toUpperCase()} ${order.side.toUpperCase()}: ${formatCryptoPrice(order.price)}`,
      });
      pendingLinesRef.current.push(line);
    }
  }, [pendingOrders, chartProvider, chartContainer, rendererScope]);

  const latestCandle = visibleCandles[visibleCandles.length - 1] || null;
  const displayCandle = activeCandle || latestCandle;
  const candleChangePct =
    displayCandle && displayCandle.open > 0
      ? ((displayCandle.close - displayCandle.open) / displayCandle.open) * 100
      : 0;

  const formattedDate = displayCandle
    ? new Date(displayCandle.time * 1000).toLocaleString('uk-UA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      }) + ' UTC'
    : '—';

  const content = (
    <div
      ref={fullscreenRootRef}
      className={`site-chart-frame flex min-w-0 flex-col overflow-hidden bg-[#090d16] ${
        isFullscreen
          ? 'fixed inset-0 z-[100] w-screen h-[100dvh] max-h-[100dvh] min-h-[100dvh] rounded-none'
          : 'relative w-full max-w-full rounded-2xl border border-slate-800 shadow-xl'
      }`}
      role={isFullscreen ? 'dialog' : undefined}
      aria-modal={isFullscreen || undefined}
      aria-label={isFullscreen ? t('replay.chart.chart.fullscreenDialog') : undefined}
    >
      {/* Chart Top Header Overlay */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-1.5 sm:gap-2 px-2 sm:px-3.5 py-1.5 sm:py-2.5 bg-slate-950/70 border-b border-slate-800/60 backdrop-blur-md z-10 text-xs">
        <div className="flex flex-wrap items-center min-w-0 max-w-full gap-1.5 sm:gap-2.5">
          <div className="flex items-center gap-1.5 font-mono">
            <span data-no-translate className="font-extrabold text-white text-sm sm:text-base">{symbol}</span>
            {chartProvider !== 'hookchart' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {timeframe}
              </span>
            )}
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300">
              {exchange} {marketType}
            </span>
            {isReplaying && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-950/70 border border-amber-500/50 text-amber-300 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                {t('replay.chart.chart.mode')}
              </span>
            )}
            {(isPlaying || isIntrabarPreview) && (
              <span role="note" title={t(intrabarSource === 'seconds'
                  ? 'replay.static.toolbar.secondDisclaimer'
                  : intrabarSource === 'loading'
                    ? 'replay.static.toolbar.secondLoadingHelp'
                    : 'replay.static.toolbar.intrabarDisclaimer')}
                className="shrink-0 rounded border border-amber-500/20 bg-amber-500/5 px-1.5 py-0.5 text-[9px] font-medium text-amber-200/80">
                {t(intrabarSource === 'seconds'
                  ? 'replay.static.toolbar.secondBadge'
                  : intrabarSource === 'loading'
                    ? 'replay.static.toolbar.secondLoading'
                    : 'replay.static.toolbar.intrabarBadge')}
              </span>
            )}
            {isFocusedBadge && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-in fade-in duration-150">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                {t('replay.chart.chart.autoFocus')}
              </span>
            )}
          </div>

          {/* Candle OHLC stats */}
          {displayCandle && (
            <div className="flex items-center w-full sm:w-auto min-w-0 max-w-full gap-2 overflow-x-auto whitespace-nowrap font-mono text-[10px] sm:text-[11px] text-slate-400" aria-label={t("replay.chart.chart.ohlc")}>
              <span>
                O: <b className="text-slate-200">{formatCryptoPrice(displayCandle.open)}</b>
              </span>
              <span>
                H: <b className="text-emerald-400">{formatCryptoPrice(displayCandle.high)}</b>
              </span>
              <span>
                L: <b className="text-rose-400">{formatCryptoPrice(displayCandle.low)}</b>
              </span>
              <span>
                C: <b className={candleChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {formatCryptoPrice(displayCandle.close)}
                </b>
              </span>
              <span
                className={`font-semibold ${
                  candleChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                ({candleChangePct >= 0 ? '+' : ''}
                {candleChangePct.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>

        {/* Action controls */}
        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-1.5 sm:w-auto">
          <div className={`min-w-0 text-[10px] sm:text-[11px] font-mono text-cyan-300/80 mr-auto flex items-center gap-1 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40 overflow-hidden whitespace-nowrap ${
            isFullscreen ? 'w-full sm:w-auto sm:max-w-none' : 'max-w-[55vw] sm:max-w-none'
          }`}>
            <span className="truncate">📅 {formattedDate}</span>
          </div>

          {isFullscreen && chartProvider === 'hookchart' && (
            <ReplayFullscreenActions
              isPlaying={isPlaying}
              isLoading={isLoadingHistoricalData}
              canAdvance={canAdvance}
              onTogglePlay={onTogglePlay}
              onStepForward={onStepForward}
              onRandomHistoricalDate={onRandomHistoricalDate}
            />
          )}

          <button
            onClick={() => {
              const img = captureScreenshot();
              if (img) {
                const link = document.createElement('a');
                link.download = `replay_${symbol}_${timeframe}_${displayCandle?.time || Date.now()}.png`;
                link.href = img;
                link.click();
                onTakeScreenshotNotification?.();
              }
            }}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
            title={t("replay.chart.chart.screenshot")}
          >
            <Camera className="w-3.5 h-3.5 text-cyan-400" />
          </button>

          <button
            onClick={() => chartProvider === 'hookchart' ? hookChartRef.current?.fitContent() : chartRef.current?.timeScale().fitContent()}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
            title={t("replay.chart.chart.fit")}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => { void toggleFullscreen(); }}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
            title={t(isFullscreen ? 'replay.chart.chart.exitFullscreen' : 'replay.chart.chart.fullscreen')}
            aria-label={t(isFullscreen ? 'replay.chart.chart.exitFullscreen' : 'replay.chart.chart.expand')}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Lightweight-chart fallback uses the same timeframe selection above its canvas. */}
      {chartProvider !== 'hookchart' && (
        <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2 border-b border-slate-800/60 bg-slate-950/70"
          role="group" aria-label={t("replay.chart.chart.timeframe")}>
          {(['1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map(tf => (
            <button key={tf} type="button" disabled={isLoadingHistoricalData}
              aria-pressed={timeframe === tf} aria-label={t("replay.chart.chart.timeframeValue", { tf })}
              onClick={() => onTimeframeChange(tf)}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-mono font-bold border transition-colors disabled:opacity-50 ${timeframe === tf
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-amber-500/60'}`}>{tf}</button>
          ))}
          <ReplaySpeedPicker speed={playbackSpeed} onSpeedChange={onSpeedChange} />
          <button type="button" onClick={onToggleHistory}
            disabled={isLoadingHistoricalData || isHistoryLoading || !visibleCandles.length}
            title={t(historyExpanded ? 'replay.chart.history.hide' : 'replay.chart.history.title')}
            aria-label={t(historyExpanded ? 'replay.chart.history.hide' : 'replay.chart.history.title')}
            aria-pressed={historyExpanded}
            className={`inline-flex h-[29px] items-center rounded-md border px-2 transition-colors disabled:opacity-40 ${historyExpanded
              ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300'
              : 'border-slate-700 bg-slate-900 text-slate-300 hover:text-cyan-300'}`}>
            <History className={`h-4 w-4 ${isHistoryLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Give Replay candles enough room on desktop, without changing the
          underlying chart renderer, mobile dimensions or fullscreen behavior. */}
      <div className={`relative w-full min-w-0 overflow-hidden flex flex-col p-2 sm:p-4 ${
        isFullscreen
          ? 'flex-1 min-h-0'
          : 'h-[520px] xs:h-[540px] sm:h-[540px] md:h-[clamp(540px,78dvh,780px)] shrink-0'
      }`}>
        <div className="relative flex-1 min-h-0 w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950 select-none">
          {chartProvider === 'hookchart'
            ? <HookChart ref={hookChartRef} klines={visibleCandles} symbol={symbol} timeframe={timeframe}
                exchange={exchange} marketType={marketType} markers={hookMarkers} replay focusTrigger={focusTrigger}
                onTimeframeChange={onTimeframeChange} timeframeDisabled={isLoadingHistoricalData}
                replayPlaybackSpeed={playbackSpeed} onReplayPlaybackSpeedChange={onSpeedChange}
                replayHistoryExpanded={historyExpanded} replayHistoryLoading={isHistoryLoading}
                onReplayHistoryToggle={onToggleHistory} />
            : <div ref={bindChartContainer} data-chart-provider="tradingview" className="relative h-full w-full select-none" />}
        </div>
      </div>

    </div>
  );

  // Same body-level portal as Screener's FullscreenChartModal: fixed to the
  // viewport on phones and tablets, while preserving the page's layout space.
  if (isFullscreen && !nativeFullscreenRef.current && typeof document !== 'undefined') {
    return <>
      <div aria-hidden="true" className="w-full max-w-full" style={{ height: `${inlineBlockHeightRef.current}px` }} />
      {createPortal(content, document.body)}
    </>;
  }
  return content;
});

ReplayChart.displayName = 'ReplayChart';

