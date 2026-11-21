import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Eye,
  Plus,
  Play,
  Pause,
  Settings2,
  ExternalLink,
  Search,
  RefreshCw,
  Bell,
  Clock,
  Target,
  Shield,
  Zap,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Check,
  X,
  Crosshair,
  BarChart3,
  Sliders,
  AlertCircle,
  HelpCircle,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Send,
  PieChart,
  History,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  ChevronDown,
  ChevronUp,
  Filter,
} from 'lucide-react';
import { MonitoringMenuIcon } from './MonitoringIcon';
import { apiFetch } from '../utils/apiFetch';
import { useLanguage } from '../context/LanguageContext';
import { SurveillanceFieldDropdown } from './SurveillanceFieldDropdown';
import { useSurveillance } from '../context/SurveillanceContext';
import { ManualDensityThresholdField } from './ManualDensityThresholdField';
import { SurveillanceRemoveButton } from './SurveillanceRemoveButton';
import { isLiveOrderBookView } from '../utils/orderBookValidation';
import { densityEventAmountText, formatDensityLevelCompact, formatDensityLevelExact } from '../utils/densityNotional';
import { countSurveillanceEventCategories, getSurveillanceEventCategory, matchesSurveillanceEventFilter } from '../utils/surveillanceEventCategories';
import { getStoredPreferences, useAppPreferences } from '../utils/userPreferences';
import {
  SurveillanceCoin,
  SurveillanceConfig,
  SurveillanceEvent,
  ScannedCoin,
  ExchangeId,
  MarketType,
  Timeframe,
  TriggerModeType,
} from '../types';

interface SurveillancePageProps {
  availableCoins?: ScannedCoin[];
  onSelectCoinForChart?: (symbol: string, exchange: ExchangeId, marketType: MarketType) => void;
  onOpenTelegramSettings?: () => void;
  onNavigateToScreener?: () => void;
}

function formatPrice(val?: number): string {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toFixed(4);
  if (val >= 0.0001) return val.toFixed(6);
  return val.toFixed(8);
}

function formatNotionalUsd(val?: number): string {
  if (!val) return '$0';
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${Math.round(val)}`;
}

function formatTimeAgo(timestamp?: number): string {
  if (!timestamp) return 'щойно';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return `${Math.max(1, diffSec)} с тому`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} хв тому`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} год тому`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} д тому`;
}

const SURVEILLANCE_EXCHANGES: ReadonlyArray<{ value: ExchangeId; label: string }> = [
  { value: 'binance', label: 'Binance' },
  { value: 'bybit', label: 'Bybit' },
];
type SurveillanceSymbolSuggestion = { symbol: string; baseAsset: string; quoteAsset: string };
type SurveillanceSearchState = {
  key: string;
  data: SurveillanceSymbolSuggestion[];
  loading: boolean;
  unavailable: boolean;
};

const SURVEILLANCE_MARKETS: ReadonlyArray<{ value: MarketType; label: string }> = [
  { value: 'futures', label: 'Futures / Linear' },
  { value: 'spot', label: 'Spot' },
];

const TRIGGER_MODE_OPTIONS: { id: TriggerModeType; label: string; desc: string }[] = [
  { id: 'bar_close', label: 'Закриття 4H', desc: 'За закриттям 4h свічки' },
  { id: 'bar_close_1h', label: 'Закриття 1H', desc: 'Свічка 1h закрилась за рівнем' },
  { id: 'bar_close_15m', label: 'Закриття 15m', desc: 'Свічка 15m закрилась за рівнем' },
  { id: 'realtime', label: 'Realtime (Миттєво)', desc: 'В момент перетину ціною' },
];

export const SurveillancePage: React.FC<SurveillancePageProps> = ({
  availableCoins = [],
  onSelectCoinForChart,
  onOpenTelegramSettings,
  onNavigateToScreener,
}) => {
  const {
    coins,
    allEvents,
    loading,
    activeCount,
    addCoinToSurveillance,
    removeCoinFromSurveillance,
    updateCoinConfig,
    toggleCoinActive,
    toggleAllCoinsActive,
    checkCoinNow,
    checkAllCoinsNow,
    getWorkerSnapshot,
    runBacktest,
    refresh,
  } = useSurveillance();
  const { t, language } = useLanguage();

  const { preferences } = useAppPreferences();
  const prefs = getStoredPreferences();
  const defaultEx = prefs.defaultExchange === 'all' ? 'binance' : prefs.defaultExchange;
  const defaultMarket = prefs.defaultMarketType === 'all' ? 'futures' : prefs.defaultMarketType;

  const [searchQuery, setSearchQuery] = useState('');
  const [exchangeFilter, setExchangeFilter] = useState<'all' | ExchangeId>(prefs.defaultExchange);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalViewport, setAddModalViewport] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [editingCoin, setEditingCoin] = useState<SurveillanceCoin | null>(null);
  const [isCheckingMap, setIsCheckingMap] = useState<Record<string, boolean>>({});
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [notificationToast, setNotificationToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [repairingCoinIds, setRepairingCoinIds] = useState<Set<string>>(() => new Set());
  const [isMonitoringHelpOpen, setIsMonitoringHelpOpen] = useState(false);

  // Recent surveillance events feed state
  const [isEventsExpanded, setIsEventsExpanded] = useState(true);
  const [eventsTypeFilter, setEventsTypeFilter] = useState<'all' | 'critical' | 'level' | 'structure' | 'density' | 'setup'>('all');
  const [eventsCoinFilter, setEventsCoinFilter] = useState<string>('all');
  const [eventsDisplayLimit, setEventsDisplayLimit] = useState(8);
  const [expandedCoinEventsMap, setExpandedCoinEventsMap] = useState<Record<string, boolean>>({});

  // Granular worker details & backtest modal state
  const [detailedCoin, setDetailedCoin] = useState<SurveillanceCoin | null>(null);
  const [workerData, setWorkerData] = useState<any | null>(null);
  const [densityView, setDensityView] = useState<'largest'|'nearby'>('largest');
  const [showAllDensityLevels, setShowAllDensityLevels] = useState(false);
  const [workerFetchedAt, setWorkerFetchedAt] = useState(0);
  const [workerNow, setWorkerNow] = useState(Date.now());
  const [loadingWorkerData, setLoadingWorkerData] = useState(false);
  const [backtestResult, setBacktestResult] = useState<any | null>(null);
  const [loadingBacktest, setLoadingBacktest] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const detailsId = useRef<string | null>(null);
  detailsId.current = detailedCoin?.id || null;
  const isWorkerBookLive = isLiveOrderBookView(workerData, workerFetchedAt, workerNow);
  const visibleDensities: any[] = isWorkerBookLive ? workerData?.densities || [] : [];
  // Keep every outlier, including walls 1–3% away from current mid-price.
  // Change only presentation order; never gate the underlying worker alerts.
  const shownDensities = densityView === 'nearby'
    ? visibleDensities.filter(d => Number.isFinite(d.distancePct) && d.distancePct <= 3)
        .sort((a,b) => b.notionalUsd - a.notionalUsd)
    : visibleDensities;
  const collapsedDensities = shownDensities.slice(0, showAllDensityLevels ? 50 : 4);

  const detailedCoinId = detailedCoin?.id ?? null;
  const editingCoinId = editingCoin?.id ?? null;
  useEffect(() => {
    if (detailedCoinId && !coins.some(coin => coin.id === detailedCoinId)) setDetailedCoin(null);
    if (editingCoinId && !coins.some(coin => coin.id === editingCoinId)) {
      setEditingCoin(null);
      setIsAddModalOpen(false);
    }
  }, [coins, detailedCoinId, editingCoinId]);

  // iOS Safari's on-screen keyboard changes the *visual* viewport without
  // necessarily shrinking CSS vh. Keep the add/edit modal inside the visible
  // region so its symbol input and footer stay accessible on phone keyboards.
  useEffect(() => {
    if (!isAddModalOpen || typeof window === 'undefined') {
      setAddModalViewport(null);
      return;
    }
    const updateViewport = () => {
      const view = window.visualViewport;
      const next = {
        top: Math.max(0, view?.offsetTop ?? 0),
        left: Math.max(0, view?.offsetLeft ?? 0),
        width: Math.max(0, view?.width ?? window.innerWidth),
        height: Math.max(0, view?.height ?? window.innerHeight),
      };
      setAddModalViewport((prev) => (
        prev
        && Math.abs(prev.top - next.top) < 1
        && Math.abs(prev.left - next.left) < 1
        && Math.abs(prev.width - next.width) < 1
        && Math.abs(prev.height - next.height) < 1
      ) ? prev : next);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
    };
  }, [isAddModalOpen]);

  // Screener coins list for selection
  const screenerCoinsList = availableCoins || [];

  // New coin modal selection state
  const [selectedSymbolInput, setSelectedSymbolInput] = useState('');
  const [selectedExchange, setSelectedExchange] = useState<ExchangeId>(defaultEx);
  const [selectedMarketType, setSelectedMarketType] = useState<MarketType>(defaultMarket);
  const [symbolSearch, setSymbolSearch] = useState<SurveillanceSearchState>({
    key: '', data: [], loading: false, unavailable: false,
  });
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);
  const [activeSymbolOption, setActiveSymbolOption] = useState(0);
  const symbolSearchContainerRef = useRef<HTMLDivElement>(null);
  const searchText = selectedSymbolInput.trim();
  const symbolSearchKey = `${selectedExchange}:${selectedMarketType}:${searchText}`;
  const symbolMatchesCurrentInput = symbolSearch.key === symbolSearchKey;
  const symbolOptions = symbolMatchesCurrentInput ? symbolSearch.data : [];
  const symbolSearching = symbolMatchesCurrentInput && symbolSearch.loading;
  const symbolUnavailable = symbolMatchesCurrentInput && symbolSearch.unavailable;

  // Fetch only while the add dialog is open and the user has entered a query.
  // Shared exchange quotes are already cached server-side; this only returns
  // eight matching symbols rather than shipping the full trading universe.
  useEffect(() => {
    if (!isAddModalOpen || editingCoinId || !symbolSearchOpen || !searchText) return;
    const controller = new AbortController();
    setSymbolSearch({ key: symbolSearchKey, data: [], loading: true, unavailable: false });
    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: searchText, exchange: selectedExchange, marketType: selectedMarketType,
        });
        const response = await apiFetch(`/api/surveillance/symbols?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Exchange catalog unavailable');
        const result = await response.json();
        if (controller.signal.aborted) return;
        const data: SurveillanceSymbolSuggestion[] = Array.isArray(result.data)
          ? result.data.filter((item: any) => typeof item?.symbol === 'string'
              && typeof item?.baseAsset === 'string' && item.quoteAsset === 'USDT').slice(0, 8)
          : [];
        setSymbolSearch({ key: symbolSearchKey, data, loading: false, unavailable: false });
      } catch {
        if (!controller.signal.aborted)
          setSymbolSearch({ key: symbolSearchKey, data: [], loading: false, unavailable: true });
      }
    }, 300);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [isAddModalOpen, editingCoinId, symbolSearchOpen, searchText, selectedExchange, selectedMarketType, symbolSearchKey]);

  // Close suggestions when the user switches to other controls. Keep taps
  // inside the list intact (a blur on the input alone would swallow iOS taps).
  useEffect(() => {
    if (!isAddModalOpen || !symbolSearchOpen) return;
    const closeOutside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && !symbolSearchContainerRef.current?.contains(target))
        setSymbolSearchOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
    };
  }, [isAddModalOpen, symbolSearchOpen]);

  const chooseSymbolSuggestion = (symbol: string) => {
    setSelectedSymbolInput(symbol);
    setSymbolSearchOpen(false);
    setActiveSymbolOption(0);
  };


  // Config modal state (for add or edit)
  const [formConfig, setFormConfig] = useState<SurveillanceConfig>({
    timeframe: prefs.defaultTimeframe,
    triggerModes: ['bar_close', 'realtime'],
    triggerMode: 'bar_close',
    levelsEnabled: true,
    structureEnabled: true,
    momentumEnabled: true,
    momentumPct: 2.5,
    momentumBars: 3,
    momentumTf: '15m',
    channelEnabled: true,
    fibonacciEnabled: true,
    cooldownMinutes: 15,
    densityMode: 'AUTO',
    manualDensityThresholdUsd: 1000000,
    formationThreshold: 75,
    confluenceThreshold: 75,
    thirdTouchAlerts: true,
    densityAlerts: true,
    oiAlerts: true,
    newsAlerts: true,
    setupsEnabled: true,
    telegramEnabled: true,
  });

  const toggleTriggerMode = (mode: TriggerModeType) => {
    setFormConfig((prev) => {
      const current: TriggerModeType[] = Array.isArray(prev.triggerModes) && prev.triggerModes.length > 0
        ? (prev.triggerModes as TriggerModeType[])
        : (prev.triggerMode ? [prev.triggerMode as TriggerModeType] : ['bar_close']);
      let next: TriggerModeType[];
      if (current.includes(mode)) {
        if (current.length === 1) return prev;
        next = current.filter((m) => m !== mode);
      } else {
        next = [...current, mode];
      }
      return { ...prev, triggerModes: next, triggerMode: next[0] };
    });
  };

  const handleOpenAddModal = (prefillSymbol?: string) => {
    setSymbolSearchOpen(false);
    setActiveSymbolOption(0);
    setSelectedSymbolInput(prefillSymbol || '');
    setSelectedExchange(defaultEx);
    setSelectedMarketType(defaultMarket);
    if (prefillSymbol) {
      setSelectedSymbolInput(prefillSymbol);
      const match = screenerCoinsList.find((c) => c.symbol === prefillSymbol);
      if (match) {
        setSelectedExchange(match.exchange);
        setSelectedMarketType(match.marketType);
      }
    }
    setFormConfig({
      timeframe: prefs.defaultTimeframe,
      triggerModes: ['bar_close', 'realtime'],
      triggerMode: 'bar_close',
      levelsEnabled: true,
      structureEnabled: true,
      momentumEnabled: true,
      momentumPct: 2.5,
      momentumBars: 3,
      momentumTf: '15m',
      channelEnabled: true,
      fibonacciEnabled: true,
      cooldownMinutes: 15,
      densityMode: 'AUTO',
      manualDensityThresholdUsd: 1000000,
      formationThreshold: 75,
      confluenceThreshold: 75,
      thirdTouchAlerts: true,
      densityAlerts: true,
      oiAlerts: true,
      newsAlerts: true,
      setupsEnabled: true,
      telegramEnabled: true,
    });
    setEditingCoin(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (coin: SurveillanceCoin) => {
    setEditingCoin(coin);
    setFormConfig({
      ...coin.config,
      triggerModes: Array.isArray(coin.config.triggerModes) && coin.config.triggerModes.length > 0
        ? coin.config.triggerModes
        : [coin.config.triggerMode || 'bar_close'],
      densityMode: coin.config.densityMode || 'AUTO',
      manualDensityThresholdUsd: coin.config.manualDensityThresholdUsd || 1000000,
      formationThreshold: coin.config.formationThreshold || 75,
      confluenceThreshold: coin.config.confluenceThreshold || 75,
      thirdTouchAlerts: coin.config.thirdTouchAlerts ?? true,
      densityAlerts: coin.config.densityAlerts ?? true,
      oiAlerts: coin.config.oiAlerts ?? true,
      newsAlerts: coin.config.newsAlerts ?? true,
      setupsEnabled: coin.config.setupsEnabled ?? true,
      telegramEnabled: coin.config.telegramEnabled ?? true,
    });
    setIsAddModalOpen(true);
  };

  const handleSaveCoin = async () => {
    if (!editingCoin && !selectedSymbolInput.trim()) {
      setNotificationToast({ message: t('surveillance.ui.error.selectSymbol'), type: 'error' });
      return;
    }
    if (formConfig.densityMode !== 'AUTO' && !(Number.isFinite(formConfig.manualDensityThresholdUsd) && formConfig.manualDensityThresholdUsd! > 0)) {
      setNotificationToast({ message: t('surveillance.ui.error.densityPositive'), type: 'error' });
      return;
    }
    if (editingCoin) {
      const ok = await updateCoinConfig(editingCoin.id, formConfig);
      if (ok) {
        setNotificationToast({ message: t('surveillance.ui.success.updated', { symbol: editingCoin.symbol }), type: 'success' });
        setIsAddModalOpen(false);
      } else {
        setNotificationToast({ message: t('surveillance.ui.error.update'), type: 'error' });
      }
    } else {
      const res = await addCoinToSurveillance(
        selectedSymbolInput,
        selectedExchange,
        selectedMarketType,
        formConfig
      );
      if (res.success) {
        setNotificationToast({ message: t('surveillance.ui.success.added', { symbol: res.coin?.symbol || selectedSymbolInput }), type: 'success' });
        setIsAddModalOpen(false);
      } else {
        const errorKey = ({
          INVALID_SYMBOL: 'invalidSymbol',
          UNSUPPORTED_QUOTE: 'unsupportedQuote',
          UNKNOWN_PAIR: 'unknownPair',
          MARKET_UNAVAILABLE: 'marketUnavailable',
        } as Record<string, string>)[res.code || ''];
        setNotificationToast({
          message: errorKey ? t('surveillance.ui.error.' + errorKey) : (res.error || t('surveillance.ui.error.add')),
          type: 'error',
        });
      }
    }
    setTimeout(() => setNotificationToast(null), 3500);
  };

  // A historical base-only "BTC" subscription can be repaired in place.
  // Explicit click only: opening monitoring must not start extra network work.
  const handleRepairLegacyCoin = async (coin: SurveillanceCoin) => {
    if (repairingCoinIds.has(coin.id)) return;
    setRepairingCoinIds(prev => new Set(prev).add(coin.id));
    try {
      const result = await addCoinToSurveillance(coin.symbol, coin.exchange, coin.marketType);
      if (result.success) {
        setNotificationToast({
          message: t('surveillance.ui.success.repaired', { symbol: result.coin?.symbol || coin.symbol }),
          type: 'success',
        });
      } else {
        const errorKeys: Record<string, string> = {
          INVALID_SYMBOL: 'invalidSymbol',
          UNSUPPORTED_QUOTE: 'unsupportedQuote',
          UNKNOWN_PAIR: 'unknownPair',
          MARKET_UNAVAILABLE: 'marketUnavailable',
        };
        const errorKey = errorKeys[result.code || ''];
        setNotificationToast({
          message: errorKey ? t('surveillance.ui.error.' + errorKey)
            : (result.error || t('surveillance.ui.error.add')),
          type: 'error',
        });
      }
    } finally {
      setRepairingCoinIds(prev => {
        const next = new Set(prev);
        next.delete(coin.id);
        return next;
      });
      setTimeout(() => setNotificationToast(null), 3500);
    }
  };

  const handleToggleActive = async (id: string, symbol: string, currentActive: boolean) => {
    const ok = await toggleCoinActive(id);
    if (ok) {
      setNotificationToast({
        message: t(currentActive ? 'surveillance.ui.status.paused' : 'surveillance.ui.status.activated', { symbol }),
        type: currentActive ? 'info' : 'success',
      });
      setTimeout(() => setNotificationToast(null), 3000);
    }
  };

  const handleCheckCoin = async (id: string, symbol: string) => {
    setIsCheckingMap((prev) => ({ ...prev, [id]: true }));
    try {
      const updated = await checkCoinNow(id, true);
      if (updated) {
        setNotificationToast({ message: `Стан #${symbol} оновлено з біржі`, type: 'success' });
      }
    } finally {
      setIsCheckingMap((prev) => ({ ...prev, [id]: false }));
      setTimeout(() => setNotificationToast(null), 3000);
    }
  };

  const handleOpenDetails = (coin: SurveillanceCoin) => {
    setDetailedCoin(coin);
    setWorkerData(null);
    setWorkerFetchedAt(0);
    setDensityView('largest');
    setShowAllDensityLevels(false);
    setBacktestResult(null);
    setBacktestError(null);
    setLoadingBacktest(false);
  };

  useEffect(() => {
    if (!detailedCoinId) return;
    let cancelled = false;
    let inFlight = false;
    setLoadingWorkerData(true);
    const refreshWorker = async () => {
      setWorkerNow(Date.now());
      if (inFlight) return;
      inFlight = true;
      try {
        const snapshot = await getWorkerSnapshot(detailedCoinId);
        if (!cancelled) {
          setWorkerData(snapshot);
          setWorkerFetchedAt(snapshot?.clientRequestedAt || Date.now());
          setWorkerNow(Date.now());
        }
      } finally {
        inFlight = false;
        if (!cancelled) setLoadingWorkerData(false);
      }
    };
    void refreshWorker();
    const timer = setInterval(refreshWorker, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [detailedCoinId, getWorkerSnapshot]);

  const handleRunCausalBacktest = async (coin: SurveillanceCoin) => {
    setLoadingBacktest(true);
    setBacktestError(null);
    setBacktestResult(null);
    try {
      const res = await runBacktest(coin.symbol, coin.exchange, coin.marketType, '15m');
      if (detailsId.current === coin.id) setBacktestResult(res);
    } catch (error) {
      if (detailsId.current === coin.id) setBacktestError(error instanceof Error ? error.message : 'Помилка бектесту');
    } finally {
      if (detailsId.current === coin.id) setLoadingBacktest(false);
    }
  };

  const filteredCoins = useMemo(() => {
    return coins.filter((c) => {
      const matchSearch =
        c.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.baseAsset.toLowerCase().includes(searchQuery.toLowerCase());
      const matchExchange = exchangeFilter === 'all' || c.exchange === exchangeFilter;
      return matchSearch && matchExchange;
    });
  }, [coins, searchQuery, exchangeFilter]);

  // Aggregate and filter surveillance events across all tracked coins
  const eventCoinsList = useMemo(() => {
    const set = new Set<string>();
    for (const ev of allEvents) {
      if (ev.symbol) set.add(ev.symbol);
    }
    return Array.from(set);
  }, [allEvents]);

  // Count the same coin-scoped events that the category chips will display.
  const coinEvents = useMemo(() => allEvents.filter(ev =>
    eventsCoinFilter === 'all' || ev.symbol === eventsCoinFilter
  ), [allEvents, eventsCoinFilter]);

  const eventsCountMap = useMemo(
    () => countSurveillanceEventCategories(coinEvents),
    [coinEvents],
  );
  const filteredEvents = useMemo(
    () => coinEvents.filter(ev => matchesSurveillanceEventFilter(ev, eventsTypeFilter)),
    [coinEvents, eventsTypeFilter],
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      {notificationToast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl border text-xs font-bold animate-in fade-in slide-in-from-top-2 flex items-center gap-2 ${
            notificationToast.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50 shadow-emerald-950/50'
              : notificationToast.type === 'error'
              ? 'bg-rose-950/90 text-rose-300 border-rose-500/50 shadow-rose-950/50'
              : 'bg-cyan-950/90 text-cyan-300 border-cyan-500/50 shadow-cyan-950/50'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-current animate-ping" />
          <span>{notificationToast.message}</span>
        </div>
      )}

      {/* Top Header & 24/7 Engine Status Bar (#90, #92) */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 p-5 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-14 h-14 shrink-0 flex items-center justify-center">
                <MonitoringMenuIcon className="w-14 h-14" active />
              </div>
              <div className="relative min-w-0 flex-1" onMouseLeave={() => setIsMonitoringHelpOpen(false)}>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="inline-block text-lg sm:text-xl font-black tracking-tight bg-gradient-to-r from-white via-cyan-100 to-sky-300 bg-clip-text text-transparent">{t('surveillance.ui.heading')}</h1>
                  <div className="inline-flex shrink-0 items-center">
                    <button
                      type="button"
                      aria-label={t('surveillance.ui.helpLabel')}
                      aria-expanded={isMonitoringHelpOpen}
                      aria-describedby={isMonitoringHelpOpen ? 'surveillance-monitoring-help' : undefined}
                      onMouseEnter={() => setIsMonitoringHelpOpen(true)}
                      onFocus={() => setIsMonitoringHelpOpen(true)}
                      onBlur={() => setIsMonitoringHelpOpen(false)}
                      onClick={() => setIsMonitoringHelpOpen(true)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          setIsMonitoringHelpOpen(false);
                          event.currentTarget.blur();
                        }
                      }}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 transition-colors cursor-help"
                    >
                      <HelpCircle className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live
                  </span>
                </div>
                {isMonitoringHelpOpen && (
                  <div
                    id="surveillance-monitoring-help"
                    role="tooltip"
                    className="absolute left-0 top-full z-50 mt-2 box-border w-full max-w-[22rem] min-w-0 rounded-xl border border-cyan-500/30 bg-slate-950/95 px-3 py-2.5 text-xs font-normal normal-case leading-relaxed text-slate-200 shadow-2xl shadow-black/50 backdrop-blur-sm break-words whitespace-normal"
                  >
                    {t('surveillance.ui.helpText')}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleOpenAddModal()}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white shadow-lg shadow-cyan-950/50 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
            {onOpenTelegramSettings && (
              <button
                onClick={onOpenTelegramSettings}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-sky-400" />
              </button>
            )}
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => refresh()}
                className="p-2 shrink-0 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                title={t('surveillance.ui.refresh')}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
              </button>
              <div aria-label={t('surveillance.ui.activeCount', { count: activeCount })} className="px-2.5 py-1.5 shrink-0 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2 font-mono text-[11px]">
                <span className="w-2 h-2 shrink-0 rounded-full bg-cyan-400 animate-pulse" />
                <div>
                  <div className="text-[9px] text-slate-500 uppercase">{t('surveillance.ui.monitoring')}</div>
                  <div className="font-bold text-cyan-300">{t('surveillance.ui.coinCount', { count: activeCount })}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: Останні події нагляду (Recent Surveillance Events Feed) */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 shadow-xl overflow-hidden">
        {/* Unified events header: title, event count, description and collapse control. */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-b border-slate-800/80 bg-slate-950/60 px-4 py-3 sm:py-4">
          <div className="w-9 h-9 shrink-0 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 self-center">
            <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
              {t('surveillance.ui.recentEvents')}
            </h2>
            <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              {t('surveillance.ui.eventCount', { count: allEvents.length })}
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[10px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              {t('surveillance.ui.liveFeed')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsEventsExpanded((prev) => !prev)}
            aria-expanded={isEventsExpanded}
            aria-controls="surveillance-events-panel"
            className="shrink-0 self-center px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span>{t(isEventsExpanded ? 'surveillance.ui.collapse' : 'surveillance.ui.expand')}</span>
            {isEventsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <p className="col-start-2 col-span-2 text-[11px] leading-relaxed text-slate-400">
            {t('surveillance.ui.feedDescription')}
          </p>
        </div>

        {/* Panel Content (Expandable) */}
        {isEventsExpanded && (
          <div id="surveillance-events-panel" className="p-4 space-y-4">
            {/* Filter Chips Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-1 border-b border-slate-800/60">
              {/* Category Filters */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                <button
                  onClick={() => setEventsTypeFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    eventsTypeFilter === 'all'
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {t('surveillance.ui.filter.all', { count: eventsCountMap.all })}
                </button>
                <button
                  onClick={() => setEventsTypeFilter('critical')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    eventsTypeFilter === 'critical'
                      ? 'bg-rose-500 text-white font-bold shadow-sm'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-rose-400 hover:text-rose-300'
                  }`}
                >
                  <AlertCircle className="w-3 h-3" />
                  <span>{t('surveillance.ui.filter.critical', { count: eventsCountMap.critical })}</span>
                </button>
                <button
                  onClick={() => setEventsTypeFilter('level')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    eventsTypeFilter === 'level'
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300'
                  }`}
                >
                  <Target className="w-3 h-3" />
                  <span>{t('surveillance.ui.filter.level', { count: eventsCountMap.level })}</span>
                </button>
                <button
                  onClick={() => setEventsTypeFilter('structure')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    eventsTypeFilter === 'structure'
                      ? 'bg-indigo-500 text-white font-bold shadow-sm'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-indigo-400 hover:text-indigo-300'
                  }`}
                >
                  <Shield className="w-3 h-3" />
                  <span>{t('surveillance.ui.filter.structure', { count: eventsCountMap.structure })}</span>
                </button>
                <button
                  onClick={() => setEventsTypeFilter('density')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    eventsTypeFilter === 'density'
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>{t('surveillance.ui.filter.density', { count: eventsCountMap.density })}</span>
                </button>
                <button
                  onClick={() => setEventsTypeFilter('setup')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    eventsTypeFilter === 'setup'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-amber-400 hover:text-amber-300'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{t('surveillance.ui.filter.setup', { count: eventsCountMap.setup })}</span>
                </button>
              </div>

              {/* Coin Filter Selector */}
              {eventCoinsList.length > 1 && (
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-slate-500 text-[11px]">{t('surveillance.ui.coinFilter')}</span>
                  <select
                    value={eventsCoinFilter}
                    onChange={(e) => setEventsCoinFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="all">{t('surveillance.ui.allEventCoins', { count: eventCoinsList.length })}</option>
                    {eventCoinsList.map((sym) => (
                      <option key={sym} value={sym}>
                        #{sym}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Events List */}
            {filteredEvents.length === 0 ? (
              <div className="p-8 rounded-xl bg-slate-950/40 border border-slate-800/80 text-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-slate-800/50 flex items-center justify-center mx-auto text-slate-400">
                  <Bell className="w-5 h-5" />
                </div>
                <div className="text-xs font-bold text-slate-300">
                  {allEvents.length === 0
                    ? t('surveillance.ui.noEventsYet')
                    : t('surveillance.ui.noFilteredEvents')}
                </div>
                <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                  {allEvents.length === 0
                    ? t('surveillance.ui.noEventsHelp')
                    : t('surveillance.ui.filterHelp')}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredEvents.slice(0, eventsDisplayLimit).map((ev) => {
                    const isCritical = ev.severity === 'critical';
                    const isWarning = ev.severity === 'warning';
                    const eventCategory = getSurveillanceEventCategory(ev);
                    const matchedCoin = coins.find((c) => c.id === ev.coinId || c.symbol === ev.symbol);

                    return (
                      <div
                        key={ev.coinId + ':' + ev.id}
                        className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                          isCritical
                            ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/60 shadow-lg shadow-rose-950/20'
                            : isWarning
                            ? 'bg-amber-950/15 border-amber-500/30 hover:border-amber-500/50'
                            : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {/* Event Header */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded font-black font-mono text-xs bg-slate-800 text-white border border-slate-700">
                              #{ev.symbol}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase bg-slate-900 text-amber-300 border border-slate-800">
                              {ev.exchange} {ev.marketType}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase flex items-center gap-1 border ${
                                isCritical
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                  : isWarning
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isCritical
                                    ? 'bg-rose-400 animate-ping'
                                    : isWarning
                                    ? 'bg-amber-400'
                                    : 'bg-cyan-400'
                                }`}
                              />
                              {t(isCritical ? 'surveillance.ui.severity.critical' : isWarning ? 'surveillance.ui.severity.warning' : 'surveillance.ui.severity.info')}
                            </span>
                          </div>

                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span title={new Date(ev.timestamp).toLocaleString()}>
                              {formatTimeAgo(ev.timestamp)}
                            </span>
                          </div>
                        </div>

                        {/* Title and Description */}
                        <div className="space-y-1">
                          <div className="font-bold text-white text-xs leading-snug">
                            {densityEventAmountText(ev.title, ev.details?.notificationType, ev.details?.evidence, language, ev.symbol)}
                          </div>
                          {ev.description && (
                            <div className="text-[11px] text-slate-300 leading-relaxed font-mono">
                              {densityEventAmountText(ev.description, ev.details?.notificationType, ev.details?.evidence, language, ev.symbol)}
                            </div>
                          )}
                        </div>

                        {/* Footer info & quick actions */}
                        <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 text-slate-400">
                            <span>{t('surveillance.ui.price')}</span>
                            <strong className="text-white">${formatPrice(ev.price)}</strong>
                            {ev.details?.timeframe && (
                              <span className="text-slate-500">
                                • {eventCategory === 'density'
                                  ? t('surveillance.ui.realtimeQuote')
                                  : 'TF: ' + ev.details.timeframe}
                              </span>
                            )}
                            {(eventCategory === 'density' || eventCategory === 'setup') &&
                              typeof ev.details?.confluenceScore === 'number' &&
                              Number.isFinite(ev.details.confluenceScore) && (
                              <span className="text-emerald-400 font-bold">
                                • {t(eventCategory === 'density' ? 'surveillance.ui.qualityScore' : 'surveillance.ui.confluenceScore')}:
                                {' '}{ev.details.confluenceScore}/100
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {matchedCoin && (
                              <button
                                onClick={() => handleOpenDetails(matchedCoin)}
                                title={t('surveillance.ui.openOrderBook')}
                                className="px-2 py-0.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-[10px] font-semibold border border-cyan-500/20 cursor-pointer flex items-center gap-1"
                              >
                                <Layers className="w-3 h-3" />
                                <span>{t('surveillance.ui.orderBook')}</span>
                              </button>
                            )}
                            {onSelectCoinForChart && (
                              <button
                                onClick={() => onSelectCoinForChart(ev.symbol, ev.exchange, ev.marketType)}
                                title={t('surveillance.ui.openChart')}
                                className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold cursor-pointer flex items-center gap-1"
                              >
                                <BarChart3 className="w-3 h-3 text-cyan-400" />
                                <span>{t('surveillance.ui.chart')}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Show more button */}
                {filteredEvents.length > eventsDisplayLimit && (
                  <div className="text-center pt-2">
                    <button
                      onClick={() => setEventsDisplayLimit((prev) => prev + 12)}
                      className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 cursor-pointer transition-colors"
                    >
                      {t('surveillance.ui.showMoreEvents', { count: filteredEvents.length - eventsDisplayLimit })}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder={t('surveillance.ui.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <select
            value={exchangeFilter}
            onChange={(e) => setExchangeFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="all">{t('surveillance.ui.allExchanges')}</option>
            <option value="binance">Binance</option>
            <option value="bybit">Bybit</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span>{t('surveillance.ui.activeStatus', { count: activeCount })}</span>
          <span>•</span>
          <span>{t('surveillance.ui.totalStatus', { count: coins.length })}</span>
        </div>
      </div>

      {/* Monitored Coins Cards Grid (#91, #119) */}
      {filteredCoins.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center space-y-4 bg-slate-900/30">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto text-cyan-400">
            <MonitoringMenuIcon className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">{t('surveillance.ui.emptyTitle')}</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {t('surveillance.ui.emptyHelp')}
            </p>
          </div>
          <div className="flex items-center justify-center pt-2">
            <button
              onClick={() => handleOpenAddModal()}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white shadow-md cursor-pointer"
            >
              {t('surveillance.ui.chooseCoin')}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredCoins.map((coin) => {
            const state = coin.state;
            const hasRealRange = (state?.support4h ?? 0) > 0 && (state?.resistance4h ?? 0) > 0
              && Number.isFinite(state?.rangePositionPct);
            const isChecking = Boolean(isCheckingMap[coin.id]);

            return (
              <div
                key={coin.id}
                className={`rounded-2xl border transition-all overflow-hidden flex flex-col ${
                  coin.isActive
                    ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700 shadow-xl'
                    : 'bg-slate-950/60 border-slate-800/60 opacity-70'
                }`}
              >
                {/* Card Header */}
                <div className="p-4 border-b border-slate-800/80 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 max-w-full items-center gap-3">
                    <div data-no-translate className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 flex items-center justify-center font-black font-mono text-cyan-300 text-sm">
                      {coin.baseAsset.slice(0, 3)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span data-no-translate className="break-all font-extrabold text-white text-base tracking-tight font-mono">
                          {coin.symbol}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                            coin.exchange === 'binance'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                          }`}
                        >
                          {coin.exchange} {coin.marketType}
                        </span>
                        {coin.isActive ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Стеження 24/7
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono">
                            ПАУЗА
                          </span>
                        )}
                      </div>
                      {coin.symbol === coin.baseAsset && coin.quoteAsset === 'USDT' && (
                        <button
                          type="button"
                          disabled={repairingCoinIds.has(coin.id)}
                          onClick={() => { void handleRepairLegacyCoin(coin); }}
                          className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                          title={t('surveillance.ui.repairSymbolHint')}
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          {t('surveillance.ui.repairSymbol')}
                        </button>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 mt-0.5 font-mono">
                        <span>{t('surveillance.ui.price')}</span>
                        <strong className="text-white text-xs">
                          {state?.currentPrice && state.currentPrice > 0 ? '$' + formatPrice(state.currentPrice) : '—'}
                        </strong>
                        <span
                          className={`font-semibold ${
                            (state?.change24h || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {state?.currentPrice && state.currentPrice > 0
                            ? `${(state?.change24h || 0) >= 0 ? '+' : ''}${state?.change24h || 0}%`
                            : '—'}
                        </span>
                        {state?.spreadPct !== undefined && (
                          <span className="text-slate-500">
                            (Спред: {state.spreadPct.toFixed(3)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 2xl:w-auto [&>button]:shrink-0">
                    <button
                      onClick={() => handleCheckCoin(coin.id, coin.symbol)}
                      disabled={isChecking}
                      title={t('surveillance.ui.refreshNow')}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin text-cyan-400' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleOpenEditModal(coin)}
                      title={t('surveillance.ui.coinSettings')}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(coin.id, coin.symbol, coin.isActive)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                        coin.isActive
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                      }`}
                    >
                      {coin.isActive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      <span>{t(coin.isActive ? 'surveillance.ui.pause' : 'surveillance.ui.monitor')}</span>
                    </button>
                    <SurveillanceRemoveButton
                      id={coin.id}
                      symbol={coin.symbol}
                      onRemove={removeCoinFromSurveillance}
                      onRemoved={() => {
                        setNotificationToast({ message: t('surveillance.ui.removed', { symbol: coin.symbol }), type: 'success' });
                        setTimeout(() => setNotificationToast(null), 3500);
                      }}
                    />
                  </div>
                </div>

                {/* Card Content: Structure, Levels, Densities, Setups */}
                <div className="p-4 space-y-3.5 flex-1 text-xs">
                  {/* Active Setup Banner if any (#67, #76, #83) */}
                  {state?.activeSetupType ? (
                    <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-950/40 via-cyan-950/30 to-slate-950 border border-emerald-500/40 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          <span className="font-bold text-white tracking-wide">
                            {state.activeSetupType === 'RESISTANCE_REJECTION' && state.activeSetupStage === 'TRIGGERING' ? (
                              'Подолання опору - ініціювання'
                            ) : (
                              <>{state.activeSetupType} — {state.activeSetupStage}</>
                            )}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/40 text-[10px]">
                          Конфлюенс: {state.activeSetupConfluence || 80}/100
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300 font-mono flex items-center justify-between">
                        <span>Підтримка: ${formatPrice(state.support4h)}</span>
                        <span>Опір: ${formatPrice(state.resistance4h)}</span>
                      </div>
                    </div>
                  ) : null}

                  {/* S/R Range bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-emerald-400 font-semibold">
                        Підтримка: {hasRealRange ? '$' + formatPrice(state!.support4h) : '—'}
                      </span>
                      <span className="text-slate-400">
                        {hasRealRange ? `${state?.rangePositionPct ?? '—'}% в діапазоні` : '—'}
                      </span>
                      <span className="text-rose-400 font-semibold">
                        Опір: {hasRealRange ? '$' + formatPrice(state!.resistance4h) : '—'}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-rose-500 transition-all duration-300"
                        style={{ width: hasRealRange ? `${Math.max(2, Math.min(100, state?.rangePositionPct ?? 50))}%` : '0%' }}
                      />
                    </div>
                  </div>

                  {/* 4 Pillars Grid: Density | Third Touch | Trade Flow | Open Interest */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                    {/* Order Book Density (#39, #45, #85) */}
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                      <div className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                        <Layers className="w-3 h-3 text-cyan-400" />
                        <span>{t('surveillance.ui.domDensities')}</span>
                      </div>
                      <div className="font-bold text-white truncate" title={coin.isActive && state?.engineStatus === 'LIVE' && state.topDensityUsd
                        ? `${formatDensityLevelExact(state.topDensityUsd, coin.symbol, language)} • ${state.topDensitySide} • ${state.topDensityPrice ?? '—'}` : undefined}>
                        {coin.isActive && state?.engineStatus === 'LIVE' && state.topDensityUsd
                          ? `${state.topDensitySide} ${formatDensityLevelCompact(state.topDensityUsd, coin.symbol, language)}`
                          : coin.isActive ? state?.engineStatus === 'LIVE' ? t('surveillance.ui.waitDensity') : t('surveillance.ui.waitDom') : 'Пауза'}
                      </div>
                      <div className="text-[10px] text-cyan-300 truncate">
                        {coin.isActive && state?.engineStatus === 'LIVE'
                          ? state.densitiesCount ? `${state.densitiesCount} значних щільностей` : t('surveillance.ui.noLevelsAbove')
                          : t('surveillance.ui.freshBookRequired')}
                      </div>
                    </div>

                    {/* Third Touch (#21, #22, #84) */}
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                      <div className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                        <Target className="w-3 h-3 text-amber-400" />
                        <span>{t('surveillance.ui.thirdTouch')}</span>
                      </div>
                      <div className={`font-bold truncate ${state?.thirdTouchState === 'ACTIVE' ? 'text-amber-400' : 'text-slate-200'}`}>
                        {state?.thirdTouchState || t('surveillance.ui.waiting')}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {state?.thirdTouchDistancePct !== undefined ? t('surveillance.ui.distance', { value: state.thirdTouchDistancePct }) : t('surveillance.ui.absent')}
                      </div>
                    </div>

                    {/* Trade Flow (#50) */}
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                      <div className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                        <Zap className="w-3 h-3 text-emerald-400" />
                        <span>{t('surveillance.ui.tradeFlow')}</span>
                      </div>
                      <div className="font-bold text-slate-200 truncate">
                        {state?.tradeFlowImbalance ? t('surveillance.ui.imbalance', { value: state.tradeFlowImbalance }) : t('surveillance.ui.balance')}
                      </div>
                      <div className="text-[10px] text-emerald-400 truncate">
                        Buy: {formatNotionalUsd(state?.tradeFlowBuyUsd)}
                      </div>
                    </div>

                    {/* Open Interest (#53, #54, #86) */}
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                      <div className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                        <Activity className="w-3 h-3 text-indigo-400" />
                        <span>{t('surveillance.ui.openInterest')}</span>
                      </div>
                      <div className={`font-bold truncate ${state?.oiAnomaly ? 'text-rose-400 animate-pulse' : 'text-slate-200'}`}>
                        {state?.oiRegime ? state.oiRegime.replace(/_/g, ' ') : 'Neutral'}
                      </div>
                      <div className="text-[10px] text-indigo-300 truncate">
                        15m: {state?.oiChange15mPct !== undefined ? `${state.oiChange15mPct >= 0 ? '+' : ''}${state.oiChange15mPct}%` : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Multi-Timeframe Structure Badges (#11, #16) */}
                  <div className="flex flex-wrap items-center justify-between pt-1 border-t border-slate-800/60 text-[10px] font-mono">
                    <span className="text-slate-500">{t('surveillance.ui.marketStructure')}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${state?.structureTrend === 'bullish' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : state?.structureTrend === 'bearish' ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-slate-800 text-slate-300'}`}>
                        Тренд: {state?.structureTrend?.toUpperCase() || 'RANGE'}
                      </span>
                      {state?.formationName && (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800 font-bold">
                          {state.formationName} ({state.formationScore}/100)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Latest Surveillance Event & History for this coin */}
                  <div className="pt-2.5 border-t border-slate-800/60 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-400 flex items-center gap-1.5 font-bold">
                        <Activity className="w-3.5 h-3.5 text-amber-400" />
                        <span>Останні події нагляду</span>
                      </span>
                      {state?.recentEvents && state.recentEvents.length > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCoinEventsMap((prev) => ({
                              ...prev,
                              [coin.id]: !prev[coin.id],
                            }))
                          }
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer font-semibold"
                        >
                          <span>{expandedCoinEventsMap[coin.id] ? 'Згорнути' : `Історія (${state.recentEvents.length})`}</span>
                          {expandedCoinEventsMap[coin.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-500">Поки без подій</span>
                      )}
                    </div>

                    {/* Most recent event */}
                    {state?.lastEvent || (state?.recentEvents && state.recentEvents[0]) ? (
                      (() => {
                        const ev = state.lastEvent || state.recentEvents![0];
                        const isCritical = ev.severity === 'critical';
                        const isWarning = ev.severity === 'warning';

                        return (
                          <div
                            className={`p-2.5 rounded-xl border text-[11px] font-mono transition-all ${
                              isCritical
                                ? 'bg-rose-950/30 text-rose-300 border-rose-500/35'
                                : isWarning
                                ? 'bg-amber-950/25 text-amber-300 border-amber-500/30'
                                : 'bg-slate-950 text-slate-300 border-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 pb-1 border-b border-white/5 text-[10px]">
                              <span className="font-bold flex items-center gap-1.5 truncate">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isCritical
                                      ? 'bg-rose-400 animate-ping'
                                      : isWarning
                                      ? 'bg-amber-400'
                                      : 'bg-cyan-400'
                                  }`}
                                />
                                <span className="truncate">{densityEventAmountText(ev.title, ev.details?.notificationType, ev.details?.evidence, language, ev.symbol)}</span>
                              </span>
                              <span className="text-slate-400 whitespace-nowrap ml-1">
                                {formatTimeAgo(ev.timestamp)}
                              </span>
                            </div>
                            {ev.description && (
                              <p className="text-[10px] text-slate-400 pt-1 leading-snug line-clamp-2">
                                {densityEventAmountText(ev.description, ev.details?.notificationType, ev.details?.evidence, language, ev.symbol)}
                              </p>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/60 text-[10px] text-slate-500 font-mono text-center">
                        24/7 Нагляд активний: очікування тесту рівнів, пробою або щільності
                      </div>
                    )}

                    {/* Expanded list of coin's recent events */}
                    {expandedCoinEventsMap[coin.id] && state?.recentEvents && state.recentEvents.length > 0 && (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pt-1 font-mono text-[10px]">
                        {state.recentEvents.slice(0, 6).map((e, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-2"
                          >
                            <div className="truncate flex-1">
                              <span
                                className={`font-semibold ${
                                  e.severity === 'critical'
                                    ? 'text-rose-400'
                                    : e.severity === 'warning'
                                    ? 'text-amber-400'
                                    : 'text-slate-300'
                                }`}
                              >
                                {e.title}
                              </span>
                            </div>
                            <span className="text-slate-500 whitespace-nowrap text-[9px]">
                              {formatTimeAgo(e.timestamp)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer: Detail Modal Button + Chart Link */}
                <div className="p-3 border-t border-slate-800/80 bg-slate-950/90 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span>Оновлено: {state?.lastCalculated ? new Date(state.lastCalculated).toLocaleTimeString() : 'тільки що'}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenDetails(coin)}
                      className="px-3 py-1 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 font-semibold border border-cyan-500/30 transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Layers className="w-3 h-3" />
                      <span>{t('surveillance.ui.bookBacktest')}</span>
                    </button>
                    {onSelectCoinForChart && (
                      <button
                        onClick={() => onSelectCoinForChart(coin.symbol, coin.exchange, coin.marketType)}
                        className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <BarChart3 className="w-3 h-3 text-cyan-400" />
                        <span>{t('surveillance.ui.chart')}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Granular Worker Details & Causal Replay / Backtest (#103 - #105) */}
      {detailedCoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-4xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white font-mono flex items-center gap-2">
                    <span>#{detailedCoin.symbol}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-amber-300 uppercase font-mono">
                      {detailedCoin.exchange} {detailedCoin.marketType}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {isWorkerBookLive ? 'LIVE' : workerData?.orderBookState?.status === 'LIVE'
                        ? 'STALE' : workerData?.orderBookState?.status || (detailedCoin.isActive ? 'ПІДКЛЮЧЕННЯ' : 'ПАУЗА')}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Біржовий стакан, Торговельний потік, активні сетапи та каузальний бектест
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailedCoin(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5 overflow-y-auto flex-1 font-mono text-xs">
              {loadingWorkerData ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <RefreshCw className="w-8 h-8 animate-spin text-cyan-400 mx-auto" />
                  <p>Отримання живого стану з воркера...</p>
                </div>
              ) : workerData ? (
                <div className="space-y-5">
                  {/* Live Order Book Ladder (Bids & Asks) */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-white">
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-cyan-400" />
                        <span>{t('surveillance.ui.exchangeBook')}</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {isWorkerBookLive ? <>
                          {workerData.orderBookState?.bidDepth || 0} BID / {workerData.orderBookState?.askDepth || 0} ASK •{' '}
                          Спред: ${formatPrice(workerData.orderBookState?.spread)} USDT ({workerData.orderBookState?.spreadPct}%)
                        </> : 'Немає свіжих даних'}
                      </span>
                    </div>
                    <p className="text-[10px] leading-relaxed text-slate-400">
                      Джерело: {detailedCoin.exchange.toUpperCase()} / {detailedCoin.marketType} / <span data-no-translate>{detailedCoin.symbol}</span>.
                      Сума рівня = ціна × кількість; це сукупна видима ліквідність за ціною, а не окрема заявка.
                      Приховані обсяги не видно, виставлені заявки можуть бути скасовані.
                    </p>
                    {workerData.orderBookState?.timestamp > 0 && <p className="text-[10px] text-slate-500">
                      Оновлення DOM: {new Date(workerData.orderBookState.timestamp).toLocaleTimeString()} • Seq: {workerData.orderBookState.sequence}
                    </p>}

                    {!isWorkerBookLive && (
                      <p className="text-amber-300">Стакан синхронізується або дані застаріли. Очікуйте відновлення потоку.</p>
                    )}
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                      {/* Bids */}
                      <div className="space-y-1">
                        <div className="text-[10px] text-emerald-400 font-bold uppercase pb-1 border-b border-slate-800 flex justify-between">
                          <span>BID PRICE</span>
                          <span>VALUE (USDT)</span>
                        </div>
                        {(isWorkerBookLive ? workerData.orderBookState?.bids : [])?.slice(0, 7).map((b: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-[11px] py-0.5">
                            <span className="text-emerald-400 font-bold">{formatPrice(b.price)} USDT</span>
                            <span className="text-slate-300" title={`${formatDensityLevelExact(b.notionalUsd, detailedCoin.symbol, language)} = ${b.price} × ${b.quantity}`}>{formatDensityLevelCompact(b.notionalUsd, detailedCoin.symbol, language)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Asks */}
                      <div className="space-y-1">
                        <div className="text-[10px] text-rose-400 font-bold uppercase pb-1 border-b border-slate-800 flex justify-between">
                          <span>ASK PRICE</span>
                          <span>VALUE (USDT)</span>
                        </div>
                        {(isWorkerBookLive ? workerData.orderBookState?.asks : [])?.slice(0, 7).map((a: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-[11px] py-0.5">
                            <span className="text-rose-400 font-bold">{formatPrice(a.price)} USDT</span>
                            <span className="text-slate-300" title={`${formatDensityLevelExact(a.notionalUsd, detailedCoin.symbol, language)} = ${a.price} × ${a.quantity}`}>{formatDensityLevelCompact(a.notionalUsd, detailedCoin.symbol, language)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Significant Densities Detected */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Target className="w-4 h-4 text-amber-400" />
                      <span>Виявлені щільності</span>
                      <span className="text-slate-400 text-[10px]" title={isWorkerBookLive ? formatDensityLevelExact(workerData.densityThresholdUsd, detailedCoin.symbol, language) : undefined}>{workerData.densityMode} • Поріг: {isWorkerBookLive && workerData.densityThresholdUsd > 0
                          ? formatDensityLevelCompact(workerData.densityThresholdUsd, detailedCoin.symbol, language) : '—'}</span>
                    </div>
                    {workerData.densityMode !== 'MANUAL' && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-slate-400">
                        <span>BID ≥ {isWorkerBookLive && workerData.densityBidThresholdUsd > 0
                          ? formatDensityLevelCompact(workerData.densityBidThresholdUsd, detailedCoin.symbol, language) : '—'}</span>
                        <span>ASK ≥ {isWorkerBookLive && workerData.densityAskThresholdUsd > 0
                          ? formatDensityLevelCompact(workerData.densityAskThresholdUsd, detailedCoin.symbol, language) : '—'}</span>
                        {isWorkerBookLive && !(workerData.volume24hUsd > 0) && (
                          <span className="text-amber-300">{t('surveillance.ui.density.turnoverUnavailable')}</span>
                        )}
                      </div>
                    )}

                    {isWorkerBookLive && (
                      <div className="space-y-1 text-[10px] text-slate-400">
                        <div>
                          {t('surveillance.ui.density.depthCoverage')}: BID −{Number(workerData?.orderBookState?.bidCoveragePct || 0).toFixed(2)}% /
                          ASK +{Number(workerData?.orderBookState?.askCoveragePct || 0).toFixed(2)}%
                        </div>
                        {((workerData?.orderBookState?.bidCoveragePct ?? 0) < 3 ||
                          (workerData?.orderBookState?.askCoveragePct ?? 0) < 3) && (
                            <p className="text-amber-300">{t('surveillance.ui.density.depthLimited')}</p>
                          )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[10px]">
                      <button type="button" onClick={() => {setDensityView('largest');setShowAllDensityLevels(false);}}
                        className={densityView === 'largest' ? 'text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'}>
                        {t('surveillance.ui.density.largest')} ({visibleDensities.length})
                      </button>
                      <button type="button" onClick={() => {setDensityView('nearby');setShowAllDensityLevels(false);}}
                        className={densityView === 'nearby' ? 'text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'}>
                        {t('surveillance.ui.density.nearby')} ({visibleDensities.filter(d => Number.isFinite(d.distancePct) && d.distancePct <= 3).length})
                      </button>
                    </div>

                    {shownDensities.length === 0 ? (
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 text-center">
                        {isWorkerBookLive ? 'Немає щільностей вище поточного порогу в доступній глибині стакана. Очікуємо нових рівнів DOM.'
                          : 'Пошук щільностей очікує свіжого, синхронізованого стакана.'}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {collapsedDensities.map((d: any) => (
                          <div key={d.id} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className={`font-bold ${d.side === 'BID' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {d.side} {formatPrice(d.price)} USDT
                                </span>
                                <span className="text-[9px] px-1 rounded bg-slate-800 text-cyan-300">
                                  {d.confirmed ? t('surveillance.ui.density.confirmed') : t('surveillance.ui.density.observing')}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {t('surveillance.ui.density.distance')}: {d.distancePct}% •
                                <span title={t('surveillance.ui.density.observationHelp')}> {t('surveillance.ui.density.observed')}: {d.ageSeconds}с</span>
                              </div>
                            </div>
                            <div className="font-extrabold text-white text-xs" title={`${formatDensityLevelExact(d.notionalUsd, detailedCoin.symbol, language)} = ${d.price} × ${d.quantity}`}>
                              {formatDensityLevelCompact(d.notionalUsd, detailedCoin.symbol, language)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {shownDensities.length > 4 && (
                      <button type="button" className="text-[11px] text-cyan-300 hover:text-cyan-200"
                        onClick={() => setShowAllDensityLevels(v => !v)}>
                        {showAllDensityLevels
                          ? t('surveillance.ui.density.collapse')
                          : t('surveillance.ui.density.showMore', { count: Math.min(50, shownDensities.length) })}
                      </button>
                    )}
                  </div>

                </div>
              ) : (
                <p className="text-slate-400">
                  Живий стакан доступний для активної монети після підключення до біржі. Бектест можна запустити окремо.
                </p>
              )}
                  {/* Causal Backtest & Replay Runner (#103, #104, #105) */}
                  <div className="p-4 rounded-xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-indigo-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-white text-xs flex items-center gap-1.5">
                          <History className="w-4 h-4 text-indigo-400" />
                          <span>Бектест ретесту підтримки на історичних свічках</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Закриті біржові свічки 15m: TP 1.5%, SL 0.8%, горизонт 4h. Історичний DOM не відтворюється.
                          Це модель за OHLC без комісій та прослизання, а не звіт про виконані угоди.
                        </p>
                      </div>

                      <button
                        onClick={() => handleRunCausalBacktest(detailedCoin)}
                        disabled={loadingBacktest}
                        className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                      >
                        <PlayCircle className={`w-4 h-4 ${loadingBacktest ? 'animate-spin' : ''}`} />
                        <span>{loadingBacktest ? 'Аналіз...' : 'Запустити бектест'}</span>
                      </button>
                    </div>

                    {backtestError && <p className="text-rose-300" role="alert">{backtestError}</p>}
                    {backtestResult?.totalSetups === 0 && <p className="text-slate-400">За доступний період немає підтверджених ретестів із повним горизонтом 4h.</p>}
                    {backtestResult && (
                      <div className="pt-2 border-t border-slate-800 space-y-2">
                        <p className="text-[10px] leading-relaxed text-slate-400">
                          {backtestResult.exchange?.toUpperCase()} / {backtestResult.marketType} / <span data-no-translate>{backtestResult.symbol}</span> •{' '}
                          {backtestResult.closedCandles} закритих свічок •{' '}
                          {backtestResult.historyFrom ? new Date(backtestResult.historyFrom).toLocaleString() : '—'} —{' '}
                          {backtestResult.historyTo ? new Date(backtestResult.historyTo).toLocaleString() : '—'}.
                          Якщо TP і SL торкнуті в одній свічці, результат зараховується як SL.
                          Ріст і падіння виміряні за повні 4h, включно з рухом після TP/SL.
                        </p>
                        <div className="grid grid-cols-4 gap-2 text-center text-xs">
                          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Всього сетапів</span>
                            <span className="font-bold text-white">{backtestResult.totalSetups}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">TP раніше SL</span>
                            <span className="font-bold text-emerald-400">{backtestResult.totalSetups ? `${backtestResult.winRate}%` : '—'}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Медіана росту 4h</span>
                            <span className="font-bold text-cyan-300">{backtestResult.totalSetups ? `+${backtestResult.medianMfePct}%` : '—'}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Медіана падіння 4h</span>
                            <span className="font-bold text-rose-400">{backtestResult.totalSetups ? `-${backtestResult.medianMaePct}%` : '—'}</span>
                          </div>
                        </div>

                        {/* Recent Backtest setups */}
                        <div className="max-h-36 overflow-y-auto space-y-1">
                          {backtestResult.results?.slice(-5).map((r: any, idx: number) => (
                            <div key={idx} className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-[11px]">
                              <div>
                                <span className={r.success ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                  {r.exitReason === 'TARGET' ? '✓ TP' : r.exitReason === 'STOP' ? '✗ SL' : 'Час вичерпано'}
                                </span>
                                <span className="text-slate-400 ml-2">Тригер: ${formatPrice(r.triggerPrice)}</span>
                              </div>
                              <div className="space-y-0.5 text-right">
                                <span className="text-cyan-300">Ріст 4h: +{r.mfePct}%</span>
                                <span className="text-slate-500 ml-2">1h: {r.future1hPct}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add / Edit Coin Configuration Modal (#93 - #97) */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in"
          style={addModalViewport ? {
            top: addModalViewport.top,
            left: addModalViewport.left,
            right: 'auto',
            bottom: 'auto',
            width: addModalViewport.width,
            height: addModalViewport.height,
          } : undefined}
        >
          <div
            className="relative flex min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl max-h-[92dvh]"
            style={addModalViewport ? { maxHeight: Math.max(0, Math.min(addModalViewport.height * 0.92, addModalViewport.height - 16)) } : undefined}
          >
            <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {editingCoin ? t('surveillance.ui.editTitle', { symbol: editingCoin.symbol }) : t('surveillance.ui.addTitle')}
                  </h3>
                  <p className="text-[11px] text-slate-400">{t('surveillance.ui.modalIntro')}</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-5 font-mono text-xs" style={{ WebkitOverflowScrolling: 'touch' }}>
              {!editingCoin && (
                <>
                  {/* Exchange and Market selectors */}
                  <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
                    <div className="min-w-0 space-y-1">
                      <label id="surveillance-exchange-label" htmlFor="surveillance-exchange" className="block text-[11px] text-slate-400">{t('surveillance.ui.exchange')}</label>
                      <SurveillanceFieldDropdown<ExchangeId>
                        id="surveillance-exchange"
                        labelId="surveillance-exchange-label"
                        value={selectedExchange}
                        options={SURVEILLANCE_EXCHANGES}
                        onChange={(exchange) => {
                          setSelectedExchange(exchange);
                          setSymbolSearchOpen(Boolean(selectedSymbolInput.trim()));
                          setActiveSymbolOption(0);
                        }}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <label id="surveillance-market-label" htmlFor="surveillance-market" className="block text-[11px] text-slate-400">{t('surveillance.ui.market')}</label>
                      <SurveillanceFieldDropdown<MarketType>
                        id="surveillance-market"
                        labelId="surveillance-market-label"
                        value={selectedMarketType}
                        options={SURVEILLANCE_MARKETS}
                        onChange={(market) => {
                          setSelectedMarketType(market);
                          setSymbolSearchOpen(Boolean(selectedSymbolInput.trim()));
                          setActiveSymbolOption(0);
                        }}
                      />
                    </div>
                  </div>

                  {/* Coin Input / Select: suggestions are scoped to exchange + market. */}
                  <div className="space-y-1">
                    <label htmlFor="surveillance-symbol-input" className="block text-[11px] text-slate-400">{t('surveillance.ui.symbol')}</label>
                    <div ref={symbolSearchContainerRef} className="relative">
                      <input
                        id="surveillance-symbol-input"
                        type="text"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-controls={symbolSearchOpen && Boolean(searchText) ? 'surveillance-symbol-options' : undefined}
                        aria-expanded={symbolSearchOpen && Boolean(searchText)}
                        aria-activedescendant={symbolSearchOpen && symbolOptions.length
                          ? `surveillance-symbol-option-${activeSymbolOption}` : undefined}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        maxLength={40}
                        value={selectedSymbolInput}
                        onFocus={() => setSymbolSearchOpen(true)}
                        onChange={(e) => {
                          setSelectedSymbolInput(e.target.value.toUpperCase().trim());
                          setSymbolSearchOpen(true);
                          setActiveSymbolOption(0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { setSymbolSearchOpen(false); return; }
                          if (!symbolSearchOpen || !symbolOptions.length) return;
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setActiveSymbolOption(i => Math.min(symbolOptions.length - 1, i + 1));
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setActiveSymbolOption(i => Math.max(0, i - 1));
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            chooseSymbolSuggestion(symbolOptions[activeSymbolOption]?.symbol || symbolOptions[0].symbol);
                          }
                        }}
                        placeholder="BTC, BTCUSDT, ETHUSDT..."
                        className="min-h-11 w-full min-w-0 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-base sm:text-sm text-white font-bold placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                      />
                      {symbolSearchOpen && Boolean(searchText) && (
                        <div
                          id="surveillance-symbol-options"
                          role="listbox"
                          aria-label={t('surveillance.ui.searchMatches')}
                          className="relative z-10 mt-1 max-h-48 overflow-y-auto overscroll-contain rounded-xl border border-slate-700 bg-slate-950 shadow-xl"
                        >
                          {symbolSearching || !symbolMatchesCurrentInput ? (
                            <div role="status" className="px-3 py-3 text-xs text-slate-400">
                              {t('surveillance.ui.searchingSymbols')}
                            </div>
                          ) : symbolUnavailable ? (
                            <div role="status" className="px-3 py-3 text-xs text-amber-300">
                              {t('surveillance.ui.error.marketUnavailable')}
                            </div>
                          ) : symbolOptions.length ? symbolOptions.map((option, index) => (
                            <button
                              type="button"
                              role="option"
                              id={`surveillance-symbol-option-${index}`}
                              key={option.symbol}
                              aria-selected={index === activeSymbolOption}
                              onMouseEnter={() => setActiveSymbolOption(index)}
                              onClick={() => chooseSymbolSuggestion(option.symbol)}
                              className={`flex w-full items-center justify-between gap-2 border-0 border-b border-slate-800/70 px-3 py-2.5 text-left text-xs transition-colors last:border-b-0 ${index === activeSymbolOption
                                ? 'bg-cyan-500/15 text-white' : 'bg-transparent text-slate-300 hover:bg-slate-800/60'}`}
                            >
                              <span data-no-translate className="font-bold text-cyan-300">{option.baseAsset}/USDT</span>
                              <span data-no-translate className="truncate text-slate-400">{option.symbol}</span>
                            </button>
                          )) : (
                            <div role="status" className="px-3 py-3 text-xs text-slate-400">
                              {t('surveillance.ui.noSymbolMatches')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-400">
                      {t('surveillance.ui.symbolHint')}
                    </p>
                  </div>
                </>
              )}

              {/* Breakout Confirmation Modes (Multi-select) (#94) */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{t('surveillance.ui.triggerModes')}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {TRIGGER_MODE_OPTIONS.map((m) => {
                    const isSelected = formConfig.triggerModes?.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleTriggerMode(m.id)}
                        className={`p-2 rounded-xl text-left transition-all border cursor-pointer flex items-center gap-2 ${
                          isSelected
                            ? 'bg-cyan-500/20 border-cyan-400 text-white font-semibold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] border ${isSelected ? 'bg-cyan-500 border-cyan-400 text-slate-950 font-bold' : 'border-slate-700 bg-slate-950'}`}>
                          {isSelected ? '✓' : ''}
                        </span>
                        <span>{t('surveillance.ui.trigger.' + m.id)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Density Engine Settings (#95) */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t('surveillance.ui.searchDensities')}</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(['AUTO', 'MANUAL', 'HYBRID'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setFormConfig((prev) => ({ ...prev, densityMode: mode }))}
                      className={`py-1.5 px-2 rounded-lg text-center font-bold transition-all border cursor-pointer ${
                        formConfig.densityMode === mode
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                {formConfig.densityMode !== 'AUTO' && (
                  <ManualDensityThresholdField
                    value={formConfig.manualDensityThresholdUsd}
                    onChange={(value) => setFormConfig((prev) => ({ ...prev, manualDensityThresholdUsd: value }))}
                  />
                )}
                <p className="text-[10px] leading-relaxed text-slate-400">
                  {formConfig.densityMode === 'AUTO'
                    ? 'Адаптивний поріг обчислюється з актуальних рівнів DOM та обсягу торгів.'
                    : formConfig.densityMode === 'MANUAL'
                      ? 'Шукаємо рівні DOM від вказаної суми (ціна × кількість на одному рівні). Якщо таких немає, чекаємо наступних оновлень стакана.'
                      : 'Застосовується більший із ручного та адаптивного порогів. Сусідні рівні не об’єднуються для досягнення суми.'}
                </p>
              </div>

              {/* Setup Detection Toggles (#96, #97) */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('surveillance.ui.confirmation')}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-900">
                    <input
                      type="checkbox"
                      checked={formConfig.levelsEnabled}
                      onChange={(e) => setFormConfig((p) => ({ ...p, levelsEnabled: e.target.checked }))}
                      className="rounded text-cyan-500"
                    />
                    <span>{t('surveillance.ui.levelRetest')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-900">
                    <input
                      type="checkbox"
                      checked={formConfig.structureEnabled}
                      onChange={(e) => setFormConfig((p) => ({ ...p, structureEnabled: e.target.checked }))}
                      className="rounded text-cyan-500"
                    />
                    <span>{t('surveillance.ui.structureChange')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-900">
                    <input
                      type="checkbox"
                      checked={formConfig.channelEnabled}
                      onChange={(e) => setFormConfig((p) => ({ ...p, channelEnabled: e.target.checked }))}
                      className="rounded text-cyan-500"
                    />
                    <span>{t('surveillance.ui.channelRetest')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-900">
                    <input
                      type="checkbox"
                      checked={formConfig.thirdTouchAlerts}
                      onChange={(e) => setFormConfig((p) => ({ ...p, thirdTouchAlerts: e.target.checked }))}
                      className="rounded text-cyan-500"
                    />
                    <span>{t('surveillance.ui.thirdTouch')}</span>
                  </label>
                </div>
              </div>

              {/* Telegram Notification Toggles */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-sky-400" />
                    <span>{t('surveillance.ui.telegram')}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formConfig.telegramEnabled}
                    onChange={(e) => setFormConfig((p) => ({ ...p, telegramEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded text-sky-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                  <span>Cooldown: {formConfig.cooldownMinutes || 15} хв між алерти</span>
                  <span>Confluence поріг: {formConfig.confluenceThreshold || 75}/100</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="shrink-0 p-3 sm:p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors"
              >
                {t('surveillance.ui.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveCoin}
                className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white shadow-lg transition-all"
              >
                {t(editingCoin ? 'surveillance.ui.save' : 'surveillance.ui.monitor24h')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
