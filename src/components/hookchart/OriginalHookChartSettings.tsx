import React, { useEffect, useRef, useState } from 'react';
import type { HookChartPreferences } from '../../types';
import { STRATEGY_FUTURES_NOTE, STRATEGY_PRESETS } from './strategyEngine';

export type HookChartHotkeyAction =
  | 'cancel' | 'copyTicker' | 'openWindow' | 'openMetaScalp' | 'deleteCoin' | 'toggleFavorites'
  | 'prevCoin' | 'nextCoin' | 'prevChart' | 'nextChart' | 'prevTf' | 'nextTf' | 'prevTfAll' | 'nextTfAll'
  | 'zoomIn' | 'zoomOut' | 'tempRuler' | 'erase' | 'signalLevel' | 'clearAlerts' | 'ray' | 'level' | 'fib' | 'trend';

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
};

export const ORIGINAL_HOOKCHART_DEFAULTS: HookChartPreferences = {
  language: 'uk',
  timezone: 'Europe/Warsaw',
  tooltips: true,
  notificationOpenNew: false,
  rightPadding: 10,
  rightPaddingEnabled: true,
  rightPaddingVersion: 2,
  chartToolbar: true,
  showTopToolbarIcons: true,
  notificationDialog: true,
  singleWindowSize: 85,
  pagingButtons: true,
  sharedDrawings: true,
  duplicateCrosshair: false,
  showMarketPrintSums: false,
  showVolumes: true,
  showMarketStatsBar: true,
  showLiquidations: true,
  showLiqRiskBlock: true,
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
  sortEnabled: ['V24', 'P24', 'Price'],
  sortDisabled: ['Ticker', 'OI', 'Funding'],
  analyzedIntervals: ['5m', '15m', '1h', '4h'],
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
  levelLabelSize: 11,
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
  indicators: [],
  strategyId: '',
  hotkeys: DEFAULT_HOOKCHART_HOTKEYS,
};

export function normalizeOriginalHookChartPreferences(source?: HookChartPreferences): HookChartPreferences {
  const next: HookChartPreferences = { ...ORIGINAL_HOOKCHART_DEFAULTS, ...(source || {}) };
  // Legacy values were pixels; only version 2 stores a candle count.
  next.rightPadding = source?.rightPaddingVersion === 2 && Number.isFinite(source.rightPadding)
    ? Math.max(0, Math.min(500, Math.round(source.rightPadding!))) : 10;
  next.rightPaddingEnabled = source?.rightPaddingEnabled !== false;
  next.rightPaddingVersion = 2;
  next.levelIntervals = Array.isArray(source?.levelIntervals)
    ? [...new Set(source.levelIntervals.filter(tf => ['5m', '15m', '1h', '4h', '1d'].includes(tf)))]
    : ['1h', '4h', '1d'];
  next.levelLabelColor = /^#[0-9a-f]{6}$/i.test(source?.levelLabelColor || '') ? source!.levelLabelColor : '#2090F0';
  next.levelLabelSize = Number.isFinite(source?.levelLabelSize) ? Math.max(0.2, Math.min(20, source!.levelLabelSize!)) : 11;
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
function hotkeyDisplay(spec: string): string {
  if (!spec) return 'Не призначено';
  const labels: Record<string, string> = {
    Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Meta', Escape: 'Esc', Delete: 'Del',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Tab: 'Tab',
    Equal: '=', Minus: '−', NumpadAdd: 'Num +', NumpadSubtract: 'Num −',
  };
  return spec.split('|').map(candidate => candidate.split('+').map(key => labels[key] || (key.startsWith('Key') ? key.slice(3) : key.startsWith('Digit') ? key.slice(5) : key)).join(' + ')).join(' / ');
}

const HOTKEY_GROUPS: Array<{ title: string; rows: Array<{ id: HookChartHotkeyAction; label: string }> }> = [
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="settingsSection"><h3>{title}</h3>{children}</section>;
}
function Setting({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return <div className="settingRow"><div className="settingText"><b>{label}</b>{desc && <small>{desc}</small>}</div><div className="settingControl">{children}</div></div>;
}
function SwitchRow({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (value: boolean) => void }) {
  return <Setting label={label} desc={desc}><label className="settingsSwitch"><input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} /><span /></label></Setting>;
}
function Num({ value, set, min, max, step = 1, disabled = false }: { value: number; set: (value: number) => void; min?: number; max?: number; step?: number; disabled?: boolean }) {
  return <input className="numInput" type="number" value={value} min={min} max={max} step={step} disabled={disabled} onChange={event => {
    let next = Number(event.target.value);
    if (!Number.isFinite(next)) return;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    set(next);
  }} />;
}
function Choice({ label, desc, values, labels, value, set }: { label: string; desc?: string; values: Array<string | number>; labels?: string[]; value: unknown; set: (value: any) => void }) {
  return <Setting label={label} desc={desc}><div className="settingsChips">{values.map((entry, index) => <button type="button" key={String(entry)} value={String(entry)} aria-pressed={value === entry} className={value === entry ? 'sel' : ''} onClick={() => set(entry)}>{labels?.[index] ?? String(entry)}</button>)}</div></Setting>;
}
function MultiChoice({ label, desc, values, selected, toggle, max }: { label: string; desc?: string; values: string[]; selected: string[]; toggle: (value: string) => void; max?: number }) {
  return <Setting label={label} desc={desc}><div className="settingsChips">{values.map(entry => <button type="button" key={entry} aria-pressed={selected.includes(entry)} className={selected.includes(entry) ? 'sel' : ''} disabled={!selected.includes(entry) && max !== undefined && selected.length >= max} onClick={() => toggle(entry)}>{entry}</button>)}</div></Setting>;
}

function HotkeySettings({ hotkeys, setHotkeys }: { hotkeys: HookChartHotkeys; setHotkeys: (value: HookChartHotkeys) => void }) {
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

  return <div className="hotkeySettings">
    <div className="settingsHint">Натисніть на комбінацію та введіть нову. Esc скасовує введення, Backspace або Delete очищає комбінацію.</div>
    <button type="button" className="resetHotkeys" onClick={() => setHotkeys(DEFAULT_HOOKCHART_HOTKEYS)}>Скинути</button>
    {HOTKEY_GROUPS.map(group => <Section title={group.title} key={group.title}>{group.rows.map(row => <div className="hotkeyRow" key={row.id}>
      <span>{row.label}</span>
      <button type="button" className={editing === row.id ? 'recording' : ''} onClick={() => setEditing(row.id)}>{editing === row.id ? 'Натисніть клавіші…' : hotkeyDisplay(hotkeys[row.id])}</button>
      <button type="button" className="hotkeyClear" title="Очистити" onClick={() => setHotkeys({ ...hotkeys, [row.id]: '' })}>×</button>
      <button type="button" className="hotkeyResetOne" title="Скинути" onClick={() => setHotkeys({ ...hotkeys, [row.id]: DEFAULT_HOOKCHART_HOTKEYS[row.id] })}>↺</button>
    </div>)}</Section>)}
  </div>;
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
  const groups = Array.from(new Set(STRATEGY_PRESETS.map(preset => preset.config.kind)));
  return <div className="strategySettings">
    <div className="settingsHint">Вибір пресета одразу застосовує його параметри та запускає автоматичний аналіз/розмітку графіка.</div>
    <button type="button" className={activeId ? 'strategyOff' : 'strategyOff active'} onClick={() => onSelect('')}>Вимкнути</button>
    {groups.map(group => <Section title={STRATEGY_GROUP_NAMES[group] || group} key={group}>
      <div className="strategyGrid">{STRATEGY_PRESETS.filter(preset => preset.config.kind === group).map(preset => <button type="button" key={preset.id} className={'strategyCard ' + (activeId === preset.id ? 'active' : '')} onClick={() => onSelect(preset.id)}>
        <div className="strategyTitle"><b>{preset.name}</b><span>{RISK_LABELS[preset.risk] || preset.risk}</span></div>
        <p>{preset.description}</p>
        {preset.futuresNote && <small className="strategyNote">{STRATEGY_FUTURES_NOTE}</small>}
        <strong>Будуть застосовані налаштування</strong>
        <ul>{preset.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>
      </button>)}</div>
    </Section>)}
  </div>;
}

export function OriginalHookChartSettings({
  open,
  prefs,
  onChange,
  onApplyStrategy,
  onClose,
}: {
  open: boolean;
  prefs: HookChartPreferences;
  onChange: (delta: HookChartPreferences) => void;
  onApplyStrategy: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'main' | 'strategies' | 'hotkeys'>('main');
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
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
  }, [open, onClose]);
  if (!open) return null;

  const set = <K extends keyof HookChartPreferences>(key: K, value: HookChartPreferences[K]) => onChange({ [key]: value } as HookChartPreferences);
  const toggleArray = (key: 'analyzedIntervals' | 'levelIntervals' | 'trendIntervals', value: string, max?: number) => {
    const current = prefs[key] || [];
    const next = current.includes(value) ? current.filter(item => item !== value) : (max && current.length >= max ? current : [...current, value]);
    set(key, next);
  };
  const toggleSort = (value: string) => {
    const enabled = prefs.sortEnabled || [];
    const disabled = prefs.sortDisabled || [];
    if (enabled.includes(value)) onChange({ sortEnabled: enabled.filter(item => item !== value), sortDisabled: [...disabled, value] });
    else onChange({ sortDisabled: disabled.filter(item => item !== value), sortEnabled: [...enabled, value] });
  };
  const moveSort = (value: string) => {
    const enabled = prefs.sortEnabled || [];
    const index = enabled.indexOf(value);
    if (index < 0 || enabled.length < 2) return;
    const next = [...enabled];
    next.splice(index, 1);
    next.push(value);
    set('sortEnabled', next);
  };

  return <div className="originalSettingsBackdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} tabIndex={-1} className="originalSettingsPanel" role="dialog" aria-modal="true" aria-label="Налаштування hookchart">
      <div className="settingsHeader">
        <div><b>Налаштування графіка</b><small>Параметри зберігаються автоматично</small></div>
        <button type="button" onClick={onClose} aria-label="Закрити">×</button>
      </div>
      <div className="settingsTabs">
        <button type="button" className={tab === 'main' ? 'active' : ''} onClick={() => setTab('main')}>Основні</button>
        <button type="button" className={tab === 'strategies' ? 'active' : ''} onClick={() => setTab('strategies')}>Стратегії</button>
        <button type="button" className={tab === 'hotkeys' ? 'active' : ''} onClick={() => setTab('hotkeys')}>Гарячі клавіші</button>
      </div>
      <div className="settingsBody">
        {tab === 'main' ? <>
          <Section title="Застосунок">
            <Choice label="Мова" values={['uk', 'pl', 'ru', 'en']} labels={['Українська', 'Polski', 'Русский', 'English']} value={prefs.language} set={value => set('language', value)} />
            <Choice label="Часовий пояс" values={['Europe/Warsaw', 'UTC', 'Europe/Kyiv', 'America/New_York']} labels={['Europe/Warsaw', 'UTC', 'Europe/Kyiv', 'America/New_York']} value={prefs.timezone} set={value => set('timezone', value)} />
            <SwitchRow label="Підказки" desc="Підказки в інтерфейсі під час наведення миші" value={prefs.tooltips !== false} onChange={value => set('tooltips', value)} />
            <SwitchRow label="Зі сповіщень відкривати графіки в новому вікні" value={!!prefs.notificationOpenNew} onChange={value => set('notificationOpenNew', value)} />
          </Section>

          <Section title="Інтерфейс">
            <SwitchRow label="Відступ праворуч" desc="Вільне місце після останньої свічки перед шкалою цін." value={prefs.rightPaddingEnabled !== false} onChange={value => set('rightPaddingEnabled', value)} />
            <Setting label="Кількість свічок" desc="Розмір відступу праворуч, від 0 до 500 свічок."><Num value={prefs.rightPadding ?? 10} min={0} max={500} disabled={prefs.rightPaddingEnabled === false} set={value => set('rightPadding', Math.round(value))} /><b className="valueBadge">свічок</b></Setting>
            <SwitchRow label="Панель інструментів на графіку" value={prefs.chartToolbar !== false} onChange={value => set('chartToolbar', value)} />
            <SwitchRow label="Іконки верхньої панелі над графіком" desc="Приховує всі додаткові іконки верхньої панелі. Вибір таймфрейму залишається видимим і робочим." value={prefs.showTopToolbarIcons !== false} onChange={value => set('showTopToolbarIcons', value)} />
            <SwitchRow label="Показувати суми великих ринкових заявок під свічками" value={prefs.showMarketPrintSums === true} onChange={value => set('showMarketPrintSums', value)} />
            <SwitchRow label="Об’єми на графіку" value={prefs.showVolumes !== false} onChange={value => set('showVolumes', value)} />
            <SwitchRow label="Нижня інформаційна панель" value={prefs.showMarketStatsBar !== false} onChange={value => set('showMarketStatsBar', value)} />
            <SwitchRow label="Ліквідації на графіку" value={prefs.showLiquidations !== false} onChange={value => set('showLiquidations', value)} />
            <SwitchRow label="Блок Liq + каскад" value={prefs.showLiqRiskBlock !== false} onChange={value => set('showLiqRiskBlock', value)} />
            <SwitchRow label="Показувати діалог сповіщень у режимі сітки та однієї монети" value={prefs.notificationDialog !== false} onChange={value => set('notificationDialog', value)} />
            <Choice label="Розмір вікна в режимі однієї монети" desc="Відсоток від ширини та висоти екрана." values={[70, 75, 80, 85, 90, 95, 100]} labels={['70%', '75%', '80%', '85%', '90%', '95%', '100%']} value={prefs.singleWindowSize ?? 85} set={value => set('singleWindowSize', value)} />
            <SwitchRow label="Кнопки гортання в режимі «Усі графіки»" value={prefs.pagingButtons !== false} onChange={value => set('pagingButtons', value)} />
            <SwitchRow label="Спільні фігури малювання" desc="Фігури однієї монети можуть використовуватися в усіх режимах і списках." value={prefs.sharedDrawings !== false} onChange={value => set('sharedDrawings', value)} />
            <SwitchRow label="Дублювати перехрестя на графіку" value={!!prefs.duplicateCrosshair} onChange={value => set('duplicateCrosshair', value)} />
          </Section>

          <Section title="Сітка графіка">
            <SwitchRow label="Горизонтальні лінії" value={!!prefs.gridHorizontal} onChange={value => set('gridHorizontal', value)} />
            <SwitchRow label="Вертикальні лінії" desc="Увімкніть обидва перемикачі, щоб показати повну сітку." value={!!prefs.gridVertical} onChange={value => set('gridVertical', value)} />
          </Section>

          <Section title="Оформлення графіка">
            <Setting label="Палітра графіка" desc="Готові контрастні темні палітри в стилі професійних trading-терміналів."><div className="settingsChips">
              <button type="button" onClick={() => onChange({ candleLongColor: '#0ECB81', candleShortColor: '#F6465D', densityLineColor: '#7B61FF', densityLabelColor: '#C4B5FD' })}>TV Deep</button>
              <button type="button" onClick={() => onChange({ candleLongColor: '#26A69A', candleShortColor: '#EF5350', densityLineColor: '#8E7DBE', densityLabelColor: '#D8C7FF' })}>Pastel Pro</button>
              <button type="button" onClick={() => onChange({ candleLongColor: '#00C076', candleShortColor: '#FF3B4F', densityLineColor: '#5B8DEF', densityLabelColor: '#9CC7FF' })}>Ocean</button>
            </div></Setting>
            <Setting label="Свічка Long"><input className="colorInput" type="color" value={prefs.candleLongColor || '#0ECB81'} onChange={event => set('candleLongColor', event.target.value)} /></Setting>
            <Setting label="Свічка Short"><input className="colorInput" type="color" value={prefs.candleShortColor || '#F6465D'} onChange={event => set('candleShortColor', event.target.value)} /></Setting>
            <Setting label="Колір ліній щільностей"><input className="colorInput" type="color" value={prefs.densityLineColor || '#7B61FF'} onChange={event => set('densityLineColor', event.target.value)} /></Setting>
            <Setting label="Колір міток щільностей"><input className="colorInput" type="color" value={prefs.densityLabelColor || '#C4B5FD'} onChange={event => set('densityLabelColor', event.target.value)} /></Setting>
            <Setting label="Товщина лінії"><Num value={prefs.densityLineWidth ?? 0.5} min={0.1} max={5} step={0.1} set={value => set('densityLineWidth', value)} /><b className="valueBadge">px</b></Setting>
            <Choice label="Вигляд лінії" values={['solid', 'dash', 'dot']} labels={['Суцільна', 'Пунктир', 'Крапки']} value={prefs.densityLineStyle} set={value => set('densityLineStyle', value)} />
            <Setting label="Розмір мітки"><Num value={prefs.densityLabelSize ?? 8} min={8} max={20} set={value => set('densityLabelSize', value)} /><b className="valueBadge">px</b></Setting>
          </Section>

          <Section title="Дані та сортування">
            <Setting label="Типи та порядок сортування" desc="Клік переміщує тип праворуч. Подвійний клік вмикає/вимикає."><div className="sortGroups">
              <small>Увімкнені</small><div className="settingsChips">{(prefs.sortEnabled || []).map(item => <button type="button" key={item} onClick={() => moveSort(item)} onDoubleClick={() => toggleSort(item)}>{item}</button>)}</div>
              <small>Вимкнені</small><div className="settingsChips muted">{(prefs.sortDisabled || []).map(item => <button type="button" key={item} onDoubleClick={() => toggleSort(item)}>{item}</button>)}</div>
            </div></Setting>
            <MultiChoice label="Інтервали аналізу" desc="Не більше 4" values={['5m', '15m', '30m', '1h', '4h', '1d']} selected={prefs.analyzedIntervals || []} toggle={value => toggleArray('analyzedIntervals', value, 4)} max={4} />
          </Section>

          <Section title="Скоринг">
            <SwitchRow label="Сценарна оцінка монет" value={!!prefs.scoring} onChange={value => set('scoring', value)} />
          </Section>

          <Section title="Круглі числа (колонка RN)">
            <SwitchRow label="Показувати відстань до найближчого круглого числа" value={!!prefs.roundDistance} onChange={value => set('roundDistance', value)} />
            <Choice label="Ступінь округлення" values={[1, 2, 3]} value={prefs.roundness ?? 2} set={value => set('roundness', value)} />
            <SwitchRow label="Показувати сітку круглих чисел на графіку" desc="Тонкі ненав’язливі лінії круглих цін." value={!!prefs.roundGrid} onChange={value => set('roundGrid', value)} />
          </Section>

          <Section title="Підтримка та опір">
            <SwitchRow label="Показувати підтримку та опір" desc="S — підтримка нижче ціни, R — опір вище ціни. Рівні з підтвердженим пробоєм приховуються." value={!!prefs.autoSR} onChange={value => onChange({ autoSR: value, overlays: value ? Array.from(new Set([...(prefs.overlays || []), 'sr'])) : (prefs.overlays || []).filter(id => id !== 'sr') })} />
            <SwitchRow label="Показувати мітки S/R" desc="Вмикає або вимикає підписи підтримки й опору; лінії керуються перемикачем вище." value={prefs.showSRLabels !== false} onChange={value => set('showSRLabels', value)} />
          </Section>

          <Section title="Автоматичні рівні">
            <MultiChoice label="Таймфрейми автовизначення рівнів" desc="Можна вибрати всі п’ять таймфреймів. За замовчуванням: 1г, 4г і 1d; 5 хв та 15 хв вимкнено. Зніміть усі, щоб вимкнути автовизначення." values={['5m', '15m', '1h', '4h', '1d']} selected={prefs.levelIntervals || []} toggle={value => toggleArray('levelIntervals', value)} />
            <Setting label="Колір міток рівнів" desc="Колір активних рівнів та їхніх підписів. Пробиті рівні залишаються сірими."><input className="colorInput" aria-label="Колір міток рівнів" type="color" value={prefs.levelLabelColor || '#2090F0'} onChange={event => set('levelLabelColor', event.target.value)} /></Setting>
            <Setting label="Розмір міток рівнів"><Num value={prefs.levelLabelSize ?? 11} min={0.2} max={20} step={0.1} set={value => set('levelLabelSize', value)} /><b className="valueBadge">px</b></Setting>
            <Choice label="Тип міток рівнів" values={['text', 'filled', 'outline']} labels={['Текст', 'Із заливкою', 'Із рамкою']} value={prefs.levelLabelStyle || 'text'} set={value => set('levelLabelStyle', value)} />
            <Choice label="Тип ліній рівнів" values={['solid', 'dash', 'dot']} labels={['Суцільна', 'Пунктир', 'Крапки']} value={prefs.levelLineStyle || 'solid'} set={value => set('levelLineStyle', value)} />
            <SwitchRow label="Показувати у списку найближчі рівні" value={prefs.showNearestLevels !== false} onChange={value => set('showNearestLevels', value)} />
            <Setting label="Кількість свічок для визначення рівня"><Num value={prefs.levelCandleCount ?? 15} min={5} max={60} set={value => set('levelCandleCount', value)} /></Setting>
            <Setting label="Глибина історії для визначення рівнів" desc="Кількість свічок для кожного інтервалу"><Num value={prefs.levelHistory ?? 500} min={80} max={1500} set={value => set('levelHistory', value)} /></Setting>
            <Setting label="Підтвердження рівнів" desc="Скільки незалежних підходів потрібно"><Num value={prefs.levelCount ?? 3} min={2} max={10} set={value => set('levelCount', value)} /></Setting>
            <Setting label="Допустима різниця"><Num value={prefs.levelDiff ?? 0.18} min={0.01} max={3} step={0.01} set={value => set('levelDiff', value)} /><b className="valueBadge">%</b></Setting>
            <Setting label="Пробій"><Num value={prefs.levelBreak ?? 0.35} min={0} max={5} step={0.05} set={value => set('levelBreak', value)} /><b className="valueBadge">%</b></Setting>
            <Choice label="Підписи рівнів" values={['always', 'hover', 'off']} labels={['Завжди', 'При наведенні', 'Вимкнені']} value={prefs.levelLabelMode || 'always'} set={value => set('levelLabelMode', value)} />
            <SwitchRow label="Показувати пробиті рівні" desc="Сірі лінії рівнів, які вже були підтверджено пробиті." value={prefs.showBrokenLevels !== false} onChange={value => set('showBrokenLevels', value)} />
            <SwitchRow label="Дозволити «прокол» рівня" desc="Перетин тінню не ламає рівень до підтвердження закриттям." value={prefs.allowWick !== false} onChange={value => set('allowWick', value)} />
          </Section>

          <Section title="Тренди">
            <MultiChoice label="Інтервали трендів" values={['15m', '1h', '4h', '1d']} selected={prefs.trendIntervals || []} toggle={value => toggleArray('trendIntervals', value, 3)} max={3} />
            <Setting label="Глибина історії для визначення похилих ліній"><Num value={prefs.trendHistory ?? 300} min={80} max={1500} set={value => set('trendHistory', value)} /></Setting>
          </Section>

          <Section title="Великі лімітні заявки (колонка O)">
            <SwitchRow label="Аналіз великих лімітних заявок (щільностей)" value={prefs.densityAnalysis !== false} onChange={value => set('densityAnalysis', value)} />
            <SwitchRow label="Таблиця ТОП ордерів" value={prefs.densityTop !== false} onChange={value => set('densityTop', value)} />
            <SwitchRow label="Показувати об’єм у базовій монеті" value={!!prefs.densityBaseVolume} onChange={value => set('densityBaseVolume', value)} />
            <SwitchRow label="Показувати дисбаланс" desc="Сума лімітних ордерів у межах вибраної різниці від ціни для кожної сторони." value={!!prefs.densityImbalance} onChange={value => set('densityImbalance', value)} />
            <Setting label="Щільності на графіку" desc="Незалежно керуйте лініями, мітками та відображенням суми всередині мітки."><div className="densityVisibilityRow">
              {([['showDensityLines', 'Лінії'], ['showDensityLabels', 'Мітки'], ['showDensityAmounts', 'Суми']] as const).map(([key, label]) => <label key={key}><span>{label}</span><input type="checkbox" checked={!!prefs[key]} onChange={event => set(key, event.target.checked)} /></label>)}
            </div></Setting>
            <Setting label="Таймаут великих лімітних ордерів" desc="Мінімальний вік перед показом на графіку."><Num value={prefs.densityTimeoutMin ?? 0} min={0} max={120} set={value => set('densityTimeoutMin', value)} /><b className="valueBadge">хв</b></Setting>
            <Setting label="Різниця" desc="Максимальна різниця між ціною ордера та поточною ціною."><Num value={prefs.densityDiffPct ?? 5} min={0.1} max={20} step={0.1} set={value => set('densityDiffPct', value)} /><b className="valueBadge">%</b></Setting>
            <Setting label="Пороговий об’єм великих ордерів"><div className="densityModeRow">
              <button type="button" className={prefs.densityMode === 'auto' ? 'sel' : ''} onClick={() => set('densityMode', 'auto')}>Авто</button>
              <button type="button" className={prefs.densityMode === 'manual' ? 'sel' : ''} onClick={() => set('densityMode', 'manual')}>Значення</button>
              <span>$</span><Num value={prefs.densityThreshold ?? 0} min={0} step={1000} disabled={prefs.densityMode !== 'manual'} set={value => set('densityThreshold', value)} />
            </div></Setting>
            <Setting label="Множник середнього об’єму"><Num value={prefs.densityAutoMultiplier ?? 1} min={0.1} max={10} step={0.1} set={value => set('densityAutoMultiplier', value)} /><b className="valueBadge">×</b></Setting>
            <SwitchRow label="Показувати великі ордери лише поруч із рівнями" desc="Впливає на список; на графіку та у стакані показуються всі знайдені щільності." value={!!prefs.densityNearLevelsOnly} onChange={value => set('densityNearLevelsOnly', value)} />
          </Section>

          <Section title="Відкритий інтерес (колонка OI)">
            <SwitchRow label="Показувати колонку OI" value={prefs.oiColumn !== false} onChange={value => set('oiColumn', value)} />
            <Choice label="Показувати як" values={['value', 'change']} labels={['Значення', 'Зміна']} value={prefs.oiDisplay || 'value'} set={value => set('oiDisplay', value)} />
            <SwitchRow label="Розраховувати зміну за базовою монетою" value={!!prefs.oiBaseChange} onChange={value => set('oiBaseChange', value)} />
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

          <Section title="Кореляція з Біткоїном (колонка rBTC)">
            <Choice label="Інтервал" values={['', '1h', '4h', '1d']} labels={['Вимк.', '1h', '4h', '1d']} value={prefs.rBtcTf || ''} set={value => set('rBtcTf', value)} />
            <Setting label="Кількість свічок"><Num value={prefs.rBtcCandles ?? 100} min={10} max={1500} set={value => set('rBtcCandles', value)} /></Setting>
          </Section>

          <Section title="Кількість угод (лише Binance)">
            <Choice label="Вікно" values={['1m', '5m', '15m', '1h']} value={prefs.tradesWindow || '15m'} set={value => set('tradesWindow', value)} />
            <SwitchRow label="Кількість угод за вікно (колонка TA)" value={prefs.tradesTA !== false} onChange={value => set('tradesTA', value)} />
            <SwitchRow label="Різниця із середньою кількістю угод (колонка TR)" value={prefs.tradesTR !== false} onChange={value => set('tradesTR', value)} />
            <Setting label="Кількість свічок"><Num value={prefs.tradesCandles ?? 100} min={2} max={1500} set={value => set('tradesCandles', value)} /></Setting>
          </Section>
        </> : tab === 'strategies' ? (
          <StrategySettings activeId={prefs.strategyId || ''} onSelect={onApplyStrategy} />
        ) : (
          <HotkeySettings
            hotkeys={{ ...DEFAULT_HOOKCHART_HOTKEYS, ...(prefs.hotkeys || {}) } as HookChartHotkeys}
            setHotkeys={value => set('hotkeys', value)}
          />
        )}
      </div>
    </div>
  </div>;
}
