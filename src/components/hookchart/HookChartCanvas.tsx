import { subscribeMarketRefresh } from '../../utils/marketRefresh';
import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Crosshair, Minus, MoveUpRight, Square, Type, Ruler, Bell, BarChart3, Layers, Settings, Trash2, X } from 'lucide-react';
import type { ChartMarkerInfo, ChartRestoreParams, DetectedFormation, ExchangeId, HookChartPreferences, Kline, MarketType, Timeframe } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { resolveHookChartLanguage } from '../../locales/hookchartLanguage';
import { toHookCandles } from '../../utils/hookchartData';
import { resolveTimeZone } from '../../utils/tradingSessions';
import { fetchHistoricalReplayCandles } from '../../utils/replayService';
import { normalizeExchangeSymbol } from '../../utils/marketSymbols';
import { fetchDirectKlines } from '../../utils/directExchangeClient';
import { Chart, ChartTimeAxis, IndicatorDock, buildStructuralChannel, type Alert, type Candle, type Drawing, type HookChartHandle, type Viewport } from './engine';
import { INDICATOR_META, type IndicatorId, type OIPoint } from './indicatorEngine';
import { FibIcon, IndicatorIcon, OverlayIcon } from './ToolbarIcons';
import { DEFAULT_HOOKCHART_HOTKEYS, OriginalHookChartSettings, hotkeyMatches, normalizeOriginalHookChartPreferences } from './OriginalHookChartSettings';
import { evaluateStrategy, strategyPreset } from './strategyEngine';
import { atr, deriveAutoLevels, formatUsd, type LevelTf } from './marketAnalytics';
import { useOriginalHookChartLiveFeed } from './useOriginalHookChartLiveFeed';
import './hookchart.css';
import './integration.css';

export interface HookChartCanvasProps {
  klines: Kline[];
  symbol: string;
  timeframe: string;
  exchange: ExchangeId;
  marketType: MarketType;
  markers?: ChartMarkerInfo[];
  savedChartParams?: ChartRestoreParams;
  replay?: boolean;
  focusTrigger?: number;
  terminalMode?: boolean;
  focusFormation?: DetectedFormation | null;
  onTimeframeChange?: (timeframe: Timeframe) => void;
  onExchangeChange?: (exchange: ExchangeId) => void;
  chartActions?: React.ReactNode;
  toolbarActions?: React.ReactNode;
  toolbarOverlays?: React.ReactNode;
  footerActions?: React.ReactNode;
}

const EMPTY_OI = { binance: [] as OIPoint[], bybit: [] as OIPoint[] };
const DEFAULT_VIEWPORT: Viewport = { barWidth: 9, rightOffset: 0, autoY: true, manualCenter: null, manualRange: null, fitAll: false };
const TOOLS = [
  ['cursor', 'Курсор', Crosshair], ['level', 'Горизонтальний рівень', Minus], ['trend', 'Лінія тренду', MoveUpRight],
  ['rect', 'Прямокутник', Square], ['fib', 'Рівні Фібоначчі', FibIcon], ['profile', 'Профіль обсягу', BarChart3],
  ['text', 'Текст', Type], ['ruler', 'Вимірювання', Ruler], ['alert', 'Сигнальний рівень', Bell],
] as const;
const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const TF_MS: Record<string, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };
const LEVEL_TFS = new Set<LevelTf>(['5m', '15m', '1h', '4h', '1d']);

function aggregateCandles(source: Candle[], sourceTf: string, targetTf: string): Candle[] {
  const sourceMs = TF_MS[sourceTf] || 0;
  const targetMs = TF_MS[targetTf] || 0;
  if (!source.length || !sourceMs || !targetMs || targetMs < sourceMs) return targetTf === sourceTf ? source : [];
  if (targetMs === sourceMs) return source;
  const out: Candle[] = [];
  let current: Candle | null = null;
  let bucket = -1;
  for (const candle of source) {
    const nextBucket = Math.floor(candle.t / targetMs) * targetMs;
    if (!current || nextBucket !== bucket) {
      if (current) out.push(current);
      bucket = nextBucket;
      current = { ...candle, t: nextBucket };
    } else {
      current.h = Math.max(current.h, candle.h);
      current.l = Math.min(current.l, candle.l);
      current.c = candle.c;
      current.v += candle.v || 0;
      current.n += candle.n || 0;
      current.tb = (current.tb || 0) + (candle.tb || 0);
    }
  }
  if (current) out.push(current);
  return out;
}
const OVERLAYS = [
  ['sr', 'Підтримка та опір'], ['prevDay', 'Хай / лой минулого дня'], ['dayOpen', 'Відкриття дня'],
  ['vwap', 'VWAP'], ['localHL', 'Локальні екстремуми'], ['roundLevels', 'Круглі рівні'], ['poc', 'POC'],
  ['channel', 'Канал'], ['stops', 'Зони стопів'],
] as const;

function enabledIndicators(preferences?: HookChartPreferences, replay = false, market: MarketType = 'futures'): IndicatorId[] {
  return (preferences?.indicators || []).filter((id): id is IndicatorId => INDICATOR_META.some(meta => meta.id === id)
    && (id !== 'oi' || (!replay && market === 'futures')));
}

const HookChartCanvas = forwardRef<HookChartHandle, HookChartCanvasProps>(function HookChartCanvas({
  klines, symbol, timeframe, exchange, marketType, markers = [], savedChartParams, replay = false, focusTrigger, terminalMode = false, focusFormation, onTimeframeChange, chartActions, toolbarActions, toolbarOverlays, footerActions,
}, forwardedRef) {
  const { user, profile, updateProfileData } = useAuth();
  const { language: siteLanguage } = useLanguage();
  const preferences = profile?.uid === user?.uid ? profile?.hookChartPreferences : undefined;
  const scope = `${replay ? 'replay' : 'live'}:${exchange}:${marketType}:${symbol}`;
  const sharedScope = `shared:${symbol}`;
  const [settings, setSettings] = useState<HookChartPreferences>(() => normalizeOriginalHookChartPreferences(preferences));
  const chartLanguage = resolveHookChartLanguage(settings, siteLanguage);
  const [drawings, setDrawingsState] = useState<Drawing[]>(() =>
    (preferences?.sharedDrawings !== false ? preferences?.drawings?.[sharedScope] : undefined) || preferences?.drawings?.[scope] || []);
  const [alerts, setAlertsState] = useState<Alert[]>(() =>
    (preferences?.sharedDrawings !== false ? preferences?.alerts?.[sharedScope] : undefined) || preferences?.alerts?.[scope] || []);
  const drawingsRef = useRef(drawings);
  const alertsRef = useRef(alerts);
  const tempRulerRef = useRef<{ code: string; tool: string } | null>(null);
  const [tool, setTool] = useState('cursor');
  const [textLabel, setTextLabel] = useState('Нотатка');
  const [panel, setPanel] = useState<'indicators' | 'settings' | null>(null);
  const closeSettings = useCallback(() => setPanel(null), []);
  const [densityQuickOpen, setDensityQuickOpen] = useState(false);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [extraHistory, setExtraHistory] = useState<Kline[]>([]);
  const [remoteSeries, setRemoteSeries] = useState<Record<string, Candle[]>>({});
  const [oi, setOi] = useState(EMPTY_OI);
  const [oiError, setOiError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [profileSyncVersion, refreshProfileSettings] = useState(0);
  const engineRef = useRef<HookChartHandle | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const statsBarRef = useRef<HTMLDivElement | null>(null);
  const integratedToolbar = terminalMode && !!toolbarActions;
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
    if (!terminalMode) return;
    const scrollers = [integratedToolbar ? toolbarRef.current : null, statsBarRef.current]
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
  }, [terminalMode, integratedToolbar, settings.showMarketStatsBar]);
  const indicators = enabledIndicators(settings, replay, marketType);
  const timezone = settings.timezone || resolveTimeZone(profile?.timeZone);
  const candles = useMemo(() => toHookCandles(replay ? klines : [...extraHistory, ...klines]), [klines, extraHistory, replay]);
  const liveFeed = useOriginalHookChartLiveFeed({ exchange, marketType, symbol, settings, candles, replay });
  const activeStrategy = useMemo(() => strategyPreset(settings.strategyId || ''), [settings.strategyId]);
  const analysisTfs = useMemo(() =>
    Array.from(new Set<string>([timeframe, ...(settings.levelIntervals || []), ...(settings.trendIntervals || []), ...(activeStrategy?.requiredTfs || [])])),
    [timeframe, (settings.levelIntervals || []).join(','), (settings.trendIntervals || []).join(','), activeStrategy?.id]);
  const analysisTfKey = analysisTfs.join(',');

  useEffect(() => {
    const exchangeSymbol = /^[A-Z0-9]+$/i.test(symbol);
    if (replay || !exchangeSymbol) { setRemoteSeries({}); return; }
    let cancelled = false;
    const controller = new AbortController();
    const pull = async () => {
      const requested = analysisTfs.filter(tf => tf !== timeframe && TIMEFRAMES.includes(tf as Timeframe));
      if (!requested.length) { if (!cancelled) setRemoteSeries({}); return; }
      const rows = await Promise.all(requested.map(async tf => {
        try {
          const limit = Math.min(1000, Math.max(250, settings.levelHistory || 500, settings.trendHistory || 300));
          const result = await fetchDirectKlines(exchange, marketType, symbol, tf as Timeframe, limit);
          return [tf, toHookCandles(result)] as const;
        } catch {
          return [tf, [] as Candle[]] as const;
        }
      }));
      if (!cancelled && !controller.signal.aborted) setRemoteSeries(Object.fromEntries(rows.filter(([, values]) => values.length)));
    };
    void pull();
    const stopRefresh = subscribeMarketRefresh(pull, undefined, 60_000);
    return () => { cancelled = true; controller.abort(); stopRefresh(); };
  }, [exchange, marketType, symbol, timeframe, replay, analysisTfKey, settings.levelHistory, settings.trendHistory]);

  const analysisSeries = useMemo(() => {
    const series: Record<string, Candle[]> = { [timeframe]: candles };
    for (const tf of analysisTfs) {
      if (tf === timeframe) continue;
      if (remoteSeries[tf]?.length) {
        series[tf] = remoteSeries[tf];
        continue;
      }
      const aggregated = aggregateCandles(candles, timeframe, tf);
      if (aggregated.length) series[tf] = aggregated;
    }
    return series;
  }, [candles, timeframe, analysisTfKey, remoteSeries]);
  const autoLevels = useMemo(() => (settings.levelIntervals || []).flatMap(tf => {
    if (!LEVEL_TFS.has(tf as LevelTf)) return [];
    const series = analysisSeries[tf] || [];
    if (series.length < 40) return [];
    return deriveAutoLevels(series, tf as LevelTf, {
      count: settings.levelCount ?? 3,
      allowedDiffPct: settings.levelDiff ?? .18,
      historyDepth: settings.levelHistory ?? 500,
      breakPct: settings.levelBreak ?? .35,
      pivotBars: settings.levelCandleCount ?? 15,
      allowWickPenetration: settings.allowWick !== false,
    });
  }), [analysisSeries, (settings.levelIntervals || []).join(','), settings.levelCount, settings.levelDiff, settings.levelHistory, settings.levelBreak, settings.levelCandleCount, settings.allowWick]);
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
    activeStrategy?.id, analysisSeries, candles, autoLevels, oi.binance, oi.bybit, exchange,
    liveFeed.densities, liveFeed.book, liveFeed.fundingHistory, liveFeed.fundingRate, liveFeed.cascadeRisk.score,
  ]);
  const chartToolbarEnabled = settings.chartToolbar !== false;
  const topToolbarOpen = settings.showTopToolbarIcons !== false;
  const drawingToolbarOpen = chartToolbarEnabled && settings.drawingToolbarOpen === true;
  const rightPaddingBars = terminalMode ? 8 : settings.rightPaddingEnabled === false ? 0 : (settings.rightPadding ?? 10);
  const channel = useMemo(() => settings.autoChannel ? buildStructuralChannel(analysisSeries, candles.at(-1)?.c) : null, [analysisSeries, candles, settings.autoChannel]);
  const marketStats = useMemo(() => {
    const last = candles.at(-1);
    if (!last) return { vol24: 0, high: 0, low: 0, natr: NaN, trades: 0 };
    const day = candles.filter(candle => candle.t >= last.t - 86_400_000);
    return {
      vol24: day.reduce((sum, candle) => sum + (candle.v || 0) * candle.c, 0),
      high: day.length ? Math.max(...day.map(candle => candle.h)) : last.h,
      low: day.length ? Math.min(...day.map(candle => candle.l)) : last.l,
      natr: last.c > 0 ? atr(candles, Math.max(2, settings.natrPeriod || 14)) / last.c * 100 : NaN,
      trades: day.reduce((sum, candle) => sum + (candle.n || 0), 0),
    };
  }, [candles, settings.natrPeriod]);

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
    void saveRef.current({ hookChartPreferences: delta })
      .then(() => { if (mounted.current && activeUid.current === owner) setSaveError(false); })
      .catch(() => {
        if (!mounted.current || activeUid.current !== owner) return;
        pendingOwnerUid.current = owner;
        pending.current = {
          ...delta, ...pending.current,
          drawings: { ...delta.drawings, ...pending.current?.drawings },
          alerts: { ...delta.alerts, ...pending.current?.alerts },
        };
        setSaveError(true);
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
    if (!user) return;
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
    } else if (
      (pending.current && pendingOwnerUid.current === uid) ||
      (uid && (savingByUid.current.get(uid) || 0) > 0)
    ) return;
    if (user && profile?.uid !== user.uid) {
      setSettings(normalizeOriginalHookChartPreferences());
      drawingsRef.current = [];
      alertsRef.current = [];
      setDrawingsState([]);
      setAlertsState([]);
      return;
    }
    setSettings(normalizeOriginalHookChartPreferences(preferences));
    const next = (settings.sharedDrawings !== false ? preferences?.drawings?.[sharedScope] : undefined) || preferences?.drawings?.[scope] || [];
    const nextAlerts = (settings.sharedDrawings !== false ? preferences?.alerts?.[sharedScope] : undefined) || preferences?.alerts?.[scope] || [];
    drawingsRef.current = next;
    alertsRef.current = nextAlerts;
    setDrawingsState(next);
    setAlertsState(nextAlerts);
  }, [user?.uid, profile?.uid, preferences, scope, sharedScope, settings.sharedDrawings, profileSyncVersion]);

  useEffect(() => {
    if (user && profile?.uid !== user.uid) return;
    if (settings.siteLanguageAtSelection === siteLanguage) return;
    const delta = { language: siteLanguage, siteLanguageAtSelection: siteLanguage };
    setSettings(current => ({ ...current, ...delta }));
    queueSave(delta);
  }, [siteLanguage, settings.siteLanguageAtSelection, user?.uid, profile?.uid, queueSave]);

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
    queueSave({ drawings: settings.sharedDrawings !== false ? { [scope]: next, [sharedScope]: next } : { [scope]: next } });
  }, [scope, sharedScope, settings.sharedDrawings, queueSave]);

  const setAlerts: React.Dispatch<React.SetStateAction<Alert[]>> = useCallback(update => {
    const next = typeof update === 'function' ? update(alertsRef.current) : update;
    alertsRef.current = next;
    setAlertsState(next);
    queueSave({ alerts: settings.sharedDrawings !== false ? { [scope]: next, [sharedScope]: next } : { [scope]: next } });
  }, [scope, sharedScope, settings.sharedDrawings, queueSave]);

  const changeSettings = (delta: HookChartPreferences) => {
    if (delta.language) delta = { ...delta, siteLanguageAtSelection: siteLanguage };
    setSettings(current => ({ ...current, ...delta, hotkeys: delta.hotkeys ? { ...current.hotkeys, ...delta.hotkeys } : current.hotkeys }));
    queueSave({
      ...(preferences?.rightPaddingVersion !== 2 ? {
        rightPadding: settings.rightPadding,
        rightPaddingEnabled: settings.rightPaddingEnabled,
        rightPaddingVersion: 2,
      } : {}),
      ...delta,
    });
  };
  const toggleIndicator = (id: IndicatorId) => {
    const current = enabledIndicators(settings, false, 'futures');
    changeSettings({ indicators: current.includes(id) ? current.filter(x => x !== id) : [...current, id] });
  };
  const overlayKeys = { sr: 'autoSR', prevDay: 'autoPrevDay', dayOpen: 'autoDayOpen', vwap: 'autoVWAP', localHL: 'autoLocalHL', roundLevels: 'autoRoundLevels', poc: 'autoPOC', channel: 'autoChannel', stops: 'autoStops' } as const;
  const overlayEnabled = (id: string) => !!settings[overlayKeys[id as keyof typeof overlayKeys]];
  const toggleOverlay = (id: string) => {
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
    if (!id) { changeSettings({ strategyId: '' }); return; }
    const preset = strategyPreset(id);
    if (!preset) return;
    changeSettings({ ...preset.settings, strategyId: id, ...(preset.densityMode ? { densityMode: preset.densityMode } : {}), ...(preset.levelBreak != null ? { levelBreak: preset.levelBreak } : {}) });
  };
  const toggleDrawingToolbar = () => {
    if (!chartToolbarEnabled) return;
    changeSettings({ drawingToolbarOpen: !drawingToolbarOpen });
    setPanel(null);
    setTool('cursor');
  };

  useEffect(() => {
    if (!drawingToolbarOpen) {
      setTool('cursor');
      setPanel(current => current === 'indicators' ? null : current);
    }
  }, [drawingToolbarOpen]);

  useEffect(() => {
    const hotkeys = { ...DEFAULT_HOOKCHART_HOTKEYS, ...(settings.hotkeys || {}) };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!rootRef.current?.contains(document.activeElement)) return;
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (typing && event.key !== 'Escape') return;
      const use = (action: keyof typeof hotkeys) => hotkeyMatches(event, hotkeys[action]);
      if (use('tempRuler')) { if (!event.repeat && !tempRulerRef.current) { event.preventDefault(); tempRulerRef.current = { code: event.code, tool }; setTool('ruler'); } return; }
      if (use('cancel')) { event.preventDefault(); setTool('cursor'); setPanel(null); setDensityQuickOpen(false); return; }
      if (use('zoomIn')) { event.preventDefault(); engineRef.current?.zoom(1.18); return; }
      if (use('zoomOut')) { event.preventDefault(); engineRef.current?.zoom(0.84); return; }
      if (use('copyTicker')) { event.preventDefault(); void navigator.clipboard?.writeText(symbol); return; }
      if (use('openWindow')) { event.preventDefault(); window.open(window.location.href, '_blank', 'noopener,noreferrer'); return; }
      if (use('level')) { event.preventDefault(); setTool('level'); return; }
      if (use('trend')) { event.preventDefault(); setTool('trend'); return; }
      if (use('ray')) { event.preventDefault(); setTool('ray'); return; }
      if (use('fib')) { event.preventDefault(); setTool('fib'); return; }
      if (use('erase')) { event.preventDefault(); setTool(current => current === 'erase' ? 'cursor' : 'erase'); return; }
      if (use('clearAlerts')) { event.preventDefault(); setAlerts([]); return; }
      if (use('signalLevel')) { event.preventDefault(); setTool('alert'); return; }
      const choices = TIMEFRAMES, index = choices.indexOf(timeframe as Timeframe);
      const changeTimeframe = onTimeframeChange;
      if (changeTimeframe && !replay && use('prevTf')) { event.preventDefault(); changeTimeframe(choices[Math.max(0, index - 1)] as Timeframe); return; }
      if (changeTimeframe && !replay && use('nextTf')) { event.preventDefault(); changeTimeframe(choices[Math.min(choices.length - 1, index + 1)] as Timeframe); return; }
      for (const action of ['openMetaScalp', 'deleteCoin', 'toggleFavorites', 'prevCoin', 'nextCoin', 'prevChart', 'nextChart', 'prevTfAll', 'nextTfAll'] as const) {
        if (use(action)) {
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
  }, [settings.hotkeys, symbol, exchange, marketType, timeframe, replay, onTimeframeChange, tool]);

  // Replay is deliberately isolated: only the simulator's visible candles are passed to the engine.
  const needHistory = useCallback(async (timestamp: number) => {
    if (replay || timestamp > Date.now()) return false;
    const { allCandles: rows } = await fetchHistoricalReplayCandles(exchange, marketType, symbol, timeframe as Timeframe, timestamp);
    if (!mounted.current) return false;
    if (!rows.some(row => Math.abs(row.time * 1000 - timestamp) < 86_400_000)) return false;
    setExtraHistory(previous => [...previous, ...rows].slice(-40_000));
    return true;
  }, [exchange, marketType, symbol, timeframe, replay]);

  useEffect(() => {
    if (focusTrigger !== undefined) engineRef.current?.zoomToLatest();
  }, [focusTrigger]);

  const showOi = indicators.includes('oi') || !!activeStrategy;
  useEffect(() => {
    if (!showOi || replay || marketType !== 'futures') { setOi(EMPTY_OI); setOiError(false); return; }
    const controller = new AbortController();
    const poll = async () => {
      try {
        const query = new URLSearchParams({ symbol: normalizeExchangeSymbol(symbol), timeframe });
        const response = await fetch(`/api/derivatives/oi/history?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error('OI unavailable');
        const data = await response.json();
        if (!data.success || (!data.binance?.length && !data.bybit?.length)) throw new Error('OI unavailable');
        if (!controller.signal.aborted) { setOi({ binance: data.binance || [], bybit: data.bybit || [] }); setOiError(false); }
      } catch { if (!controller.signal.aborted) setOiError(true); }
    };
    void poll();
    const stopRefresh = subscribeMarketRefresh(poll, undefined, 60_000);
    return () => { controller.abort(); stopRefresh(); };
  }, [showOi, symbol, timeframe, replay, marketType]);

  const assignRef = useCallback((handle: HookChartHandle | null) => {
    engineRef.current = handle;
    if (typeof forwardedRef === 'function') forwardedRef(handle);
    else if (forwardedRef) forwardedRef.current = handle;
  }, [forwardedRef]);

  const toolbarPopup = (popup: React.ReactNode) => integratedToolbar && rootRef.current
    ? createPortal(popup, rootRef.current) : popup;

  return <div ref={rootRef} className={'hookchart-root' + (terminalMode ? ' hookchart-terminal' : '')} data-chart-provider="hookchart" data-hookchart-language={chartLanguage} lang={chartLanguage}>
    <div ref={toolbarRef} className={'hookchart-toolbar' + (integratedToolbar ? ' hookchart-terminal-toolbar' : '')} role="toolbar" aria-label="Верхня панель hookchart" aria-orientation="horizontal">
      <div className="hookchart-timeframes" role="group" aria-label="Таймфрейм">
        {onTimeframeChange && !replay ? TIMEFRAMES.map(tf => <button key={tf} type="button" aria-label={`Таймфрейм ${tf}`} aria-pressed={timeframe === tf}
          className={timeframe === tf ? 'active' : ''} onClick={() => onTimeframeChange(tf)}>{tf}</button>) : <span>{timeframe}</span>}
      </div>

      {toolbarActions && <div className="hookchart-toolbar-actions" role="group" aria-label="Інструменти блока">{toolbarActions}</div>}

      <button
        type="button"
        className="topToolbarToggle"
        aria-expanded={topToolbarOpen}
        aria-label={topToolbarOpen ? 'Згорнути верхні інструменти' : 'Розгорнути верхні інструменти'}
        title={settings.tooltips !== false ? (topToolbarOpen ? 'Згорнути верхні інструменти' : 'Розгорнути верхні інструменти') : undefined}
        onClick={() => {
          changeSettings({ showTopToolbarIcons: !topToolbarOpen });
          setDensityQuickOpen(false);
        }}
      >
        {topToolbarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      {topToolbarOpen && <>
        <div className="densityQuickWrap">
          <button
            type="button"
            title={settings.tooltips !== false ? 'Поріг щільностей' : undefined}
            aria-label="Поріг щільностей"
            aria-expanded={densityQuickOpen}
            className={densityQuickOpen ? 'active' : ''}
            onClick={() => setDensityQuickOpen(value => !value)}
          >
            <Layers size={15} />
          </button>
          {densityQuickOpen && toolbarPopup(<div className="densityQuickPopup">
            <div className="densityQuickHead">
              <span>Поріг щільностей</span>
              <b>≥ &#36;{Math.round(liveFeed.densityCut || settings.densityThreshold || 0).toLocaleString()} · {liveFeed.densities.filter(row => row.active).length} found</b>
            </div>
            <div className="densityQuickModes">
              <button type="button" className={settings.densityMode !== 'manual' ? 'sel' : ''} onClick={() => changeSettings({ densityMode: 'auto' })}>AUTO</button>
              <button type="button" className={settings.densityMode === 'manual' ? 'sel' : ''} onClick={() => {
                const seed = Math.max(1, Math.round((liveFeed.densityCut || settings.densityThreshold || 50_000) / 1000) * 1000);
                changeSettings({ densityMode: 'manual', densityThreshold: settings.densityThreshold || seed });
              }}>MANUAL</button>
            </div>
            <label className="densityQuickInput">
              <span>$</span>
              <input
                type="number"
                min="1"
                step="1000"
                value={settings.densityMode === 'auto'
                  ? Math.max(1, Math.round(liveFeed.densityCut || settings.densityThreshold || 50_000))
                  : Math.max(1, settings.densityThreshold || 50_000)}
                onFocus={event => event.currentTarget.select()}
                onChange={event => changeSettings({ densityMode: 'manual', densityThreshold: Math.max(1, Math.round(Number(event.target.value) || 1)) })}
              />
            </label>
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
        </div>

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
      </>}

      <div className="toolbarRight">
        <button
          type="button"
          title={settings.tooltips !== false ? 'Налаштування графіка' : undefined}
          aria-label="Налаштування hookchart"
          aria-expanded={panel === 'settings'}
          className={'chartSettingsBtn ' + (panel === 'settings' ? 'active' : '')}
          onClick={() => setPanel(panel === 'settings' ? null : 'settings')}
        >
          <Settings size={14} />
        </button>
        {chartActions && <div className="hookchart-chart-actions" role="group" aria-label="Дії графіка">
          {chartActions}
        </div>}
      </div>
    </div>

    {toolbarOverlays && <div className="hookchart-toolbar-overlays">{toolbarOverlays}</div>}

    {panel === 'settings' && typeof document !== 'undefined' && createPortal(
      <div className="hookchart-root hookchart-settings-portal" data-hookchart-language={chartLanguage} lang={chartLanguage}>
        <OriginalHookChartSettings
          open
          prefs={{ ...settings, language: chartLanguage }}
          onChange={changeSettings}
          onApplyStrategy={applyStrategy}
          onClose={closeSettings}
        />
      </div>,
      document.body,
    )}

    {panel === 'settings' && <div className="hookchart-options hookchart-options-compat" aria-hidden="true">
      <button type="button" aria-label="Закрити налаштування hookchart" onClick={() => setPanel(null)} />
      {OVERLAYS.map(([id, label]) => <label key={id}>
        <input type="checkbox" checked={overlayEnabled(id)} onChange={() => toggleOverlay(id)} />
        {label}
      </label>)}
    </div>}

    {saveError && <button type="button" className="hookchart-save-error" onClick={flush}>Не вдалося зберегти налаштування. Повторити</button>}
    {oiError && <span className="hookchart-feed-status" role="status">Дані OI тимчасово недоступні</span>}

    <div className="chartStage" data-drawing-tools={drawingToolbarOpen ? 'open' : 'closed'}>
      {chartToolbarEnabled && <button
        type="button"
        className={`drawPanelToggle ${drawingToolbarOpen ? 'open' : ''}`}
        aria-expanded={drawingToolbarOpen}
        title={drawingToolbarOpen ? 'Згорнути панель малювання' : 'Розгорнути панель малювання'}
        aria-label={drawingToolbarOpen ? 'Згорнути панель малювання' : 'Розгорнути панель малювання'}
        onClick={toggleDrawingToolbar}
      >
        {drawingToolbarOpen ? '‹' : '›'}
      </button>}

      {drawingToolbarOpen && <div className="floatingDrawTools" role="toolbar" aria-label="Інструменти hookchart" aria-orientation="vertical">
        {TOOLS.map(([id, label, Icon]) => <button
          key={id}
          type="button"
          title={settings.tooltips !== false ? label : undefined}
          aria-label={label}
          aria-pressed={tool === id}
          onClick={() => { setTool(id); setPanel(null); }}
          className={tool === id ? 'active' : ''}
        >
          <Icon size={15} />
        </button>)}
        <button
          type="button"
          title={settings.tooltips !== false ? 'Індикатори' : undefined}
          aria-label="Індикатори"
          aria-expanded={panel === 'indicators'}
          className={panel === 'indicators' ? 'active' : ''}
          onClick={() => { setPanel(panel === 'indicators' ? null : 'indicators'); setTool('cursor'); }}
        >
          <IndicatorIcon />
        </button>
        <div className="floatingDivider" />
        <button
          type="button"
          className="clearChartBtn"
          title={settings.tooltips !== false ? 'Очистити ручні фігури та alerts' : undefined}
          aria-label="Очистити ручні фігури та alerts"
          onClick={() => { setDrawings([]); setAlerts([]); setTool('cursor'); }}
        >
          <Trash2 size={15} />
        </button>
      </div>}

      {drawingToolbarOpen && panel === 'indicators' && <div className="indicatorDrawer" role="group" aria-label="Індикатори">
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
            disabled={meta.id === 'oi' && (replay || marketType !== 'futures')}
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
        candles={candles}
        terminalMode={terminalMode}
        focusFormation={focusFormation}
        symbol={symbol}
        tf={timeframe}
        tool={tool}
        drawings={drawings}
        setDrawings={setDrawings}
        alerts={alerts}
        setAlerts={setAlerts}
        densities={liveFeed.densities}
        marketPrints={liveFeed.marketPrints}
        liquidations={liveFeed.liquidations}
        autoLevels={visibleAutoLevels}
        cascadeRisk={liveFeed.cascadeRisk}
        liquidationCut={liveFeed.liquidationCut}
        liquidationSource={liveFeed.liquidationSource}
        liquidationStreamLive={liveFeed.liquidationStreamLive}
        liquidationLastEventAt={liveFeed.liquidationLastEventAt}
        levelLabelMode={settings.levelLabelMode || 'always'}
        levelLabelColor={settings.levelLabelColor || '#2090F0'}
        levelLabelSize={settings.levelLabelSize ?? 11}
        levelLabelStyle={settings.levelLabelStyle || 'text'}
        levelLineStyle={settings.levelLineStyle || 'solid'}
        rightPaddingBars={rightPaddingBars}
        roundGrid={!!settings.roundGrid}
        roundness={settings.roundness ?? 2}
        markers={markers}
        controlRef={assignRef}
        initialLogicalRange={savedChartParams?.visibleRange}
        timezone={timezone}
        language={chartLanguage}
        textLabel={textLabel || 'Нотатка'}
        showMarketPrintSums={settings.showMarketPrintSums === true}
        showVolumes={settings.showVolumes !== false}
        gridHorizontal={!!settings.gridHorizontal}
        gridVertical={!!settings.gridVertical}
        showDensityLines={!!settings.showDensityLines}
        showDensityLabels={!!settings.showDensityLabels}
        showDensityAmounts={!!settings.showDensityAmounts}
        showLiquidations={settings.showLiquidations !== false}
        showLiqRiskBlock={!terminalMode && settings.showLiqRiskBlock !== false}
        candleLongColor={settings.candleLongColor || '#0ECB81'}
        candleShortColor={settings.candleShortColor || '#F6465D'}
        densityLineColor={settings.densityLineColor || '#7B61FF'}
        densityLabelColor={settings.densityLabelColor || '#C4B5FD'}
        densityLineWidth={settings.densityLineWidth ?? .5}
        densityLineStyle={settings.densityLineStyle || 'solid'}
        densityLabelSize={settings.densityLabelSize ?? 8}
        autoSR={!!settings.autoSR}
        showSRLabels={settings.showSRLabels !== false}
        autoPrevDay={!!settings.autoPrevDay}
        autoDayOpen={!!settings.autoDayOpen}
        autoVWAP={!!settings.autoVWAP}
        autoLocalHL={!!settings.autoLocalHL}
        autoRoundLevels={!!settings.autoRoundLevels}
        autoPOC={!!settings.autoPOC}
        autoStops={!!settings.autoStops}
        autoChannel={!!settings.autoChannel}
        channelModel={channel}
        strategyResult={strategyResult}
        hideTimeJump={terminalMode || replay || drawingToolbarOpen}
        hideBarCountdown={replay}
        controlsContainer={controlsContainer}
        countdownContainer={countdownContainer}
        onNeedHistory={replay ? undefined : needHistory}
        onViewportChange={setViewport}
      />
      {!candles.length && <span className="hookchart-empty" role="status">Завантаження свічок…</span>}
    </div>

    <IndicatorDock ids={indicators} candles={candles} oi={oi} viewport={viewport} rightPaddingBars={rightPaddingBars} onToggle={toggleIndicator} />
    <ChartTimeAxis candles={candles} tf={timeframe} timezone={timezone} language={chartLanguage} viewport={viewport} rightPaddingBars={rightPaddingBars} countdownRef={setCountdownContainer} />

    <div className="hookchart-footer">
      {settings.showMarketStatsBar !== false && <div ref={statsBarRef} className="marketStatsBar" role="region" aria-label="Показники ринку" tabIndex={0}>
        <span>Vol 24h: <b>{marketStats.vol24 ? `$${formatUsd(marketStats.vol24)}` : '—'}</b></span>
        <span>Max: <b>{marketStats.high ? marketStats.high.toLocaleString(undefined, { maximumFractionDigits: marketStats.high < 10 ? 4 : 2 }) : '—'}</b></span>
        <span>Min: <b>{marketStats.low ? marketStats.low.toLocaleString(undefined, { maximumFractionDigits: marketStats.low < 10 ? 4 : 2 }) : '—'}</b></span>
        <span>Corr BTC: <b>—</b></span>
        <span>Vol: <b>{Number.isFinite(marketStats.natr) ? `${marketStats.natr.toFixed(2)}%` : '—'}</b></span>
        {exchange === 'binance' && <span>Trades: <b>{marketStats.trades ? Math.round(marketStats.trades).toLocaleString() : '—'}</b></span>}
      </div>}
      <div className="hookchart-footer-controls" ref={setControlsContainer} />
      {footerActions && <div className="hookchart-footer-actions">{footerActions}</div>}
    </div>
  </div>;
});

export default HookChartCanvas;
