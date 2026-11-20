import { getCoinVol5m, getCoinDistanceToHigh, getCoinDistanceToLow, matchesMarketPreset } from '../utils/marketPresets';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
  Flame,
  Zap,
  Send,
  Bookmark,
  ExternalLink,
  RefreshCw,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Activity,
  Layers,
  BarChart2,
  Maximize2,
  Sparkles,
  Lock,
} from 'lucide-react';
import { useSurveillance } from '../context/SurveillanceContext';
import { MonitoringMenuIcon } from './MonitoringIcon';
import { useAuth } from '../context/AuthContext';
import {
  ExchangeId,
  MarketType,
  MarketCoin,
  ScreenerPresetFilter,
  ScreenerSearchConfig,
  ScreenerSortBy,
  ScannedCoin,
  DetectedFormation,
} from '../types';
import { formatCryptoPrice, formatVolume, formatPercent } from '../utils/formatters';
import { screenerPreviewTradeLevels } from '../utils/screenerPreviewTradeLevels';
import { useAppPreferences } from '../utils/userPreferences';
import { MarketSentimentWidget } from './MarketSentimentWidget';
import { MarketDataFreshnessIcon } from './MarketDataFreshnessIcon';
import { useLanguage } from '../context/LanguageContext';
import {
  TOP_POPULAR_PAIRS,
} from '../utils/directExchangeClient';
import { loadMarketCoins } from '../utils/marketCoinLoader';
import { createScreenerQuoteSocket } from '../utils/screenerQuoteSocket';
import {
  SCREENER_FULL_REFRESH_MS,
  applyScreenerLiveQuotes,
  liveQuotesForReconciledSnapshot,
  screenerLiveScopeKey,
  screenerVisibleScopes,
  type ScreenerLiveQuote,
} from '../utils/screenerLiveQuotes';
import { matchesExchangeInstrumentSearch } from '../utils/marketSymbols';
import { isVolumeWithinCap, preferredVolumeSortOrder, type ScreenerVolumeMode } from '../utils/screenerVolume';
import { ScreenerVolumeDropdown } from './ScreenerVolumeDropdown';
import { ScreenerSortDropdown } from './ScreenerSortDropdown';
import { compareScreenerSearchCoins, effectiveScreenerSearchConfig, matchesAdvancedScreenerFilters, normalizeScreenerSearchSettings } from '../utils/screenerSearchSettings';
import { ScreenerCopySymbolButton } from './ScreenerCopySymbolButton';
import { isCoinInWatchlist, type CoinIdentifier } from '../utils/watchlistUtils';

interface CoinScreenerPageProps {
  onSelectCoin: (coin: ScannedCoin, formation?: DetectedFormation) => void;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  metaScalpBinding?: string;
  watchlist: string[];
  onToggleWatchlist: (coin: CoinIdentifier) => void;
  onOpenTelegramAlerts: (prefill?: any) => void;
  onOpenWatchlist: () => void;
  formationsCoins?: ScannedCoin[];
  onOpenAuthModal?: (mode?: 'signin' | 'signup', reason?: 'chart' | 'alerts' | 'linking' | 'general') => void;
}

export { getCoinVol5m, getCoinDistanceToHigh, getCoinDistanceToLow } from '../utils/marketPresets';

const MarketExtremeIcon: React.FC<{ direction: 'high' | 'low'; label: string }> = ({ direction, label }) => {
  const isHigh = direction === 'high';

  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-[10px] h-[10px] shrink-0 ${isHigh ? 'text-emerald-400' : 'text-red-400'}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <g transform={isHigh ? undefined : 'translate(0 24) scale(1 -1)'}>
        <path d="M7 3H22" />
        <path d="M2 21L8 10L11 15L15 6L18 11L21 3" />
      </g>
    </svg>
  );
};

// Keep the heavy chart bundle outside the initial Screener list. Only an
// explicitly opened card imports it; the list never renders hidden charts.
const LazyScreenerCardChart = React.lazy(() =>
  import('./ScreenerCardChart').then(module => ({ default: module.ScreenerCardChart }))
);

// Preserve the Screener's local filter/sort choices while its component is
// unmounted for a routed chart; no hidden polling or DOM is retained.
const screenerUiSession = new Map<string, {
  presetFilter: ScreenerPresetFilter;
  searchQuery: string;
  exchange: 'all' | ExchangeId;
  marketType: 'all' | MarketType;
  maxVolumeUsd: number;
  volumeMode: ScreenerVolumeMode;
  /** Applied profile defaults/preset at the moment the in-session state was saved. */
  savedConfigKey: string;
  advancedFilters: ScreenerSearchConfig;
  sortBy: ScreenerSortBy;
  sortOrder: 'asc' | 'desc';
  secondarySortBy: ScreenerSortBy | 'none';
  secondarySortOrder: 'asc' | 'desc';
  viewMode: 'table' | 'cards';
  displayLimit: number;
}>();

export const CoinScreenerPage: React.FC<CoinScreenerPageProps> = ({
  onSelectCoin,
  onSendMetaScalp,
  metaScalpBinding = '001',
  watchlist,
  onToggleWatchlist,
  onOpenTelegramAlerts,
  onOpenWatchlist,
  formationsCoins = [],
  onOpenAuthModal,
}) => {
  const { t, language } = useLanguage();
  const timeLocale = { uk: 'uk-UA', en: 'en-GB', ru: 'ru-RU', pl: 'pl-PL' }[language];
  const { user, profile } = useAuth();
  const { preferences } = useAppPreferences();
  const isGuest = !user;
  const previousUiSession = screenerUiSession.get(user?.uid || 'guest');
  const searchSettings = useMemo(() => normalizeScreenerSearchSettings(
    user?.uid && profile?.uid === user.uid ? profile.searchSettings : undefined,
    { exchange: preferences.defaultExchange, marketType: preferences.defaultMarketType },
  ), [user?.uid, profile?.uid, profile?.searchSettings, preferences.defaultExchange, preferences.defaultMarketType]);
  const initialSearch = useMemo(() => effectiveScreenerSearchConfig(searchSettings,
    { exchange: preferences.defaultExchange, marketType: preferences.defaultMarketType }),
    [searchSettings, preferences.defaultExchange, preferences.defaultMarketType]);
  const savedConfigKey = JSON.stringify(initialSearch);
  // A default/preset saved in the profile while the Screener is unmounted
  // must replace the older session filters when the Screener is opened again.
  const cachedUi = previousUiSession?.savedConfigKey === savedConfigKey ? previousUiSession : undefined;
  const cacheAtMount = useRef({ uid: user?.uid || 'guest', existed: !!cachedUi });
  const [coins, setCoins] = useState<MarketCoin[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [errorShowsCachedData, setErrorShowsCachedData] = useState(false);
  // Partial exchange snapshots are still usable. Do not turn a transient
  // Bybit/Binance rate-limit notice into a prominent red error banner.
  const [hasPartialMarketData, setHasPartialMarketData] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const previousSitePreferences = useRef({
    exchange: preferences.defaultExchange,
    marketType: preferences.defaultMarketType,
  });

  // Search & Filter state
  const [presetFilter, setPresetFilter] = useState<ScreenerPresetFilter>(() => cachedUi?.presetFilter ?? initialSearch.presetFilter);
  const [searchQuery, setSearchQuery] = useState<string>(() => cachedUi?.searchQuery ?? initialSearch.searchQuery);
  const [isSearchPresetMenuOpen, setIsSearchPresetMenuOpen] = useState(false);
  const searchPresetDropdownRef = useRef<HTMLDivElement>(null);

  // Keep the compact preset menu anchored to the coin search, closing it on
  // outside interaction or Escape without changing the active search filters.
  useEffect(() => {
    if (!isSearchPresetMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!searchPresetDropdownRef.current?.contains(event.target as Node)) {
        setIsSearchPresetMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSearchPresetMenuOpen(false);
        searchPresetDropdownRef.current?.querySelector<HTMLButtonElement>('[data-screener-preset-trigger]')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isSearchPresetMenuOpen]);
  const [exchange, setExchange] = useState<'all' | ExchangeId>(() => cachedUi?.exchange ?? initialSearch.exchange);
  const [marketType, setMarketType] = useState<'all' | MarketType>(() => cachedUi?.marketType ?? initialSearch.marketType);

  useEffect(() => {
    const before = previousSitePreferences.current;
    if (before.exchange === preferences.defaultExchange && before.marketType === preferences.defaultMarketType) return;
    previousSitePreferences.current = { exchange: preferences.defaultExchange, marketType: preferences.defaultMarketType };
    // Screener-specific account presets override the site-wide exchange/market defaults.
    if (user?.uid && profile?.uid === user.uid && profile.searchSettings?.defaultConfig) return;
    setExchange(preferences.defaultExchange);
    setMarketType(preferences.defaultMarketType);
  }, [preferences.defaultExchange, preferences.defaultMarketType, user?.uid, profile?.uid, profile?.searchSettings]);
  // 0 means unlimited; positive thresholds include the selected value in both directions.
  const [maxVolumeUsd, setMaxVolumeUsd] = useState<number>(() => cachedUi?.maxVolumeUsd ?? initialSearch.maxVolumeUsd);
  const [volumeMode, setVolumeMode] = useState<ScreenerVolumeMode>(() => cachedUi?.volumeMode ?? initialSearch.volumeMode);
  const [advancedFilters, setAdvancedFilters] = useState<ScreenerSearchConfig>(() => cachedUi?.advancedFilters ?? initialSearch);
  const [sortBy, setSortBy] = useState<ScreenerSortBy>(() => cachedUi?.sortBy ?? initialSearch.sortBy);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => cachedUi?.sortOrder ?? initialSearch.sortOrder);
  const [secondarySortBy, setSecondarySortBy] = useState<ScreenerSortBy | 'none'>(() => cachedUi?.secondarySortBy ?? initialSearch.secondarySortBy);
  const [secondarySortOrder, setSecondarySortOrder] = useState<'asc' | 'desc'>(() => cachedUi?.secondarySortOrder ?? initialSearch.secondarySortOrder);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => cachedUi?.viewMode ?? 'table');
  // At most ONE expanded chart at a time: closing or switching cards immediately
  // unmounts its HookChart and releases the public candle stream.
  const [activeCardChart, setActiveCardChart] = useState<{ key: string; height: number } | null>(null);

  const openCardChart = (event: React.MouseEvent<HTMLButtonElement>, coin: MarketCoin) => {
    event.stopPropagation();
    if (isGuest) {
      onOpenAuthModal?.('signin', 'chart');
      return;
    }
    const card = event.currentTarget.closest('[data-screener-coin-card]');
    // Freeze only the opened card at its CURRENT measured height. The
    // unexpanded cards keep their original responsive layout and dimensions.
    const height = card instanceof HTMLElement ? Math.ceil(card.getBoundingClientRect().height) : 240;
    setActiveCardChart({
      key: [coin.exchange, coin.marketType, coin.symbol].join('|'),
      height: Math.max(1, height),
    });
  };

  const { coins: surveillanceCoins, addCoinToSurveillance, removeCoinFromSurveillance, isCoinMonitored, isCoinOnSurveillance } = useSurveillance();
  const [surveillanceToast, setSurveillanceToast] = useState<string | null>(null);

  const handleSurveillanceToggle = async (e: React.MouseEvent, coin: MarketCoin) => {
    e.stopPropagation();
    if (isGuest) {
      onOpenAuthModal?.('signin', 'general');
      return;
    }
    const onSurveillance = isCoinOnSurveillance(coin.symbol, coin.exchange);
    if (onSurveillance) {
      const found = surveillanceCoins.find(
        (c) => c.symbol === coin.symbol && c.exchange === coin.exchange
      );
      if (found) {
        await removeCoinFromSurveillance(found.id);
        setSurveillanceToast(t('screener.surveillance.removed', { symbol: coin.symbol }));
        setTimeout(() => setSurveillanceToast(null), 3000);
      }
    } else {
      const res = await addCoinToSurveillance(coin.symbol, coin.exchange, coin.marketType);
      if (res.success) {
        setSurveillanceToast(t('screener.surveillance.added', { symbol: coin.symbol }));
        setTimeout(() => setSurveillanceToast(null), 3000);
      } else {
        setSurveillanceToast(res.error || t('screener.surveillance.failed', { symbol: coin.symbol }));
        setTimeout(() => setSurveillanceToast(null), 3500);
      }
    }
  };
  const [displayLimit, setDisplayLimit] = useState<number>(() => cachedUi?.displayLimit ?? 50);

  const applySearchConfig = useCallback((config: ReturnType<typeof effectiveScreenerSearchConfig>) => {
    setPresetFilter(config.presetFilter);
    setSearchQuery(config.searchQuery);
    setExchange(config.exchange);
    setMarketType(config.marketType);
    setMaxVolumeUsd(config.maxVolumeUsd);
    setVolumeMode(config.volumeMode);
    setAdvancedFilters(config);
    setSortBy(config.sortBy);
    setSortOrder(config.sortOrder);
    setSecondarySortBy(config.secondarySortBy);
    setSecondarySortOrder(config.secondarySortOrder);
    setDisplayLimit(50);
  }, []);

  // Auth may hydrate after the Screener first mounts. Apply account defaults once,
  // but keep the user's active in-session filters when returning from a chart page.
  const initializedSearchOwner = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.uid || profile?.uid !== user.uid || initializedSearchOwner.current === user.uid) return;
    initializedSearchOwner.current = user.uid;
    if (cacheAtMount.current.uid === user.uid && cacheAtMount.current.existed) return;
    applySearchConfig(effectiveScreenerSearchConfig(profile.searchSettings, {
      exchange: preferences.defaultExchange, marketType: preferences.defaultMarketType,
    }));
  }, [user?.uid, profile?.uid, profile?.searchSettings, preferences.defaultExchange, preferences.defaultMarketType, applySearchConfig]);

  // When the profile updates the active default or its selected preset while
  // this page is mounted, apply it immediately, without resetting manual UI
  // changes for unrelated profile writes or unchanged search defaults.
  const observedConfigRef = useRef({ uid: user?.uid || 'guest', key: savedConfigKey });
  useEffect(() => {
    const uid = user?.uid || 'guest';
    const previous = observedConfigRef.current;
    observedConfigRef.current = { uid, key: savedConfigKey };
    if (!user?.uid || profile?.uid !== user.uid || previous.uid !== uid || previous.key === savedConfigKey) return;
    applySearchConfig(initialSearch);
  }, [user?.uid, profile?.uid, savedConfigKey, initialSearch, applySearchConfig]);

  useEffect(() => {
    screenerUiSession.set(user?.uid || 'guest', {
      presetFilter, searchQuery, exchange, marketType, maxVolumeUsd, volumeMode, savedConfigKey, advancedFilters, sortBy,
      sortOrder, secondarySortBy, secondarySortOrder, viewMode, displayLimit,
    });
  }, [user?.uid, presetFilter, searchQuery, exchange, marketType, maxVolumeUsd, volumeMode, savedConfigKey, advancedFilters,
    sortBy, sortOrder, secondarySortBy, secondarySortOrder, viewMode, displayLimit]);

  const currentRequest = useRef<{ key: string; controller: AbortController } | null>(null);
  const loadedSelection = useRef<string | null>(null);
  // Preserve WS updates arriving during a full REST snapshot so that a slow
  // 40s reconciliation cannot visually roll prices backwards.
  const latestLiveQuotes = useRef(new Map<string, { quote: ScreenerLiveQuote; at: number }>());
  const quoteSocketRef = useRef<ReturnType<typeof createScreenerQuoteSocket> | null>(null);
  const selectionKey = `${exchange}:${marketType}`;

  const fetchCoins = useCallback(async () => {
    if (currentRequest.current?.key === selectionKey) return;
    currentRequest.current?.controller.abort();
    const requestStartedAt = Date.now();
    const request = { key: selectionKey, controller: new AbortController() };
    currentRequest.current = request;
    setIsLoading(true);
    setError(null);
    setErrorShowsCachedData(false);
    if (loadedSelection.current !== selectionKey) {
      loadedSelection.current = null;
      setCoins([]);
      setLastUpdated(null);
      setHasPartialMarketData(false);
    }
    try {
      const snapshot = await loadMarketCoins({ exchange, marketType }, request.controller.signal);
      if (currentRequest.current !== request || request.controller.signal.aborted) return;
      const afterSnapshot = liveQuotesForReconciledSnapshot(
        latestLiveQuotes.current.values(), requestStartedAt,
      );
      setCoins(applyScreenerLiveQuotes(snapshot.coins, afterSnapshot));
      setLastUpdated(snapshot.timestamp);
      // Keep freshness information, not the internal source/error prose.
      // Live WS prices and refresh logic continue unchanged.
      setHasPartialMarketData(Boolean(snapshot.warning));
      loadedSelection.current = selectionKey;
    } catch (err) {
      if (currentRequest.current !== request || request.controller.signal.aborted) return;
      setErrorShowsCachedData(loadedSelection.current === selectionKey);
      setError(err instanceof Error ? err.message : 'screener.main.quoteFailed');
    } finally {
      if (currentRequest.current === request) {
        currentRequest.current = null;
        setIsLoading(false);
      }
    }
  }, [exchange, marketType, selectionKey]);

  const lastQuotePollRef = useRef<{ key: string; at: number } | null>(null);
  useEffect(() => {
    const refresh = (initial = false) => {
      // A hidden Desktop pane must not keep polling public quote lists.
      if (document.hidden) return;
      const last = lastQuotePollRef.current;
      if (!initial && last?.key === selectionKey && Date.now() - last.at < 35_000) return;
      lastQuotePollRef.current = { key: selectionKey, at: Date.now() };
      void fetchCoins();
    };
    refresh(true);
    const interval = setInterval(() => refresh(), SCREENER_FULL_REFRESH_MS);
    const onVisibilityChange = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      currentRequest.current?.controller.abort();
      currentRequest.current = null;
    };
  }, [fetchCoins, selectionKey]);

  // Handle Preset Click
  const handlePresetChange = (preset: ScreenerPresetFilter) => {
    setPresetFilter(preset);
    setDisplayLimit(50);
    if (preset === 'top_gainers') {
      setSortBy('priceChange');
      setSortOrder('desc');
    } else if (preset === 'top_losers') {
      setSortBy('priceChange');
      setSortOrder('asc');
    } else if (preset === 'near_highs') {
      setSortBy('distanceToHigh');
      setSortOrder('asc');
    } else if (preset === 'near_lows') {
      setSortBy('distanceToLow');
      setSortOrder('asc');
    } else if (preset === 'active') {
      setSortBy('volatility');
      setSortOrder('desc');
    }
  };

  // Header column click toggle sorting
  const handleHeaderSort = (column: ScreenerSortBy) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(column);
      setSortOrder(column === 'distanceToHigh' || column === 'distanceToLow' ? 'asc' : 'desc');
    }
  };

  // Create lookup for formations
  const formationsMap = useMemo(() => {
    const map = new Map<string, ScannedCoin>();
    for (const c of formationsCoins) {
      const key = `${c.exchange}_${c.symbol}_${c.marketType}`.toUpperCase();
      map.set(key, c);
    }
    return map;
  }, [formationsCoins]);

  // One browser connection forwards live quotes from the VPS' shared Binance
  // socket and bounded Bybit visible-symbol pools. Scans, filters, 5m history
  // and ticker catalog membership still reconcile every 40s.
  useEffect(() => {
    const socket = createScreenerQuoteSocket((rows, at) => {
      for (const quote of rows) latestLiveQuotes.current.set(
        screenerLiveScopeKey(quote), { quote, at },
      );
      // Keep the overlay small; stale peers cannot overwrite new REST quotes.
      for (const [key, item] of latestLiveQuotes.current) {
        if (at - item.at > 15_000) latestLiveQuotes.current.delete(key);
      }
      setCoins(current => applyScreenerLiveQuotes(current, rows));
    });
    quoteSocketRef.current = socket;
    socket.start();
    return () => {
      if (quoteSocketRef.current === socket) quoteSocketRef.current = null;
      socket.stop();
    };
  }, []);

  // Filter and Sort coins
  const filteredCoins = useMemo(() => {
    let result = coins.filter((coin) => {
      // Search query filter
      if (searchQuery.trim() && !matchesExchangeInstrumentSearch(coin.symbol, coin.baseAsset, searchQuery)) return false;

      // Exchange filter
      if (exchange !== 'all' && coin.exchange !== exchange) return false;

      // Market type filter
      if (marketType !== 'all' && coin.marketType !== marketType) return false;

      // Apply an inclusive ceiling or floor to already loaded 24-hour volume values.
      if (!isVolumeWithinCap(coin.volumeUsd, maxVolumeUsd, volumeMode)) return false;

      if (!matchesMarketPreset(coin, presetFilter)) return false;
      const formationKey = `${coin.exchange}_${coin.symbol}_${coin.marketType}`.toUpperCase();
      return matchesAdvancedScreenerFilters(coin, advancedFilters, formationsMap.get(formationKey));
    });

    // Multi-priority sorting uses only the quotes already in memory.
    result.sort((a, b) => compareScreenerSearchCoins(a, b, {
      sortBy, sortOrder, secondarySortBy, secondarySortOrder,
    }));

    return result;
  }, [coins, searchQuery, exchange, marketType, maxVolumeUsd, volumeMode, presetFilter, advancedFilters, formationsMap,
    sortBy, sortOrder, secondarySortBy, secondarySortOrder]);

  const liveScopes = useMemo(() => screenerVisibleScopes(filteredCoins, displayLimit),
    [filteredCoins, displayLimit]);
  const liveScopeKey = liveScopes.map(screenerLiveScopeKey).join('|');
  // The scope-key is the real subscription identity; repeated quote renders
  // with equal keys must not resubscribe or restart the 2s throttle.
  const liveScopesRef = useRef(liveScopes);
  liveScopesRef.current = liveScopes;
  const lastLiveSubscribeAt = useRef(0);
  useEffect(() => {
    // At most one subscription update per two seconds. Unlike an infinite
    // debounce, this also updates when market sorting changes continuously.
    const elapsed = Date.now() - lastLiveSubscribeAt.current;
    const wait = Math.max(0, 2_000 - elapsed);
    const timer = setTimeout(() => {
      lastLiveSubscribeAt.current = Date.now();
      quoteSocketRef.current?.updateScopes(liveScopesRef.current);
    }, wait);
    return () => clearTimeout(timer);
  }, [liveScopeKey]);

  // Market stats calculated from all coins
  const marketStats = useMemo(() => {
    if (coins.length === 0) {
      return {
        total: 0,
        activeCount: 0,
        nearHighCount: 0,
        nearLowCount: 0,
        totalVolume: 0,
        topGainer: null,
        topLoser: null,
      };
    }

    let activeCount = 0;
    let nearHighCount = 0;
    let nearLowCount = 0;
    let totalVolume = 0;
    let topGainer = coins[0];
    let topLoser = coins[0];

    for (const c of coins) {
      if (c.isActiveCoin) activeCount++;
      if (c.isNearHigh) nearHighCount++;
      if (c.isNearLow) nearLowCount++;
      totalVolume += c.volumeUsd;

      if (c.change24h > topGainer.change24h) topGainer = c;
      if (c.change24h < topLoser.change24h) topLoser = c;
    }

    return {
      total: coins.length,
      activeCount,
      nearHighCount,
      nearLowCount,
      totalVolume,
      topGainer,
      topLoser,
    };
  }, [coins]);

  // Helper to convert MarketCoin to ScannedCoin and trigger modal
  const handleCoinClick = (coin: MarketCoin) => {
    if (isGuest) {
      onOpenAuthModal?.('signin', 'chart');
      return;
    }
    const key = `${coin.exchange}_${coin.symbol}_${coin.marketType}`.toUpperCase();
    const existing = formationsMap.get(key);

    if (existing && existing.formations.length > 0) {
      onSelectCoin(existing, existing.formations[0]);
    } else {
      // Synthesize ScannedCoin and Formation
      const scanned: ScannedCoin = {
        symbol: coin.symbol,
        baseAsset: coin.baseAsset,
        quoteAsset: coin.quoteAsset,
        exchange: coin.exchange,
        marketType: coin.marketType,
        currentPrice: coin.price,
        priceChange24h: coin.change24h,
        highPrice24h: coin.high24h,
        lowPrice24h: coin.low24h,
        volume24hUsd: coin.volumeUsd,
        formations: [],
        timeframe: '1h',
        lastUpdated: Date.now(),
        exchangeUrl: coin.exchangeUrl,
      };

      // This is a 24h RANGE PREVIEW, not a scanner-confirmed formation.
      // Never emit reversed TP/SL for a bearish coin or use 24h change as TP%.
      const preview = screenerPreviewTradeLevels(coin);
      if (!preview) {
        onSelectCoin(scanned);
        return;
      }
      const near24hHigh = getCoinDistanceToHigh(coin) <= 2.5;
      const near24hLow = getCoinDistanceToLow(coin) <= 2.5;
      const defaultFormation: DetectedFormation = {
        id: `screener_preview_${coin.exchange}_${coin.marketType}_${coin.symbol}`,
        patternKey: 'range',
        source: 'screener_24h_preview',
        name: near24hHigh
          ? 'Тестування 24h High (Спротив)'
          : near24hLow
          ? 'Тестування 24h Low (Підтримка)'
          : 'Діапазон ціни 24h',
        nameEn: near24hHigh ? '24h High Test' : near24hLow ? '24h Low Test' : '24h Range',
        category: 'breakout',
        bias: preview.bias,
        confidence: 0, // Reference levels have NO scanner confluence or success score.
        status: 'forming',
        statusLabel: 'Довідковий діапазон 24h',
        description: `Поточна ціна ${formatCryptoPrice(coin.price)}, 24h максимум ${formatCryptoPrice(coin.high24h)}, 24h мінімум ${formatCryptoPrice(coin.low24h)}.`,
        levels: {
          entryPrice: preview.entryPrice,
          targetPrice: preview.targetPrice,
          stopLossPrice: preview.stopLossPrice,
          resistancePrice: coin.high24h,
          supportPrice: coin.low24h,
        },
        riskRewardRatio: preview.riskRewardRatio,
        potentialProfitPct: preview.potentialProfitPct,
        potentialRiskPct: preview.potentialRiskPct,
        detectedAt: Date.now(),
      };

      onSelectCoin(scanned, defaultFormation);
    }
  };

  const handleSendMetaScalpClick = (e: React.MouseEvent, coin: MarketCoin) => {
    e.stopPropagation();
    if (isGuest) {
      onOpenAuthModal?.('signin', 'linking');
      return;
    }
    if (onSendMetaScalp) {
      const scanned: ScannedCoin = {
        symbol: coin.symbol,
        baseAsset: coin.baseAsset,
        quoteAsset: coin.quoteAsset,
        exchange: coin.exchange,
        marketType: coin.marketType,
        currentPrice: coin.price,
        priceChange24h: coin.change24h,
        highPrice24h: coin.high24h,
        lowPrice24h: coin.low24h,
        volume24hUsd: coin.volumeUsd,
        formations: [],
        timeframe: '1h',
        lastUpdated: Date.now(),
        exchangeUrl: coin.exchangeUrl,
      };
      onSendMetaScalp(scanned);
    }
  };

  const handleAlertClick = (e: React.MouseEvent, coin: MarketCoin) => {
    e.stopPropagation();
    if (isGuest) {
      onOpenAuthModal?.('signin', 'alerts');
      return;
    }
    onOpenTelegramAlerts({
      symbol: coin.symbol,
      exchange: coin.exchange,
      marketType: coin.marketType,
      currentPrice: coin.price,
      targetPrice: getCoinDistanceToHigh(coin) <= 2.5
        ? coin.high24h
        : getCoinDistanceToLow(coin) <= 2.5 ? coin.low24h : coin.price,
      condition: 'gte',
      formationName: `Скрінер: ${coin.symbol}`,
    });
  };

  const scrollScreenerTo = (edge: 'top' | 'bottom') => {
    const page = document.scrollingElement ?? document.documentElement;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    window.scrollTo({ top: edge === 'top' ? 0 : page.scrollHeight, behavior });
  };

  return (
    <div className="space-y-6 relative">
      {/* Surveillance Action Toast */}
      {surveillanceToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border border-violet-500/50 bg-slate-950/90 text-violet-200 shadow-2xl text-xs font-semibold animate-in fade-in slide-in-from-bottom-3 backdrop-blur-md">
          <MonitoringMenuIcon className="w-4 h-4 animate-pulse" />
          <span>{surveillanceToast}</span>
        </div>
      )}

      {/* Market sentiment remains visible; the standalone news panel is removed. */}
      <div data-screener-guide="sentiment"><MarketSentimentWidget coins={coins} /></div>

      {/* Quick navigation and watchlist controls */}
      <div
        role="group"
        aria-label={t('screener.main.navigation')}
        className="fixed bottom-4 right-4 z-30 flex flex-col gap-1.5"
      >
        <button
          type="button"
          onClick={() => scrollScreenerTo('top')}
          className="h-9 w-9 flex items-center justify-center border-0 bg-transparent p-0 text-slate-300 shadow-none hover:bg-transparent hover:text-cyan-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 touch-manipulation"
          title={t('screener.main.toTop')}
          aria-label={t('screener.main.toTop')}
        >
          <ArrowUpToLine className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => scrollScreenerTo('bottom')}
          className="h-9 w-9 flex items-center justify-center border-0 bg-transparent p-0 text-slate-300 shadow-none hover:bg-transparent hover:text-cyan-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 touch-manipulation"
          title={t('screener.main.toBottom')}
          aria-label={t('screener.main.toBottom')}
        >
          <ArrowDownToLine className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onOpenWatchlist}
          className="h-9 w-9 flex items-center justify-center border-0 bg-transparent p-0 text-amber-400 shadow-none hover:bg-transparent hover:text-amber-300 transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 touch-manipulation"
          title={t(isGuest ? 'screener.main.watchlistGuest' : 'screener.main.watchlist')}
          aria-label={t('screener.main.openWatchlist')}
        >
          <Bookmark className="w-4 h-4" />
          {isGuest && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-0 bg-transparent text-amber-400 flex items-center justify-center">
              <Lock className="w-2 h-2" />
            </span>
          )}
        </button>
      </div>

      {/* Main Filter & Search Toolbar */}
      <div className="vq-filter-panel p-3 sm:p-4 rounded-2xl bg-slate-900/70 border border-slate-800/90 backdrop-blur-md space-y-3 sm:space-y-4">
        {/* Preset Category Filter Buttons (Prompt Required: Активні монети, топ за зростанням, на хаях, на лоях) */}
        <div data-screener-guide="presets" className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0 sm:flex-wrap">
          <span className="text-xs text-slate-400 font-semibold mr-1 flex items-center gap-1 shrink-0">
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden xs:inline">{t('filters')}</span>
          </span>

          <button
            onClick={() => handlePresetChange('all')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              presetFilter === 'all'
                ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/50'
            }`}
          >
            {t('all')}
          </button>

          <button
            onClick={() => handlePresetChange('active')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              presetFilter === 'active'
                ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20 font-bold'
                : 'bg-slate-800/80 text-amber-400 hover:bg-slate-800 border border-amber-500/30'
            }`}
          >
            <Flame className="w-3.5 h-3.5 fill-current" />
            <span>{t('activeCoins')}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-950/80 text-amber-200 border border-amber-800/50 font-mono">
              {marketStats.activeCount}
            </span>
          </button>

          <button
            onClick={() => handlePresetChange('top_gainers')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              presetFilter === 'top_gainers'
                ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20 font-bold'
                : 'bg-slate-800/80 text-emerald-400 hover:bg-slate-800 border border-emerald-500/30'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{t('topGainers')}</span>
          </button>

          <button
            onClick={() => handlePresetChange('top_losers')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              presetFilter === 'top_losers'
                ? 'bg-rose-500 text-white shadow-sm shadow-rose-500/20 font-bold'
                : 'bg-slate-800/80 text-rose-400 hover:bg-slate-800 border border-rose-500/30'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>{t('topLosers')}</span>
          </button>

          <button
            onClick={() => handlePresetChange('near_highs')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              presetFilter === 'near_highs'
                ? 'bg-purple-500 text-white shadow-sm shadow-purple-500/20 font-bold'
                : 'bg-slate-800/80 text-purple-300 hover:bg-slate-800 border border-purple-500/30'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>{t('nearHighs')}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-950/80 text-purple-200 border border-purple-800/50 font-mono">
              {marketStats.nearHighCount}
            </span>
          </button>

          <button
            onClick={() => handlePresetChange('near_lows')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              presetFilter === 'near_lows'
                ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/20 font-bold'
                : 'bg-slate-800/80 text-blue-300 hover:bg-slate-800 border border-blue-500/30'
            }`}
          >
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>{t('nearLows')}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-950/80 text-blue-200 border border-blue-800/50 font-mono">
              {marketStats.nearLowCount}
            </span>
          </button>
        </div>

        {/* Secondary controls: Search, Exchange, Market, Min Volume, View mode */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-800/60">
          <div className="w-full flex justify-center">
            <div data-screener-guide="search" ref={searchPresetDropdownRef} className="relative w-full sm:w-auto sm:min-w-[200px] sm:max-w-xs lg:w-[280px] lg:min-w-[280px]">
              <Search className="w-4 h-4 lg:w-[18px] lg:h-[18px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search')}
                aria-label={t('screener.main.search')}
                className={`w-full pl-9 lg:pl-10 ${user ? 'pr-[72px]' : 'pr-8'} py-1.5 lg:py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs lg:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors font-mono`}
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label={t('screener.main.clearSearch')}
                  onClick={() => setSearchQuery('')}
                  className={`absolute ${user ? 'right-11' : 'right-2.5'} top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs font-bold`}
                >
                  ✕
                </button>
              )}
              {user && (
                <>
                  <button
                    type="button"
                    data-screener-preset-trigger
                    aria-label={t('screener.main.expandPresets')}
                    aria-expanded={isSearchPresetMenuOpen}
                    aria-controls="screener-custom-search-preset"
                    title={t('screener.main.searchPresets')}
                    onClick={() => setIsSearchPresetMenuOpen(open => !open)}
                    className={`absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-xl border-l border-slate-800 text-cyan-400 transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${isSearchPresetMenuOpen ? 'bg-slate-800' : ''}`}
                  >
                    <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${isSearchPresetMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isSearchPresetMenuOpen && (
                    <div
                      id="screener-custom-search-preset"
                      role="region"
                      aria-label={t('screener.main.searchPresets')}
                      className="absolute right-0 top-full z-50 mt-1.5 max-h-64 w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-cyan-500/30 bg-slate-950 p-1.5 shadow-2xl shadow-black/50"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          applySearchConfig(effectiveScreenerSearchConfig(searchSettings));
                          setIsSearchPresetMenuOpen(false);
                        }}
                        className="block w-full rounded-lg px-3 py-2 text-left text-xs text-cyan-300 transition-colors hover:bg-slate-800 focus-visible:bg-slate-800 focus-visible:outline-none"
                      >
                        {t('screener.main.applyDefault')}
                      </button>
                      {(searchSettings.presets || []).map(item => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => {
                            const selected = searchSettings.presets?.find(preset => preset.id === item.id);
                            if (selected) applySearchConfig(selected.config);
                            setIsSearchPresetMenuOpen(false);
                          }}
                          className="block w-full break-words rounded-lg px-3 py-2 text-left text-xs text-slate-200 transition-colors hover:bg-slate-800 focus-visible:bg-slate-800 focus-visible:outline-none"
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 flex-1 min-w-0 sm:relative sm:left-12">
            {/* Exchange Filter */}
            <div data-screener-guide="exchange" className="flex items-center rounded-xl bg-slate-950/80 border border-slate-800 p-0.5 text-xs lg:text-[12px]">
              <button
                onClick={() => setExchange('all')}
                className={`px-2 sm:px-2.5 lg:px-[11px] py-1 lg:py-1 rounded-lg font-medium transition-colors ${
                  exchange === 'all' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('all')}
              </button>
              <button
                onClick={() => setExchange('binance')}
                data-exchange="binance"
                aria-pressed={exchange === 'binance'}
                className={`site-exchange-filter px-2 sm:px-2.5 lg:px-[11px] py-1 lg:py-1 rounded-lg font-medium transition-colors ${
                  exchange === 'binance' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-amber-400'
                }`}
              >
                Binance
              </button>
              <button
                onClick={() => setExchange('bybit')}
                data-exchange="bybit"
                aria-pressed={exchange === 'bybit'}
                className={`site-exchange-filter px-2 sm:px-2.5 lg:px-[11px] py-1 lg:py-1 rounded-lg font-medium transition-colors ${
                  exchange === 'bybit' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : 'text-slate-400 hover:text-orange-400'
                }`}
              >
                Bybit
              </button>
            </div>

            {/* Market Type Filter */}
            <div data-screener-guide="market" className="flex items-center rounded-xl bg-slate-950/80 border border-slate-800 p-0.5 text-xs lg:text-[12px]">
              <button
                onClick={() => setMarketType('all')}
                className={`px-2 sm:px-2.5 lg:px-[11px] py-1 lg:py-1 rounded-lg font-medium transition-colors ${
                  marketType === 'all' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('allMarkets')}
              </button>
              <button
                onClick={() => setMarketType('futures')}
                className={`px-2 sm:px-2.5 lg:px-[11px] py-1 lg:py-1 rounded-lg font-medium transition-colors ${
                  marketType === 'futures' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-400 hover:text-indigo-400'
                }`}
              >
                {t('futures')}
              </button>
              <button
                onClick={() => setMarketType('spot')}
                className={`px-2 sm:px-2.5 lg:px-[11px] py-1 lg:py-1 rounded-lg font-medium transition-colors ${
                  marketType === 'spot' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                {t('spot')}
              </button>
            </div>

          </div>

          {/* Right side: view toggle + refresh */}
          <div className="flex items-center gap-2 self-center">
            {/* View Mode Toggle */}
            <div data-screener-guide="views" className="flex items-center rounded-xl bg-slate-950/80 border border-slate-800 p-0.5 text-xs">
              <button
                type="button"
                aria-label={t('viewTable')}
                aria-pressed={viewMode === 'table'}
                onClick={() => { setViewMode('table'); setActiveCardChart(null); }}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  viewMode === 'table' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
                }`}
                title={t('viewTable')}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label={t('viewCards')}
                aria-pressed={viewMode === 'cards'}
                onClick={() => setViewMode('cards')}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  viewMode === 'cards' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
                }`}
                title={t('viewCards')}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

            {/* Refresh button */}
            <button
              type="button"
              aria-label={t('screener.main.refreshQuotes')}
              onClick={() => fetchCoins()}
              disabled={isLoading}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:opacity-50 cursor-pointer"
              title={t('screener.main.refreshQuotes')}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Keep the paired mobile filters; desktop fields use compact, bounded widths. */}
        <div className="grid min-w-0 grid-cols-1 gap-2 border-t border-slate-800/40 pt-2 lg:flex lg:flex-wrap lg:items-center lg:justify-between">
          <div className="grid min-w-0 grid-cols-2 gap-2 lg:flex">
            <div data-screener-filter="sort" className="flex min-h-12 w-full min-w-0 flex-col items-stretch justify-center gap-0.5 rounded-xl border border-slate-800 bg-slate-950/80 px-2.5 py-1 text-xs sm:min-h-9 sm:flex-row sm:items-center sm:gap-1.5 lg:w-72">
              <span id="screener-sort-label" className="shrink-0 whitespace-nowrap text-[11px] text-slate-500">{t('screener.main.sortLabel')}</span>
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <ScreenerSortDropdown
                  id="screener-sort"
                  labelId="screener-sort-label"
                  value={sortBy}
                  onChange={setSortBy}
                />
                <button
                  onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                  title={t(sortOrder === 'desc' ? 'screener.main.sortDesc' : 'screener.main.sortAsc')}
                  className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:text-cyan-300"
                >
                  {sortOrder === 'desc' ? <ChevronDown className="h-3.5 w-3.5 text-cyan-400" /> : <ChevronUp className="h-3.5 w-3.5 text-cyan-400" />}
                </button>
              </div>
            </div>

            {/* The right-edge arrow switches between inclusive max (≤) and min (≥) volume. */}
            <div data-screener-filter="volume" className="flex min-h-12 w-full min-w-0 flex-col items-stretch justify-center gap-0.5 rounded-xl border border-slate-800 bg-slate-950/80 px-2.5 py-1 text-xs sm:min-h-9 sm:flex-row sm:items-center sm:gap-1.5 lg:w-80">
              <span id="screener-volume-cap-label" className="shrink-0 whitespace-nowrap text-[11px] text-slate-500">{t('screenerVolume24h')}</span>
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <ScreenerVolumeDropdown
                  id="screener-volume-cap"
                  labelId="screener-volume-cap-label"
                  mode={volumeMode}
                  value={maxVolumeUsd}
                  onChange={value => {
                    setMaxVolumeUsd(value);
                    // With volume sorting selected, show coins closest to the selected floor/ceiling first.
                    if (sortBy === 'volume') setSortOrder(preferredVolumeSortOrder(volumeMode));
                    setDisplayLimit(50);
                  }}
                />
                <button type="button" data-screener-volume-direction
                  aria-label={t(volumeMode === 'to' ? 'screener.main.volumeSwitchFrom' : 'screener.main.volumeSwitchTo')}
                  aria-pressed={volumeMode === 'from'}
                  title={t(volumeMode === 'to' ? 'screener.main.volumeTooltipTo' : 'screener.main.volumeTooltipFrom')}
                  onClick={() => {
                    const nextMode = volumeMode === 'to' ? 'from' : 'to';
                    setVolumeMode(nextMode);
                    // A floor sorted from the largest volume hides the visible effect:
                    // top-50 coins are usually above every modest threshold.
                    // Preserve any other chosen sort metric and allow manual order overrides.
                    if (sortBy === 'volume') setSortOrder(preferredVolumeSortOrder(nextMode));
                    setDisplayLimit(50);
                  }}
                  className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-none border-0 bg-transparent p-0 text-cyan-300 shadow-none transition-colors hover:bg-transparent hover:text-white focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-400"
                >
                  {volumeMode === 'to' ? <ArrowDownToLine className="h-3.5 w-3.5" /> : <ArrowUpToLine className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            {t('screener.main.foundCount', { matched: filteredCoins.length, total: coins.length })}
          </div>
        </div>
      </div>

      {/* Results Header Info */}
      <div className={`${presetFilter === 'all' ? 'hidden sm:flex' : 'flex'} items-center justify-between px-1 text-xs text-slate-400`}>
        <div className="flex items-center gap-2">
          {presetFilter !== 'all' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 border border-slate-700 text-slate-300">
              {t('screener.main.filterLabel', { name: t(presetFilter === 'active' ? 'screener.main.filterActive' : presetFilter === 'top_gainers' ? 'screener.main.filterGainers' : presetFilter === 'top_losers' ? 'screener.main.filterLosers' : presetFilter === 'near_highs' ? 'screener.main.filterHighs' : 'screener.main.filterLows') })}
            </span>
          )}
        </div>
        {lastUpdated && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="hidden sm:inline">
              {t('screener.main.updated', { time: new Date(lastUpdated).toLocaleTimeString(timeLocale) })}
            </span>
            {hasPartialMarketData && (
              <MarketDataFreshnessIcon label={t('screener.main.staleData')} kind="partial" />
            )}
          </div>
        )}
      </div>

      {/* Only a complete fetch failure gets a red retry banner.
          Partial exchange snapshots remain usable, with a small freshness
          indicator beside the timestamp instead of a technical warning. */}
      {error && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error === 'screener.main.quoteFailed' ? t(error) : error}{errorShowsCachedData && <> {' '}{t('screener.main.staleData')}</>}</span>
          </div>
          <button
            onClick={() => fetchCoins()}
            className="px-3 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-900 font-semibold transition-colors"
          >
            {t('screener.main.retry')}
          </button>
        </div>
      )}

      {/* Guest Mode Informational Banner */}
      {isGuest && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-cyan-500/30 shadow-lg shadow-cyan-950/20 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-xs sm:text-sm">{t('screener.main.guestTitle')}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40">
                  {t('screener.main.guestReadOnly')}
                </span>
              </div>
              <p className="text-slate-300 text-[11px] sm:text-xs leading-relaxed">
                {t('screener.main.guestIntro')}{' '}<strong>{t('screener.main.guestCharts')}</strong>{t('screener.main.guestBetweenChartsAndAlerts')}{' '}<strong>{t('screener.main.guestAlerts')}</strong>{' '}{t('screener.main.guestBetweenAlertsAndLink')}{' '}<strong>{t('screener.main.guestLink')}</strong>{t('screener.main.guestEnd')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
            <button
              onClick={() => onOpenAuthModal?.('signin', 'general')}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors cursor-pointer text-xs"
            >
              {t('screener.main.signIn')}
            </button>
            <button
              onClick={() => onOpenAuthModal?.('signup', 'general')}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-bold transition-all shadow-sm shadow-cyan-500/20 cursor-pointer text-xs"
            >
              {t('screener.main.register')}
            </button>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && coins.length === 0 ? (
        <div data-screener-guide="results" className="space-y-2">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-xl bg-slate-900/40 border border-slate-800/60 animate-pulse flex items-center justify-between px-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-800" />
                <div className="w-20 h-4 bg-slate-800 rounded" />
              </div>
              <div className="w-24 h-4 bg-slate-800 rounded" />
              <div className="w-16 h-4 bg-slate-800 rounded" />
              <div className="w-32 h-4 bg-slate-800 rounded hidden md:block" />
              <div className="w-20 h-4 bg-slate-800 rounded" />
            </div>
          ))}
        </div>
      ) : filteredCoins.length === 0 ? (
        <div data-screener-guide="results" className="py-20 text-center rounded-3xl border border-slate-800/80 bg-slate-900/40 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
            <Search className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">{t('screener.main.noResultsTitle')}</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {t('screener.main.noResultsIntro')}{' '}{t(volumeMode === 'from' ? 'screener.main.noResultsFrom' : 'screener.main.noResultsTo')}
            </p>
          </div>
          <button
            onClick={() => {
              setPresetFilter('all');
              setSearchQuery('');
              setExchange('all');
              setMarketType('all');
              setMaxVolumeUsd(0);
              setVolumeMode('to');
            }}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
          >
            {t('screener.main.resetFilters')}
          </button>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div data-screener-guide="results" className="screener-data-scroll overflow-x-auto touch-scroll rounded-2xl border border-slate-800/80 bg-slate-900/50 backdrop-blur-sm shadow-xl">
          <table className="w-full min-w-[760px] text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-950/60 text-slate-400 select-none">
                <th
                  onClick={() => handleHeaderSort('volume')}
                  className="py-3 px-3.5 font-semibold cursor-pointer hover:text-white transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>{t('coin')}</span>
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('price')}
                  className="py-3 px-3.5 font-semibold text-right cursor-pointer hover:text-white transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{t('price')} ($)</span>
                    {sortBy === 'price' && (sortOrder === 'desc' ? <ChevronDown className="w-3 h-3 text-cyan-400" /> : <ChevronUp className="w-3 h-3 text-cyan-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('priceChange')}
                  className="py-3 px-3.5 font-semibold text-right cursor-pointer hover:text-white transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{t('change24h')} (%)</span>
                    {sortBy === 'priceChange' && (sortOrder === 'desc' ? <ChevronDown className="w-3 h-3 text-cyan-400" /> : <ChevronUp className="w-3 h-3 text-cyan-400" />)}
                  </div>
                </th>
                <th className="py-3 px-3.5 font-semibold text-center whitespace-nowrap">
                  {t('screener.main.range24h')}
                </th>
                <th
                  onClick={() => handleHeaderSort('volume')}
                  className="py-3 px-3.5 font-semibold text-right cursor-pointer hover:text-white transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{t('volume')}</span>
                    {sortBy === 'volume' && (sortOrder === 'desc' ? <ChevronDown className="w-3 h-3 text-cyan-400" /> : <ChevronUp className="w-3 h-3 text-cyan-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort('volatility')}
                  className="py-3 px-3.5 font-semibold text-right cursor-pointer hover:text-white transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>{t('volatility')}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 font-bold tracking-wider">
                      5m
                    </span>
                    {sortBy === 'volatility' && (sortOrder === 'desc' ? <ChevronDown className="w-3 h-3 text-cyan-400" /> : <ChevronUp className="w-3 h-3 text-cyan-400" />)}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 font-mono">
              {filteredCoins.slice(0, displayLimit).map((coin, index) => {
                const isWatchlisted = isCoinInWatchlist(watchlist, coin);
                const isPositive = coin.change24h >= 0;
                const vol5m = getCoinVol5m(coin);
                const onSurveillance = !isGuest && isCoinOnSurveillance(coin.symbol, coin.exchange);
                const monitoringActive = onSurveillance && isCoinMonitored(coin.symbol, coin.exchange);

                // Calculate where price is positioned between 24h low and high (0 to 100%)
                const rangeDiff = coin.high24h - coin.low24h;
                const pricePosition =
                  rangeDiff > 0
                    ? Math.min(100, Math.max(0, ((coin.price - coin.low24h) / rangeDiff) * 100))
                    : 50;

                return (
                  <tr
                    key={`${coin.exchange}-${coin.symbol}-${coin.marketType}-${index}`}
                    onClick={() => handleCoinClick(coin)}
                    title={
                      isGuest
                        ? t('screener.main.guestRowTitle')
                        : t('screener.main.openDetail')
                    }
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors group"
                  >
                    {/* Symbol & Exchange */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isGuest) {
                              onOpenAuthModal?.('signin', 'general');
                              return;
                            }
                            onToggleWatchlist(coin);
                          }}
                          className={`p-1 rounded transition-colors ${
                            isWatchlisted
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-slate-600 hover:text-slate-400'
                          }`}
                          title={t(isGuest ? 'screener.main.guestFavorite' : isWatchlisted ? 'screener.main.favoriteRemove' : 'screener.main.favoriteAdd')}
                        >
                          <Bookmark className={`w-3.5 h-3.5 ${isWatchlisted ? 'fill-amber-400' : ''}`} />
                        </button>

                        <div className="min-w-max flex-1">
                          <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
                            <span data-no-translate className="font-bold text-white group-hover:text-cyan-400 transition-colors text-sm">
                              {coin.baseAsset}
                            </span>
                            <span className="text-[10px] text-slate-500">/USDT</span>
                            <ScreenerCopySymbolButton symbol={coin.symbol} />

                            {isGuest && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] bg-slate-800/80 text-slate-400 font-sans border border-slate-700/60"
                                title={t('screener.main.chartRegister')}
                              >
                                <Lock className="w-2.5 h-2.5 text-slate-400" />
                                <span className="hidden lg:inline text-[8.5px]">{t('screener.main.chartShort')}</span>
                              </span>
                            )}

                            {/* Badges for Hot / High / Low */}
                            {coin.isActiveCoin && (
                              <span
                                className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/15 border border-amber-500/30 text-amber-300 font-sans font-bold flex shrink-0 items-center gap-0.5"
                                title={t('screener.main.highActivity')}
                              >
                                <Flame className="w-2.5 h-2.5 fill-current" />
                              </span>
                            )}
                            {coin.isNearHigh && (
                              <MarketExtremeIcon direction="high" label={t('nearHighsLocation')} />
                            )}
                            {coin.isNearLow && (
                              <MarketExtremeIcon direction="low" label={t('nearLowsLocation')} />
                            )}
                          </div>

                          <div className="flex items-center gap-1 mt-0.5">
                            <span
                              data-exchange={coin.exchange}
                               className={`site-exchange-badge site-exchange-badge--compact text-[8px] px-1 py-0 rounded font-sans font-bold uppercase ${
                                coin.exchange === 'binance'
                                  ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                                  : 'bg-orange-950/80 text-orange-400 border border-orange-800/60'
                              }`}
                            >
                              {coin.exchange}
                            </span>
                            <span className="text-[8px] px-1 py-0 rounded bg-slate-800 text-slate-400 font-sans uppercase">
                              {t(coin.marketType === 'futures' ? 'futures' : 'spot')}
                            </span>
                          </div>
                        </div>

                        <div data-screener-table-actions className="flex items-center gap-1 ml-1 shrink-0">
                          {onSendMetaScalp && (
                            <button
                              onClick={(e) => handleSendMetaScalpClick(e, coin)}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg relative bg-transparent text-amber-400 transition-colors hover:bg-transparent hover:text-amber-300"
                              title={isGuest ? t('screener.main.linkGuest') : t('screener.main.linkOpenGroup', { group: metaScalpBinding })}
                            >
                              <Zap className="h-[15px] w-[15px]" strokeWidth={2.7} />
                              {isGuest && (
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-slate-700 text-amber-400 flex items-center justify-center">
                                  <Lock className="w-1.5 h-1.5" />
                                </span>
                              )}
                            </button>
                          )}

                          <button
                            onClick={(e) => handleAlertClick(e, coin)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg relative bg-transparent text-sky-400 transition-colors hover:bg-transparent hover:text-sky-300"
                            title={t(isGuest ? 'screener.main.telegramGuest' : 'screener.main.telegramSet')}
                          >
                            <Send className="h-[15px] w-[15px]" strokeWidth={2.7} />
                            {isGuest && (
                              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-slate-700 text-sky-400 flex items-center justify-center">
                                <Lock className="w-1.5 h-1.5" />
                              </span>
                            )}
                          </button>

                          <button
                            onClick={(e) => handleSurveillanceToggle(e, coin)}
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg relative bg-transparent hover:bg-transparent transition-colors cursor-pointer ${onSurveillance ? 'border border-violet-400/50' : ''}`}
                            title={
                              isGuest
                                ? t('screener.main.surveillanceGuest')
                                : onSurveillance
                                ? t('screener.main.surveillanceCurrent', { status: t(monitoringActive ? 'screener.main.surveillanceActive' : 'screener.main.surveillancePaused') })
                                : t('screener.main.surveillanceAdd')
                            }
                          >
                            <MonitoringMenuIcon className={`h-[15px] w-[15px] ${monitoringActive ? 'animate-pulse' : ''}`} active={monitoringActive} vibrant strokeWidth={2.7} />
                            {isGuest && (
                              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-slate-700 text-violet-400 flex items-center justify-center">
                                <Lock className="w-1.5 h-1.5" />
                              </span>
                            )}
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Price */}
                    <td className="py-3 px-3.5 text-right font-bold text-white whitespace-nowrap">
                      ${formatCryptoPrice(coin.price)}
                    </td>

                    {/* 24h Change */}
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-bold ${
                          isPositive
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {formatPercent(coin.change24h)}
                      </span>
                    </td>

                    {/* 24h Range Bar */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <div className="w-36 mx-auto space-y-1">
                        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                          <span>${formatCryptoPrice(coin.low24h)}</span>
                          <span>${formatCryptoPrice(coin.high24h)}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden relative">
                          <div
                            className={`h-full rounded-full transition-all ${
                              getCoinDistanceToHigh(coin) <= 2.5
                                ? 'bg-gradient-to-r from-emerald-500 to-purple-500'
                                : getCoinDistanceToLow(coin) <= 2.5
                                ? 'bg-gradient-to-r from-rose-500 to-blue-500'
                                : 'bg-gradient-to-r from-cyan-500 to-indigo-500'
                            }`}
                            style={{ width: `${pricePosition}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* 24h Volume */}
                    <td className="py-3 px-3.5 text-right font-bold text-slate-200 whitespace-nowrap">
                      {formatVolume(coin.volumeUsd)}
                    </td>

                    {/* Volatility (5m timeframe) */}
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      {(() => {
                        const vol = coin.volatility5mPct !== undefined ? coin.volatility5mPct : (coin.volatility24hPct * 0.12);
                        return (
                          <div className="flex items-center justify-end gap-1.5">
                            <span
                              className={`text-xs font-mono ${
                                vol >= 1.5
                                  ? 'text-amber-400 font-bold'
                                  : vol >= 0.6
                                  ? 'text-emerald-400 font-medium'
                                  : 'text-slate-400'
                              }`}
                            >
                              {vol.toFixed(2)}%
                            </span>
                            <span className="text-[9px] text-slate-500 font-sans"></span>
                          </div>
                        );
                      })()}
                    </td>


                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* CARDS / GRID VIEW */
        <div data-screener-guide="results" className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 min-[2200px]:grid-cols-7 min-[3000px]:grid-cols-8 gap-3 sm:gap-4">
          {filteredCoins.slice(0, displayLimit).map((coin, index) => {
            const isWatchlisted = isCoinInWatchlist(watchlist, coin);
            const isPositive = coin.change24h >= 0;
            const vol5m = getCoinVol5m(coin);
                const onSurveillance = !isGuest && isCoinOnSurveillance(coin.symbol, coin.exchange);
                const monitoringActive = onSurveillance && isCoinMonitored(coin.symbol, coin.exchange);
            const distHigh = getCoinDistanceToHigh(coin);
            const distLow = getCoinDistanceToLow(coin);
            const rangeDiff = coin.high24h - coin.low24h;
            const pricePosition =
              rangeDiff > 0
                ? Math.min(100, Math.max(0, ((coin.price - coin.low24h) / rangeDiff) * 100))
                : 50;

            const cardKey = [coin.exchange, coin.marketType, coin.symbol].join('|');
            const isChartOpen = activeCardChart?.key === cardKey;

            return (
              <div
                data-screener-coin-card
                key={cardKey}
                onClick={() => { if (!isChartOpen) handleCoinClick(coin); }}
                title={
                  isGuest
                    ? 'Гостьовий режим: перегляд монети (для відкриття графіку потрібна реєстрація)'
                    : 'Клікніть, щоб відкрити графік та детальний аналіз'
                }
                className={`rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 backdrop-blur-sm transition-all hover:shadow-lg hover:shadow-cyan-950/20 flex flex-col justify-between group min-w-0 ${isChartOpen ? 'p-2 overflow-hidden cursor-default' : 'p-4 space-y-3 cursor-pointer'}`}
                style={isChartOpen && activeCardChart ? { height: activeCardChart.height } : undefined}
              >
                {isChartOpen ? (
                  <React.Suspense fallback={<div role="status" className="flex h-full items-center justify-center text-xs text-slate-400">{t('screener.main.cardChartLoading')}</div>}>
                    <LazyScreenerCardChart
                      key={cardKey}
                      coin={coin}
                      onClose={() => setActiveCardChart(null)}
                      onOpenDetails={() => handleCoinClick(coin)}
                    />
                  </React.Suspense>
                ) : (
                  <>
                {/* Card Top: Symbol, exchange, bookmark */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span data-no-translate className="font-bold text-white group-hover:text-cyan-400 transition-colors text-base font-mono">
                        {coin.baseAsset}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">/USDT</span>
                      <ScreenerCopySymbolButton symbol={coin.symbol} />
                      {isGuest && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8.5px] bg-slate-800/80 text-slate-400 font-sans border border-slate-700/60"
                          title={t('screener.main.chartRegister')}
                        >
                          <Lock className="w-2.5 h-2.5 text-slate-400" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        data-exchange={coin.exchange}
                         className={`site-exchange-badge site-exchange-badge--compact text-[9px] px-1.5 py-0.2 rounded font-sans font-bold uppercase ${
                          coin.exchange === 'binance'
                            ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                            : 'bg-orange-950/80 text-orange-400 border border-orange-800/60'
                        }`}
                      >
                        {coin.exchange}
                      </span>
                      <span className="text-[10px] leading-none px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-sans uppercase">
                        {t(coin.marketType === 'futures' ? 'futures' : 'spot')}
                      </span>
                      {coin.isActiveCoin && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/15 border border-amber-500/30 text-amber-300 font-sans font-bold flex items-center gap-0.5">
                          <Flame className="w-2.5 h-2.5 fill-current" />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isGuest) {
                          onOpenAuthModal?.('signin', 'general');
                          return;
                        }
                        onToggleWatchlist(coin);
                      }}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isWatchlisted
                          ? 'text-amber-400 bg-amber-500/10'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                      }`}
                      title={t(isGuest ? 'screener.main.guestFavorite' : isWatchlisted ? 'screener.main.favoriteRemove' : 'screener.main.favoriteAdd')}
                    >
                      <Bookmark className={`w-4 h-4 ${isWatchlisted ? 'fill-amber-400' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Price and 24h Change */}
                <div className="flex items-baseline justify-between gap-2 pt-1 border-t border-slate-800/60 font-mono">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-sans">{t('screener.main.price')}</div>
                    <div className="text-lg font-bold text-white">
                      ${formatCryptoPrice(coin.price)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 uppercase font-sans">{t('screener.main.change24h')}</div>
                    <span
                      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-bold ${
                        isPositive
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {formatPercent(coin.change24h)}
                    </span>
                  </div>
                </div>

                {/* 24h Range Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>{t('screener.main.low')} ${formatCryptoPrice(coin.low24h)}</span>
                    <span>{t('screener.main.high')} ${formatCryptoPrice(coin.high24h)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden relative">
                    <div
                      className={`h-full rounded-full transition-all ${
                        getCoinDistanceToHigh(coin) <= 2.5
                          ? 'bg-gradient-to-r from-emerald-500 to-purple-500'
                          : getCoinDistanceToLow(coin) <= 2.5
                          ? 'bg-gradient-to-r from-rose-500 to-blue-500'
                          : 'bg-gradient-to-r from-cyan-500 to-indigo-500'
                      }`}
                      style={{ width: `${pricePosition}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-sans">
                    <span className={getCoinDistanceToLow(coin) <= 2.5 ? 'text-blue-400 font-bold' : 'text-slate-500'}>
                      {t('screener.main.fromLow', { percent: coin.distanceToLowPct.toFixed(1) })}
                    </span>
                    <span className={getCoinDistanceToHigh(coin) <= 2.5 ? 'text-purple-400 font-bold' : 'text-slate-500'}>
                      {t('screener.main.fromHigh', { percent: coin.distanceToHighPct.toFixed(1) })}
                    </span>
                  </div>
                </div>

                {/* Card Footer: chart toggle at bottom-left, without an extra row */}
                <div className="pt-2 border-t border-slate-800/60 flex min-w-0 items-center justify-between gap-1 text-xs">
                  <button
                    type="button"
                    data-screener-open-card-chart
                    onClick={(event) => openCardChart(event, coin)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 transition-colors hover:bg-cyan-500/20"
                    aria-label={t(isGuest ? 'screener.main.chartRegister' : 'screener.main.cardChartOpen')}
                    title={t(isGuest ? 'screener.main.chartRegister' : 'screener.main.cardChartOpen')}
                  >
                    <BarChart2 className="h-5 w-5" />
                  </button>
                  <div>
                    <span className="text-[10px] text-slate-400 block">{t('screener.main.turnover24h')}</span>
                    <span className="font-bold font-mono text-slate-300">
                      {formatVolume(coin.volumeUsd)}
                    </span>
                  </div>

                  <div className="text-center">
                    <span className="text-[10px] text-slate-400 block">{t('screener.main.volatility5m')}</span>
                    {(() => {
                      const vol = coin.volatility5mPct !== undefined ? coin.volatility5mPct : (coin.volatility24hPct * 0.12);
                      return (
                        <span className={`font-bold font-mono text-xs ${
                          vol >= 1.5 ? 'text-amber-400' : vol >= 0.6 ? 'text-emerald-400' : 'text-slate-400'
                        }`}>
                          {vol.toFixed(2)}%
                        </span>
                      );
                    })()}
                  </div>

                  <div data-screener-card-actions className="flex items-center gap-1">
                    {onSendMetaScalp && (
                      <button
                        onClick={(e) => handleSendMetaScalpClick(e, coin)}
                        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border relative bg-transparent text-amber-400 transition-colors hover:bg-transparent hover:text-amber-300 ${isGuest ? 'border-slate-700/60' : 'border-amber-400/45'}`}
                        title={isGuest ? t('screener.main.linkGuest') : t('screener.main.linkOpen')}
                      >
                        <Zap className="h-[15px] w-[15px]" strokeWidth={2.7} />
                        {isGuest && (
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-slate-700 text-amber-400 flex items-center justify-center">
                            <Lock className="w-1.5 h-1.5" />
                          </span>
                        )}
                      </button>
                    )}
                    <button
                      onClick={(e) => handleAlertClick(e, coin)}
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border relative bg-transparent text-sky-400 transition-colors hover:bg-transparent hover:text-sky-300 ${isGuest ? 'border-slate-700/60' : 'border-sky-400/45'}`}
                      title={t(isGuest ? 'screener.main.telegramGuest' : 'screener.main.telegramAlerts')}
                    >
                      <Send className="h-[15px] w-[15px]" strokeWidth={2.7} />
                      {isGuest && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-slate-700 text-sky-400 flex items-center justify-center">
                          <Lock className="w-1.5 h-1.5" />
                        </span>
                      )}
                    </button>
                    <button
                      onClick={(e) => handleSurveillanceToggle(e, coin)}
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border relative bg-transparent hover:bg-transparent transition-colors cursor-pointer ${isGuest ? 'border-slate-700/60' : onSurveillance ? 'border-violet-400/60' : 'border-violet-400/35'}`}
                      title={
                        isGuest
                          ? t('screener.main.surveillanceGuest')
                          : onSurveillance
                          ? t('screener.main.surveillanceCurrent', { status: t(monitoringActive ? 'screener.main.surveillanceActive' : 'screener.main.surveillancePaused') })
                          : t('screener.main.surveillanceAdd')
                      }
                    >
                      <MonitoringMenuIcon className={`h-[15px] w-[15px] ${monitoringActive ? 'animate-pulse' : ''}`} active={monitoringActive} vibrant strokeWidth={2.7} />
                      {isGuest && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-slate-700 text-violet-400 flex items-center justify-center">
                          <Lock className="w-1.5 h-1.5" />
                        </span>
                      )}
                    </button>
                  </div>
                </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination / "Load more" button */}
      {filteredCoins.length > displayLimit && (
        <div className="text-center pt-2">
          <button
            onClick={() => setDisplayLimit((prev) => prev + 50)}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-300 border border-slate-700 transition-all shadow-md cursor-pointer"
          >
            {t('ui.coins.showMore', { remaining: filteredCoins.length - displayLimit })}
          </button>
        </div>
      )}
    </div>
  );
};
