import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { translatePhrase } from '../../locales';
import {
  GripVertical,
  Trash2,
  Zap,
  Send,
  ExternalLink,
  ChevronDown,
  Search,
  Sparkles,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Columns,
  Eye,
  Activity,
} from 'lucide-react';
import {
  TerminalChartBlock,
  ScannedCoin,
  DetectedFormation,
  ExchangeId,
  MarketType,
} from '../../types';
import { ExchangeCandlestickChart } from '../ExchangeCandlestickChart';
import { TerminalRenderBoundary } from './TerminalRenderBoundary';
import type { TerminalToolbarVisibility } from '../hookchart/HookChartCanvas';
import type { VisualChartProfile } from '../hookchart/visualProfiles';
import type { ArchiveChartCapture } from '../../utils/archiveChartSnapshot';
import { formatTerminalQuotedPrice } from '../../utils/terminalPresets';
import { normalizeChartProvider } from '../../utils/chartPreferences';
import { formationChartMarkers } from '../../utils/hookchartData';
import { subscribeTerminalWidgetVisibility } from '../../utils/terminalVisibilityScheduler';
import { terminalChartMountQueue } from '../../utils/terminalChartMountQueue';
import { isTerminalWidgetNearViewport } from '../../utils/terminalWidgetVisibility';

interface TerminalChartWidgetProps {
  block: TerminalChartBlock;
  coin?: ScannedCoin;
  allCoins?: ScannedCoin[];
  /** Fresh list on-demand; avoids pushing thousands of quote objects to every chart. */
  getAllCoins?: () => ScannedCoin[];
  subscribeAllCoins?: (listener: () => void) => () => void;
  isSingleBlock: boolean;
  /** The only visible Terminal tile loads immediately, without losing grid controls. */
  isOnlyChart?: boolean;
  /** CSS grid span clamped to actual responsive column count. */
  responsiveSpanClass?: string;
  isMaximized: boolean;
  /** Pause charts obscured by a maximized Terminal chart. */
  isSuspended?: boolean;
  /** Reports only actual viewport crossings for adaptive paint budgeting. */
  onVisibilityChange?: (blockId: string, visible: boolean) => void;
  onToggleMaximize: () => void;
  onRemove: () => void;
  onUpdateBlock: (updated: Partial<TerminalChartBlock>) => void;
  /** Open the shared Terminal market catalog for replacing this chart's instrument. */
  onOpenCoinSelector?: () => void;
  onOpenFullscreenModal?: (coin: ScannedCoin, formation?: DetectedFormation) => void;
  onSaveToArchive?: (block: TerminalChartBlock, coin: ScannedCoin, formation: DetectedFormation | null, capture: ArchiveChartCapture) => void;
  isSavingArchive?: boolean;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  metaScalpBinding?: string;
  onOpenTelegramAlerts?: (prefill?: any) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  heightStyle?: string;
  /** Terminal-wide candle auto-scale; does not start any extra feed. */
  terminalAutoScale?: boolean;
  terminalEcoMode?: boolean;
  /** Visual-only candle refresh cadence for Terminal. */
  terminalRefreshMs?: number;
  /** Number of Terminal panels sharing the presentation budget. */
  terminalActiveCharts?: number;
  terminalInitialView?: VisualChartProfile;
  terminalFitAllRequest?: number;
  /** Reuse the Terminal card within fullscreen without draggable grid sizing controls. */
  compactFullscreenMode?: boolean;
}


export const TerminalChartWidget: React.FC<TerminalChartWidgetProps> = ({
  block,
  coin,
  allCoins,
  getAllCoins,
  subscribeAllCoins,
  isSingleBlock,
  isOnlyChart = false,
  responsiveSpanClass,
  isMaximized,
  isSuspended = false,
  onVisibilityChange,
  onToggleMaximize,
  onRemove,
  onUpdateBlock,
  onOpenCoinSelector,
  onOpenFullscreenModal,
  onSaveToArchive,
  isSavingArchive = false,
  onSendMetaScalp,
  metaScalpBinding = '001',
  onOpenTelegramAlerts,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  heightStyle,
  terminalAutoScale = false,
  terminalEcoMode = false,
  terminalRefreshMs = 0,
  terminalActiveCharts = 1,
  terminalInitialView,
  terminalFitAllRequest,
  compactFullscreenMode = false,
}) => {
  const { language, t } = useLanguage();
  // Terminal widgets must always use HookChart, independent of legacy preferences.
  const chartProvider = normalizeChartProvider('hookchart');
  const useIntegratedHookChartToolbar = chartProvider === 'hookchart';
  // Coin switcher popup state
  const [isCoinPickerOpen, setIsCoinPickerOpen] = useState(false);
  const [coinSearch, setCoinSearch] = useState('');
  const [isSpanPickerOpen, setIsSpanPickerOpen] = useState(false);
  // Stable per-block state even when a distant chart temporarily unmounts.
  // Never synchronize open panels through profile, storage, or global events.
  const [extraToolsOpen, setExtraToolsOpen] = useState(false);
  const [drawingToolsOpen, setDrawingToolsOpen] = useState(false);
  const terminalToolbarVisibility = useMemo<TerminalToolbarVisibility>(() => ({
    extraToolsOpen,
    drawingToolsOpen,
    onExtraToolsOpenChange: setExtraToolsOpen,
    onDrawingToolsOpenChange: setDrawingToolsOpen,
  }), [extraToolsOpen, drawingToolsOpen]);
  const blockRootRef = useRef<HTMLDivElement>(null);
  // Strict viewport-only mounting: even a single chart is suspended while
  // outside the visible Terminal area. Rendering it again restores its
  // saved panel state and reconnects only its chart-owned feeds.
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [isMountReady, setIsMountReady] = useState(false);
  const shouldLoadWidgets = !isSuspended && isNearViewport && isMountReady;

  useEffect(() => {
    if (!isNearViewport || isSuspended) {
      setIsMountReady(false);
      return;
    }
    // A fast swipe must not initialize 4-8 DPR canvases simultaneously.
    // Only tiles that remain visible receive a mount slot.
    return terminalChartMountQueue.enqueue(() => {
      const node = blockRootRef.current;
      if (!node || document.visibilityState === 'hidden') return;
      // A fast momentum swipe may move a tile out of view between the
      // IntersectionObserver event and its assigned RAF mount slot.
      const screen = { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
      const root = isMaximized || compactFullscreenMode ? null
        : node.closest<HTMLElement>('[data-terminal-scroll-viewport]');
      const bounds = root?.getBoundingClientRect() ?? screen;
      if (isTerminalWidgetNearViewport(node.getBoundingClientRect(), bounds, screen))
        setIsMountReady(true);
    });
  }, [isNearViewport, isSuspended, isMaximized, compactFullscreenMode]);

  // Measure all chart cards through the shared viewport scheduler. Do not
  // preload the next row; hidden cards do not allocate a high-DPR canvas,
  // run scalper overlays or subscribe to their individual market feeds.
  useLayoutEffect(() => {
    const node = blockRootRef.current;
    if (!node || isSuspended) {
      setIsNearViewport(false);
      onVisibilityChange?.(block.id, false);
      return;
    }
    const unsubscribe = subscribeTerminalWidgetVisibility(
      node,
      visible => {
        setIsNearViewport(current => current === visible ? current : visible);
        onVisibilityChange?.(block.id, visible);
      },
      isMaximized || compactFullscreenMode,
    );
    return () => {
      unsubscribe();
      onVisibilityChange?.(block.id, false);
    };
  }, [isMaximized, compactFullscreenMode, isSuspended, block.id, onVisibilityChange]);

  const headerRef = useRef<HTMLDivElement>(null);
  const toolbarMenusRef = useRef<HTMLDivElement>(null);
  const toolbarScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const toolbar = toolbarScrollRef.current;
    if (!toolbar) return;
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || toolbar.scrollWidth <= toolbar.clientWidth) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? toolbar.clientWidth : 1;
      const previous = toolbar.scrollLeft;
      toolbar.scrollLeft += delta * unit;
      if (toolbar.scrollLeft !== previous) event.preventDefault();
    };
    toolbar.addEventListener('wheel', handleWheel, { passive: false });
    return () => toolbar.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    if (!isCoinPickerOpen && !isSpanPickerOpen) return;
    const closeMenus = () => {
      setIsCoinPickerOpen(false);
      setIsSpanPickerOpen(false);
    };
    const handleClickOutside = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!headerRef.current?.contains(event.target as Node) && !toolbarMenusRef.current?.contains(event.target as Node)) closeMenus();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeMenus();
      event.stopPropagation();
    };
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isCoinPickerOpen, isSpanPickerOpen]);

  // Live candle prices are already painted directly inside HookChart.
  // Keep the latest price in a ref for click actions instead of re-rendering
  // an entire high-DPR chart and integrated toolbar every 250 ms.
  const instrumentKey = `${block.exchange}:${block.marketType}:${block.symbol}`;
  const quotedPrice = coin?.currentPrice;
  const initialPrice = Number.isFinite(quotedPrice) && (quotedPrice ?? 0) > 0 ? quotedPrice! : 0;
  const livePriceRef = useRef(initialPrice);
  const previousInstrumentRef = useRef(instrumentKey);
  const activeInstrumentRef = useRef(instrumentKey);
  activeInstrumentRef.current = instrumentKey;
  if (previousInstrumentRef.current !== instrumentKey) {
    // Never show the old instrument's price in a new market's alert or archive.
    previousInstrumentRef.current = instrumentKey;
    livePriceRef.current = initialPrice;
  }
  useEffect(() => {
    // This refresh comes from the existing shared market snapshot, not a new feed.
    if (Number.isFinite(quotedPrice) && (quotedPrice ?? 0) > 0)
      livePriceRef.current = quotedPrice!;
  }, [instrumentKey, quotedPrice]);

  const handleChartPrice = useCallback((price: number) => {
    // Late data from an unmounted/replaced chart must not update the next coin.
    if (activeInstrumentRef.current !== instrumentKey) return;
    if (!Number.isFinite(price) || price <= 0) return;
    livePriceRef.current = price;
  }, [instrumentKey]);

  const detailCoin = useMemo<ScannedCoin>(() => {
    if (coin) {
      return {
        ...coin,
        timeframe: block.timeframe,
        currentPrice: coin.currentPrice,
      };
    }

    return {
      symbol: block.symbol,
      baseAsset: block.baseAsset,
      quoteAsset: block.quoteAsset,
      exchange: block.exchange,
      marketType: block.marketType,
      currentPrice: quotedPrice || 0,
      priceChange24h: 0,
      highPrice24h: 0,
      lowPrice24h: 0,
      volume24hUsd: 0,
      formations: [],
      timeframe: block.timeframe,
      // No exchange quote exists for this instrument yet; don't mark it fresh.
      lastUpdated: 0,
      exchangeUrl: '',
    };
  }, [
    coin,
    block.symbol,
    block.baseAsset,
    block.quoteAsset,
    block.exchange,
    block.marketType,
    block.timeframe,
    quotedPrice,
  ]);

  // Active formation if any
  const activeFormation = useMemo(() => {
    if (!coin?.formations || coin.formations.length === 0) return null;
    if (block.formationId) {
      const match = coin.formations.find((f) => f.id === block.formationId);
      if (match) return match;
    }
    return coin.formations[0];
  }, [coin?.formations, block.formationId]);

  const availableFormations = useMemo(() => (
    coin?.symbol === block.symbol && coin.exchange === block.exchange
      && coin.marketType === block.marketType && coin.timeframe === block.timeframe
      ? coin.formations ?? [] : []
  ), [coin, block.symbol, block.exchange, block.marketType, block.timeframe]);
  const chosenFormation = availableFormations.find(item => item.id === block.formationId) ?? null;
  // A chart's TP / Entry / SL markers are an opt-in display layer. The optional
  // field lives in the cloud workspace so old and newly added tiles start OFF.
  const showTradeLevels = block.showTradeLevels === true;
  const tradeLevelToggle = useMemo(() => ({
    visible: showTradeLevels,
    onToggle: () => onUpdateBlock({ showTradeLevels: !showTradeLevels }),
  }), [showTradeLevels, onUpdateBlock]);
  // Reuse existing scanner results only: no extra analysis or exchange requests per chart.
  const chosenMarkers = useMemo(() => chosenFormation
    ? formationChartMarkers(chosenFormation, { entry: true, target: true, stop: true }, block.timeframe)
    : undefined, [chosenFormation, block.timeframe]);


  // With up to 50 chart cards, do not scan the full market list for closed
  // switchers whenever the Terminal refreshes its shared market snapshot.
  const [coinListVersion, setCoinListVersion] = useState(0);
  useEffect(() => {
    if (!isCoinPickerOpen || !subscribeAllCoins) return;
    return subscribeAllCoins(() => setCoinListVersion(value => value + 1));
  }, [isCoinPickerOpen, subscribeAllCoins]);

  const filteredCoins = useMemo(() => {
    // Shared catalogue revisions must invalidate the opened picker even when
    // getAllCoins is a stable function identity.
    void coinListVersion;
    if (!isCoinPickerOpen) return [];
    const available = getAllCoins?.() ?? allCoins ?? [];
    if (!coinSearch.trim()) return available.slice(0, 30);
    const q = coinSearch.toLowerCase().trim();
    return available
      .filter((c) => c.symbol.toLowerCase().includes(q) || c.baseAsset.toLowerCase().includes(q))
      .slice(0, 30);
  }, [allCoins, getAllCoins, coinSearch, isCoinPickerOpen, coinListVersion]);

  // Compute CSS column span class
  const colSpanClass = useMemo(() => {
    if (isSingleBlock || isMaximized) return 'col-span-full';
    if (responsiveSpanClass) return responsiveSpanClass;
    const effectiveSpan = block.colSpan || 1;
    switch (effectiveSpan) {
      case 2: return 'col-span-1 md:col-span-2';
      case 3: return 'col-span-1 md:col-span-2 lg:col-span-3';
      case 4:
      case 'full': return 'col-span-full';
      default: return 'col-span-1';
    }
  }, [block.colSpan, isSingleBlock, isMaximized, responsiveSpanClass]);

  const terminalToolbarControls = (
    <>
        {!compactFullscreenMode && !isSingleBlock && !isMaximized && (
          <div
            draggable={Boolean(onDragStart)}
            onDragStart={event => {
              // Only this grip may start a native tile reorder. The chart body
              // stays non-draggable for pointer/touch history pan and pinch zoom.
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', block.id);
              onDragStart?.(event);
            }}
            onDragEnd={onDragEnd}
            className="terminal-chart-drag-handle rounded text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing hover:bg-slate-800/60"
            title={translatePhrase(language, "Перетягнути для зміни позиції")}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
        )}
        <div
          ref={toolbarScrollRef}
          className="terminal-chart-toolbar-scroll min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cyan-500/50"
          role="region"
          aria-label={t("terminal.widget.chartTools", { symbol: block.symbol })}
          tabIndex={0}
        >
          <div className="terminal-chart-toolbar-row">
            {/* Coin, exchange, market and chart mode */}
            <div className="terminal-chart-toolbar-group flex items-center">
              {/* Coin Selector Dropdown trigger */}
              <div className="relative">
                <button
                  onClick={() => {
                    if (onOpenCoinSelector) {
                      setIsCoinPickerOpen(false);
                      setIsSpanPickerOpen(false);
                      onOpenCoinSelector();
                    } else {
                      // Fullscreen and other reusers keep the compact local picker.
                      setIsCoinPickerOpen(current => !current);
                      setIsSpanPickerOpen(false);
                    }
                  }}
                  aria-haspopup={onOpenCoinSelector ? 'dialog' : undefined}
                  aria-expanded={onOpenCoinSelector ? undefined : isCoinPickerOpen}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 font-mono font-bold text-white transition-colors cursor-pointer"
                  title={translatePhrase(language, "Змінити монету")}
                   aria-label={`${translatePhrase(language, "Змінити монету")} — ${block.symbol}`}
                >
                  <span data-no-translate>{block.symbol}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
              </div>

              {/* Exchange badge (click to toggle exchange if available) */}
              <button
                onClick={() =>
                  onUpdateBlock({
                    exchange: block.exchange === 'binance' ? 'bybit' : 'binance',
                  })
                }
                className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase cursor-pointer transition-colors ${
                  block.exchange === 'binance'
                    ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                    : 'bg-orange-500/15 text-orange-300 hover:bg-orange-500/25'
                }`}
                title={translatePhrase(language, "Клікніть щоб змінити біржу (Binance / Bybit)")}
                 aria-label={`${translatePhrase(language, "Клікніть щоб змінити біржу (Binance / Bybit)")} — ${block.exchange}`}
              >
                {block.exchange}
              </button>

              {/* Market Type badge (Spot / Futures) */}
              <button
                onClick={() =>
                  onUpdateBlock({
                    marketType: block.marketType === 'futures' ? 'spot' : 'futures',
                  })
                }
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 uppercase cursor-pointer"
                title={translatePhrase(language, "Клікніть щоб змінити тип ринку (Perp / Spot)")}
                 aria-label={translatePhrase(language, "Клікніть щоб змінити тип ринку (Perp / Spot)")}
              >
                {block.marketType === 'futures' ? 'Perp' : 'Spot'}
              </button>

            </div>
            {/* Chart tools */}
            <div className="terminal-chart-toolbar-group ml-auto flex items-center">
              {/* MetaScalp send button */}
              {coin && onSendMetaScalp && (
                <button
                  onClick={() => onSendMetaScalp(coin)}
                  className="p-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition-colors"
                  title={t("terminal.widget.metaScalp", { group: metaScalpBinding })}
                   aria-label={t("terminal.widget.metaScalp", { group: metaScalpBinding })}
                >
                  <Zap className="w-3 h-3 text-amber-400" />
                </button>
              )}

              {/* Telegram Alert quick button */}
              {coin && onOpenTelegramAlerts && (
                <button
                  onClick={() =>
                    onOpenTelegramAlerts({
                      symbol: coin.symbol,
                      exchange: coin.exchange,
                      marketType: coin.marketType,
                      currentPrice: livePriceRef.current || coin.currentPrice,
                      targetPrice: activeFormation?.levels?.targetPrice,
                      formationName: activeFormation?.name,
                    })
                  }
                  className="p-1 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 transition-colors"
                  title={translatePhrase(language, "Налаштувати алерт у Telegram")}
                   aria-label={translatePhrase(language, "Налаштувати алерт у Telegram")}
                >
                  <Send className="w-3 h-3 text-sky-400" />
                </button>
              )}

              {/* Col Span & Height Adjuster (Width & Height) */}
              {!compactFullscreenMode && !isSingleBlock && !isMaximized && (
                <div className="relative">
                  <button
                    onClick={() => {
                      setIsSpanPickerOpen(current => !current);
                      setIsCoinPickerOpen(false);
                                    }}
                    aria-expanded={isSpanPickerOpen}
                    className={`p-1 rounded transition-colors cursor-pointer ${
                      isSpanPickerOpen
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                    title={translatePhrase(language, "Ширина та висота блоку (1, 2, 3 колонки, висота)")}
                     aria-label={translatePhrase(language, "Ширина та висота блоку (1, 2, 3 колонки, висота)")}
                  >
                    <Columns className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="terminal-chart-header-actions flex shrink-0 items-center gap-1">
          {/* Detailed chart / extended analysis */}
          {onOpenFullscreenModal && (
            <button
              type="button"
              onClick={() => onOpenFullscreenModal({ ...detailCoin, currentPrice: livePriceRef.current || detailCoin.currentPrice }, activeFormation || undefined)}
              className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors cursor-pointer"
              title={translatePhrase(language, "Відкрити детальний графік з розширеним аналізом")}
              aria-label={translatePhrase(language, "Відкрити детальний графік з розширеним аналізом")}
            >
              <ExternalLink className="w-3 h-3" />
            </button>
          )}

          {/* Remove / Close Block button */}
          <button
            onClick={onRemove}
            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
            title={translatePhrase(language, "Закрити графік")}
             aria-label={translatePhrase(language, "Закрити графік")}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
    </>
  );
  const terminalToolbarMenus = (
    <>
        {/* In-place Coin Switcher Popover */}
        {isCoinPickerOpen && (
          <div
            className="terminal-chart-header-popover absolute left-2 top-full mt-1.5 z-40 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-slate-800 bg-slate-950">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={coinSearch}
                  onChange={(e) => setCoinSearch(e.target.value)}
                  placeholder={translatePhrase(language, 'Швидкий пошук...')}
                  aria-label={translatePhrase(language, 'Швидкий пошук...')}
                  autoFocus
                  className="w-full pl-7 pr-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
            <div className="terminal-chart-coin-list max-h-48 overflow-y-auto divide-y divide-slate-800/60 p-1">
              {filteredCoins.map((c) => (
                <button
                  key={`${c.exchange}-${c.symbol}`}
                  onClick={() => {
                    onUpdateBlock({
                      symbol: c.symbol,
                      baseAsset: c.baseAsset,
                      quoteAsset: c.quoteAsset,
                      exchange: c.exchange,
                      marketType: c.marketType,
                      formationId: c.formations?.[0]?.id,
                    });
                    setIsCoinPickerOpen(false);
                  }}
                  className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span data-no-translate className="min-w-0 truncate font-mono font-bold text-white" title={c.symbol}>{c.symbol}</span>
                    <span className="shrink-0 rounded bg-slate-800 px-1 text-[10px] uppercase text-slate-300">
                      {c.exchange}
                    </span>
                  </div>
                  <span className="max-w-[48%] shrink-0 truncate font-mono text-[11px] text-slate-300">
                    {formatTerminalQuotedPrice(c.currentPrice, c.quoteAsset)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {isSpanPickerOpen && (
          <div
            className="terminal-chart-header-popover terminal-chart-span-menu absolute right-2 top-full mt-1 z-40 bg-slate-900 border border-slate-700 rounded-xl p-1 shadow-xl flex flex-col gap-0.5 text-[11px] w-max"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                onUpdateBlock({ colSpan: 1 });
                setIsSpanPickerOpen(false);
              }}
              className={`px-2 py-1 rounded text-left hover:bg-slate-800 ${
                block.colSpan === 1 || !block.colSpan ? 'text-cyan-300 font-bold' : 'text-slate-300'
              }`}
            >
              {translatePhrase(language, "1 колонка (Стандарт)")}
            </button>
            <button
              onClick={() => {
                onUpdateBlock({ colSpan: 2 });
                setIsSpanPickerOpen(false);
              }}
              className={`px-2 py-1 rounded text-left hover:bg-slate-800 ${
                block.colSpan === 2 ? 'text-cyan-300 font-bold' : 'text-slate-300'
              }`}
            >
              {translatePhrase(language, "2 колонки (Широкий)")}
            </button>
            <button
              onClick={() => {
                onUpdateBlock({ colSpan: 3 });
                setIsSpanPickerOpen(false);
              }}
              className={`px-2 py-1 rounded text-left hover:bg-slate-800 ${
                block.colSpan === 3 ? 'text-cyan-300 font-bold' : 'text-slate-300'
              }`}
            >
              {translatePhrase(language, "3 колонки (Дуже широкий)")}
            </button>
            <button
              onClick={() => {
                onUpdateBlock({ colSpan: 'full' });
                setIsSpanPickerOpen(false);
              }}
              className={`px-2 py-1 rounded text-left hover:bg-slate-800 ${
                block.colSpan === 'full' ? 'text-cyan-300 font-bold' : 'text-slate-300'
              }`}
            >
              {translatePhrase(language, "Повна ширина")}
            </button>
            <div className="my-1 border-t border-slate-800" />
            <div className="px-2 pt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {translatePhrase(language, "Висота графіка")}
            </div>
            {[
              { px: 280, label: 'Мінімум' },
              { px: 380, label: 'Компактний' },
              { px: 480, label: 'Стандартний' },
              { px: 620, label: 'Високий' },
            ].map((height) => (
              <button
                key={height.px}
                onClick={() => {
                  onUpdateBlock({ heightPx: height.px });
                  setIsSpanPickerOpen(false);
                }}
                className={`px-2 py-1 rounded text-left hover:bg-slate-800 ${
                  block.heightPx === height.px ? 'text-cyan-300 font-bold' : 'text-slate-300'
                }`}
              >
                {translatePhrase(language, height.label)}
              </button>
            ))}
            <button
              onClick={() => {
                onUpdateBlock({ heightPx: undefined });
                setIsSpanPickerOpen(false);
              }}
              className="px-2 py-1 rounded text-left text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              {translatePhrase(language, "Автоматична висота")}
            </button>
          </div>
        )}
    </>
  );

  return (
    <div
      ref={blockRootRef}
      data-terminal-block-id={block.id}
      draggable={false}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`terminal-chart-block ${compactFullscreenMode ? 'fullscreen-multi-terminal-chart' : ''} relative flex min-w-0 flex-col bg-[#090d16] overflow-hidden ${useIntegratedHookChartToolbar ? 'terminal-chart-hookchart border-0 rounded-none shadow-none' : 'border border-slate-800 rounded-xl shadow-lg'} ${colSpanClass} ${
        isMaximized ? 'fixed inset-2 sm:inset-4 z-50 rounded-2xl border-cyan-500/50 shadow-2xl shadow-cyan-950/50' : ''
      }`}
      style={{
        height: compactFullscreenMode ? '100%' : isMaximized
          ? 'calc(100vh - 2rem)'
          : block.heightPx
          ? `${block.heightPx}px`
          : heightStyle || undefined,
        minHeight: compactFullscreenMode ? '0' : isSingleBlock || isMaximized
          ? '420px'
          : '300px',
      }}
    >
      {/* HookChart integrates chart-specific controls into its toolbar. */}
      {!useIntegratedHookChartToolbar && (
        <div ref={headerRef} className="terminal-chart-header relative flex items-center gap-1.5 px-2 py-1.5 bg-slate-950 border-b border-slate-800/90 text-xs shrink-0 select-none">
          {terminalToolbarControls}
          {terminalToolbarMenus}
        </div>
      )}

      {/* Chart body */}
      <div className="terminal-chart-plot-area flex-1 w-full relative bg-[#090d16] overflow-hidden min-h-0 flex flex-col">
        {shouldLoadWidgets ? (
          <div className="flex-1 w-full h-full relative overflow-hidden bg-[#090d16]">
              <TerminalRenderBoundary variant="chart" resetKey={`${block.exchange}:${block.marketType}:${block.symbol}:${block.timeframe}`}>
              <ExchangeCandlestickChart
                forceHookChart
                onAddToArchive={onSaveToArchive ? capture => onSaveToArchive(
                  block, { ...detailCoin, currentPrice: livePriceRef.current || detailCoin.currentPrice },
                  chosenFormation || availableFormations.find(item => item.id === block.formationId) || null,
                  capture
                ) : undefined}
                isSavingArchive={isSavingArchive}
                onLivePriceUpdate={useIntegratedHookChartToolbar ? handleChartPrice : undefined}
                terminalAutoScale={terminalAutoScale && useIntegratedHookChartToolbar}
                terminalEcoMode={terminalEcoMode}
                terminalRefreshMs={terminalRefreshMs}
                terminalActiveCharts={terminalActiveCharts}
                terminalInitialView={useIntegratedHookChartToolbar ? terminalInitialView : undefined}
                terminalFitAllRequest={useIntegratedHookChartToolbar ? terminalFitAllRequest : undefined}
                terminalMode={useIntegratedHookChartToolbar}
                terminalToolbarVisibility={useIntegratedHookChartToolbar ? terminalToolbarVisibility : undefined}
                onTimeframeChange={useIntegratedHookChartToolbar ? (nextTimeframe) => onUpdateBlock({ timeframe: nextTimeframe }) : undefined}
                hookchartToolbarActions={useIntegratedHookChartToolbar ? (
                  <div ref={headerRef} className="terminal-chart-header terminal-chart-integrated-toolbar flex items-center gap-1.5 text-xs select-none">
                    {terminalToolbarControls}
                  </div>
                ) : undefined}
                hookchartToolbarOverlays={useIntegratedHookChartToolbar ? (
                  <div ref={toolbarMenusRef} className="terminal-chart-integrated-menus">
                    {terminalToolbarMenus}
                  </div>
                ) : undefined}
                formation={chosenFormation || (chartProvider === 'hookchart' && coin?.timeframe === block.timeframe ? activeFormation : undefined)}
                customMarkers={chosenMarkers}
                previewMarkers={!!chosenFormation}
                tradeLevelToggle={tradeLevelToggle}
                symbol={block.symbol}
                exchange={block.exchange}
                marketType={block.marketType}
                timeframe={block.timeframe}
                historyLimit={isMaximized || isSingleBlock || isOnlyChart ? 1000 : 180}
              />
              </TerminalRenderBoundary>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-2 px-4 text-center text-slate-500">
            <span data-no-translate className="font-mono text-sm font-semibold text-slate-300">{block.symbol}</span>
            <span className="text-xs">{translatePhrase(language, "Віджет призупинено поза видимою областю. Прокрутіть до блока, щоб завантажити його.")}</span>
          </div>
        )}
      </div>

    </div>
  );
};

