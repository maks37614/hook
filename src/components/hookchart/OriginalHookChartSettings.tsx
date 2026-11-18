import React, { useContext, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { resolveHookChartLanguage, translateHookChartPhrase } from '../../locales/hookchartLanguage';
import { HOOKCHART_HOTKEY_UI, hotkeyActionLabel, hotkeyGroupLabel } from '../../locales/hookchartHotkeys';
import type { SupportedLanguage } from '../../locales';
import { createPortal } from 'react-dom';
import type { ExchangeId, HookChartPreferences, MarketType } from '../../types';
import { clampHookChartHistory } from '../../utils/hookChartHistory';
import { normalizeDensityDistance } from './marketAnalytics';
import { normalizeMarketPrintDisplayMinUsd } from './marketPrintBuckets';
import { mainSettingHelpText } from './mainSettingsHelp';
import { DEFAULT_MAX_CANVAS_DPR, effectiveCanvasDpr, normalizeMaxCanvasDpr } from './canvasDpr';
import { applyVisualDefaultsForDevice, VISUAL_ZOOM_MIN, VISUAL_ZOOM_MAX, VISUAL_GAP_MAX, getVisualProfile, makeVisualProfileKey, normalizedVisualProfiles, patchVisualProfile, selectableVisualContexts, visibleScaleContext, visualDeviceForWidth, type VisualContextId, type VisualDevice, type VisualProfileKey } from './visualProfiles';
import type { Candle, Viewport } from './engine';
import { HookChartVisualPreview } from './HookChartVisualPreview';
import { DEFAULT_CROSSHAIR_LINE_WIDTH, normalizeCrosshairLineWidth } from './chartCursor';
import { STRATEGY_FUTURES_NOTE, STRATEGY_PRESETS } from './strategyEngine';

export type HookChartHotkeyAction =
  | 'cancel' | 'copyTicker' | 'openWindow' | 'openMetaScalp' | 'deleteCoin' | 'toggleFavorites'
  | 'prevCoin' | 'nextCoin' | 'prevChart' | 'nextChart' | 'prevTf' | 'nextTf' | 'prevTfAll' | 'nextTfAll'
  | 'zoomIn' | 'zoomOut' | 'tempRuler' | 'erase' | 'signalLevel' | 'clearAlerts' | 'ray' | 'level' | 'fib' | 'trend'
  | 'toggleDensity' | 'toggleLiquidations' | 'toggleLiqCandleSums' | 'toggleMarketPrintSums' | 'toggleMagnifier';

export type HookChartHotkeys = Record<HookChartHotkeyAction, string>;

export const DEFAULT_HOOKCHART_HOTKEYS: HookChartHotkeys = {
  cancel: 'Escape',
  copyTicker: 'Ctrl+KeyC',
  openWindow: 'Ctrl+KeyO',
  openMetaScalp: 'Ctrl+KeyB',
  deleteCoin: 'Ctrl+Delete',
  toggleFavorites: 'Ctrl+KeyX',
  prevCoin: 'ArrowUp',
  nextCoin: 'ArrowDown',
  prevChart: 'Shift+Tab',
  nextChart: 'Tab',
  prevTf: 'ArrowLeft',
  nextTf: 'ArrowRight',
  prevTfAll: 'Shift+ArrowLeft',
  nextTfAll: 'Shift+ArrowRight',
  zoomIn: 'Shift+Equal|NumpadAdd',
  zoomOut: 'Minus|NumpadSubtract',
  tempRuler: 'Shift',
  erase: 'F6',
  signalLevel: 'F1',
  clearAlerts: 'Shift+F1',
  ray: 'F4',
  level: 'F3',
  fib: 'F5',
  trend: 'F2',
  toggleDensity: 'Alt+Shift+KeyD',
  toggleLiquidations: 'Alt+Shift+KeyQ',
  toggleLiqCandleSums: 'Alt+Shift+KeyU',
  toggleMarketPrintSums: 'Alt+Shift+KeyV',
  toggleMagnifier: 'Alt+Shift+KeyM',
};

export const ORIGINAL_HOOKCHART_DEFAULTS: HookChartPreferences = {
  language: 'uk',
  timezone: 'auto',
  tooltips: true,
  notificationOpenNew: false,
  rightPadding: 10,
  maxCanvasDpr: DEFAULT_MAX_CANVAS_DPR,
  rightPaddingEnabled: true,
  rightPaddingVersion: 2,
  chartToolbar: true,
  // Show the expand chevron first; extra tools and their compact TF menu open on demand.
  showTopToolbarIcons: false,
  notificationDialog: true,
  singleWindowSize: 85,
  pagingButtons: true,
  sharedDrawings: true,
  duplicateCrosshair: false,
  crosshairLineWidth: DEFAULT_CROSSHAIR_LINE_WIDTH,
  horizontalDrawingLineWidth: 0.4,
  trendDrawingLineWidth: 0.4,
  scalperTrendLineWidth: 0.9,
  showMarketPrintSums: false,
  showMarketPrintArrows: true,
  marketPrintArrowSize: 4,
  marketPrintFontSize: 10,
  marketPrintMinUsd: 0,
  showVolumes: true,
  showMarketStatsBar: true,
  showLiquidations: true,
  showLiquidationCandleSums: true,
  showLiquidationDetailSums: true,
  showLiquidationArrows: true,
  liquidationArrowSize: 5,
  liquidationSumFontSize: 10,
  liquidationDetailFontSize: 9,
  showModeledLiquidationZones: false,
  showLiqRiskBlock: true,
  showLiquidationLong: true,
  showLiquidationShort: true,
  showDensityLines: false,
  showDensityLabels: false,
  showDensityAmounts: false,
  showBrokenLevels: true,
  autoSR: false,
  showSRLabels: true,
  autoPrevDay: false,
  autoDayOpen: false,
  autoVWAP: false,
  autoLocalHL: false,
  autoRoundLevels: false,
  autoChannel: false,
  autoPOC: false,
  autoStops: false,
  scoring: false,
  roundDistance: false,
  roundness: 2,
  roundGrid: false,
  gridHorizontal: false,
  gridVertical: false,
  levelIntervals: ['1h', '4h', '1d'],
  showNearestLevels: true,
  levelCandleCount: 15,
  levelHistory: 500,
  levelCount: 3,
  levelDiff: 0.18,
  levelBreak: 0.35,
  levelLabelMode: 'always',
  levelLabelColor: '#2090F0',
  levelLabelSize: 9,
  levelLineWidth: 0.3,
  levelLabelStyle: 'text',
  levelLineStyle: 'solid',
  allowWick: true,
  trendIntervals: ['1h', '4h', '1d'],
  trendHistory: 300,
  densityAnalysis: true,
  densityTop: true,
  densityBaseVolume: false,
  densityImbalance: false,
  densityTimeoutMin: 0,
  densityDiffPct: 5,
  densityAutoMultiplier: 1,
  densityAutoDisplay: 'potential',
  densityNearLevelsOnly: false,
  densityMode: 'auto',
  densityThreshold: 0,
  oiColumn: true,
  oiDisplay: 'value',
  oiBaseChange: false,
  oiPeriod: '24h',
  fundingColumn: true,
  change24: true,
  volume24: true,
  natrTf: '',
  natrPeriod: 14,
  vrTf: '',
  vrCandles: 500,
  pDeltaTf: '',
  pAvgTf: '',
  pAvgCandles: 500,
  rBtcTf: '',
  rBtcCandles: 100,
  tradesWindow: '15m',
  tradesTA: true,
  tradesTR: true,
  tradesCandles: 100,
  candleLongColor: '#0ECB81',
  candleShortColor: '#F6465D',
  densityLineColor: '#7B61FF',
  densityLabelColor: '#C4B5FD',
  densityLineWidth: 0.5,
  densityLineStyle: 'solid',
  densityLabelSize: 8,
  drawingToolbarOpen: false,
  terminalExtraToolsOpen: false,
  indicators: [],
  strategyId: '',
  scalperMode: false,
  scalperRegressionMode: false,
  showScalperLabels: true,
  hotkeys: DEFAULT_HOOKCHART_HOTKEYS,
};

export function normalizeOriginalHookChartPreferences(source?: HookChartPreferences): HookChartPreferences {
  const next: HookChartPreferences = { ...ORIGINAL_HOOKCHART_DEFAULTS, ...(source || {}) };
  next.visualProfiles = normalizedVisualProfiles(source?.visualProfiles);
  next.maxCanvasDpr = normalizeMaxCanvasDpr(source?.maxCanvasDpr);
  if (source?.maxChartCandles !== undefined) next.maxChartCandles = clampHookChartHistory(source.maxChartCandles);
  next.densityDiffPct = normalizeDensityDistance(source?.densityDiffPct);
  next.crosshairLineWidth = normalizeCrosshairLineWidth(source?.crosshairLineWidth);
  next.marketPrintMinUsd = normalizeMarketPrintDisplayMinUsd(source?.marketPrintMinUsd);
  const displaySize = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
  next.showMarketPrintArrows = source?.showMarketPrintArrows !== false;
  next.marketPrintArrowSize = displaySize(source?.marketPrintArrowSize, 4, 2, 16);
  next.marketPrintFontSize = displaySize(source?.marketPrintFontSize, 10, 8, 22);
  next.showLiquidationArrows = source?.showLiquidationArrows !== false;
  next.showLiquidationDetailSums = source?.showLiquidationDetailSums !== false;
  next.liquidationArrowSize = displaySize(source?.liquidationArrowSize, 5, 2, 16);
  next.liquidationSumFontSize = displaySize(source?.liquidationSumFontSize, 10, 8, 22);
  next.liquidationDetailFontSize = displaySize(source?.liquidationDetailFontSize, 9, 8, 22);
  next.horizontalDrawingLineWidth = Number.isFinite(source?.horizontalDrawingLineWidth)
    ? Math.max(0.2, Math.min(5, source!.horizontalDrawingLineWidth!)) : 0.4;
  next.trendDrawingLineWidth = Number.isFinite(source?.trendDrawingLineWidth)
    ? Math.max(0.2, Math.min(5, source!.trendDrawingLineWidth!)) : 0.4;
  next.scalperTrendLineWidth = Number.isFinite(source?.scalperTrendLineWidth)
    ? Math.max(0.2, Math.min(5, source!.scalperTrendLineWidth!)) : 0.9;
  // Explicit true only. Existing accounts cannot opt in accidentally.
  next.showModeledLiquidationZones = source?.showModeledLiquidationZones === true;
  next.scalperMode = source?.scalperMode === true;
  next.scalperRegressionMode = source?.scalperRegressionMode === true;
  next.showScalperLabels = source?.showScalperLabels !== false;
  next.showLiquidationCandleSums = source?.showLiquidationCandleSums !== false;
  for (const key of ['liquidationLongMinUsd', 'liquidationShortMinUsd'] as const) {
    const value = source?.[key];
    next[key] = typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.min(1_000_000_000_000, Math.round(value * 100) / 100) : null;
  }
  next.densityAutoDisplay = source?.densityAutoDisplay === 'all' ? 'all' : 'potential';
  // Legacy values were pixels; only version 2 stores a candle count.
  next.rightPadding = source?.rightPaddingVersion === 2 && Number.isFinite(source.rightPadding)
    ? Math.max(0, Math.min(500, Math.round(source.rightPadding!))) : 10;
  next.rightPaddingEnabled = source?.rightPaddingEnabled !== false;
  next.rightPaddingVersion = 2;
  next.levelIntervals = Array.isArray(source?.levelIntervals)
    ? [...new Set(source.levelIntervals.filter(tf => ['5m', '15m', '30m', '1h', '4h', '1d'].includes(tf)))]
    : ['1h', '4h', '1d'];
  next.levelLabelColor = /^#[0-9a-f]{6}$/i.test(source?.levelLabelColor || '') ? source!.levelLabelColor : '#2090F0';
  // Preserve existing users' level-label font sizes; the new line width is separate.
  next.levelLabelSize = Number.isFinite(source?.levelLabelSize) ? Math.max(8, Math.min(24, source!.levelLabelSize!)) : 9;
  next.levelLineWidth = Number.isFinite(source?.levelLineWidth) ? Math.max(0.2, Math.min(5, source!.levelLineWidth!)) : 0.3;
  next.levelLabelStyle = ['text', 'filled', 'outline'].includes(source?.levelLabelStyle || '') ? source!.levelLabelStyle : 'text';
  next.levelLineStyle = ['solid', 'dash', 'dot'].includes(source?.levelLineStyle || '') ? source!.levelLineStyle : 'solid';
  const overlays = source?.overlays || [];
  if (source?.autoSR === undefined) next.autoSR = overlays.includes('sr');
  if (source?.autoPrevDay === undefined) next.autoPrevDay = overlays.includes('prevDay');
  if (source?.autoDayOpen === undefined) next.autoDayOpen = overlays.includes('dayOpen');
  if (source?.autoVWAP === undefined) next.autoVWAP = overlays.includes('vwap');
  if (source?.autoLocalHL === undefined) next.autoLocalHL = overlays.includes('localHL');
  if (source?.autoRoundLevels === undefined) next.autoRoundLevels = overlays.includes('roundLevels');
  if (source?.autoPOC === undefined) next.autoPOC = overlays.includes('poc');
  if (source?.autoChannel === undefined) next.autoChannel = overlays.includes('channel');
  if (source?.autoStops === undefined) next.autoStops = overlays.includes('stops');
  next.hotkeys = { ...DEFAULT_HOOKCHART_HOTKEYS, ...(source?.hotkeys || {}) };
  return next;
}

function keyCode(e: KeyboardEvent): string {
  if (['NumpadAdd', 'NumpadSubtract', 'Equal', 'Minus'].includes(e.code)) return e.code;
  if (/^Key[A-Z]$/.test(e.code) || /^Digit[0-9]$/.test(e.code)) return e.code;
  if (e.key === 'Control') return 'Ctrl';
  if (e.key === 'Meta') return 'Meta';
  if (e.key === 'Alt') return 'Alt';
  if (e.key === 'Shift') return 'Shift';
  if (e.key === 'Esc') return 'Escape';
  if (e.key === 'Del') return 'Delete';
  return e.key;
}
export function hotkeyFromEvent(e: KeyboardEvent): string {
  const base = keyCode(e);
  const mods: string[] = [];
  if (e.ctrlKey && base !== 'Ctrl') mods.push('Ctrl');
  if (e.altKey && base !== 'Alt') mods.push('Alt');
  if (e.shiftKey && base !== 'Shift') mods.push('Shift');
  if (e.metaKey && base !== 'Meta') mods.push('Meta');
  return [...mods, base].filter(Boolean).join('+');
}
export function hotkeyMatches(e: KeyboardEvent, spec?: string): boolean {
  return !!spec && spec.split('|').some(candidate => candidate === hotkeyFromEvent(e));
}
export function hotkeyDisplay(spec: string): string {
  if (!spec) return 'Не призначено';
  const labels: Record<string, string> = {
    Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Meta', Escape: 'Esc', Delete: 'Del',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Tab: 'Tab',
    Equal: '=', Minus: '−', NumpadAdd: 'Num +', NumpadSubtract: 'Num −',
  };
  return spec.split('|').map(candidate => candidate.split('+').map(key => labels[key] || (key.startsWith('Key') ? key.slice(3) : key.startsWith('Digit') ? key.slice(5) : key)).join(' + ')).join(' / ');
}

export const HOTKEY_GROUPS: Array<{ title: string; rows: Array<{ id: HookChartHotkeyAction; label: string }> }> = [
  { title: 'Загальні', rows: [
    { id: 'cancel', label: 'Скасувати малювання / закрити діалог' },
    { id: 'copyTicker', label: 'Скопіювати поточний тикер' },
    { id: 'openWindow', label: 'Відкрити поточну монету в новому вікні' },
    { id: 'openMetaScalp', label: 'Відкрити поточну монету в терміналі MetaScalp' },
    { id: 'deleteCoin', label: 'Видалити поточну монету' },
    { id: 'toggleFavorites', label: 'Показати / приховати список обраних монет' },
  ] },
  { title: 'Навігація', rows: [
    { id: 'prevCoin', label: 'Попередня монета' },
    { id: 'nextCoin', label: 'Наступна монета' },
    { id: 'prevChart', label: 'Попередній графік' },
    { id: 'nextChart', label: 'Наступний графік' },
    { id: 'prevTf', label: 'Попередній таймфрейм' },
    { id: 'nextTf', label: 'Наступний таймфрейм' },
    { id: 'prevTfAll', label: 'Попередній таймфрейм на всіх графіках' },
    { id: 'nextTfAll', label: 'Наступний таймфрейм на всіх графіках' },
  ] },
  { title: 'Графік', rows: [
    { id: 'zoomIn', label: 'Збільшити масштаб графіка' },
    { id: 'zoomOut', label: 'Зменшити масштаб графіка' },
  ] },
  { title: 'Відображення даних', rows: [
    { id: 'toggleDensity', label: 'Показати / приховати щільності BID/ASK' },
    { id: 'toggleLiquidations', label: 'Показати / приховати ліквідації' },
    { id: 'toggleLiqCandleSums', label: 'Показати / приховати суми ліквідацій під свічками' },
    { id: 'toggleMarketPrintSums', label: 'Показати / приховати суми великих ринкових угод під свічками' },
    { id: 'toggleMagnifier', label: 'Перемкнути лупу під курсором (середня кнопка миші — окремо)' },
  ] },
  { title: 'Інструменти малювання', rows: [
    { id: 'tempRuler', label: 'Часова лінійка' },
    { id: 'erase', label: 'Перемкнути режим видалення перетнутих фігур' },
    { id: 'signalLevel', label: 'Сигнальний рівень' },
    { id: 'clearAlerts', label: 'Видалити всі цінові сповіщення' },
    { id: 'ray', label: 'Промінь' },
    { id: 'level', label: 'Горизонтальна лінія' },
    { id: 'fib', label: 'Фібоначчі' },
    { id: 'trend', label: 'Трендова лінія' },
  ] },
];

const MainSettingsHelpContext = React.createContext(false);
/** The chart can use another language than the site. Portaled help must inherit it. */
const ChartSettingsLanguageContext = React.createContext<SupportedLanguage>('uk');
const SettingsSectionContext = React.createContext('');

function Section({ title, localizedTitle, help, children }: { title: string; localizedTitle?: string; help?: string; children: React.ReactNode }) {
  const language = useContext(ChartSettingsLanguageContext);
  // Keep original keys for contextual help and guides; do not re-translate Hotkey labels.
  return <SettingsSectionContext.Provider value={title}>
    <section className="settingsSection" data-hookchart-guide-section={title}><h3>{localizedTitle ?? translateHookChartPhrase(language, title)}{help && <VisualSettingHelp label={title} text={help}/>}</h3>{children}</section>
  </SettingsSectionContext.Provider>;
}
/** Accessible, tap-to-open help. The portal escapes the scroll-clipped chart settings dialog. */
function VisualSettingHelp({ text, label, compact = false }: { text: string; label: string; compact?: boolean }) {
  const language = useContext(ChartSettingsLanguageContext);
  const translatedText = translateHookChartPhrase(language, text);
  const translatedLabel = translateHookChartPhrase(language, label);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipId = React.useId();
  const [position, setPosition] = useState({ left: 8, top: 8, width: 280 });
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const place = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(320, Math.max(160, window.innerWidth - 16));
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, bounds.left - width / 2 + bounds.width / 2));
      const below = window.innerHeight - bounds.bottom >= 170 || bounds.top < 170;
      const top = below ? bounds.bottom + 7 : Math.max(8, bounds.top - 160);
      setPosition({ left, top, width });
    };
    place();
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !triggerRef.current?.contains(target) &&
          !document.getElementById(tooltipId)?.contains(target)) setOpen(false);
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside);
    window.addEventListener('keydown', dismissEscape);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      window.removeEventListener('keydown', dismissEscape);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, tooltipId]);

  return <span className={'visualSettingHelp' + (compact ? ' mainSettingHelp' : '')}>
    <button ref={triggerRef} type="button" className="visualSettingHelpButton"
      aria-label={`${translateHookChartPhrase(language, 'Пояснення:')} ${translatedLabel}`} aria-expanded={open}
      aria-describedby={open ? tooltipId : undefined} aria-controls={open ? tooltipId : undefined}
      onPointerEnter={event => { if (event.pointerType === 'mouse' || event.pointerType === 'pen') setOpen(true); }}
      onPointerLeave={event => { if (event.pointerType === 'mouse' || event.pointerType === 'pen') setOpen(false); }}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen(true)}>?</button>
    {open && typeof document !== 'undefined' && createPortal(
      <span id={tooltipId} className="hookchartVisualHelpPopover" role="tooltip" data-hookchart-language={language} lang={language}
        style={{ position: 'fixed', left: position.left, top: position.top, width: position.width }}>
        {translatedText}
      </span>, document.body,
    )}
  </span>;
}
function LiquidationHelp({ text, label }: { text: string; label: string }) {
  const language = useContext(ChartSettingsLanguageContext);
  const localizedLabel = translateHookChartPhrase(language, label);
  const localizedText = translateHookChartPhrase(language, text);
  return <span className="liqSettingHelp"><button type="button" aria-label={localizedLabel + '. ' + localizedText} title={localizedText}>?</button><span role="tooltip">{localizedText}</span></span>;
}
function Setting({ label, desc, help, rowClassName, children }: { label: string; desc?: string; help?: string; rowClassName?: string; children: React.ReactNode }) {
  const mainSettings = useContext(MainSettingsHelpContext);
  const language = useContext(ChartSettingsLanguageContext);
  const section = useContext(SettingsSectionContext);
  // Keep descriptions in contextual help only: a second paragraph under every
  // control duplicates the ? tooltip and crowds phone-sized settings panels.
  const explanation = mainSettings ? (mainSettingHelpText(section, label) || help || desc) : (help || desc);
  return <div data-hookchart-guide-setting={label} className={'settingRow' + (rowClassName ? ' ' + rowClassName : '')}><div className="settingText"><b>{translateHookChartPhrase(language, label)}{mainSettings ? (explanation && <VisualSettingHelp label={label} text={explanation} compact />) : (help ? <LiquidationHelp label={label} text={help} /> : (desc && <VisualSettingHelp label={label} text={desc} />))}</b></div><div className="settingControl">{children}</div></div>;
}
function SwitchRow({ label, desc, help, rowClassName, value, onChange }: { label: string; desc?: string; help?: string; rowClassName?: string; value: boolean; onChange: (value: boolean) => void }) {
  // A user may select a chart language different from the site's language.
  // A translated scalper description must never be translated back to the site locale.
  const language = useContext(ChartSettingsLanguageContext);
  return <Setting label={label} desc={desc} help={help} rowClassName={rowClassName}><label className="settingsSwitch"><input type="checkbox" aria-label={translateHookChartPhrase(language, label)} checked={value} onChange={event => onChange(event.target.checked)} /><span /></label></Setting>;
}
export function LiquidationMinimum({ value, disabled, onChange }: { value?: number | null; disabled?: boolean; onChange: (value: number | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    setDraft(null);
    const text = raw.trim().replace(',', '.');
    if (!text) { if (value != null) onChange(null); return; }
    const next = Number(text);
    if (!Number.isFinite(next) || next < 0) return;
    const clamped = Math.min(1_000_000_000_000, next);
    if (clamped !== value) onChange(clamped);
  };
  const language = useContext(ChartSettingsLanguageContext);
  return <input className="numInput" type="text" inputMode="decimal" placeholder={translateHookChartPhrase(language, 'Авто')}
    disabled={disabled} value={draft ?? (value ?? '')}
    aria-label={translateHookChartPhrase(language, 'Мінімальна сума ліквідації у доларах США')}
    onFocus={event => { setDraft(String(value ?? '')); event.currentTarget.select(); }}
    onChange={event => setDraft(event.currentTarget.value)}
    onBlur={event => commit(event.currentTarget.value)}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
  />;
}
export function Num({ value, set, min, max, disabled = false, ariaLabel }: { value: number; set: (value: number) => void; min?: number; max?: number; step?: number; disabled?: boolean; ariaLabel?: string }) {
  // Keep a temporary string while editing. Number('') is zero, so committing
  // on every keystroke prevents users from deleting a displayed 0 on iOS.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    setDraft(null);
    if (!raw.trim()) return; // Empty input cancels the edit, not a new zero.
    let next = Number(raw.trim().replace(',', '.'));
    if (!Number.isFinite(next)) return;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    if (next !== value) set(next);
  };
  const language = useContext(ChartSettingsLanguageContext);
  return <input className="numInput" type="text" inputMode="decimal" value={draft ?? value} disabled={disabled} aria-label={ariaLabel ? translateHookChartPhrase(language, ariaLabel) : undefined}
    onFocus={event => { setDraft(String(value)); event.currentTarget.select(); }}
    onChange={event => setDraft(event.currentTarget.value)}
    onBlur={event => commit(event.currentTarget.value)}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
  />;
}
function Choice({ label, desc, help, values, labels, value, set }: { label: string; desc?: string; help?: string; values: Array<string | number>; labels?: string[]; value: unknown; set: (value: any) => void }) {
  const language = useContext(ChartSettingsLanguageContext);
  // Language choices are endonyms and should remain in their original spelling.
  const nativeLanguages = new Set(['Українська', 'Polski', 'Русский', 'English']);
  return <Setting label={label} desc={desc} help={help}><div className="settingsChips">{values.map((entry, index) => <button type="button" key={String(entry)} value={String(entry)} aria-pressed={value === entry} className={value === entry ? 'sel' : ''} onClick={() => set(entry)}>{labels?.[index] && !nativeLanguages.has(labels[index]) ? translateHookChartPhrase(language, labels[index]) : labels?.[index] ?? String(entry)}</button>)}</div></Setting>;
}
function MultiChoice({ label, desc, values, selected, toggle, max }: { label: string; desc?: string; values: string[]; selected: string[]; toggle: (value: string) => void; max?: number }) {
  const language = useContext(ChartSettingsLanguageContext);
  return <Setting label={label} desc={desc}><div className="settingsChips">{values.map(entry => <button type="button" key={entry} aria-pressed={selected.includes(entry)} className={selected.includes(entry) ? 'sel' : ''} disabled={!selected.includes(entry) && max !== undefined && selected.length >= max} onClick={() => toggle(entry)}>{translateHookChartPhrase(language, entry)}</button>)}</div></Setting>;
}

export function HotkeySettings({ hotkeys, setHotkeys, language }: {
  hotkeys: HookChartHotkeys; setHotkeys: (value: HookChartHotkeys) => void; language: SupportedLanguage;
}) {
  const copy = HOOKCHART_HOTKEY_UI[language];
  const [editing, setEditing] = useState<HookChartHotkeyAction | null>(null);
  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') { setEditing(null); return; }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        setHotkeys({ ...hotkeys, [editing]: '' });
        setEditing(null);
        return;
      }
      const value = hotkeyFromEvent(event);
      if (!value || ['Ctrl', 'Alt', 'Shift', 'Meta'].includes(value)) return;
      setHotkeys({ ...hotkeys, [editing]: value });
      setEditing(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [editing, hotkeys, setHotkeys]);

  return <ChartSettingsLanguageContext.Provider value={language}><div className="hotkeySettings">
    <div className="settingsHint">{copy.instructions}</div>
    <button type="button" className="resetHotkeys" onClick={() => setHotkeys(DEFAULT_HOOKCHART_HOTKEYS)}>{copy.reset}</button>
    {HOTKEY_GROUPS.map(group => <Section title={group.title} localizedTitle={hotkeyGroupLabel(language, group.title)} key={group.title}>{group.rows.map(row => <div className="hotkeyRow" key={row.id}>
      <span>{hotkeyActionLabel(language, row.id, row.label)}</span>
      <button type="button" className={editing === row.id ? 'recording' : ''}
        aria-label={`${hotkeyActionLabel(language, row.id, row.label)}: ${editing === row.id ? copy.record : (hotkeys[row.id] ? hotkeyDisplay(hotkeys[row.id]) : copy.unassigned)}`}
        onClick={() => setEditing(row.id)}>{editing === row.id ? copy.record : (hotkeys[row.id] ? hotkeyDisplay(hotkeys[row.id]) : copy.unassigned)}</button>
      <button type="button" className="hotkeyClear" title={copy.clear}
        aria-label={`${copy.clear}: ${hotkeyActionLabel(language, row.id, row.label)}`}
        onClick={() => setHotkeys({ ...hotkeys, [row.id]: '' })}>×</button>
      <button type="button" className="hotkeyResetOne" title={copy.reset}
        aria-label={`${copy.reset}: ${hotkeyActionLabel(language, row.id, row.label)}`}
        onClick={() => setHotkeys({ ...hotkeys, [row.id]: DEFAULT_HOOKCHART_HOTKEYS[row.id] })}>↺</button>
    </div>)}</Section>)}
  </div></ChartSettingsLanguageContext.Provider>;
}

const STRATEGY_GROUP_NAMES: Record<string, string> = {
  impulse: 'Імпульс',
  breakout: 'Пробій рівня',
  reaction: 'Реакція біля рівня',
  overheat: 'Перегрів',
  density: 'Щільності',
  volatility: 'Волатильність',
  patterns: 'Патерни',
};
const RISK_LABELS: Record<string, string> = {
  aggressive: 'Агресивний',
  classic: 'Класичний',
  conservative: 'Консервативний',
  analysis: 'Аналіз',
};
function StrategySettings({ activeId, onSelect }: { activeId: string; onSelect: (id: string) => void }) {
  const language = useContext(ChartSettingsLanguageContext);
  const t = (source: string) => translateHookChartPhrase(language, source);
  const groups = Array.from(new Set(STRATEGY_PRESETS.map(preset => preset.config.kind)));
  return <div className="strategySettings">
    <div className="settingsHint">{t('Вибір пресета одразу застосовує його параметри та запускає автоматичний аналіз/розмітку графіка.')}</div>
    <button type="button" className={activeId ? 'strategyOff' : 'strategyOff active'} onClick={() => onSelect('')}>{t('Вимкнути')}</button>
    {groups.map(group => <Section title={STRATEGY_GROUP_NAMES[group] || group} key={group}>
      <div className="strategyGrid">{STRATEGY_PRESETS.filter(preset => preset.config.kind === group).map(preset => <button type="button" key={preset.id} className={'strategyCard ' + (activeId === preset.id ? 'active' : '')} onClick={() => onSelect(preset.id)}>
        <div className="strategyTitle"><b>{t(preset.name)}</b><span>{t(RISK_LABELS[preset.risk] || preset.risk)}</span></div>
        <p>{t(preset.description)}</p>
        {preset.futuresNote && <small className="strategyNote">{t(STRATEGY_FUTURES_NOTE)}</small>}
        <strong>{t('Будуть застосовані налаштування')}</strong>
        <ul>{preset.bullets.map((bullet, index) => <li key={index}>{t(bullet)}</li>)}</ul>
      </button>)}</div>
    </Section>)}
  </div>;
}


/** Custom chart-context picker avoids Safari's bright native <select> popup.
 * A body portal keeps the menu visible outside the clipped settings sections. */
export function VisualContextPicker({ value, onChange }: {
  value: VisualContextId;
  onChange: (id: VisualContextId) => void;
}) {
  const language = useContext(ChartSettingsLanguageContext);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<{
    left: number; top: number; width: number; maxHeight: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusedOnOpen = useRef(false);
  const menuId = React.useId();
  const contexts = selectableVisualContexts();
  const chosen = contexts.find(context => context.id === visibleScaleContext(value)) ?? contexts[0];

  useEffect(() => {
    if (!open) {
      focusedOnOpen.current = false;
      return;
    }
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(Math.max(260, rect.width), Math.max(180, viewportWidth - 24));
      const left = Math.max(12, Math.min(rect.left, viewportWidth - width - 12));
      const below = viewportHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const useAbove = below < 260 && above > below;
      const maxHeight = Math.max(100, Math.min(410, useAbove ? above : below));
      const top = useAbove ? Math.max(8, rect.top - maxHeight - 8) : rect.bottom + 8;
      setPlacement(current =>
        current && current.left === left && current.top === top
          && current.width === width && current.maxHeight === maxHeight
          ? current : { left, top, width, maxHeight });
    };
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node
        && !triggerRef.current?.contains(event.target)
        && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      } else if (event.key === 'Tab') {
        setOpen(false);
      }
    };
    place();
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', place, { passive: true });
    window.addEventListener('scroll', place, true);
    window.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('keydown', keydown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !placement || focusedOnOpen.current) return;
    const selected = menuRef.current?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]');
    if (selected) {
      selected.focus({ preventScroll: true });
      focusedOnOpen.current = true;
    }
  }, [open, placement]);

  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const options = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    if (!options.length) return;
    event.preventDefault();
    const index = options.findIndex(option => option === document.activeElement);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? options.length - 1
      : event.key === 'ArrowDown' ? (index + 1) % options.length
      : (index + options.length - 1) % options.length;
    options[next].focus({ preventScroll: true });
  };

  return <div className="visualContextPicker">
    <button ref={triggerRef} type="button" className="visualContextTrigger"
      aria-label={translateHookChartPhrase(language, 'Тип графіка для візуальних налаштувань')}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(previous => !previous)}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setOpen(true);
        }
      }}>
      <span className="visualContextTriggerLabel">{translateHookChartPhrase(language, chosen.label)}</span>
      <span className={'visualContextChevron' + (open ? ' open' : '')} aria-hidden="true">⌄</span>
    </button>
    {open && placement && typeof document !== 'undefined' && createPortal(
      <div id={menuId} ref={menuRef} role="listbox"
        aria-label={translateHookChartPhrase(language, 'Оберіть тип графіка')}
        className="hookchart-visual-context-menu" data-hookchart-language={language} lang={language}
        style={{ left: placement.left, top: placement.top, width: placement.width, maxHeight: placement.maxHeight }}
        onKeyDown={moveFocus}>
        {contexts.map(context => {
          const active = context.id === visibleScaleContext(value);
          return <button type="button" key={context.id} role="option" aria-selected={active}
            className={'visualContextOption' + (active ? ' selected' : '')}
            onClick={() => {
              onChange(context.id);
              setOpen(false);
              triggerRef.current?.focus({ preventScroll: true });
            }}>
            <span className="visualContextCheck" aria-hidden="true">{active ? '✓' : ''}</span>
            <span className="visualContextOptionLabel">{translateHookChartPhrase(language, context.label)}</span>
          </button>;
        })}
      </div>, document.body,
    )}
  </div>;
}

/** Real HookChart preview uses the current chart's candles, with optional one-time sample in profile settings. */
function VisualProfileEditor({
  visualContext, visualDevice, selectedProfile, onContextChange, onDeviceChange,
  onProfileChange, onReset, onApplyToAll, onCapture,
  live, previewLongColor, previewShortColor, saveStatus,
}: {
  visualContext: VisualContextId;
  visualDevice: VisualDevice;
  selectedProfile: import('./visualProfiles').VisualChartProfile;
  onContextChange: (id: VisualContextId) => void;
  onDeviceChange: (device: VisualDevice) => void;
  onProfileChange: (delta: Partial<import('./visualProfiles').VisualChartProfile>) => void;
  onReset: () => void;
  onApplyToAll: () => void;
  onCapture?: () => void;
  live: boolean;
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  previewTimezone?: string;
  previewLongColor?: string;
  previewShortColor?: string;
  chartPreferences?: HookChartPreferences;
}) {
  const language = useContext(ChartSettingsLanguageContext);
  const t = (source: string) => translateHookChartPhrase(language, source);
  const [lastAction, setLastAction] = useState<'capture' | 'all' | 'reset' | null>(null);
  useEffect(() => { setLastAction(null); }, [visualContext, visualDevice]);
  const capture = () => { if (!onCapture) return; onCapture(); setLastAction('capture'); };
  const applyToAll = () => { onApplyToAll(); setLastAction('all'); };
  const reset = () => { onReset(); setLastAction('reset'); };

  return <div className="visualProfileEditor visualProfileCompact">
    <Section title="Компактний перегляд масштабу"
      help="Схема показує зміни налаштувань без звернень до бірж. У реальному HookChart масштаб залежить від розміру вікна. Типи графіків та налаштування телефона і комп'ютера зберігаються окремо.">
      <div className="visualProfileSelection">
        <Setting label="Тип графіка"
          help="Швидкий перегляд і Повний графік мають спільний масштаб для Скрінера та Формацій. Налаштування телефона й комп’ютера залишаються окремими.">
          <VisualContextPicker value={visualContext} onChange={onContextChange} />
        </Setting>
        <Choice label="Пристрій" help="Телефон і комп'ютер мають окремі профілі. Редагування одного не змінює вигляд іншого."
          values={['mobile', 'desktop']} labels={['Телефон', 'Комп’ютер']}
          value={visualDevice} set={value => onDeviceChange(value as VisualDevice)} />
      </div>
      <div className="visualProfilePreviewStage" aria-label={t('Попередній перегляд графіка')}>
        <HookChartVisualPreview
          longColor={previewLongColor}
          shortColor={previewShortColor}
          profile={selectedProfile}
        />
      </div>
      <div className="visualProfileControls" role="group" aria-label={t('Повзунки налаштування графіка')}>
        <Setting label="Кількість видимих свічок"
          help="Визначає бажану кількість свічок на ширину графіка. На маленькому екрані фактична кількість обмежується мінімальною шириною свічки.">
          <div className="flex items-center gap-2">
            <input aria-label={t('Кількість видимих свічок')} type="range" className="visualProfileRange" min="15" max="500" step="5"
              value={selectedProfile.visibleBars} onChange={event => onProfileChange({ visibleBars: Number(event.target.value) })}/>
            <b className="valueBadge">{selectedProfile.visibleBars}</b>
          </div>
        </Setting>
        <Setting label="Вертикальний зум"
          help="Збільшує або зменшує висоту свічок. 1× — природний масштаб. Діапазон 0,01×–100×, можна ввести число вручну. Зміна вимикає автоматичний масштаб ціни.">
          <div className="flex items-center gap-2">
            <input aria-label={t('Вертикальний зум')} type="range" className="visualProfileRange" min="-2" max="2" step="0.01"
              value={Math.log10(selectedProfile.verticalZoom)} onChange={event => onProfileChange({ verticalZoom: Number((10 ** Number(event.target.value)).toFixed(3)), autoPriceScale: false })}/>
            <Num ariaLabel="Точний вертикальний зум" value={selectedProfile.verticalZoom} min={VISUAL_ZOOM_MIN} max={VISUAL_ZOOM_MAX} step={0.01}
              set={value => onProfileChange({ verticalZoom: value, autoPriceScale: false })}/>
            <b className="valueBadge">×</b>
          </div>
        </Setting>
        <Setting label="Відступ праворуч"
          help="Вільний простір праворуч від останньої свічки (у барах). Значення відображається на схемі одразу. На реальному графіку відступ застосовується для вибраного профілю.">
          <div className="flex items-center gap-2">
            <input aria-label={t('Відступ праворуч у барах')} type="range" className="visualProfileRange" min="0" max={VISUAL_GAP_MAX} step="1"
              value={selectedProfile.rightGapBars} onChange={event => onProfileChange({ rightGapBars: Number(event.target.value) })}/>
            <Num ariaLabel="Точний відступ праворуч у барах" value={selectedProfile.rightGapBars} min={0} max={VISUAL_GAP_MAX} step={1}
              set={value => onProfileChange({ rightGapBars: Math.round(value) })}/>
            <b className="valueBadge">{t('барів')}</b>
          </div>
        </Setting>
        <SwitchRow label="Автоматичний масштаб ціни" rowClassName="visualProfileAutoScaleRow"
          help="HookChart підлаштовує діапазон цін під видимі свічки. Вимкніть для ручного вертикального зуму. У Терміналі глобальний автомасштаб свічок, якщо увімкнений, має пріоритет над цим перемикачем."
          value={selectedProfile.autoPriceScale} onChange={value => onProfileChange({ autoPriceScale: value })}/>
      </div>
      <div className="visualProfileActions" role="group" aria-label={t('Збереження та скидання вигляду графіка')}>
        <button type="button" className="visualProfileActionButton visualProfileActionPrimary"
          disabled={!onCapture} onClick={capture}
          title={t(!onCapture ? 'Доступно лише для відкритого графіка з вибраним типом і пристроєм. У профілі налаштування зберігаються автоматично.' : 'Зберегти масштаб і положення свічок із відкритого графіка')}>
          {t('Зберегти поточний вигляд графіка')}
        </button>
        <button type="button" className="visualProfileActionButton visualProfileActionSecondary"
          onClick={applyToAll} title={t('Застосувати цей профіль до всіх типів графіків вибраного пристрою')}>
          {t('Зробити типовими для всіх графіків')}
        </button>
        <button type="button" className="visualProfileActionButton visualProfileActionReset"
          onClick={reset} title={t('Повернути стандартні параметри тільки вибраного профілю')}>
          {t('Скинути цей профіль')}
        </button>
      </div>
      {lastAction && <div className="visualProfileActionStatus" role="status" aria-live="polite">
        {t(lastAction === 'capture' ? 'Поточний вигляд передано на збереження.' :
         lastAction === 'all' ? 'Профіль застосовано до всіх графіків цього пристрою.' :
         'Стандартні параметри вибраного профілю відновлено.')}
        {saveStatus === 'saving' ? t(' Зберігаємо…') :
         saveStatus === 'saved' ? t(' Збережено.') :
         saveStatus === 'error' ? t(' Помилка збереження: перевірте підключення.') : ''}
      </div>}
      {live && visualContext.startsWith('terminal') && <div className="visualProfileTransientHint">
        {t('Глобальний автомасштаб Термінала може мати пріоритет над вертикальним зумом.')}
      </div>}
    </Section>
  </div>;
}

export function OriginalHookChartSettings({
  open,
  prefs,
  language: selectedLanguage,
  densityCut = 0,
  loadedCandles = 0,
  historyStatus = 'idle',
  onRetryHistory,
  onChange,
  onApplyStrategy,
  onClose,
  embedded = false,
  activeVisualContext,
  currentViewport,
  currentPlotWidth,
  onCaptureVisual,
  onResetVisual,
  saveStatus,
  guidedTab,
  previewTimezone,
  previewLongColor,
  previewShortColor,
}: {
  open: boolean;
  prefs: HookChartPreferences;
  /** Language of this chart, which may differ from the site language. */
  language?: SupportedLanguage;
  densityCut?: number;
  /** Number of unique candles actually held by this chart for the current symbol/timeframe. */
  loadedCandles?: number;
  historyStatus?: 'idle' | 'loading' | 'limited' | 'error';
  onRetryHistory?: () => void;
  onChange: (delta: HookChartPreferences) => void;
  onApplyStrategy: (id: string) => void;
  onClose: () => void;
  /** Reuse the same settings form inside the user profile without a nested modal/focus trap. */
  embedded?: boolean;
  /** Context for the currently edited live chart; absent in profile editor. */
  activeVisualContext?: VisualContextId;
  currentViewport?: Viewport;
  currentPlotWidth?: number;
  onCaptureVisual?: (key: VisualProfileKey) => void;
  onResetVisual?: (key: VisualProfileKey) => void;
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  /** Active walkthrough changes the visible tab without touching account settings. */
  guidedTab?: 'main' | 'levels';
  /** Existing loaded HookChart candles; absent in standalone account editor. */
  previewCandles?: Candle[];
  previewSymbol?: string;
  previewTimeframe?: string;
  previewExchange?: ExchangeId;
  previewMarketType?: MarketType;
  previewTimezone?: string;
  previewLongColor?: string;
  previewShortColor?: string;
}) {
  const { language: siteLanguage } = useLanguage();
  const chartLanguage = selectedLanguage ?? resolveHookChartLanguage(prefs, siteLanguage);
  const candleCountLocale: Record<SupportedLanguage,string> = {uk:'uk-UA',en:'en-US',ru:'ru-RU',pl:'pl-PL'};
  const deviceDpr = typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1);
  const effectiveDpr = effectiveCanvasDpr(deviceDpr, prefs.maxCanvasDpr);
  const [tab, setTab] = useState<'main' | 'levels' | 'chart' | 'strategies' | 'hotkeys'>('main');
  useEffect(() => { if (guidedTab) setTab(guidedTab); }, [guidedTab]);
  const [visualContext, setVisualContext] = useState<VisualContextId>(() => visibleScaleContext(activeVisualContext));
  const [visualDevice, setVisualDevice] = useState<VisualDevice>(() =>
    typeof window === 'undefined' ? 'desktop' : visualDeviceForWidth(window.innerWidth));
  useEffect(() => {
    if (activeVisualContext) setVisualContext(visibleScaleContext(activeVisualContext));
  }, [activeVisualContext]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [headerHelpOpen, setHeaderHelpOpen] = useState(false);
  const headerHelpRef = useRef<HTMLSpanElement>(null);
  const headerHelpId = React.useId();
  useEffect(() => {
    if (!open || !embedded || !headerHelpOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerHelpRef.current?.contains(event.target)) {
        setHeaderHelpOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setHeaderHelpOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, embedded, headerHelpOpen]);
  useEffect(() => {
    if (!open || embedded) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Escape' || event.key === 'Tab') && document.querySelector('.hookchart-visual-context-menu')) return;
      if (event.key === 'Escape' && document.querySelector('.hookchartVisualHelpPopover')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter(element => element.getClientRects().length > 0);
        if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open, onClose, embedded]);
  if (!open) return null;

  const set = <K extends keyof HookChartPreferences>(key: K, value: HookChartPreferences[K]) => onChange({ [key]: value } as HookChartPreferences);
  const toggleArray = (key: 'levelIntervals' | 'trendIntervals', value: string, max?: number) => {
    const current = prefs[key] || [];
    const next = current.includes(value) ? current.filter(item => item !== value) : (max && current.length >= max ? current : [...current, value]);
    set(key, next);
  };

  return <ChartSettingsLanguageContext.Provider value={chartLanguage}><div data-hookchart-language={chartLanguage} lang={chartLanguage} className={embedded ? "originalSettingsBackdrop embeddedSettingsBackdrop" : "originalSettingsBackdrop"} onMouseDown={event => { if (!embedded && event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} tabIndex={embedded ? undefined : -1} className="originalSettingsPanel" role={embedded ? "region" : "dialog"} aria-modal={embedded ? undefined : true} aria-label={translateHookChartPhrase(chartLanguage, 'Налаштування hookchart')}>
      <div className="settingsHeader">
        <div><b>{translateHookChartPhrase(chartLanguage, embedded ? 'Налаштування' : 'Налаштування графіка')}</b>{!embedded && <small>{translateHookChartPhrase(chartLanguage, 'Параметри зберігаються автоматично')}</small>}</div>
        {embedded && <span ref={headerHelpRef} className="profileSettingsHelp">
          <button type="button" className="profileSettingsHelpButton"
            aria-label={translateHookChartPhrase(chartLanguage, 'Про налаштування графіка')}
            aria-expanded={headerHelpOpen}
            aria-controls={headerHelpId}
            title={translateHookChartPhrase(chartLanguage, 'Інформація про налаштування графіка')}
            onClick={() => setHeaderHelpOpen(value => !value)}>?</button>
          {headerHelpOpen && <span id={headerHelpId} role="tooltip" className="profileSettingsHelpPopover">
            {translateHookChartPhrase(chartLanguage, "Налаштування HookChart для Скрінера, Формацій і Термінала. Візуальні профілі телефона, комп’ютера й різних розмірів графіка зберігаються окремо. Усі налаштування зберігаються автоматично.")}
          </span>}
        </span>}
        {!embedded && <button type="button" onClick={onClose} aria-label={translateHookChartPhrase(chartLanguage, 'Закрити')}>×</button>}
      </div>
      <div className="settingsTabs">
        <button type="button" className={tab === 'main' ? 'active' : ''} onClick={() => setTab('main')}>{translateHookChartPhrase(chartLanguage, 'Основні')}</button>
        <button type="button" className={tab === 'levels' ? 'active' : ''} onClick={() => setTab('levels')}>{translateHookChartPhrase(chartLanguage, 'Рівні')}</button>
        <button type="button" className={tab === 'chart' ? 'active' : ''} onClick={() => setTab('chart')}>{translateHookChartPhrase(chartLanguage, 'Масштаб')}</button>
        <button type="button" className={tab === 'strategies' ? 'active' : ''} onClick={() => setTab('strategies')}>{translateHookChartPhrase(chartLanguage, 'Стратегії')}</button>
        <button type="button" className={tab === 'hotkeys' ? 'active' : ''} onClick={() => setTab('hotkeys')}>{HOOKCHART_HOTKEY_UI[chartLanguage].title}</button>
      </div>
      <div className="settingsBody uniformSettingsReadable">
        {tab === 'main' ? <MainSettingsHelpContext.Provider value={true}>
          <Section title="Застосунок">
            <Choice label="Мова" values={['uk', 'pl', 'ru', 'en']} labels={['Українська', 'Polski', 'Русский', 'English']} value={prefs.language} set={value => set('language', value)} />
            <SwitchRow label="Підказки" desc="Підказки в інтерфейсі під час наведення миші" value={prefs.tooltips !== false} onChange={value => set('tooltips', value)} />
          </Section>

          <Section title="Інтерфейс">
            <Setting label="Максимальна історія свічок" desc="Скільки свічок зберігати на графіку. Від 100 до 5000. Історія підвантажується частинами; на біржі може бути менше даних."><Num value={prefs.maxChartCandles ?? 1000} min={100} max={5000} step={100} set={value => set('maxChartCandles', Math.round(value))} /><b className="valueBadge">свічок</b></Setting>
            {!embedded && <div className="settingsHint" role="status" aria-live="polite" aria-atomic="true">
              {translateHookChartPhrase(chartLanguage, 'Завантажено:')} <strong>{Math.max(0, loadedCandles).toLocaleString(candleCountLocale[chartLanguage])} / {clampHookChartHistory(prefs.maxChartCandles ?? 1000).toLocaleString(candleCountLocale[chartLanguage])}</strong> {translateHookChartPhrase(chartLanguage, 'свічок')}
              {historyStatus === 'loading' && <span> {translateHookChartPhrase(chartLanguage, '· Підвантаження старіших свічок…')}</span>}
              {historyStatus === 'limited' && <>
                <span> {translateHookChartPhrase(chartLanguage, '· API не повернув старіших свічок.')}</span>
                {onRetryHistory && <button type="button" onClick={onRetryHistory} className="hotkeyResetOne">{translateHookChartPhrase(chartLanguage, 'Повторити')}</button>}
              </>}
              {historyStatus === 'error' && <>
                <span> {translateHookChartPhrase(chartLanguage, '· Не вдалося завантажити всю історію.')}</span>
                {onRetryHistory && <button type="button" onClick={onRetryHistory} className="hotkeyResetOne">{translateHookChartPhrase(chartLanguage, 'Повторити')}</button>}
              </>}
            </div>}
            <SwitchRow label="Панель інструментів на графіку" value={prefs.chartToolbar !== false} onChange={value => set('chartToolbar', value)} />
            <SwitchRow label="Іконки верхньої панелі над графіком" desc="Приховує всі додаткові іконки верхньої панелі. Вибір таймфрейму залишається видимим і робочим." value={prefs.showTopToolbarIcons !== false} onChange={value => set('showTopToolbarIcons', value)} />
            <SwitchRow label="Показувати суми великих ринкових заявок під свічками" value={prefs.showMarketPrintSums === true} onChange={value => set('showMarketPrintSums', value)} desc="Фактично виконані великі покупки та продажі" />
            <Setting label="Мінімальна сума великих угод під свічкою (USD)" desc="0 = усі суми великих угод. Поріг застосовується до BUY + SELL за одну свічку.">
              <Num value={prefs.marketPrintMinUsd ?? 0} min={0} max={1_000_000_000_000}
                disabled={prefs.showMarketPrintSums !== true}
                ariaLabel="Мінімальна сума великих угод під свічкою (USD)"
                set={value => set('marketPrintMinUsd', normalizeMarketPrintDisplayMinUsd(value))} />
            </Setting>
            <SwitchRow label="Стрілка до суми великих ринкових угод" desc="Окремо показує стрілку від свічки до суми BUY/SELL. Текст можна залишити без стрілки."
              value={prefs.showMarketPrintArrows !== false} onChange={value => set('showMarketPrintArrows', value)} />
            <Setting label="Розмір стрілки ринкових угод">
              <Num value={prefs.marketPrintArrowSize ?? 4} min={2} max={16} step={1} disabled={prefs.showMarketPrintSums !== true || prefs.showMarketPrintArrows === false}
                set={value => set('marketPrintArrowSize', Math.round(value))} /><b className="valueBadge">px</b>
            </Setting>
            <Setting label="Розмір тексту великих ринкових угод">
              <Num value={prefs.marketPrintFontSize ?? 10} min={8} max={22} step={1} disabled={prefs.showMarketPrintSums !== true}
                set={value => set('marketPrintFontSize', Math.round(value))} /><b className="valueBadge">px</b>
            </Setting>
            <SwitchRow label="Об’єми на графіку" value={prefs.showVolumes !== false} onChange={value => set('showVolumes', value)} />
            <SwitchRow label="Нижня інформаційна панель" value={prefs.showMarketStatsBar !== false} onChange={value => set('showMarketStatsBar', value)} />
            <SwitchRow label="Спільні фігури малювання" desc="Фігури однієї монети можуть використовуватися в усіх режимах і списках." value={prefs.sharedDrawings !== false} onChange={value => set('sharedDrawings', value)} />
          </Section>

          <Section title="Оптимізація">
            <Choice label="Максимальний DPR полотна"
              desc="Обмежує щільність пікселів Canvas: менше навантаження, але тонкі елементи можуть бути менш чіткими."
              values={[1, 1.5, 2, 3, 4]} labels={['1×', '1.5×', '2×', '3×', '4×']}
              value={prefs.maxCanvasDpr ?? DEFAULT_MAX_CANVAS_DPR}
              set={value => set('maxCanvasDpr', normalizeMaxCanvasDpr(value))} />
            <div className="settingsHint" role="status">
              {translateHookChartPhrase(chartLanguage, 'DPR екрана:')} <strong>{Number(deviceDpr.toFixed(2))}</strong>
              {' · '}{translateHookChartPhrase(chartLanguage, 'Фактичний DPR полотна:')} <strong>{Number(effectiveDpr.toFixed(2))}</strong>
            </div>
          </Section>

          <Section title="Автоматична розмітка">
            <SwitchRow
              label="Режим Скальпера"
              desc="Автоматично показує на живому графіку підтверджені дотиками діапазони, трикутники, клини, похилі лінії та подвійні вершини/дна. Можливий пробій не є підтвердженим до закриття свічки. Аналіз виконується лише в браузері без нових біржових запитів."
              value={prefs.scalperMode === true}
              onChange={value => set('scalperMode', value)}
            />
            <SwitchRow
              label="Усереднена регресійна лінія"
              desc="Альтернативна побудова, як у попередній версії: лінія усереднює підтверджені High/Low методом лінійної регресії. Вона може проходити між кінчиками тіней і через тіла свічок. Якщо вимкнено (за замовчуванням), лінії проходять через фактичні High/Low тіней. Змінює тільки алгоритм розмітки, не біржові дані."
              value={prefs.scalperRegressionMode === true}
              onChange={value => set('scalperRegressionMode', value)}
            />
            <SwitchRow
              label="Показувати підписи Режиму Скальпера"
              desc="Якщо вимкнено, приховує лише назви фігур та статуси біля автоматично намальованих ліній. Лінії, дотики тіней і позначки пробою залишаються видимими."
              value={prefs.showScalperLabels !== false}
              onChange={value => set('showScalperLabels', value)}
            />
            <Setting label="Товщина трендової лінії (Скальпер)"
              desc="Змінює лише автоматично знайдені трендові лінії Режиму Скальпера. Не впливає на ручні малюнки, трикутники чи інші фігури.">
              <Num value={prefs.scalperTrendLineWidth ?? 0.9} min={0.2} max={5} step={0.1} set={value => set('scalperTrendLineWidth', value)} /><b className="valueBadge">px</b>
            </Setting>
          </Section>

          <Section title="Ліквідації">
            <SwitchRow label="Ліквідації на графіку" value={prefs.showLiquidations !== false} onChange={value => set('showLiquidations', value)} desc="Примусове закриття позицій через недостатню маржу" />
            <SwitchRow label="Показувати суми Liq під свічками" desc="Показує загальну суму ліквідацій під свічкою. Стрілка та деталізація L/S налаштовуються окремо."
              value={prefs.showLiquidationCandleSums !== false} onChange={value => set('showLiquidationCandleSums', value)} />
            <SwitchRow label="Показувати L/S під сумою Liq" desc="Приховує лише нижній рядок L/S, але залишає загальну суму та стрілку."
              value={prefs.showLiquidationDetailSums !== false} onChange={value => set('showLiquidationDetailSums', value)} />
            <SwitchRow label="Показувати стрілки ліквідацій" desc="Вмикає або вимикає стрілки біля свічок незалежно від написів Liq."
              value={prefs.showLiquidationArrows !== false} onChange={value => set('showLiquidationArrows', value)} />
            <Setting label="Розмір стрілки Liq">
              <Num value={prefs.liquidationArrowSize ?? 5} min={2} max={16} step={1} disabled={prefs.showLiquidations === false || prefs.showLiquidationArrows === false}
                set={value => set('liquidationArrowSize', Math.round(value))} /><b className="valueBadge">px</b>
            </Setting>
            <Setting label="Розмір загальної суми Liq">
              <Num value={prefs.liquidationSumFontSize ?? 10} min={8} max={22} step={1} disabled={prefs.showLiquidations === false || prefs.showLiquidationCandleSums === false}
                set={value => set('liquidationSumFontSize', Math.round(value))} /><b className="valueBadge">px</b>
            </Setting>
            <Setting label="Розмір тексту L/S під сумою">
              <Num value={prefs.liquidationDetailFontSize ?? 9} min={8} max={22} step={1}
                disabled={prefs.showLiquidations === false || prefs.showLiquidationCandleSums === false || prefs.showLiquidationDetailSums === false}
                set={value => set('liquidationDetailFontSize', Math.round(value))} /><b className="valueBadge">px</b>
            </Setting>
            <SwitchRow
              label="Прогнозні зони Liq · модель за історією"
              desc="Додаткові горизонтальні теплові смуги на основі повторних історичних ліквідацій за тією самою ціною. Це не відомості про відкриті позиції, не підтверджені майбутні ліквідації і не ймовірність у відсотках. Працює лише коли вручну ввімкнено «Карту Liq» на ф'ючерсному графіку."
              value={prefs.showModeledLiquidationZones === true}
              onChange={value => set('showModeledLiquidationZones', value)}
            />
            <SwitchRow label="Блок Liq + каскад" value={prefs.showLiqRiskBlock !== false} onChange={value => set('showLiqRiskBlock', value)} />
            <div className="settingsHint">Liq: сума всіх унікальних отриманих ліквідацій за поточну сесію, незалежно від порогів і перемикачів.</div>
            <SwitchRow label="Long (L)" help="Long: примусово закриті довгі позиції. Вимкнення приховує їх на графіку, але не змінює загальну суму Liq." value={prefs.showLiquidationLong !== false} onChange={value => set('showLiquidationLong', value)} />
            <Setting label="Мінімальна сума Long (USD)" desc="Порожнє поле = автоматичний поріг. 0 = усі ліквідації Long.">
              <LiquidationMinimum value={prefs.liquidationLongMinUsd} disabled={prefs.showLiquidationLong === false} onChange={value => set('liquidationLongMinUsd', value)} />
            </Setting>
            <SwitchRow label="Short (S)" help="Short: примусово закриті короткі позиції. Вимкнення приховує їх на графіку, але не змінює загальну суму Liq." value={prefs.showLiquidationShort !== false} onChange={value => set('showLiquidationShort', value)} />
            <Setting label="Мінімальна сума Short (USD)" desc="Порожнє поле = автоматичний поріг. 0 = усі ліквідації Short.">
              <LiquidationMinimum value={prefs.liquidationShortMinUsd} disabled={prefs.showLiquidationShort === false} onChange={value => set('liquidationShortMinUsd', value)} />
            </Setting>
          </Section>

          <Section title="Інструменти малювання">
            <Setting label="Товщина горизонтальної лінії" desc="Тільки горизонтальна лінія, намальована вручну. Не змінює автоматичні рівні, курсор чи сітку.">
              <Num value={prefs.horizontalDrawingLineWidth ?? 0.4} min={0.2} max={5} step={0.1} set={value => set('horizontalDrawingLineWidth', value)} /><b className="valueBadge">px</b>
            </Setting>
            <Setting label="Товщина лінії тренду" desc="Тільки лінія тренду, намальована вручну. Не змінює курсор, сітку чи автоматичні рівні.">
              <Num value={prefs.trendDrawingLineWidth ?? 0.4} min={0.2} max={5} step={0.1} set={value => set('trendDrawingLineWidth', value)} /><b className="valueBadge">px</b>
            </Setting>
          </Section>

          <Section title="Перехрестя">
            <Choice label="Товщина ліній" desc="Горизонтальна та вертикальна лінії курсора." values={[.5, .75, 1, 1.5, 2]} labels={['0.5 px', '0.75 px', '1 px', '1.5 px', '2 px']} value={prefs.crosshairLineWidth ?? DEFAULT_CROSSHAIR_LINE_WIDTH} set={value => set('crosshairLineWidth', value)} />
          </Section>

          <Section title="Сітка графіка">
            <SwitchRow label="Горизонтальні лінії" value={!!prefs.gridHorizontal} onChange={value => set('gridHorizontal', value)} />
            <SwitchRow label="Вертикальні лінії" desc="Увімкніть обидва перемикачі, щоб показати повну сітку." value={!!prefs.gridVertical} onChange={value => set('gridVertical', value)} />
          </Section>

          <Section title="Оформлення графіка">
            <Setting label="Палітра графіка" desc="Готові контрастні темні палітри в стилі професійних trading-терміналів."><div className="settingsChips">
              <button type="button" onClick={() => onChange({ candleLongColor: '#0ECB81', candleShortColor: '#F6465D', densityLineColor: '#7B61FF', densityLabelColor: '#C4B5FD' })}>h00k Classic</button>
              <button type="button" onClick={() => onChange({ candleLongColor: '#26A69A', candleShortColor: '#EF5350', densityLineColor: '#8E7DBE', densityLabelColor: '#D8C7FF' })}>Pastel Pro</button>
              <button type="button" onClick={() => onChange({ candleLongColor: '#00C076', candleShortColor: '#FF3B4F', densityLineColor: '#5B8DEF', densityLabelColor: '#9CC7FF' })}>Ocean</button>
            </div></Setting>
            <Setting label="Свічка Long"><input className="colorInput" type="color" value={prefs.candleLongColor || '#0ECB81'} onChange={event => set('candleLongColor', event.target.value)} /></Setting>
            <Setting label="Свічка Short"><input className="colorInput" type="color" value={prefs.candleShortColor || '#F6465D'} onChange={event => set('candleShortColor', event.target.value)} /></Setting>
          </Section>

          <Section title="Скоринг">
            <SwitchRow label="Сценарна оцінка монет" value={!!prefs.scoring} onChange={value => set('scoring', value)} />
          </Section>

          <Section title="Тренди">
            <MultiChoice label="Інтервали трендів" values={['15m', '1h', '4h', '1d']} selected={prefs.trendIntervals || []} toggle={value => toggleArray('trendIntervals', value, 3)} max={3} />
            <Setting label="Глибина історії для визначення похилих ліній"><Num value={prefs.trendHistory ?? 300} min={80} max={1500} set={value => set('trendHistory', value)} /></Setting>
          </Section>

          <Section title="Щільності">
            <SwitchRow label="Аналіз великих лімітних заявок (щільностей)" value={prefs.densityAnalysis !== false} onChange={value => set('densityAnalysis', value)} />
            <SwitchRow label="Показувати дисбаланс" desc="Сума лімітних ордерів у межах вибраної різниці від ціни для кожної сторони." value={!!prefs.densityImbalance} onChange={value => set('densityImbalance', value)} />
            <Setting label="Щільності на графіку" desc="Незалежно керуйте лініями, мітками та відображенням суми всередині мітки."><div className="densityVisibilityRow">
              {([['showDensityLines', 'Лінії'], ['showDensityLabels', 'Мітки'], ['showDensityAmounts', 'Суми']] as const).map(([key, label]) => <label key={key}><span>{label}</span><input type="checkbox" checked={!!prefs[key]} onChange={event => set(key, event.target.checked)} /></label>)}
            </div></Setting>
            <Setting label="Колір ліній щільностей"><input className="colorInput" type="color" value={prefs.densityLineColor || '#7B61FF'} onChange={event => set('densityLineColor', event.target.value)} /></Setting>
            <Setting label="Колір міток щільностей"><input className="colorInput" type="color" value={prefs.densityLabelColor || '#C4B5FD'} onChange={event => set('densityLabelColor', event.target.value)} /></Setting>
            <Setting label="Товщина лінії"><Num value={prefs.densityLineWidth ?? 0.5} min={0.1} max={5} step={0.1} set={value => set('densityLineWidth', value)} /><b className="valueBadge">px</b></Setting>
            <Choice label="Вигляд лінії" values={['solid', 'dash', 'dot']} labels={['Суцільна', 'Пунктир', 'Крапки']} value={prefs.densityLineStyle} set={value => set('densityLineStyle', value)} />
            <Setting label="Розмір мітки"><Num value={prefs.densityLabelSize ?? 8} min={8} max={20} set={value => set('densityLabelSize', value)} /><b className="valueBadge">px</b></Setting>
            <Setting label="Таймаут великих лімітних ордерів" desc="Мінімальний вік перед показом на графіку."><Num value={prefs.densityTimeoutMin ?? 0} min={0} max={120} set={value => set('densityTimeoutMin', value)} /><b className="valueBadge">хв</b></Setting>
            <Setting label="Дистанція від ціни" desc="Максимальна різниця між ціною ордера та поточною ціною."><Num value={normalizeDensityDistance(prefs.densityDiffPct)} min={0.1} max={20} step={0.1} set={value => set('densityDiffPct', normalizeDensityDistance(value))} /><b className="valueBadge">%</b></Setting>
            <Setting label="Пороговий об’єм великих ордерів"><div className="densityModeRow">
              <button type="button" className={prefs.densityMode === 'auto' ? 'sel' : ''} onClick={() => onChange({ densityMode: 'auto', densityAnalysis: true, showDensityLines: true, showDensityLabels: true, showDensityAmounts: true })}>Авто</button>
              <button type="button" className={prefs.densityMode === 'manual' ? 'sel' : ''} onClick={() => onChange({
                densityMode: 'manual', densityThreshold: prefs.densityMode === 'manual' && (prefs.densityThreshold || 0) > 0
                  ? prefs.densityThreshold : Math.max(1, Math.ceil(densityCut || prefs.densityThreshold || 50_000)),
              })}>Значення</button>
              <span>$</span><Num value={prefs.densityMode === 'manual' ? prefs.densityThreshold ?? 0 : densityCut} min={0} step={1} disabled={prefs.densityMode !== 'manual'} set={value => set('densityThreshold', value)} />
            </div></Setting>
            <Setting label="Що показувати в AUTO" desc="Усі сильні — аномально великі заявки. Потенціал реакції — тільки щільності з контактом ціни та свіжими виконаними угодами або поповненням заявки. Це не гарантія відскоку.">
              <div className="settingsChips">
                {([['all', 'Усі сильні'], ['potential', 'Потенціал реакції']] as const).map(([value, label]) =>
                  <button type="button" key={value} aria-pressed={(prefs.densityAutoDisplay || 'potential') === value}
                    className={(prefs.densityAutoDisplay || 'potential') === value ? 'sel' : ''}
                    onClick={() => set('densityAutoDisplay', value)}>{label}</button>)}
              </div>
            </Setting>
            <Setting label="Множник порогу AUTO" desc="Автоматично для вибраної монети: 4× типова заявка, ≥25% локальної ліквідності та ≥50% зустрічного потоку за 5 хвилин. Множник змінює базовий поріг; без угод розрахунок використовує стакан."><Num value={prefs.densityAutoMultiplier ?? 1} min={0.1} max={10} step={0.1} set={value => set('densityAutoMultiplier', value)} /><b className="valueBadge">×</b></Setting>
            <SwitchRow label="Показувати великі ордери лише поруч із рівнями" desc="Впливає на список; на графіку та у стакані показуються всі знайдені щільності." value={!!prefs.densityNearLevelsOnly} onChange={value => set('densityNearLevelsOnly', value)} />
          </Section>

          <Section title="Відкритий інтерес (колонка OI)">
            <SwitchRow label="Показувати колонку OI" value={prefs.oiColumn !== false} onChange={value => set('oiColumn', value)} />
            <Choice label="Показувати як" values={['value', 'change']} labels={['Значення', 'Зміна']} value={prefs.oiDisplay || 'value'} set={value => set('oiDisplay', value)} />
            <Choice label="Період для порівняння" values={['1h', '12h', '24h']} value={prefs.oiPeriod || '24h'} set={value => set('oiPeriod', value)} />
          </Section>

          <Section title="Funding (колонка F)">
            <SwitchRow label="Показувати колонку Funding" value={prefs.fundingColumn !== false} onChange={value => set('fundingColumn', value)} />
          </Section>

          <Section title="Зміни за 24 години">
            <SwitchRow label="Зміна ціни у відсотках" value={prefs.change24 !== false} onChange={value => set('change24', value)} />
            <SwitchRow label="Об’єм у монеті котирування" value={prefs.volume24 !== false} onChange={value => set('volume24', value)} />
          </Section>

          <Section title="NATR — нормалізований середній істинний діапазон">
            <Choice label="Таймфрейм" values={['', '5m', '15m', '1h', '4h', '1d']} labels={['Вимк.', '5m', '15m', '1h', '4h', '1d']} value={prefs.natrTf || ''} set={value => set('natrTf', value)} />
            <Setting label="Період"><Num value={prefs.natrPeriod ?? 14} min={2} max={500} set={value => set('natrPeriod', value)} /></Setting>
          </Section>

          <Section title="Відносний об’єм (колонка VR)">
            <Choice label="Інтервал" values={['', '5m', '15m', '1h', '4h', '1d']} labels={['Вимк.', '5m', '15m', '1h', '4h', '1d']} value={prefs.vrTf || ''} set={value => set('vrTf', value)} />
            <Setting label="Кількість свічок"><Num value={prefs.vrCandles ?? 500} min={1} max={1500} set={value => set('vrCandles', value)} /></Setting>
          </Section>

          <Section title="Зміна ціни">
            <Choice label="Інтервал PΔ" values={['', '5m', '15m', '1h', '4h', '1d']} labels={['Вимк.', '5m', '15m', '1h', '4h', '1d']} value={prefs.pDeltaTf || ''} set={value => set('pDeltaTf', value)} />
            <Choice label="Інтервал Pavg" values={['', '5m', '15m', '1h', '4h', '1d']} labels={['Вимк.', '5m', '15m', '1h', '4h', '1d']} value={prefs.pAvgTf || ''} set={value => set('pAvgTf', value)} />
            <Setting label="Кількість свічок Pavg"><Num value={prefs.pAvgCandles ?? 500} min={2} max={1500} set={value => set('pAvgCandles', value)} /></Setting>
          </Section>

          <Section title="Кількість угод (лише Binance)">
            <Choice label="Вікно" values={['1m', '5m', '15m', '1h']} value={prefs.tradesWindow || '15m'} set={value => set('tradesWindow', value)} />
            <SwitchRow label="Кількість угод за вікно (колонка TA)" value={prefs.tradesTA !== false} onChange={value => set('tradesTA', value)} />
            <SwitchRow label="Різниця із середньою кількістю угод (колонка TR)" value={prefs.tradesTR !== false} onChange={value => set('tradesTR', value)} />
            <Setting label="Кількість свічок"><Num value={prefs.tradesCandles ?? 100} min={2} max={1500} set={value => set('tradesCandles', value)} /></Setting>
          </Section>
        </MainSettingsHelpContext.Provider> : tab === 'levels' ? <MainSettingsHelpContext.Provider value={true}>
          <Section title="Круглі числа (колонка RN)">
            <Choice label="Ступінь округлення" values={[1, 2, 3]} value={prefs.roundness ?? 2} set={value => set('roundness', value)} />
            <SwitchRow label="Показувати сітку круглих чисел на графіку" desc="Тонкі ненав’язливі лінії круглих цін." value={!!prefs.roundGrid} onChange={value => set('roundGrid', value)} />
          </Section>

          <Section title="Підтримка та опір">
            <SwitchRow label="Показувати підтримку та опір" desc="S — підтримка нижче ціни, R — опір вище ціни. Рівні з підтвердженим пробоєм приховуються." value={!!prefs.autoSR} onChange={value => onChange({ autoSR: value, overlays: value ? Array.from(new Set([...(prefs.overlays || []), 'sr'])) : (prefs.overlays || []).filter(id => id !== 'sr') })} />
            <SwitchRow label="Показувати мітки S/R" desc="Вмикає або вимикає підписи підтримки й опору; лінії керуються перемикачем вище." value={prefs.showSRLabels !== false} onChange={value => set('showSRLabels', value)} />
          </Section>

          <Section title="Автоматичні рівні">
            <MultiChoice label="Таймфрейми автовизначення рівнів" desc="Можна вибрати всі шість таймфреймів (5m, 15m, 30m, 1h, 4h, 1d). За замовчуванням: 1h, 4h і 1d. Зніміть усі, щоб вимкнути автовизначення." values={['5m', '15m', '30m', '1h', '4h', '1d']} selected={prefs.levelIntervals || []} toggle={value => toggleArray('levelIntervals', value)} />
            <Setting label="Колір міток рівнів" desc="Колір активних рівнів та їхніх підписів. Пробиті рівні залишаються сірими."><input className="colorInput" aria-label="Колір міток рівнів" type="color" value={prefs.levelLabelColor || '#2090F0'} onChange={event => set('levelLabelColor', event.target.value)} /></Setting>
            <Setting label="Розмір міток рівнів"><Num value={prefs.levelLineWidth ?? 0.3} min={0.2} max={5} step={0.1} set={value => set('levelLineWidth', value)} /><b className="valueBadge">px</b></Setting>
            <Setting label="Розмір тексту міток рівнів"><Num value={prefs.levelLabelSize ?? 9} min={8} max={24} step={1} set={value => set('levelLabelSize', value)} /><b className="valueBadge">px</b></Setting>
            <Choice label="Тип міток рівнів" values={['text', 'filled', 'outline']} labels={['Текст', 'Із заливкою', 'Із рамкою']} value={prefs.levelLabelStyle || 'text'} set={value => set('levelLabelStyle', value)} />
            <Choice label="Тип ліній рівнів" values={['solid', 'dash', 'dot']} labels={['Суцільна', 'Пунктир', 'Крапки']} value={prefs.levelLineStyle || 'solid'} set={value => set('levelLineStyle', value)} />
            <Setting label="Кількість свічок для визначення рівня"><Num value={prefs.levelCandleCount ?? 15} min={5} max={60} set={value => set('levelCandleCount', value)} /></Setting>
            <Setting label="Глибина історії для визначення рівнів" desc="Кількість свічок для кожного інтервалу"><Num value={prefs.levelHistory ?? 500} min={80} max={1500} set={value => set('levelHistory', value)} /></Setting>
            <Setting label="Підтвердження рівнів" desc="Скільки незалежних підходів потрібно"><Num value={prefs.levelCount ?? 3} min={2} max={10} set={value => set('levelCount', value)} /></Setting>
            <Setting label="Допустима різниця"><Num value={prefs.levelDiff ?? 0.18} min={0.01} max={3} step={0.01} set={value => set('levelDiff', value)} /><b className="valueBadge">%</b></Setting>
            <Setting label="Пробій"><Num value={prefs.levelBreak ?? 0.35} min={0} max={5} step={0.05} set={value => set('levelBreak', value)} /><b className="valueBadge">%</b></Setting>
            <Choice label="Підписи рівнів" values={['always', 'hover', 'off']} labels={['Завжди', 'При наведенні', 'Вимкнені']} value={prefs.levelLabelMode || 'always'} set={value => set('levelLabelMode', value)} />
            <SwitchRow label="Показувати пробиті рівні" desc="Сірі лінії рівнів, які вже були підтверджено пробиті." value={prefs.showBrokenLevels !== false} onChange={value => set('showBrokenLevels', value)} />
            <SwitchRow label="Дозволити «прокол» рівня" desc="Перетин тінню не ламає рівень до підтвердження закриттям." value={prefs.allowWick !== false} onChange={value => set('allowWick', value)} />
          </Section>

        </MainSettingsHelpContext.Provider> : tab === 'chart' ? (
          <VisualProfileEditor
            visualContext={visualContext}
            visualDevice={visualDevice}
            selectedProfile={getVisualProfile(prefs, visualContext, visualDevice)}
            onContextChange={setVisualContext}
            onDeviceChange={setVisualDevice}
            onProfileChange={delta => set('visualProfiles', patchVisualProfile(prefs.visualProfiles, makeVisualProfileKey(visualContext, visualDevice), delta))}
            onReset={() => {
              const key = makeVisualProfileKey(visualContext, visualDevice);
              set('visualProfiles', patchVisualProfile(prefs.visualProfiles, key, null));
              onResetVisual?.(key);
            }}
            onApplyToAll={() => {
              const selected = getVisualProfile(prefs, visualContext, visualDevice);
              const profiles = applyVisualDefaultsForDevice(prefs.visualProfiles, visualDevice, selected);
              set('visualProfiles', profiles);
            }}
            onCapture={onCaptureVisual && activeVisualContext && !activeVisualContext.startsWith('terminal') && visibleScaleContext(activeVisualContext) === visualContext && visualDevice === (typeof window === 'undefined' ? 'desktop' : visualDeviceForWidth(window.innerWidth)) && currentViewport && (currentPlotWidth || 0) > 100
              ? () => onCaptureVisual(makeVisualProfileKey(visualContext, visualDevice)) : undefined}
            live={!!currentViewport}
            saveStatus={saveStatus}
            previewTimezone={previewTimezone}
            previewLongColor={previewLongColor}
            previewShortColor={previewShortColor}
            chartPreferences={prefs}
          />
        ) : tab === 'strategies' ? (
          <StrategySettings activeId={prefs.strategyId || ''} onSelect={onApplyStrategy} />
        ) : (
          <HotkeySettings
            language={chartLanguage}
            hotkeys={{ ...DEFAULT_HOOKCHART_HOTKEYS, ...(prefs.hotkeys || {}) } as HookChartHotkeys}
            setHotkeys={value => set('hotkeys', value)}
          />
        )}
      </div>
    </div>
  </div></ChartSettingsLanguageContext.Provider>;
}
