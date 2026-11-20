import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { InstallAppButton } from './components/InstallAppButton';
import { Header } from './components/Header';
import { SiteFooter } from './components/SiteFooter';
import { ScreenerIcon, FormationsIcon, TerminalIcon } from './components/PageIcons';
import { initialActivePage, shouldRunStandardScan, shouldRunEarlyScan, foregroundScanKind } from './utils/foregroundScanPolicy';
import { ScreenerFilters } from './components/ScreenerFilters';
import { FormationCard } from './components/FormationCard';
import { EarlyFormationsResults } from './components/EarlyFormationsResults';
import { earlyFormationChartMarkers, type EarlyFormationCandidate } from './utils/earlyFormations';
import { createEarlyModeFilters, findCurrentEarlyFormation, getVisibleEarlyFormations, type EarlyStageFilter } from './utils/earlyFormationList';
import { ScreenerTable } from './components/ScreenerTable';
import { CoinScreenerPage } from './components/CoinScreenerPage';
import { MarketDataFreshnessIcon } from './components/MarketDataFreshnessIcon';
import { TerminalPage } from './components/TerminalPage';
import { TerminalRenderBoundary } from './components/terminal/TerminalRenderBoundary';
import { SurveillancePage } from './components/SurveillancePage';
import { ReplayPage } from './components/ReplayPage';
import { FormationDetailsModal } from './components/FormationDetailsModal';
import { SavedFormationChartPage } from './components/SavedFormationChartPage';
import { apiFetch } from './utils/apiFetch';
import { FullscreenChartModal } from './components/FullscreenChartModal';
import { FormationGuideModal } from './components/FormationGuideModal';
import { WatchlistDrawer } from './components/WatchlistDrawer';
import { MetaScalpToast, MetaScalpToastState } from './components/MetaScalpToast';
import { TelegramAlertsModal } from './components/TelegramAlertsModal';
import { AuthModal, AuthPromptReason } from './components/AuthModal';
import { UserProfileModal } from './components/UserProfileModal';
import { ArchiveModal } from './components/ArchiveModal';
import { AlertToast, AlertToastState } from './components/AlertToast';
import { useAlerts } from './context/AlertsContext';
import { useOptionalSiteNotifications } from './context/SiteNotificationsContext';
import { DEFAULT_SITE_NOTIFICATIONS, notificationEnabled } from './utils/siteNotifications';
import { useAuth } from './context/AuthContext';
import { useArchive } from './context/ArchiveContext';
import { useSurveillance } from './context/SurveillanceContext';
import { useLanguage } from './context/LanguageContext';
import { interpolate, translatePhrase } from './locales';
import {
  type MetaScalpSettings,
  playMetaScalpClickSound,
  getUserMetaScalpSettings,
} from './utils/metaScalpService';
import { getUserTerminalLinkSettings, sendToSelectedTerminal, terminalLabel, notificationTerminalSource, isFreshTerminalNotification, type TerminalLinkSource } from './utils/terminalLinkService';
import { desktopRemoteLinkEnabled } from './utils/desktopRemoteLink';
import type { SiteNotificationItem } from './utils/siteNotifications';
import { notificationChartTarget } from './utils/notificationChartLink';
import { ScannedCoin, DetectedFormation, ScreenerFilterState, PriceAlert, ArchivedFormation, ActivePageType, type FullEarlyScanSnapshot } from './types';
import { runDirectClientScan, getFallbackScannedCoins, hydrateMissingRegularOIFromBrowser } from './utils/directExchangeClient';
import { getVisibleFormations, groupVisibleFormations, getMatchingUnformedCoins } from './utils/formationList';
import { getTpSlRule, normalizeTpSlSettings, projectUserCoins, resolveEarlyTpSl, resolveFormationTpSl } from './utils/tpSlConstructor';
import { countActiveRegularIndicatorFilters, DEFAULT_REGULAR_INDICATOR_FILTERS, type RegularIndicatorFilters } from './utils/regularFormationIndicators';
import {
  getCoinWatchlistKey,
  isCoinInWatchlist,
  resolveWatchlistEntries,
  toggleCoinWatchlist,
  removeCoinFromWatchlistFolders,
  watchlistEntryToChartCoin,
  type ResolvedWatchlistEntry,
  type CoinIdentifier,
} from './utils/watchlistUtils';
import {
  AlertCircle,
  RefreshCw,
  Sparkles,
  Lock,
  Key,
  Send,
  ShieldAlert,
  Zap,
  ExternalLink,
  ShieldCheck,
  Sliders,
  CheckCircle2,
  ArrowUpToLine,
  ArrowDownToLine,
  Bookmark,
} from 'lucide-react';
import { AUTHOR_TELEGRAM_CHANNEL_URL, AUTHOR_TELEGRAM_USERNAME } from './utils/authorLinks';
import { applyChangedDefaultsToMarketFilters, getStoredPreferences, useAppPreferences } from './utils/userPreferences';
import { loadMarketCoins } from './utils/marketCoinLoader';
import { marketQuoteToChartCoin } from './utils/chartPageCoin';
import { captureChartPageBackdrop } from './utils/chartPageBackdrop';
import {
  chartPageHash, readChartPageHash, sameChartPageRoute,
  saveChartPageSnapshot, readChartPageSnapshot, saveChartReturnHash, readChartReturnHash,
  safeReturnHash, chartPageVisualOrigin, chartPageVisualContext, type ChartPageRoute, type ChartPageSnapshot,
} from './utils/chartPageRoute';

const DEFAULT_FILTERS: ScreenerFilterState = {
  exchange: 'binance',
  marketType: 'futures',
  timeframe: '15m',
  category: 'all',
  bias: 'all',
  status: 'all',
  minVolumeUsd: 0,
  densityConfirmedOnly: false,
  roundNumberOnly: false,
  searchQuery: '',
  sortBy: 'confidence',
  sortOrder: 'desc',
};

const ignoreSiteNotification = (..._args: unknown[]): void => {};

// Desktop page panels use the exact same route/components and authorization as the site.
// This query changes presentation only; it does not expose local Desktop capabilities.
const desktopPanel = typeof window !== 'undefined'
  ? (() => {
      const name = new URLSearchParams(window.location.search).get('desktopPanel');
      return ['screener', 'formations', 'early', 'terminal', 'surveillance', 'replay'].includes(name || '') ? name : null;
    })()
  : null;

const PcLandingPage = React.lazy(() => import('./components/PcLandingPage'));

export default function App() {
  // Routed charts are real SPA pages: the Screener is unmounted, not covered.
  const [chartRoute, setChartRoute] = useState<ChartPageRoute | null>(() =>
    typeof window === 'undefined' ? null : readChartPageHash(window.location.hash));
  const chartPageActive = chartRoute !== null;
  const [activePage, setActivePage] = useState<ActivePageType>(() =>
    typeof window === 'undefined' ? 'screener' : initialActivePage(window.location.hash));
  const [chartRouteLoading, setChartRouteLoading] = useState(false);
  const [chartRouteError, setChartRouteError] = useState<string | null>(null);
  const chartNavigation = useRef({ enteredFromApp: false, scrollY: 0 });
  // An inert, in-memory visual copy only. The original Screener/Formation
  // components still unmount; no background React effects or market streams.
  const chartBackdropSnapshotRef = useRef<HTMLDivElement | null>(null);
  const chartPageWasActiveRef = useRef(chartPageActive);
  chartPageWasActiveRef.current = chartPageActive;
  const attachChartBackdrop = useCallback((container: HTMLDivElement | null) => {
    if (container && chartBackdropSnapshotRef.current) {
      container.replaceChildren(chartBackdropSnapshotRef.current);
    }
  }, []);
  const scanAbortRef = useRef<AbortController | null>(null);
  const { preferences } = useAppPreferences();
  // Identity must be known before synchronizing per-account page defaults.
  const { user, profile, loading: authLoading, updateProfileData } = useAuth();
  const { t, language } = useLanguage();
  const tr = (source: string) => translatePhrase(language, source);
  const [coins, setCoins] = useState<ScannedCoin[]>(() => getFallbackScannedCoins());
  const scanRequestRef = useRef(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [filters, setFilters] = useState<ScreenerFilterState>(() => {
    const prefs = getStoredPreferences();
    return {
      ...DEFAULT_FILTERS,
      exchange: prefs.defaultExchange,
      marketType: prefs.defaultMarketType,
      timeframe: prefs.defaultTimeframe,
    };
  });
  // Keep ordinary screener preferences and the early W/M controls independent.
  // First early activation inherits the active market, timeframe and search,
  // but hidden regular-only filters do not suppress early candidates.
  // These independent technical filters affect only ordinary formations.
  const [regularIndicatorFilters, setRegularIndicatorFilters] = useState<RegularIndicatorFilters>({
    ...DEFAULT_REGULAR_INDICATOR_FILTERS,
  });
  const [earlyFilters, setEarlyFilters] = useState<ScreenerFilterState>(() => createEarlyModeFilters(filters));
  const [earlyStage, setEarlyStage] = useState<EarlyStageFilter>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Profile changes should update only filters that still use the previous
  // account defaults; explicit on-page market/timeframe overrides survive.
  // Regular Formations and early W/M stay independent of each other.
  const lastProfileDefaults = useRef({
    uid: user?.uid ?? null,
    defaultExchange: preferences.defaultExchange,
    defaultMarketType: preferences.defaultMarketType,
    defaultTimeframe: preferences.defaultTimeframe,
  });
  useEffect(() => {
    const previous = lastProfileDefaults.current;
    const next = {
      uid: user?.uid ?? null,
      defaultExchange: preferences.defaultExchange,
      defaultMarketType: preferences.defaultMarketType,
      defaultTimeframe: preferences.defaultTimeframe,
    };
    if (previous.uid === next.uid &&
        previous.defaultExchange === next.defaultExchange &&
        previous.defaultMarketType === next.defaultMarketType &&
        previous.defaultTimeframe === next.defaultTimeframe) return;
    lastProfileDefaults.current = next;
    if (previous.uid !== next.uid) {
      // Changing accounts clears another owner's manually chosen filter state.
      // Retain the user's own presets in PostgreSQL; these are only in-memory
      // Screener/Formation controls, not persisted chart drawings or workspaces.
      const fresh = { ...DEFAULT_FILTERS,
        exchange: next.defaultExchange,
        marketType: next.defaultMarketType,
        timeframe: next.defaultTimeframe,
      };
      setFilters(fresh);
      setEarlyFilters(createEarlyModeFilters(fresh));
      setRegularIndicatorFilters({ ...DEFAULT_REGULAR_INDICATOR_FILTERS });
      setEarlyStage('all');
      return;
    }
    setFilters(current => applyChangedDefaultsToMarketFilters(current, previous, next));
    setEarlyFilters(current => applyChangedDefaultsToMarketFilters(current, previous, next));
  }, [user?.uid, preferences.defaultExchange, preferences.defaultMarketType, preferences.defaultTimeframe]);

  // Auth & Profile
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('resetPassword'));
  const [authPromptReason, setAuthPromptReason] = useState<AuthPromptReason>(null);
  const [authInitialMode, setAuthInitialMode] = useState<'signin' | 'signup'>('signin');
  // Desktop's early pane is already known from its URL; initialize it as
  // early before effects fire, avoiding one unnecessary regular scan.
  const [earlyMode, setEarlyMode] = useState(desktopPanel === 'early');
  useEffect(() => {
    try {
      setEarlyMode(desktopPanel === 'early' ? true : desktopPanel === 'formations' ? false
        : localStorage.getItem('h00k-early-formations:' + (user?.uid || 'guest')) === '1');
    } catch { setEarlyMode(false); }
  }, [user?.uid]);
  const changeEarlyMode = (enabled: boolean) => {
    setEarlyMode(enabled);
    try { localStorage.setItem('h00k-early-formations:' + (user?.uid || 'guest'), enabled ? '1' : '0'); } catch {}
  };

  const [fullEarlyScan, setFullEarlyScan] = useState<FullEarlyScanSnapshot | null>(null);
  const [earlyRefreshNonce, setEarlyRefreshNonce] = useState(0);
  const refreshFullEarlyScan = useCallback(() => setEarlyRefreshNonce(value => value + 1), []);
  const stopEarlyScanRef = useRef<(() => Promise<void>) | null>(null);
  const stopFullEarlyScan = useCallback(() => {
    void stopEarlyScanRef.current?.();
  }, []);

  // Run only on demand while early detection is enabled. The server shares a
  // bounded full-market job among clients and reports incremental progress;
  // browser fallback also checks every exchange ticker, in throttled batches.
  useEffect(() => {
    if (!earlyMode) {
      setFullEarlyScan(null);
      return;
    }
    // This expensive full-market search is exclusive to the early Formations
    // view. Remembered early-mode settings must not auto-scan Terminal/Replay.
    // The independent 24/7 surveillance and Telegram workers stay untouched.
    if (!shouldRunEarlyScan(activePage, earlyMode, chartPageActive)) return;
    let alive = true;
    const controller = new AbortController();
    let stopRequested = false;
    let browserFallbackActive = false;
    let activeServerId: string | null = null;
    let stopRequest: Promise<void> | null = null;
    const initial: FullEarlyScanSnapshot = {
      id: '', status: 'loading', total: 0, processed: 0, checked: 0,
      skipped: 0, failed: 0, startedAt: Date.now(), updatedAt: Date.now(),
      missingSources: [], data: [],
    };
    setFullEarlyScan(initial);

    const stopServer = (id: string): Promise<void> => {
      if (stopRequest) return stopRequest;
      stopRequest = (async () => {
        try {
          const response = await fetch('/api/screener/early/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          });
          if (!response.ok) throw new Error('Не вдалося зупинити серверний пошук');
          const result = await response.json();
          if (!result.success || !result.scan) throw new Error('Не отримано підтвердження зупинки');
          if (alive) setFullEarlyScan(result.scan as FullEarlyScanSnapshot);
        } catch {
          stopRequested = false;
          stopRequest = null;
          if (alive) setFullEarlyScan(previous => ({
            ...(previous ?? initial),
            status: 'running',
            message: 'Не вдалося надіслати команду зупинки. Спробуйте ще раз.',
          }));
        }
      })();
      return stopRequest;
    };

    const stopScan = async () => {
      if (!alive || stopRequested) return;
      stopRequested = true;
      if (browserFallbackActive) {
        controller.abort();
        setFullEarlyScan(previous => ({
          ...(previous ?? initial), status: 'stopped', finishedAt: Date.now(),
          updatedAt: Date.now(),
          message: 'Пошук зупинено. Уже знайдені формації збережено.',
        }));
        return;
      }
      setFullEarlyScan(previous => ({
        ...(previous ?? initial), status: 'stopping',
        message: 'Зупиняємо пошук після поточного пакета…',
      }));
      if (activeServerId) await stopServer(activeServerId);
    };
    stopEarlyScanRef.current = stopScan;

    const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    const currentParams = {
      exchange: earlyFilters.exchange,
      marketType: earlyFilters.marketType,
      timeframe: earlyFilters.timeframe,
      minVolumeUsd: earlyFilters.minVolumeUsd,
    };

    const browserFallback = async () => {
      browserFallbackActive = true;
      const startedAt = Date.now();
      const data = await runDirectClientScan(currentParams, {
        completeEarly: true,
        signal: controller.signal,
        onProgress: progress => {
          if (!alive || stopRequested) return;
          const checked = Math.max(0, progress.processed - progress.failed - progress.skipped);
          setFullEarlyScan({
            id: 'browser', status: 'running',
            ...progress, checked, startedAt, updatedAt: Date.now(),
          });
        },
      });
      if (!alive || stopRequested) return;
      setFullEarlyScan(previous => ({
        ...(previous ?? initial),
        status: previous?.failed || previous?.missingSources.length ? 'partial' : 'completed',
        data, finishedAt: Date.now(), updatedAt: Date.now(),
      }));
    };

    const start = async () => {
      let shouldFallback = false;
      let startedServerJob = false;
      try {
        let response: Response | null = null;
        while (alive && !controller.signal.aborted && !stopRequested) {
          response = await fetch('/api/screener/early/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...currentParams, force: earlyRefreshNonce > 0 }),
            signal: controller.signal,
          });
          if (response.status !== 429) break;
          if (alive) setFullEarlyScan(previous => ({
            ...(previous ?? initial), message: 'Інше повне сканування триває. Очікування вільного слота…',
          }));
          await sleep(5000);
        }
        if (!alive || controller.signal.aborted) return;
        if (stopRequested && (!response || response.status === 429)) {
          setFullEarlyScan(previous => ({
            ...(previous ?? initial), status: 'stopped', finishedAt: Date.now(),
            message: 'Пошук зупинено до початку перевірки свічок.',
          }));
          return;
        }
        if (!response || !response.ok) throw new Error('Сервер повного сканування недоступний');
        const startJson = await response.json();
        if (!startJson.success || !startJson.scan?.id) throw new Error('Сервер не повернув ID сканування');
        startedServerJob = true;
        let snapshot = startJson.scan as FullEarlyScanSnapshot;
        activeServerId = snapshot.id;
        if (stopRequested) {
          await stopServer(snapshot.id);
        } else {
          setFullEarlyScan(snapshot);
        }
        while (alive && ['loading', 'running', 'stopping'].includes(snapshot.status)) {
          await sleep(1500);
          if (!alive || controller.signal.aborted) return;
          const statusResponse = await fetch(
            '/api/screener/early/status?id=' + encodeURIComponent(snapshot.id),
            { signal: controller.signal },
          );
          if (!statusResponse.ok) throw new Error('Втрачено зв’язок із сервером сканування');
          const update = await statusResponse.json();
          if (!update.success || !update.scan) throw new Error('Пошук не повернув прогрес');
          snapshot = update.scan as FullEarlyScanSnapshot;
          if (alive) setFullEarlyScan(snapshot);
        }
        if (!stopRequested && snapshot.status === 'failed' && snapshot.processed === 0) shouldFallback = true;
      } catch (error) {
        if (!alive || controller.signal.aborted) return;
        if (stopRequested) {
          setFullEarlyScan(previous => ({
            ...(previous ?? initial), status: 'stopped', finishedAt: Date.now(),
            message: 'Зупинено. Якщо сервер уже отримав запит, він може завершити поточну операцію.',
          }));
          return;
        }
        if (startedServerJob) {
          // A transient polling error must never launch a second multi-thousand-
          // request browser scan while the server job may still be running.
          setFullEarlyScan(previous => ({
            ...(previous ?? initial), status: 'partial', finishedAt: Date.now(),
            message: 'Зв’язок із поточним серверним скануванням втрачено. Оновіть пошук, щоб відновити перевірку.',
          }));
          return;
        }
        shouldFallback = true;
      }
      if (shouldFallback && alive && !stopRequested && !controller.signal.aborted) {
        try {
          setFullEarlyScan({ ...initial, message: 'Сервер недоступний. Повна перевірка через браузер…' });
          await browserFallback();
        } catch (error) {
          if (alive && !controller.signal.aborted) {
            setFullEarlyScan(previous => ({
              ...(previous ?? initial), status: 'failed', finishedAt: Date.now(),
              message: error instanceof Error ? error.message : 'Повний пошук недоступний.',
            }));
          }
        }
      }
    };
    void start();
    return () => {
      alive = false;
      controller.abort();
      if (stopEarlyScanRef.current === stopScan) stopEarlyScanRef.current = null;
    };
  }, [earlyMode, activePage, chartPageActive, earlyFilters.exchange, earlyFilters.marketType, earlyFilters.timeframe,
    earlyFilters.minVolumeUsd, earlyRefreshNonce]);

  // Refresh a completed scan at a lower cadence; never restart or reset a
  // still-running exhaustive sweep, which can span many exchange API batches.
  useEffect(() => {
    if (!shouldRunEarlyScan(activePage, earlyMode, chartPageActive) || !fullEarlyScan
      || !['completed', 'partial', 'failed'].includes(fullEarlyScan.status)) return;
    const timer = setTimeout(refreshFullEarlyScan, 5 * 60_000);
    return () => clearTimeout(timer);
  }, [chartPageActive, activePage, earlyMode, fullEarlyScan?.status, fullEarlyScan?.finishedAt, refreshFullEarlyScan]);

  const handleOpenAuthModal = useCallback((mode: 'signin' | 'signup' = 'signin', reason: AuthPromptReason = null) => {
    setAuthInitialMode(mode);
    setAuthPromptReason(reason);
    setIsAuthModalOpen(true);
  }, []);

  // The page selection is initialized above the scan effects to avoid an
  // unwanted Screener request from an initially open Terminal/Replay window.

  // Enforce access control and hash sync
  useEffect(() => {
    if (authLoading) return;
    const handleHashChange = () => {
      const hash = window.location.hash;
      // The chart is its own route; do not reset the user's previous section.
      if (readChartPageHash(hash)) return;
      // The Desktop landing remains public; Replay requires a signed-in user.
      if (hash === '#pc') {
        setActivePage((prev) => (prev === 'pc' ? prev : 'pc'));
        return;
      }
      if (!user) {
        setActivePage((prev) => (prev === 'screener' ? prev : 'screener'));
        if (hash && hash !== '#screener' && hash !== '') {
          handleOpenAuthModal('signin', 'general');
          window.location.hash = 'screener';
        }
        return;
      }
      if (hash === '#patterns') {
        setActivePage((prev) => (prev === 'patterns' ? prev : 'patterns'));
      } else if (hash === '#terminal') {
        setActivePage((prev) => (prev === 'terminal' ? prev : 'terminal'));
      } else if (hash === '#surveillance') {
        setActivePage((prev) => (prev === 'surveillance' ? prev : 'surveillance'));
      } else if (hash === '#replay') {
        setActivePage((prev) => (prev === 'replay' ? prev : 'replay'));
      } else {
        // default / root / #screener
        setActivePage((prev) => (prev === 'screener' ? prev : 'screener'));
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [user?.uid, authLoading, handleOpenAuthModal]);

  const handlePageChange = (page: ActivePageType) => {
    if (!user && page !== 'screener' && page !== 'pc') {
      handleOpenAuthModal('signin', 'general');
      return;
    }
    setActivePage(page);
    if (typeof window !== 'undefined') {
      window.location.hash = page;
    }
  };

  const { activeCount: surveillanceActiveCount } = useSurveillance();

  // Watchlist stored per user (isolated)
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const watchlistRef = useRef<readonly string[]>([]);
  watchlistRef.current = watchlist;
  const [watchlistFolders, setWatchlistFolders] = useState<Record<string, string[]>>({});
  const watchlistCount = useMemo(() => resolveWatchlistEntries(watchlist, coins).length, [watchlist, coins]);

  // Synchronize watchlist with current logged-in user profile & user-scoped storage (strictly isolated, guests see 0)
  useEffect(() => {
    if (!user) {
      setWatchlist((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    if (profile?.watchlist && Array.isArray(profile.watchlist)) {
      setWatchlist((prev) => {
        const next = Array.from(new Set(profile.watchlist));
        if (prev.length === next.length && prev.every((item, i) => item === next[i])) {
          return prev;
        }
        try {
          localStorage.setItem(`crypto_screener_watchlist_${user.uid}`, JSON.stringify(next));
        } catch {}
        return next;
      });
      return;
    }

    try {
      const userKey = `crypto_screener_watchlist_${user.uid}`;
      const saved = localStorage.getItem(userKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setWatchlist((prev) => {
            const next = Array.from(new Set(parsed));
            if (prev.length === next.length && prev.every((item, i) => item === next[i])) {
              return prev;
            }
            return next;
          });
          return;
        }
      }
    } catch {}

    setWatchlist((prev) => (prev.length === 0 ? prev : []));
  }, [user?.uid, profile?.watchlist]);

  useEffect(() => {
    if (!user) {
      setWatchlistFolders((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    const folders = profile?.watchlistFolders;
    if (folders && typeof folders === 'object') {
      setWatchlistFolders((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(folders)) {
          return prev;
        }
        return folders;
      });
      return;
    }

    try {
      const saved = localStorage.getItem(`crypto_screener_watchlist_folders_${user.uid}`);
      const parsed = saved ? JSON.parse(saved) : {};
      setWatchlistFolders((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(parsed)) {
          return prev;
        }
        return parsed;
      });
    } catch {
      setWatchlistFolders((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    }
  }, [user?.uid, profile?.watchlistFolders]);

  const [selectedPair, setSelectedPair] = useState<{
    coin: ScannedCoin;
    formation?: DetectedFormation;
  } | null>(null);

  const [isWatchlistOpen, setIsWatchlistOpen] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // MetaScalp terminal settings state (isolated per user)
  const [metaScalpToast, setMetaScalpToast] = useState<MetaScalpToastState | null>(null);
  const metaScalpUserIdRef = useRef(user?.uid);
  const [metaScalpSettingsState, setMetaScalpSettingsState] = useState<{
    userId: string | undefined;
    settings: MetaScalpSettings;
  }>(() => ({ userId: user?.uid, settings: getUserMetaScalpSettings(user?.uid, profile) }));
  const metaScalpSettings = metaScalpSettingsState.userId === user?.uid
    ? metaScalpSettingsState.settings
    : getUserMetaScalpSettings(user?.uid, profile);
  const terminalLinkSettings = getUserTerminalLinkSettings(user?.uid, profile);
  const activeTerminalGroup = terminalLinkSettings.provider === 'tiger'
    ? terminalLinkSettings.tigerGroup
    : terminalLinkSettings.provider === 'metascalp' ? metaScalpSettings.binding : '—';
  const lastTerminalCommand = useRef<{ key: string; at: number }>({ key: '', at: 0 });

  useEffect(() => {
    const next = getUserMetaScalpSettings(user?.uid, profile);
    setMetaScalpSettingsState((prev) => {
      if (
        prev.userId === user?.uid &&
        prev.settings.enabled === next.enabled &&
        prev.settings.port === next.port &&
        prev.settings.binding === next.binding &&
        prev.settings.autoSwitchOnClick === next.autoSwitchOnClick &&
        prev.settings.soundFeedback === next.soundFeedback
      ) return prev;
      return { userId: user?.uid, settings: next };
    });
  }, [user?.uid, profile?.uid, profile?.metaScalpSettings]);

  useLayoutEffect(() => {
    metaScalpUserIdRef.current = user?.uid;
    setMetaScalpToast(null);
  }, [user?.uid]);


  // Telegram price alerts state
  const { activeAlertsCount } = useAlerts();
  const notificationCenter = useOptionalSiteNotifications();
  const emitSiteNotification = notificationCenter?.emit ?? ignoreSiteNotification;
  const processScan = notificationCenter?.processScan ?? ignoreSiteNotification;
  const setFavoriteIds = notificationCenter?.setFavoriteIds ?? ignoreSiteNotification;
  const notificationSettings = notificationCenter?.settings ?? DEFAULT_SITE_NOTIFICATIONS;
  useEffect(() => { setFavoriteIds(watchlist); }, [watchlist, setFavoriteIds]);
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState<boolean>(false);
  const [telegramPrefill, setTelegramPrefill] = useState<any>(null);
  const [alertToast, setAlertToast] = useState<AlertToastState | null>(null);

  // Formations Archive state
  const { archivedFormations } = useArchive();
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState<boolean>(false);
  const [selectedArchivedItem, setSelectedArchivedItem] = useState<ArchivedFormation | null>(null);

  // Authentication & Profile modals
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [profileInitialSection, setProfileInitialSection] = useState<'account' | 'chart' | 'notifications' | 'linking'>('account');

  // Auto-dismiss Alert toast
  useEffect(() => {
    if (alertToast) {
      const timer = setTimeout(() => {
        setAlertToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [alertToast]);

  // Listen for background alert triggered events from AlertsContext CRON
  useEffect(() => {
    const handleTriggered = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent?.detail && notificationEnabled(notificationSettings, 'price')) {
        setAlertToast({
          id: Date.now(),
          symbol: customEvent.detail.symbol,
          targetPrice: customEvent.detail.targetPrice,
          condition: customEvent.detail.condition,
          message: customEvent.detail.message || 'Цільову ціну досягнуто!',
        });
      }
    };

    window.addEventListener('signalhook:alert-triggered', handleTriggered);
    return () => window.removeEventListener('signalhook:alert-triggered', handleTriggered);
  }, [notificationSettings]);

  const handleOpenTelegramAlerts = useCallback((prefill?: any) => {
    if (!user) {
      handleOpenAuthModal('signin', 'alerts');
      return;
    }
    setTelegramPrefill(prefill || null);
    setIsTelegramModalOpen(true);
  }, [user, handleOpenAuthModal]);

  const handleAlertToast = useCallback(
    (toast: { symbol: string; targetPrice: number; condition: 'gte' | 'lte'; message?: string }) => {
      if (!notificationEnabled(notificationSettings, 'price')) return;
      setAlertToast({
        id: Date.now(),
        symbol: toast.symbol,
        targetPrice: toast.targetPrice,
        condition: toast.condition,
        message: toast.message,
      });
    },
    [notificationSettings]
  );

  // Hide an already-visible price toast as soon as notifications are disabled.
  useEffect(() => {
    if (!notificationEnabled(notificationSettings, 'price')) {
      setAlertToast(null);
    }
  }, [notificationSettings.optedIn, notificationSettings.enabled, notificationSettings.price]);

  // Auto-dismiss MetaScalp toast
  useEffect(() => {
    if (metaScalpToast) {
      const timer = setTimeout(() => {
        setMetaScalpToast(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [metaScalpToast]);

  // Routes all existing external-terminal buttons through the user-selected adapter.
  const handleSendToMetaScalp = useCallback(
    async (coin: ScannedCoin, source: TerminalLinkSource = 'screener', isBackground = false) => {
      if (!user) { handleOpenAuthModal('signin', 'linking'); return; }
      if (terminalLinkSettings.provider === 'none' || !terminalLinkSettings.enabled) {
        setProfileInitialSection('linking');
        setIsProfileModalOpen(true);
        return;
      }
      const now = Date.now();
      const key = [user.uid, terminalLinkSettings.provider, source, coin.exchange, coin.marketType, coin.symbol].join(':');
      if (terminalLinkSettings.cooldownMs > 0
        && lastTerminalCommand.current.key === key
        && now - lastTerminalCommand.current.at < terminalLinkSettings.cooldownMs) return;
      lastTerminalCommand.current = { key, at: now };
      const quality = coin.bestFormation?.confidence ?? coin.formations?.[0]?.confidence;
      let res;
      try {
        res = await sendToSelectedTerminal(
          coin.symbol, coin.exchange, coin.marketType, source,
          terminalLinkSettings, metaScalpSettings, quality, !isBackground
        );
      } catch {
        // Allow immediate retry and report a failure instead of leaving an unhandled rejection.
        if (lastTerminalCommand.current.key === key) lastTerminalCommand.current = { key: '', at: 0 };
        if (metaScalpUserIdRef.current === user.uid) setMetaScalpToast({
          id: Date.now(), type: 'error', title: terminalLabel(terminalLinkSettings.provider),
          ticker: coin.symbol, binding: '',
          message: 'Не вдалося надіслати тикер. Перевірте з’єднання з локальним терміналом.',
        });
        return;
      }
      if (!res.success && lastTerminalCommand.current.key === key)
        lastTerminalCommand.current = { key: '', at: 0 };
      if (metaScalpUserIdRef.current !== user.uid) return;
      // The VPS returns 202 when a command has been accepted for delivery.
      // It does not yet confirm the MetaScalp UI has actually changed.
      const pendingDesktop = res.terminal === 'metascalp' && desktopRemoteLinkEnabled(user.uid);
      if (res.success && !pendingDesktop && metaScalpSettings.soundFeedback) playMetaScalpClickSound();
      setMetaScalpToast({
        id: Date.now(), type: res.success && !pendingDesktop ? 'success' : 'warning',
        title: res.success && pendingDesktop
          ? 'h00k Desktop: команду прийнято'
          : res.success ? `${terminalLabel(res.terminal)}: синхронізовано` : terminalLabel(res.terminal),
        ticker: res.ticker, binding: res.group,
        message: res.copiedToClipboard ? `${res.message} (Тікер скопійовано)` : res.message,
      });
    },
    [user, metaScalpSettings, terminalLinkSettings, handleOpenAuthModal]
  );

  const canLinkNotification = useCallback((item: SiteNotificationItem): boolean => {
    const source = notificationTerminalSource(item.kind);
    return Boolean(user && terminalLinkSettings.enabled && terminalLinkSettings.provider !== 'none'
      && source && terminalLinkSettings.sources[source]
      && typeof item.symbol === 'string' && /^[A-Z0-9:_-]{2,40}$/i.test(item.symbol)
      && (item.exchange === 'binance' || item.exchange === 'bybit')
      && (item.marketType === 'futures' || item.marketType === 'spot'));
  }, [user, terminalLinkSettings]);

  const handleLinkNotification = useCallback((item: SiteNotificationItem, isBackground = false) => {
    if (!canLinkNotification(item)) return;
    const source = notificationTerminalSource(item.kind);
    if (!source || !item.symbol || (item.exchange !== 'binance' && item.exchange !== 'bybit')
      || (item.marketType !== 'spot' && item.marketType !== 'futures')) return;
    const exchange = item.exchange;
    const marketType = item.marketType;
    const symbol = item.symbol.toUpperCase();
    const found = coins.find(coin => coin.symbol === symbol && coin.exchange === exchange && coin.marketType === marketType);
    const minimalCoin: ScannedCoin = found || {
      symbol, baseAsset: symbol.replace(/USDT$/, ''), quoteAsset: 'USDT',
      exchange, marketType, timeframe: '5m',
      currentPrice: 0, priceChange24h: 0, highPrice24h: 0, lowPrice24h: 0,
      volume24hUsd: 0, formations: [], lastUpdated: Date.now(), exchangeUrl: '',
    };
    void handleSendToMetaScalp(minimalCoin, source, isBackground);
  }, [canLinkNotification, coins, handleSendToMetaScalp]);

  // Only newly emitted notifications qualify for optional auto-linking.
  // Existing history, cross-account events, and stale notifications are never replayed.
  const autoLinkCursor = useRef<{ uid: string | null; id: string | null; enabled: boolean; since: number }>({
    uid: user?.uid ?? null, id: notificationCenter?.items?.[0]?.id ?? null,
    enabled: terminalLinkSettings.autoSignals, since: Date.now(),
  });
  useEffect(() => {
    const uid = user?.uid ?? null;
    const item = notificationCenter?.items?.[0];
    const cursor = autoLinkCursor.current;
    if (cursor.uid !== uid || cursor.enabled !== terminalLinkSettings.autoSignals) {
      // New user or newly granted consent: the currently visible history is the baseline.
      autoLinkCursor.current = {
        uid, id: item?.id ?? null, enabled: terminalLinkSettings.autoSignals, since: Date.now(),
      };
      return;
    }
    const isNew = !!item?.id && cursor.id !== item.id;
    cursor.id = item?.id ?? null;
    if (!isNew || !item || !terminalLinkSettings.autoSignals ||
      terminalLinkSettings.provider === 'vataga' ||
      !notificationCenter?.settings.enabled || !notificationCenter.settings.optedIn ||
      item.read || !isFreshTerminalNotification(item.timestamp, cursor.since, Date.now())
      || !canLinkNotification(item)) return;
    handleLinkNotification(item, true);
  }, [user?.uid, notificationCenter?.items, notificationCenter?.settings.enabled,
    notificationCenter?.settings.optedIn, terminalLinkSettings.autoSignals,
    canLinkNotification, handleLinkNotification]);

  // Enter a dedicated chart URL without losing the originating Screener tab.
  // A small per-user session snapshot restores the exact formation/archive
  // when reloading the chart, without launching a second full-market scan.
  const openChartPage = useCallback((
    route: ChartPageRoute,
    snapshot: ChartPageSnapshot,
    replaceCurrent = false,
  ) => {
    const uid = user?.uid;
    if (!uid) return;
    const currentHash = window.location.hash;
    if (!readChartPageHash(currentHash)) {
      chartBackdropSnapshotRef.current = captureChartPageBackdrop(
        document.querySelector<HTMLElement>('#root > div'),
      );
      chartNavigation.current = { enteredFromApp: true, scrollY: window.scrollY };
      try {
        saveChartReturnHash(window.sessionStorage, uid, safeReturnHash(currentHash));
      } catch { /* Storage access may be blocked by the browser. */ }
    }
    try {
      saveChartPageSnapshot(window.sessionStorage, uid, route, snapshot);
    } catch { /* A restricted iOS storage session still opens the chart. */ }
    setChartRoute(route);
    setChartRouteError(null);
    setChartRouteLoading(false);
    const nextHash = chartPageHash(route);
    if (replaceCurrent) window.history.replaceState(null, '', nextHash);
    else if (currentHash !== nextHash) window.location.hash = nextHash;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [user?.uid]);

  // Notification coin links always use the dedicated full-screen HookChart page.
  // Exact exchange/market metadata is retained; copying the symbol never calls this.
  const openNotificationCoinChart = useCallback((item: SiteNotificationItem) => {
    if (!user) {
      handleOpenAuthModal('signin', 'general');
      return;
    }
    const target = notificationChartTarget(item, coins, preferences);
    if (!target) return;
    setSelectedEarly(null);
    setSelectedArchivedItem(null);
    setSelectedPair({ coin: target.snapshot.coin });
    openChartPage(target.route, target.snapshot);
  }, [user, coins, preferences, handleOpenAuthModal, openChartPage]);

  // Handler when selecting pair for details modal
  const handleSelectPair = useCallback(
    (coin: ScannedCoin, formation?: DetectedFormation) => {
      if (!user) {
        handleOpenAuthModal('signin', 'chart');
        return;
      }
      // Store RAW source levels. Applying a user profile projection to an already
      // projected card would multiply ATR offsets when the profile changes.
      const rawCoin = coins.find(row =>
        row.symbol === coin.symbol && row.exchange === coin.exchange &&
        row.marketType === coin.marketType && row.timeframe === coin.timeframe);
      const chosen = formation || coin.formations[0];
      const rawFormation = rawCoin?.formations.find(item => item.id === chosen?.id) ?? chosen;
      setSelectedArchivedItem(null);
      const selected = { coin: rawCoin ?? coin, formation: rawFormation };
      setSelectedPair(selected);
      openChartPage({
        exchange: selected.coin.exchange, marketType: selected.coin.marketType,
        symbol: selected.coin.symbol.toUpperCase(), timeframe: selected.coin.timeframe || preferences.defaultTimeframe,
        kind: 'coin', formationId: rawFormation?.id,
        origin: activePage === 'patterns' ? 'formations' : 'screener',
      }, selected);
      if (terminalLinkSettings.enabled && terminalLinkSettings.switchOnChartOpen
        && (activePage !== 'patterns' || !earlyMode || terminalLinkSettings.sources.early)) {
        handleSendToMetaScalp(coin, activePage === 'patterns' ? (earlyMode ? 'early' : 'formations') : 'screener');
      }
    },
    [user, coins, terminalLinkSettings, activePage, earlyMode, handleSendToMetaScalp, handleOpenAuthModal, openChartPage, preferences.defaultTimeframe]
  );

  const [selectedEarly, setSelectedEarly] = useState<{ coin: ScannedCoin; candidate: EarlyFormationCandidate } | null>(null);
  // A favorite's exchange/market identity is independent of the active scan.
  const handleOpenWatchlistChart = useCallback((entry: ResolvedWatchlistEntry) => {
    if (!user) {
      handleOpenAuthModal('signin', 'chart');
      return;
    }
    const selectedCoin = watchlistEntryToChartCoin(entry, preferences.defaultTimeframe);
    setSelectedPair({ coin: selectedCoin });
    setSelectedEarly(null);
    setSelectedArchivedItem(null);
    setIsWatchlistOpen(false);
    openChartPage({
      exchange: selectedCoin.exchange,
      marketType: selectedCoin.marketType,
      symbol: selectedCoin.symbol.toUpperCase(),
      timeframe: selectedCoin.timeframe,
      kind: 'coin',
    }, { coin: selectedCoin });
    if (terminalLinkSettings.enabled && terminalLinkSettings.switchOnChartOpen && terminalLinkSettings.sources.favorites) {
      void handleSendToMetaScalp(selectedCoin, 'favorites');
    }
  }, [user, handleOpenAuthModal, preferences.defaultTimeframe, openChartPage, terminalLinkSettings, handleSendToMetaScalp]);

  // A's chart and projected trade levels must never remain open for user B
  // after switching accounts on the same browser.
  const detailAccountRef = useRef(user?.uid ?? null);
  useEffect(() => {
    const uid = user?.uid ?? null;
    if (detailAccountRef.current === uid) return;
    detailAccountRef.current = uid;
    // A frozen preview also belongs to the previous account; never keep it
    // visible or in memory after sign-out or account switching.
    chartBackdropSnapshotRef.current?.remove();
    chartBackdropSnapshotRef.current = null;
    setSelectedEarly(null);
    setSelectedPair(null);
    setSelectedArchivedItem(null);
  }, [user?.uid]);
  // A projected setup is valid only while the latest scan still contains its exact
  // instrument, timeframe and structure. Recalculate its levels on each refresh;
  // close the old preview immediately when the setup disappears or invalidates.
  useEffect(() => {
    // The historical early candidate is pinned to the open chart page; an
    // unrelated Screener refresh must not close the user's active chart.
    if (!selectedEarly || chartPageActive) return;
    const current = findCurrentEarlyFormation(selectedEarly, earlyMode ? (fullEarlyScan?.data ?? []) : coins);
    if (!current) {
      setSelectedEarly(null);
    } else if (current.coin !== selectedEarly.coin || current.candidate !== selectedEarly.candidate) {
      setSelectedEarly(current);
    }
  }, [coins, chartPageActive, earlyMode, fullEarlyScan?.data, selectedEarly]);

  const handleOpenEarly = useCallback((coin: ScannedCoin, candidate: EarlyFormationCandidate) => {
    if (!user) { handleOpenAuthModal('signin', 'chart'); return; }
    // Cards show a PERSONAL projection, but details must start from the RAW
    // shared scan candidate; otherwise the ATR offset is applied twice.
    const raw = findCurrentEarlyFormation({ coin, candidate }, fullEarlyScan?.data ?? []);
    if (!raw) return; // Stale candidate: do not reopen an invalidated scenario.
    setSelectedPair(null);
    setSelectedEarly(raw);
    openChartPage({
      exchange: raw.coin.exchange, marketType: raw.coin.marketType,
      symbol: raw.coin.symbol.toUpperCase(), timeframe: raw.coin.timeframe,
      kind: 'early', formationId: raw.candidate.id,
    }, { coin: raw.coin, earlyCandidate: raw.candidate });
    if (terminalLinkSettings.enabled && terminalLinkSettings.switchOnChartOpen && terminalLinkSettings.sources.early) {
      void handleSendToMetaScalp(raw.coin, 'early');
    }
  }, [user, handleOpenAuthModal, fullEarlyScan?.data, openChartPage, terminalLinkSettings, handleSendToMetaScalp]);

  // Handler when selecting archived formation to restore
  const handleSelectArchivedFormation = useCallback(
    (archived: ArchivedFormation) => {
      const foundCoin = coins.find(
        (c) => c.symbol === archived.symbol && c.exchange === archived.exchange && c.marketType === archived.marketType
      );
      const matchingCoin: ScannedCoin = foundCoin || {
        symbol: archived.symbol,
        baseAsset: archived.baseAsset,
        quoteAsset: archived.quoteAsset,
        exchange: archived.exchange,
        marketType: archived.marketType,
        currentPrice: archived.savedPrice,
        priceChange24h: 0,
        volume24hUsd: 0,
        highPrice24h: archived.savedPrice,
        lowPrice24h: archived.savedPrice,
        high24h: archived.savedPrice,
        low24h: archived.savedPrice,
        timeframe: archived.timeframe,
        formations: [archived.formation],
        hasFormations: true,
        bestFormation: archived.formation,
        exchangeUrl:
          archived.exchange === 'binance'
            ? `https://www.binance.com/uk-UA/trade/${archived.baseAsset}_${archived.quoteAsset}`
            : `https://www.bybit.com/trade/usdt/${archived.baseAsset}USDT`,
        lastUpdated: archived.savedAtTimestamp,
      };

      setSelectedArchivedItem(archived);
      setSelectedPair({
        coin: matchingCoin,
        formation: archived.formation,
      });
      openChartPage({
        exchange: matchingCoin.exchange, marketType: matchingCoin.marketType,
        symbol: matchingCoin.symbol.toUpperCase(), timeframe: archived.timeframe,
        kind: 'archive', formationId: archived.formation.id, archiveId: archived.id,
        origin: activePage === 'screener' ? 'screener' : 'formations',
      }, { coin: matchingCoin, formation: archived.formation, archived });
      setIsArchiveModalOpen(false);
      if (terminalLinkSettings.enabled && terminalLinkSettings.switchOnChartOpen) {
        handleSendToMetaScalp(matchingCoin, 'formations');
      }
    },
    [coins, activePage, terminalLinkSettings, handleSendToMetaScalp, openChartPage]
  );

  // Browser Back/Forward switches between real Screener and chart pages.
  // The old Screener DOM is unmounted while chartPageActive is true.
  useEffect(() => {
    const syncChartLocation = () => {
      const next = readChartPageHash(window.location.hash);
      // Back/Forward can enter a chart without using openChartPage(). Capture
      // the page before React unmounts it; never re-capture a live chart.
      if (next && !chartPageWasActiveRef.current && !chartBackdropSnapshotRef.current) {
        chartBackdropSnapshotRef.current = captureChartPageBackdrop(
          document.querySelector<HTMLElement>('#root > div'),
        );
      }
      setChartRoute(previous => sameChartPageRoute(previous, next) ? previous : next);
      if (!next) {
        chartBackdropSnapshotRef.current = null;
        setSelectedPair(null);
        setSelectedEarly(null);
        setSelectedArchivedItem(null);
        setChartRouteError(null);
        setChartRouteLoading(false);
        if (chartNavigation.current.enteredFromApp) {
          const savedScroll = chartNavigation.current.scrollY;
          chartNavigation.current.enteredFromApp = false;
          // The list remounts and resumes its refresh. Avoid losing the user's
          // former scroll position when the browser returns from a chart.
          requestAnimationFrame(() => window.scrollTo({ top: savedScroll, behavior: 'auto' }));
        }
      }
    };
    window.addEventListener('hashchange', syncChartLocation);
    window.addEventListener('popstate', syncChartLocation);
    return () => {
      window.removeEventListener('hashchange', syncChartLocation);
      window.removeEventListener('popstate', syncChartLocation);
    };
  }, []);

  const chartRouteKey = chartRoute ? chartPageHash(chartRoute) : null;
  // Archive hydration must never reopen an ordinary chart or interrupt its live feed.
  const routeArchives = chartRoute?.kind === 'archive' && !chartRoute.archiveId ? archivedFormations : null;
  // Restore from the exact account-scoped selection first. When a user opens
  // a copied chart URL in a new browser, resolve just the instrument quotes;
  // do NOT run the entire formation screener to display the chart.
  useEffect(() => {
    if (!chartRoute || !user || authLoading) return;
    const route = chartRoute;
    let stored: ChartPageSnapshot | null = null;
    try { stored = readChartPageSnapshot(window.sessionStorage, user.uid, route); } catch {}
    if (route.kind === 'archive' && !stored) {
      const archived = routeArchives?.find(item => item.formation.id === route.formationId &&
        item.symbol.toUpperCase() === route.symbol && item.exchange === route.exchange &&
        item.marketType === route.marketType);
      // A copied link with a record ID works even if the compact list has not
      // loaded on this device yet. Do not substitute a sibling record.
      const recordId = route.archiveId || archived?.id;
      if (recordId) {
        // Archive lists contain only a compact summary. A copied chart URL must
        // retrieve the owner-scoped complete drawings/coordinates before render.
        const controller = new AbortController();
        setChartRouteLoading(true);
        setChartRouteError(null);
        void (async () => {
          try {
            const response = await apiFetch('/api/account/archive/' + encodeURIComponent(recordId),
              { signal: controller.signal });
            if (!response.ok) throw new Error('Archive detail unavailable');
            const payload = await response.json();
            const full = payload.item as ArchivedFormation | undefined;
            if (!full || full.id !== recordId || full.userId !== user.uid ||
                full.symbol.toUpperCase() !== route.symbol || full.exchange !== route.exchange ||
                full.marketType !== route.marketType ||
                (route.formationId && full.formation.id !== route.formationId)) throw new Error('Invalid archive');
            if (controller.signal.aborted) return;
            const currentCoin = coins.find(item => item.symbol === route.symbol &&
              item.exchange === route.exchange && item.marketType === route.marketType);
            const fallback: ScannedCoin = currentCoin ?? {
              symbol: full.symbol, baseAsset: full.baseAsset, quoteAsset: full.quoteAsset,
              exchange: full.exchange, marketType: full.marketType,
              timeframe: route.timeframe, currentPrice: full.savedPrice,
              priceChange24h: 0, volume24hUsd: 0, highPrice24h: full.savedPrice,
              lowPrice24h: full.savedPrice, lastUpdated: full.savedAtTimestamp,
              formations: [full.formation], exchangeUrl: '',
            };
            setSelectedPair({ coin: fallback, formation: full.formation });
            setSelectedArchivedItem(full);
            setSelectedEarly(null);
            setChartRouteLoading(false);
          } catch {
            if (controller.signal.aborted) return;
            setChartRouteError('Не вдалося відновити збережену формацію з профілю.');
            setChartRouteLoading(false);
          }
        })();
        return () => controller.abort();
      }
    }
    if (stored) {
      if (route.kind === 'early' && stored.earlyCandidate) {
        setSelectedEarly({ coin: stored.coin, candidate: stored.earlyCandidate });
        setSelectedPair(null);
        setSelectedArchivedItem(null);
      } else {
        setSelectedPair({ coin: stored.coin, formation: stored.formation ?? undefined });
        setSelectedArchivedItem(stored.archived ?? null);
        setSelectedEarly(null);
      }
      setChartRouteError(null);
      setChartRouteLoading(false);
      return;
    }
    const controller = new AbortController();
    setChartRouteLoading(true);
    setChartRouteError(null);
    void (async () => {
      let quoteCoin: ScannedCoin | null = null;
      try {
        const snapshot = await loadMarketCoins({
          exchange: route.exchange, marketType: route.marketType,
        }, controller.signal);
        const quote = snapshot.coins.find(row => row.symbol.toUpperCase() === route.symbol
          && row.exchange === route.exchange && row.marketType === route.marketType);
        if (quote) quoteCoin = marketQuoteToChartCoin(quote, route.timeframe);
      } catch { /* Offline fallback still opens the chart and uses /api/klines. */ }
      if (controller.signal.aborted) return;
      if (!quoteCoin) {
        const baseAsset = route.symbol.replace(/(USDT|USDC|BUSD|BTC|ETH)$/,'');
        const quoteAsset = route.symbol.slice(baseAsset.length) || 'USDT';
        quoteCoin = {
          symbol: route.symbol, baseAsset, quoteAsset, exchange: route.exchange,
          marketType: route.marketType, timeframe: route.timeframe,
          currentPrice: 0, priceChange24h: 0, volume24hUsd: 0,
          highPrice24h: 0, lowPrice24h: 0,
          formations: [], lastUpdated: Date.now(), exchangeUrl: '',
        };
      }
      // A cross-device link cannot contain a private archived/early snapshot.
      // Fall back to its functional live chart rather than showing stale data.
      setSelectedPair({ coin: quoteCoin });
      setSelectedEarly(null);
      setSelectedArchivedItem(null);
      if (route.formationId || route.kind !== 'coin') {
        setChartRouteError('Дані вибраної формації недоступні в цій вкладці. Показано живий графік монети без непідтверджених рівнів.');
      }
      setChartRouteLoading(false);
    })();
    return () => controller.abort();
  }, [chartRouteKey, user?.uid, authLoading, routeArchives]);

  const closeChartPage = useCallback(() => {
    chartBackdropSnapshotRef.current = null;
    setSelectedPair(null);
    setSelectedArchivedItem(null);
    setSelectedEarly(null);
    setChartRoute(null);
    setChartRouteError(null);
    setChartRouteLoading(false);
    if (chartNavigation.current.enteredFromApp) {
      window.history.back();
    } else {
      let saved = '#screener';
      try { saved = readChartReturnHash(window.sessionStorage, user?.uid || 'guest'); } catch {}
      window.history.replaceState(null, '', saved);
      setActivePage(saved.slice(1) as ActivePageType);
    }
  }, [user?.uid]);

  const selectFavoriteOnChartPage = useCallback((favorite: ScannedCoin) => {
    if (!chartRoute) return;
    const quotePrice = Number.isFinite(favorite.currentPrice) ? favorite.currentPrice : 0;
    const chosen: ScannedCoin = {
      symbol: favorite.symbol, baseAsset: favorite.baseAsset, quoteAsset: favorite.quoteAsset,
      exchange: favorite.exchange, marketType: favorite.marketType,
      timeframe: chartRoute.timeframe, currentPrice: quotePrice,
      priceChange24h: favorite.priceChange24h || 0,
      volume24hUsd: favorite.volume24hUsd || 0,
      highPrice24h: favorite.highPrice24h ?? favorite.high24h ?? quotePrice,
      lowPrice24h: favorite.lowPrice24h ?? favorite.low24h ?? quotePrice,
      lastUpdated: favorite.lastUpdated || Date.now(), formations: [],
      exchangeUrl: favorite.exchangeUrl || '',
    };
    setSelectedEarly(null);
    setSelectedArchivedItem(null);
    setSelectedPair({ coin: chosen });
    openChartPage({
      exchange: chosen.exchange, marketType: chosen.marketType,
      symbol: chosen.symbol.toUpperCase(), timeframe: chosen.timeframe, kind: 'coin',
      origin: chartRoute.origin,
    }, { coin: chosen }, true);
  }, [chartRoute, openChartPage]);

  const changeStandaloneChartTimeframe = useCallback((timeframe: ScannedCoin['timeframe']) => {
    if (!chartRoute || !selectedPair) return;
    const coin = { ...selectedPair.coin, timeframe };
    setSelectedPair({ ...selectedPair, coin });
    openChartPage({
      exchange: coin.exchange, marketType: coin.marketType,
      symbol: coin.symbol.toUpperCase(), timeframe, kind: 'coin',
      origin: chartRoute.origin,
    }, { coin }, true);
  }, [chartRoute, selectedPair, openChartPage]);

  const constructorSettings = useMemo(() =>
    profile?.uid === user?.uid && profile?.tpSlConstructorSettings
      ? normalizeTpSlSettings(profile.tpSlConstructorSettings) : undefined,
    [profile?.uid, profile?.tpSlConstructorSettings, user?.uid]);
  const constructorSettingsRef = useRef(constructorSettings);
  useLayoutEffect(() => { constructorSettingsRef.current = constructorSettings; }, [constructorSettings]);

  // Reuse existing scan results. Individual notification rules enforce consent,
  // verified market evidence, per-category thresholds and deduplication.
  const reportStrongFormations = useCallback((scanned: ScannedCoin[]) => {
    processScan(projectUserCoins(scanned, constructorSettingsRef.current), watchlistRef.current);
  }, [processScan]);

  // The independent early W/M scan never changes ordinary formation logic.
  useEffect(() => {
    if (earlyMode && Array.isArray(fullEarlyScan?.data) && fullEarlyScan.data.length) {
      processScan(fullEarlyScan.data, watchlistRef.current);
    }
  }, [earlyMode, fullEarlyScan?.id, fullEarlyScan?.data, processScan]);

  // A technical failure is an opt-in event, not a market signal.
  useEffect(() => {
    if (!error) return;
    emitSiteNotification({
      id: 'system:scan:' + error.slice(0, 70) + ':' + Math.floor(Date.now() / 300000),
      kind: 'system', title: 'Проблема сканування', description: error,
    });
  }, [error, emitSiteNotification]);

  // Fetch screener data from API
  const fetchScreenerData = useCallback(async (currentTf = filters.timeframe, currentExchange = filters.exchange, currentMarket = filters.marketType) => {
    if (chartPageActive) return;
    scanAbortRef.current?.abort();
    const controller = new AbortController();
    scanAbortRef.current = controller;
    const requestId = ++scanRequestRef.current;
    setIsLoading(true);
    setError(null);
    setScanBusy(false);
    try {
      const params = new URLSearchParams({
        timeframe: currentTf,
        exchange: currentExchange,
        marketType: currentMarket,
        minVolume: '0',
      });

      let dataLoaded = false;
      try {
        const res = await fetch(`/api/screener/scan?${params.toString()}`, { signal: controller.signal });
        // A busy shared scan is deliberately rate-limited server-side. Starting
        // a 60-coin browser fallback here defeats that protection for every user.
        if (res.status === 503 && res.headers.has('Retry-After')) {
          if (!controller.signal.aborted && requestId === scanRequestRef.current) setScanBusy(true);
          return;
        }
        if (res.ok) {
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await res.json();
            if (data.success && Array.isArray(data.data) && data.data.length > 0) {
              if (requestId !== scanRequestRef.current) return;
              setCoins(data.data);
              setLastUpdated(Date.now());
              dataLoaded = true;

              reportStrongFormations(data.data as ScannedCoin[]);
              // A server scan can succeed while the server's public IP is
              // blocked from futures OI. Refresh ONLY the missing regular OI
              // directly from the browser; do not rescan or change Entry/SL/TP.
              // It re-scores the corresponding quality components safely.
              const supplemented = await hydrateMissingRegularOIFromBrowser(
                data.data as ScannedCoin[], { signal: controller.signal },
              );
              if (supplemented !== data.data && requestId === scanRequestRef.current) {
                setCoins(supplemented);
                // Verified browser OI can arrive after the server scan; re-evaluate
                // only the existing snapshot, without creating exchange requests.
                reportStrongFormations(supplemented);
              }
            }
          }
        }
      } catch (backendErr) {
        console.warn('Backend scan failed, trying direct exchange access:', backendErr);
      }

      // If backend did not yield data (e.g. an upstream network failure), fall back to direct browser connection
      if (!dataLoaded) {
        if (controller.signal.aborted) return;
        const directCoins = await runDirectClientScan({
          exchange: currentExchange,
          marketType: currentMarket,
          timeframe: currentTf,
        }, { signal: controller.signal, allowStaticFallback: false });
        if (controller.signal.aborted || requestId !== scanRequestRef.current) return;
        if (directCoins.length > 0) {
          if (requestId !== scanRequestRef.current) return;
          setCoins(directCoins);
          setLastUpdated(Date.now());
          reportStrongFormations(directCoins);
          dataLoaded = true;
        }
      }
      // Never mark hardcoded zero-price placeholder coins as a fresh scan or
      // dispatch alerts from them. Keep the previous verified snapshot intact.
      if (!dataLoaded && !controller.signal.aborted && requestId === scanRequestRef.current) {
        setError('Не вдалося отримати актуальні результати сканування. Попередні дані збережено; перевірте з’єднання та повторіть спробу.');
      }
    } catch (err: unknown) {
      if (!controller.signal.aborted && requestId === scanRequestRef.current) {
        console.warn('Scan complete fallback error:', err);
        setError('Не вдалося отримати актуальні результати сканування. Попередні дані збережено; перевірте з’єднання та повторіть спробу.');
      }
    } finally {
      if (scanAbortRef.current === controller) scanAbortRef.current = null;
      if (requestId === scanRequestRef.current) setIsLoading(false);
    }
  }, [chartPageActive, filters.timeframe, filters.exchange, filters.marketType, reportStrongFormations]);

  // Abort an in-flight browser scan on route transition, not merely its timer.
  useEffect(() => {
    if (!chartPageActive) return;
    ++scanRequestRef.current;
    scanAbortRef.current?.abort();
    scanAbortRef.current = null;
    setIsLoading(false);
  }, [chartPageActive]);

  // Only the visible Screener/regular Formations page runs a standard scan.
  // Terminal, Replay, 24/7 Surveillance and the full W/M mode never start
  // redundant formation scans just because each Desktop pane loads the SPA.
  useEffect(() => {
    if (!shouldRunStandardScan(activePage, earlyMode, chartPageActive)) return;
    let lastRequestedAt = 0;
    const refresh = (initial = false) => {
      if (document.hidden || (!initial && Date.now() - lastRequestedAt < 50_000)) return;
      lastRequestedAt = Date.now();
      void fetchScreenerData(filters.timeframe, filters.exchange, filters.marketType);
    };
    refresh(true);
    const interval = setInterval(() => refresh(), 60_000);
    // An initially hidden page has not fetched yet; resume promptly when
    // visible, without accumulating missed interval ticks.
    const onVisibilityChange = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      scanAbortRef.current?.abort();
    };
  }, [chartPageActive, earlyMode, activePage, fetchScreenerData]);

  // Favorites preserve exchange + market type. A plain symbol from legacy
  // callers is treated as Binance Futures, never guessed from current filters.
  const handleToggleWatchlist = (coin: CoinIdentifier | string) => {
    const key = getCoinWatchlistKey(coin);
    if (!user) {
      setWatchlist((previous) => {
        const next = toggleCoinWatchlist(previous, coin);
        try {
          localStorage.setItem('crypto_screener_watchlist_guest', JSON.stringify(next));
        } catch {}
        return next;
      });
      return;
    }
    setWatchlist((previous) => {
      const next = toggleCoinWatchlist(previous, coin);
      const wasRemoved = previous.some((saved) => getCoinWatchlistKey(saved) === key);
      try {
        localStorage.setItem(`crypto_screener_watchlist_${user.uid}`, JSON.stringify(next));
      } catch {}

      // New favorites always start in the general list. Only the user can
      // assign a folder using the WatchlistDrawer selector.
      if (wasRemoved) {
        setWatchlistFolders((current) => {
          const cleaned = removeCoinFromWatchlistFolders(current, coin);
          if (JSON.stringify(cleaned) === JSON.stringify(current)) return current;
          try {
            localStorage.setItem(`crypto_screener_watchlist_folders_${user.uid}`, JSON.stringify(cleaned));
          } catch {}
          updateProfileData({ watchlistFolders: cleaned }).catch(() => {});
          return cleaned;
        });
      }

      updateProfileData({ watchlist: next }).catch(() => {});
      return next;
    });
  };

  // The drawer has an explicit delete action, including for favorites that are
  // no longer part of the scan. Never toggle a missing entry back on.
  const handleRemoveWatchlistEntries = (sourceKeys: string[]) => {
    if (!user || sourceKeys.length === 0) return;
    const removed = new Set(sourceKeys);
    setWatchlist((prev) => {
      const next = prev.filter((key) => !removed.has(key));
      if (next.length === prev.length) return prev;
      try {
        localStorage.setItem(`crypto_screener_watchlist_${user.uid}`, JSON.stringify(next));
      } catch {}
      updateProfileData({ watchlist: next }).catch(() => {});
      return next;
    });
  };

  const handleWatchlistFoldersChange = (folders: Record<string, string[]>) => {
    if (!user) return;
    setWatchlistFolders(folders);
    try {
      localStorage.setItem(`crypto_screener_watchlist_folders_${user.uid}`, JSON.stringify(folders));
    } catch {}
    updateProfileData({ watchlistFolders: folders }).catch(() => {});
  };

  // Strict user-bound opt-in projection. Disabled mode returns the exact original arrays.
  const projectedCoins = useMemo(() => projectUserCoins(coins, constructorSettings), [coins, constructorSettings]);
  const projectedEarlyCoins = useMemo(() => projectUserCoins(fullEarlyScan?.data ?? [], constructorSettings), [fullEarlyScan?.data, constructorSettings]);
  const activeEarlyCandidate = useMemo(() => selectedEarly
    ? resolveEarlyTpSl(selectedEarly.candidate, constructorSettings, selectedEarly.coin.symbol) : null,
    [selectedEarly?.candidate, selectedEarly?.coin.symbol, constructorSettings]);
  // Details follow the current user profile, including immediate AUTO restoration.
  // Archived historical snapshots are intentionally immutable.
  const activeSelectedPair = useMemo(() => {
    if (!selectedPair?.formation || selectedArchivedItem) return selectedPair;
    const currentCoin = projectedCoins.find(row =>
      row.symbol === selectedPair.coin.symbol && row.exchange === selectedPair.coin.exchange
      && row.marketType === selectedPair.coin.marketType && row.timeframe === selectedPair.coin.timeframe);
    const formation = currentCoin?.formations.find(row => row.id === selectedPair.formation?.id)
      ?? resolveFormationTpSl(selectedPair.formation, constructorSettings, selectedPair.coin.symbol);
    return { coin: currentCoin ?? selectedPair.coin, formation };
  }, [selectedPair, selectedArchivedItem, projectedCoins, constructorSettings]);

  // Filter distinct patterns first, then group by instrument for both cards and table.
  const flattenedItems = useMemo(
    () => getVisibleFormations(projectedCoins, filters, regularIndicatorFilters),
    [projectedCoins, filters, regularIndicatorFilters],
  );
  const hasTechnicalFilters = countActiveRegularIndicatorFilters(regularIndicatorFilters) > 0;
  const groupedItems = useMemo(() => groupVisibleFormations(flattenedItems), [flattenedItems]);
  const earlyItems = useMemo(
    () => getVisibleEarlyFormations(projectedEarlyCoins, earlyFilters, earlyStage),
    [projectedEarlyCoins, earlyFilters, earlyStage],
  );
  // Feed the Terminal preset from the exact visible Formations list, not the
  // unfiltered scan universe. A preset click never launches a new scanner.
  const terminalFormationPresetCoins = useMemo(() => earlyMode
    ? earlyItems.map(item => item.coin)
    : groupedItems.map(group => ({ ...group.coin, formations: group.formations })),
    [earlyMode, earlyItems, groupedItems],
  );

  // Coins matching search query even if no formation is detected on current timeframe
  const matchingCoinsSearch = useMemo(
    () => getMatchingUnformedCoins(coins, filters),
    [coins, filters],
  );

  // Counts for header stats
  const bullishCount = useMemo(
    () => flattenedItems.filter((i) => i.formation.bias === 'bullish').length,
    [flattenedItems]
  );
  const bearishCount = useMemo(
    () => flattenedItems.filter((i) => i.formation.bias === 'bearish').length,
    [flattenedItems]
  );

  // Loading screen during initial authentication check
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#070a12] flex flex-col items-center justify-center p-4 text-slate-300">
        <img
          src="/h00k-loading-robot.svg"
          alt="h00k — анімований робот"
          width={100}
          height={70}
          className="mb-5 h-auto w-48 sm:w-56"
        />
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="w-4 h-4 border-2 border-cyan-500/40 border-t-cyan-400 rounded-full animate-spin" />
          <span>Завантаження…</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${chartPageActive ? 'bg-[#070a12]' : 'bg-[var(--site-body-background,#070a12)]'} text-slate-100 flex flex-col selection:bg-cyan-500/20 selection:text-cyan-300 ${chartPageActive ? 'relative isolate' : ''}`}>
      {chartPageActive && <div ref={attachChartBackdrop} className="chart-page-backdrop"
        aria-hidden="true" inert data-chart-page-backdrop="static" />}
      {/* First-visit installation tip remains available to guests on all devices. */}
      {!desktopPanel && activePage !== 'pc' && <InstallAppButton variant="tip" />}
      {/* Header */}
      {!chartPageActive && !desktopPanel && <Header
        isLoading={isLoading}
        totalCoins={coins.length}
        formationsCount={flattenedItems.length}
        bullishCount={bullishCount}
        bearishCount={bearishCount}
        watchlistCount={watchlistCount}
        onRefresh={() => {
          const target = foregroundScanKind(activePage, earlyMode, chartPageActive);
          if (target === 'early') refreshFullEarlyScan();
          else if (target === 'regular') void fetchScreenerData();
        }}
        onOpenWatchlist={() => {
          if (!user) {
            handleOpenAuthModal('signin', 'general');
            return;
          }
          setIsWatchlistOpen(true);
        }}
        onOpenArchive={() => {
          if (!user) {
            handleOpenAuthModal('signin', 'general');
            return;
          }
          setIsArchiveModalOpen(true);
        }}
        archiveCount={archivedFormations.length}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenMetaScalp={() => {
          if (!user) {
            handleOpenAuthModal('signin', 'linking');
            return;
          }
          setProfileInitialSection('linking');
          setIsProfileModalOpen(true);
        }}
        metaScalpSettings={metaScalpSettings}
        terminalLinkSettings={terminalLinkSettings}
        onOpenTelegramAlerts={() => handleOpenTelegramAlerts()}
        telegramAlertsCount={activeAlertsCount}
        surveillanceCount={surveillanceActiveCount}
        lastUpdated={lastUpdated}
        onOpenAuth={() => handleOpenAuthModal('signin', null)}
        onOpenProfile={() => { setProfileInitialSection('account'); setIsProfileModalOpen(true); }}
        onLinkNotification={handleLinkNotification}
        canLinkNotification={canLinkNotification}
        onOpenNotificationChart={openNotificationCoinChart}
        onOpenNotificationSettings={() => {
          if (!user) { handleOpenAuthModal('signin', 'general'); return; }
          setProfileInitialSection('notifications');
          setIsProfileModalOpen(true);
        }}
        activePage={activePage}
        onPageChange={handlePageChange}
      />}

      {desktopPanel && !chartPageActive && (
        <div className="shrink-0 border-b border-slate-800/70 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-cyan-300">
          h00k Desktop · {({
            screener: 'Скрінер', formations: 'Формації W/M', early: 'Раннє виявлення',
            terminal: 'Термінал HookChart', surveillance: 'Спостереження', replay: 'Тестування',
          } as Record<string, string>)[desktopPanel]}
        </div>
      )}

      {/* Main Content Area */}
      <main className={chartPageActive
        ? 'relative z-10 w-full min-w-0 flex-1'
        : desktopPanel
          ? 'flex-1 min-w-0 w-full px-2 py-2 space-y-3'
          : 'flex-1 max-w-[2560px] 3xl:max-w-[3440px] w-full mx-auto px-2 sm:px-4 lg:px-6 2xl:px-8 py-2 sm:py-4 space-y-3 sm:space-y-4'}>
        {chartPageActive ? (
          !user ? (
            <section className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center gap-4 px-5 text-center">
              <h1 className="text-lg font-bold text-white">Графік {chartRoute?.symbol}</h1>
              <p className="text-sm text-slate-400">Увійдіть у свій акаунт, щоб відкрити графік.</p>
              <button type="button" onClick={() => handleOpenAuthModal('signin', 'chart')}
                className="rounded-xl border border-cyan-600 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-200">
                Увійти
              </button>
              <button type="button" onClick={closeChartPage} className="text-sm text-slate-400 underline">
                Назад до Скрінера
              </button>
            </section>
          ) : chartRouteLoading ? (
            <div role="status" className="flex min-h-[55vh] items-center justify-center text-slate-400">
              Завантаження графіка…
            </div>
          ) : selectedEarly && activeEarlyCandidate && chartRoute?.kind === 'early' ? (
            <FullscreenChartModal
              pageMode isOpen
              key={[user.uid,selectedEarly.coin.exchange,selectedEarly.coin.marketType,
                selectedEarly.coin.symbol,selectedEarly.candidate.id].join(':')}
              coin={selectedEarly.coin}
              formation={null}
              earlyCandidate={activeEarlyCandidate}
              earlyTouchRule={selectedEarly.candidate.tpSlBuilder?.touches.verified
                ? getTpSlRule(constructorSettings,selectedEarly.coin.symbol,activeEarlyCandidate.patternKey)
                : undefined}
              customMarkers={earlyFormationChartMarkers(activeEarlyCandidate)}
              currentTimeframe={selectedEarly.coin.timeframe}
              livePrice={selectedEarly.coin.currentPrice}
              allCoins={coins}
              watchlist={watchlist}
              onToggleWatchlist={handleToggleWatchlist}
              onOpenTelegramModal={handleOpenTelegramAlerts}
              onSendMetaScalp={(coin) => handleSendToMetaScalp(coin, 'early')}
              metaScalpBinding={activeTerminalGroup}
              onClose={closeChartPage}
              onPageCoinChange={selectFavoriteOnChartPage}
            />
          ) : selectedArchivedItem && chartRoute?.kind === 'archive' ? (
            <SavedFormationChartPage
              key={[user.uid, selectedArchivedItem.exchange, selectedArchivedItem.marketType,
                selectedArchivedItem.symbol, chartRoute.timeframe].join(':')}
              archivedItem={selectedArchivedItem}
              initialTimeframe={chartRoute.timeframe}
              onTimeframeChange={tf => {
                if (!chartRoute || !selectedPair) return;
                const nextCoin = { ...selectedPair.coin, timeframe: tf };
                setSelectedPair(previous => previous ? { ...previous, coin: nextCoin } : previous);
                openChartPage({ ...chartRoute, timeframe: tf },
                  { coin: nextCoin, formation: selectedPair.formation, archived: selectedArchivedItem }, true);
              }}
              onClose={closeChartPage}
            />
          ) : activeSelectedPair?.formation && chartRoute?.kind !== 'early' ? (
            <FormationDetailsModal
              pageMode
              visualOrigin={chartPageVisualOrigin(chartRoute)}
              coin={activeSelectedPair.coin}
              formation={activeSelectedPair.formation}
              onFormationChange={(nextFormation) => {
                if (!selectedPair) return;
                setSelectedArchivedItem(null);
                const rawCoin = coins.find(row => row.symbol === selectedPair.coin.symbol
                  && row.exchange === selectedPair.coin.exchange
                  && row.marketType === selectedPair.coin.marketType
                  && row.timeframe === selectedPair.coin.timeframe);
                const rawFormation = rawCoin?.formations.find(row => row.id === nextFormation.id) ?? nextFormation;
                const chosen = { coin: rawCoin ?? selectedPair.coin, formation: rawFormation };
                setSelectedPair(chosen);
                if (chartRoute) {
                  openChartPage({
                    ...chartRoute, kind: 'coin', formationId: rawFormation.id,
                  }, chosen, true);
                }
              }}
              initialTimeframe={chartRoute?.timeframe}
              onPageTimeframeChange={tf => {
                if (!chartRoute || !selectedPair) return;
                const coin = { ...selectedPair.coin, timeframe: tf };
                setSelectedPair(previous => previous ? { ...previous, coin } : previous);
                openChartPage({ ...chartRoute, timeframe: tf },
                  { coin, formation: selectedPair.formation, archived: selectedArchivedItem }, true);
              }}
              archivedItem={selectedArchivedItem}
              allCoins={coins}
              watchlist={watchlist}
              onToggleWatchlist={handleToggleWatchlist}
              onClose={closeChartPage}
              onSendMetaScalp={(coin) => handleSendToMetaScalp(coin,
                chartPageVisualOrigin(chartRoute) === 'screener' ? 'screener' : 'formations')}
              metaScalpBinding={activeTerminalGroup}
              onOpenTelegramModal={handleOpenTelegramAlerts}
              onOpenAuth={() => setIsAuthModalOpen(true)}
              onAlertToast={handleAlertToast}
            />
          ) : selectedPair ? (
            <>
              {chartRouteError && (
                <p role="status" className="mx-auto max-w-5xl border-b border-amber-800/30 bg-slate-900 px-4 py-2 text-xs text-amber-200">
                  {chartRouteError}
                </p>
              )}
              <FullscreenChartModal
                pageMode isOpen
                visualContext={chartPageVisualContext(chartRoute, true)}
                coin={selectedPair.coin}
                formation={null}
                currentTimeframe={chartRoute?.timeframe || selectedPair.coin.timeframe || preferences.defaultTimeframe}
                onPageCoinChange={selectFavoriteOnChartPage}
                onPageTimeframeChange={changeStandaloneChartTimeframe}
                livePrice={selectedPair.coin.currentPrice}
                allCoins={coins}
                watchlist={watchlist}
                onToggleWatchlist={handleToggleWatchlist}
                onClose={closeChartPage}
                onSendMetaScalp={(coin) => handleSendToMetaScalp(coin, 'chart')}
                metaScalpBinding={activeTerminalGroup}
                onOpenTelegramModal={handleOpenTelegramAlerts}
              />
            </>
          ) : (
            <section className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-slate-400">{chartRouteError || 'Підготовка графіка…'}</p>
              <button type="button" onClick={closeChartPage} className="rounded-lg border border-slate-700 px-4 py-2 text-slate-300">Назад</button>
            </section>
          )
        ) : activePage === 'pc' ? (
          <React.Suspense fallback={<section className="flex min-h-[50vh] items-center justify-center text-sm text-cyan-300">h00k Desktop</section>}>
            <PcLandingPage />
          </React.Suspense>
        ) : activePage === 'terminal' ? (
          <TerminalRenderBoundary variant="workspace" resetKey={user?.uid || 'guest'} onExit={() => handlePageChange('screener')}>
          <TerminalPage
            key={user?.uid || 'guest'}
            coins={coins}
            formationPresetCoins={terminalFormationPresetCoins}
            watchlist={watchlist}
            onToggleWatchlist={handleToggleWatchlist}
            onSendMetaScalp={(coin) => handleSendToMetaScalp(coin, 'terminal')}
            metaScalpBinding={activeTerminalGroup}
            onOpenTelegramAlerts={handleOpenTelegramAlerts}
            onOpenFullscreenModal={(coin, formation) => handleSelectPair(coin, formation)}
            onReturnToPatterns={() => handlePageChange('screener')}
          />
          </TerminalRenderBoundary>
        ) : activePage === 'replay' ? (
          user ? (
            <ReplayPage
              coins={coins}
              onNavigateToScreener={() => handlePageChange('screener')}
            />
          ) : (
            // Never mount Replay's history loaders, journal or simulator for guests,
            // including a direct #replay link or a session that just signed out.
            <section className="flex min-h-[55vh] flex-col items-center justify-center gap-3 px-4 text-center">
              <Lock size={24} className="text-slate-500" aria-hidden="true" />
              <p className="text-sm text-slate-300">
                {tr('Увійдіть у свій акаунт, щоб відкрити сторінку «Відтворення».')}
              </p>
              <button type="button" onClick={() => handleOpenAuthModal('signin', 'general')}
                className="rounded-xl border border-cyan-600 bg-cyan-950/60 px-4 py-2 text-sm font-semibold text-cyan-200">
                {tr('Увійти')}
              </button>
            </section>
          )
        ) : activePage === 'surveillance' ? (
          <SurveillancePage
            availableCoins={coins}
            onSelectCoinForChart={(symbol, exchange, marketType) => {
              const matchedCoin = coins.find((c) => c.symbol === symbol);
              if (matchedCoin) {
                handleSelectPair(matchedCoin);
              }
            }}
            onOpenTelegramSettings={() => setIsTelegramModalOpen(true)}
            onNavigateToScreener={() => handlePageChange('screener')}
          />
        ) : activePage === 'screener' ? (
          <CoinScreenerPage
            key={user?.uid || 'guest'}
            onSelectCoin={handleSelectPair}
            onSendMetaScalp={(coin) => handleSendToMetaScalp(coin, 'screener')}
            metaScalpBinding={activeTerminalGroup}
            watchlist={watchlist}
            onToggleWatchlist={handleToggleWatchlist}
            onOpenTelegramAlerts={handleOpenTelegramAlerts}
            onOpenWatchlist={() => {
              if (!user) {
                handleOpenAuthModal('signin', 'general');
                return;
              }
              setIsWatchlistOpen(true);
            }}
            formationsCoins={coins}
            onOpenAuthModal={handleOpenAuthModal}
          />
        ) : (
          <>
            {/* Filters Toolbar */}
            <ScreenerFilters
              filters={earlyMode ? earlyFilters : filters}
              onFilterChange={(changes) => earlyMode
                ? setEarlyFilters((prev) => ({ ...prev, ...changes }))
                : setFilters((prev) => ({ ...prev, ...changes }))}
              earlyMode={earlyMode}
              earlyStage={earlyStage}
              onEarlyStageChange={setEarlyStage}
              regularIndicatorFilters={regularIndicatorFilters}
              onRegularIndicatorFilterChange={(changes) =>
                setRegularIndicatorFilters(prev => ({ ...prev, ...changes }))}
              onResetRegularIndicatorFilters={() =>
                setRegularIndicatorFilters({ ...DEFAULT_REGULAR_INDICATOR_FILTERS })}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-slate-900/80 p-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-100">{tr('Раннє виявлення формацій · W / M')}</div>
                <p className="text-[11px] text-slate-400">{tr('Повний пошук серед доступних USDT-пар обраної біржі, ринку й таймфрейму; структури до другого екстремуму та пробою шиї.')}</p>
              </div>
              <button type="button" role="switch" aria-checked={earlyMode}
                onClick={() => changeEarlyMode(!earlyMode)}
                className={'shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ' +
                  (earlyMode ? 'border-amber-500/50 bg-amber-500/20 text-amber-200' : 'border-slate-700 bg-slate-800 text-slate-300')}>
                {tr(earlyMode ? 'Ранній режим увімкнено' : 'Увімкнути ранній режим')}
              </button>
            </div>

            <div className="px-1 text-[11px] text-slate-400" aria-live="polite">
              {earlyMode
                ? interpolate(tr('{{count}} попередніх W/M-сценаріїв'), { count: earlyItems.length })
                : interpolate(tr('{{coins}} монет · {{formations}} формацій'), { coins: groupedItems.length, formations: flattenedItems.length })}
              {!earlyMode && filters.densityConfirmedOnly && tr(' · щільність стакана підтверджена')}
              {!earlyMode && filters.roundNumberOnly && tr(' · біля круглого числа (ROUND)')}
              {!earlyMode && scanBusy && lastUpdated !== null && (
                <MarketDataFreshnessIcon
                  label={tr('Сканер тимчасово зайнятий. Попередні результати збережено; повторіть спробу трохи пізніше.')}
                  kind="busy" className="ml-2" />
              )}
            </div>

            {/* Failures remain visible when no verified snapshot is available.
                A busy refresh with cached results only needs the quiet icon. */}
            {!earlyMode && (error || (scanBusy && lastUpdated === null)) && (
              <div role="status" className={`flex items-center justify-between gap-2 p-4 rounded-2xl border text-xs ${scanBusy ? 'bg-amber-950/30 border-amber-800/60 text-amber-200' : 'bg-rose-950/40 border-rose-800/80 text-rose-300'}`}>
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                  <span>{scanBusy ? tr('Сканер тимчасово зайнятий. Попередні результати збережено; повторіть спробу трохи пізніше.') : tr(error ?? '')}</span>
                </div>
                <button
                  onClick={() => fetchScreenerData()}
                  className="px-3 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-900 font-semibold transition-colors"
                >
                  {tr('Повторити')}
                </button>
              </div>
            )}

            {/* Results Area */}
            {earlyMode ? (
              <EarlyFormationsResults
                coins={projectedEarlyCoins}
                filters={earlyFilters}
                stage={earlyStage}
                loading={fullEarlyScan?.status === 'running' || fullEarlyScan?.status === 'loading' || !fullEarlyScan}
                scanProgress={fullEarlyScan}
                onRetryScan={refreshFullEarlyScan}
                onStopScan={stopFullEarlyScan}
                watchlist={watchlist}
                onToggleWatchlist={handleToggleWatchlist}
                onOpen={handleOpenEarly}
                onSendMetaScalp={(coin) => handleSendToMetaScalp(coin, 'early')}
                metaScalpBinding={activeTerminalGroup}
                onOpenPriceAlert={(coin) => handleOpenTelegramAlerts({
                  symbol: coin.symbol,
                  exchange: coin.exchange,
                  marketType: coin.marketType,
                  currentPrice: coin.currentPrice,
                })}
              />
            ) : (
              <>
            {isLoading && lastUpdated === null ? (
              <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 min-[2200px]:grid-cols-7 min-[2800px]:grid-cols-8 gap-3 sm:gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((idx) => (
                  <div
                    key={idx}
                    className="h-56 rounded-2xl bg-slate-900/40 border border-slate-800/60 animate-pulse p-4 space-y-4"
                  >
                    <div className="flex justify-between items-center">
                      <div className="h-5 w-24 bg-slate-800 rounded-md" />
                      <div className="h-5 w-16 bg-slate-800 rounded-md" />
                    </div>
                    <div className="h-16 bg-slate-800/60 rounded-xl" />
                    <div className="h-10 bg-slate-800/40 rounded-xl" />
                  </div>
                ))}
              </div>
            ) : flattenedItems.length === 0 ? (
              !hasTechnicalFilters && matchingCoinsSearch.length > 0 ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-800/50 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Sparkles className="w-5 h-5 text-cyan-400 shrink-0" />
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          {interpolate(tr('Знайдено {{count}} монет за пошуком "{{query}}"'), { count: matchingCoinsSearch.length, query: filters.searchQuery.toUpperCase() })}
                        </h4>
                        <p className="text-xs text-slate-400">
                          {interpolate(tr('На поточному таймфреймі ({{timeframe}}) активних геометричних патернів ще не сформовано. Ви можете відкрити монету в терміналі або змінити таймфрейм:'), { timeframe: filters.timeframe })}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handlePageChange('screener')}
                      className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white transition-colors"
                    >
                      <span className="inline-flex items-center gap-1.5"><ScreenerIcon className="w-3.5 h-3.5 shrink-0" />{tr('Відкрити у Скрінері Монет')} →</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {matchingCoinsSearch.map((coin) => (
                      <div
                        key={`${coin.exchange}-${coin.symbol}-${coin.marketType}`}
                        onClick={() => {
                          handleSelectPair(coin);
                        }}
                        className="bg-slate-900/60 border border-slate-800 hover:border-cyan-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:shadow-lg hover:shadow-cyan-950/20 group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span data-no-translate className="font-bold text-sm text-white group-hover:text-cyan-400 transition-colors">
                            {coin.symbol}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 uppercase font-mono">
                            {coin.exchange} • {coin.marketType}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between mb-3">
                          <span className="text-lg font-mono font-bold text-white">
                            ${coin.currentPrice >= 1 ? coin.currentPrice.toLocaleString('en-US') : coin.currentPrice}
                          </span>
                          <span className={`text-xs font-mono font-semibold ${coin.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {coin.priceChange24h >= 0 ? '+' : ''}{coin.priceChange24h.toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2.5">
                          <span>{tr("Об'єм:")} ${(coin.volume24hUsd / 1_000_000).toFixed(1)}M</span>
                          <span className="inline-flex items-center gap-1 text-cyan-400 font-semibold group-hover:underline"><TerminalIcon className="w-3.5 h-3.5 shrink-0" />Термінал →</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center rounded-3xl border border-slate-800/80 bg-slate-900/40 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                    <FormationsIcon className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white">{tr('Формацій не знайдено')}</h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      {hasTechnicalFilters
                        ? tr('За активними технічними фільтрами ATR, RVOL, RSI, OI або дельти формацій немає. Скидання фільтрів відновить результати. OI доступний лише для ф’ючерсів, дельта/CVD — лише для Binance; відсутні дані не підміняються оцінками.')
                        : tr('За поточними фільтрами активних формацій не виявлено. Спробуйте змінити таймфрейм (5m / 15m / 1h / 4h), обрати обидві біржі або скинути фільтри.')}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setFilters(DEFAULT_FILTERS);
                      setRegularIndicatorFilters({ ...DEFAULT_REGULAR_INDICATOR_FILTERS });
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                  >
                    {t('resetFilters')}
                  </button>
                </div>
              )
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 min-[2200px]:grid-cols-7 min-[2800px]:grid-cols-8 gap-3 sm:gap-4">
                {groupedItems.map(({ coin, formations, key }) => (
                  <FormationCard
                    key={key}
                    coin={coin}
                    formation={formations[0]}
                    formations={formations}
                    isWatchlisted={isCoinInWatchlist(watchlist, coin)}
                    onToggleWatchlist={handleToggleWatchlist}
                    onSelect={handleSelectPair}
                    onSendMetaScalp={(coin) => handleSendToMetaScalp(coin, 'formations')}
                    metaScalpBinding={activeTerminalGroup}
                    onOpenAlert={(c, f) =>
                      handleOpenTelegramAlerts({
                        symbol: c.symbol,
                        exchange: c.exchange,
                        marketType: c.marketType,
                        currentPrice: c.currentPrice,
                        targetPrice: f.levels.targetPrice,
                        formationName: f.name,
                        condition: f.levels.targetPrice >= c.currentPrice ? 'gte' : 'lte',
                      })
                    }
                  />
                ))}
              </div>
            ) : (
              <ScreenerTable
                items={groupedItems}
                watchlist={watchlist}
                onToggleWatchlist={handleToggleWatchlist}
                onSelect={handleSelectPair}
                onSendMetaScalp={(coin) => handleSendToMetaScalp(coin, 'formations')}
                metaScalpBinding={activeTerminalGroup}
                onOpenAlert={(c, f) =>
                  handleOpenTelegramAlerts({
                    symbol: c.symbol,
                    exchange: c.exchange,
                    marketType: c.marketType,
                    currentPrice: c.currentPrice,
                    targetPrice: f.levels.targetPrice,
                    formationName: f.name,
                    condition: f.levels.targetPrice >= c.currentPrice ? 'gte' : 'lte',
                  })
                }
              />
            )}
              </>
            )}
          </>
        )}
      </main>

      {/* The Formations view uses the same transparent floating navigation as the coin Screener. */}
      {activePage === 'patterns' && !chartPageActive && (
        <div role="group" aria-label="Навігація формацій"
          className="fixed bottom-4 right-4 z-30 flex flex-col gap-1.5">
          <button type="button"
            onClick={() => {
              const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
              window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
            }}
            className="h-9 w-9 flex items-center justify-center border-0 bg-transparent p-0 text-slate-300 shadow-none hover:bg-transparent hover:text-cyan-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 touch-manipulation"
            title="На початок списку формацій"
            aria-label="На початок списку формацій">
            <ArrowUpToLine className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button"
            onClick={() => {
              const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
              const page = document.scrollingElement ?? document.documentElement;
              window.scrollTo({ top: page.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
            }}
            className="h-9 w-9 flex items-center justify-center border-0 bg-transparent p-0 text-slate-300 shadow-none hover:bg-transparent hover:text-cyan-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 touch-manipulation"
            title="У кінець списку формацій"
            aria-label="У кінець списку формацій">
            <ArrowDownToLine className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button"
            onClick={() => {
              if (!user) {
                handleOpenAuthModal('signin', 'general');
                return;
              }
              setIsWatchlistOpen(true);
            }}
            className="relative h-9 w-9 flex items-center justify-center border-0 bg-transparent p-0 text-amber-400 shadow-none hover:bg-transparent hover:text-amber-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 touch-manipulation"
            title={!user ? 'Обрані монети (тільки для зареєстрованих)' : 'Обрані монети'}
            aria-label="Відкрити обрані монети">
            <Bookmark className="w-4 h-4" aria-hidden="true" />
            {!user && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center border-0 bg-transparent text-amber-400">
                <Lock className="h-2 w-2" aria-hidden="true" />
              </span>
            )}
          </button>
        </div>
      )}

      {!chartPageActive && !desktopPanel && <SiteFooter />}

      {/* Coin, archived and early charts now render inside the main route
          above. Nothing is mounted over a background Screener anymore. */}

      {/* Formations Archive Modal */}
      <ArchiveModal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        onSelectFormation={handleSelectArchivedFormation}
        onOpenAuth={() => setIsAuthModalOpen(true)}
      />

      {/* Encyclopedia / Guide Modal */}
      <FormationGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      {/* Watchlist Drawer */}
      <WatchlistDrawer
        isOpen={isWatchlistOpen}
        onClose={() => setIsWatchlistOpen(false)}
        watchlistSymbols={watchlist}
        allCoins={coins}
        onRemove={handleRemoveWatchlistEntries}
        folders={watchlistFolders}
        onFoldersChange={handleWatchlistFoldersChange}
        onSendMetaScalp={(coin) => handleSendToMetaScalp(coin, 'favorites')}
        onOpenChart={handleOpenWatchlistChart}
        metaScalpBinding={activeTerminalGroup}
      />

      {/* MetaScalp Notification Toast */}
      <MetaScalpToast
        toast={metaScalpToast}
        onDismiss={() => setMetaScalpToast(null)}
      />

      {/* Telegram Alerts & Configuration Modal */}
      <TelegramAlertsModal
        key={`telegram-${user?.uid || 'guest'}`}
        isOpen={isTelegramModalOpen}
        onClose={() => setIsTelegramModalOpen(false)}
        prefill={telegramPrefill}
        onOpenAuth={() => handleOpenAuthModal('signin', 'alerts')}
        onAlertCreated={(alert) => {
          if (!notificationEnabled(notificationSettings, 'price')) return;
          setAlertToast({
            id: Date.now(),
            symbol: alert.symbol,
            targetPrice: alert.targetPrice,
            condition: alert.condition,
            message: alert.note || alert.formationName || 'Алерт додано в чергу моніторингу',
          });
        }}
      />

      {/* User Authentication Modal (Registration / Login) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => {
          setIsAuthModalOpen(false);
          setAuthPromptReason(null);
        }}
        initialMode={authInitialMode}
        promptReason={authPromptReason}
        onSuccess={() => {
          setIsAuthModalOpen(false);
          setAuthPromptReason(null);
        }}
      />

      {/* User Profile & Isolated Settings Modal */}
      <UserProfileModal
        key={`profile-${user?.uid || 'guest'}`}
        isOpen={isProfileModalOpen}
        initialSection={profileInitialSection}
        onClose={() => setIsProfileModalOpen(false)}
        onOpenAlerts={() => handleOpenTelegramAlerts()}
        onOpenArchive={() => setIsArchiveModalOpen(true)}
      />

      {/* Telegram Alert Notification Toast */}
      <AlertToast
        toast={alertToast}
        onDismiss={() => setAlertToast(null)}
      />
    </div>
  );
}

