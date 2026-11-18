import React, { useEffect, useRef, useState } from 'react';
import { Check, Timer } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { translatePhrase, type SupportedLanguage } from '../../locales';
import { MARKET_PRESETS, type TerminalMarketPreset } from '../../utils/marketPresets';
import {
  TERMINAL_CHART_REFRESH_OPTIONS,
  type TerminalChartRefreshMs,
} from '../../utils/terminalChartRefresh';

type Copy = { title: string; description: string; live: string; current: string;
  presetAuto: string; presetDescription: string; presetSelected: string; presetNotSelected: string; };
const labels: Record<SupportedLanguage, Copy> = {
  uk: {
    title: 'Оновлення графіків',
    description: 'Частота відображення свічок. Біржові дані та сповіщення надходять без затримки.',
    live: 'У реальному часі',
    current: 'Оновлення графіків',
    presetAuto: 'Автооновлення з пресету',
    presetDescription: 'Оновлює склад графіків за ринковим пресетом приблизно кожні 30 с, без додаткових потоків. Ручна зміна монет припиняє керування пресетом.',
    presetSelected: 'Вибраний пресет:', presetNotSelected: 'Виберіть готовий пресет у меню монет.',
  },
  en: {
    title: 'Chart refresh',
    description: 'Candle display frequency. Exchange data and alerts still arrive in real time.',
    live: 'Live',
    current: 'Chart refresh',
    presetAuto: 'Auto-update from preset',
    presetDescription: 'Updates the chart selection from the market preset about every 30 s, without extra streams. Manual coin changes stop preset control.',
    presetSelected: 'Selected preset:', presetNotSelected: 'Choose a built-in preset in the coin menu.',
  },
  ru: {
    title: 'Обновление графиков',
    description: 'Частота отображения свечей. Биржевые данные и уведомления поступают без задержки.',
    live: 'В реальном времени',
    current: 'Обновление графиков',
    presetAuto: 'Автообновление из пресета',
    presetDescription: 'Обновляет набор графиков по рыночному пресету примерно каждые 30 с, без дополнительных потоков. Ручное изменение монет прекращает управление пресетом.',
    presetSelected: 'Выбранный пресет:', presetNotSelected: 'Выберите готовый пресет в меню монет.',
  },
  pl: {
    title: 'Odświeżanie wykresów',
    description: 'Częstotliwość wyświetlania świec. Dane giełdowe i alerty docierają bez opóźnień.',
    live: 'Na żywo',
    current: 'Odświeżanie wykresów',
    presetAuto: 'Autoaktualizacja z presetu',
    presetDescription: 'Aktualizuje zestaw wykresów według presetu rynkowego mniej więcej co 30 s, bez dodatkowych strumieni. Ręczna zmiana monet zatrzymuje działanie presetu.',
    presetSelected: 'Wybrany preset:', presetNotSelected: 'Wybierz gotowy preset w menu monet.',
  },
};

export interface TerminalChartRefreshPickerProps {
  intervalMs: TerminalChartRefreshMs;
  onChange: (interval: TerminalChartRefreshMs) => void;
  activePreset: TerminalMarketPreset | null;
  presetAutoUpdate: boolean;
  onPresetAutoUpdateChange: (enabled: boolean) => void;
}

export function TerminalChartRefreshPicker({ intervalMs, onChange, activePreset, presetAutoUpdate, onPresetAutoUpdateChange }: TerminalChartRefreshPickerProps) {
  const { language } = useLanguage();
  const copy = labels[language];
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const presetCheckboxId = React.useId();
  const preset = MARKET_PRESETS.find(item => item.id === activePreset);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const choiceLabel = (value: TerminalChartRefreshMs) =>
    value === 0 ? copy.live : value < 1000 ? `${value} ms` : `${value / 1000} s`;

  return <div ref={wrapperRef} className="relative shrink-0" data-terminal-chart-refresh={intervalMs}>
    <button
      ref={buttonRef}
      type="button"
      aria-label={copy.title}
      aria-expanded={open}
      title={`${copy.current}: ${choiceLabel(intervalMs)}`}
      onClick={() => setOpen(previous => !previous)}
      className={`flex h-7 w-8 items-center justify-center rounded-lg border transition-colors ${open || intervalMs !== 0
        ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
        : 'border-slate-700/80 bg-slate-900 text-slate-400 hover:text-cyan-300'}`}
    >
      <Timer className="h-4 w-4" aria-hidden="true" />
    </button>
    {open && <div role="dialog" aria-label={copy.title}
      className="absolute left-0 top-full z-[65] mt-2 w-64 max-w-[calc(100vw-24px)] rounded-xl border border-slate-700 bg-slate-950 p-2 shadow-2xl">
      <p className="px-2 pb-1 text-xs font-semibold text-slate-100">{copy.title}</p>
      <p className="px-2 pb-2 text-[11px] leading-relaxed text-slate-400">{copy.description}</p>
      <div className="grid grid-cols-2 gap-1" role="group" aria-label={copy.title}>
        {TERMINAL_CHART_REFRESH_OPTIONS.map(value => (
          <button key={value} type="button" aria-pressed={intervalMs === value}
            onClick={() => { onChange(value); setOpen(false); buttonRef.current?.focus(); }}
            className={`flex min-h-8 items-center justify-between gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${intervalMs === value
              ? 'bg-cyan-500/20 text-cyan-200'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <span>{choiceLabel(value)}</span>
            {intervalMs === value && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div className="mt-2 border-t border-slate-800 px-1 pt-2" data-terminal-preset-auto-update={presetAutoUpdate ? 'on' : 'off'}>
        <label htmlFor={presetCheckboxId} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-xs font-medium text-slate-100">
          <input id={presetCheckboxId} type="checkbox" className="h-4 w-4 shrink-0 accent-cyan-400"
            checked={presetAutoUpdate} onChange={event => onPresetAutoUpdateChange(event.target.checked)} />
          <span>{copy.presetAuto}</span>
        </label>
        <p className="px-1 pt-1 text-[11px] text-slate-400">
          {preset ? `${copy.presetSelected} ${translatePhrase(language, preset.label)}` : copy.presetNotSelected}
        </p>
        <p className="px-1 pt-1 text-[10px] leading-relaxed text-slate-500">{copy.presetDescription}</p>
      </div>
    </div>}
  </div>;
}
