import { ReplaySpeedPicker } from '../replay/ReplaySpeedPicker';
import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Crosshair, Minus, MoveUpRight, Square, Type, Ruler, Bell, BarChart3, Layers, Settings, Target, Trash2, X, CircleHelp, History, Map as MapIcon } from 'lucide-react';
import type { ArchivedChartSnapshot, ChartMarkerInfo, ChartRestoreParams, DetectedFormation, ExchangeId, HookChartPreferences, Kline, MarketType, Timeframe } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useAlerts } from '../../context/AlertsContext';
import { useTelegram } from '../../context/TelegramContext';
import { alertConditionForPrice, chartTelegramAlerts, telegramIdFromChartMarker } from '../../utils/hookChartPriceAlerts';
import { useLanguage } from '../../context/LanguageContext';
import { resolveHookChartLanguage } from '../../locales/hookchartLanguage';
import { toHookCandles } from '../../utils/hookchartData';
import { convertLiveHookChartCandles, type LiveHookChartConversion } from '../../utils/hookChartLiveConversion';
import { replayHistoryChange } from '../../utils/replayHistoryChange';
import { resolveTimeZone } from '../../utils/tradingSessions';
import { fetchHistoricalReplayCandles } from '../../utils/replayService';
import { isValidExchangeSymbol, normalizeExchangeSymbol } from '../../utils/marketSymbols';
import { fetchSharedAnalysisKlines } from '../../utils/sharedAnalysisKlines';
import { fetchSharedHistoricalKlines } from '../../utils/sharedHistoricalKlines';
import { sharedPublicChartPolling } from '../../utils/sharedPublicChartPolling';
import { sharedAnalysisHookCandles } from '../../utils/sharedAnalysisCandles';
import { aggregateHookChartCandles, updateHookChartAggregation, type AggregationCache } from './aggregationCache';
import { visibleScopedRemoteSeries, type ScopedRemoteSeries } from './scopedRemoteSeries';
import { fetchSharedChartJson } from '../../utils/sharedChartRequests';
import { clampHookChartHistory, extendHookChartHistory, mergeTerminalOlderHistory, scopedHookChartHistoryRows, type ScopedHookChartHistory } from '../../utils/hookChartHistory';
import { createChartCrosshairStore } from './crosshairState';
import { Chart, MemoChartTimeAxis, IndicatorDock, buildStructuralChannel, type Alert, type Candle, type Drawing, type HookChartHandle, type Density, type Viewport, type LiquidationHeatmapChartData } from './engine';
import type { LiquidationHeatmapSnapshot, LiquidationHeatmapPeriod } from './liquidationHeatmap';
import { estimateHistoricalLiqRecurrence, type HistoricalRecurrenceBand } from './historicalLiqRecurrence';
import { INDICATOR_META, type IndicatorId, type OIPoint } from './indicatorEngine';
import { captureVisualProfile, getVisualProfile, makeVisualProfileKey, normalizeVisualProfile, patchVisualProfile, visualContextForTerminalWidth, visualDeviceForWidth, type VisualChartProfile, type VisualContextId, type VisualProfileKey } from './visualProfiles';
import { hookChartPlotWidth } from './priceScale';
import { FibIcon, IndicatorIcon, NecklineIcon, OverlayIcon } from './ToolbarIcons';
import { FormationArchiveIcon } from '../FormationArchiveIcon';
import { HookChartTimeframePicker } from './HookChartTimeframePicker';
import { DEFAULT_HOOKCHART_HOTKEYS, OriginalHookChartSettings, hotkeyMatches, normalizeOriginalHookChartPreferences } from './OriginalHookChartSettings';
import { GUEST_CANVAS_DPR_KEY, HOOKCHART_CANVAS_DPR_EVENT, normalizeMaxCanvasDpr, publishMaxCanvasDpr, readGuestMaxCanvasDpr } from './canvasDpr';
import { TERMINAL_INITIAL_VIEW_APPLY_EVENT, type TerminalInitialViewApplyDetail } from '../terminal/terminalInitialViewApply';
import { evaluateStrategy, strategyPreset, strategyPreferencePatch } from './strategyEngine';
import { createScalperAnalyzer } from './scalperMode';
import { MarketRecurrenceTool } from './MarketRecurrenceTool';
import { createMarketRecurrenceMarks, type MarketRecurrenceMark, type RecurrenceReport } from './marketRecurrence';
import { chartMarketStatistics, memoizedAutoLevels, formatUsd, normalizeDensityDistance, type LevelTf } from './marketAnalytics';
import { useOriginalHookChartLiveFeed } from './useOriginalHookChartLiveFeed';
import { HookChartFooterFunding } from './HookChartFooterFunding';
import { HookChartFooterMinuteVolume } from './HookChartFooterMinuteVolume';
import { terminalEcoPreferences } from './terminalEcoPreferences';
import { connectChartDiagnostics } from './chartDiagnostics';
import { visibleChartDensities } from './reactionPotential';
import { evidenceScope, registerTerminalEvidence } from '../../utils/terminalAnalysis/evidence';
import type { ChartEvidence } from '../../utils/terminalAnalysis/model';
import { btcBenchmarkSymbol, calculateBtcCorrelation } from '../../utils/chartCorrelation';
import { archiveVisualMarketKey, buildArchivedChartSnapshot } from '../../utils/archiveChartSnapshot';
import { archiveVisibleOverlayKeys } from '../../utils/archivedOverlayScene';
import type { HookTimeMarker } from './timeMarkers';
import './hookchart.css';
import './integration.css';

/** Local visibility state belonging to one chart block in Terminal only.
 * Opening these panels does not write shared HookChart account settings.
 */
export interface TerminalToolbarVisibility {
  extraToolsOpen: boolean;
  drawingToolsOpen: boolean;
  onExtraToolsOpenChange: (open: boolean) => void;
  onDrawingToolsOpenChange: (open: boolean) => void;
}

export interface HookChartCanvasProps {
  externalData?: {
    onNeedHistory: (timestamp: number) => Promise<boolean>;
    timeframes: string[]; onTimeframeChange: (timeframe: string) => void;
    timeMarkers: HookTimeMarker[];
    onAppearanceChange?: (changes: { upColor?: string; downColor?: string; volume?: boolean }) => void;
    appearance: { upColor: string; downColor: string; gridColor: string; background: string; volume: boolean };
  };
  klines: Kline[];
  symbol: string;
  timeframe: string;
  exchange: ExchangeId;
  marketType: MarketType;
  markers?: ChartMarkerInfo[];
  /** Include provisional targets and stops in the auto price scale when previewing. */
  expandPriceScaleToMarkers?: boolean;
  savedChartParams?: ChartRestoreParams;
  /** Owner-scoped saved-formation page: live candles, isolated tools. */
  archiveMode?: boolean;
  archiveSnapshot?: ArchivedChartSnapshot;
  /** Optional owner-scoped loader: archive toolbar and chart pan share one history source. */
  archiveOnNeedHistory?: (endTimeMs: number) => Promise<boolean>;
  replay?: boolean;
  /** Isolated read-only journal review: timeframes and candles only. */
  replayReview?: boolean;
  focusTrigger?: number;
  terminalMode?: boolean;
  /** Terminal-only global auto-scale; reuses live candles and the current canvas. */
  terminalAutoScale?: boolean;
  /** Initial exchange history actually received for this symbol/timeframe. */
  terminalHistoryReady?: boolean;
  /** Ephemeral, Terminal-only lightweight mode; never modifies account preferences. */
  terminalEcoMode?: boolean;
  /** Terminal workspace startup view, never used by other chart pages. */
  terminalInitialView?: VisualChartProfile;
  /** Terminal-only command to fit the entire loaded candle history once. */
  terminalFitAllRequest?: number;
  /** Live placement; Replay ignores all user visual presets. */
  visualContext?: VisualContextId;
  terminalToolbarVisibility?: TerminalToolbarVisibility;
  /** Terminal-only owner archive save action; capture is on-demand. */
  terminalArchiveSave?: { onSave: () => void; saving: boolean };
  focusFormation?: DetectedFormation | null;
  onTimeframeChange?: (timeframe: Timeframe) => void;
  /** Optional vertical crosshair price from the main chart, for the price-alert input. */
  onCrosshairPriceChange?: (price: number) => void;
  /** Replay-only protection while historical candles are loading. */
  timeframeDisabled?: boolean;
  replayPlaybackSpeed?: number;
  replayHistoryExpanded?: boolean;
  replayHistoryLoading?: boolean;
  onReplayHistoryToggle?: () => void;
  onReplayPlaybackSpeedChange?: (speed: number) => void;
  onExchangeChange?: (exchange: ExchangeId) => void;
  chartActions?: React.ReactNode;
  toolbarActions?: React.ReactNode;
  toolbarOverlays?: React.ReactNode;
  tradeLevelToggle?: { visible: boolean; available?: boolean; onToggle: () => void };
  /** Standard formations only; early W/M has its own independent marker controls. */
  necklineToggle?: { visible: boolean; available: boolean; onToggle: () => void };
  footerActions?: React.ReactNode;
  /** Hide the toolbar and move timeframes to the footer only in Screener's opened grid card. */
  compactScreenerCard?: boolean;
}

// No loader bundle or network request is loaded until the user enables the map.
const LazyLiquidationHeatmapLoader = React.lazy(() => import('./LiquidationHeatmapLoader'));
// The guided tour is opt-in: keep its translations, layout and CSS out of the live chart's initial bundle.
const LazyHookChartGuide = React.lazy(() => import('./HookChartGuide').then(module => ({ default: module.HookChartGuide })));

const EMPTY_OI = { binance: [] as OIPoint[], bybit: [] as OIPoint[] };
const EMPTY_MODELED_LIQ_BANDS: readonly HistoricalRecurrenceBand[] = [];
// Stable input prevents unnecessary market-stat memo invalidation on ECO candle ticks.
const EMPTY_ECO_STATS_CANDLES: Candle[] = [];
const DEFAULT_VIEWPORT: Viewport = { barWidth: 9, rightOffset: 0, autoY: true, manualCenter: null, manualRange: null, fitAll: false };
const TOOLS = [
  ['cursor', 'Курсор', Crosshair], ['level', 'Горизонтальний рівень', Minus], ['trend', 'Лінія тренду', MoveUpRight],
  ['rect', 'Прямокутник', Square], ['fib', 'Рівні Фібоначчі', FibIcon], ['profile', 'Профіль обсягу', BarChart3],
  ['text', 'Текст', Type], ['ruler', 'Вимірювання', Ruler], ['alert', 'Сигнальний рівень', Bell],
] as const;
const GUIDE_BUTTON_LABELS: Record<string, { title: string; aria: string }> = {
  uk: { title: 'Гайд по графіку HookChart', aria: 'Відкрити інтерактивний гайд по HookChart' },
  en: { title: 'HookChart chart tour', aria: 'Open the interactive HookChart tour' },
  pl: { title: 'Przewodnik po wykresie HookChart', aria: 'Otwórz interaktywny przewodnik po HookChart' },
  ru: { title: 'Гид по графику HookChart', aria: 'Открыть интерактивный гид по HookChart' },
};
const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const TERMINAL_TIMEFRAMES: Timeframe[] = ['30s', ...TIMEFRAMES];
const TF_MS: Record<string, number> = { '1s': 1000, '5s': 5000, '15s': 15000, '30s': 30_000, '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };
const LEVEL_TFS = new Set<LevelTf>(['5m', '15m', '30m', '1h', '4h', '1d']);
// 30m levels use exchange-native 30m candles; the chart timeframe selector is unchanged.
const ANALYSIS_TIMEFRAMES = new Set<string>([...TIMEFRAMES, '30m']);

const OVERLAYS = [
  ['sr', 'Підтримка та опір'], ['prevDay', 'Хай / лой минулого дня'], ['dayOpen', 'Відкриття дня'],
  ['vwap', 'VWAP'], ['localHL', 'Локальні екстремуми'], ['roundLevels', 'Круглі рівні'], ['poc', 'POC'],
  ['channel', 'Канал'], ['stops', 'Зони стопів'],
] as const;

const TRADE_LEVEL_TOGGLE_LABELS: Record<string, { show: string; hide: string; unavailable: string; unavailableTitle: string }> = {
  uk: { show: 'Показати TP, Вхід і SL', hide: 'Приховати TP, Вхід і SL', unavailable: 'TP/SL: немає розрахованих рівнів', unavailableTitle: 'TP/SL стане доступним, коли будуть розраховані Вхід, Ціль і Стоп' },
  en: { show: 'Show TP, Entry and SL', hide: 'Hide TP, Entry and SL', unavailable: 'TP/SL: no calculated trade levels', unavailableTitle: 'TP/SL is available when Entry, Target and Stop are calculated' },
  pl: { show: 'Pokaż TP, wejście i SL', hide: 'Ukryj TP, wejście i SL', unavailable: 'TP/SL: brak wyznaczonych poziomów', unavailableTitle: 'TP/SL będzie dostępne po wyznaczeniu wejścia, celu i stopa' },
  ru: { show: 'Показать TP, вход и SL', hide: 'Скрыть TP, вход и SL', unavailable: 'TP/SL: уровни не рассчитаны', unavailableTitle: 'TP/SL станет доступно после расчёта входа, цели и стопа' },
};
const NECKLINE_TOGGLE_LABELS: Record<string, { show: string; hide: string }> = {
  uk: { show: 'Показати лінію шиї', hide: 'Приховати лінію шиї' },
  en: { show: 'Show neckline', hide: 'Hide neckline' },
  pl: { show: 'Pokaż linię szyi', hide: 'Ukryj linię szyi' },
  ru: { show: 'Показать линию шеи', hide: 'Скрыть линию шеи' },
};

function enabledIndicators(preferences?: HookChartPreferences, replay = false, market: MarketType = 'futures'): IndicatorId[] {
  return (preferences?.indicators || []).filter((id): id is IndicatorId => INDICATOR_META.some(meta => meta.id === id)
    && (id !== 'oi' || (!replay && market === 'futures')));
}

/** Restore immutable archived coordinates as temporary chart-local drawings.
 * Scalper lines are rendered as standard historical trendlines so no live
 * scan/strategy worker is needed to reconstruct them. */
function archiveDrawings(snapshot: ArchivedChartSnapshot | undefined, symbol: string): Drawing[] {
  if (!snapshot) return [];
  const saved = (snapshot.drawings || []).filter(d => d.id.startsWith(symbol + ':'));
  const scalper = snapshot.scalperEnabled
    ? (snapshot.scalperLines || []).map((line, index) => ({
        id: symbol + ':archived-scalper-' + index,
        type: 'trend',
        pts: [{ ...line.from }, { ...line.to }],
      }))
    : [];
  return [...saved, ...scalper];
}

const HookChartCanvas = forwardRef<HookChartHandle, HookChartCanvasProps>(function HookChartCanvas({
  externalData, klines, symbol, timeframe, exchange, marketType, markers = [], expandPriceScaleToMarkers = false, savedChartParams, archiveMode = false, archiveSnapshot, archiveOnNeedHistory, replay = false, replayReview = false, focusTrigger, terminalMode = false, terminalAutoScale = false, terminalHistoryReady = false, terminalEcoMode = false, terminalInitialView, terminalFitAllRequest, visualContext, terminalToolbarVisibility, terminalArchiveSave, focusFormation, onTimeframeChange, onCrosshairPriceChange, timeframeDisabled = false, replayPlaybackSpeed, onReplayPlaybackSpeedChange, replayHistoryExpanded, replayHistoryLoading, onReplayHistoryToggle, chartActions, toolbarActions, toolbarOverlays, tradeLevelToggle, necklineToggle, footerActions, compactScreenerCard = false,
}, forwardedRef) {
  const { user, profile, updateProfileData } = useAuth();
  const { alerts: priceAlerts, addAlert, deleteAlert } = useAlerts();
  const { status: telegramStatus } = useTelegram();
  const { language: siteLanguage, t } = useLanguage();
  const preferences = profile?.uid === user?.uid ? profile?.hookChartPreferences : undefined;
  // Strict opt-in: no chart layout changes in Formations, Terminal, Replay or fullscreen.
  const screenerCardCompactLayout = compactScreenerCard && visualContext === 'screenerQuick'
    && !terminalMode && !replay && !archiveMode;
  const scope = `${replay ? 'replay' : archiveMode ? 'archive' : 'live'}:${exchange}:${marketType}:${symbol}`;
  // Automatic observations belong to the exact exchange/market/timeframe that
  // was saved. Switching the archive timeframe must not invent old levels.
  const archiveOriginalScope = archiveMode && !!archiveSnapshot &&
    archiveSnapshot.timeframe === timeframe &&
    archiveSnapshot.marketKey === archiveVisualMarketKey(exchange, marketType, symbol, timeframe);
  // NEVER recalculate automatic lines from today's candles in archive mode.
  // Older records without exact historical coordinates show no invented auto
  // levels. Only the original symbol/market/timeframe can restore saved scene.
  const frozenOverlayScene = archiveMode
    ? (archiveOriginalScope ? (archiveSnapshot?.overlayScene ?? {}) : {})
    : undefined;
  const archivedDensity = archiveOriginalScope ? archiveSnapshot?.density : undefined;
  const archivedDensities = useMemo<Density[]>(() => archivedDensity?.markers.map(level => ({
    id:level.id, side:level.side, p:level.price, q:0, usd:level.usd, peakUsd:level.usd,
    first:level.firstSeenAt, last:level.lastSeenAt, active:level.active,
    touches:level.touches, lastTouch:0, replenishments:0, updates:0,
    score:level.reactionScore ?? 0, mmScore:0,
    reactionScore:level.reactionScore, reactionTier:level.reactionTier,
  })) ?? [], [archivedDensity]);
  useEffect(() => replay ? undefined : connectChartDiagnostics(), [replay]);
  // The single full-height Terminal chart uses terminalLarge but deliberately
  // does not enable the grid-specific terminalMode toolbar. It still needs
  // the same initial-view settings and on-demand Apply action.
  const terminalInitialViewTarget = !replay && !archiveMode
    && (terminalMode || visualContext === 'terminalLarge');
  // Apply the saved starting viewport on demand without re-mounting a chart,
  // interrupting a candle stream, or changing other HookChart pages.
  const [appliedTerminalInitialView, setAppliedTerminalInitialView] =
    useState<{ view: VisualChartProfile; version: number } | null>(null);
  const previousTerminalInitialView = useRef(terminalInitialView);
  useEffect(() => {
    if (!terminalInitialViewTarget || typeof window === 'undefined') return;
    const onApply = (event: Event) => {
      const detail = (event as CustomEvent<TerminalInitialViewApplyDetail>).detail;
      if (detail?.reset) {
        setAppliedTerminalInitialView(null);
        return;
      }
      const selected = detail?.view;
      if (!selected) return;
      // Read the exact slider values from the click. Workspace state is saved
      // separately and React may not have committed it when this event fires.
      setAppliedTerminalInitialView(current => ({
        view: normalizeVisualProfile(selected, 'terminalMedium'),
        version: (current?.version ?? 0) + 1,
      }));
    };
    window.addEventListener(TERMINAL_INITIAL_VIEW_APPLY_EVENT, onApply);
    return () => window.removeEventListener(TERMINAL_INITIAL_VIEW_APPLY_EVENT, onApply);
  }, [terminalInitialViewTarget]);
  useEffect(() => {
    if (previousTerminalInitialView.current === terminalInitialView) return;
    previousTerminalInitialView.current = terminalInitialView;
    // Keep the just-applied values while the matching workspace save commits.
    // A later reset or different saved profile must take effect as usual.
    setAppliedTerminalInitialView(current => {
      if (!current || !terminalInitialView) return null;
      const saved = normalizeVisualProfile(terminalInitialView, 'terminalMedium');
      const { view } = current;
      return view.visibleBars === saved.visibleBars
        && view.rightGapBars === saved.rightGapBars
        && view.verticalZoom === saved.verticalZoom
        && view.autoPriceScale === saved.autoPriceScale ? current : null;
    });
  }, [terminalInitialView]);
  const sharedScope = `shared:${symbol}`;
  const [settings, setSettings] = useState<HookChartPreferences>(() =>
    normalizeOriginalHookChartPreferences(user?.uid ? preferences : { maxCanvasDpr: readGuestMaxCanvasDpr() }));
  // Keep every mounted chart in sync without re-subscribing to exchange feeds.
  // Account settings persist via updateProfileData; guests keep only a local browser value.
  useEffect(() => {
    if (replay || typeof window === 'undefined') return;
    const onDprChange = (event: Event) => {
      const detail = (event as CustomEvent<{ uid: string | null; cap: number }>).detail;
      if (!detail || detail.uid !== (user?.uid ?? null)) return;
      const cap = normalizeMaxCanvasDpr(detail.cap);
      setSettings(current => current.maxCanvasDpr === cap ? current : { ...current, maxCanvasDpr: cap });
    };
    const onStorage = (event: StorageEvent) => {
      if (user?.uid || event.key !== GUEST_CANVAS_DPR_KEY) return;
      const cap = readGuestMaxCanvasDpr();
      setSettings(current => current.maxCanvasDpr === cap ? current : { ...current, maxCanvasDpr: cap });
    };
    window.addEventListener(HOOKCHART_CANVAS_DPR_EVENT, onDprChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(HOOKCHART_CANVAS_DPR_EVENT, onDprChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [replay, user?.uid]);
  const ecoActive = terminalEcoMode && !replay && !externalData;
  const hasExternalData = Boolean(externalData);
  // Read-only runtime overlay: neither setSettings nor queueSave sees ECO overrides.
  const runtimeSettings = useMemo(() => {
    const next = terminalEcoPreferences(settings, ecoActive);
    // Archive is a lightweight live candle viewer. Keep the same candle colors,
    // shadows, scale and user visual profile, but never start market-depth,
    // liquidation, strategy, or cross-timeframe analysis for this reader.
    return archiveMode ? { ...next, strategyId: '', scalperMode: false,
      levelIntervals: [], trendIntervals: [], showMarketStatsBar: false,
      showLiquidations: false, showDensityLines: false, showDensityLabels: false,
      showDensityAmounts: false, showLiqRiskBlock: false, showMarketPrintSums: false,
    } : next;
  }, [settings, ecoActive, archiveMode]);
  const scalperAnalyzer = useMemo(createScalperAnalyzer, []);
  const chartLanguage = resolveHookChartLanguage(settings, siteLanguage);
  const [drawings, setDrawingsState] = useState<Drawing[]>(() => archiveMode ? archiveDrawings(archiveSnapshot, symbol) : replay ? [] :
    (preferences?.sharedDrawings !== false ? preferences?.drawings?.[sharedScope] : undefined) || preferences?.drawings?.[scope] || []);
  const [alerts, setAlertsState] = useState<Alert[]>(() => (replay || archiveMode) ? [] :
    (preferences?.sharedDrawings !== false ? preferences?.alerts?.[sharedScope] : undefined) || preferences?.alerts?.[scope] || []);
  const drawingsRef = useRef(drawings);
  const alertsRef = useRef(alerts);
  const creatingPriceAlert = useRef(false);
  const [alertNotice, setAlertNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [selectedPriceMarker, setSelectedPriceMarker] = useState<string | null>(null);
  const [deletingPriceMarker, setDeletingPriceMarker] = useState(false);
  const deletingMarkerIds = useRef(new Set<string>());
  const [editedMarkerPrice, setEditedMarkerPrice] = useState('');
  const tempRulerRef = useRef<{ code: string; tool: string } | null>(null);
  const [tool, setTool] = useState('cursor');
  // Keyboard toggle complements the existing middle-button hold magnifier.
  const [keyboardMagnifierActive, setKeyboardMagnifierActive] = useState(false);
  // Replay-only UI state must not alter live HookChart account preferences.
  const [replayToolsOpen, setReplayToolsOpen] = useState(false);
  const [replayDrawingToolbarOpen, setReplayDrawingToolbarOpen] = useState(false);
  // Archive drawer visibility is local; never modify the shared profile setting.
  const [archiveDrawingToolbarOpen, setArchiveDrawingToolbarOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideSettingsTab, setGuideSettingsTab] = useState<'main' | 'levels' | undefined>(undefined);
  const closeGuide = useCallback(() => { setGuideOpen(false); setGuideSettingsTab(undefined); }, []);
  const navigateGuide = useCallback((tab: 'main' | 'levels' | null) => {
    if (tab) { setGuideSettingsTab(tab); setPanel('settings'); }
    else { setPanel(null); setGuideSettingsTab(undefined); }
  }, []);
  const [replayOverlays, setReplayOverlays] = useState<string[]>(() => archiveMode
    ? archiveSnapshot?.timeframe === timeframe && archiveSnapshot?.marketKey === archiveVisualMarketKey(exchange, marketType, symbol, timeframe)
      ? (archiveSnapshot?.overlays || []) : []
    : []);
  // Switching between two saved records of the SAME market must only replace
  // their saved tools, never remount candles or reconnect the shared kline WS.
  useEffect(() => {
    if (!archiveMode) return;
    setReplayOverlays(archiveOriginalScope ? (archiveSnapshot?.overlays || []) : []);
  }, [archiveMode, archiveOriginalScope, archiveSnapshot]);
  const [replayIndicators, setReplayIndicators] = useState<IndicatorId[]>([]);
  const [textLabel, setTextLabel] = useState('Нотатка');
  const [panel, setPanel] = useState<'indicators' | 'settings' | null>(null);
  // Per-chart view state. Do NOT persist in HookChart settings: reopening any
  // chart must be zero-cost unless the user explicitly turns on the map.
  const [liquidationMapOn, setLiquidationMapOn] = useState(false);
  const [liquidationMapPeriod, setLiquidationMapPeriod] = useState<LiquidationHeatmapPeriod>('24h');
  const [liquidationMapState, setLiquidationMapState] = useState<{
    scope: string; data: LiquidationHeatmapSnapshot | null;
  } | null>(null);
  const closeSettings = useCallback(() => setPanel(null), []);
  const [densityQuickOpen, setDensityQuickOpen] = useState(false);
  const [densityPopupLeft, setDensityPopupLeft] = useState(8);
  const [densityThresholdDraft, setDensityThresholdDraft] = useState<string | null>(null);
  const [densityDistanceDraft, setDensityDistanceDraft] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const historyScope = [exchange, marketType, normalizeExchangeSymbol(symbol), timeframe].join(':');
  const [recurrenceOverlay, setRecurrenceOverlay] = useState<{ scope: string; report: RecurrenceReport | null } | null>(null);
  const onRecurrenceResultsChange = useCallback((scope: string, report: RecurrenceReport | null) => {
    setRecurrenceOverlay(previous => {
      // OFF is a true no-op. A mounted but disabled chart must not schedule
      // an extra state update, especially in a 36-card Terminal workspace.
      if (!report) return previous?.scope === scope ? null : previous;
      return previous?.scope === scope && previous.report === report
        ? previous : { scope, report };
    });
  }, []);
  const recurrenceMarks = useMemo<readonly MarketRecurrenceMark[]>(() => {
    if (replay || archiveMode || hasExternalData || ecoActive ||
        recurrenceOverlay?.scope !== historyScope || !recurrenceOverlay.report) return [];
    return createMarketRecurrenceMarks(recurrenceOverlay.report);
  }, [recurrenceOverlay, historyScope, replay, archiveMode, hasExternalData, ecoActive]);
  const crosshair = useMemo(() => {
    // A new market owns its own transient cursor state.
    void historyScope;
    return createChartCrosshairStore();
  }, [historyScope]);
  const [extraHistory, setExtraHistory] = useState<ScopedHookChartHistory>(() => ({ scope: historyScope, rows: [] }));
  const liquidationMapSupported = !replay && !externalData && marketType === 'futures' &&
    !archiveMode &&
    (exchange === 'binance' || exchange === 'bybit');
  const liquidationMapScope = exchange + ':' + normalizeExchangeSymbol(symbol).toUpperCase() + ':' + liquidationMapPeriod;
  const onLiquidationMapData = useCallback((data: LiquidationHeatmapSnapshot | null) => {
    setLiquidationMapState({ scope: liquidationMapScope, data });
  }, [liquidationMapScope]);
  const visibleMap = !ecoActive && liquidationMapOn && liquidationMapSupported &&
    liquidationMapState?.scope === liquidationMapScope ? liquidationMapState.data : null;
  const mapChartData = useMemo<LiquidationHeatmapChartData | null>(() => {
    if (!visibleMap?.bins.length) return null;
    let maxUsd=0;
    for (const bin of visibleMap.bins) maxUsd=Math.max(maxUsd,bin.usd);
    return maxUsd>0 ? { bins: visibleMap.bins, maxUsd, period: liquidationMapPeriod } : null;
  }, [visibleMap, liquidationMapPeriod]);
  const extraHistoryRef = useRef(extraHistory);
  extraHistoryRef.current = extraHistory;
  const extraHistoryRows = scopedHookChartHistoryRows(extraHistory, historyScope);
  const [historyState, setHistoryState] = useState<{ scope: string; status: 'idle' | 'loading' | 'limited' | 'error' }>({ scope: historyScope, status: 'idle' });
  const historyStatus = historyState.scope === historyScope ? historyState.status : 'idle';
  const [historyRetry, setHistoryRetry] = useState(0);
  const [remoteState, setRemoteState] = useState<ScopedRemoteSeries<Candle> | null>(null);
  // The prior request may still be in-flight after the chart changes coin or TF.
  const remoteSeries = visibleScopedRemoteSeries(remoteState, historyScope, !replay && !externalData);
  // One immutable rolling aggregate per local higher timeframe, not a
  // 5,000-candle rebuild every time a live trade updates the last bar.
  const aggregateCache = useRef<{
    scope: string;
    series: Map<string, AggregationCache>;
  }>({ scope: historyScope, series: new Map() });
  const [oi, setOi] = useState(EMPTY_OI);
  const oiEvidenceScope = useRef('');
  const [oiError, setOiError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [profileSyncVersion, refreshProfileSettings] = useState(0);
  const engineRef = useRef<HookChartHandle | null>(null);
  const archiveCaptureRef = useRef<() => ArchivedChartSnapshot | null>(() => null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [visualDevice, setVisualDevice] = useState(() =>
    visualDeviceForWidth(typeof window === 'undefined' ? 1280 : window.innerWidth));
  const [terminalVisualContext, setTerminalVisualContext] = useState<VisualContextId>('terminalMedium');
  useEffect(() => {
    if (replay) return;
    const updateDevice = () => setVisualDevice(visualDeviceForWidth(window.innerWidth));
    updateDevice();
    window.addEventListener('resize', updateDevice);
    return () => window.removeEventListener('resize', updateDevice);
  }, [replay]);
  useEffect(() => {
    if (!terminalMode || replay || !rootRef.current || typeof ResizeObserver === 'undefined') return;
    const root = rootRef.current;
    const update = () => setTerminalVisualContext(visualContextForTerminalWidth(root.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [terminalMode, replay]);
  const activeVisualContext = terminalMode ? terminalVisualContext : (visualContext || 'screenerQuick');
  const activeVisualKey = makeVisualProfileKey(activeVisualContext, visualDevice);
  // Apply the same default scale shown in Settings to every live HookChart,
  // even before a user saves a visual profile. Keep explicit personal profiles
  // and Terminal per-chart initial views, and leave Replay navigation isolated.
  const selectedTerminalInitialView = appliedTerminalInitialView?.view ?? terminalInitialView;
  const activeVisualProfile = replay ? undefined
    : terminalInitialViewTarget && selectedTerminalInitialView
      ? normalizeVisualProfile(selectedTerminalInitialView, activeVisualContext)
      : getVisualProfile(settings, activeVisualContext, visualDevice);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const extraToolsRef = useRef<HTMLDivElement | null>(null);
  const statsBarRef = useRef<HTMLDivElement | null>(null);
  const integratedToolbar = terminalMode && !!toolbarActions;
  // A Terminal chart's panel is controlled by its own widget, never by
  // the account-wide preference. Other chart pages keep their old behavior.
  const terminalExtraToolsOpen = integratedToolbar && terminalToolbarVisibility
    ? terminalToolbarVisibility.extraToolsOpen
    : settings.terminalExtraToolsOpen === true;
  const scrollExtraTools = (direction: -1 | 1) => {
    const strip = extraToolsRef.current;
    if (!strip) return;
    strip.scrollBy({ left: direction * Math.max(120, Math.round(strip.clientWidth * 0.75)), behavior: 'smooth' });
  };
  // The optional strip is dynamically mounted. Attach the wheel handler to the
  // stable toolbar instead: scrolling also works when the pointer is on its
  // expand chevron, and the browser cannot lose the listener after remounts.
  const onExtraToolsWheel = useCallback((event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) return;
    const strip = extraToolsRef.current;
    const toolbar = toolbarRef.current;
    const target = event.target;
    if (!strip || !toolbar || !(target instanceof Element) || !toolbar.contains(target)) return;
    // Timeframes and fixed controls are interactive, never scroll those away.
    if (target.closest('.hookchart-timeframes, .toolbarRight, .hookchart-toolbar-actions')) return;
    const maxScroll = strip.scrollWidth - strip.clientWidth;
    if (maxScroll <= 1) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1;
    const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit;
    if (!delta) return;
    const next = Math.max(0, Math.min(maxScroll, strip.scrollLeft + delta));
    if (Math.abs(next - strip.scrollLeft) >= 0.5) {
      event.preventDefault();
      event.stopPropagation();
      strip.scrollLeft = next;
    }
  }, []);
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    toolbar.addEventListener('wheel', onExtraToolsWheel, { passive: false, capture: true });
    return () => toolbar.removeEventListener('wheel', onExtraToolsWheel, true);
  }, [onExtraToolsWheel]);
  const [controlsContainer, setControlsContainer] = useState<HTMLDivElement | null>(null);
  const [countdownContainer, setCountdownContainer] = useState<HTMLDivElement | null>(null);
  const saveRef = useRef(updateProfileData);
  saveRef.current = updateProfileData;
  const pending = useRef<HookChartPreferences | null>(null);
  // A deferred write belongs to the account which made the edit. Never
  // allow a pending delta from one account to be written to another.
  const pendingOwnerUid = useRef<string | null>(null);
  const activeUid = useRef<string | null>(user?.uid ?? null);
  activeUid.current = user?.uid ?? null;
  const lastLoadedUid = useRef<string | null>(user?.uid ?? null);
  const savingByUid = useRef(new Map<string, number>());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    const scrollers = [
      integratedToolbar ? toolbarRef.current?.querySelector<HTMLDivElement>('.hookchart-terminal-scroll') : null,
      terminalMode ? statsBarRef.current : null,
    ]
      .filter((element): element is HTMLDivElement => !!element);
    const cleanup = scrollers.map(element => {
      const onWheel = (event: WheelEvent) => {
        if (event.ctrlKey || event.metaKey || element.scrollWidth <= element.clientWidth) return;
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1;
        const previous = element.scrollLeft;
        element.scrollLeft += delta * unit;
        if (element.scrollLeft !== previous) event.preventDefault();
      };
      element.addEventListener('wheel', onWheel, { passive:false });
      return () => element.removeEventListener('wheel', onWheel);
    });
    return () => cleanup.forEach(dispose => dispose());
  }, [terminalMode, integratedToolbar, terminalExtraToolsOpen, settings.showTopToolbarIcons, settings.showMarketStatsBar]);
  // Stable indicator IDs avoid redoing the SVG calculations for unrelated feed updates.
  const indicators = useMemo(() => (replay || archiveMode) ? replayIndicators : enabledIndicators(runtimeSettings, hasExternalData, marketType),
    [replay, archiveMode, replayIndicators, runtimeSettings, hasExternalData, marketType]);
  // Chart time is owned by the user's profile. Ignore legacy per-chart
  // timezone overrides so changing the profile updates every HookChart view.
  const timezone = resolveTimeZone(profile?.timeZone);
  // Replay is intentionally independent from the live indicator data pipeline.
  const replayConversionRef = useRef<{ scope: string; input: readonly Kline[]; candles: Candle[] } | null>(null);
  // Live ticks normally replace just the last immutable candle. Keep the
  // history conversion separate from Replay, with a full rebuild on any
  // altered prefix, history page, symbol, timeframe or candle limit.
  const liveConversionRef = useRef<LiveHookChartConversion | null>(null);
  // Replay must remain causal; live chart history can be extended and capped independently.
  // Archive page is intentionally bounded to 5k exchange candles, regardless
  // of the normal Screener/Terminal history limit. Other charts are unchanged.
  const maxChartCandles = archiveMode ? 5000
    : settings.maxChartCandles === undefined ? undefined : clampHookChartHistory(settings.maxChartCandles);
  const candles = useMemo(() => {
    if (replay) {
      liveConversionRef.current = null;
      const previous = replayConversionRef.current;
      const change = replayHistoryChange(previous?.scope === historyScope ? previous.input : null, klines);
      if (previous && previous.scope === historyScope && change === 'same') return previous.candles;
      if (previous && previous.scope === historyScope &&
          (change === 'append' || change === 'replace-last')) {
        const next = toHookCandles(klines.slice(-1))[0];
        if (next) {
          const rows = change === 'append'
            ? [...previous.candles, next]
            : [...previous.candles.slice(0, -1), next];
          replayConversionRef.current = { scope: historyScope, input: klines, candles: rows };
          return rows;
        }
      }
      const rows = toHookCandles(klines);
      replayConversionRef.current = { scope: historyScope, input: klines, candles: rows };
      return rows;
    }
    replayConversionRef.current = null;
    const converted = convertLiveHookChartCandles(klines, extraHistoryRows, historyScope,
      maxChartCandles, liveConversionRef.current);
    liveConversionRef.current = converted;
    return converted.candles;
  }, [klines, extraHistoryRows, replay, maxChartCandles, historyScope]);
  // Historical recurrence estimation is strictly opt-in. Price updates are
  // quantized to the same 0.5% buckets as archived Liq, so a fast chart tick
  // never recomputes 6000 bins unnecessarily.
  const recurrenceEnabled = liquidationMapOn && liquidationMapSupported && !ecoActive &&
    settings.showModeledLiquidationZones === true && !!mapChartData && !visibleMap?.truncated;
  const currentReferencePrice = candles.at(-1)?.c ?? 0;
  const referencePriceBucket = recurrenceEnabled && currentReferencePrice > 0
    ? Math.floor(Math.log(currentReferencePrice) / Math.log(1.005)) : null;
  const modeledLiquidationBands = useMemo<readonly HistoricalRecurrenceBand[]>(() => {
    if (!recurrenceEnabled || !mapChartData || referencePriceBucket === null) return EMPTY_MODELED_LIQ_BANDS;
    return estimateHistoricalLiqRecurrence(
      mapChartData.bins, liquidationMapPeriod,
      1.005 ** (referencePriceBucket + 0.5), Date.now(),
    );
  }, [recurrenceEnabled, mapChartData, liquidationMapPeriod, referencePriceBucket]);
  const historyRequestKey = useRef('');
  // Only the transition from no input candles may start historical paging.
  // Read the current snapshot without rescheduling the fetch on every candle.
  const historyKlinesRef = useRef(klines);
  historyKlinesRef.current = klines;
  const hasInitialKlines = klines.length > 0;
  useEffect(() => {
    // The renderer always shows the most recent candles first; the full
    // configured history is fetched separately in pages of up to 1000.
    // Use the normalized symbol (BTC/USDT must work just like BTCUSDT).
    const normalizedSymbol = normalizeExchangeSymbol(symbol);
    // Compact Terminal charts request older pages only when the user pans back;
    // Settings > retry can still explicitly request the configured full history.
    if (replay || archiveMode || hasExternalData || timeframe === '30s' || (terminalMode && historyRetry === 0) || !maxChartCandles || !hasInitialKlines ||
        !isValidExchangeSymbol(normalizedSymbol)) return;
    const key = [exchange, marketType, normalizedSymbol, timeframe, maxChartCandles, historyRetry].join(':');
    if (historyRequestKey.current === key) return;
    historyRequestKey.current = key;

    const controller = new AbortController();
    const source = [...scopedHookChartHistoryRows(extraHistoryRef.current, historyScope), ...historyKlinesRef.current].sort((a, b) => a.time - b.time);
    if (source.length >= maxChartCandles) {
      setHistoryState({ scope: historyScope, status: 'idle' });
      return;
    }
    const firstCurrentTime = Math.min(...historyKlinesRef.current.map(row => row.time));
    const acceptPage = (rows: Kline[]) => {
      if (controller.signal.aborted) return;
      setExtraHistory({ scope: historyScope, rows: rows.filter(row => row.time < firstCurrentTime) });
    };
    setHistoryState({ scope: historyScope, status: 'loading' });

    const fetchOlder = async (endTime: number, limit: number): Promise<Kline[]> => {
      if (controller.signal.aborted) return [];
      return fetchSharedHistoricalKlines({
        exchange, marketType, symbol: normalizedSymbol, timeframe: timeframe as Timeframe,
        limit, endTime,
      });
    };

    void extendHookChartHistory(source, maxChartCandles, fetchOlder, acceptPage, controller.signal)
      .then(rows => {
        if (controller.signal.aborted) return;
        acceptPage(rows);
        setHistoryState({ scope: historyScope, status: rows.length >= maxChartCandles ? 'idle' : 'limited' });
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        console.warn('[HookChart] Could not load older candles', error);
        // Successful earlier pages remain on the chart; retry from their oldest bar.
        setHistoryState({ scope: historyScope, status: 'error' });
      });
    return () => controller.abort();
  }, [replay, archiveMode, hasExternalData, terminalMode, historyScope, exchange, marketType, symbol, timeframe, maxChartCandles, hasInitialKlines, historyRetry]);

  const activeStrategy = useMemo(() => archiveMode ? null : strategyPreset(runtimeSettings.strategyId || ''), [runtimeSettings.strategyId, archiveMode]);
  const liveFeed = useOriginalHookChartLiveFeed({
    exchange, marketType, symbol, settings: runtimeSettings, candles, replay,
    lightweight: ecoActive || archiveMode, needsFunding: activeStrategy?.config.kind === 'overheat',
    // Presets using order-book imbalance keep their evidence when the density overlay is off.
    needsStrategyBook: activeStrategy?.config.kind === 'breakout' ||
      activeStrategy?.config.kind === 'reaction' || activeStrategy?.config.kind === 'density',
  });
  // The heavy chart container also commits for viewport gestures. Density
  // classification changes with the market feed, not with mouse position.
  const potentialDensityCount = useMemo(() =>
    liveFeed.densities.filter(density => density.reactionTier === 'potential').length,
    [liveFeed.densities],
  );
  // Only filter the chart. Strategy evaluation and density lists retain the full live book.
  const chartDensities = useMemo(
    () => visibleChartDensities(liveFeed.densities, settings.densityMode, settings.densityAutoDisplay),
    [liveFeed.densities, settings.densityMode, settings.densityAutoDisplay],
  );
  // Passive reader only: never enables an indicator or changes chart state,
  // subscriptions, polling, Canvas or DPR. No work when the monitor is off.
  const terminalEvidence = useRef<() => ChartEvidence>(() => ({ manualLevels: [], densityEnabled: false, densities: [], oi: [] }));
  const terminalEvidenceOwner = useRef('');
  terminalEvidenceOwner.current = evidenceScope(user?.uid ?? 'guest', { exchange, marketType, symbol }, timeframe);
  terminalEvidence.current = () => {
    const densityEnabled = runtimeSettings.densityAnalysis !== false && !ecoActive
      && (runtimeSettings.showDensityLines === true || runtimeSettings.showDensityLabels === true);
    return {
      manualLevels: drawings.filter(d => d.type === 'level').map(d => d.pts[0]?.p).filter(p => p > 0),
      densityEnabled,
      densities: densityEnabled ? chartDensities.filter(d => d.active).slice(0, 24)
        .map(d => ({ price: d.p, side: d.side, at: d.last, firstAt: d.first, usd: d.usd })) : [],
      oi: marketType === 'futures' && !oiError && oiEvidenceScope.current === normalizeExchangeSymbol(symbol) + ':' + timeframe
        ? (exchange === 'bybit' ? oi.bybit : oi.binance).slice(-24) : [],
    };
  };
  useEffect(() => {
    if (!terminalInitialViewTarget || replay || archiveMode || hasExternalData) return;
    const ownerScope = evidenceScope(user?.uid ?? 'guest', { exchange, marketType, symbol }, timeframe);
    return registerTerminalEvidence(ownerScope, () => terminalEvidenceOwner.current === ownerScope
      ? terminalEvidence.current() : { manualLevels: [], densityEnabled: false, densities: [], oi: [] });
  }, [terminalInitialViewTarget, replay, archiveMode, hasExternalData, user?.uid, exchange, marketType, symbol, timeframe]);
  const channelEnabled = !archiveMode && (replay ? replayOverlays.includes('channel') : runtimeSettings.autoChannel);
  const needsTrendSeries = channelEnabled || !!activeStrategy;
  // Stable scalar keys avoid restarting shared timeframe streams when settings
  // are reconstructed with equivalent arrays on a chart render.
  const levelTfKey = (settings.levelIntervals || []).join(',');
  const trendTfKey = needsTrendSeries ? (settings.trendIntervals || []).join(',') : '';
  const strategyTfKey = (activeStrategy?.requiredTfs || []).join(',');
  const analysisTfs = useMemo(() => ecoActive || archiveMode ? [timeframe] : Array.from(new Set<string>([
    timeframe,
    ...(levelTfKey ? levelTfKey.split(',') : []),
    ...(trendTfKey ? trendTfKey.split(',') : []),
    ...(strategyTfKey ? strategyTfKey.split(',') : []),
  ])), [ecoActive, archiveMode, timeframe, levelTfKey, trendTfKey, strategyTfKey]);
  const analysisTfKey = analysisTfs.join(',');
  const analysisHistoryLimit = Math.min(1000, Math.max(
    250, settings.levelHistory || 500, needsTrendSeries ? settings.trendHistory || 300 : 0,
  ));

  useEffect(() => {
    const exchangeSymbol = /^[A-Z0-9]+$/i.test(symbol);
    if (replay || hasExternalData || !exchangeSymbol) { setRemoteState(null); return; }
    const requested = analysisTfKey.split(',').filter(tf => tf !== timeframe && ANALYSIS_TIMEFRAMES.has(tf));
    if (!requested.length) {
      // No additional timeframe: no dormant per-chart polling timer.
      setRemoteState(current => current?.scope === historyScope &&
        !Object.keys(current.series).length ? current : { scope: historyScope, series: {} });
      return;
    }
    // All charts of this instrument share one public request and timer for
    // each timeframe. Indicators still receive the exact exchange candles.
    const stop = requested.map(tf => sharedPublicChartPolling.subscribe(
      ['analysis', exchange, marketType, symbol, tf, analysisHistoryLimit].join(':'),
      () => fetchSharedAnalysisKlines(exchange, marketType, symbol, tf as Timeframe | '30m', analysisHistoryLimit),
      {
        onData: rows => {
          const converted = sharedAnalysisHookCandles(rows);
          setRemoteState(previous => ({
            scope: historyScope,
            series: {
              ...(previous?.scope === historyScope ? previous.series : {}),
              [tf]: converted,
            },
          }));
        },
        onError: () => {
          setRemoteState(previous => {
            if (previous?.scope !== historyScope || !(tf in previous.series)) return previous;
            const series = { ...previous.series };
            delete series[tf];
            return { scope: historyScope, series };
          });
        },
      },
    ));
    return () => stop.forEach(unsubscribe => unsubscribe());
  }, [exchange, marketType, symbol, timeframe, replay, hasExternalData, analysisTfKey,
    analysisHistoryLimit, historyScope]);

  const analysisSeries = useMemo(() => {
    // Switching instrument/TF must release old candle arrays immediately,
    // not keep up to sixteen old market histories in every Terminal card.
    if (aggregateCache.current.scope !== historyScope) {
      aggregateCache.current = { scope: historyScope, series: new Map() };
    }
    const series: Record<string, Candle[]> = { [timeframe]: candles };
    for (const tf of analysisTfKey.split(',')) {
      if (tf === timeframe) continue;
      if (remoteSeries[tf]?.length) {
        series[tf] = remoteSeries[tf];
        continue;
      }
      // The 30s trade feed contains only a recent, potentially sparse window.
      // Never present its partial 1m/5m aggregates as full exchange candles.
      if (timeframe === '30s') continue;
      if (replay || hasExternalData) {
        const aggregated = aggregateHookChartCandles(candles, timeframe, tf);
        if (aggregated.length) series[tf] = aggregated;
        continue;
      }
      const next = updateHookChartAggregation(candles, timeframe, tf, aggregateCache.current.series.get(tf));
      aggregateCache.current.series.set(tf, next);
      // At most the current instrument's eight supported timeframe variants.
      while (aggregateCache.current.series.size > 8)
        aggregateCache.current.series.delete(aggregateCache.current.series.keys().next().value!);
      if (next.candles.length) series[tf] = next.candles;
    }
    return series;
  }, [candles, timeframe, analysisTfKey, remoteSeries, historyScope, replay, hasExternalData]);
  const activeLevelTfKey = (runtimeSettings.levelIntervals || []).join(',');
  const autoLevels = useMemo(() => (activeLevelTfKey ? activeLevelTfKey.split(',') : []).flatMap(tf => {
    if (!LEVEL_TFS.has(tf as LevelTf)) return [];
    const series = analysisSeries[tf] || [];
    if (series.length < 40) return [];
    return memoizedAutoLevels(series, tf as LevelTf, {
      count: settings.levelCount ?? 3,
      allowedDiffPct: settings.levelDiff ?? .18,
      historyDepth: settings.levelHistory ?? 500,
      breakPct: settings.levelBreak ?? .35,
      pivotBars: settings.levelCandleCount ?? 15,
      allowWickPenetration: settings.allowWick !== false,
    });
  }), [analysisSeries, activeLevelTfKey, settings.levelCount, settings.levelDiff, settings.levelHistory, settings.levelBreak, settings.levelCandleCount, settings.allowWick]);
  const visibleAutoLevels = useMemo(() => settings.showBrokenLevels === false ? autoLevels.filter(level => !level.broken) : autoLevels, [autoLevels, settings.showBrokenLevels]);
  const strategyResult = useMemo(() => activeStrategy && candles.length ? evaluateStrategy(activeStrategy, {
    series: analysisSeries,
    chartCandles: candles,
    levels: autoLevels,
    densities: liveFeed.densities,
    book: liveFeed.book,
    oiHistory: exchange === 'bybit' ? oi.bybit : oi.binance,
    fundingHistory: liveFeed.fundingHistory,
    fundingRate: liveFeed.fundingRate,
    currentPrice: candles.at(-1)?.c || 0,
    cascadeRisk: liveFeed.cascadeRisk.score,
  }) : null, [
    activeStrategy, analysisSeries, candles, autoLevels, oi.binance, oi.bybit, exchange,
    liveFeed.densities, liveFeed.book, liveFeed.fundingHistory, liveFeed.fundingRate, liveFeed.cascadeRisk.score,
  ]);
  // Cached pivots are recalculated only when bounded closed-candle history
  // changes; an inexpensive 90-bar signature also detects exchange backfills.
  // No extra API, worker, interval or saved drawing is created.
  const scalperResult = useMemo(() => runtimeSettings.scalperMode === true && !archiveMode && !replay && !externalData && !ecoActive
    ? scalperAnalyzer.evaluate(candles, [exchange, marketType, symbol, timeframe].join(':'), runtimeSettings.scalperRegressionMode === true, runtimeSettings.scalperCascadeLevels === true)
    : null, [runtimeSettings.scalperMode, runtimeSettings.scalperRegressionMode, runtimeSettings.scalperCascadeLevels, archiveMode, replay, externalData, ecoActive, scalperAnalyzer, candles, exchange, marketType, symbol, timeframe]);
  const chartToolbarEnabled = replay || archiveMode || settings.chartToolbar !== false;
  // Terminal extras must open visibly below the crowded chart controls.
  // Other HookChart pages keep using the saved toolbar preference.
  const topToolbarOpen = archiveMode ? false : replay ? replayToolsOpen : (integratedToolbar ? terminalExtraToolsOpen : settings.showTopToolbarIcons !== false);
  // Keep the drawing toolbar open during the interactive guide without changing
  // saved preferences. The guide entry itself lives inside this drawer only.
  const drawingToolbarOpen = archiveMode ? archiveDrawingToolbarOpen : !replay && !terminalMode && guideOpen
    ? true
    : replay ? replayDrawingToolbarOpen : chartToolbarEnabled && (
      terminalMode && terminalToolbarVisibility
        ? terminalToolbarVisibility.drawingToolsOpen
        : settings.drawingToolbarOpen === true
    );
  // Single source of truth: only the Graph tab's per-context rightGapBars
  // controls the space after the latest candle. Legacy global padding is ignored.
  // Replay deliberately keeps its historical fixed spacing (no visual profiles).
  const rightPaddingBars = replay ? 10 : activeVisualProfile?.rightGapBars
    ?? getVisualProfile(settings, activeVisualContext, visualDevice).rightGapBars;
  const channel = useMemo(() => channelEnabled
    ? buildStructuralChannel(analysisSeries, candles.at(-1)?.c) : null,
    [analysisSeries, candles, channelEnabled]);
  // The previous footer displayed a permanent placeholder for BTC correlation
  // and summed missing candle.tradeCount values as if they were true trades.
  // Both values now use verified exchange data and are scoped to this instrument.
  const statsScope = [exchange, marketType, normalizeExchangeSymbol(symbol), timeframe].join(':');
  const showMarketStats = !replay && !archiveMode && !externalData && runtimeSettings.showMarketStatsBar !== false;
  const [btcReference, setBtcReference] = useState<{ scope: string; rows: Kline[] } | null>(null);
  const [tradeCount24h, setTradeCount24h] = useState<{ scope: string; count: number | null; volume24hUsd: number | null } | null>(null);

  useEffect(() => {
    if (!showMarketStats) return;
    const cleanedSymbol = normalizeExchangeSymbol(symbol);
    const benchmark = btcBenchmarkSymbol(cleanedSymbol);
    if (!/^[A-Z0-9]{3,30}$/.test(cleanedSymbol)) return;
    const stops: Array<() => void> = [];
    // A single BTC benchmark fetch serves every chart of this market/TF.
    if (benchmark && benchmark !== cleanedSymbol && timeframe !== '30s') {
      const params = new URLSearchParams({
        exchange, market: marketType, symbol: benchmark, timeframe, limit: '250',
      });
      stops.push(sharedPublicChartPolling.subscribe(
        ['btc-ref', exchange, marketType, benchmark, timeframe].join(':'),
        () => fetchSharedChartJson('/api/klines?' + params),
        {
          onData: data => setBtcReference({
            scope: statsScope, rows: data.success && Array.isArray(data.data) ? data.data : [],
          }),
          onError: () => setBtcReference({ scope: statsScope, rows: [] }),
        },
      ));
    }
    // A single memoized 60s public quote endpoint serves AV on both exchanges
    // and the pre-existing Binance trade count; no extra exchange REST for AV.
    {
      const params = new URLSearchParams({ exchange, market: marketType, symbol: cleanedSymbol });
      stops.push(sharedPublicChartPolling.subscribe(
        ['trades24h', exchange, marketType, cleanedSymbol].join(':'),
        () => fetchSharedChartJson('/api/chart/trades24h?' + params),
        {
          onData: data => {
            const count = data.success && Number.isSafeInteger(data.trades24h) && data.trades24h >= 0
              ? data.trades24h as number : null;
            const volume24hUsd = data.success && typeof data.volume24hUsd === 'number'
              && Number.isFinite(data.volume24hUsd) && data.volume24hUsd >= 0
              ? data.volume24hUsd as number : null;
            setTradeCount24h({ scope: statsScope, count, volume24hUsd });
          },
          onError: () => setTradeCount24h({ scope: statsScope, count: null, volume24hUsd: null }),
        },
      ));
    }
    return () => stops.forEach(stop => stop());
  }, [statsScope, exchange, marketType, symbol, timeframe, showMarketStats]);

  const btcCorrelation = useMemo(() => {
    if (!showMarketStats || ecoActive || timeframe === '30s' || !TF_MS[timeframe]) return null;
    const benchmark = btcBenchmarkSymbol(normalizeExchangeSymbol(symbol));
    if (!benchmark) return null;
    // BTC compared with itself has +1 correlation if enough valid closed bars.
    // BTC history is fetched in 250-bar pages and correlation uses only the
    // last 121 overlapping closed bars. Avoid mapping 5000 historical candles
    // again on every live price tick (500 retains room for sparse overlap).
    const current = candles.slice(-500).map(c => ({ time: Math.round(c.t / 1000), close: c.c }));
    const reference = benchmark === normalizeExchangeSymbol(symbol)
      ? current
      : btcReference?.scope === statsScope ? btcReference.rows : [];
    return calculateBtcCorrelation(current, reference, TF_MS[timeframe]);
  }, [candles, btcReference, statsScope, symbol, timeframe, showMarketStats, ecoActive]);

  const statsCandles = !showMarketStats || ecoActive ? EMPTY_ECO_STATS_CANDLES : candles;
  const marketStats = useMemo(
    () => chartMarketStatistics(statsCandles, settings.natrPeriod),
    [statsCandles, settings.natrPeriod],
  );
  // Use the actual exchange-reported quote turnover of a completed 1m candle.
  // Other chart timeframes share a separately cached 1m observation in the footer.
  const recentMinuteQuote = timeframe === '1m'
    ? [...klines].reverse().find(row => row.time * 1000 + 60_000 <= Date.now() - 2000
      && row.time * 1000 >= Date.now() - 180_000
      && typeof row.quoteVolume === 'number' && Number.isFinite(row.quoteVolume) && row.quoteVolume >= 0)
    : undefined;
  const recentMinuteAv = recentMinuteQuote ? { minuteStart: recentMinuteQuote.time * 1000, volume1mUsd: recentMinuteQuote.quoteVolume! } : null;

  const flush = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const delta = pending.current;
    const owner = pendingOwnerUid.current;
    if (!delta || !owner) return;
    if (owner !== activeUid.current || owner !== user?.uid) {
      pending.current = null;
      pendingOwnerUid.current = null;
      return;
    }
    // A newly signed-in profile may still be loading. Wait for its data
    // instead of overwriting an unknown profile with default settings.
    if (profile?.uid !== owner) return;
    pending.current = null;
    pendingOwnerUid.current = null;
    savingByUid.current.set(owner, (savingByUid.current.get(owner) || 0) + 1);
    if (mounted.current) setSaveStatus('saving');
    void saveRef.current({ hookChartPreferences: delta })
      .then(() => {
        if (mounted.current && activeUid.current === owner) {
          setSaveError(false);
          if (!pending.current && savingByUid.current.get(owner) === 1) setSaveStatus('saved');
        }
      })
      .catch(() => {
        if (!mounted.current || activeUid.current !== owner) return;
        pendingOwnerUid.current = owner;
        pending.current = {
          ...delta, ...pending.current,
          drawings: { ...delta.drawings, ...pending.current?.drawings },
          alerts: { ...delta.alerts, ...pending.current?.alerts },
        };
        setSaveError(true);
        setSaveStatus('error');
      })
      .finally(() => {
        const remaining = (savingByUid.current.get(owner) || 1) - 1;
        if (remaining > 0) savingByUid.current.set(owner, remaining);
        else savingByUid.current.delete(owner);
        // Rehydrate once the write finishes; the server snapshot may have
        // arrived while this chart was intentionally protecting local edits.
        if (mounted.current && activeUid.current === owner) refreshProfileSettings(value => value + 1);
      });
  }, [user?.uid, profile?.uid]);

  const queueSave = useCallback((delta: HookChartPreferences) => {
    if (!user?.uid) return;
    setSaveStatus('saving');
    if (pendingOwnerUid.current && pendingOwnerUid.current !== user.uid) {
      pending.current = null;
    }
    pendingOwnerUid.current = user.uid;
    pending.current = {
      ...pending.current,
      ...delta,
      drawings: { ...pending.current?.drawings, ...delta.drawings },
      alerts: { ...pending.current?.alerts, ...delta.alerts },
    };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 600);
  }, [user?.uid, flush]);

  useEffect(() => {
    if (user?.uid && profile?.uid === user.uid &&
      pendingOwnerUid.current === user.uid && pending.current && !saveTimer.current) flush();
  }, [profile?.uid, user?.uid, flush]);

  useEffect(() => {
    const uid = user?.uid ?? null;
    if (lastLoadedUid.current !== uid) {
      lastLoadedUid.current = uid;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      pending.current = null;
      pendingOwnerUid.current = null;
      setSaveError(false);
      setSaveStatus('idle');
    } else if (
      (pending.current && pendingOwnerUid.current === uid) ||
      (uid && (savingByUid.current.get(uid) || 0) > 0)
    ) return;
    if (user?.uid && profile?.uid !== user.uid) {
      setSettings(normalizeOriginalHookChartPreferences());
      drawingsRef.current = [];
      alertsRef.current = [];
      setDrawingsState([]);
      setAlertsState([]);
      return;
    }
    const hydrated = normalizeOriginalHookChartPreferences(preferences);
    if (!user?.uid) hydrated.maxCanvasDpr = readGuestMaxCanvasDpr();
    setSettings(hydrated);
    // Use the incoming account preference, not stale local state, to select the
    // drawing scope. Otherwise changing sharedDrawings can restore the wrong set.
    const next = archiveMode ? archiveDrawings(archiveSnapshot, symbol) : replay ? [] : (hydrated.sharedDrawings !== false ? preferences?.drawings?.[sharedScope] : undefined) || preferences?.drawings?.[scope] || [];
    const nextAlerts = (replay || archiveMode) ? [] : (hydrated.sharedDrawings !== false ? preferences?.alerts?.[sharedScope] : undefined) || preferences?.alerts?.[scope] || [];
    drawingsRef.current = next;
    alertsRef.current = nextAlerts;
    setDrawingsState(next);
    setAlertsState(nextAlerts);
  }, [user?.uid, profile?.uid, preferences, scope, sharedScope, symbol, profileSyncVersion, replay, archiveMode, archiveSnapshot]);

  useEffect(() => {
    if (user?.uid && profile?.uid !== user.uid) return;
    if (settings.siteLanguageAtSelection === siteLanguage) return;
    const delta = { language: siteLanguage, siteLanguageAtSelection: siteLanguage };
    setSettings(current => ({ ...current, ...delta }));
    if (!replay && !archiveMode) queueSave(delta);
  }, [siteLanguage, settings.siteLanguageAtSelection, user?.uid, profile?.uid, queueSave, replay, archiveMode]);

  useEffect(() => {
    mounted.current = true;
    const onPageHide = () => flush();
    window.addEventListener('pagehide', onPageHide);
    return () => { mounted.current = false; window.removeEventListener('pagehide', onPageHide); flush(); };
  }, [flush]);

  const setDrawings: React.Dispatch<React.SetStateAction<Drawing[]>> = useCallback(update => {
    const next = typeof update === 'function' ? update(drawingsRef.current) : update;
    drawingsRef.current = next;
    setDrawingsState(next);
    if (!replay && !archiveMode) queueSave({ drawings: settings.sharedDrawings !== false ? { [scope]: next, [sharedScope]: next } : { [scope]: next } });
  }, [scope, sharedScope, settings.sharedDrawings, queueSave, replay, archiveMode]);

  const setAlerts: React.Dispatch<React.SetStateAction<Alert[]>> = useCallback(update => {
    const next = typeof update === 'function' ? update(alertsRef.current) : update;
    alertsRef.current = next;
    setAlertsState(next);
    if (!replay && !archiveMode) queueSave({ alerts: settings.sharedDrawings !== false ? { [scope]: next, [sharedScope]: next } : { [scope]: next } });
  }, [scope, sharedScope, settings.sharedDrawings, queueSave, replay, archiveMode]);

  // The bell must create a real server-monitored Telegram price alert, not
  // merely a drawing persisted under hookChartPreferences. Live active server
  // alerts are projected onto any matching chart, regardless of timeframe.
  const livePriceMarkers = useMemo(
    () => chartTelegramAlerts(priceAlerts, symbol, exchange, marketType),
    [priceAlerts, symbol, exchange, marketType]
  );
  const visiblePriceMarkers = useMemo(() => replay ? alerts : [...alerts, ...livePriceMarkers], [replay, alerts, livePriceMarkers]);
  const selectedTelegramAlertId = selectedPriceMarker
    ? telegramIdFromChartMarker(selectedPriceMarker, symbol) : null;
  const selectedPriceAlert = selectedTelegramAlertId
    ? priceAlerts.find(alert => alert.id === selectedTelegramAlertId) : null;
  const selectedLocalMarker = selectedPriceMarker
    ? alerts.find(alert => alert.id === selectedPriceMarker) : null;

  // No intermediate confirmation: only the explicit trash/eraser action
  // deletes an alert. Server alerts are removed from surveillance first;
  // a failed request leaves the marker visible and reports the failure.
  const deletePriceMarker = useCallback(async (markerId: string) => {
    if (deletingMarkerIds.current.has(markerId)) return;
    const remoteId = telegramIdFromChartMarker(markerId, symbol);
    if (!visiblePriceMarkers.some(marker => marker.id === markerId)) return;
    deletingMarkerIds.current.add(markerId);
    setAlertNotice(null);
    try {
      if (remoteId) {
        if (!await deleteAlert(remoteId)) throw new Error('Не вдалося видалити Telegram-сповіщення.');
      } else {
        setAlerts(current => current.filter(marker => marker.id !== markerId));
      }
      setSelectedPriceMarker(current => current === markerId ? null : current);
      setAlertNotice({ text: 'Мітку сповіщення видалено.', error: false });
    } catch (error) {
      setAlertNotice({ text: error instanceof Error ? error.message : 'Не вдалося видалити мітку.', error: true });
    } finally {
      deletingMarkerIds.current.delete(markerId);
    }
  }, [symbol, visiblePriceMarkers, deleteAlert, setAlerts]);

  const choosePriceMarker = (markerId: string, action: 'edit' | 'delete' = 'edit') => {
    if (action === 'delete') { void deletePriceMarker(markerId); return; }
    const marker = visiblePriceMarkers.find(item => item.id === markerId);
    if (!marker) return;
    setSelectedPriceMarker(markerId);
    setEditedMarkerPrice(String(marker.p));
    setAlertNotice(null);
  };
  const createTelegramPriceAlert = useCallback(async (selectedPrice: number) => {
    if (creatingPriceAlert.current) return;
    if (replay) {
      setAlertNotice({ text: 'У режимі відтворення Telegram-сповіщення недоступні.', error: true });
      return;
    }
    if (!user) {
      setAlertNotice({ text: 'Увійдіть в акаунт, щоб встановити Telegram-сповіщення.', error: true });
      return;
    }
    if (!telegramStatus?.isConfigured) {
      setAlertNotice({ text: 'Спочатку підключіть Telegram у розділі «Сповіщення».', error: true });
      return;
    }
    const currentPrice = candles.at(-1)?.c;
    if (!Number.isFinite(selectedPrice) || selectedPrice <= 0 ||
        !currentPrice || !Number.isFinite(currentPrice) || currentPrice <= 0) {
      setAlertNotice({ text: 'Не вдалося визначити поточну ціну монети.', error: true });
      return;
    }
    // The same physical price alert is independent of candle timeframe.
    const normalizedSymbol = normalizeExchangeSymbol(symbol);
    const condition = alertConditionForPrice(selectedPrice, currentPrice);
    const alreadyActive = priceAlerts.some(alert =>
      alert.symbol === normalizedSymbol &&
      alert.exchange === exchange && alert.marketType === marketType &&
      alert.isActive && !alert.triggered &&
      alert.condition === condition &&
      Math.abs(alert.targetPrice - selectedPrice) <= Math.max(selectedPrice * 0.000001, 1e-10)
    );
    if (alreadyActive) {
      setAlertNotice({ text: 'На цій ціні вже існує активне сповіщення.', error: true });
      return;
    }

    creatingPriceAlert.current = true;
    setAlertNotice(null);
    try {
      await addAlert({
        symbol: normalizedSymbol,
        exchange,
        marketType,
        targetPrice: selectedPrice,
        condition,
        levelType: 'custom',
        formationName: focusFormation?.name,
        note: `Графік: ${condition === 'gte' ? 'ціна ≥' : 'ціна ≤'} ${selectedPrice}`,
      });
      // The saved level is rendered immediately from AlertsContext.
      // Avoid covering the chart with a redundant success banner. Failures
      // remain visible via alertNotice in the catch/validation paths.
      setTool('cursor');
    } catch (error) {
      setAlertNotice({ text: error instanceof Error ? error.message : 'Не вдалося зберегти сповіщення.', error: true });
    } finally {
      creatingPriceAlert.current = false;
    }
  }, [replay, user, telegramStatus?.isConfigured, candles, symbol, priceAlerts, exchange, marketType, addAlert, focusFormation?.name]);

  const confirmEditPriceMarker = useCallback(async () => {
    if (!selectedPriceMarker || deletingPriceMarker) return;
    const price = Number(editedMarkerPrice.replace(',', '.'));
    if (!Number.isFinite(price) || price <= 0) {
      setAlertNotice({ text: 'Вкажіть коректну додатну ціну.', error: true });
      return;
    }
    const telegramId = telegramIdFromChartMarker(selectedPriceMarker, symbol);
    const active = telegramId ? priceAlerts.find(alert => alert.id === telegramId) : null;
    const local = telegramId ? null : alerts.find(alert => alert.id === selectedPriceMarker);
    if (!active && !local) {
      setAlertNotice({ text: 'Рівень більше не існує. Оновіть графік.', error: true });
      setSelectedPriceMarker(null);
      return;
    }
    if (active && Math.abs(price - active.targetPrice) <= Math.max(price * 1e-10, 1e-10)) {
      setSelectedPriceMarker(null);
      return;
    }
    setDeletingPriceMarker(true);
    try {
      if (active) {
        // Create the new monitored level FIRST. Only after it exists server-side
        // retire the old alert, so a failed create never loses surveillance.
        // Roll back the new level if retirement fails.
        const currentPrice = candles.at(-1)?.c;
        if (!currentPrice || !Number.isFinite(currentPrice)) throw new Error('Немає поточної ціни для визначення напрямку сигналу.');
        const condition = alertConditionForPrice(price, currentPrice);
        const duplicate = priceAlerts.some(alert =>
          alert.id !== active.id && alert.isActive && !alert.triggered &&
          alert.symbol === active.symbol && alert.exchange === active.exchange &&
          alert.marketType === active.marketType && alert.condition === condition &&
          Math.abs(alert.targetPrice - price) <= Math.max(price * .000001, 1e-10));
        if (duplicate) throw new Error('На цій ціні вже є активне Telegram-сповіщення.');
        const replacement = await addAlert({
          symbol: active.symbol,
          exchange: active.exchange,
          marketType: active.marketType,
          targetPrice: price,
          condition,
          note: active.note,
          formationName: active.formationName,
          levelType: active.levelType,
          setupId: active.setupId,
          setupRole: active.setupRole,
          isActive: active.isActive,
        });
        try {
          if (!await deleteAlert(active.id)) throw new Error('Не вдалося вимкнути старий рівень.');
        } catch (error) {
          await deleteAlert(replacement.id).catch(() => false);
          throw error;
        }
      } else if (local) {
        setAlerts(list => list.map(item => item.id === selectedPriceMarker ? { ...item, p: price } : item));
      }
      setSelectedPriceMarker(null);
      setAlertNotice({ text: 'Ціну сигнального рівня оновлено.', error: false });
    } catch (error) {
      setAlertNotice({ text: error instanceof Error ? error.message : 'Не вдалося змінити сигнальний рівень.', error: true });
    } finally {
      setDeletingPriceMarker(false);
    }
  }, [selectedPriceMarker, deletingPriceMarker, editedMarkerPrice, symbol, priceAlerts, alerts, candles, addAlert, deleteAlert, setAlerts]);

  const changeSettings = (delta: HookChartPreferences) => {
    if (!replay && delta.maxCanvasDpr !== undefined) publishMaxCanvasDpr(delta.maxCanvasDpr, user?.uid ?? null);
    if (replay || archiveMode) { setSettings(current => ({ ...current, ...delta })); return; }
    if (externalData?.onAppearanceChange && (delta.candleLongColor !== undefined || delta.candleShortColor !== undefined || delta.showVolumes !== undefined))
      externalData.onAppearanceChange({ ...(delta.candleLongColor !== undefined ? { upColor: delta.candleLongColor } : {}),
        ...(delta.candleShortColor !== undefined ? { downColor: delta.candleShortColor } : {}), ...(delta.showVolumes !== undefined ? { volume: delta.showVolumes } : {}) });
    if (delta.language) delta = { ...delta, siteLanguageAtSelection: siteLanguage };
    setSettings(current => ({ ...current, ...delta, hotkeys: delta.hotkeys ? { ...current.hotkeys, ...delta.hotkeys } : current.hotkeys }));
    queueSave(delta);
  };
  const captureCurrentVisual = (key: VisualProfileKey) => {
    if (replay || key !== activeVisualKey) return;
    const plotWidth = hookChartPlotWidth(rootRef.current?.clientWidth || 800);
    const count = Math.max(1,Math.ceil(plotWidth/Math.max(.12,viewport.barWidth) - rightPaddingBars));
    const right = Math.max(0,Math.floor(viewport.rightOffset));
    const end = Math.max(0,candles.length-right);
    const visible = candles.slice(Math.max(0,end-count),end);
    let low=Infinity,high=-Infinity;
    for (const item of visible){low=Math.min(low,item.l);high=Math.max(high,item.h)}
    const autoRange=Number.isFinite(high)&&Number.isFinite(low)
      ? Math.max(high-low,Math.abs(high)*.01,1e-10)*(terminalMode?1.32:1.16) : undefined;
    const profile = captureVisualProfile(getVisualProfile(settings,activeVisualContext,visualDevice),plotWidth,viewport,autoRange);
    changeSettings({ visualProfiles: patchVisualProfile(settings.visualProfiles,key,profile) });
  };
  const toggleIndicator = (id: IndicatorId) => {
    if (replay || archiveMode) {
      if (id === 'oi') return;
      setReplayIndicators(current => current.includes(id)
        ? current.filter(item => item !== id) : [...current, id]);
      return;
    }
    const current = enabledIndicators(settings, false, 'futures');
    changeSettings({ indicators: current.includes(id) ? current.filter(x => x !== id) : [...current, id] });
  };
  const overlayKeys = { sr: 'autoSR', prevDay: 'autoPrevDay', dayOpen: 'autoDayOpen', vwap: 'autoVWAP', localHL: 'autoLocalHL', roundLevels: 'autoRoundLevels', poc: 'autoPOC', channel: 'autoChannel', stops: 'autoStops' } as const;
  const overlayEnabled = (id: string) => (replay || archiveMode)
    ? replayOverlays.includes(id) : !!settings[overlayKeys[id as keyof typeof overlayKeys]];
  const toggleOverlay = (id: string) => {
    if (replay || archiveMode) {
      setReplayOverlays(current => current.includes(id)
        ? current.filter(item => item !== id) : [...current, id]);
      return;
    }
    const key = overlayKeys[id as keyof typeof overlayKeys];
    if (!key) return;
    const overlays = settings.overlays || [];
    const enabled = !!settings[key];
    changeSettings({
      [key]: !enabled,
      overlays: enabled ? overlays.filter(item => item !== id) : Array.from(new Set([...overlays, id])),
    } as HookChartPreferences);
  };
  const applyStrategy = (id: string) => {
    const patch = strategyPreferencePatch(id);
    if (patch) changeSettings(patch);
  };
  const toggleDrawingToolbar = () => {
    if (!chartToolbarEnabled) return;
    if (archiveMode) setArchiveDrawingToolbarOpen(current => !current);
    else if (replay) setReplayDrawingToolbarOpen(current => !current);
    else if (terminalMode && terminalToolbarVisibility)
      terminalToolbarVisibility.onDrawingToolsOpenChange(!drawingToolbarOpen);
    else changeSettings({ drawingToolbarOpen: !drawingToolbarOpen });
    setPanel(null);
    setTool('cursor');
  };

  useEffect(() => {
    if (!drawingToolbarOpen) {
      setGuideOpen(false);
      setTool('cursor');
      setPanel(current => current === 'indicators' ? null : current);
    }
  }, [drawingToolbarOpen]);

  // Keep window listeners attached to the focused chart, while the event
  // reads the newest interaction state and account-safe action closures.
  const shortcutStateRef = useRef({
    changeSettings, setAlerts, terminalMode, panel,
    densityQuickOpen, keyboardMagnifierActive,
  });
  shortcutStateRef.current = {
    changeSettings, setAlerts, terminalMode, panel,
    densityQuickOpen, keyboardMagnifierActive,
  };
  useEffect(() => {
    const hotkeys = { ...DEFAULT_HOOKCHART_HOTKEYS, ...(settings.hotkeys || {}) };
    const onKeyDown = (event: KeyboardEvent) => {
      const { changeSettings, setAlerts, terminalMode, panel,
        densityQuickOpen, keyboardMagnifierActive } = shortcutStateRef.current;
      if (event.defaultPrevented || !rootRef.current?.contains(document.activeElement)) return;
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (typing && event.key !== 'Escape') return;
      const matchesShortcut = (action: keyof typeof hotkeys) => hotkeyMatches(event, hotkeys[action]);
      if (matchesShortcut('tempRuler')) { if (!event.repeat && !tempRulerRef.current) { event.preventDefault(); tempRulerRef.current = { code: event.code, tool }; setTool('ruler'); } return; }
      if (matchesShortcut('cancel')) {
        // Terminal's Escape closes the page only when the focused chart is idle.
        // During drawing/inspection Escape first cancels the active operation.
        if (terminalMode && tool === 'cursor' && !panel && !densityQuickOpen && !keyboardMagnifierActive)
          return;
        event.preventDefault();
        setTool('cursor'); setPanel(null); setDensityQuickOpen(false); setKeyboardMagnifierActive(false);
        return;
      }
      if (matchesShortcut('toggleDensity') && !replay && !archiveMode) {
        event.preventDefault();
        // Determine visibility from the master analysis switch as well as
        // presentation flags: otherwise a previously disabled analysis takes
        // two keypresses to become visible.
        const visible = settings.densityAnalysis !== false &&
          (settings.showDensityLines === true || settings.showDensityLabels === true);
        changeSettings({
          showDensityLines: !visible, showDensityLabels: !visible, showDensityAmounts: !visible,
          densityAnalysis: !visible,
        });
        return;
      }
      if (matchesShortcut('toggleLiquidations') && !replay && !archiveMode) {
        event.preventDefault(); changeSettings({ showLiquidations: settings.showLiquidations === false }); return;
      }
      if (matchesShortcut('toggleLiqCandleSums') && !replay && !archiveMode) {
        event.preventDefault(); changeSettings({ showLiquidationCandleSums: settings.showLiquidationCandleSums === false }); return;
      }
      if (matchesShortcut('toggleMarketPrintSums') && !replay && !archiveMode) {
        event.preventDefault(); changeSettings({ showMarketPrintSums: settings.showMarketPrintSums !== true }); return;
      }
      if (matchesShortcut('toggleMagnifier')) {
        event.preventDefault(); setKeyboardMagnifierActive(current => !current); setTool('cursor'); return;
      }
      if (matchesShortcut('zoomIn')) { event.preventDefault(); engineRef.current?.zoom(1.18); return; }
      if (matchesShortcut('zoomOut')) { event.preventDefault(); engineRef.current?.zoom(0.84); return; }
      if (matchesShortcut('copyTicker')) { event.preventDefault(); void navigator.clipboard?.writeText(symbol); return; }
      if (matchesShortcut('openWindow')) { event.preventDefault(); window.open(window.location.href, '_blank', 'noopener,noreferrer'); return; }
      if (matchesShortcut('level')) { event.preventDefault(); setTool('level'); return; }
      if (matchesShortcut('trend')) { event.preventDefault(); setTool('trend'); return; }
      if (matchesShortcut('ray')) { event.preventDefault(); setTool('ray'); return; }
      if (matchesShortcut('fib')) { event.preventDefault(); setTool('fib'); return; }
      if (matchesShortcut('erase')) { event.preventDefault(); setTool(current => current === 'erase' ? 'cursor' : 'erase'); return; }
      if (matchesShortcut('clearAlerts')) { event.preventDefault(); setAlerts([]); return; }
      if (matchesShortcut('signalLevel') && !archiveMode) { event.preventDefault(); setTool('alert'); return; }
      const choices = externalData?.timeframes || (terminalMode ? TERMINAL_TIMEFRAMES : TIMEFRAMES), index = choices.indexOf(timeframe);
      const changeTimeframe = externalData?.onTimeframeChange || onTimeframeChange;
      if (changeTimeframe && !replay && matchesShortcut('prevTf')) { event.preventDefault(); changeTimeframe(choices[Math.max(0, index - 1)] as Timeframe); return; }
      if (changeTimeframe && !replay && matchesShortcut('nextTf')) { event.preventDefault(); changeTimeframe(choices[Math.min(choices.length - 1, index + 1)] as Timeframe); return; }
      for (const action of ['openMetaScalp', 'deleteCoin', 'toggleFavorites', 'prevCoin', 'nextCoin', 'prevChart', 'nextChart', 'prevTfAll', 'nextTfAll'] as const) {
        if (matchesShortcut(action)) {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent('signalhook:hookchart-hotkey', { detail: { action, symbol, exchange, marketType, timeframe } }));
          return;
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const active = tempRulerRef.current;
      if (active && event.code === active.code) {
        setTool(active.tool);
        tempRulerRef.current = null;
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [settings.hotkeys, settings.densityAnalysis, settings.showDensityLines, settings.showDensityLabels, settings.showLiquidations,
    settings.showLiquidationCandleSums, settings.showMarketPrintSums, symbol, exchange, marketType,
    timeframe, replay, archiveMode, onTimeframeChange, externalData?.timeframes, externalData?.onTimeframeChange, tool]);

  // The history action retains its stable market scope and reads current
  // candles on-demand. A new real-time candle must not replace the handler.
  const chartHistorySourcesRef = useRef({ externalData, klines });
  chartHistorySourcesRef.current = { externalData, klines };
  // Replay is deliberately isolated: only the simulator's visible candles are passed to the engine.
  const needHistory = useCallback(async (timestamp: number) => {
    const { externalData, klines } = chartHistorySourcesRef.current;
    if (replay || timestamp > Date.now() || timeframe === '30s') return false;
    if (externalData) return externalData.onNeedHistory(timestamp);
    if (archiveMode && archiveOnNeedHistory) return archiveOnNeedHistory(timestamp);
    if (archiveMode) {
      const before = scopedHookChartHistoryRows(extraHistoryRef.current, historyScope);
      const max = 5000;
      const remaining = max - klines.length - before.length;
      if (remaining <= 0 || !isValidExchangeSymbol(normalizeExchangeSymbol(symbol))) return false;
      const oldest = Math.min(...[...klines, ...before].map(row => row.time));
      const cursor = Math.min(timestamp, oldest * 1000 - 1);
      try {
        setHistoryState({ scope: historyScope, status: 'loading' });
        const older = await fetchSharedHistoricalKlines({
          exchange, marketType, symbol, timeframe: timeframe as Timeframe,
          limit: Math.min(500, remaining), endTime: cursor,
        });
        if (!mounted.current || !older.some(row => row.time < oldest)) {
          if (mounted.current) setHistoryState({ scope: historyScope, status: 'limited' });
          return false;
        }
        setExtraHistory(previous => ({ scope: historyScope,
          rows: mergeTerminalOlderHistory(
            scopedHookChartHistoryRows(previous, historyScope), older,
            cursor, Math.max(0, max - klines.length),
          ),
        }));
        setHistoryState({ scope: historyScope, status: 'idle' });
        return true;
      } catch {
        if (mounted.current) setHistoryState({ scope: historyScope, status: 'error' });
        return false;
      }
    }
    if (terminalMode) {
      // Only a user navigating into older bars loads Terminal history. Each
      // request is shared with other charts of the same market and cursor.
      const before = scopedHookChartHistoryRows(extraHistoryRef.current, historyScope);
      const max = maxChartCandles ?? 1000;
      const remaining = max - klines.length - before.length;
      if (remaining <= 0 || !isValidExchangeSymbol(normalizeExchangeSymbol(symbol))) return false;
      try {
        setHistoryState({ scope: historyScope, status: 'loading' });
        const older = await fetchSharedHistoricalKlines({
          exchange, marketType, symbol, timeframe: timeframe as Timeframe,
          limit: Math.min(500, remaining), endTime: timestamp,
        });
        if (!mounted.current || !older.length) {
          if (mounted.current) setHistoryState({ scope: historyScope, status: 'limited' });
          return false;
        }
        setExtraHistory(previous => ({
          scope: historyScope,
          rows: mergeTerminalOlderHistory(
            scopedHookChartHistoryRows(previous, historyScope), older,
            timestamp, Math.max(0, max - klines.length),
          ),
        }));
        setHistoryState({ scope: historyScope, status: 'idle' });
        return true;
      } catch {
        if (mounted.current) setHistoryState({ scope: historyScope, status: 'error' });
        return false;
      }
    }
    const { allCandles: rows } = await fetchHistoricalReplayCandles(exchange, marketType, symbol, timeframe as Timeframe, timestamp);
    if (!mounted.current) return false;
    if (!rows.some(row => Math.abs(row.time * 1000 - timestamp) < 86_400_000)) return false;
    setExtraHistory(previous => ({
      scope: historyScope,
      rows: [...scopedHookChartHistoryRows(previous, historyScope), ...rows].slice(-40_000),
    }));
    return true;
  }, [exchange, marketType, symbol, timeframe, replay, terminalMode, maxChartCandles, klines.length,
    historyScope, archiveMode, archiveOnNeedHistory]);

  const visibleOldestTime = candles[0]?.t, visibleCandleCount = candles.length;
  useEffect(() => {
    const historySource = chartHistorySourcesRef.current.externalData;
    if (!historySource || !visibleCandleCount || viewport.fitAll || visibleOldestTime === undefined) return;
    const width = rootRef.current?.clientWidth || 600;
    const start = visibleCandleCount - viewport.rightOffset - width / Math.max(.12, viewport.barWidth);
    if (start < 25) void historySource.onNeedHistory(visibleOldestTime - 1);
  }, [hasExternalData, visibleOldestTime, visibleCandleCount,
    viewport.rightOffset, viewport.barWidth, viewport.fitAll]);

  useEffect(() => {
    if (focusTrigger !== undefined) engineRef.current?.zoomToLatest();
  }, [focusTrigger]);

  const showOi = !archiveMode && (indicators.includes('oi') || !!activeStrategy?.config.oiWindow);
  useEffect(() => {
    if (!showOi || replay || hasExternalData || timeframe === '30s' || marketType !== 'futures') {
      oiEvidenceScope.current = '';
      setOi(EMPTY_OI); setOiError(false); return;
    }
    const normalizedSymbol = normalizeExchangeSymbol(symbol);
    const query = new URLSearchParams({ symbol: normalizedSymbol, timeframe });
    // The OI response includes both exchanges. Share one timer/result across
    // matching graphs rather than polling the same public endpoint per chart.
    return sharedPublicChartPolling.subscribe(
      ['oi', normalizedSymbol, timeframe].join(':'),
      () => fetchSharedChartJson('/api/derivatives/oi/history?' + query),
      {
        onData: data => {
          if (!data.success || (!data.binance?.length && !data.bybit?.length)) {
            setOiError(true);
            return;
          }
          setOi({ binance: data.binance || [], bybit: data.bybit || [] });
          oiEvidenceScope.current = normalizedSymbol + ':' + timeframe;
          setOiError(false);
        },
        onError: () => setOiError(true),
      },
    );
  }, [showOi, symbol, timeframe, replay, marketType, hasExternalData]);

  // Only construct a capture when Save Archive is explicitly pressed.
  // Its coordinates and visibility correspond to THIS chart at that moment,
  // not a shared user preference or a later live market re-calculation.
  archiveCaptureRef.current = () => {
    const image=engineRef.current?.takeArchiveScreenshot?.();
    if(!image)return null;
    // Reuse already-filtered DOM levels and the exact visible viewport;
    // this runs only for an explicit archive save.
    const density=engineRef.current?.takeArchiveDensityScene?.();
    const overlayScene = engineRef.current?.takeArchiveOverlayScene?.() || {};
    const overlays: ArchivedChartSnapshot['overlays'] = [];
    if(runtimeSettings.autoSR)overlays.push('sr');
    if(runtimeSettings.autoPrevDay)overlays.push('prevDay');
    if(runtimeSettings.autoDayOpen)overlays.push('dayOpen');
    if(runtimeSettings.autoVWAP)overlays.push('vwap');
    if(runtimeSettings.autoLocalHL)overlays.push('localHL');
    if(runtimeSettings.autoRoundLevels)overlays.push('roundLevels');
    if(runtimeSettings.autoPOC)overlays.push('poc');
    if(runtimeSettings.autoChannel)overlays.push('channel');
    if(runtimeSettings.autoStops)overlays.push('stops');
    const savedScalperLines = scalperResult?.setups.flatMap(setup => setup.lines) || [];
    const visibleOverlayKeys = new Set(archiveVisibleOverlayKeys(overlayScene));
    const actuallyVisible = overlays.filter(key => visibleOverlayKeys.has(key));
    return buildArchivedChartSnapshot({
      version:1, capturedAt:Date.now(),
      marketKey:archiveVisualMarketKey(exchange,marketType,symbol,timeframe),
      timeframe:timeframe as Timeframe, image,
      drawings:drawingsRef.current.filter(d => d.id.startsWith(symbol+':')),
      overlays: actuallyVisible, overlayScene,
      srMarkersVisible: engineRef.current?.takeArchiveVisibleSrMarkers?.() === true,
      scalperEnabled:savedScalperLines.length > 0,
      scalperRegression:!!runtimeSettings.scalperRegressionMode,
      scalperLabels:runtimeSettings.showScalperLabels !== false,
      scalperLines:savedScalperLines,
      liquidationMap:{ enabled:!!mapChartData && liquidationMapOn,period:liquidationMapPeriod },
      ...(density ? {density} : {}),
      tradeLevels:{
        entry:markers.some(marker => marker.type === 'entry'),
        target:markers.some(marker => marker.type === 'target'),
        stop:markers.some(marker => marker.type === 'stop_loss'),
      },
    });
  };

  const assignRef = useCallback((handle: HookChartHandle | null) => {
    engineRef.current = handle;
    const capturedHandle = handle ? { ...handle, captureArchiveSnapshot: () => archiveCaptureRef.current() } : null;
    if (typeof forwardedRef === 'function') forwardedRef(capturedHandle);
    else if (forwardedRef) forwardedRef.current = capturedHandle;
  }, [forwardedRef]);

  // Keep popovers outside the horizontally scrolling strip so they are not clipped.
  const toolbarPopup = (popup: React.ReactNode) => rootRef.current
    ? createPortal(popup, rootRef.current) : popup;
  const availableTimeframes = externalData?.timeframes || (terminalMode ? TERMINAL_TIMEFRAMES : TIMEFRAMES);
  const canChangeTimeframe = !!(externalData || onTimeframeChange);
  const selectTimeframe = (tf: string) => {
    if (externalData) externalData.onTimeframeChange(tf);
    else onTimeframeChange?.(tf as Timeframe);
  };
  const timeframePicker = canChangeTimeframe
    ? <HookChartTimeframePicker
        timeframes={availableTimeframes}
        timeframe={timeframe}
        disabled={replay && timeframeDisabled}
        compactAvailable={topToolbarOpen}
        onChange={selectTimeframe}
      />
    : <div className="hookchart-timeframes" role="group" aria-label="Таймфрейм">
        <span>{timeframe}</span>
      </div>;

  return <div ref={rootRef} className={'hookchart-root' + (replayReview ? ' hookchart-replay-review' : '') + (terminalMode ? ' hookchart-terminal' : '') + (visualContext === 'formationsQuick' ? ' hookchart-formations-quick' : '') + (screenerCardCompactLayout ? ' hookchart-screener-card-compact' : '')} data-chart-provider="hookchart" data-extra-tools-open={topToolbarOpen ? 'true' : 'false'} data-hookchart-language={chartLanguage} lang={chartLanguage}>
    <div ref={toolbarRef} className={'hookchart-toolbar' + (integratedToolbar ? ' hookchart-terminal-toolbar' : '')} role="toolbar" aria-label="Верхня панель hookchart" aria-orientation="horizontal">
      {integratedToolbar ? <div className="hookchart-terminal-scroll" role="group" aria-label="Монета, біржа та таймфрейми">
        <div className="hookchart-toolbar-actions" role="group" aria-label="Інструменти блока">{toolbarActions}</div>
        {timeframePicker}
      </div> : timeframePicker}

      {!archiveMode && <button
        type="button"
        className="topToolbarToggle"
        aria-expanded={topToolbarOpen}
        aria-label={topToolbarOpen ? 'Згорнути панель інструментів HookChart' : 'Розгорнути панель інструментів HookChart'}
        title={settings.tooltips !== false ? (topToolbarOpen ? 'Згорнути панель інструментів' : 'Розгорнути панель інструментів') : undefined}
        onClick={() => {
          if (replay) setReplayToolsOpen(current => !current);
          else if (integratedToolbar && terminalToolbarVisibility)
            terminalToolbarVisibility.onExtraToolsOpenChange(!terminalExtraToolsOpen);
          else if (integratedToolbar) changeSettings({ terminalExtraToolsOpen: !terminalExtraToolsOpen });
          else changeSettings({ showTopToolbarIcons: !topToolbarOpen });
          setDensityQuickOpen(false);
        }}
      >
        {topToolbarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>}

      {replay && !topToolbarOpen && onReplayPlaybackSpeedChange && (
        <>
          <ReplaySpeedPicker speed={replayPlaybackSpeed ?? 1} onSpeedChange={onReplayPlaybackSpeedChange} />
          {onReplayHistoryToggle && <button type="button"
            onClick={onReplayHistoryToggle}
            disabled={timeframeDisabled || replayHistoryLoading || !klines.length}
            title={t(replayHistoryExpanded ? 'replay.chart.history.hide' : 'replay.chart.history.title')}
            aria-label={t(replayHistoryExpanded ? 'replay.chart.history.hide' : 'replay.chart.history.title')}
            aria-pressed={!!replayHistoryExpanded}
            className={'inline-flex h-[29px] shrink-0 items-center rounded-md border px-2 transition-colors disabled:opacity-40 ' +
              (replayHistoryExpanded ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300' : 'border-slate-700 bg-slate-900 text-slate-300 hover:text-cyan-300')}>
            <History className={'h-4 w-4' + (replayHistoryLoading ? ' animate-spin' : '')} aria-hidden="true" />
          </button>}
        </>
      )}

      {!integratedToolbar && toolbarActions && <div className="hookchart-toolbar-actions" role="group" aria-label="Інструменти блока">{toolbarActions}</div>}

      {/* Standalone quick charts keep these tools inline with timeframes.
          Integrated terminal charts retain their separate dock. */}
      {topToolbarOpen && <div className={'hookchart-extra-dock ' + (integratedToolbar ? 'hookchart-terminal-extra-dock' : 'hookchart-standalone-extra-dock')} role="group" aria-label="Додаткові інструменти HookChart">
        {integratedToolbar && <button type="button" className="hookchart-extra-nav" title="Прокрутити інструменти вліво" aria-label="Прокрутити додаткові інструменти вліво" onClick={() => scrollExtraTools(-1)}>
          <ChevronLeft size={15} />
        </button>}
        <div
          ref={extraToolsRef}
          className={integratedToolbar ? 'hookchart-terminal-extra-row' : 'hookchart-standalone-extras'}
          role="group"
          aria-label="Прокручуваний список додаткових інструментів"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              scrollExtraTools(event.key === 'ArrowLeft' ? -1 : 1);
            }
          }}
        >
          {/* A max-content inner rail prevents flex items from shrinking to the
              viewport. Without real overflow there is nothing for wheel/touch
              scrolling to move, even with a working event handler. */}
          <div className="hookchart-extras-content">
        {!replay && tradeLevelToggle && <button
          type="button"
          className={'trade-level-toggle-button' + (tradeLevelToggle.visible && tradeLevelToggle.available !== false ? ' active' : '')}
          aria-label={tradeLevelToggle.available === false ? TRADE_LEVEL_TOGGLE_LABELS[chartLanguage].unavailable : tradeLevelToggle.visible ? TRADE_LEVEL_TOGGLE_LABELS[chartLanguage].hide : TRADE_LEVEL_TOGGLE_LABELS[chartLanguage].show}
          title={settings.tooltips !== false ? (tradeLevelToggle.available === false ? TRADE_LEVEL_TOGGLE_LABELS[chartLanguage].unavailableTitle : tradeLevelToggle.visible ? TRADE_LEVEL_TOGGLE_LABELS[chartLanguage].hide : TRADE_LEVEL_TOGGLE_LABELS[chartLanguage].show) : undefined}
          aria-pressed={tradeLevelToggle.visible}
          disabled={tradeLevelToggle.available === false}
          onClick={tradeLevelToggle.onToggle}
        >
          <Target size={14} />
          <span>TP/SL</span>
        </button>}

        {!replay && necklineToggle?.available && <button
          type="button"
          className={'neckline-toggle-button' + (necklineToggle.visible ? ' active' : '')}
          title={settings.tooltips !== false ? (necklineToggle.visible ? NECKLINE_TOGGLE_LABELS[chartLanguage].hide : NECKLINE_TOGGLE_LABELS[chartLanguage].show) : undefined}
          aria-label={necklineToggle.visible ? NECKLINE_TOGGLE_LABELS[chartLanguage].hide : NECKLINE_TOGGLE_LABELS[chartLanguage].show}
          aria-pressed={necklineToggle.visible}
          onClick={necklineToggle.onToggle}
        >
          <NecklineIcon />
        </button>}

        {!replay && !archiveMode && (terminalMode || visualContext === 'terminalLarge') && terminalArchiveSave && <button
          type="button"
          data-terminal-archive-save="true"
          title={({
            uk: 'Зберегти монету в Збережені формації',
            en: 'Save coin to Saved Formations',
            pl: 'Zapisz monetę w Zapisanych formacjach',
            ru: 'Сохранить монету в Сохранённые формации',
          } as const)[chartLanguage]}
          aria-label={({
            uk: 'Зберегти монету в Збережені формації',
            en: 'Save coin to Saved Formations',
            pl: 'Zapisz monetę w Zapisanych formacjach',
            ru: 'Сохранить монету в Сохранённые формации',
          } as const)[chartLanguage]}
          disabled={terminalArchiveSave.saving}
          className={terminalArchiveSave.saving ? 'opacity-50' : ''}
          onClick={terminalArchiveSave.onSave}
        >
          <FormationArchiveIcon width={16} height={16} />
        </button>}

        {!replay && <div className="densityQuickWrap">
          <button
            type="button"
            title={settings.tooltips !== false ? 'Поріг щільностей' : undefined}
            aria-label="Поріг щільностей"
            aria-expanded={densityQuickOpen && !ecoActive}
            disabled={ecoActive}
            className={densityQuickOpen ? 'active' : ''}
            onClick={(event) => {
              if (!integratedToolbar && rootRef.current) {
                const rootBounds = rootRef.current.getBoundingClientRect();
                const triggerBounds = event.currentTarget.getBoundingClientRect();
                setDensityPopupLeft(Math.max(8, Math.min(triggerBounds.left - rootBounds.left, rootBounds.width - 226)));
              }
              setDensityQuickOpen(value => !value);
            }}
          >
            <Layers size={15} />
          </button>
          {densityQuickOpen && !ecoActive && toolbarPopup(<div className="densityQuickPopup" style={!integratedToolbar ? { left: densityPopupLeft, top: 32 } : undefined}>
            <div className="densityQuickHead">
              <span>Поріг щільностей</span>
              <b>{liveFeed.densityCut > 0 ? <>≥ &#36;{liveFeed.densityCut.toLocaleString()}</> : '—'} · {chartDensities.length}/{liveFeed.densities.length}</b>
            </div>
            <div className="densityQuickStatus" role="status" data-live={liveFeed.depthReady && liveFeed.densityCut > 0}>
              {liveFeed.depthReady
                ? (liveFeed.densityCut > 0 ? 'Стакан наживо' : settings.densityMode === 'manual' ? 'Недостатньо заявок у діапазоні' : 'Недостатньо рівнів для AUTO')
                : liveFeed.depthStatus === 'disabled' ? 'Живий стакан вимкнено у відтворенні'
                : liveFeed.depthStatus === 'unavailable' ? 'Біржовий стакан недоступний'
                : liveFeed.depthStatus === 'reconnecting' ? 'Відновлення стакана'
                : liveFeed.depthStatus === 'syncing' ? 'Синхронізація стакана' : 'Підключення стакана'}
            </div>
            {liveFeed.tradeIntegrity === 'incomplete' && <div className="densityQuickStatus" role="alert" data-live={false}>
              {siteLanguage === 'en' ? 'Incomplete trade feed — buy/sell analytics paused to prevent inaccurate volume'
                : siteLanguage === 'pl' ? 'Niepełne dane transakcji — wstrzymano statystyki kupna/sprzedaży'
                : siteLanguage === 'ru' ? 'Неполные данные сделок — аналитика покупок/продаж приостановлена'
                : 'Дані угод неповні — аналітику покупок і продажів призупинено'}
            </div>}
            {settings.densityMode !== 'manual' && liveFeed.depthReady && liveFeed.densityAutoStats.baseline > 0 && <div className="densityQuickAutoStats">
              <div><span>BID (проти продажів)</span><b>${liveFeed.densityAutoStats.bidCut.toLocaleString()}</b></div>
              <div><span>ASK (проти покупок)</span><b>${liveFeed.densityAutoStats.askCut.toLocaleString()}</b></div>
              <small>4× медіана · частка локального стакана ≥25% · зустрічні угоди 5 хв ×0,5</small>
            </div>}
            <div className="densityQuickModes">
              <button type="button" className={settings.densityMode !== 'manual' ? 'sel' : ''} onClick={() => {
                setDensityThresholdDraft(null);
                changeSettings({ densityMode: 'auto', densityAnalysis: true,
                  showDensityLines: true, showDensityLabels: true, showDensityAmounts: true });
              }}>AUTO</button>
              <button type="button" className={settings.densityMode === 'manual' ? 'sel' : ''} onClick={() => {
                const seed = settings.densityMode === 'manual' && (settings.densityThreshold || 0) > 0
                  ? settings.densityThreshold! : Math.max(1, Math.ceil(liveFeed.densityCut || settings.densityThreshold || 50_000));
                setDensityThresholdDraft(null);
                changeSettings({ densityMode: 'manual', densityThreshold: seed,
                  showDensityLines: true, showDensityLabels: true, showDensityAmounts: true });
              }}>MANUAL</button>
            </div>
            {settings.densityMode !== 'manual' && <div className="densityQuickReaction">
              <div className="densityQuickTierModes" role="group" aria-label="Фільтр реакції щільностей">
                <button type="button" aria-pressed={(settings.densityAutoDisplay || 'potential') === 'all'}
                  className={(settings.densityAutoDisplay || 'potential') === 'all' ? 'sel' : ''}
                  onClick={() => changeSettings({ densityAutoDisplay: 'all' })}>Усі сильні</button>
                <button type="button" aria-pressed={(settings.densityAutoDisplay || 'potential') === 'potential'}
                  className={(settings.densityAutoDisplay || 'potential') === 'potential' ? 'sel' : ''}
                  onClick={() => changeSettings({ densityAutoDisplay: 'potential' })}>Потенціал реакції</button>
              </div>
              <small>Високий потенціал: {potentialDensityCount} із {liveFeed.densities.length}. Вік ≥30 с, дотик ціни, виконання угод або поповнення. Рейтинг не є % ймовірності.</small>
              {liveFeed.depthReady && liveFeed.densities.length > 0 && potentialDensityCount === 0 &&
                <small>Поки немає підтверджень. Перемкни «Усі сильні», щоб бачити заявки до контакту з ціною.</small>}
            </div>}
            <label className="densityQuickInput">
              <span>$</span>
              <input
                type="number"
                min="1"
                step="1"
                aria-label="Поріг щільностей (USDT)"
                placeholder="Очікування даних"
                value={densityThresholdDraft ?? (settings.densityMode !== 'manual'
                  ? (liveFeed.densityCut > 0 ? String(liveFeed.densityCut) : '')
                  : String(settings.densityThreshold || ''))}
                onFocus={event => {
                  setDensityThresholdDraft(event.currentTarget.value);
                  event.currentTarget.select();
                }}
                onChange={event => {
                  const value = event.target.value;
                  setDensityThresholdDraft(value);
                  const threshold = Number(value);
                  if (value && Number.isFinite(threshold) && threshold >= 1) {
                    changeSettings({ densityMode: 'manual', densityThreshold: Math.round(threshold),
                      showDensityLines: true, showDensityLabels: true, showDensityAmounts: true });
                  }
                }}
                onBlur={() => {
                  setDensityThresholdDraft(null);
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
            </label>
            <label className="densityHoldInput">
              <span>Дистанція від ціни</span>
              <input
                type="number"
                inputMode="decimal"
                min="0.1"
                max="20"
                step="0.1"
                aria-label="Дистанція щільностей (%)"
                value={densityDistanceDraft ?? normalizeDensityDistance(settings.densityDiffPct)}
                onFocus={event => {
                  setDensityDistanceDraft(event.currentTarget.value);
                  event.currentTarget.select();
                }}
                onChange={event => {
                  const draft = event.currentTarget.value;
                  setDensityDistanceDraft(draft);
                  const value = Number(draft);
                  if (draft && Number.isFinite(value) && value >= .1 && value <= 20) changeSettings({ densityDiffPct: value });
                }}
                onBlur={() => {
                  if (densityDistanceDraft && Number.isFinite(Number(densityDistanceDraft))) {
                    changeSettings({ densityDiffPct: normalizeDensityDistance(Number(densityDistanceDraft)) });
                  }
                  setDensityDistanceDraft(null);
                }}
                onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
              />
              <b>%</b>
            </label>
            <small className="densityQuickHint">У межах доступної глибини стакана біржі.</small>
            <div className="densityQuickVisibility">
              <button type="button" className={settings.showDensityLines ? 'on' : ''} onClick={() => changeSettings({ showDensityLines: !settings.showDensityLines })}>МІТКИ</button>
              <button
                type="button"
                className={settings.showDensityLabels && settings.showDensityAmounts ? 'on' : ''}
                onClick={() => {
                  const on = !(settings.showDensityLabels && settings.showDensityAmounts);
                  changeSettings({ showDensityLabels: on, showDensityAmounts: on });
                }}
              >
                СУМИ
              </button>
            </div>
            <label className="densityHoldInput">
              <span>Час утримання</span>
              <input
                type="number"
                min="0"
                max="7200"
                step="10"
                value={Math.round((settings.densityTimeoutMin || 0) * 60)}
                onChange={event => changeSettings({ densityTimeoutMin: Math.max(0, Number(event.target.value) || 0) / 60 })}
              />
              <b>сек</b>
            </label>
          </div>)}
        </div>}

        <div className="autoOverlayTools" role="group" aria-label="Автоматичні рівні">
          {OVERLAYS.map(([id, label]) => <button
            key={id}
            type="button"
            title={settings.tooltips !== false ? label : undefined}
            aria-label={label}
            aria-pressed={overlayEnabled(id)}
            className={overlayEnabled(id) ? 'active' : ''}
            onClick={() => toggleOverlay(id)}
          >
            <OverlayIcon kind={id} />
          </button>)}
        </div>
          </div>
        </div>
        {integratedToolbar && <button type="button" className="hookchart-extra-nav" title="Прокрутити інструменти вправо" aria-label="Прокрутити додаткові інструменти вправо" onClick={() => scrollExtraTools(1)}>
          <ChevronRight size={15} />
        </button>}
      </div>}

      {!archiveMode && <div className={liquidationMapSupported ? "toolbarRight hasLiqMap" : "toolbarRight"}>
        {liquidationMapSupported && <div className="liqHeatmapTools" role="group" aria-label="Карта ліквідацій">
          {liquidationMapOn && (['24h','7d'] as const).map(period => (
            <button
              key={period}
              type="button"
              className={'liqHeatmapPeriod' + (liquidationMapPeriod === period ? ' active' : '')}
              disabled={ecoActive}
              aria-label={'Період карти ліквідацій ' + period}
              aria-pressed={liquidationMapPeriod === period}
              onClick={() => setLiquidationMapPeriod(period)}
            >
              {period}
            </button>
          ))}
          <button
            type="button"
            className={'liqHeatmapSwitch' + (liquidationMapOn ? ' active' : '')}
            disabled={ecoActive}
            aria-label={liquidationMapOn ? 'Вимкнути карту ліквідацій' : 'Увімкнути карту ліквідацій'}
            title={ecoActive ? 'Карту ліквідацій призупинено в ECO; її стан відновиться після вимкнення ECO' : settings.tooltips !== false ? (liquidationMapOn
              ? 'Вимкнути карту ліквідацій (отримані події, не прогноз)'
              : 'Увімкнути карту ліквідацій (отримані події, не прогноз)') : undefined}
            aria-pressed={liquidationMapOn}
            onClick={() => {
              if (liquidationMapOn) {
                setLiquidationMapOn(false);
                setLiquidationMapState(null);
              } else {
                setLiquidationMapOn(true);
              }
            }}
          >
            <MapIcon size={15} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>}
        {!replay && !archiveMode && !externalData && <MarketRecurrenceTool
          rootRef={rootRef}
          candles={candles}
          exchange={exchange}
          marketType={marketType}
          symbol={symbol}
          timeframe={timeframe}
          language={chartLanguage}
          disabled={ecoActive}
          showTooltip={settings.tooltips !== false}
          onResultsChange={onRecurrenceResultsChange}
        />}
        {!replay && <button
          type="button"
          title={settings.tooltips !== false ? 'Налаштування графіка' : undefined}
          aria-label="Налаштування hookchart"
          aria-expanded={panel === 'settings'}
          className={'chartSettingsBtn ' + (panel === 'settings' ? 'active' : '')}
          onClick={() => setPanel(panel === 'settings' ? null : 'settings')}
        >
          <Settings size={14} />
        </button>}
        {chartActions && <div className="hookchart-chart-actions" role="group" aria-label="Дії графіка">
          {chartActions}
        </div>}
      </div>}
    </div>

    {toolbarOverlays && <div className="hookchart-toolbar-overlays">{toolbarOverlays}</div>}

    {!replay && panel === 'settings' && typeof document !== 'undefined' && createPortal(
      <div className="hookchart-root hookchart-settings-portal" data-hookchart-language={chartLanguage} lang={chartLanguage}>
        <OriginalHookChartSettings
          open
          language={chartLanguage}
          densityCut={liveFeed.densityCut}
          loadedCandles={candles.length}
          historyStatus={historyStatus}
          onRetryHistory={() => setHistoryRetry(previous => previous + 1)}
          prefs={{ ...settings, language: chartLanguage, ...(externalData ? { candleLongColor: externalData.appearance.upColor, candleShortColor: externalData.appearance.downColor, showVolumes: externalData.appearance.volume } : {}) }}
          onChange={changeSettings}
          saveStatus={saveStatus}
          onApplyStrategy={applyStrategy}
          guidedTab={guideSettingsTab}
          activeVisualContext={activeVisualContext}
          currentViewport={viewport}
          currentPlotWidth={hookChartPlotWidth(rootRef.current?.clientWidth || 800)}
          onCaptureVisual={captureCurrentVisual}
          onResetVisual={key => { if (key === activeVisualKey) engineRef.current?.zoomToLatest(); }}
          previewCandles={candles}
          previewSymbol={symbol}
          previewTimeframe={timeframe}
          previewExchange={exchange}
          previewMarketType={marketType}
          previewTimezone={timezone}
          previewLongColor={externalData?.appearance.upColor || settings.candleLongColor || '#0ECB81'}
          previewShortColor={externalData?.appearance.downColor || settings.candleShortColor || '#F6465D'}
          onClose={closeSettings}
        />
      </div>,
      document.body,
    )}

    {!replay && panel === 'settings' && <div className="hookchart-options hookchart-options-compat" aria-hidden="true">
      <button type="button" aria-label="Закрити налаштування hookchart" onClick={() => setPanel(null)} />
      {OVERLAYS.map(([id, label]) => <label key={id}>
        <input type="checkbox" checked={overlayEnabled(id)} onChange={() => toggleOverlay(id)} />
        {label}
      </label>)}
    </div>}

    {saveError && <button type="button" className="hookchart-save-error" onClick={flush}>Не вдалося зберегти налаштування. Повторити</button>}
    {oiError && <span className="hookchart-feed-status" role="status">Дані OI тимчасово недоступні</span>}

    <div className="chartStage" data-drawing-tools={drawingToolbarOpen ? 'open' : 'closed'}>
      {/* Mount on user action only. OFF: no polling, no endpoint, no timer and
          no additional canvas painting. Different coins never share a scope. */}
      {!ecoActive && liquidationMapOn && liquidationMapSupported && (
        <React.Suspense fallback={null}>
          <LazyLiquidationHeatmapLoader
            key={liquidationMapScope}
            exchange={exchange as 'binance' | 'bybit'}
            symbol={normalizeExchangeSymbol(symbol).toUpperCase()}
            period={liquidationMapPeriod}
            onData={onLiquidationMapData}
          />
        </React.Suspense>
      )}
      {chartToolbarEnabled && <button
        type="button"
        className={`drawPanelToggle ${drawingToolbarOpen ? 'open' : ''}`}
        aria-expanded={drawingToolbarOpen}
        title={drawingToolbarOpen ? 'Згорнути панель малювання' : 'Розгорнути панель малювання'}
        aria-label={drawingToolbarOpen ? 'Згорнути панель малювання' : 'Розгорнути панель малювання'}
        onClick={toggleDrawingToolbar}
      >
        {drawingToolbarOpen ? '▴' : '▾'}
      </button>}

      {drawingToolbarOpen && <div className="floatingDrawTools" role="toolbar" aria-label="Інструменти hookchart" aria-orientation="vertical">
        {TOOLS.filter(([id]) => (!replay && !archiveMode) || id !== 'alert').map(([id, label, Icon]) => <button
          key={id}
          data-hookchart-guide-tool={id}
          type="button"
          title={settings.tooltips !== false ? label : undefined}
          aria-label={label}
          aria-pressed={tool === id}
          onClick={() => { setTool(id); setPanel(null); }}
          className={tool === id ? 'active' : ''}
        >
          <Icon size={15} />
        </button>)}
        {!archiveMode && <button
          type="button"
          title={settings.tooltips !== false ? 'Індикатори' : undefined}
          aria-label="Індикатори"
          data-hookchart-guide="indicators"
          aria-expanded={panel === 'indicators'}
          className={panel === 'indicators' ? 'active' : ''}
          onClick={() => { setPanel(panel === 'indicators' ? null : 'indicators'); setTool('cursor'); }}
        >
          <IndicatorIcon />
        </button>}
        <div className="floatingDivider" />
        <button
          type="button"
          className="clearChartBtn"
          title={settings.tooltips !== false ? 'Очистити фігури та локальні мітки (Telegram-сповіщення видаляються натисканням на лінію)' : undefined}
          aria-label="Очистити фігури та локальні мітки (Telegram-сповіщення видаляються натисканням на лінію)"
          onClick={() => { setDrawings([]); setAlerts([]); setTool('cursor'); }}
        >
          <Trash2 size={15} />
        </button>
        {!terminalMode && !replay && !archiveMode && <React.Fragment>
          <div className="floatingDivider" />
          <button
            type="button"
            className="hookchart-guide-entry"
            title={GUIDE_BUTTON_LABELS[chartLanguage]?.title || GUIDE_BUTTON_LABELS.uk.title}
            aria-label={GUIDE_BUTTON_LABELS[chartLanguage]?.aria || GUIDE_BUTTON_LABELS.uk.aria}
            aria-haspopup="dialog"
            aria-expanded={guideOpen}
            onClick={() => { setPanel(null); setGuideOpen(true); }}
          >
            <CircleHelp size={17} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </React.Fragment>}
      </div>}

      {!archiveMode && drawingToolbarOpen && panel === 'indicators' && <div className="indicatorDrawer" role="group" aria-label="Індикатори">
        <div className="indicatorDrawerHead">
          <b>Індикатори</b>
          <button type="button" aria-label="Закрити індикатори" onClick={() => setPanel(null)}><X size={14} /></button>
        </div>
        <div className="indicatorDrawerList">
          {INDICATOR_META.map(meta => <button
            key={meta.id}
            type="button"
            title={settings.tooltips !== false ? meta.description : undefined}
            aria-label={meta.name}
            aria-pressed={indicators.includes(meta.id)}
            disabled={meta.id === 'oi' && (replay || !!externalData || marketType !== 'futures')}
            className={indicators.includes(meta.id) ? 'on' : ''}
            onClick={() => toggleIndicator(meta.id)}
          >
            <i aria-hidden="true">{meta.short}</i>
            <span>{meta.name}</span>
            <em aria-hidden="true">{indicators.includes(meta.id) ? 'ON' : 'OFF'}</em>
          </button>)}
        </div>
      </div>}

      {tool === 'text' && <label className="hookchart-text-input">
        Текст
        <input aria-label="Текст нотатки" value={textLabel} maxLength={200} onChange={event => setTextLabel(event.target.value)} />
      </label>}

      <Chart
        marketRecurrenceMarks={recurrenceMarks}
        keyboardMagnifierActive={keyboardMagnifierActive && !replay}
        candles={candles}
        terminalMode={terminalMode}
        terminalAutoScale={terminalAutoScale}
        terminalHistoryReady={terminalHistoryReady}
        terminalFitAllRequest={terminalInitialViewTarget ? terminalFitAllRequest : undefined}
        formationAutoScale={visualContext === 'formationsQuick' && !terminalMode && !replay}
        visualProfile={activeVisualProfile}
        visualProfileKey={replay ? undefined : terminalInitialViewTarget
          ? `${activeVisualKey}:apply-${appliedTerminalInitialView?.version ?? 0}` : activeVisualKey}
        focusFormation={focusFormation}
        symbol={symbol}
        tf={timeframe}
        interactionScope={scope}
        tool={tool}
        drawings={drawings}
        setDrawings={setDrawings}
        alerts={archiveMode ? [] : visiblePriceMarkers}
        onSelectPriceAlert={archiveMode ? undefined : choosePriceMarker}
        onCreatePriceAlert={(price) => { if (!replay && !archiveMode) void createTelegramPriceAlert(price); }}
        setAlerts={setAlerts}
        densities={archiveMode ? archivedDensities : replay ? [] : chartDensities}
        marketPrints={replay ? [] : liveFeed.marketPrints}
        liquidations={replay ? [] : liveFeed.liquidations}
        liquidationHeatmap={mapChartData}
        modeledLiquidationBands={modeledLiquidationBands}
        sessionLiquidationsUsd={liveFeed.sessionLiquidationsUsd}
        showLiquidationLong={runtimeSettings.showLiquidationLong !== false}
        showLiquidationShort={runtimeSettings.showLiquidationShort !== false}
        autoLevels={archiveMode ? [] : visibleAutoLevels}
        cascadeRisk={liveFeed.cascadeRisk}
        liquidationCut={liveFeed.liquidationCut}
        liquidationSource={liveFeed.liquidationSource}
        liquidationStreamLive={liveFeed.liquidationStreamLive}
        liquidationLastEventAt={liveFeed.liquidationLastEventAt}
        levelLabelMode={runtimeSettings.levelLabelMode || 'always'}
        levelLabelColor={runtimeSettings.levelLabelColor || '#2090F0'}
        levelLabelSize={runtimeSettings.levelLabelSize ?? 9}
        levelLineWidth={runtimeSettings.levelLineWidth ?? 0.3}
        levelLabelStyle={runtimeSettings.levelLabelStyle || 'text'}
        levelLineStyle={runtimeSettings.levelLineStyle || 'solid'}
        crosshairLineWidth={runtimeSettings.crosshairLineWidth}
        maxCanvasDpr={replay ? 4 : runtimeSettings.maxCanvasDpr}
        horizontalDrawingLineWidth={runtimeSettings.horizontalDrawingLineWidth ?? 0.4}
        trendDrawingLineWidth={runtimeSettings.trendDrawingLineWidth ?? 0.4}
        scalperLineWidth={runtimeSettings.scalperLineWidth ?? 0.4}
        scalperLineStyle={runtimeSettings.scalperLineStyle || 'auto'}
        showScalperTouchPoints={runtimeSettings.showScalperTouchPoints !== false}
        rightPaddingBars={rightPaddingBars}
        roundGrid={!!runtimeSettings.roundGrid}
        roundness={runtimeSettings.roundness ?? 2}
        markers={markers}
        expandPriceScaleToMarkers={expandPriceScaleToMarkers}
        timeMarkers={externalData?.timeMarkers}
        splitVolumes={!!externalData}
        transientRuler={!!externalData}
        backgroundColor={externalData?.appearance.background}
        gridColor={externalData?.appearance.gridColor}
        controlRef={assignRef}
        initialLogicalRange={savedChartParams?.visibleRange}
        archivedOverlayScene={frozenOverlayScene}
        densityReferenceTime={archiveOriginalScope ? archiveSnapshot?.capturedAt : undefined}
        timezone={timezone}
        language={chartLanguage}
        textLabel={textLabel || 'Нотатка'}
        showMarketPrintSums={runtimeSettings.showMarketPrintSums === true}
        showMarketPrintArrows={runtimeSettings.showMarketPrintArrows !== false}
        marketPrintArrowSize={runtimeSettings.marketPrintArrowSize ?? 4}
        marketPrintFontSize={runtimeSettings.marketPrintFontSize ?? 10}
        marketPrintMinUsd={runtimeSettings.marketPrintMinUsd ?? 0}
        showVolumes={externalData ? externalData.appearance.volume : runtimeSettings.showVolumes !== false}
        gridHorizontal={!!runtimeSettings.gridHorizontal}
        gridVertical={!!runtimeSettings.gridVertical}
        showDensityLines={archiveMode ? !!archivedDensity?.markers.length && !!archivedDensity.lines : !replay && !!runtimeSettings.showDensityLines}
        showDensityLabels={archiveMode ? !!archivedDensity?.markers.length && !!archivedDensity.labels : !replay && !!runtimeSettings.showDensityLabels}
        showDensityAmounts={archiveMode ? !!archivedDensity?.markers.length && !!archivedDensity.amounts : !replay && !!runtimeSettings.showDensityAmounts}
        highlightDensityReaction={runtimeSettings.densityMode !== 'manual'}
        showLiquidations={!replay && runtimeSettings.showLiquidations !== false}
        showLiquidationCandleSums={runtimeSettings.showLiquidationCandleSums !== false}
        showLiquidationDetailSums={runtimeSettings.showLiquidationDetailSums !== false}
        showLiquidationArrows={runtimeSettings.showLiquidationArrows !== false}
        liquidationArrowSize={runtimeSettings.liquidationArrowSize ?? 5}
        liquidationSumFontSize={runtimeSettings.liquidationSumFontSize ?? 10}
        liquidationDetailFontSize={runtimeSettings.liquidationDetailFontSize ?? 9}
        showLiqRiskBlock={!replay && !externalData && !terminalMode && runtimeSettings.showLiqRiskBlock !== false}
        liquidationHudOwner={user?.uid}
        candleLongColor={externalData?.appearance.upColor || runtimeSettings.candleLongColor || '#0ECB81'}
        candleShortColor={externalData?.appearance.downColor || runtimeSettings.candleShortColor || '#F6465D'}
        densityLineColor={runtimeSettings.densityLineColor || '#7B61FF'}
        densityLabelColor={runtimeSettings.densityLabelColor || '#C4B5FD'}
        densityLineWidth={runtimeSettings.densityLineWidth ?? .5}
        densityLineStyle={runtimeSettings.densityLineStyle || 'solid'}
        densityLabelSize={runtimeSettings.densityLabelSize ?? 8}
        autoSR={archiveMode ? archiveOriginalScope && (replayOverlays.includes('sr') || !!archiveSnapshot?.srMarkersVisible) : replay ? replayOverlays.includes('sr') : !!runtimeSettings.autoSR}
        showSRLabels={runtimeSettings.showSRLabels !== false}
        autoPrevDay={replay || archiveMode ? replayOverlays.includes('prevDay') : !!runtimeSettings.autoPrevDay}
        autoDayOpen={replay || archiveMode ? replayOverlays.includes('dayOpen') : !!runtimeSettings.autoDayOpen}
        autoVWAP={replay || archiveMode ? replayOverlays.includes('vwap') : !!runtimeSettings.autoVWAP}
        autoLocalHL={replay || archiveMode ? replayOverlays.includes('localHL') : !!runtimeSettings.autoLocalHL}
        autoRoundLevels={replay || archiveMode ? replayOverlays.includes('roundLevels') : !!runtimeSettings.autoRoundLevels}
        autoPOC={replay || archiveMode ? replayOverlays.includes('poc') : !!runtimeSettings.autoPOC}
        autoStops={replay || archiveMode ? replayOverlays.includes('stops') : !!runtimeSettings.autoStops}
        autoChannel={replay || archiveMode ? replayOverlays.includes('channel') : !!runtimeSettings.autoChannel}
        channelModel={channel}
        strategyResult={strategyResult}
        scalperResult={scalperResult}
        showScalperLabels={runtimeSettings.showScalperLabels !== false}
        hideTimeJump={terminalMode || replay || drawingToolbarOpen}
        hideBarCountdown={replay}
        controlsContainer={controlsContainer}
        countdownContainer={countdownContainer}
        onNeedHistory={replay ? undefined : needHistory}
        onViewportChange={setViewport}
        onCrosshairChange={crosshair.set}
        onCrosshairPriceChange={onCrosshairPriceChange}
      />
      {selectedPriceMarker && (selectedPriceAlert || selectedLocalMarker) && (
        <div className="hookchart-alert-confirm" role="dialog" aria-label="Редагувати сигнальний рівень">
          <strong>{selectedPriceAlert ? 'Telegram-сповіщення' : 'Локальна мітка'}</strong>
          <span data-no-translate>{selectedPriceAlert
            ? `${selectedPriceAlert.symbol} ${selectedPriceAlert.condition === 'gte' ? '≥' : '≤'} ${selectedPriceAlert.targetPrice}`
            : `${symbol} · ${selectedLocalMarker?.p}`}</span>
          <label className="hookchart-alert-edit-field">
            Нова ціна
            <input type="text" inputMode="decimal" autoFocus aria-label="Нова ціна сигнального рівня"
              value={editedMarkerPrice} onChange={event => setEditedMarkerPrice(event.target.value)} />
          </label>
          {selectedPriceAlert && <small>Новий рівень буде створено перед вимкненням попереднього Telegram-сповіщення.</small>}
          <div>
            <button type="button" onClick={() => setSelectedPriceMarker(null)} disabled={deletingPriceMarker}>Скасувати</button>
            <button type="button" onClick={() => void confirmEditPriceMarker()} disabled={deletingPriceMarker}>
              {deletingPriceMarker ? 'Збереження…' : 'Зберегти'}
            </button>
          </div>
        </div>
      )}
      {alertNotice && (
        <div className={`hookchart-alert-notice ${alertNotice.error ? 'error' : 'success'}`} role="status">
          <span>{alertNotice.text}</span>
          <button type="button" aria-label="Закрити повідомлення" onClick={() => setAlertNotice(null)}>×</button>
        </div>
      )}
      {!candles.length && <span className="hookchart-empty" role="status">Завантаження свічок…</span>}
    </div>

    <IndicatorDock ids={indicators} candles={candles} oi={oi} viewport={viewport} rightPaddingBars={rightPaddingBars} onToggle={toggleIndicator} />
    <MemoChartTimeAxis candles={candles} tf={timeframe} timezone={timezone} language={chartLanguage} viewport={viewport} rightPaddingBars={rightPaddingBars} countdownRef={setCountdownContainer} crosshair={crosshair} />

    <div className="hookchart-footer">
      {(showMarketStats || screenerCardCompactLayout) && <div ref={statsBarRef} className="marketStatsBar" role="region" aria-label="Показники ринку" tabIndex={0}>
        {showMarketStats && <span>Vol 24h: <b>{marketStats.vol24 ? `${formatUsd(marketStats.vol24)}` : '—'}</b></span>}
        {showMarketStats && <HookChartFooterMinuteVolume exchange={exchange} marketType={marketType}
          symbol={symbol} language={chartLanguage} enabled={!ecoActive} observedMinute={recentMinuteAv} />}
        {screenerCardCompactLayout ? (
          <div className="screenerCardTimeframes" role="group" aria-label="Таймфрейм">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                type="button"
                aria-label={`Таймфрейм ${tf}`}
                aria-pressed={timeframe === tf}
                className={timeframe === tf ? 'active' : ''}
                onClick={() => selectTimeframe(tf)}
              >{tf}</button>
            ))}
          </div>
        ) : showMarketStats ? (
          <>
            <span>Max: <b>{marketStats.high ? marketStats.high.toLocaleString(undefined, { maximumFractionDigits: marketStats.high < 10 ? 4 : 2 }) : '—'}</b></span>
            <span>Min: <b>{marketStats.low ? marketStats.low.toLocaleString(undefined, { maximumFractionDigits: marketStats.low < 10 ? 4 : 2 }) : '—'}</b></span>
          </>
        ) : null}
        {showMarketStats && <>
          <span title={btcCorrelation
            ? `Кореляція Пірсона логарифмічних дохідностей: ${btcCorrelation.pairs} пар закритих свічок (${timeframe}), ${exchange.toUpperCase()} ${marketType}, до BTC. Шкала −1…+1.`
            : 'Кореляція BTC недоступна: недостатньо однакових закритих свічок або немає відповіді біржі.'}>
            Corr BTC: <b>{btcCorrelation ? btcCorrelation.value.toFixed(2) : '—'}</b>
          </span>
          <span>Vol: <b>{Number.isFinite(marketStats.natr) ? `${marketStats.natr.toFixed(2)}%` : '—'}</b></span>
          {exchange === 'binance' && <span title="Справжня кількість угод за останні 24 години за даними Binance 24h ticker. Якщо даних немає, показано —.">
            Trades 24h: <b>{tradeCount24h?.scope === statsScope && tradeCount24h.count !== null
              ? tradeCount24h.count.toLocaleString() : '—'}</b>
          </span>}
          <HookChartFooterFunding
            key={`${exchange}:${marketType}:${normalizeExchangeSymbol(symbol)}`}
            exchange={exchange}
            marketType={marketType}
            symbol={symbol}
            language={chartLanguage}
          />
        </>}
      </div>}
      <div className="hookchart-footer-controls" ref={setControlsContainer} />
      {footerActions && <div className="hookchart-footer-actions">{footerActions}</div>}
    </div>
    {guideOpen && !terminalMode && !replay && <React.Suspense fallback={null}>
      <LazyHookChartGuide rootRef={rootRef} language={chartLanguage} onClose={closeGuide} onNavigate={navigateGuide} liquidationMapSupported={liquidationMapSupported} />
    </React.Suspense>}
  </div>;
});

export default HookChartCanvas;
