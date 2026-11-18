import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import {
  ListChecks,
  ChevronDown,
  Send,
  Zap,
  Star,
  Search,
  PanelLeftClose,
  Trash2,
  Plus,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  X,
  Grid,
  ScanLine,
  Leaf,
  ArrowUpToLine,
  ArrowDownToLine,
  Bookmark,
  Lock,
  Keyboard,
  ChartNoAxesCombined,
  BellRing,
} from 'lucide-react';
import {
  TerminalChartBlock,
  TerminalWorkspaceConfig,
  ScannedCoin,
  DetectedFormation,
  Timeframe,
  ExchangeId,
  MarketType,
  Kline,
  MarketCoin,
  TerminalSavedPreset,
  HookChartPreferences,
} from '../types';
import { TerminalGridItem } from './terminal/TerminalGridItem';
import { createTerminalCoinPickerStore } from '../utils/terminalCoinPickerStore';
import { SiteFooter } from './SiteFooter';
import { AddChartModal } from './terminal/AddChartModal';
import { TerminalSettingsDrawer } from './terminal/TerminalSettingsDrawer';
import { getStoredPreferences, useAppPreferences } from '../utils/userPreferences';
import { useAuth } from '../context/AuthContext';
import { useArchive } from '../context/ArchiveContext';
import { ArchiveEntryReasonDialog } from './ArchiveEntryReasonDialog';
import { archiveVisualMarketKey, type ArchiveChartCapture } from '../utils/archiveChartSnapshot';
import { terminalArchiveFormation } from '../utils/terminalArchiveFormation';
import { useLanguage } from '../context/LanguageContext';
import { useTerminalWorkspace } from '../utils/useTerminalWorkspace';
import { blocksForMarketPreset, normalizeTerminalBlocks, normalizeTerminalMarketPair, formatTerminalQuotedPrice, MAX_TERMINAL_CHARTS } from '../utils/terminalPresets';
import { getTerminalPresetPage, pageAfterLimitChange, resolveTerminalPresetPageSize, resolveTerminalWorkspacePageSize } from '../utils/terminalPresetPaging';
import { terminalGridColumnClasses, terminalResponsiveAutoHeights } from '../utils/terminalResponsiveGrid';
import { MARKET_PRESETS, coinMarketKey, type TerminalMarketPreset } from '../utils/marketPresets';
import { loadMarketCoins, type MarketCoinSnapshot } from '../utils/marketCoinLoader';
import { nextTerminalMarketRefreshDelay } from '../utils/desktopTerminalRefresh';
import { applyTerminalTimeframe } from '../utils/terminalTimeframe';
import { TerminalPresetPanel } from './terminal/TerminalPresetPanel';
import { TerminalClock } from './terminal/TerminalClock';
import { TerminalHotkeysDialog } from './terminal/TerminalHotkeysDialog';
import { terminalShortcutAction, loadTerminalHotkeys, saveTerminalHotkeys, normalizeTerminalHotkeys, type TerminalHotkeyMap } from '../utils/terminalHotkeys';
import { getUserTerminalLinkSettings } from '../utils/terminalLinkService';
import { TerminalChartRefreshPicker } from './terminal/TerminalChartRefreshPicker';
import { normalizeTerminalChartRefreshMs, type TerminalChartRefreshMs } from '../utils/terminalChartRefresh';
import { toggleFullscreenSafe } from '../utils/fullscreenUtils';
import { normalizeChartProvider } from '../utils/chartPreferences';
import { useTerminalLiveAlerts, type TerminalLiveAlert } from '../utils/useTerminalLiveAlerts';
import { getCoinWatchlistKey, resolveWatchlistEntries, watchlistEntryToChartCoin } from '../utils/watchlistUtils';
import { TerminalLiveAlertToast } from './terminal/TerminalLiveAlertToast';
import { analysisMarketKey, terminalAnalysisAllowed, terminalNoticeChart } from '../utils/terminalAnalysis/model';
import { terminalAnalysisText } from '../utils/terminalAnalysis/presentation';

interface TerminalPageProps {
  coins: ScannedCoin[];
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
  onSendMetaScalp?: (coin: ScannedCoin) => void;
  metaScalpBinding?: string;
  onOpenTelegramAlerts?: (prefill?: any) => void;
  onOpenFullscreenModal?: (coin: ScannedCoin, formation?: DetectedFormation) => void;
  onReturnToPatterns?: () => void;
}

export const TerminalPage: React.FC<TerminalPageProps> = ({
  coins: formationCoins,
  watchlist,
  onToggleWatchlist,
  onSendMetaScalp,
  metaScalpBinding = '001',
  onOpenTelegramAlerts,
  onOpenFullscreenModal,
  onReturnToPatterns,
}) => {
  const { t, language } = useLanguage();
  // Stable event forwarding: chart cards do not repaint when App recreates
  // navigation callbacks for an unrelated market/UI update.
  const terminalActionsRef = useRef({ onSendMetaScalp, onOpenFullscreenModal, onOpenTelegramAlerts });
  terminalActionsRef.current = { onSendMetaScalp, onOpenFullscreenModal, onOpenTelegramAlerts };
  const stableSendMetaScalp = useCallback((coin: ScannedCoin) =>
    terminalActionsRef.current.onSendMetaScalp?.(coin), []);
  const stableOpenFullscreen = useCallback((coin: ScannedCoin, formation?: DetectedFormation) =>
    terminalActionsRef.current.onOpenFullscreenModal?.(coin, formation), []);
  const stableOpenTelegram = useCallback((prefill?: any) =>
    terminalActionsRef.current.onOpenTelegramAlerts?.(prefill), []);
  // The Terminal always renders native HookChart, regardless of previous chart settings.
  const chartProvider = normalizeChartProvider('hookchart');
  const { preferences } = useAppPreferences();
  const { user, profile, updateProfileData } = useAuth();
  const { saveToArchive } = useArchive();
  // One archive controller for the Terminal, not one subscription per chart.
  const [pendingTerminalArchive, setPendingTerminalArchive] = useState<{
    owner: string; coin: ScannedCoin; formation: DetectedFormation;
    capture: ArchiveChartCapture; historyLimit: number;
  } | null>(null);
  const [savingTerminalArchive, setSavingTerminalArchive] = useState(false);
  const [terminalArchiveFeedback, setTerminalArchiveFeedback] = useState('');
  useEffect(() => {
    setPendingTerminalArchive(null);
    setTerminalArchiveFeedback('');
  }, [user?.uid]);
  const terminalArchiveCopy = useMemo(() => ({
    uk: { signIn: 'Увійдіть у профіль, щоб зберігати монети.', unavailable: 'Знімок графіка ще не готовий. Дочекайтеся завантаження свічок.', price: 'Ціна монети ще недоступна. Дочекайтеся котирування.', thirty: 'Збереження графіка 30s поки недоступне. Оберіть 1m або старший таймфрейм.', saved: 'Монету додано до Збережених формацій.' },
    en: { signIn: 'Sign in to save coins.', unavailable: 'Chart snapshot is not ready. Wait until candles load.', price: 'No coin price yet. Wait for a quote.', thirty: 'Saving 30s charts is not supported yet. Choose 1m or higher.', saved: 'Coin added to Saved Formations.' },
    pl: { signIn: 'Zaloguj się, aby zapisywać monety.', unavailable: 'Zrzut wykresu nie jest gotowy. Poczekaj na świece.', price: 'Brak ceny monety. Poczekaj na notowanie.', thirty: 'Zapisywanie wykresów 30s nie jest jeszcze dostępne. Wybierz 1m lub więcej.', saved: 'Moneta dodana do Zapisanych formacji.' },
    ru: { signIn: 'Войдите в профиль, чтобы сохранять монеты.', unavailable: 'Снимок графика ещё не готов. Дождитесь свечей.', price: 'Цена монеты пока недоступна. Дождитесь котировки.', thirty: 'Сохранение графиков 30s пока недоступно. Выберите 1m или выше.', saved: 'Монета добавлена в Сохранённые формации.' },
  } as const)[language], [language]);
  const { blocks, config, customPresets, setBlocks: updateBlocks, setConfig, setCustomPresets,
    syncError, syncConflict, backupFailed, retrySync, downloadLocalBackup, importWorkspaceBackup,
    restoreCloudWorkspace, requestImmediateWorkspaceSync } = useTerminalWorkspace();
  const [activeMarketPreset, setActiveMarketPreset] = useState<TerminalMarketPreset | null>(null);
  const [presetMatches, setPresetMatches] = useState<MarketCoin[]>([]);
  const [presetPage, setPresetPage] = useState(0);
  const presetPageRef = useRef(0);
  const chartListRef = useRef<HTMLDivElement>(null);
  const [showCoinPresets, setShowCoinPresets] = useState(false);
  const [showHotkeys, setShowHotkeys] = useState(false);
  // Keyboard bindings are scoped per signed-in account (or guest) on this device.
  // This setting never touches WebSocket streams or chart repaint scheduling.
  const [terminalHotkeys, setTerminalHotkeys] = useState<TerminalHotkeyMap>(() => loadTerminalHotkeys(user?.uid));
  useEffect(() => { setTerminalHotkeys(loadTerminalHotkeys(user?.uid)); }, [user?.uid]);
  const updateTerminalHotkeys = (value: TerminalHotkeyMap) => {
    const next = normalizeTerminalHotkeys(value);
    setTerminalHotkeys(next);
    saveTerminalHotkeys(user?.uid, next);
  };
  const [showTradingSessions, setShowTradingSessions] = useState(false);
  const clockButtonRef = useRef<HTMLButtonElement>(null);
  const presetsButtonRef = useRef<HTMLButtonElement>(null);
  const presetsMenuRef = useRef<HTMLDivElement>(null);
  const [presetsMenuPosition, setPresetsMenuPosition] = useState<React.CSSProperties>({});
  const [marketSnapshot, setMarketSnapshot] = useState<MarketCoinSnapshot>({ coins: [], timestamp: null, warning: null });
  const [marketLoading, setMarketLoading] = useState(true);
  // No loading-state flash on 30s refreshes; only initial market fetch needs it.
  const marketSnapshotLoadedRef = useRef(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const marketCoins = marketSnapshot.coins;
  // Preset pagination must never hide a chart the trader added manually:
  // choosing 4 preset charts, then pressing +, shows five live chart blocks.
  // Removing any block immediately shows the remaining ones without refill.
  // Automatic market presets retain their configured pagination; imported
  // legacy workspaces above 50 charts retain the 50-chart safety page cap.
  const isAutomaticMarketSelection = Boolean(activeMarketPreset && presetMatches.length > 0);
  const workspacePageSize = resolveTerminalWorkspacePageSize(
    config.coinPresetLimit, blocks.length, isAutomaticMarketSelection,
  );
  const [workspacePage, setWorkspacePage] = useState(0);
  const workspacePageCount = Math.max(1, Math.ceil(blocks.length / workspacePageSize));
  const visibleWorkspacePage = Math.max(0, Math.min(workspacePage, workspacePageCount - 1));
  const visibleWorkspaceStart = visibleWorkspacePage * workspacePageSize;
  const visibleWorkspaceBlocks = useMemo(() => blocks.slice(
    visibleWorkspaceStart, visibleWorkspaceStart + workspacePageSize,
  ), [blocks, visibleWorkspaceStart, workspacePageSize]);
  // Count chart panels actually mounted on this workspace page, not hidden legacy pages.
  const terminalCoinCount = visibleWorkspaceBlocks.length;
  // All alerts belong to this Terminal instance. No persistent notification
  // writes, server jobs or per-card React state updates for incoming ticks.
  const [terminalAlertItems, setTerminalAlertItems] = useState<TerminalLiveAlert[]>([]);
  const [terminalAlertStatus, setTerminalAlertStatus] = useState<string | null>(null);
  const terminalAlertCopy = terminalAnalysisText(language);
  const terminalAnalysisLimit = resolveTerminalPresetPageSize(config.coinPresetLimit);
  const terminalAnalysisCanRun = terminalAnalysisAllowed(terminalAnalysisLimit, visibleWorkspaceBlocks.length);
  const terminalAlertsEnabled = config.terminalMarketAlerts === true && terminalAnalysisCanRun;
  const onTerminalLiveAlert = useCallback((alert: TerminalLiveAlert) => {
    setTerminalAlertItems(current => [alert, ...current.filter(item => item.scope !== alert.scope || item.key !== alert.key)].slice(0, 3));
  }, []);
  const dismissTerminalLiveAlert = useCallback((id: string) => {
    setTerminalAlertItems(current => current.filter(alert => alert.id !== id));
  }, []);
  const clearTerminalAlertItems = useCallback(() => {
    setTerminalAlertItems(current => current.length ? [] : current);
  }, []);
  const onTerminalAnalysisError = useCallback(() => {
    setConfig(current => ({ ...current, terminalMarketAlerts: false }));
    setTerminalAlertStatus(terminalAnalysisText(language).failed);
  }, [setConfig, language]);
  useTerminalLiveAlerts(terminalAlertsEnabled, visibleWorkspaceBlocks, onTerminalLiveAlert,
    { configuredLimit: terminalAnalysisLimit, owner: user?.uid ?? 'guest', onError: onTerminalAnalysisError, onHide: clearTerminalAlertItems });
  useEffect(() => { if (!terminalAlertsEnabled) clearTerminalAlertItems(); }, [terminalAlertsEnabled, clearTerminalAlertItems]);
  useEffect(() => {
    if (config.terminalMarketAlerts !== true || terminalAnalysisCanRun) return;
    setConfig(current => ({ ...current, terminalMarketAlerts: false }));
    setTerminalAlertStatus(terminalAnalysisText(language).stopped);
  }, [config.terminalMarketAlerts, terminalAnalysisCanRun, setConfig, language]);
  useEffect(() => {
    if (!terminalAlertStatus) return;
    const timer = window.setTimeout(() => setTerminalAlertStatus(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [terminalAlertStatus]);
  // A second chart may still show the same market after the original target closes.
  useEffect(() => {
    setTerminalAlertItems(current => {
      if (!current.length) return current;
      const openMarkets = new Set(visibleWorkspaceBlocks.map(analysisMarketKey));
      const next = current.filter(alert => openMarkets.has(alert.scope));
      return next.length === current.length ? current : next;
    });
  }, [visibleWorkspaceBlocks]);
  // An on-demand request, not a live-scale subscription: also reaches lazy Terminal charts.
  const [terminalFitAllRequest, setTerminalFitAllRequest] = useState(0);
  // Saved fit-history mode is reapplied once on Terminal mount/hydration.
  // A single version reaches mounted and lazy charts, without new WS streams.
  useEffect(() => {
    setTerminalFitAllRequest(version => config.initialChartFitAll === true
      ? (version > 0 ? version : 1) : 0);
  }, [config.initialChartFitAll]);
  // Persist Terminal-only display controls in the per-account workspace,
  // never in shared browser keys (which leaked settings between accounts).
  const autoScaleCharts = config.autoScaleCharts === true;
  const setAutoScaleCharts = useCallback((update: React.SetStateAction<boolean>) => {
    setConfig(current => {
      const value = typeof update === 'function' ? update(current.autoScaleCharts === true) : update;
      return current.autoScaleCharts === value ? current : { ...current, autoScaleCharts: value };
    });
  }, [setConfig]);

  // This is a display-paint setting, not an exchange update interval.
  const terminalRefreshMs = normalizeTerminalChartRefreshMs(config.terminalRefreshMs);
  const setTerminalRefreshMs = useCallback((value: TerminalChartRefreshMs) => {
    setConfig(current => current.terminalRefreshMs === value
      ? current : { ...current, terminalRefreshMs: value });
  }, [setConfig]);

  const presetAutoUpdate = config.presetAutoUpdate !== false;
  const setPresetAutoUpdate = useCallback((value: boolean) => {
    setConfig(current => current.presetAutoUpdate === value
      ? current : { ...current, presetAutoUpdate: value });
  }, [setConfig]);

  const terminalEcoMode = config.terminalEcoMode === true;
  const setTerminalEcoMode = useCallback((update: React.SetStateAction<boolean>) => {
    setConfig(current => {
      const value = typeof update === 'function' ? update(current.terminalEcoMode === true) : update;
      return current.terminalEcoMode === value ? current : { ...current, terminalEcoMode: value };
    });
  }, [setConfig]);

  // A closed coin picker with no live auto-preset needs market metadata less
  // frequently. Active candle feeds are independent and NEVER throttled here.
  const marketRefreshDemandRef = useRef(false);
  marketRefreshDemandRef.current = showCoinPresets || (presetAutoUpdate && activeMarketPreset !== null);
  const requestMarketRefreshRef = useRef<((force?: boolean) => void) | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    let lastRequestAt = 0;
    const load = async (force = false) => {
      // A background Terminal tab must not keep polling every exchange.
      // Also avoid a double refresh when visibilitychange and the timer coincide.
      if (busy || controller.signal.aborted || document.visibilityState === 'hidden') return;
      const now = Date.now();
      const minGap = force ? 10_000 : marketRefreshDemandRef.current ? 25_000 : 55_000;
      if (now - lastRequestAt < minGap) return;
      lastRequestAt = now;
      busy = true;
      if (!marketSnapshotLoadedRef.current) setMarketLoading(true);
      try {
        const next = await loadMarketCoins({ exchange: 'all', marketType: 'all' }, controller.signal);
        if (controller.signal.aborted) return;
        marketSnapshotLoadedRef.current = true;
        setMarketSnapshot(next);
        setMarketError(null);
      } catch (cause) {
        if (!controller.signal.aborted) setMarketError(cause instanceof Error ? cause.message : t('terminal.market.loadError'));
      } finally {
        busy = false;
        if (!controller.signal.aborted) setMarketLoading(false);
      }
    };
    requestMarketRefreshRef.current = force => { void load(force); };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    void load();
    // In Desktop, all windows share a two-second public quote cache. A regular
    // setInterval starts from each window's open time, making six independent
    // 30s requests miss that cache. Align only this public-list refresh to the
    // same wall-clock boundary in every Desktop pane. Live HookChart sockets
    // and the ordinary browser's cadence are left unchanged.
    const desktop = new URLSearchParams(window.location.search).get('h00kDesktop') === '1';
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ordinaryTimer: ReturnType<typeof setInterval> | undefined;
    if (desktop) {
      const tick = () => {
        void load();
        timer = setTimeout(tick, nextTerminalMarketRefreshDelay(Date.now(), true));
      };
      timer = setTimeout(tick, nextTerminalMarketRefreshDelay(Date.now(), true));
    } else {
      ordinaryTimer = setInterval(() => { void load(); }, 30_000);
    }
    return () => {
      requestMarketRefreshRef.current = null;
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
      if (ordinaryTimer !== undefined) clearInterval(ordinaryTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    // Reopen the coin picker or enable an auto-updating preset without waiting
    // for the next relaxed background refresh.
    if (showCoinPresets || (presetAutoUpdate && activeMarketPreset)) requestMarketRefreshRef.current?.(true);
  }, [showCoinPresets, activeMarketPreset, presetAutoUpdate]);

  const coinPresetSelection = useMemo(() => ({
    exchange: config.coinPresetExchange ?? preferences.defaultExchange,
    marketType: config.coinPresetMarketType ?? preferences.defaultMarketType,
  }), [config.coinPresetExchange, config.coinPresetMarketType, preferences.defaultExchange, preferences.defaultMarketType]);
  const coinPresetLimit = resolveTerminalPresetPageSize(config.coinPresetLimit);
  const visiblePresetPage = useMemo(() => getTerminalPresetPage(presetMatches, presetPage, coinPresetLimit),
    [presetMatches, presetPage, coinPresetLimit]);
  const coins = useMemo(() => {
    if (!marketCoins.length) return formationCoins;
    const formations = new Map(formationCoins.map(coin => [coinMarketKey(coin), coin]));
    return marketCoins.map(coin => ({
      ...formations.get(coinMarketKey(coin)), ...coin,
      currentPrice: coin.price, priceChange24h: coin.change24h, volume24hUsd: coin.volumeUsd,
      highPrice24h: coin.high24h, lowPrice24h: coin.low24h,
      formations: formations.get(coinMarketKey(coin))?.formations || [],
      // Preserve market-data provenance. Rebuilding a coin card is not a fresh
      // exchange update and must not turn an old quote into a current one.
      timeframe: preferences.defaultTimeframe, lastUpdated: marketSnapshot.timestamp ?? 0,
    } as ScannedCoin));
  }, [marketCoins, marketSnapshot.timestamp, formationCoins, preferences.defaultTimeframe]);
  // Closed coin switchers do not subscribe to catalog refreshes. The store
  // wakes only open switchers, so search results remain fresh without
  // triggering a render of all chart cards.
  const coinPickerStore = useMemo(() => createTerminalCoinPickerStore<ScannedCoin>(), []);
  useEffect(() => { coinPickerStore.set(coins); }, [coinPickerStore, coins]);
  const getCoinsForPicker = coinPickerStore.get;
  const subscribeCoinsForPicker = coinPickerStore.subscribe;
  // Any manual edit stops the automatic selection from restoring a removed chart.
  const setBlocks: typeof updateBlocks = useCallback(update => {
    setActiveMarketPreset(null);
    setPresetMatches([]);
    presetPageRef.current = 0;
    setPresetPage(0);
    updateBlocks(update);
  }, [updateBlocks]);

  // Active coin for single-chart full view (matching FullscreenChartModal)
  const [activeCoin, setActiveCoin] = useState<ScannedCoin>(() => {
    const firstBlock = blocks[0];
    const found = coins.find((c) => firstBlock && coinMarketKey(c) === coinMarketKey(firstBlock));
    if (found) return found;
    return {
      symbol: firstBlock?.symbol || 'BTCUSDT',
      baseAsset: firstBlock?.baseAsset || 'BTC',
      quoteAsset: firstBlock?.quoteAsset || 'USDT',
      exchange: firstBlock?.exchange || ('binance' as ExchangeId),
      marketType: firstBlock?.marketType || ('futures' as MarketType),
      currentPrice: 0,
      priceChange24h: 0,
      formations: [],
    } as unknown as ScannedCoin;
  });

  // Saved presets also work for a coin whose live quote is temporarily unavailable.
  useEffect(() => {
    const firstBlock = blocks[0];
    if (!firstBlock) return;
    const match = coins.find(coin => coinMarketKey(coin) === coinMarketKey(firstBlock));
    setActiveCoin(current => match || (coinMarketKey(current) === coinMarketKey(firstBlock) ? current : {
      ...firstBlock, currentPrice: 0, priceChange24h: 0, highPrice24h: 0, lowPrice24h: 0,
      volume24hUsd: 0, formations: [], lastUpdated: 0, exchangeUrl: '',
    }));
  }, [coins, blocks]);

  const [timeframe, setTimeframe] = useState<Timeframe>(() =>
    config.globalTimeframe || getStoredPreferences().defaultTimeframe);
  // A saved one-chart block may use a different timeframe from the global selector.
  const activeTimeframe = blocks.length === 1 ? blocks[0].timeframe : timeframe;

  useEffect(() => {
    // The versioned Terminal workspace can hydrate after first render.
    // An explicit saved global timeframe wins over profile defaults, without
    // rewriting existing blocks or triggering market-data requests.
    setTimeframe(config.globalTimeframe || preferences.defaultTimeframe);
  }, [preferences.defaultTimeframe, config.globalTimeframe]);
  const [isFavoritesDrawerOpen, setIsFavoritesDrawerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Modal / Drawer state for multi-chart mode
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  // Null = add a new chart; a chart id = replace only that panel's coin.
  const [replaceBlockId, setReplaceBlockId] = useState<string | null>(null);
  const handleOpenCoinSelector = useCallback((blockId: string) => {
    setReplaceBlockId(blockId);
    setIsAddModalOpen(true);
  }, []);
  const handleCloseChartPicker = useCallback(() => {
    setIsAddModalOpen(false);
    setReplaceBlockId(null);
  }, []);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [maximizedBlockId, setMaximizedBlockId] = useState<string | null>(null);
  const focusTerminalAlertBlock = useCallback((alert: TerminalLiveAlert) => {
    const target = terminalNoticeChart(visibleWorkspaceBlocks, alert.scope, alert);
    const list = chartListRef.current;
    if (!target || !list) return;
    if (maximizedBlockId) setMaximizedBlockId(target.id);
    requestAnimationFrame(() => {
      if (!list.isConnected) return;
      const block = [...list.querySelectorAll<HTMLElement>('[data-terminal-block-id]')]
        .find(node => node.dataset.terminalBlockId === target.id) ?? (blocks.length === 1 ? list.firstElementChild : null);
      block?.querySelector<HTMLElement>('canvas[tabindex="0"]')?.focus({ preventScroll: true });
      if (!maximizedBlockId) block?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [maximizedBlockId, visibleWorkspaceBlocks, blocks.length]);
  useEffect(() => {
    // Market preset refreshes must not collapse the user's enlarged chart.
    // Clear it only if that particular block no longer exists.
    if (maximizedBlockId !== null && !blocks.some(block => block.id === maximizedBlockId)) {
      setMaximizedBlockId(null);
    }
  }, [maximizedBlockId, blocks]);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const draggedBlockIndexRef = useRef<number | null>(null);

  const [localWatchlist, setLocalWatchlist] = useState<string[]>(() => [...new Set(watchlist)]);
  useEffect(() => { setLocalWatchlist([...new Set(watchlist)]); }, [watchlist]);

  // Browser fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsBrowserFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!showCoinPresets) return;
    presetsMenuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
  }, [showCoinPresets]);

  useLayoutEffect(() => {
    if (!showCoinPresets) return;
    const positionMenu = () => {
      const anchor = presetsButtonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const margin = 12;
      const width = Math.min(360, Math.max(0, window.innerWidth - margin * 2));
      const headerBottom = presetsButtonRef.current?.closest('header')?.getBoundingClientRect().bottom ?? anchor.bottom;
      const top = headerBottom + 6;
      const left = (window.innerWidth - width) / 2;
      setPresetsMenuPosition({ top, left, width, maxHeight: Math.max(0, window.innerHeight - top - margin) });
    };
    const dismissOutside = (event: Event) => {
      const target = event.target as Node | null;
      if (target && !presetsMenuRef.current?.contains(target) && !presetsButtonRef.current?.contains(target)) {
        setShowCoinPresets(false);
        if (event.type === 'pointerdown') presetsButtonRef.current?.focus();
      }
    };
    const repositionOnScroll = (event: Event) => {
      if (event.target === window || !presetsMenuRef.current?.contains(event.target as Node)) positionMenu();
    };
    const dismissOnWindowBlur = () => setShowCoinPresets(false);
    positionMenu();
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', repositionOnScroll, true);
    window.addEventListener('blur', dismissOnWindowBlur);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', repositionOnScroll, true);
      window.removeEventListener('blur', dismissOnWindowBlur);
    };
  }, [showCoinPresets, terminalCoinCount]);

  const closePresetsMenu = useCallback(() => {
    setShowCoinPresets(false);
    presetsButtonRef.current?.focus();
  }, []);

  const handlePresetsMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePresetsMenu();
    }
  };

  // Handle Escape key to close the presets menu, drawer or return to screener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const editing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]');
      if (e.key === 'Escape') {
        if (showHotkeys) {
          e.preventDefault(); setShowHotkeys(false); return;
        }
        if (showTradingSessions) {
          e.preventDefault(); setShowTradingSessions(false); clockButtonRef.current?.focus(); return;
        }
        if (showCoinPresets) {
          e.preventDefault(); closePresetsMenu(); return;
        }
        if (isFavoritesDrawerOpen) {
          e.preventDefault(); setIsFavoritesDrawerOpen(false); return;
        }
      }
      // A nested modal/drawer owns Escape; never navigate away while it is open.
      // This also protects dialogs portaled outside the Terminal DOM subtree.
      const modalTarget = e.target instanceof Element &&
        e.target.closest('[role="dialog"], [aria-modal="true"]');
      if (isSettingsOpen || isAddModalOpen || modalTarget) return;
      if (!editing && terminalShortcutAction(e, terminalHotkeys) === 'exitTerminal' && onReturnToPatterns) {
        e.preventDefault();
        onReturnToPatterns();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHotkeys, showTradingSessions, showCoinPresets, closePresetsMenu, isFavoritesDrawerOpen,
      isSettingsOpen, isAddModalOpen, onReturnToPatterns, terminalHotkeys]);

  const toggleBrowserFullscreen = () => {
    toggleFullscreenSafe();
  };

  // Use exact saved exchange + market identities, including favorites whose
  // quote is absent from a partial market snapshot. Never fabricate a symbol
  // from the old `exchange:market:symbol` key.
  const favoriteCoins = useMemo(() => resolveWatchlistEntries(localWatchlist, coins)
    .map(entry => entry.coin ?? watchlistEntryToChartCoin(entry, timeframe)),
    [coins, localWatchlist, timeframe]);
  const filteredFavorites = useMemo(() => {
    if (!searchQuery.trim()) return favoriteCoins;
    const q = searchQuery.toLowerCase().trim();
    return favoriteCoins.filter(
      (c) =>
        c.symbol.toLowerCase().includes(q) ||
        c.baseAsset.toLowerCase().includes(q)
    );
  }, [favoriteCoins, searchQuery]);

  const handleRemoveFromWatchlist = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalWatchlist((prev) => {
      const next = prev.filter((s) => getCoinWatchlistKey(s) !== sym);
      return next;
    });
    onToggleWatchlist?.(sym);
  };

  const handleSelectFavoriteCoin = (favCoin: ScannedCoin) => {
    setIsFavoritesDrawerOpen(false);
    if (blocks.length === 1) {
      setActiveCoin(favCoin);


      // Preserve the existing chart identity, timeframe, span, and drawing
      // preferences when switching the sole chart to a favorite instrument.
      setBlocks(previous => previous.map(block => ({
        ...block, symbol: favCoin.symbol, baseAsset: favCoin.baseAsset, quoteAsset: favCoin.quoteAsset,
        exchange: favCoin.exchange, marketType: favCoin.marketType,
        formationId: favCoin.formations?.[0]?.id,
      })));
      return;
    }
    // In a grid, changing activeCoin alone has no visible effect. Reopen an
    // existing matching chart or add the favorite without replacing other rows.
    const alreadyOpen = blocks.find(block => coinMarketKey(block) === coinMarketKey(favCoin));
    if (alreadyOpen) {
      const blockIndex = blocks.findIndex(block => block.id === alreadyOpen.id);
      setWorkspacePage(Math.floor(blockIndex / workspacePageSize));
      setMaximizedBlockId(alreadyOpen.id);
      return;
    }
    if (blocks.length >= MAX_TERMINAL_CHARTS) {
      setIsAddModalOpen(true); // Explains the limit rather than silently doing nothing.
      return;
    }
    const nextBlock: TerminalChartBlock = {
      id: `favorite-${favCoin.symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      symbol: favCoin.symbol, baseAsset: favCoin.baseAsset, quoteAsset: favCoin.quoteAsset,
      exchange: favCoin.exchange, marketType: favCoin.marketType, timeframe,
      formationId: favCoin.formations?.[0]?.id, colSpan: 1,
    };
    setBlocks(previous => previous.length >= MAX_TERMINAL_CHARTS ? previous : [...previous, nextBlock]);
  };

  // Block management
  const handleAddChart = (coin: MarketCoin | ScannedCoin | Pick<TerminalChartBlock, 'symbol' | 'baseAsset' | 'quoteAsset' | 'exchange' | 'marketType'>, tf: Timeframe, formationId?: string) => {
    const { symbol, quoteAsset: quote } = normalizeTerminalMarketPair(coin.symbol, coin.quoteAsset);
    const base = coin.baseAsset || symbol.slice(0, -quote.length);
    const exchange = coin.exchange || 'binance';
    const marketType = coin.marketType || 'futures';

    if (replaceBlockId !== null) {
      // Reuse the existing chart id/layout/settings. Replacing is also allowed
      // at the 50-chart limit and must not add another live chart or feed.
      setBlocks(previous => previous.map(block => block.id !== replaceBlockId ? block : {
        ...block,
        symbol,
        baseAsset: base,
        quoteAsset: quote,
        exchange,
        marketType,
        timeframe: tf || block.timeframe,
        formationId,
      }));
      return;
    }

    const newBlock: TerminalChartBlock = {
      // Rapidly adding the same symbol must never reuse a React chart key.
      id: `block-${symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      symbol,
      baseAsset: base,
      quoteAsset: quote,
      exchange,
      marketType,
      // New charts inherit the account default only when the Terminal has no
      // explicit global-timeframe selection. Never rewrite existing blocks.
      timeframe: tf || config.globalTimeframe || preferences.defaultTimeframe,
      formationId,
      colSpan: 1,
    };
    // At most 50 simultaneous live charts. Guard inside the updater as well:
    // two rapid click events must not exceed the limit before React rerenders.
    if (blocks.length >= MAX_TERMINAL_CHARTS) return;
    setBlocks((prev) => prev.length >= MAX_TERMINAL_CHARTS ? prev : [...prev, newBlock]);
  };

  const handleUpdateBlock = useCallback((blockId: string, updated: Partial<TerminalChartBlock>) => {
    setBlocks(previous => previous.map(block => {
      if (block.id !== blockId) return block;
      // Preserve object identity when a control repeats its current value.
      if ((Object.keys(updated) as Array<keyof TerminalChartBlock>)
        .every(key => Object.is(block[key], updated[key]))) return block;
      return { ...block, ...updated };
    }));
  }, [setBlocks]);

  const handleRemoveBlock = useCallback((blockId: string) => {
    setBlocks(previous => previous.filter(block => block.id !== blockId));
    setMaximizedBlockId(previous => previous === blockId ? null : previous);
  }, [setBlocks]);

  const handleToggleBlockMaximize = useCallback((blockId: string) => {
    setMaximizedBlockId(previous => previous === blockId ? null : blockId);
  }, []);

  const handleDragStart = useCallback((index: number) => {
    // Drag bookkeeping should not rerender every live chart in the grid.
    draggedBlockIndexRef.current = index;
  }, []);
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);
  const handleDrop = useCallback((targetIndex: number) => {
    const sourceIndex = draggedBlockIndexRef.current;
    draggedBlockIndexRef.current = null;
    if (sourceIndex === null || sourceIndex === targetIndex) return;
    setBlocks(previous => {
      if (sourceIndex < 0 || sourceIndex >= previous.length ||
        targetIndex < 0 || targetIndex >= previous.length) return previous;
      const updated = [...previous];
      const [moved] = updated.splice(sourceIndex, 1);
      updated.splice(targetIndex, 0, moved);
      return updated;
    });
  }, [setBlocks]);

  const handleApplyGlobalTimeframe = (tf: Timeframe) => {
    // HookChart reads its real timeframe from each chart block.
    setTimeframe(tf);
    updateBlocks(previous => applyTerminalTimeframe(previous, tf));
    setConfig(previous => previous.globalTimeframe === tf
      ? previous : { ...previous, globalTimeframe: tf });
    // Keep instrument, preset, drawings, chart sizes and current page intact.
  };

  const handleApplyPreset = (presetKey: 'focus_btc' | 'top_3' | 'top_4_patterns' | 'grid_4') => {
    if (presetKey === 'focus_btc') {
      const btc = coins.find((c) => c.symbol === 'BTCUSDT') || {
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        exchange: 'binance' as ExchangeId,
        marketType: 'futures' as MarketType,
      };
      setBlocks([
        {
          id: `block-btc-${Date.now()}`,
          symbol: btc.symbol,
          baseAsset: btc.baseAsset,
          quoteAsset: btc.quoteAsset,
          exchange: btc.exchange,
          marketType: btc.marketType,
          timeframe: '15m',
          colSpan: 'full',
        },
      ]);
      setConfig((prev) => ({ ...prev, layoutPreset: '1x1', columns: 1, autoFitScreen: true }));
    } else if (presetKey === 'top_3') {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
      const newBlocks = symbols.map((sym, i) => {
        const c = coins.find((coin) => coin.symbol === sym) || {
          symbol: sym,
          baseAsset: sym.replace('USDT', ''),
          quoteAsset: 'USDT',
          exchange: 'binance' as ExchangeId,
          marketType: 'futures' as MarketType,
        };
        return {
          id: `block-${sym}-${Date.now()}-${i}`,
          symbol: c.symbol,
          baseAsset: c.baseAsset,
          quoteAsset: c.quoteAsset,
          exchange: c.exchange,
          marketType: c.marketType,
          timeframe: '15m' as Timeframe,
          colSpan: (i === 0 ? 2 : 1) as any,
        };
      });
      setBlocks(newBlocks);
      setConfig((prev) => ({ ...prev, layoutPreset: 'custom', columns: 2, freeLayoutAutoColumns: false, autoFitScreen: true }));
    } else if (presetKey === 'grid_4') {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'SUIUSDT'];
      const newBlocks = symbols.map((sym, i) => {
        const c = coins.find((coin) => coin.symbol === sym) || {
          symbol: sym,
          baseAsset: sym.replace('USDT', ''),
          quoteAsset: 'USDT',
          exchange: 'binance' as ExchangeId,
          marketType: 'futures' as MarketType,
        };
        return {
          id: `block-${sym}-${Date.now()}-${i}`,
          symbol: c.symbol,
          baseAsset: c.baseAsset,
          quoteAsset: c.quoteAsset,
          exchange: c.exchange,
          marketType: c.marketType,
          timeframe: '15m' as Timeframe,
          colSpan: 1 as const,
        };
      });
      setBlocks(newBlocks);
      setConfig((prev) => ({ ...prev, layoutPreset: '2x2', columns: 2, autoFitScreen: true }));
    } else if (presetKey === 'top_4_patterns') {
      const coinsWithPatterns = coins
        .filter((c) => c.formations && c.formations.length > 0)
        .slice(0, 4);

      if (coinsWithPatterns.length > 0) {
        const newBlocks = coinsWithPatterns.map((c, i) => ({
          id: `block-pattern-${c.symbol}-${Date.now()}-${i}`,
          symbol: c.symbol,
          baseAsset: c.baseAsset,
          quoteAsset: c.quoteAsset,
          exchange: c.exchange,
          marketType: c.marketType,
          timeframe: c.timeframe || '15m',
          formationId: c.formations[0]?.id,
          colSpan: 1 as const,
        }));
        setBlocks(newBlocks);
        setConfig((prev) => ({ ...prev, layoutPreset: '2x2', columns: 2, autoFitScreen: true }));
      }
    }
  };

  const applyPresetPage = useCallback((selected: MarketCoin[], requestedPage: number, pageSize = coinPresetLimit) => {
    if (!selected.length) return;
    const { page, coins: pageCoins } = getTerminalPresetPage(selected, requestedPage, pageSize);
    presetPageRef.current = page;
    setPresetPage(page);
    updateBlocks(current => blocksForMarketPreset(current, pageCoins, timeframe));
    setConfig(current => {
      // Market preset pagination changes coin membership, never a trader's
      // explicitly selected grid or column count. Only adjust the fallback
      // column preference while Free auto-layout is already selected.
      if (current.layoutPreset !== 'custom' || current.freeLayoutAutoColumns === false) return current;
      const columns = pageCoins.length === 1 ? 1 : pageCoins.length <= 4 ? 2 : pageCoins.length <= 9 ? 3 : 4;
      return current.columns === columns ? current : { ...current, columns };
    });
  }, [updateBlocks, setConfig, timeframe, coinPresetLimit]);

  const handleWorkspaceConfigUpdate = useCallback((updated: Partial<TerminalWorkspaceConfig>) => {
    if (updated.showClock === false) setShowTradingSessions(false);
    // A custom startup profile must cancel a previously saved fit-history
    // request so switching symbols/TF does not silently override the user's edit.
    if (updated.initialChartFitAll === false) setTerminalFitAllRequest(0);
    if (Object.prototype.hasOwnProperty.call(updated, 'initialChartFitAll'))
      requestImmediateWorkspaceSync();
    if (updated.coinPresetLimit === undefined) {
      setConfig(current => ({ ...current, ...updated }));
      return;
    }

    const nextLimit = resolveTerminalPresetPageSize(updated.coinPresetLimit);
    const nextPage = pageAfterLimitChange(presetPageRef.current, coinPresetLimit, nextLimit);
    presetPageRef.current = nextPage;
    // Manual and personal presets keep all their charts visible up to 50.
    // Automatic presets and older oversized imports retain pagination.
    setWorkspacePage(current => pageAfterLimitChange(current, workspacePageSize, nextLimit));
    setMaximizedBlockId(null);
    if (activeMarketPreset && presetMatches.length) {
      // Auto market presets already page live matches; update their slice now.
      applyPresetPage(presetMatches, nextPage, nextLimit);
    }
    chartListRef.current?.scrollTo({ top: 0 });
    setConfig(current => ({ ...current, ...updated, coinPresetLimit: nextLimit }));
  }, [activeMarketPreset, presetMatches, coinPresetLimit, workspacePageSize, applyPresetPage, setConfig, requestImmediateWorkspaceSync]);

  const handleDoneWorkspaceSettings = useCallback(() => {
    // All settings control the same per-user workspace. "Done" immediately
    // commits the latest batched edits instead of waiting on the normal 1.2s
    // debounce; a new committed revision also retries a previous failed save.
    requestImmediateWorkspaceSync();
    setConfig(current => ({ ...current }));
    setIsSettingsOpen(false);
  }, [requestImmediateWorkspaceSync, setConfig]);

  // Terminal is fixed to the viewport; scroll its chart grid, not the document.
  const scrollTerminalChartsTo = (edge: 'top' | 'bottom') => {
    const grid = chartListRef.current;
    if (!grid) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    grid.scrollTo({
      top: edge === 'top' ? 0 : grid.scrollHeight,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  };

  const goToPresetPage = useCallback((nextPage: number) => {
    applyPresetPage(presetMatches, nextPage);
    chartListRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [applyPresetPage, presetMatches]);

  const handleApplyMarketCoins = useCallback((selected: MarketCoin[]) => {
    if (!selected.length) return;
    // Each 30s market refresh creates new quote objects even if the ordered
    // instrument list is unchanged. Keep the previous ranking identity so
    // the pagination effect doesn't redundantly apply the same page twice.
    setPresetMatches(current => current.length === selected.length
      && current.every((coin, index) => coinMarketKey(coin) === coinMarketKey(selected[index]))
      ? current : selected);
    applyPresetPage(selected, presetPageRef.current);
  }, [applyPresetPage]);

  const handleActiveMarketPresetChange = useCallback((preset: TerminalMarketPreset | null) => {
    presetPageRef.current = 0;
    setPresetPage(0);
    setActiveMarketPreset(preset);
    if (!preset) setPresetMatches([]);
  }, []);

  // Changing the number of charts per page also updates the displayed slice.
  useEffect(() => {
    if (activeMarketPreset && presetMatches.length) applyPresetPage(presetMatches, presetPageRef.current);
  }, [activeMarketPreset, presetMatches, applyPresetPage]);

  const handleImportWorkspaceBackup = useCallback((json: string) => {
    const imported = importWorkspaceBackup(json);
    if (imported) {
      // A live automatic market preset must not immediately replace restored charts.
      setActiveMarketPreset(null);
      setPresetMatches([]);
      presetPageRef.current = 0;
      setPresetPage(0);
      setWorkspacePage(0);
      setMaximizedBlockId(null);
    }
    return imported;
  }, [importWorkspaceBackup]);

  const handleSaveCoinPreset = (name: string, selected: TerminalChartBlock[]) => {
    const preset: TerminalSavedPreset = {
      id: `preset-${crypto.randomUUID()}`, name, blocks: selected.map(block => ({ ...block })),
      columns: config.columns, blockHeight: config.blockHeight, createdAt: Date.now(),
    };
    // Explicit Save should sync to the account without the normal 1.2s edit debounce.
    requestImmediateWorkspaceSync();
    setCustomPresets(current => [...current, preset]);
  };

  const handleLoadCoinPreset = (preset: TerminalSavedPreset) => {
    // Restore the preset's exact instruments and per-chart timeframes, even
    // when the live coin catalog has not loaded yet. Repair legacy duplicate
    // React IDs and refuse an empty/corrupt preset instead of clearing charts.
    const restored = normalizeTerminalBlocks(preset.blocks).slice(0, MAX_TERMINAL_CHARTS);
    if (!restored.length) return;
    // The manual setBlocks wrapper also cancels the active auto market preset,
    // so its next quote refresh cannot overwrite the user's saved selection.
    requestImmediateWorkspaceSync();
    setBlocks(restored);
    setConfig(current => ({ ...current, columns: preset.columns, blockHeight: preset.blockHeight, layoutPreset: 'custom', freeLayoutAutoColumns: false }));
    setTimeframe(restored[0].timeframe);
    // A previously scrolled/paged workspace must start at the first preset coin.
    setWorkspacePage(0);
    setMaximizedBlockId(null);
    chartListRef.current?.scrollTo({ top: 0 });
  };

  const handleResetWorkspace = () => {
    setBlocks([]);
    setMaximizedBlockId(null);
  };

  // Index quotes once per refresh instead of searching thousands of coins for every chart.
  const coinsByMarket = useMemo(() => {
    const index = new Map<string, ScannedCoin>();
    for (const coin of coins) {
      const key = coinMarketKey(coin);
      if (!index.has(key)) index.set(key, coin);
    }
    return index;
  }, [coins]);
  const getCoinForBlock = useCallback(
    (block: TerminalChartBlock): ScannedCoin | undefined => coinsByMarket.get(coinMarketKey(block)),
    [coinsByMarket]
  );

  // Save only the captured chart's exact exchange/market/symbol/timeframe.
  // A manual snapshot has no synthetic entry, target, stop or quality score.
  const handleTerminalArchiveCapture = useCallback((
    block: TerminalChartBlock, sourceCoin: ScannedCoin | undefined,
    selectedFormation: DetectedFormation | null, capture: ArchiveChartCapture,
  ) => {
    if (savingTerminalArchive || pendingTerminalArchive) return;
    if (!user?.uid) { setTerminalArchiveFeedback(terminalArchiveCopy.signIn); return; }
    if (block.timeframe === '30s') { setTerminalArchiveFeedback(terminalArchiveCopy.thirty); return; }
    const snapshot = capture.chartSnapshot;
    if (!snapshot?.image || snapshot.marketKey !== archiveVisualMarketKey(
      block.exchange, block.marketType, block.symbol, block.timeframe
    ) || snapshot.timeframe !== block.timeframe) {
      setTerminalArchiveFeedback(terminalArchiveCopy.unavailable);
      return;
    }
    // Prefer the close captured from THIS chart's loaded candles, not the
    // potentially stale quote cache (or the neighboring Terminal card).
    const currentPrice = typeof capture.capturedPrice === 'number'
      && Number.isFinite(capture.capturedPrice) && capture.capturedPrice > 0
      ? capture.capturedPrice : sourceCoin?.currentPrice;
    if (typeof currentPrice !== 'number' || !Number.isFinite(currentPrice) || currentPrice <= 0) {
      setTerminalArchiveFeedback(terminalArchiveCopy.price);
      return;
    }
    const coin: ScannedCoin = {
      ...(sourceCoin || {
        priceChange24h: 0, highPrice24h: 0, lowPrice24h: 0, volume24hUsd: 0,
        formations: [], lastUpdated: 0, exchangeUrl: '',
      }),
      symbol: block.symbol, baseAsset: block.baseAsset, quoteAsset: block.quoteAsset,
      exchange: block.exchange, marketType: block.marketType,
      timeframe: block.timeframe, currentPrice,
    };
    setTerminalArchiveFeedback('');
    setPendingTerminalArchive({
      owner: user.uid, coin,
      formation: terminalArchiveFormation(selectedFormation, block.symbol, block.timeframe),
      capture, historyLimit: 1000,
    });
  }, [user?.uid, savingTerminalArchive, pendingTerminalArchive, terminalArchiveCopy]);

  const confirmTerminalArchive = async (entryReason: string) => {
    const pending = pendingTerminalArchive;
    if (!pending || savingTerminalArchive) return;
    if (!user?.uid || pending.owner !== user.uid) throw new Error(terminalArchiveCopy.signIn);
    setSavingTerminalArchive(true);
    try {
      await saveToArchive(pending.coin, pending.formation, {
        markers: pending.capture.markers,
        chartSnapshot: pending.capture.chartSnapshot,
        timeframe: pending.coin.timeframe,
        historyLimit: pending.historyLimit,
        currentPrice: pending.coin.currentPrice,
        entryReason,
      });
      setPendingTerminalArchive(null);
      setTerminalArchiveFeedback(terminalArchiveCopy.saved);
    } finally {
      setSavingTerminalArchive(false);
    }
  };

  const gridColsClass = useMemo(() => terminalGridColumnClasses(
    config.layoutPreset, config.columns, visibleWorkspaceBlocks.length,
    config.freeLayoutAutoColumns !== false,
  ), [config.layoutPreset, config.columns, config.freeLayoutAutoColumns, visibleWorkspaceBlocks.length]);

  // CSS owns the four breakpoint switches; chart/market data never rerenders
  // when the viewport changes. Account for full-width tiles when counting rows.
  const terminalAutoHeights = useMemo(
    () => terminalResponsiveAutoHeights(
      visibleWorkspaceBlocks, config.columns, config.layoutPreset,
      config.freeLayoutAutoColumns !== false,
    ),
    [visibleWorkspaceBlocks, config.columns, config.layoutPreset, config.freeLayoutAutoColumns],
  );
  const terminalHeightVariables = useMemo(() => ({
    '--terminal-height-mobile': terminalAutoHeights.mobile,
    '--terminal-height-tablet': terminalAutoHeights.tablet,
    '--terminal-height-desktop': terminalAutoHeights.desktop,
    '--terminal-height-wide': terminalAutoHeights.wide,
  } as React.CSSProperties), [terminalAutoHeights]);

  const computedHeightStyle = useMemo(() => {
    // First chart is large, with the normal draggable/resizable grid controls.
    // User-selected block.heightPx still has priority in TerminalChartWidget.
    if (visibleWorkspaceBlocks.length === 1) return 'var(--terminal-chart-height)';
    if (config.autoFitScreen) return 'var(--terminal-chart-height)';
    switch (config.blockHeight) {
      case 'compact': return '280px';
      case 'medium': return '380px';
      case 'large': return '500px';
      default: return '380px';
    }
  }, [visibleWorkspaceBlocks.length, config.autoFitScreen, config.blockHeight]);

  // Header shortcuts have a unique target only when the Terminal displays one
  // chart and its loaded instrument matches that chart. Grid cards carry their
  // own explicit coin actions, so never silently target the first grid coin.
  const hasHeaderTarget = blocks.length === 1 && coinMarketKey(activeCoin) === coinMarketKey(blocks[0]);
  const formation = activeCoin.formations?.[0] || null;
  const isBullish = formation?.bias === 'bullish';
  const isBearish = formation?.bias === 'bearish';
  // Only automatic market presets and legacy imports above 50 need paging.
  const isPresetPaged = isAutomaticMarketSelection;
  const hasTerminalPages = isPresetPaged
    ? visiblePresetPage.pageCount > 1
    : workspacePageCount > 1;
  const canGoBack = isPresetPaged
    ? visiblePresetPage.page > 0
    : visibleWorkspacePage > 0;
  const canGoForward = isPresetPaged
    ? visiblePresetPage.page + 1 < visiblePresetPage.pageCount
    : visibleWorkspacePage + 1 < workspacePageCount;
  const foundCoinCount = activeMarketPreset ? presetMatches.length : marketCoins.length;
  const changeTerminalPage = (direction: -1 | 1) => {
    if (isPresetPaged) {
      goToPresetPage(visiblePresetPage.page + direction);
      return;
    }
    if (workspacePageCount <= 1) return;
    setWorkspacePage(current => Math.max(0, Math.min(workspacePageCount - 1, current + direction)));
    setMaximizedBlockId(null);
    chartListRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // HookChart dispatches some legacy navigation hotkeys as document events.
  // Target the actual focused chart block, never an arbitrary coin in a grid.
  useEffect(() => {
    const onChartHotkey = (event: Event) => {
      const detail = (event as CustomEvent<{
        action: string; symbol: string; exchange: ExchangeId;
        marketType: MarketType; timeframe: Timeframe;
      }>).detail;
      if (!detail?.action || showHotkeys || isSettingsOpen || isAddModalOpen) return;
      const focused = document.activeElement instanceof Element
        ? document.activeElement.closest('[data-terminal-block-id]') : null;
      if (!focused?.closest('[data-terminal-page]')) return;
      const blockId = focused.getAttribute('data-terminal-block-id');
      const blockIndex = visibleWorkspaceBlocks.findIndex(item => item.id === blockId);
      const block = visibleWorkspaceBlocks[blockIndex];
      if (!block || block.symbol !== detail.symbol ||
          block.exchange !== detail.exchange || block.marketType !== detail.marketType) return;
      if (detail.action === 'toggleFavorites') {
        setIsFavoritesDrawerOpen(current => !current);
      } else if (detail.action === 'openMetaScalp') {
        const coin = getCoinForBlock(block);
        if (coin && onSendMetaScalp) stableSendMetaScalp(coin);
      } else if (detail.action === 'deleteCoin') {
        handleRemoveBlock(block.id);
      } else if (detail.action === 'prevChart' || detail.action === 'nextChart') {
        const nextIndex = Math.max(0, Math.min(visibleWorkspaceBlocks.length - 1,
          blockIndex + (detail.action === 'nextChart' ? 1 : -1)));
        const nextId = visibleWorkspaceBlocks[nextIndex]?.id;
        if (nextId && !maximizedBlockId) {
          const node = Array.from(document.querySelectorAll<HTMLElement>('[data-terminal-page] [data-terminal-block-id]'))
            .find(element => element.getAttribute('data-terminal-block-id') === nextId);
          node?.querySelector<HTMLElement>('canvas[tabindex="0"]')?.focus({ preventScroll: true });
        }
      } else if (detail.action === 'prevTfAll' || detail.action === 'nextTfAll') {
        const frames: Timeframe[] = ['30s','1m','5m','15m','1h','4h','1d'];
        const index = Math.max(0, frames.indexOf(activeTimeframe));
        const next = Math.max(0, Math.min(frames.length - 1,
          index + (detail.action === 'nextTfAll' ? 1 : -1)));
        if (index !== next) handleApplyGlobalTimeframe(frames[next]);
      } else if (detail.action === 'prevCoin' || detail.action === 'nextCoin') {
        const available = getCoinsForPicker();
        const index = available.findIndex(coin => coinMarketKey(coin) === coinMarketKey(block));
        const next = index + (detail.action === 'nextCoin' ? 1 : -1);
        if (index < 0 || next < 0 || next >= available.length) return;
        const coin = available[next];
        const pair = normalizeTerminalMarketPair(coin.symbol, coin.quoteAsset);
        handleUpdateBlock(block.id, {
          symbol: pair.symbol, baseAsset: coin.baseAsset,
          quoteAsset: pair.quoteAsset, exchange: coin.exchange, marketType: coin.marketType,
          formationId: undefined, // Never keep entry/SL/TP from the previous coin.
        });
      }
    };
    window.addEventListener('signalhook:hookchart-hotkey', onChartHotkey);
    return () => window.removeEventListener('signalhook:hookchart-hotkey', onChartHotkey);
  }, [visibleWorkspaceBlocks, showHotkeys, isSettingsOpen, isAddModalOpen,
      getCoinForBlock, getCoinsForPicker, activeTimeframe, maximizedBlockId,
      stableSendMetaScalp, onSendMetaScalp, handleUpdateBlock, handleRemoveBlock]);

  // Terminal-wide chords avoid the default HookChart shortcuts. Inputs,
  // menus and modal dialogs keep ownership of their own keyboard events.
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || showHotkeys || isSettingsOpen ||
          isAddModalOpen) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      const action = terminalShortcutAction(event, terminalHotkeys);
      if (isFavoritesDrawerOpen && action !== 'favorites') return;
      if (!action) return;
      const chartHotkeys = profile?.hookChartPreferences?.hotkeys;
      // The user's custom graph shortcut wins if it uses the same chord.
      if (chartHotkeys && Object.values(chartHotkeys).some(spec =>
        typeof spec === 'string' && spec.split('|').includes(
          ['Alt', 'Shift', event.code].join('+')
        ))) return;
      if (action === 'addChart' && blocks.length >= MAX_TERMINAL_CHARTS) return;
      if (action === 'previousPage' && !canGoBack) return;
      if (action === 'nextPage' && !canGoForward) return;
      event.preventDefault();
      switch (action) {
        case 'help':
          setShowCoinPresets(false);
          setShowTradingSessions(false);
          setShowHotkeys(true);
          break;
        case 'addChart': setIsAddModalOpen(true); break;
        case 'presets':
          setShowTradingSessions(false);
          setShowCoinPresets(current => !current);
          break;
        case 'favorites': setIsFavoritesDrawerOpen(current => !current); break;
        case 'exitTerminal': onReturnToPatterns?.(); break;
        case 'linking': {
          // The local connector is opt-in. Never enable an unsupported provider,
          // or trigger an unsolicited external symbol switch.
          const settings = getUserTerminalLinkSettings(user?.uid, profile);
          if (user && profile && settings.provider !== 'none') {
            void updateProfileData({ terminalLinkSettings: { ...settings, enabled: !settings.enabled } })
              .catch(() => { /* Keep the server value authoritative on failure. */ });
          }
          break;
        }
        case 'settings': setIsSettingsOpen(true); break;
        case 'fullscreen': toggleFullscreenSafe(); break;
        case 'autoScale': setAutoScaleCharts(current => !current); break;
        case 'eco': setTerminalEcoMode(current => !current); break;
        case 'oneColumn': case 'twoColumns': case 'threeColumns': case 'fourColumns': {
          const columns = ({ oneColumn: 1, twoColumns: 2, threeColumns: 3, fourColumns: 4 } as const)[action];
          setConfig(current => ({ ...current, columns, layoutPreset: 'custom', autoFitScreen: true }));
          break;
        }
        case 'previousTimeframe': case 'nextTimeframe': {
          const frames: Timeframe[] = ['30s', '1m', '5m', '15m', '1h', '4h', '1d'];
          const index = Math.max(0, frames.indexOf(activeTimeframe));
          const next = Math.max(0, Math.min(frames.length - 1, index + (action === 'nextTimeframe' ? 1 : -1)));
          if (next !== index) handleApplyGlobalTimeframe(frames[next]);
          break;
        }
        case 'previousPage': changeTerminalPage(-1); break;
        case 'nextPage': changeTerminalPage(1); break;
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [showHotkeys, isSettingsOpen, isAddModalOpen, isFavoritesDrawerOpen, blocks.length,
      canGoBack, canGoForward, activeTimeframe, profile?.hookChartPreferences?.hotkeys,
      terminalHotkeys, user?.uid, profile?.terminalLinkSettings, updateProfileData,
      setConfig, changeTerminalPage, onReturnToPatterns]);

  // Controls are intentionally centered, unboxed and always BELOW the charts.
  // The number of matching instruments is independent from open chart blocks.
  const terminalBelowCharts = (
    <div className="pt-4" data-testid="terminal-below-charts">
      <div className="flex flex-col items-center justify-center gap-2 pb-4">
        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          disabled={blocks.length >= MAX_TERMINAL_CHARTS}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 shadow-sm transition-colors hover:border-cyan-400 hover:bg-cyan-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
          title={t('terminal.page.addGraph')}
          aria-label={t('terminal.page.addGraph')}>
          <Plus className="h-7 w-7" aria-hidden="true" />
        </button>
        {hasTerminalPages && (
          <nav aria-label={t('terminal.page.pageNavigation')} className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => changeTerminalPage(-1)}
              disabled={!canGoBack}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 transition-colors hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('terminal.page.previous')}>
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {t('terminal.page.previous')}
            </button>
            <button
              type="button"
              onClick={() => changeTerminalPage(1)}
              disabled={!canGoForward}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 transition-colors hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('terminal.page.next')}>
              {t('terminal.page.next')}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </nav>
        )}
        <p className="text-center text-xs text-slate-400" aria-live="polite">
          {t('terminal.page.foundCoins', { count: foundCoinCount })}
        </p>
      </div>
      <SiteFooter />
    </div>
  );

  // The hotkeys button is directly before autoscale in both responsive rows.
  const renderHotkeysButton = () => (
    <button type="button" onClick={() => {
      setShowCoinPresets(false);
      setShowTradingSessions(false);
      setShowHotkeys(true);
    }}
      data-terminal-hotkeys-trigger="true"
      aria-label={t('terminal.hotkeys.title')}
      title={t('terminal.hotkeys.title')}
      className="flex h-7 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900 text-slate-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
      <Keyboard className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  // One autoscale action, shown in its original position on phones/tablets
  // and next to the timeframe row on desktop.
  const renderAutoScaleButton = () => (
          <button
            type="button"
            onClick={() => setAutoScaleCharts(enabled => !enabled)}
            disabled={chartProvider !== 'hookchart'}
            aria-label="Автоматичний масштаб свічок усіх графіків"
            aria-pressed={autoScaleCharts && chartProvider === 'hookchart'}
            title={chartProvider !== 'hookchart'
              ? 'Автомасштабування доступне для HookChart'
              : autoScaleCharts
                ? 'Вимкнути автоматичне масштабування свічок усіх графіків'
                : 'Автоматично підлаштовувати всі графіки так, щоб свічки не перекривали об’єми'}
            className={`flex h-7 w-8 shrink-0 items-center justify-center justify-self-start rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${autoScaleCharts && chartProvider === 'hookchart'
              ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
              : 'border-slate-700/80 bg-slate-900 text-slate-400 hover:text-cyan-300'}`}
          >
            <ScanLine className="h-4 w-4" />
          </button>
  );

  const renderEcoButton = () => (
    <button
      type="button"
      onClick={() => setTerminalEcoMode(enabled => !enabled)}
      aria-label={t('terminal.eco.toggle')}
      aria-pressed={terminalEcoMode}
      data-terminal-eco={terminalEcoMode ? 'on' : 'off'}
      title={terminalEcoMode ? t('terminal.eco.disable') : t('terminal.eco.enable')}
      className={`flex h-7 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${terminalEcoMode
        ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
        : 'border-slate-700/80 bg-slate-900 text-slate-400 hover:text-emerald-300'}`}
    >
      <Leaf className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  const renderRefreshPicker = () => (
    <TerminalChartRefreshPicker intervalMs={terminalRefreshMs} onChange={setTerminalRefreshMs}
      activePreset={activeMarketPreset} presetAutoUpdate={presetAutoUpdate}
      onPresetAutoUpdateChange={setPresetAutoUpdate} />
  );

  return (
    <div
      data-terminal-page="true"
      className="fixed inset-0 z-40 w-screen h-[100dvh] max-h-[100dvh] min-h-[100dvh] bg-[#090d16] flex flex-col overflow-hidden select-none animate-in fade-in duration-200"
      role="region"
      aria-label="Термінал трейдера"
    >
      {/* Under 720px controls use two rows; from 720px all groups share one compact row. */}
      <header className="z-20 flex shrink-0 flex-col gap-1.5 border-b border-slate-800 bg-slate-950/95 px-2 py-1.5 sm:px-3 min-[720px]:grid min-[720px]:grid-cols-[minmax(0,1fr)_auto_auto_auto_minmax(0,1fr)] min-[720px]:items-center min-[1280px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] min-[720px]:gap-x-1 min-[720px]:gap-y-0 lg:gap-x-2">
        <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center max-[519px]:grid-cols-[auto_minmax(0,1fr)_auto] max-[519px]:gap-1 sm:gap-2 min-[720px]:contents">
          <div className="flex items-center gap-1 justify-self-start min-[720px]:hidden max-[519px]:grid max-[519px]:grid-cols-2 max-[519px]:gap-0.5">
            {renderHotkeysButton()}
            {renderAutoScaleButton()}
            {renderEcoButton()}
            {renderRefreshPicker()}
          </div>

          {/* Do not mount the clock's 1-second timer when the setting is off. */}
          {config.showClock !== false && (
            <div className="col-start-2 row-start-1 justify-self-center min-[720px]:col-start-2 min-[720px]:row-start-1">
              <TerminalClock timeZone={profile?.timeZone} open={showTradingSessions} buttonRef={clockButtonRef}
                onOpenChange={setShowTradingSessions} onOpen={() => setShowCoinPresets(false)} />
            </div>
          )}

          {/* Telegram, MetaScalp, Settings, Fullscreen */}
          <div className="col-start-3 row-start-1 flex shrink-0 items-center justify-self-end gap-0 max-[519px]:grid max-[519px]:grid-cols-3 max-[519px]:gap-0.5 max-[519px]:[&>button]:h-7 max-[519px]:[&>button]:w-7 max-[519px]:[&>button]:p-1 min-[375px]:gap-0.5 sm:gap-2 min-[720px]:col-start-5 min-[720px]:row-start-1 min-[1280px]:col-start-3 min-[720px]:gap-1 min-[720px]:[&>button]:h-7 min-[720px]:[&>button]:w-7 min-[720px]:[&>button]:p-1 lg:[&>button]:h-8 lg:[&>button]:w-8 lg:[&>button]:p-2">
            {/* Lightweight opt-in real-time analysis for the current workspace. */}
            <button type="button"
              disabled={!terminalAnalysisCanRun}
              onClick={() => setConfig(current => ({ ...current, terminalMarketAlerts: current.terminalMarketAlerts !== true }))}
              aria-pressed={terminalAlertsEnabled}
              aria-label={!terminalAnalysisCanRun ? terminalAlertCopy.limit : terminalAlertsEnabled ? terminalAlertCopy.on : terminalAlertCopy.off}
              title={!terminalAnalysisCanRun ? terminalAlertCopy.limit : terminalAlertsEnabled ? terminalAlertCopy.on : terminalAlertCopy.off}
              className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border p-1 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8 ${terminalAlertsEnabled
                ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-300'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
              <ChartNoAxesCombined className="h-4 w-4" aria-hidden="true" />
              <BellRing className={`absolute bottom-0.5 right-0.5 h-2.5 w-2.5 ${terminalAlertsEnabled ? 'text-amber-300' : 'text-slate-500'}`} aria-hidden="true" />
            </button>

            {/* Telegram Alert shortcut */}
            {onOpenTelegramAlerts && hasHeaderTarget && (
              <button
                onClick={() =>
                  onOpenTelegramAlerts({
                    symbol: activeCoin.symbol,
                    exchange: activeCoin.exchange,
                    marketType: activeCoin.marketType,
                    currentPrice: activeCoin.currentPrice,
                    targetPrice: formation?.levels?.targetPrice,
                    formationName: formation?.name,
                  })
                }
                className="flex h-7 w-6 shrink-0 items-center justify-center p-0 sm:h-auto sm:w-auto sm:p-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border-0 lg:h-8 lg:w-8 lg:rounded-lg lg:border lg:border-sky-500/35 transition-all active:scale-95 cursor-pointer"
                title="Створити сповіщення в Telegram"
                aria-label="Створити сповіщення в Telegram"
              >
                <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400" />
              </button>
            )}

            {/* MetaScalp shortcut */}
            {onSendMetaScalp && hasHeaderTarget && (
              <button
                onClick={() => onSendMetaScalp(activeCoin)}
                className="flex h-7 w-6 shrink-0 items-center justify-center p-0 sm:h-auto sm:w-auto sm:p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-0 lg:h-8 lg:w-8 lg:rounded-lg lg:border lg:border-amber-500/35 transition-all active:scale-95 cursor-pointer"
                title={t('terminal.page.metaScalpGroup', { group: metaScalpBinding })}
                aria-label={t('terminal.page.metaScalpGroup', { group: metaScalpBinding })}
              >
                <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 fill-amber-400/20" />
              </button>
            )}

            {/* Settings Drawer */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="relative flex h-7 w-6 shrink-0 items-center justify-center p-0 sm:h-auto sm:w-auto sm:p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border-0 lg:h-8 lg:w-8 lg:rounded-lg lg:border lg:border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={t(syncConflict ? 'terminal.drawer.conflictTooltip' : 'terminal.drawer.settingsTooltip')}
              aria-label={t('terminal.drawer.settingsTooltip')}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
               {syncConflict && <span aria-label={t('terminal.drawer.conflictIndicator')}
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400" />}
            </button>

            {/* Browser Fullscreen Button */}
            <button
              onClick={toggleBrowserFullscreen}
              className="flex h-7 w-6 shrink-0 items-center justify-center p-0 sm:h-auto sm:w-auto sm:p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border-0 lg:h-8 lg:w-8 lg:rounded-lg lg:border lg:border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={isBrowserFullscreen ? 'Вийти з повноекранного режиму' : 'На весь екран браузера'}
            >
              {isBrowserFullscreen ? <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </button>

            {/* Close / Return X button */}
            {onReturnToPatterns && (
              <button
                onClick={onReturnToPatterns}
                className="flex h-7 w-6 shrink-0 items-center justify-center p-0 sm:h-auto sm:w-auto sm:p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border-0 lg:h-8 lg:w-8 lg:rounded-lg lg:border lg:border-slate-700 transition-colors cursor-pointer"
                title="Закрити термінал (повернутися до скрінера)"
                aria-label="Закрити термінал"
              >
                <X className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </button>
            )}
          </div>
        </div>

        <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 sm:gap-2 min-[720px]:contents">
          {/* The phone lower row becomes three groups in the tablet/desktop row. */}
          <div className="col-start-1 row-start-1 flex w-full min-w-0 items-center justify-self-stretch gap-1 sm:gap-2 min-[720px]:col-start-1 min-[720px]:row-start-1">
            <span
              title="Кількість відкритих блоків монет"
              aria-label={t('terminal.page.openCharts', { count: terminalCoinCount })}
              className="whitespace-nowrap font-mono text-[11px] text-cyan-400 sm:text-xs"
            >
              {t('terminal.page.coinsCount', { count: terminalCoinCount })}
            </span>
          <div className="hidden shrink-0 items-center min-[720px]:ml-auto min-[720px]:flex gap-1">
            {renderHotkeysButton()}
            {renderAutoScaleButton()}
            {renderEcoButton()}
            {renderRefreshPicker()}
          </div>
            <div className="hidden shrink-0 items-center bg-slate-900 p-0.5 lg:flex rounded-xl border border-slate-800 text-xs font-mono">
            <button
              onClick={() => {
                // Column selectors are layout-only: never remove existing charts.
                setConfig((prev) => ({ ...prev, layoutPreset: 'custom', columns: 1, freeLayoutAutoColumns: false, autoFitScreen: true }));
              }}
              className={`px-2 py-1 rounded-lg transition-colors ${
                config.columns === 1 && config.layoutPreset === 'custom' && config.freeLayoutAutoColumns === false
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="1 колонка (зберегти всі графіки)"
            >
              1x
            </button>
            <button
              onClick={() => {
                setConfig((prev) => ({ ...prev, layoutPreset: 'custom', columns: 2, freeLayoutAutoColumns: false, autoFitScreen: true }));
              }}
              className={`px-2 py-1 rounded-lg transition-colors ${
                config.columns === 2 && config.layoutPreset === 'custom' && config.freeLayoutAutoColumns === false
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="2 Колонки"
            >
              2x
            </button>
            <button
              onClick={() => {
                setConfig((prev) => ({ ...prev, layoutPreset: 'custom', columns: 3, freeLayoutAutoColumns: false, autoFitScreen: true }));
              }}
              className={`px-2 py-1 rounded-lg transition-colors ${
                config.columns === 3 && config.layoutPreset === 'custom' && config.freeLayoutAutoColumns === false
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="3 Колонки"
            >
              3x
            </button>
            <button
              onClick={() => {
                setConfig((prev) => ({ ...prev, layoutPreset: 'custom', columns: 4, freeLayoutAutoColumns: false, autoFitScreen: true }));
              }}
              className={`px-2 py-1 rounded-lg transition-colors ${
                config.columns === 4 && config.layoutPreset === 'custom' && config.freeLayoutAutoColumns === false
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="4 Колонки"
            >
              4x
            </button>
            </div>
          </div>

          {/* On wide one-row headers, reserve equal space on both sides of the clock. */}
          <div className="contents min-[1280px]:col-start-3 min-[1280px]:row-start-1 min-[1280px]:flex min-[1280px]:items-center min-[1280px]:justify-self-start min-[1280px]:gap-1">
          {/* Timeframe Selector */}
          <div className="col-start-2 row-start-1 flex shrink-0 items-center justify-self-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs font-mono min-[720px]:col-start-3 min-[720px]:row-start-1">
            {(['30s', '1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                type="button"
                aria-label={`Таймфрейм ${tf}`}
                aria-pressed={activeTimeframe === tf}
                onClick={() => handleApplyGlobalTimeframe(tf)}
                className={`px-2 py-1 rounded-lg transition-colors cursor-pointer min-[720px]:px-1 lg:px-2 ${
                  activeTimeframe === tf
                    ? 'bg-cyan-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="col-start-3 row-start-1 flex items-center justify-self-start gap-1 sm:gap-2 min-[720px]:col-start-4 min-[720px]:row-start-1 min-[720px]:gap-1">
            <button
              ref={presetsButtonRef}
              type="button"
              onClick={() => { if (showCoinPresets) closePresetsMenu(); else { setShowTradingSessions(false); setShowCoinPresets(true); } }}
              className={`flex items-center gap-1 p-1.5 sm:p-2 min-[720px]:p-1 lg:p-2 rounded-xl border-0 transition-colors cursor-pointer ${showCoinPresets
                ? 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white'}`}
              title={showCoinPresets ? 'Закрити пресети монет' : 'Відкрити пресети монет'}
              aria-label="Пресети монет"
              aria-expanded={showCoinPresets}
              aria-controls="terminal-coin-presets"
            >
              <ListChecks className="w-4 h-4" />
              <ChevronDown className={`h-3 w-3 transition-transform ${showCoinPresets ? 'rotate-180' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => {
                setIsAddModalOpen(true);
              }}
              className="flex shrink-0 items-center justify-center border-0 bg-transparent p-1.5 text-slate-300 shadow-none transition-colors hover:text-cyan-300 active:scale-95 cursor-pointer sm:p-2 min-[720px]:p-1 lg:p-2"
              title="Додати новий графік монети (понад 2,400+ монет на біржі від $50k до $10B)"
              aria-label="Додати графік"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          </div>
        </div>
      </header>
      <TerminalLiveAlertToast alerts={terminalAlertItems} language={language}
        onDismiss={dismissTerminalLiveAlert} onFocus={focusTerminalAlertBlock}
        status={terminalAlertStatus} onStatusDismiss={() => setTerminalAlertStatus(null)} />


      <div
        ref={presetsMenuRef}
        id="terminal-coin-presets"
        role="region"
        aria-label="Пресети монет"
        hidden={!showCoinPresets}
        onKeyDown={handlePresetsMenuKeyDown}
        style={presetsMenuPosition}
        className={`${showCoinPresets ? 'flex' : 'hidden'} fixed z-50 flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl`}
      >
        <div className="min-h-0 overflow-y-auto">
          <TerminalPresetPanel
            blocks={blocks} watchlist={localWatchlist} presets={customPresets}
            selection={coinPresetSelection} timeframe={timeframe} activePreset={activeMarketPreset} autoUpdate={presetAutoUpdate}
            menuOpen={showCoinPresets}
            snapshot={marketSnapshot} loading={marketLoading} error={marketError}
            onActivePresetChange={handleActiveMarketPresetChange}
            onPresetChosen={() => setShowCoinPresets(false)}
            onApplyCoins={handleApplyMarketCoins} onSavePreset={handleSaveCoinPreset}
            onLoadPreset={handleLoadCoinPreset} onDeletePreset={id => {
               requestImmediateWorkspaceSync();
               setCustomPresets(current => current.filter(preset => preset.id !== id));
             }}
            syncError={syncError} syncConflict={syncConflict} onRetrySync={retrySync}
            onDownloadLocalBackup={downloadLocalBackup} onImportWorkspaceBackup={handleImportWorkspaceBackup}
            signedIn={Boolean(user)}
          />
        </div>
      </div>

      {/* Main Content Area (100% remaining space) */}
      <main className="flex-1 min-h-0 w-full relative overflow-hidden bg-[#090d16]">
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
              <span className="font-bold text-xs sm:text-sm text-white">Обрані монети</span>
              <span className="text-[10px] font-mono font-bold text-amber-300">
                {localWatchlist.length}
              </span>
            </div>
            <button
              onClick={() => setIsFavoritesDrawerOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Сховати"
            >
              <PanelLeftClose className="w-4 h-4" />
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
                placeholder="Пошук в обраному..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Quick Add Chart button in Drawer */}
          <div className="p-2 border-b border-slate-800/60 bg-slate-900/40">
            <button
              onClick={() => {
                setIsAddModalOpen(true);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/30 text-xs font-bold transition-all cursor-pointer shadow-sm"
              title="Додати графік будь-якої монети з біржі"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Додати графік у термінал</span>
            </button>
          </div>

          {/* Coins List in Drawer */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 touch-scroll">
            {filteredFavorites.length === 0 ? (
              <div className="text-center py-10 px-4 text-slate-500 text-xs space-y-2">
                <Star className="w-6 h-6 text-slate-700 mx-auto" />
                <p className="font-semibold text-slate-400">Немає обраних монет</p>
                <p className="text-[11px] text-slate-600">
                  Натисніть на зірочку біля монет у скрінері, щоб вони з'явились тут.
                </p>
              </div>
            ) : (
              filteredFavorites.map((favCoin, idx) => {
                const isSelected = blocks.length === 1
                  ? coinMarketKey(favCoin) === coinMarketKey(activeCoin)
                  : blocks.some(block => coinMarketKey(block) === coinMarketKey(favCoin));
                const isFavPositive = (favCoin.priceChange24h || 0) >= 0;
                return (
                  <div
                    key={`${favCoin.exchange}-${favCoin.symbol}-${favCoin.marketType}-${idx}`}
                    onClick={() => handleSelectFavoriteCoin(favCoin)}
                    className={`group p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-500/60 shadow-sm shadow-cyan-950/50'
                        : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span data-no-translate className="font-mono font-bold text-xs text-white truncate">
                          {favCoin.baseAsset}/{favCoin.quoteAsset}
                        </span>
                        {isSelected && (
                          <span className="flex h-1.5 w-1.5 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500"></span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] uppercase font-bold px-1 rounded bg-slate-800 text-slate-400">
                          {favCoin.exchange || 'binance'}
                        </span>
                        <span className="text-[9px] uppercase font-semibold px-1 rounded bg-slate-800/80 text-slate-500">
                          {favCoin.marketType === 'futures' ? 'Fut' : 'Spot'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        {favCoin.currentPrice > 0 && (
                          <div className="font-mono text-xs font-semibold text-slate-200">
                            {formatTerminalQuotedPrice(favCoin.currentPrice, favCoin.quoteAsset)}
                          </div>
                        )}
                        <div
                          className={`text-[10px] font-mono font-semibold ${
                            isFavPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isFavPositive ? '+' : ''}
                          {(favCoin.priceChange24h || 0).toFixed(2)}%
                        </div>
                      </div>

                      <button
                        onClick={(e) => handleRemoveFromWatchlist(getCoinWatchlistKey(favCoin), e)}
                        className="p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Видалити з обраного"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Transparent navigation is over the chart area, not in the toolbar.
            Keep chart pointer gestures available everywhere outside the three buttons. */}
        <div role="group" aria-label="Навігація термінала"
          className="pointer-events-none absolute bottom-4 right-4 z-20 flex flex-col gap-1.5">
          <button type="button"
            onClick={() => scrollTerminalChartsTo('top')}
            disabled={blocks.length <= 1}
            className="pointer-events-auto flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 text-slate-300 shadow-none transition-colors hover:bg-transparent hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-default disabled:opacity-40 touch-manipulation"
            title={blocks.length <= 1 ? 'Прокручування доступне у режимі кількох графіків' : 'На початок списку графіків'}
            aria-label="На початок списку графіків">
            <ArrowUpToLine className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button"
            onClick={() => scrollTerminalChartsTo('bottom')}
            disabled={blocks.length <= 1}
            className="pointer-events-auto flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 text-slate-300 shadow-none transition-colors hover:bg-transparent hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-default disabled:opacity-40 touch-manipulation"
            title={blocks.length <= 1 ? 'Прокручування доступне у режимі кількох графіків' : 'У кінець списку графіків'}
            aria-label="У кінець списку графіків">
            <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button"
            onClick={() => setIsFavoritesDrawerOpen(true)}
            className="pointer-events-auto relative flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 text-amber-400 shadow-none transition-colors hover:bg-transparent hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 touch-manipulation"
            title={!user ? 'Обрані монети (тільки для зареєстрованих)' : 'Обрані монети'}
            aria-label="Відкрити обрані монети"
            aria-expanded={isFavoritesDrawerOpen}>
            <Bookmark className="h-4 w-4" aria-hidden="true" />
            {!user && <Lock className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 text-amber-400" aria-hidden="true" />}
          </button>
        </div>

        {/* One or many coins share the same grid tiles, controls and live HookChart. */}
          /* Multi-chart Grid Layout */
          <div ref={chartListRef} className="w-full h-full p-2 sm:p-3 overflow-y-auto no-scrollbar">
            {blocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 sm:p-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-950/40 my-8 max-w-lg mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4 shadow-inner">
                  <Plus className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Робоча область порожня</h3>
                <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                  Додайте графік будь-якої монети з біржі Binance або Bybit. Доступно понад 2,400+ монет від $50k до $10B.
                </p>
                <button
                  onClick={() => {
                    setIsAddModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white text-xs font-bold shadow-lg shadow-cyan-950/50 transition-all active:scale-95 cursor-pointer border border-cyan-400/30"
                >
                  <Plus className="w-4 h-4" />
                  + Додати перший графік
                </button>
              </div>
            ) : (
              <>
              <div className={`terminal-workspace-grid grid ${gridColsClass} gap-2 sm:gap-3 transition-all duration-200`} style={terminalHeightVariables}>
                {visibleWorkspaceBlocks.map((block, index) => {
                  const coinData = getCoinForBlock(block);
                  const isMaximized = maximizedBlockId === block.id;

                  return (
                    <TerminalGridItem
                      key={block.id}
                      block={block}
                      coin={coinData}
                      getAllCoins={getCoinsForPicker}
                      subscribeAllCoins={subscribeCoinsForPicker}
                      index={visibleWorkspaceStart + index}
                      isOnlyChart={visibleWorkspaceBlocks.length === 1}
                      isMaximized={isMaximized}
                      isSuspended={maximizedBlockId !== null && !isMaximized}
                      terminalAutoScale={autoScaleCharts && chartProvider === 'hookchart'}
                      terminalEcoMode={terminalEcoMode}
                      terminalRefreshMs={terminalRefreshMs}
                      terminalActiveCharts={maximizedBlockId ? 1 : visibleWorkspaceBlocks.length}
                      terminalInitialView={config.initialChartView}
                      terminalFitAllRequest={terminalFitAllRequest}
                      heightStyle={computedHeightStyle}
                      metaScalpBinding={metaScalpBinding}
                      onToggleMaximize={handleToggleBlockMaximize}
                      onRemove={handleRemoveBlock}
                      onUpdateBlock={handleUpdateBlock}
                      onOpenCoinSelector={handleOpenCoinSelector}
                      onSaveToArchive={handleTerminalArchiveCapture}
                      isSavingArchive={savingTerminalArchive}
                      onOpenFullscreenModal={onOpenFullscreenModal ? stableOpenFullscreen : undefined}
                      onSendMetaScalp={onSendMetaScalp ? stableSendMetaScalp : undefined}
                      onOpenTelegramAlerts={onOpenTelegramAlerts ? stableOpenTelegram : undefined}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    />
                  );
                })}

              </div>
              </>
            )}
            {terminalBelowCharts}
          </div>
      </main>

      {/* Shared Terminal shortcuts and the same saved HookChart bindings. */}
      <TerminalHotkeysDialog
        open={showHotkeys}
        onClose={() => setShowHotkeys(false)}
        pageHotkeys={terminalHotkeys}
        onSavePageHotkeys={updateTerminalHotkeys}
        linkingAvailable={getUserTerminalLinkSettings(user?.uid, profile).provider !== 'none'}
        chartHotkeys={profile?.hookChartPreferences?.hotkeys}
        onSaveChartHotkeys={user && profile ? hotkeys => updateProfileData({
          hookChartPreferences: { hotkeys } as HookChartPreferences,
        }) : undefined}
      />

      {/* Add Chart Modal */}
      <AddChartModal
        isOpen={isAddModalOpen}
        onClose={handleCloseChartPicker}
        mode={replaceBlockId !== null ? 'replace' : 'add'}
        initialTimeframe={replaceBlockId !== null
          ? blocks.find(block => block.id === replaceBlockId)?.timeframe
          : undefined}
        coins={coins}
        terminalMarketCoins={marketCoins}
        atChartLimit={replaceBlockId === null && blocks.length >= MAX_TERMINAL_CHARTS}
        watchlist={localWatchlist}
        onAddChart={handleAddChart}
      />

      {terminalArchiveFeedback && (
        <div role="status" aria-live="polite" className="fixed bottom-16 left-1/2 z-[230] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-purple-500/50 bg-slate-950 px-4 py-3 text-xs text-purple-100 shadow-xl">
          <span>{terminalArchiveFeedback}</span>
          <button type="button" aria-label="Close" onClick={() => setTerminalArchiveFeedback('')} className="text-slate-300 hover:text-white"><X size={14}/></button>
        </div>
      )}
      {pendingTerminalArchive && (
        <ArchiveEntryReasonDialog
          language={language}
          coinLabel={`${pendingTerminalArchive.coin.symbol} · ${pendingTerminalArchive.coin.exchange.toUpperCase()} · ${pendingTerminalArchive.coin.timeframe}`}
          saving={savingTerminalArchive}
          onSave={confirmTerminalArchive}
          onCancel={() => { if (!savingTerminalArchive) setPendingTerminalArchive(null); }}
        />
      )}

      {/* Workspace Settings Drawer */}
      <TerminalSettingsDrawer
        syncConflict={syncConflict} backupFailed={backupFailed}
        onDownloadLocalBackup={downloadLocalBackup}
        onRestoreCloudWorkspace={restoreCloudWorkspace}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onDone={handleDoneWorkspaceSettings}
        config={config}
        coinSelection={coinPresetSelection}
        coinLimit={coinPresetLimit}
        onUpdateConfig={handleWorkspaceConfigUpdate}
        onApplyInitialFitAll={() => setTerminalFitAllRequest(version => version + 1)}
        onPreviewInitialDefaults={() => setTerminalFitAllRequest(0)}
        onRestoreInitialFit={() => setTerminalFitAllRequest(version =>
          config.initialChartFitAll === true ? version + 1 : 0)}
        onApplyGlobalTimeframe={handleApplyGlobalTimeframe}
        globalTimeframe={timeframe}
        onApplyPreset={handleApplyPreset}
        onResetWorkspace={handleResetWorkspace}
        totalBlocks={blocks.length}
      />
    </div>
  );
};
