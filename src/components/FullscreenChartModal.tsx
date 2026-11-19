import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../context/LanguageContext';
import { interpolate, translatePhrase } from '../locales';
import { localizeFormationRuntime } from '../utils/localizeFormationRuntime';
import {
  X,
  Send,
  Zap,
  TrendingUp,
  TrendingDown,
  Star,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ChevronUp,
  ChevronDown,
  Copy,
  Check,
} from 'lucide-react';
import { Kline, DetectedFormation, Timeframe, ExchangeId, MarketType, ChartMarkerInfo, ChartRestoreParams, ScannedCoin } from '../types';
import { TradingViewChart } from './TradingViewChart';
import { FullscreenMultiChart } from './fullscreen/FullscreenMultiChart';
import { MAX_FULLSCREEN_CHARTS, fullscreenFavoriteDestination, fullscreenFavoriteMenuPosition, fullscreenMarketKey, fullscreenMarketCollision, toggleFullscreenExchange, toggleFullscreenMarketType, nextFullscreenChartSlotId, type FullscreenChartSlot } from '../utils/fullscreenMultiChart';
import { normalizeTerminalMarketPair } from '../utils/terminalPresets';
import { copyTextToClipboard } from '../utils/copyTextToClipboard';
import type { VisualContextId } from './hookchart/visualProfiles';
import type { ArchiveChartCapture } from '../utils/archiveChartSnapshot';
import { SiteFooter } from './SiteFooter';
import { normalizeExchangeSymbol } from '../utils/marketSymbols';
import { chart24hPercent, useChartLive24hQuote } from '../utils/chart24hQuote';
import { fullscreenChartHistoryScope, scopedFullscreenChartKlines, sameFullscreenMarket } from '../utils/fullscreenChartScope';
import { formatCryptoPrice } from '../utils/formatters';
import { fetchDirectKlines } from '../utils/directExchangeClient';
import { getCoinWatchlistKey, resolveWatchlistEntries, watchlistEntryToChartCoin, isWatchlistMarketQuote, watchlistQuoteToScannedCoin } from '../utils/watchlistUtils';
import { defaultEarlyFormationLevelVisibility, earlyFormationChartMarkers, filterEarlyFormationChartMarkers, type EarlyFormationCandidate, type EarlyFormationLevelKey } from '../utils/earlyFormations';
import { applyClosedEarlyWickTouch, type TpSlRule } from '../utils/tpSlConstructor';

const favoriteDrawerLabels = {
  uk: { choose: 'Оберіть графік для заміни', chart: 'Графік', add: 'Додати ще один графік', copy: 'Копіювати символ', copied: 'Скопійовано', copyFailed: 'Не вдалося скопіювати', linking: 'Лінковка', quoteUnavailable: 'Немає актуальних котирувань', alreadyOpen: 'Монета вже відкрита в іншому блоці', pickBlock: 'Виберіть блок', block: 'Блок', drag: 'Перетягніть назву монети на потрібний графік', futuresShort: 'Ф’ЮЧ', spotShort: 'СПОТ', openCharts: 'Відкриті графіки', switchExchange: 'Перемкнути біржу', switchMarket: 'Перемкнути Spot/Futures', chartConnection: 'Підключення дивіться на вибраному графіку', nextChart: 'Показати наступний відкритий графік' },
  en: { choose: 'Choose a chart to replace', chart: 'Chart', add: 'Add another chart', copy: 'Copy symbol', copied: 'Copied', copyFailed: 'Could not copy', linking: 'Link to terminal', quoteUnavailable: 'Current quote unavailable', alreadyOpen: 'Market is already open in another chart', pickBlock: 'Choose block', block: 'Block', drag: 'Drag the coin name onto the chart you want to replace', futuresShort: 'FUT', spotShort: 'SPOT', openCharts: 'Open charts', switchExchange: 'Switch exchange', switchMarket: 'Switch Spot/Futures', chartConnection: 'See connection status on the selected chart', nextChart: 'Show next open chart' },
  pl: { choose: 'Wybierz wykres do zastąpienia', chart: 'Wykres', add: 'Dodaj kolejny wykres', copy: 'Kopiuj symbol', copied: 'Skopiowano', copyFailed: 'Nie udało się skopiować', linking: 'Połącz z terminalem', quoteUnavailable: 'Brak aktualnego kursu', alreadyOpen: 'Rynek jest już otwarty na innym wykresie', pickBlock: 'Wybierz blok', block: 'Blok', drag: 'Przeciągnij nazwę monety na wybrany wykres', futuresShort: 'FUT', spotShort: 'SPOT', openCharts: 'Otwarte wykresy', switchExchange: 'Zmień giełdę', switchMarket: 'Zmień Spot/Futures', chartConnection: 'Status połączenia jest widoczny na wybranym wykresie', nextChart: 'Pokaż następny otwarty wykres' },
  ru: { choose: 'Выберите график для замены', chart: 'График', add: 'Добавить ещё график', copy: 'Копировать символ', copied: 'Скопировано', copyFailed: 'Не удалось скопировать', linking: 'Линковка', quoteUnavailable: 'Нет актуальной котировки', alreadyOpen: 'Монета уже открыта в другом графике', pickBlock: 'Выберите блок', block: 'Блок', drag: 'Перетащите название монеты на нужный график', futuresShort: 'ФЬЮЧ', spotShort: 'СПОТ', openCharts: 'Открытые графики', switchExchange: 'Сменить биржу', switchMarket: 'Переключить Spot/Futures', chartConnection: 'Статус соединения — на выбранном графике', nextChart: 'Показать следующий открытый график' },
} as const;

interface FullscreenChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Standalone coin / early-chart route (avoids background screener overlay). */
  pageMode?: boolean;
  visualContext?: VisualContextId;
  /** Keep a standalone route in sync when a favorite or timeframe is selected. */
  onPageCoinChange?: (coin: ScannedCoin) => void;
  onPageTimeframeChange?: (timeframe: Timeframe) => void;
  coin: {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    exchange: ExchangeId;
    marketType: MarketType;
    currentPrice: number;
    priceChange24h: number;
    lastUpdated?: number;
    volume24hUsd?: number;
    exchangeUrl?: string;
  };
  formation?: DetectedFormation | null;
  /** Unconfirmed early scenario; never treated as a validated formation. */
  earlyCandidate?: EarlyFormationCandidate | null;
  /** Opt-in personal wick rule for the already-open chart stream. */
  earlyTouchRule?: TpSlRule;
  klines?: Kline[];
  currentTimeframe: string;
  onTimeframeChange?: (tf: Timeframe) => void;
  livePrice?: number | null;
  onOpenTelegramModal?: (data: any) => void;
  onSendMetaScalp?: (coin: any) => void;
  metaScalpBinding?: string;
  onAddToArchive?: (capture: ArchiveChartCapture) => void;
  isArchived?: boolean;
  customMarkers?: ChartMarkerInfo[];
  savedChartParams?: ChartRestoreParams;
  allCoins?: ScannedCoin[];
  watchlist?: string[];
  onToggleWatchlist?: (symbol: string) => void;
}

export const FullscreenChartModal: React.FC<FullscreenChartModalProps> = ({
  isOpen,
  onClose,
  pageMode = false,
  visualContext,
  onPageCoinChange,
  onPageTimeframeChange,
  coin,
  formation,
  earlyCandidate,
  earlyTouchRule,
  klines = [],
  currentTimeframe,
  onTimeframeChange,
  livePrice,
  onOpenTelegramModal,
  onSendMetaScalp,
  metaScalpBinding = '001',
  onAddToArchive,
  isArchived,
  customMarkers,
  savedChartParams,
  allCoins = [],
  watchlist = [],
  onToggleWatchlist,
}) => {
  const { language } = useLanguage();
  const favoriteLabel = favoriteDrawerLabels[language] || favoriteDrawerLabels.uk;
  const tr = (source: string) => localizeFormationRuntime(language, source);
  const tp = (template: string, params: Record<string,string|number>) => interpolate(translatePhrase(language, template), params);
  const [activeCoin, setActiveCoin] = useState(coin);
  const [timeframe, setTimeframe] = useState<string>(currentTimeframe || '15m');
  const marketKey = [activeCoin.exchange, activeCoin.marketType,
    normalizeExchangeSymbol(activeCoin.symbol)].join(':');
  const streamed24h = useChartLive24hQuote({
    exchange: activeCoin.exchange, marketType: activeCoin.marketType, symbol: activeCoin.symbol,
  }, isOpen);
  const change24h = chart24hPercent(activeCoin, streamed24h);
  const [trackedPrice, setTrackedPrice] = useState<{ marketKey: string; value: number } | null>(null);
  const statusKey = marketKey + ':' + timeframe;
  const [trackedStatus, setTrackedStatus] = useState<{
    statusKey: string; isConnected: boolean; mode: 'ws' | 'rest';
  } | null>(null);
  const chartLivePrice = trackedPrice?.marketKey === marketKey ? trackedPrice.value : null;
  const liveStatus = trackedStatus?.statusKey === statusKey
    ? trackedStatus : { isConnected: false, mode: 'rest' as const };
  // Callbacks from disposed chart streams cannot overwrite the next market.
  const reportPrice = useCallback((value: number) => {
    if (Number.isFinite(value) && value > 0) setTrackedPrice({ marketKey, value });
  }, [marketKey]);
  const reportStatus = useCallback((status: { isConnected: boolean; mode: 'ws' | 'rest' }) => {
    setTrackedStatus({ statusKey, ...status });
  }, [statusKey]);
  useEffect(() => { setTrackedPrice(null); }, [isOpen, marketKey]);
  useEffect(() => { setTrackedStatus(null); }, [isOpen, statusKey]);
  const [earlyLevelVisibility, setEarlyLevelVisibility] = useState(defaultEarlyFormationLevelVisibility);
  const [liveEarlyCandidate, setLiveEarlyCandidate] = useState<EarlyFormationCandidate | null>(earlyCandidate ?? null);
  useEffect(() => setLiveEarlyCandidate(earlyCandidate ?? null), [earlyCandidate]);
  const displayedEarlyCandidate = earlyCandidate && liveEarlyCandidate?.id === earlyCandidate.id
    && liveEarlyCandidate.observedAt === earlyCandidate.observedAt
      ? liveEarlyCandidate : earlyCandidate;
  // Collapsing the controls does not change which forecast lines are visible.
  const [areEarlyLevelControlsExpanded, setAreEarlyLevelControlsExpanded] = useState(true);
  const [isFavoritesDrawerOpen, setIsFavoritesDrawerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const favoriteRequestId = useRef(0);
  const [favoriteToAdd, setFavoriteToAdd] = useState<{ id: number; coin: ScannedCoin; targetId?: string } | null>(null);
  const [chartSlots, setChartSlots] = useState<FullscreenChartSlot[]>([]);
  const [activeChartSlotId, setActiveChartSlotId] = useState('primary');
  const marketChangeRequestId = useRef(0);
  const [marketChangeRequest, setMarketChangeRequest] = useState<{
    id: number; targetId: string; exchange: ExchangeId; marketType: MarketType;
  } | null>(null);
  const [chartSlotMenu, setChartSlotMenu] = useState<{
    left: number; top: number; width: number;
  } | null>(null);
  const chartSlotMenuRef = useRef<HTMLDivElement>(null);
  const chartSlotTriggerRef = useRef<HTMLButtonElement>(null);
  // Client-only destination picker, shown only with multiple open chart blocks.
  const [favoriteSlotMenu, setFavoriteSlotMenu] = useState<{
    key: string; left: number; top: number; width: number;
  } | null>(null);
  const favoriteSlotMenuRef = useRef<HTMLDivElement>(null);
  const favoriteSlotTriggerRef = useRef<HTMLElement | null>(null);
  const favoriteDraggingRef = useRef<ScannedCoin | null>(null);
  const touchFavoriteGestureRef = useRef<{
    pointerId: number; startX: number; startY: number; coin: ScannedCoin; dragging: boolean;
  } | null>(null);
  const suppressedFavoriteClickRef = useRef<{ key: string; until: number } | null>(null);
  const [draggedFavoriteKey, setDraggedFavoriteKey] = useState<string | null>(null);
  const [favoriteDropTargetId, setFavoriteDropTargetId] = useState<string | null>(null);
  const [favoriteCopyResult, setFavoriteCopyResult] = useState<{key:string;copied:boolean}|null>(null);
  const [marketFavoriteQuotes, setMarketFavoriteQuotes] = useState<ScannedCoin[]>([]);
  const [localWatchlist, setLocalWatchlist] = useState<string[]>(() => {
    try {
      const initial = watchlist && watchlist.length > 0 ? watchlist : JSON.parse(localStorage.getItem('crypto_screener_watchlist') || '[]');
      return Array.isArray(initial) ? Array.from(new Set(initial)) : [];
    } catch {
      return [];
    }
  });

  // The screener may omit saved markets. Request exact, lightweight public
  // exchange quotes only while the fullscreen favorites drawer is visible.
  // No separate exchange socket or formation scans are opened per favorite.
  const favoriteQuoteKeys = useMemo(() => [...new Set(localWatchlist.map(getCoinWatchlistKey))],
    [localWatchlist]);
  const favoriteQuoteSignature = favoriteQuoteKeys.join('|');
  useEffect(() => {
    if (!isOpen || !isFavoritesDrawerOpen || !favoriteQuoteSignature) {
      setMarketFavoriteQuotes([]);
      return;
    }
    const keys = favoriteQuoteSignature.split('|');
    const controller = new AbortController();
    let disposed = false;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const requests: Promise<any>[] = [];
        for (let i = 0; i < keys.length; i += 100) {
          requests.push(fetch('/api/market/favorite-quotes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keys: keys.slice(i, i + 100) }),
            cache: 'no-store',
            signal: controller.signal,
          }).then(async response => {
            if (!response.ok) throw new Error('Favorite quote request failed');
            const result = await response.json();
            if (!result.success || !Array.isArray(result.data)) throw new Error('Invalid favorite quote response');
            return result;
          }));
        }
        const replies = await Promise.all(requests);
        if (disposed) return;
        const now = Date.now();
        const sources = replies.flatMap(reply => Array.isArray(reply.sources) ? reply.sources : []);
        const freshSource = (exchange: string, marketType: string) => {
          const source = sources.find(item => item.exchange === exchange && item.marketType === marketType);
          return source?.status === 'live' && Number.isFinite(source.updatedAt) &&
            source.updatedAt > 0 && source.updatedAt <= now + 2000 && now - source.updatedAt < 75_000
            ? source.updatedAt as number : null;
        };
        const quotes = replies.flatMap(reply => reply.data)
          .filter(isWatchlistMarketQuote)
          .flatMap(quote => {
            const updatedAt = freshSource(quote.exchange, quote.marketType);
            return updatedAt === null ? [] : [watchlistQuoteToScannedCoin(quote, updatedAt)];
          });
        setMarketFavoriteQuotes(quotes);
      } catch {
        if (!disposed) setMarketFavoriteQuotes([]);
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 60_000);
    return () => { disposed = true; controller.abort(); window.clearInterval(interval); };
  }, [isOpen, isFavoritesDrawerOpen, favoriteQuoteSignature]);

  // If the selected secondary chart was removed, return focus to the original chart.
  useEffect(() => {
    if (chartSlots.length && !chartSlots.some(slot => slot.id === activeChartSlotId)) {
      setActiveChartSlotId('primary');
      setChartSlotMenu(null);
    }
  }, [chartSlots, activeChartSlotId]);

  // Sync localWatchlist with prop if parent updates
  useEffect(() => {
    // This page uses the authenticated, exchange-scoped favorites from App;
    // an emptied list must not revive stale global localStorage entries.
    if (pageMode || watchlist.length > 0) setLocalWatchlist(Array.from(new Set(watchlist)));
  }, [watchlist, pageMode]);

  // Only a market switch replaces the active chart; live price changes must
  // not reset a favorite or open another price/candle subscription.
  const incomingCoinRef = useRef(coin);
  incomingCoinRef.current = coin;
  useEffect(() => {
    setActiveCoin(incomingCoinRef.current);
  }, [coin.symbol, coin.exchange, coin.marketType]);

  const chartHistoryScope = fullscreenChartHistoryScope(activeCoin.exchange, activeCoin.marketType, activeCoin.symbol, timeframe);
  const suppliedHistoryScope = fullscreenChartHistoryScope(coin.exchange, coin.marketType, coin.symbol, currentTimeframe || '15m');
  const hasSuppliedHistory = klines.length > 0 && suppliedHistoryScope === chartHistoryScope;
  const [history, setHistory] = useState<{ scope: string; rows: Kline[] } | null>(() =>
    klines.length ? { scope: suppliedHistoryScope, rows: klines } : null);
  const activeKlines = scopedFullscreenChartKlines(history, chartHistoryScope);
  const [historyRequest, setHistoryRequest] = useState<{
    scope: string; status: 'loading' | 'ready' | 'failed';
  } | null>(null);
  const [historyRetry, setHistoryRetry] = useState(0);
  const historyStatus = hasSuppliedHistory ? 'ready'
    : historyRequest?.scope === chartHistoryScope ? historyRequest.status : 'loading';

  // Parent candle sets are already matched to their own market/timeframe.
  // Never adopt a prior coin's history after a watchlist switch.
  useEffect(() => {
    if (!hasSuppliedHistory) return;
    setHistory(previous => previous?.scope === suppliedHistoryScope && previous.rows === klines
      ? previous : { scope: suppliedHistoryScope, rows: klines });
  }, [hasSuppliedHistory, suppliedHistoryScope, klines]);

  // Fullscreen routes without supplied candles fetch only their exact market
  // and timeframe. Parent-supplied candle history avoids a duplicate request.
  useEffect(() => {
    if (!isOpen || hasSuppliedHistory) return;
    const controller = new AbortController();
    let cancelled = false;
    const scope = chartHistoryScope;
    const cleanSym = normalizeExchangeSymbol(activeCoin.symbol);
    setHistoryRequest({ scope, status: 'loading' });

    const fetchHistory = async () => {
      let rows: Kline[] = [];
      try {
        const res = await fetch(
          `/api/klines?exchange=${activeCoin.exchange}&market=${activeCoin.marketType}&symbol=${encodeURIComponent(cleanSym)}&timeframe=${timeframe}&limit=1000`,
          { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) },
        );
        if (res.ok) {
          const payload = await res.json();
          if (payload.success && Array.isArray(payload.data) && payload.data.length > 0) {
            rows = payload.data;
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn('Fullscreen chart candle relay unavailable', error);
      }
      if (!rows.length && !controller.signal.aborted) {
        try {
          rows = await fetchDirectKlines(activeCoin.exchange, activeCoin.marketType,
            cleanSym, timeframe as Timeframe, 1000);
        } catch (error) {
          console.warn('Fullscreen chart direct candle recovery unavailable', error);
        }
      }
      if (cancelled || controller.signal.aborted) return;
      if (rows.length > 0) setHistory({ scope, rows });
      setHistoryRequest({ scope, status: rows.length > 0 ? 'ready' : 'failed' });
    };
    void fetchHistory();
    return () => { cancelled = true; controller.abort(); };
  }, [isOpen, chartHistoryScope, hasSuppliedHistory, historyRetry,
    activeCoin.exchange, activeCoin.marketType, activeCoin.symbol, timeframe]);
  // Keep exchange/market identity from the account's real watchlist.
  const handleRemoveFromWatchlist = (favCoin: ScannedCoin, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = getCoinWatchlistKey(favCoin);
    setLocalWatchlist(previous => {
      const next = previous.filter(saved => getCoinWatchlistKey(saved) !== key);
      if (!pageMode) {
        try { localStorage.setItem('crypto_screener_watchlist', JSON.stringify(next)); } catch {}
      }
      return next;
    });
    onToggleWatchlist?.(key);
  };

  const favoriteCoins = useMemo(() =>
    resolveWatchlistEntries(localWatchlist, [...marketFavoriteQuotes, ...allCoins])
      .map(entry => watchlistEntryToChartCoin(entry, timeframe as Timeframe)),
    [allCoins, marketFavoriteQuotes, localWatchlist, timeframe]);

  // Filter favorites by search query
  const filteredFavorites = useMemo(() => {
    if (!searchQuery.trim()) return favoriteCoins;
    const q = searchQuery.toLowerCase().trim();
    return favoriteCoins.filter(
      (c) =>
        c.symbol.toLowerCase().includes(q) ||
        c.baseAsset.toLowerCase().includes(q)
    );
  }, [favoriteCoins, searchQuery]);
  const favoriteSlotCoin = favoriteSlotMenu
    ? favoriteCoins.find(coin => getCoinWatchlistKey(coin) === favoriteSlotMenu.key)
    : null;

  // A click opens a target menu for two or more charts; a single chart still
  // switches directly. Dragging a coin onto a specific chart stays unchanged.
  const applyFavoriteToSlot = (favCoin: ScannedCoin, requestedId: string) => {
    if (!chartSlots.some(slot => slot.id === requestedId)) return;
    const { targetId, alreadyOpen } = fullscreenFavoriteDestination(chartSlots, requestedId, favCoin);
    setActiveChartSlotId(targetId);
    if (alreadyOpen) return; // Focus an existing chart instead of duplicating exchange streams.
    if (targetId === 'primary') onPageCoinChange?.(favCoin);
    else setFavoriteToAdd({ id: ++favoriteRequestId.current, coin: favCoin, targetId });
  };

  const handleSelectFavoriteCoin = (favCoin: ScannedCoin, event?: React.MouseEvent<HTMLElement>) => {
    if (pageMode && !earlyCandidate) {
      if (chartSlots.length > 1 && event) {
        const key = getCoinWatchlistKey(favCoin);
        const rect = event.currentTarget.getBoundingClientRect();
        const position = fullscreenFavoriteMenuPosition(rect,
          { width: window.innerWidth, height: window.innerHeight }, chartSlots.length);
        favoriteSlotTriggerRef.current = event.currentTarget;
        setFavoriteSlotMenu(current => current?.key === key ? null : { key, ...position });
        return;
      }
      if (chartSlots.length > 0) applyFavoriteToSlot(favCoin, activeChartSlotId);
      else onPageCoinChange?.(favCoin);
      return;
    }
    if (pageMode) onPageCoinChange?.(favCoin);
    setActiveCoin({
      symbol: favCoin.symbol,
      baseAsset: favCoin.baseAsset,
      quoteAsset: favCoin.quoteAsset,
      exchange: favCoin.exchange,
      marketType: favCoin.marketType,
      currentPrice: favCoin.currentPrice,
      priceChange24h: favCoin.priceChange24h,
      lastUpdated: favCoin.lastUpdated,
      volume24hUsd: favCoin.volume24hUsd,
      exchangeUrl: favCoin.exchangeUrl,
    });
  };

  const clearFavoriteDrag = () => {
    favoriteDraggingRef.current = null;
    touchFavoriteGestureRef.current = null;
    setDraggedFavoriteKey(null);
    setFavoriteDropTargetId(null);
  };

  const chartUnderPointer = (x: number, y: number): string | null => {
    const target = document.elementFromPoint(x, y)?.closest('[data-fullscreen-chart-id]');
    const id = target?.getAttribute('data-fullscreen-chart-id');
    return id && chartSlots.some(slot => slot.id === id) ? id : null;
  };

  const acceptFavoriteDrop = (targetId: string) => {
    const draggedCoin = favoriteDraggingRef.current;
    if (draggedCoin && pageMode && !earlyCandidate && chartSlots.length > 0) {
      applyFavoriteToSlot(draggedCoin, targetId);
    }
    clearFavoriteDrag();
  };

  const startTouchFavorite = (event: React.PointerEvent<HTMLButtonElement>, coin: ScannedCoin) => {
    if (!pageMode || earlyCandidate || !chartSlots.length || !event.isPrimary
      || (event.pointerType === 'mouse' && event.button !== 0)) return;
    touchFavoriteGestureRef.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, coin, dragging: false,
    };
    // Touch needs pointer capture; native HTML drag-and-drop owns the mouse pointer.
    if (event.pointerType !== 'mouse') event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveTouchFavorite = (event: Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'>) => {
    const gesture = touchFavoriteGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!gesture.dragging && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >= 12) {
      gesture.dragging = true;
      favoriteDraggingRef.current = gesture.coin;
      setDraggedFavoriteKey(getCoinWatchlistKey(gesture.coin));
    }
    if (gesture.dragging) setFavoriteDropTargetId(chartUnderPointer(event.clientX, event.clientY));
  };
  const finishFavoritePointer = (pointerId: number, x: number, y: number, cancelled = false): boolean => {
    const gesture = touchFavoriteGestureRef.current;
    if (!gesture || gesture.pointerId !== pointerId) return false;
    touchFavoriteGestureRef.current = null;
    if (!gesture.dragging) return false;
    // Prevent the synthesized click after a drop from selecting a different chart.
    suppressedFavoriteClickRef.current = { key: getCoinWatchlistKey(gesture.coin), until: Date.now() + 450 };
    const targetId = cancelled ? null : chartUnderPointer(x, y);
    if (targetId) acceptFavoriteDrop(targetId);
    else clearFavoriteDrag();
    return true;
  };
  const stopTouchFavorite = (event: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
    if (finishFavoritePointer(event.pointerId, event.clientX, event.clientY, cancelled)) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  // One pointer-handler registration per opened drawer. Each handler reads
  // current chart slots; moving a favorite must not reattach DOM listeners.
  const favoriteGestureActionsRef = useRef({
    moveTouchFavorite, finishFavoritePointer, chartUnderPointer,
    clearFavoriteDrag, acceptFavoriteDrop,
  });
  favoriteGestureActionsRef.current = {
    moveTouchFavorite, finishFavoritePointer, chartUnderPointer,
    clearFavoriteDrag, acceptFavoriteDrop,
  };
  // The chart canvas may consume bubbled drag/drop events. Capture them before
  // HookChart's gesture handlers; use a pointer fallback for browsers/webviews
  // that do not initiate native HTML5 drag from a button.
  useEffect(() => {
    if (!isFavoritesDrawerOpen || !pageMode || earlyCandidate) return;
    const handlePointerMove = (event: PointerEvent) => favoriteGestureActionsRef.current.moveTouchFavorite(event);
    const handlePointerUp = (event: PointerEvent) => {
      if (favoriteGestureActionsRef.current.finishFavoritePointer(event.pointerId, event.clientX, event.clientY)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const handlePointerCancel = (event: PointerEvent) => {
      favoriteGestureActionsRef.current.finishFavoritePointer(event.pointerId, event.clientX, event.clientY, true);
    };
    const onFavoriteNativeDragOver = (event: DragEvent) => {
      if (!favoriteDraggingRef.current) return;
      const targetId = favoriteGestureActionsRef.current.chartUnderPointer(event.clientX, event.clientY);
      setFavoriteDropTargetId(targetId);
      if (!targetId) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onFavoriteNativeDrop = (event: DragEvent) => {
      if (!favoriteDraggingRef.current) return;
      const targetId = favoriteGestureActionsRef.current.chartUnderPointer(event.clientX, event.clientY);
      if (!targetId) { favoriteGestureActionsRef.current.clearFavoriteDrag(); return; }
      event.preventDefault();
      event.stopPropagation();
      favoriteGestureActionsRef.current.acceptFavoriteDrop(targetId);
    };
    document.addEventListener('pointermove', handlePointerMove, true);
    document.addEventListener('pointerup', handlePointerUp, true);
    document.addEventListener('pointercancel', handlePointerCancel, true);
    document.addEventListener('dragover', onFavoriteNativeDragOver, true);
    document.addEventListener('drop', onFavoriteNativeDrop, true);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove, true);
      document.removeEventListener('pointerup', handlePointerUp, true);
      document.removeEventListener('pointercancel', handlePointerCancel, true);
      document.removeEventListener('dragover', onFavoriteNativeDragOver, true);
      document.removeEventListener('drop', onFavoriteNativeDrop, true);
    };
  }, [isFavoritesDrawerOpen, pageMode, earlyCandidate, chartSlots]);

  const copyFavoriteSymbol = async (favCoin: ScannedCoin) => {
    const key = getCoinWatchlistKey(favCoin);
    const copied = await copyTextToClipboard(normalizeExchangeSymbol(favCoin.symbol).toUpperCase());
    setFavoriteCopyResult({ key, copied });
  };

  useEffect(() => {
    if (!isOpen || !pageMode || earlyCandidate || !isFavoritesDrawerOpen || chartSlots.length < 2)
      setFavoriteSlotMenu(null);
  }, [isOpen, pageMode, earlyCandidate, isFavoritesDrawerOpen, chartSlots.length]);

  // Portaled menu stays visible at the bottom of a scrollable favorites list.
  // Its interactions never trigger chart/exchange requests until a slot is chosen.
  useEffect(() => {
    if (!favoriteSlotMenu) return;
    const dismiss = () => setFavoriteSlotMenu(null);
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (favoriteSlotMenuRef.current?.contains(event.target)
        || favoriteSlotTriggerRef.current?.contains(event.target)) return;
      dismiss();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    favoriteSlotMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [favoriteSlotMenu]);

  // Closing the drawer cancels a pending drag without replacing any chart.
  useEffect(() => {
    if (!isFavoritesDrawerOpen || !pageMode || earlyCandidate) clearFavoriteDrag();
  }, [isFavoritesDrawerOpen, pageMode, earlyCandidate]);

  // Sync internal timeframe if parent changes
  useEffect(() => {
    if (currentTimeframe) {
      setTimeframe(currentTimeframe);
    }
  }, [currentTimeframe]);

  // Handle escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        if (chartSlotMenu) {
          setChartSlotMenu(null);
          chartSlotTriggerRef.current?.focus({ preventScroll: true });
          return;
        }
        if (favoriteSlotMenu) {
          setFavoriteSlotMenu(null);
          favoriteSlotTriggerRef.current?.focus({ preventScroll: true });
          return;
        }
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, favoriteSlotMenu, chartSlotMenu]);

  // Prevent background body scroll when open
  useEffect(() => {
    if (!isOpen) return;

    if (pageMode) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, pageMode]);

  // A selected secondary chart is reflected in the fullscreen header.
  // The header itself opens no extra price streams for other chart panels.
  const selectedHeaderSlot = activeChartSlotId === 'primary'
    ? null : chartSlots.find(slot => slot.id === activeChartSlotId) ?? null;
  const headerMarket = selectedHeaderSlot ?? activeCoin;
  const headerSlotId = selectedHeaderSlot?.id ?? 'primary';
  const knownSecondaryCoin = selectedHeaderSlot
    ? allCoins.find(candidate => fullscreenMarketKey(candidate) === fullscreenMarketKey(selectedHeaderSlot))
    : undefined;
  const headerPair = selectedHeaderSlot
    ? normalizeTerminalMarketPair(selectedHeaderSlot.symbol, knownSecondaryCoin?.quoteAsset)
    : { symbol: activeCoin.symbol, quoteAsset: activeCoin.quoteAsset };
  const headerQuote = selectedHeaderSlot ? (knownSecondaryCoin?.quoteAsset ?? headerPair.quoteAsset) : activeCoin.quoteAsset;
  const headerBase = selectedHeaderSlot
    ? (knownSecondaryCoin?.baseAsset ?? headerPair.symbol.slice(0, -headerQuote.length))
    : activeCoin.baseAsset;

  // Tapping the coin name cycles the header focus through the *visible*
  // chart order, without scrolling the page away from the header. Existing
  // Binance/Bybit and Spot/Futures controls then act on that selected slot.
  const cycleHeaderChart = () => {
    if (!pageMode || earlyCandidate || chartSlots.length < 2) return;
    setChartSlotMenu(null);
    setActiveChartSlotId(currentId => nextFullscreenChartSlotId(chartSlots, currentId));
  };

  const chooseHeaderChart = (id: string) => {
    setChartSlotMenu(null);
    if (!chartSlots.some(slot => slot.id === id)) return;
    setActiveChartSlotId(id);
    // Selecting an existing chart focuses it, without opening another feed.
    const element = Array.from(document.querySelectorAll<HTMLElement>('[data-fullscreen-chart-id]'))
      .find(node => node.dataset.fullscreenChartId === id);
    element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const toggleHeaderMarket = (patch: { exchange?: ExchangeId; marketType?: MarketType }) => {
    const target = { ...headerMarket, ...patch };
    if (fullscreenMarketKey(target) === fullscreenMarketKey(headerMarket)) return;
    const occupied = fullscreenMarketCollision(chartSlots, headerSlotId, target);
    if (occupied) {
      // The same market is already visible; focus it instead of subscribing twice.
      chooseHeaderChart(occupied.id);
      return;
    }
    if (headerSlotId !== 'primary') {
      setMarketChangeRequest({
        id: ++marketChangeRequestId.current, targetId: headerSlotId,
        exchange: target.exchange, marketType: target.marketType,
      });
      return;
    }
    const exact = allCoins.find(candidate => fullscreenMarketKey(candidate) === fullscreenMarketKey(target));
    const nextCoin = {
      ...activeCoin,
      exchange: target.exchange, marketType: target.marketType,
      // Do not carry old-exchange quote/volume/24h statistics into the new market.
      currentPrice: exact?.currentPrice ?? 0,
      priceChange24h: exact?.priceChange24h ?? 0,
      volume24hUsd: exact?.volume24hUsd ?? 0,
      lastUpdated: exact?.lastUpdated ?? 0,
      exchangeUrl: exact?.exchangeUrl ?? '',
    };
    setActiveCoin(nextCoin);
    setTrackedPrice(null);
    setTrackedStatus(null);
    if (pageMode && onPageCoinChange) {
      const nextScannedCoin: ScannedCoin = exact
        ? { ...exact, timeframe: timeframe as Timeframe }
        : {
          ...nextCoin,
          highPrice24h: 0, lowPrice24h: 0, formations: [],
          timeframe: timeframe as Timeframe, exchangeUrl: '',
        };
      onPageCoinChange(nextScannedCoin);
    }
  };

  // The header scrolls horizontally on phones, so render its popover in a
  // portal instead of letting the header clip the chart dropdown.
  useEffect(() => {
    if (!chartSlotMenu) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!chartSlotMenuRef.current?.contains(target) && !chartSlotTriggerRef.current?.contains(target))
        setChartSlotMenu(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [chartSlotMenu]);

  const handleTimeframeSelect = (tf: Timeframe) => {
    setTimeframe(tf);
    onTimeframeChange?.(tf);
    if (pageMode) onPageTimeframeChange?.(tf);
  };

  // A watchlist selection may temporarily or permanently differ from the
  // formation that opened this chart. Never reuse the old setup on the new market.
  const samePropMarket = sameFullscreenMarket(activeCoin, coin);
  const activeFormation = samePropMarket ? formation : null;
  const showEarlyLevels = !!earlyCandidate && samePropMarket;
  const visibleChartMarkers = useMemo(() => {
    if (!displayedEarlyCandidate) return samePropMarket ? customMarkers : undefined;
    if (!showEarlyLevels) return [];
    const markers = displayedEarlyCandidate.tpSlBuilder
      ? earlyFormationChartMarkers(displayedEarlyCandidate)
      : customMarkers ?? earlyFormationChartMarkers(displayedEarlyCandidate);
    return filterEarlyFormationChartMarkers(
      markers, displayedEarlyCandidate, earlyLevelVisibility,
    );
  }, [displayedEarlyCandidate, customMarkers, earlyLevelVisibility, showEarlyLevels, samePropMarket]);
  const toggleEarlyLevel = (level: EarlyFormationLevelKey) =>
    setEarlyLevelVisibility(previous => ({ ...previous, [level]: !previous[level] }));

  if (!isOpen) return null;

  const displayPrice = chartLivePrice ?? (samePropMarket && livePrice && livePrice > 0
    ? livePrice : activeCoin.currentPrice);
  const headerPrice = selectedHeaderSlot ? (knownSecondaryCoin?.currentPrice ?? null) : displayPrice;
  const headerChange24h = selectedHeaderSlot
    ? (knownSecondaryCoin && knownSecondaryCoin.currentPrice > 0
      ? knownSecondaryCoin.priceChange24h : null)
    : change24h;
  const isPositive = headerChange24h === null ? null : headerChange24h >= 0;
  // Header shortcuts must operate on the selected chart, not the primary
  // chart's old market when a secondary block is selected.
  const headerActionCoin = selectedHeaderSlot
    ? knownSecondaryCoin ?? {
        symbol: selectedHeaderSlot.symbol,
        baseAsset: headerBase, quoteAsset: headerQuote,
        exchange: selectedHeaderSlot.exchange, marketType: selectedHeaderSlot.marketType,
        currentPrice: headerPrice ?? 0, priceChange24h: 0,
        highPrice24h: 0, lowPrice24h: 0, volume24hUsd: 0,
        formations: [], timeframe: timeframe as Timeframe,
        lastUpdated: 0, exchangeUrl: '',
      }
    : activeCoin;
  const isBullish = activeFormation?.bias === 'bullish';
  const isBearish = activeFormation?.bias === 'bearish';

  const content = (
    <div
      className={pageMode
        ? 'relative flex w-full min-h-[100dvh] flex-col bg-transparent'
        : 'fixed inset-0 z-[100] w-screen h-[100dvh] max-h-[100dvh] min-h-[100dvh] bg-[#090d16] flex flex-col overflow-hidden animate-in fade-in duration-200'}
      role={pageMode ? 'region' : 'dialog'}
      aria-modal={pageMode ? undefined : true}
      aria-label={tr("Повноекранний графік HookChart")}
    >
      {/* Top Fullscreen Header & Controls */}
      <header className="h-12 sm:h-14 bg-slate-950/95 border-b border-slate-800 px-2.5 sm:px-4 flex items-center justify-between gap-2 shrink-0 z-20 overflow-x-auto no-scrollbar touch-scroll">
        {/* Left: Instrument and price. Exit remains available via the right-hand close button. */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Live indicator first, then the selected chart's coin and markets. */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            <div
              className={`flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full border text-[10px] sm:text-[11px] font-mono font-medium ${
                headerSlotId === 'primary' && liveStatus.isConnected
                  ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400'
              }`}
              title={headerSlotId === 'primary'
                ? tp('Оновлення в реальному часі ({{mode}})', { mode: liveStatus.mode.toUpperCase() })
                : favoriteLabel.chartConnection}
            >
              <span className="relative flex h-2 w-2">
                {headerSlotId === 'primary' && liveStatus.isConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${
                  headerSlotId === 'primary' && liveStatus.isConnected ? 'bg-emerald-500' : 'bg-slate-500'
                }`} />
              </span>
              <span className="font-bold tracking-wider">
                {headerSlotId === 'primary' && liveStatus.mode === 'ws' ? '⚡' : '●'}
              </span>
            </div>

            {pageMode && !earlyCandidate && chartSlots.length > 1 ? (
              <button type="button" data-no-translate data-fullscreen-next-chart
                onClick={cycleHeaderChart}
                aria-label={favoriteLabel.nextChart}
                title={favoriteLabel.nextChart}
                className="font-mono font-extrabold text-white text-sm sm:text-base tracking-wide whitespace-nowrap rounded px-0.5 cursor-pointer hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
                {headerBase}/{headerQuote}
              </button>
            ) : (
              <span data-no-translate className="font-mono font-extrabold text-white text-sm sm:text-base tracking-wide whitespace-nowrap">
                {headerBase}/{headerQuote}
              </span>
            )}
            {pageMode && !earlyCandidate && chartSlots.length > 1 && (
              <button ref={chartSlotTriggerRef} type="button"
                data-fullscreen-chart-selector
                aria-haspopup="menu"
                aria-expanded={!!chartSlotMenu}
                aria-label={favoriteLabel.openCharts}
                title={favoriteLabel.openCharts}
                onClick={() => {
                  if (chartSlotMenu) { setChartSlotMenu(null); return; }
                  const rect = chartSlotTriggerRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setChartSlotMenu(fullscreenFavoriteMenuPosition(rect,
                    { width: window.innerWidth, height: window.innerHeight }, chartSlots.length));
                }}
                className="flex shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-900/80 px-1 py-0.5 text-cyan-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}

            <button type="button" data-fullscreen-exchange-toggle
              onClick={() => toggleHeaderMarket({ exchange: toggleFullscreenExchange(headerMarket.exchange) })}
              aria-label={favoriteLabel.switchExchange}
              title={favoriteLabel.switchExchange}
              className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                headerMarket.exchange === 'binance'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                  : 'bg-orange-500/15 text-orange-300 border-orange-500/30 hover:bg-orange-500/25'
              }`}>
              {headerMarket.exchange}
            </button>
            <button type="button" data-fullscreen-market-toggle
              onClick={() => toggleHeaderMarket({ marketType: toggleFullscreenMarketType(headerMarket.marketType) })}
              aria-label={favoriteLabel.switchMarket}
              title={favoriteLabel.switchMarket}
              className="shrink-0 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-200 transition-colors hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
              {tr(headerMarket.marketType === 'futures' ? 'Futures' : 'Spot')}
            </button>
          </div>

          {/* Real-time Price */}
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-xs font-mono font-bold shrink-0 ${
              isPositive === null
                ? 'bg-slate-900/70 text-slate-200 border-slate-700/60'
                : isPositive
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                  : 'bg-rose-950/60 text-rose-300 border-rose-800/60'
            }`}
          >
            <span>${headerPrice !== null && headerPrice > 0 ? formatCryptoPrice(headerPrice) : '—'}</span>
            <span className="text-[10px] hidden sm:inline" title={headerChange24h === null ? tr('Немає актуальних даних за 24 години') : undefined}>
              {headerChange24h === null ? '(—)' : `(${isPositive ? '+' : ''}${headerChange24h.toFixed(2)}%)`}
            </span>
          </div>

          {/* Formation Bias Badge (if present) */}
          {activeFormation && (
            <div
              className={`hidden xl:flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold uppercase border shrink-0 ${
                isBullish
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : isBearish
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
              }`}
              title={tr(activeFormation.name)}
            >
              <span>{tr(activeFormation.name)}</span>
              <span>{isBullish ? '▲ LONG' : isBearish ? '▼ SHORT' : 'NEUTRAL'}</span>
            </div>
          )}
        </div>

        {/* Right: Quick actions & Exit Button */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Favorites drawer, directly before Telegram. */}
          <button
            onClick={() => setIsFavoritesDrawerOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
              isFavoritesDrawerOpen
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-950/40'
                : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:text-white hover:border-slate-700'
            }`}
            title={tr(isFavoritesDrawerOpen ? 'Сховати шторку обраних монет' : 'Відкрити шторку обраних монет')}
          >
            <Star className={`w-3.5 h-3.5 text-amber-400 ${localWatchlist.length > 0 ? 'fill-amber-400' : ''}`} />
            <span className="hidden xs:inline">{tr('Обрані монети')}</span>
            <span className="text-[10px] font-mono font-bold text-amber-300">
              {localWatchlist.length}
            </span>
          </button>

          {/* Telegram Alert shortcut */}
          {onOpenTelegramModal && (
            <button
              onClick={() =>
                onOpenTelegramModal({
                  symbol: headerMarket.symbol,
                  exchange: headerMarket.exchange,
                  marketType: headerMarket.marketType,
                  currentPrice: headerPrice ?? 0,
                  targetPrice: selectedHeaderSlot ? undefined : activeFormation?.levels.targetPrice,
                  formationName: selectedHeaderSlot ? undefined : activeFormation?.name,
                })
              }
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 transition-all active:scale-95 cursor-pointer"
              title={tr("Створити сповіщення в Telegram")}
              aria-label={tr("Створити сповіщення в Telegram")}
            >
              <Send className="w-3.5 h-3.5 text-sky-400" />
            </button>
          )}

          {/* MetaScalp shortcut */}
          {onSendMetaScalp && (
            <button
              onClick={() => onSendMetaScalp(headerActionCoin)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all active:scale-95 cursor-pointer"
              title={tp('Надіслати в обраний термінал (Група {{group}})', { group: metaScalpBinding })}
              aria-label={tp('Надіслати в обраний термінал (Група {{group}})', { group: metaScalpBinding })}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
            </button>
          )}

          {/* Close Modal X Icon */}
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-colors cursor-pointer"
            title={tr("Закрити повноцінний графік (Esc)")}
            aria-label={tr("Закрити повноцінний графік")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {displayedEarlyCandidate && (
        <div className="shrink-0 border-b border-amber-500/30 bg-slate-950/85 px-2 sm:px-3 py-1.5 space-y-1">
          {showEarlyLevels ? (
            <>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] sm:text-[11px] leading-4">
                <strong className="text-amber-200">{tr('Можлива формація:')} {tr(displayedEarlyCandidate.name)}</strong>
                <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1 py-0.5 text-[9px] leading-3 text-amber-300">
                  {tr(displayedEarlyCandidate.stage === 'forming' ? 'Формується' : 'Потенційна')}
                </span>
                <span className="text-slate-400">{tr('Попередній сценарій, не підтверджений сигнал')}</span>
                {displayedEarlyCandidate.tpSlBuilder && (
                  <span className={displayedEarlyCandidate.tpSlBuilder.touches.ready
                    ? 'text-emerald-300' : 'text-amber-300'}
                    aria-live="polite">
                    {tr('Дотики')} {displayedEarlyCandidate.bias === 'bullish' ? 'Low' : 'High'}:
                    {' '}{displayedEarlyCandidate.tpSlBuilder.touches.verified
                      ? `${displayedEarlyCandidate.tpSlBuilder.touches.count}/${displayedEarlyCandidate.tpSlBuilder.touches.required}`
                      : tr('немає перевірених даних')}
                    {' · '}{displayedEarlyCandidate.tpSlBuilder.touches.ready
                      ? tr('умову дотиків виконано') : tr('очікуємо')} {tr('(після закриття свічки)')}
                  </span>
                )}
                {!displayedEarlyCandidate.tickVerified && (
                  <span className="text-orange-300" title={tr("Не вдалося отримати біржовий крок ціни; рівні лише орієнтовні")}>
                    {tr('Крок ціни не перевірено')}
                  </span>
                )}
                <button type="button"
                  onClick={() => setAreEarlyLevelControlsExpanded(expanded => !expanded)}
                  aria-expanded={areEarlyLevelControlsExpanded}
                  aria-controls="early-formation-level-controls"
                  aria-label={tr(areEarlyLevelControlsExpanded ? 'Згорнути панель прогнозних міток' : 'Розгорнути панель прогнозних міток')}
                  title={tr(areEarlyLevelControlsExpanded ? 'Згорнути мітки' : 'Розгорнути мітки')}
                  className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded border border-slate-700 bg-slate-800/70 px-1 py-0.5 text-[9px] leading-3 font-semibold text-cyan-200 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
                  <span>{tr('Мітки')}</span>
                  {areEarlyLevelControlsExpanded
                    ? <ChevronUp className="h-3 w-3" aria-hidden="true" />
                    : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
                </button>
              </div>
              <div id="early-formation-level-controls"
                className={areEarlyLevelControlsExpanded
                  ? 'flex flex-wrap items-center gap-1 sm:gap-1.5 font-mono'
                  : 'hidden'}
                role="group" aria-label={tr("Натисніть на прогнозний рівень, щоб увімкнути або вимкнути його лінії на графіку")}>
                {([
                  { key: 'earlyEntry', name: 'Ранній вхід', value: displayedEarlyCandidate.tpSlBuilder?.touches.ready === false ? tp('Очікування дотиків {{count}}/{{required}}', { count: displayedEarlyCandidate.tpSlBuilder.touches.count, required: displayedEarlyCandidate.tpSlBuilder.touches.required }) : `${formatCryptoPrice(displayedEarlyCandidate.earlyEntryMin)} – ${formatCryptoPrice(displayedEarlyCandidate.earlyEntryMax)}`, color: 'text-sky-300 border-sky-500/30 bg-sky-500/10' },
                  { key: 'breakoutEntry', name: 'Вхід після пробою', value: displayedEarlyCandidate.tpSlBuilder?.touches.ready === false ? tr('Очікування дотиків') : `${formatCryptoPrice(displayedEarlyCandidate.breakoutEntry)}`, color: 'text-violet-300 border-violet-500/30 bg-violet-500/10' },
                  { key: 'target', name: 'Прогноз TP', value: `$${formatCryptoPrice(displayedEarlyCandidate.target)}`, color: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
                  { key: 'earlyStop', name: 'SL ранній', value: `$${formatCryptoPrice(displayedEarlyCandidate.stopLoss)}`, color: 'text-rose-300 border-rose-500/30 bg-rose-500/10' },
                  { key: 'breakoutStop', name: 'SL пробій', value: `$${formatCryptoPrice(displayedEarlyCandidate.breakoutStopLoss)}`, color: 'text-orange-300 border-orange-500/30 bg-orange-500/10' },
                  { key: 'neckline', name: 'Шия', value: `$${formatCryptoPrice(displayedEarlyCandidate.neckline)}`, color: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
                ] as const).map(level => (
                  <button key={level.key} type="button"
                    onClick={() => toggleEarlyLevel(level.key)}
                    aria-pressed={earlyLevelVisibility[level.key]}
                    aria-label={`${tr(level.name)}: ${level.value}. ${tr(earlyLevelVisibility[level.key] ? 'Приховати' : 'Показати')} ${tr('лінію на графіку')}`}
                    title={`${tr(earlyLevelVisibility[level.key] ? 'Приховати' : 'Показати')} ${tr(level.name)}`}
                    className={`inline-flex shrink-0 whitespace-nowrap items-center gap-x-1 rounded-md border px-1.5 py-1 text-[10px] leading-4 sm:text-[11px] text-left transition-colors hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${earlyLevelVisibility[level.key] ? level.color : 'bg-slate-900/60 border-slate-800 text-slate-500 line-through'}`}>
                    <span>{tr(level.name)}:</span>
                    <strong>{level.value}</strong>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-amber-200">
              {tp('Можлива формація: {{name}}. Прогноз приховано — відкрито іншу монету або ринок.', { name: tr(displayedEarlyCandidate.name) })}
            </p>
          )}
        </div>
      )}

      {/* Fullscreen Chart Display Area (100% remaining viewport) */}
      <main className={pageMode
        ? 'site-chart-frame relative h-[calc(100dvh-3.5rem)] min-h-[400px] w-full shrink-0 overflow-hidden bg-[#090d16]'
        : 'site-chart-frame flex-1 min-h-0 w-full relative overflow-hidden bg-[#090d16]'}>
        {/* Collapsible Left Drawer (Шторка зліва з обраними монетами) */}
        <div
          className={`absolute top-0 bottom-0 left-0 z-30 w-72 sm:w-80 bg-slate-950/95 border-r border-slate-800 backdrop-blur-md flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
            isFavoritesDrawerOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
          }`}
        >
          {/* Drawer Header */}
          <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span className="font-bold text-xs sm:text-sm text-white">{tr('Обрані монети')}</span>
              <span className="text-[10px] font-mono font-bold text-amber-300">
                {localWatchlist.length}
              </span>
            </div>
            <button
              onClick={() => setIsFavoritesDrawerOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title={tr("Сховати шторку")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search Input in Drawer */}
          <div className="p-2.5 border-b border-slate-800/80 bg-slate-950/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tr("Пошук в обраному...")}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Coins List in Drawer */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 touch-scroll">
            {filteredFavorites.length === 0 ? (
              <div className="text-center py-10 px-4 text-slate-500 text-xs space-y-2">
                <Star className="w-6 h-6 text-slate-700 mx-auto" />
                <p className="font-semibold text-slate-400">{tr('Немає обраних монет')}</p>
                <p className="text-[11px] text-slate-600">
                  {tr("Натисніть на зірочку біля монет у таблиці чи картці формацій, щоб вони з'явились тут.")}
                </p>
              </div>
            ) : (
              filteredFavorites.map((favCoin) => {
                const selectedChart = chartSlots.find(slot => slot.id === activeChartSlotId) ?? activeCoin;
                const isSelected = favCoin.symbol === selectedChart.symbol
                  && favCoin.exchange === selectedChart.exchange && favCoin.marketType === selectedChart.marketType;
                const favoriteKey = getCoinWatchlistKey(favCoin);
                const favoriteCanDrag = pageMode && !earlyCandidate && chartSlots.length > 0;
                // Synthetic/unresolved favorites must never display the fake +0.00%.
                const percent = favCoin.currentPrice > 0 ? chart24hPercent(favCoin, null) : null;
                const isFavPositive = percent !== null && percent >= 0;
                return (
                  <div key={favoriteKey} className="space-y-1.5">
                    <div
                      onClick={event => handleSelectFavoriteCoin(favCoin, event)}
                      className={`group p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${draggedFavoriteKey === favoriteKey ? 'ring-2 ring-cyan-400/70 ' : ''}${
                        isSelected
                          ? 'bg-cyan-950/40 border-cyan-500/60 shadow-sm shadow-cyan-950/50'
                          : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1 min-w-0">
                          <button type="button"
                            draggable={favoriteCanDrag}
                            aria-haspopup={pageMode && !earlyCandidate && chartSlots.length > 1 ? 'menu' : undefined}
                            aria-expanded={pageMode && !earlyCandidate && chartSlots.length > 1
                              ? favoriteSlotMenu?.key === favoriteKey : undefined}
                            title={favoriteCanDrag ? favoriteLabel.drag : undefined}
                            aria-label={favoriteCanDrag ? `${favCoin.baseAsset}/${favCoin.quoteAsset}. ${favoriteLabel.drag}` : undefined}
                            onDragStart={event => {
                              if (!favoriteCanDrag) { event.preventDefault(); return; }
                              // Native desktop drag takes precedence over pointer fallback.
                              touchFavoriteGestureRef.current = null;
                              favoriteDraggingRef.current = favCoin;
                              setDraggedFavoriteKey(favoriteKey);
                              event.dataTransfer.effectAllowed = 'copy';
                              event.dataTransfer.setData('application/x-h00k-fullscreen-favorite', favoriteKey);
                              // Some desktop webviews require a standard MIME type to start dragging.
                              event.dataTransfer.setData('text/plain', 'h00k-favorite:' + favoriteKey);
                            }}
                            onDragEnd={clearFavoriteDrag}
                            onPointerDown={event => startTouchFavorite(event, favCoin)}
                            onPointerMove={moveTouchFavorite}
                            onPointerUp={event => stopTouchFavorite(event)}
                            onPointerCancel={event => stopTouchFavorite(event, true)}
                            onClick={event => {
                              event.stopPropagation();
                              if (suppressedFavoriteClickRef.current?.key === favoriteKey
                                && Date.now() < suppressedFavoriteClickRef.current.until) {
                                suppressedFavoriteClickRef.current = null;
                                event.preventDefault();
                                return;
                              }
                              handleSelectFavoriteCoin(favCoin, event);
                            }}
                            className={`min-w-0 truncate text-left font-mono font-bold text-xs text-white hover:text-cyan-300 ${favoriteCanDrag ? 'cursor-grab active:cursor-grabbing touch-none select-none' : ''}`}>
                            <span data-no-translate>{favCoin.baseAsset}/{favCoin.quoteAsset}</span>
                          </button>
                          {isSelected && <span className="relative flex h-1.5 w-1.5 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75"></span>
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-500"></span>
                          </span>}
                          <button type="button"
                            onClick={event => { event.stopPropagation(); void copyFavoriteSymbol(favCoin); }}
                            title={favoriteCopyResult?.key === favoriteKey && favoriteCopyResult.copied ? favoriteLabel.copied : favoriteLabel.copy}
                            aria-label={favoriteLabel.copy + ' ' + normalizeExchangeSymbol(favCoin.symbol).toUpperCase()}
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-cyan-300">
                            {favoriteCopyResult?.key === favoriteKey && favoriteCopyResult.copied
                              ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                              : <Copy className="h-3.5 w-3.5" />}
                          </button>
                          {onSendMetaScalp && <button type="button"
                            onClick={event => { event.stopPropagation(); onSendMetaScalp(favCoin); }}
                            title={tp('Надіслати в обраний термінал (Група {{group}})', { group: metaScalpBinding })}
                            aria-label={favoriteLabel.linking + ' ' + favCoin.symbol}
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-amber-400 hover:bg-amber-500/15">
                            <Zap className="h-3.5 w-3.5" />
                          </button>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] uppercase font-bold px-1 rounded bg-slate-800 text-slate-400">{favCoin.exchange}</span>
                          <span className="text-[9px] uppercase font-semibold px-1 rounded bg-slate-800/80 text-slate-500">
                            {favCoin.marketType === 'futures' ? favoriteLabel.futuresShort : favoriteLabel.spotShort}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          {favCoin.currentPrice > 0 && (
                            <div className="font-mono text-xs font-semibold text-slate-200">
                              ${formatCryptoPrice(favCoin.currentPrice)}
                            </div>
                          )}
                          <div title={percent === null ? favoriteLabel.quoteUnavailable : undefined}
                            className={`text-[10px] font-mono font-semibold ${
                              percent === null ? 'text-slate-500' : isFavPositive ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                            {percent === null ? '—' : `${isFavPositive ? '+' : ''}${percent.toFixed(2)}%`}
                          </div>
                        </div>
                        <button type="button"
                          onClick={e => handleRemoveFromWatchlist(favCoin, e)}
                          className="p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title={tr("Видалити з обраного")} aria-label={tr("Видалити з обраного") + ' ' + favCoin.symbol}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {favoriteCopyResult?.key === favoriteKey && !favoriteCopyResult.copied &&
                      <span className="block px-2 text-[10px] text-rose-300" role="status">{favoriteLabel.copyFailed}</span>}

                  </div>
                );
              })
            )}
          </div>
        </div>

       
        {chartSlotMenu && pageMode && !earlyCandidate && chartSlots.length > 1
          && typeof document !== 'undefined' && createPortal(
          <div ref={chartSlotMenuRef} role="menu"
            aria-label={favoriteLabel.openCharts}
            data-fullscreen-chart-menu
            className="fixed z-[130] box-border rounded-lg border border-slate-700/90 bg-[#090e17] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.75)]"
            style={{ left: chartSlotMenu.left, top: chartSlotMenu.top, width: chartSlotMenu.width }}
            onKeyDown={event => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
              const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
              if (!options.length) return;
              event.preventDefault();
              const index = options.indexOf(document.activeElement as HTMLButtonElement);
              options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
            }}>
            <div className="px-2 py-1 text-[10px] font-semibold text-slate-400">
              {favoriteLabel.openCharts}
            </div>
            {chartSlots.slice(0, MAX_FULLSCREEN_CHARTS).map((slot, index) => (
              <button key={slot.id} type="button" role="menuitem"
                aria-current={headerSlotId === slot.id ? 'true' : undefined}
                onClick={() => chooseHeaderChart(slot.id)}
                className="flex min-h-9 w-full items-center gap-1.5 rounded px-2 text-left text-[11px] text-slate-200 transition-colors hover:bg-slate-800 hover:text-cyan-200 focus-visible:bg-slate-800 focus-visible:outline-none">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${headerSlotId === slot.id ? 'bg-cyan-400' : 'bg-transparent'}`} />
                <span className="shrink-0 text-slate-500">{index + 1}.</span>
                <span data-no-translate className="min-w-0 flex-1 truncate font-mono font-semibold">{slot.symbol}</span>
                <span className="shrink-0 text-[9px] uppercase text-amber-300">{slot.exchange}</span>
                <span className="shrink-0 text-[9px] text-slate-400">
                  {slot.marketType === 'futures' ? favoriteLabel.futuresShort : favoriteLabel.spotShort}
                </span>
              </button>
            ))}
          </div>, document.body
        )}

        {favoriteSlotMenu && favoriteSlotCoin && typeof document !== 'undefined' && createPortal(
          <div ref={favoriteSlotMenuRef} role="menu"
            aria-label={`${favoriteLabel.pickBlock}: ${favoriteSlotCoin.symbol}`}
            data-fullscreen-favorite-slot-menu
            className="fixed z-[120] box-border rounded-md border border-slate-700/90 bg-[#090e17] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.75)]"
            style={{ left: favoriteSlotMenu.left, top: favoriteSlotMenu.top, width: favoriteSlotMenu.width }}
            onKeyDown={event => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
              const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
              const active = options.indexOf(document.activeElement as HTMLButtonElement);
              if (!options.length) return;
              event.preventDefault();
              options[(active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
            }}>
            <div className="truncate px-2 py-1 text-[10px] font-medium text-slate-400">
              {favoriteLabel.pickBlock}
            </div>
            {chartSlots.slice(0, MAX_FULLSCREEN_CHARTS).map((slot, index) => (
              <button key={slot.id} type="button" role="menuitem"
                aria-current={activeChartSlotId === slot.id ? 'true' : undefined}
                onClick={() => {
                  setFavoriteSlotMenu(null);
                  applyFavoriteToSlot(favoriteSlotCoin, slot.id);
                }}
                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] text-slate-200 transition-colors hover:bg-slate-800 hover:text-cyan-200 focus-visible:bg-slate-800 focus-visible:text-cyan-200 focus-visible:outline-none">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${activeChartSlotId === slot.id ? 'bg-cyan-400' : 'bg-transparent'}`} />
                <span className="shrink-0 font-medium">{favoriteLabel.block} {index + 1}</span>
                <span data-no-translate className="ml-auto min-w-0 truncate font-mono text-[10px] text-slate-500" title={slot.symbol}>
                  {slot.symbol}
                </span>
              </button>
            ))}
          </div>, document.body
        )}

        {/* Native HookChart replaces the external TradingView embed. */}
        <FullscreenMultiChart
          primaryMarket={activeCoin}
          primaryTimeframe={timeframe}
          favoriteToAdd={pageMode && !earlyCandidate ? favoriteToAdd : null}
          marketChangeRequest={pageMode && !earlyCandidate ? marketChangeRequest : null}
          onSlotsChange={setChartSlots}
          activeSlotId={pageMode && !earlyCandidate ? activeChartSlotId : undefined}
          onActiveSlotChange={pageMode && !earlyCandidate ? setActiveChartSlotId : undefined}
          favoriteDragging={!!draggedFavoriteKey}
          favoriteDropTargetId={favoriteDropTargetId}
          onFavoriteDrop={acceptFavoriteDrop}
          onFavoriteDragHover={setFavoriteDropTargetId}
          allCoins={allCoins}
          watchlist={localWatchlist}
          onSendMetaScalp={onSendMetaScalp}
          metaScalpBinding={metaScalpBinding}
          onOpenTelegramAlerts={onOpenTelegramModal}
        >
          {historyStatus === 'failed' && (
            <div className="mb-2 flex flex-wrap items-center justify-center gap-3 rounded-lg border border-amber-700/40 bg-slate-950/90 px-3 py-2 text-xs text-amber-200" role="status">
              <span>{tr('Не вдалося завантажити свічки з біржі')}</span>
              <button type="button" className="rounded-md border border-cyan-700/50 px-3 py-1.5 text-cyan-200 hover:bg-slate-800"
                onClick={() => setHistoryRetry(value => value + 1)}>{tr('Спробувати ще раз')}</button>
            </div>
          )}
          <TradingViewChart
            forceHookChart
            visualContext={visualContext ?? (activeFormation || (earlyCandidate && samePropMarket) ? 'formationsFull' : 'screenerFull')}
            fullHeight
            klines={activeKlines}
            historyManagedByParent
            formation={activeFormation}
            symbol={activeCoin.symbol}
            timeframe={timeframe}
            onTimeframeChange={handleTimeframeSelect}
            exchange={activeCoin.exchange}
            marketType={activeCoin.marketType}
            historyLimit={1000}
            onAddToArchive={samePropMarket ? onAddToArchive : undefined}
            isArchived={samePropMarket ? isArchived : false}
            customMarkers={visibleChartMarkers}
            previewMarkers={showEarlyLevels}
            earlyNecklineToggle={showEarlyLevels && displayedEarlyCandidate
              ? { visible: earlyLevelVisibility.neckline, available: Number.isFinite(displayedEarlyCandidate.neckline) && displayedEarlyCandidate.neckline > 0,
                  onToggle: () => toggleEarlyLevel('neckline') }
              : undefined}
            hideSymbolAndPrice
            hideHeaderLiveIndicator
            hideHeaderFormationBadge
            onLiveStatusChange={reportStatus}
            onLivePriceUpdate={reportPrice}
            onClosedCandle={earlyTouchRule && displayedEarlyCandidate && showEarlyLevels && timeframe === currentTimeframe
              ? closed => setLiveEarlyCandidate(previous =>
                  applyClosedEarlyWickTouch(previous ?? displayedEarlyCandidate,
                    closed, timeframe as Timeframe, earlyTouchRule))
              : undefined}
            savedChartParams={samePropMarket ? savedChartParams : undefined}
          />
        </FullscreenMultiChart>
      </main>
      {pageMode && <SiteFooter />}
    </div>
  );

  // Only the nested fullscreen dialog needs the portal. Standalone charts are
  // normal routed pages with their own scroll and no underlying Screener DOM.
  return pageMode || typeof document === 'undefined' ? content : createPortal(content, document.body);
};
