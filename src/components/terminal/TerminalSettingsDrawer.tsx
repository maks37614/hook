import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { translatePhrase } from '../../locales';
import {
  X,
  Sliders,
  Maximize2,
  Grid,
  Columns,
  Clock,
  Sparkles,
  Layers,
  RotateCcw,
  Check,
  Monitor,
  LayoutGrid,
} from 'lucide-react';
import { Timeframe, TerminalWorkspaceConfig } from '../../types';
import type { MarketSelection } from '../../utils/marketCoinLoader';
import { TERMINAL_PRESET_PAGE_SIZES } from '../../utils/terminalPresetPaging';
import { MAX_TERMINAL_TOUCH_GAP_PX, MIN_TERMINAL_TOUCH_GAP_PX, TERMINAL_TOUCH_GAP_STEP_PX, normalizeTerminalTouchGapPx } from '../../utils/terminalTouchGap';
import { getVisualProfile, VISUAL_GAP_MAX, VISUAL_ZOOM_MIN, VISUAL_ZOOM_MAX } from '../hookchart/visualProfiles';
import { applyTerminalInitialViewNow, discardTerminalInitialViewPreview, TERMINAL_FIT_HISTORY_PROFILE } from './terminalInitialViewApply';

interface TerminalSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Explicit Done flushes all changed workspace settings to this account. */
  onDone?: () => void;
  config: TerminalWorkspaceConfig;
  coinSelection: MarketSelection;
  coinLimit: number;
  onUpdateConfig: (updated: Partial<TerminalWorkspaceConfig>) => void;
  /** Fit loaded candle history in every Terminal chart after applying settings. */
  onApplyInitialFitAll?: () => void;
  /** Pause a saved fit-all mode while showing a temporary default-view preview. */
  onPreviewInitialDefaults?: () => void;
  /** Return chart fit mode to the saved workspace if the preview is dismissed. */
  onRestoreInitialFit?: () => void;
  onApplyGlobalTimeframe: (tf: Timeframe) => void;
  globalTimeframe?: Timeframe;
  onApplyPreset: (presetKey: 'focus_btc' | 'top_3' | 'top_4_patterns' | 'grid_4') => void;
  onResetWorkspace: () => void;
  totalBlocks: number;
}

export const TerminalSettingsDrawer: React.FC<TerminalSettingsDrawerProps> = ({
  isOpen,
  onClose,
  onDone,
  config,
  coinSelection,
  coinLimit,
  onUpdateConfig,
  onApplyInitialFitAll,
  onPreviewInitialDefaults,
  onRestoreInitialFit,
  onApplyGlobalTimeframe,
  globalTimeframe,
  onApplyPreset,
  onResetWorkspace,
  totalBlocks,
}) => {
  const { language, t } = useLanguage();
  const [initialApplied, setInitialApplied] = React.useState(false);
  const [defaultApplied, setDefaultApplied] = React.useState(false);
  const [hasUncommittedPreview, setHasUncommittedPreview] = React.useState(false);
  const [initialDirty, setInitialDirty] = React.useState(false);
  const [initialResetToDefault, setInitialResetToDefault] = React.useState(false);
  const [initialFitAll, setInitialFitAll] = React.useState(config.initialChartFitAll === true);
  // Keep slider edits local until Done. Moving a slider must never trigger a
  // reinitialization or store a half-finished profile for dozens of charts.
  const [initial, setInitial] = React.useState(() =>
    config.initialChartFitAll === true ? TERMINAL_FIT_HISTORY_PROFILE
      : config.initialChartView ?? getVisualProfile(undefined, 'terminalMedium', 'desktop'));
  React.useEffect(() => {
    if (!isOpen) {
      setInitialApplied(false);
      setDefaultApplied(false);
      setHasUncommittedPreview(false);
      setInitialDirty(false);
      setInitialResetToDefault(false);
    } else if (!initialDirty) {
      setInitial(config.initialChartFitAll === true ? TERMINAL_FIT_HISTORY_PROFILE
        : config.initialChartView ?? getVisualProfile(undefined, 'terminalMedium', 'desktop'));
      setInitialFitAll(config.initialChartFitAll === true);
    }
  }, [isOpen, config.initialChartView, config.initialChartFitAll, initialDirty]);
  const updateInitial = (patch: Partial<typeof initial>) => {
    setInitialApplied(false);
    setDefaultApplied(false);
    setInitialFitAll(false);
    setInitialResetToDefault(false);
    setInitialDirty(true);
    setInitial(previous => ({ ...previous, ...patch }));
  };
  const applyDefaultInitialView = () => {
    // Explicit built-in Terminal defaults, never the prior user's viewport.
    // Preview without persisting until Done; one event updates mounted charts.
    const defaults = getVisualProfile(undefined, 'terminalMedium', 'desktop');
    setInitial(defaults);
    setInitialFitAll(false);
    setInitialResetToDefault(false);
    setInitialDirty(true);
    setInitialApplied(false);
    setDefaultApplied(true);
    // A saved all-history request otherwise overrides the default viewport.
    onPreviewInitialDefaults?.();
    applyTerminalInitialViewNow(defaults);
    setHasUncommittedPreview(true);
  };
  const discardAndClose = () => {
    if (hasUncommittedPreview) {
      // Drop the preview overlay: each chart recovers its exact saved profile
      // (including user-specific HookChart defaults when no override exists).
      discardTerminalInitialViewPreview();
      onRestoreInitialFit?.();
    }
    onClose();
  };
  const saveAndClose = () => {
    if (initialDirty) {
      onUpdateConfig({
        initialChartView: initialResetToDefault ? undefined : initial,
        initialChartFitAll: initialFitAll,
      });
      // Saving a custom view after "fit all" must also replace the active
      // viewport immediately, even if the numeric profile happens to be equal.
      // This uses an existing in-browser event, not an exchange request.
      if (initialResetToDefault)
        applyTerminalInitialViewNow(getVisualProfile(undefined, 'terminalMedium', 'desktop'));
      if (!initialFitAll && !initialResetToDefault)
        applyTerminalInitialViewNow(initial);
    }
    // Ordinary close (X/backdrop) discards only the unsaved chart preview.
    // Done additionally flushes account workspace changes without debounce.
    if (onDone) onDone();
    else onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in"
      onClick={discardAndClose}
    >
      <div
        className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full overflow-y-auto flex flex-col shadow-2xl animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                {t('terminal.drawer.header')}
              </h3>
              <p className="text-xs text-slate-400">
                {t('terminal.workspace.summary', { count: totalBlocks })}
              </p>
            </div>
          </div>
          <button type="button"
            onClick={discardAndClose}
            aria-label={t('terminal.drawer.close')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings Sections */}
        <div className="p-5 space-y-6 flex-1 text-xs">
          <section className="space-y-3" aria-label={t('terminal.drawer.presetCoins')}>
            <h4 className="font-bold text-slate-300">{t('terminal.drawer.presetCoins')}</h4>
            <label className="flex items-center justify-between gap-3 text-slate-400">{t('terminal.drawer.exchange')}
              <select aria-label={t('terminal.drawer.presetExchange')} value={coinSelection.exchange}
                onChange={event => onUpdateConfig({ coinPresetExchange: event.target.value as MarketSelection['exchange'] })}
                className="w-44 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                <option value="all">{t('terminal.drawer.allExchanges')}</option><option value="binance">Binance</option><option value="bybit">Bybit</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-slate-400">{t('terminal.drawer.market')}
              <select aria-label={t('terminal.drawer.presetMarket')} value={coinSelection.marketType}
                onChange={event => onUpdateConfig({ coinPresetMarketType: event.target.value as MarketSelection['marketType'] })}
                className="w-44 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                <option value="all">{t('terminal.drawer.spotFutures')}</option><option value="futures">{t('terminal.drawer.futures')}</option><option value="spot">{t('terminal.drawer.spot')}</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-slate-400">{t('terminal.drawer.chartsPerPage')}
              <select aria-label={t('terminal.drawer.presetChartsPerPage')} value={coinLimit}
                onChange={event => onUpdateConfig({ coinPresetLimit: Number(event.target.value) })}
                className="w-44 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                {TERMINAL_PRESET_PAGE_SIZES.map(count => <option key={count} value={count}>{count}</option>)}
              </select>
            </label>
            <p className="text-[10px] text-slate-500">{t('terminal.drawer.chartsPerPageHelp')}</p>
          </section>
          {/* Layout Presets */}
          <div className="space-y-2.5">
            <label className="text-slate-300 font-bold flex items-center gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t('terminal.drawer.gridPresets')}</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: '1x1', label: '1х', sub: '1 графік' },
                { id: '1x2', label: '1x2', sub: 'Горизонтально' },
                { id: '2x1', label: '2x1', sub: 'Вертикально' },
                { id: '2x2', label: '2x2', sub: '4 сітка' },
                { id: '2x3', label: '2x3', sub: '6 сітка' },
                { id: '3x3', label: '3x3', sub: '9 сітка' },
                { id: '4x4', label: '4x4', sub: '16 сітка' },
                { id: '5x5', label: '5x5', sub: '25 сітка' },
                { id: '6x6', label: '6x6', sub: '36 сітка' },
                { id: 'custom', label: 'Вільний', sub: 'Гнучкий' },
              ].map((item) => (
                <button
                  key={item.id}
                  title={`${translatePhrase(language, item.label)} — ${translatePhrase(language, item.sub)}`}
                  aria-label={`${translatePhrase(language, item.label)} — ${translatePhrase(language, item.sub)}`}
                  onClick={() => {
                    let cols = config.columns;
                    if (item.id === '1x1' || item.id === '2x1') cols = 1;
                    else if (item.id === '1x2' || item.id === '2x2') cols = 2;
                    else if (item.id === '2x3' || item.id === '3x3') cols = 3;
                    else if (item.id === '4x4') cols = 4;
                    else if (item.id === '5x5') cols = 5;
                    else if (item.id === '6x6') cols = 6;
                    onUpdateConfig({
                      layoutPreset: item.id as any, columns: cols as any,
                      freeLayoutAutoColumns: item.id === 'custom',
                    });
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    config.layoutPreset === item.id && (item.id !== 'custom' || config.freeLayoutAutoColumns !== false)
                      ? 'bg-cyan-950/60 border-cyan-500/60 text-white shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span className="font-mono font-bold text-xs text-cyan-300">{translatePhrase(language, item.label)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Number of columns */}
          <div className="space-y-2.5">
            <label className="text-slate-300 font-bold flex items-center gap-1.5">
              <Columns className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t('terminal.drawer.columns')}</span>
            </label>
            <div className="grid grid-cols-6 gap-1.5">
              {([1, 2, 3, 4, 5, 6] as (1 | 2 | 3 | 4 | 5 | 6)[]).map((col) => (
                <button
                  key={col}
                  aria-label={t(col === 1 ? 'terminal.column.one' : col < 5 ? 'terminal.column.few' : 'terminal.column.many', { count: col })}
                  title={t(col === 1 ? 'terminal.column.one' : col < 5 ? 'terminal.column.few' : 'terminal.column.many', { count: col })}
                  onClick={() => onUpdateConfig({ columns: col, layoutPreset: 'custom', freeLayoutAutoColumns: false })}
                  className={`py-2 px-3 rounded-xl border font-mono font-bold text-center transition-all ${
                    config.columns === col
                      ? 'bg-cyan-600 border-cyan-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {col}
                </button>
              ))}
            </div>
          </div>

          {/* Touch-only scroll gutter; chart canvas gestures remain independent. */}
          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="terminal-touch-gap" className="font-bold text-slate-200">
                {t('terminal.drawer.touchGap')}
              </label>
              <output htmlFor="terminal-touch-gap" className="font-mono font-semibold text-cyan-300">
                {normalizeTerminalTouchGapPx(config.touchGapPx)} px
              </output>
            </div>
            <input
              id="terminal-touch-gap"
              type="range"
              min={MIN_TERMINAL_TOUCH_GAP_PX}
              max={MAX_TERMINAL_TOUCH_GAP_PX}
              step={TERMINAL_TOUCH_GAP_STEP_PX}
              value={normalizeTerminalTouchGapPx(config.touchGapPx)}
              onChange={event => onUpdateConfig({ touchGapPx: normalizeTerminalTouchGapPx(Number(event.target.value)) })}
              aria-label={t('terminal.drawer.touchGapAria')}
              className="w-full accent-cyan-500"
            />
            <p className="text-[11px] leading-relaxed text-slate-400">{t('terminal.drawer.touchGapHelp')}</p>
          </div>

          {/* Screen Adaptation: Auto-fit to viewport */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="font-bold text-white block">{t('terminal.drawer.autoFit')}</span>
                  <span className="text-[11px] text-slate-400 block">
                    {t('terminal.drawer.autoFitDesc')}
                  </span>
                </div>
              </div>
              <button type="button" role="switch"
                aria-label={t('terminal.drawer.autoFitAria')}
                aria-checked={config.autoFitScreen}
                onClick={() => onUpdateConfig({ autoFitScreen: !config.autoFitScreen })}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                  config.autoFitScreen ? 'bg-emerald-600' : 'bg-slate-800'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    config.autoFitScreen ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Terminal header clock and trading session popup. */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden="true" />
                <div>
                  <span className="block font-bold text-white">{t('terminal.drawer.showClock')}</span>
                  <span className="block text-[11px] text-slate-400">
                    {t('terminal.drawer.clockDescription')}
                  </span>
                </div>
              </div>
              <button type="button" role="switch"
                aria-label={t('terminal.drawer.clockAria')}
                aria-checked={config.showClock !== false}
                onClick={() => onUpdateConfig({ showClock: config.showClock === false })}
                className={`flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  config.showClock !== false ? 'bg-emerald-600' : 'bg-slate-800'
                }`}
              >
                <span aria-hidden="true"
                  className={`h-4 w-4 rounded-full bg-white shadow-md transition-transform ${
                    config.showClock !== false ? 'translate-x-5' : 'translate-x-0'
                  }`} />
              </button>
            </div>
          </div>

          {/* Block Height (when not in auto-fit) */}
          {!config.autoFitScreen && (
            <div className="space-y-2.5">
              <label className="text-slate-300 font-bold flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t('terminal.drawer.blockHeight')}</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'compact', label: 'Компактний', px: '280px' },
                  { id: 'medium', label: 'Стандартний', px: '380px' },
                  { id: 'large', label: 'Великий', px: '500px' },
                ].map((h) => (
                  <button
                    key={h.id}
                    onClick={() => onUpdateConfig({ blockHeight: h.id as any })}
                    className={`py-2 px-2.5 rounded-xl border text-center transition-all ${
                      config.blockHeight === h.id
                        ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 font-bold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div>{t(h.id === 'compact' ? 'terminal.drawer.heightCompact' : h.id === 'medium' ? 'terminal.drawer.heightMedium' : 'terminal.drawer.heightLarge')}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{h.px}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Initial viewport is terminal-only, persisted in workspace config. */}
          <section className="space-y-3 rounded-xl border border-cyan-800/50 bg-slate-950/65 p-3.5"
            aria-label={t('terminal.drawer.initialViewAria')}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-cyan-200">{t('terminal.drawer.initialView')}</h4>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  {t('terminal.drawer.initialViewHelp')}
                </p>
              </div>
              <button type="button" aria-label={t('terminal.drawer.resetInitial')}
                onClick={() => {
                  setInitialApplied(false);
                  setDefaultApplied(false);
                  setInitialDirty(true);
                  setInitialResetToDefault(true);
                  setInitialFitAll(false);
                  setInitial(getVisualProfile(undefined, 'terminalMedium', 'desktop'));
                }}
                className="shrink-0 rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-cyan-300">
                <RotateCcw className="h-4 w-4"/>
              </button>
            </div>
            <label className="block space-y-1.5">
              <span className="flex justify-between gap-2 text-slate-300">
                <span>{t('terminal.drawer.initialVisible')}</span>
                <b className="font-mono text-cyan-300">{initialFitAll ? t('terminal.drawer.allLoadedCandles') : initial.visibleBars}</b>
              </span>
              <input aria-label={t('terminal.drawer.initialVisibleAria')} type="range"
                min="15" max="500" step="5" value={initial.visibleBars}
                onChange={event => updateInitial({ visibleBars: Number(event.target.value) })}
                className="w-full accent-cyan-500" />
            </label>
            <label className="block space-y-1.5">
              <span className="flex justify-between gap-2 text-slate-300">
                <span>{t('terminal.drawer.rightGap')}</span>
                <b className="font-mono text-cyan-300">{t('terminal.settings.bars', { count: initial.rightGapBars })}</b>
              </span>
              <input aria-label={t('terminal.drawer.rightGapAria')} type="range"
                min="0" max={VISUAL_GAP_MAX} step="1" value={initial.rightGapBars}
                onChange={event => updateInitial({ rightGapBars: Number(event.target.value) })}
                className="w-full accent-cyan-500" />
            </label>
            <label className="block space-y-1.5">
              <span className="flex justify-between gap-2 text-slate-300">
                <span>{t('terminal.drawer.verticalZoom')}</span>
                <b className="font-mono text-cyan-300">{initial.verticalZoom.toFixed(2)}×</b>
              </span>
              <input aria-label={t('terminal.drawer.verticalZoomAria')} type="range"
                min={Math.log10(VISUAL_ZOOM_MIN)} max={Math.log10(VISUAL_ZOOM_MAX)}
                step=".02" value={Math.log10(initial.verticalZoom)}
                onChange={event => updateInitial({
                  verticalZoom: Number((10 ** Number(event.target.value)).toFixed(3)),
                  autoPriceScale: false,
                })}
                className="w-full accent-cyan-500" />
            </label>
            <label className="flex items-center justify-between gap-3 text-slate-300">
              <span>{t('terminal.drawer.autoPrice')}</span>
              <input type="checkbox" checked={initial.autoPriceScale}
                aria-label={t('terminal.drawer.autoPriceAria')}
                onChange={event => updateInitial({ autoPriceScale: event.target.checked })}
                className="h-4 w-4 accent-cyan-500" />
            </label>
            <button type="button"
              onClick={applyDefaultInitialView}
              className="relative z-10 w-full cursor-pointer touch-manipulation rounded-lg border border-cyan-600 bg-cyan-950/60 px-3 py-2.5 font-bold text-cyan-200 transition-colors hover:bg-cyan-900/60 active:bg-cyan-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
              {t('terminal.drawer.applyInitial')}
            </button>
            <button type="button"
              onClick={() => {
                // Keep the former all-history option as a separate action.
                // It updates every chart without new network subscriptions.
                setInitial(TERMINAL_FIT_HISTORY_PROFILE);
                setInitialFitAll(true);
                setInitialResetToDefault(false);
                setInitialDirty(true);
                setDefaultApplied(false);
                applyTerminalInitialViewNow(TERMINAL_FIT_HISTORY_PROFILE);
                setHasUncommittedPreview(true);
                setInitialApplied(true);
                onApplyInitialFitAll?.();
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-300 hover:border-cyan-700 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
              {t('terminal.drawer.fitHistory')}
            </button>
            {defaultApplied && (
              <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs text-emerald-300">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {t('terminal.drawer.defaultsApplied')}
              </p>
            )}
            {initialApplied && (
              <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs text-emerald-300">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {t('terminal.drawer.initialApplied')}
              </p>
            )}
            <p className="text-[10px] leading-relaxed text-slate-500">
              {t('terminal.drawer.initialInfo')}
            </p>
          </section>

          {/* Global Timeframe Switcher */}
          <div className="space-y-2.5">
            <label className="text-slate-300 font-bold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t('terminal.drawer.globalTimeframe')}</span>
            </label>
            <div className="grid grid-cols-7 gap-1 font-mono">
              {(['5s', '30s', '1m', '5m', '15m', '1h', '4h', '1d'] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => onApplyGlobalTimeframe(tf)}
                  aria-pressed={(globalTimeframe ?? config.globalTimeframe) === tf}
                  className={`py-1.5 rounded-lg border text-center font-bold transition-colors ${
                    (globalTimeframe ?? config.globalTimeframe) === tf
                      ? 'border-cyan-500 bg-cyan-700/70 text-white'
                      : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:bg-cyan-600 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Preset Workspaces */}
          <div className="space-y-2.5">
            <label className="text-slate-300 font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('terminal.drawer.quickPresets')}</span>
            </label>
            <div className="space-y-2">
              <button
                onClick={() => onApplyPreset('focus_btc')}
                className="w-full p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="font-bold text-white">{t('terminal.drawer.btcFocus')}</div>
                  <div className="text-[11px] text-slate-400">{t('terminal.drawer.btcFocusHelp')}</div>
                </div>
                <span className="font-mono text-xs text-amber-400 font-bold">BTCUSDT</span>
              </button>

              <button
                onClick={() => onApplyPreset('top_3')}
                className="w-full p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="font-bold text-white">{t('terminal.drawer.topLiquidity')}</div>
                  <div className="text-[11px] text-slate-400">BTC + ETH + SOL</div>
                </div>
                <span className="font-mono text-xs text-cyan-400 font-bold">{t('terminal.drawer.threeCharts')}</span>
              </button>

              <button
                onClick={() => onApplyPreset('grid_4')}
                className="w-full p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="font-bold text-white">{t('terminal.drawer.square4')}</div>
                  <div className="text-[11px] text-slate-400">BTC + ETH + SOL + SUI</div>
                </div>
                <span className="font-mono text-xs text-cyan-400 font-bold">{t('terminal.drawer.fourCharts')}</span>
              </button>

              <button
                onClick={() => onApplyPreset('top_4_patterns')}
                className="w-full p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>{t('terminal.drawer.topPatterns')}</span>
                    <span className="text-[9px] px-1 rounded bg-purple-900/60 text-purple-300">AI</span>
                  </div>
                  <div className="text-[11px] text-slate-400">{t('terminal.drawer.topPatternsHelp')}</div>
                </div>
                <span className="font-mono text-xs text-purple-400 font-bold">{t('terminal.drawer.patterns')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between gap-3">
          <button
            onClick={onResetWorkspace}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-950/80 text-rose-300 border border-rose-900/60 text-xs font-semibold transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('terminal.drawer.clearWorkspace')}</span>
          </button>

          <button
            onClick={saveAndClose}
            className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors"
          >
            {t('terminal.drawer.done')}
          </button>
        </div>
      </div>
    </div>
  );
};
