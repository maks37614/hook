import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Keyboard, X, RotateCcw, Trash2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import type { SupportedLanguage } from '../../locales';
import { hotkeyActionLabel, hotkeyGroupLabel } from '../../locales/hookchartHotkeys';
import {
  DEFAULT_HOOKCHART_HOTKEYS, HOTKEY_GROUPS, hotkeyDisplay, hotkeyFromEvent,
  type HookChartHotkeyAction, type HookChartHotkeys,
} from '../hookchart/OriginalHookChartSettings';
import { TERMINAL_SHORTCUTS, DEFAULT_TERMINAL_HOTKEYS, displayTerminalShortcut, type TerminalShortcutId, type TerminalHotkeyMap } from '../../utils/terminalHotkeys';

type Locale = SupportedLanguage;
type Copy = {
  title: string; page: string; chart: string; general: string; layout: string; navigation: string;
  pageInfo: string; chartInfo: string; close: string; reset: string; clear: string;
  record: string; unassigned: string; guest: string; saving: string; saved: string; failed: string;
  conflict: string; mouse: string; linkingUnavailable: string;
};
const COPY: Record<Locale, Copy> = {
  uk: {
    title: 'Гарячі клавіші', page: 'Термінал', chart: 'HookChart', general: 'Загальні',
    layout: 'Вигляд і режими', navigation: 'Навігація',
    pageInfo: 'Комбінації для керування сторінкою Термінал. Вони не змінюють гарячі клавіші графіка.',
    chartInfo: 'Ті самі комбінації, що й у розділі «Гарячі клавіші» налаштувань HookChart. Зміни синхронізуються з профілем.',
    close: 'Закрити', reset: 'Скинути всі', clear: 'Очистити',
    record: 'Натисніть клавіші…', unassigned: 'Не призначено',
    guest: 'Увійдіть у профіль, щоб змінювати та зберігати комбінації HookChart.',
    conflict: 'Ця комбінація вже використовується. Виберіть іншу.', mouse: 'Лупа: натисніть і утримуйте середню кнопку миші над графіком. Клавіатурна комбінація змінюється нижче.', linkingUnavailable: 'Підключення не налаштовано або вибраний зовнішній термінал не підтримується.',
    saving: 'Збереження…', saved: 'Збережено', failed: 'Не вдалося зберегти комбінації.',
  },
  en: {
    title: 'Keyboard shortcuts', page: 'Terminal', chart: 'HookChart', general: 'General',
    layout: 'Layout and modes', navigation: 'Navigation',
    pageInfo: 'Shortcuts for the Terminal page. These do not change chart shortcuts.',
    chartInfo: 'These are the same shortcuts shown in HookChart settings. Changes sync with your profile.',
    close: 'Close', reset: 'Reset all', clear: 'Clear',
    record: 'Press shortcut…', unassigned: 'Not assigned',
    guest: 'Sign in to edit and save HookChart shortcuts.',
    conflict: 'This shortcut is already assigned. Choose another.', mouse: 'Magnifier: hold the middle mouse button over the chart. The keyboard alternative can be changed below.', linkingUnavailable: 'External terminal linking is not configured or supported.',
    saving: 'Saving…', saved: 'Saved', failed: 'Could not save shortcuts.',
  },
  pl: {
    title: 'Skróty klawiszowe', page: 'Terminal', chart: 'HookChart', general: 'Ogólne',
    layout: 'Układ i tryby', navigation: 'Nawigacja',
    pageInfo: 'Skróty do obsługi strony Terminal. Nie zmieniają skrótów wykresu.',
    chartInfo: 'Te same skróty, co w ustawieniach HookChart. Zmiany są synchronizowane z profilem.',
    close: 'Zamknij', reset: 'Przywróć wszystkie', clear: 'Wyczyść',
    record: 'Naciśnij skrót…', unassigned: 'Nieprzypisany',
    guest: 'Zaloguj się, aby edytować i zapisywać skróty HookChart.',
    conflict: 'Ten skrót jest już przypisany. Wybierz inny.', mouse: 'Lupa: przytrzymaj środkowy przycisk myszy nad wykresem. Skrót klawiaturowy można zmienić poniżej.', linkingUnavailable: 'Połączenie z zewnętrznym terminalem jest nieustawione lub nieobsługiwane.',
    saving: 'Zapisywanie…', saved: 'Zapisano', failed: 'Nie udało się zapisać skrótów.',
  },
  ru: {
    title: 'Горячие клавиши', page: 'Терминал', chart: 'HookChart', general: 'Общие',
    layout: 'Вид и режимы', navigation: 'Навигация',
    pageInfo: 'Комбинации для страницы Терминал. Они не меняют горячие клавиши графика.',
    chartInfo: 'Те же комбинации, что и в настройках HookChart. Изменения сохраняются в профиле.',
    close: 'Закрыть', reset: 'Сбросить все', clear: 'Очистить',
    record: 'Нажмите клавиши…', unassigned: 'Не назначено',
    guest: 'Войдите в профиль, чтобы редактировать и сохранять горячие клавиши HookChart.',
    conflict: 'Эта комбинация уже используется. Выберите другую.', mouse: 'Лупа: удерживайте среднюю кнопку мыши над графиком. Клавиатурную комбинацию можно изменить ниже.', linkingUnavailable: 'Связь с внешним терминалом не настроена или не поддерживается.',
    saving: 'Сохранение…', saved: 'Сохранено', failed: 'Не удалось сохранить комбинации.',
  },
};

const PAGE_LABELS: Record<Locale, Record<TerminalShortcutId, string>> = {
  uk: {
    exitTerminal: 'Закрити Термінал (якщо немає відкритих меню)', linking: 'Увімкнути / вимкнути лінковку зовнішнього термінала',
    help: 'Відкрити гарячі клавіші', addChart: 'Додати графік', presets: 'Пресети монет',
    favorites: 'Обрані монети', settings: 'Налаштування Термінала', fullscreen: 'На весь екран / вийти',
    autoScale: 'Автомасштабування всіх графіків', eco: 'Перемкнути ECO',
    oneColumn: 'Одна колонка', twoColumns: 'Дві колонки', threeColumns: 'Три колонки', fourColumns: 'Чотири колонки',
    previousTimeframe: 'Попередній таймфрейм усіх графіків', nextTimeframe: 'Наступний таймфрейм усіх графіків',
    previousPage: 'Попередня сторінка графіків', nextPage: 'Наступна сторінка графіків',
  },
  en: {
    exitTerminal: 'Close Terminal (unless a menu is open)', linking: 'Enable / disable external terminal linking',
    help: 'Open keyboard shortcuts', addChart: 'Add a chart', presets: 'Coin presets',
    favorites: 'Favorites', settings: 'Terminal settings', fullscreen: 'Toggle fullscreen',
    autoScale: 'Auto-scale all charts', eco: 'Toggle ECO',
    oneColumn: 'One column', twoColumns: 'Two columns', threeColumns: 'Three columns', fourColumns: 'Four columns',
    previousTimeframe: 'Previous timeframe for all charts', nextTimeframe: 'Next timeframe for all charts',
    previousPage: 'Previous chart page', nextPage: 'Next chart page',
  },
  pl: {
    exitTerminal: 'Zamknij Terminal (gdy menu są zamknięte)', linking: 'Włącz / wyłącz połączenie z terminalem zewnętrznym',
    help: 'Otwórz skróty klawiszowe', addChart: 'Dodaj wykres', presets: 'Zestawy monet',
    favorites: 'Ulubione', settings: 'Ustawienia Terminala', fullscreen: 'Przełącz pełny ekran',
    autoScale: 'Automatyczna skala wszystkich wykresów', eco: 'Przełącz ECO',
    oneColumn: 'Jedna kolumna', twoColumns: 'Dwie kolumny', threeColumns: 'Trzy kolumny', fourColumns: 'Cztery kolumny',
    previousTimeframe: 'Poprzedni interwał wszystkich wykresów', nextTimeframe: 'Następny interwał wszystkich wykresów',
    previousPage: 'Poprzednia strona wykresów', nextPage: 'Następna strona wykresów',
  },
  ru: {
    exitTerminal: 'Закрыть Терминал (если меню закрыты)', linking: 'Включить / выключить связь с внешним терминалом',
    help: 'Открыть горячие клавиши', addChart: 'Добавить график', presets: 'Пресеты монет',
    favorites: 'Избранные монеты', settings: 'Настройки Терминала', fullscreen: 'Полный экран / выйти',
    autoScale: 'Автомасштаб всех графиков', eco: 'Переключить ECO',
    oneColumn: 'Одна колонка', twoColumns: 'Две колонки', threeColumns: 'Три колонки', fourColumns: 'Четыре колонки',
    previousTimeframe: 'Предыдущий таймфрейм всех графиков', nextTimeframe: 'Следующий таймфрейм всех графиков',
    previousPage: 'Предыдущая страница графиков', nextPage: 'Следующая страница графиков',
  },
};

type Props = {
  open: boolean;
  onClose: () => void;
  chartHotkeys?: Partial<HookChartHotkeys>;
  pageHotkeys: TerminalHotkeyMap;
  onSavePageHotkeys: (next: TerminalHotkeyMap) => void;
  linkingAvailable?: boolean;
  onSaveChartHotkeys?: (hotkeys: HookChartHotkeys) => Promise<void>;
};

const GROUPS = ['general', 'layout', 'navigation'] as const;

export function TerminalHotkeysDialog({ open, onClose, chartHotkeys, pageHotkeys, onSavePageHotkeys, linkingAvailable = false, onSaveChartHotkeys }: Props) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const [tab, setTab] = useState<'page' | 'chart'>('page');
  const [editing, setEditing] = useState<HookChartHotkeyAction | null>(null);
  const [editingPage, setEditingPage] = useState<TerminalShortcutId | null>(null);
  const [conflict, setConflict] = useState(false);
  const [draft, setDraft] = useState<HookChartHotkeys>(() => ({ ...DEFAULT_HOOKCHART_HOTKEYS, ...chartHotkeys }));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setTab('page');
    setEditing(null);
    setEditingPage(null);
    setConflict(false);
    setStatus('idle');
    setDraft({ ...DEFAULT_HOOKCHART_HOTKEYS, ...chartHotkeys });
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, [open]);

  const reserved = (spec: string, section: 'chart' | 'page', actionId: string): boolean => {
    if (!spec || spec === 'Escape') return false;
    const entries: Array<[string, string]> = [
      ...Object.entries(pageHotkeys).map(([id, value]): [string, string] => ['page:' + id, value]),
      ...Object.entries({ ...DEFAULT_HOOKCHART_HOTKEYS, ...chartHotkeys }).map(([id, value]): [string, string] => ['chart:' + id, value]),
    ];
    return entries.some(([key, value]) => key !== section + ':' + actionId &&
      value.split('|').includes(spec));
  };
  const save = (next: HookChartHotkeys) => {
    if (!onSaveChartHotkeys) return;
    setDraft(next);
    setStatus('saving');
    void onSaveChartHotkeys(next).then(() => setStatus('saved'), () => setStatus('failed'));
  };

  useEffect(() => {
    if (!open || !editing || !onSaveChartHotkeys) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { setEditing(null); return; }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        save({ ...draft, [editing]: '' });
        setEditing(null);
        return;
      }
      const value = hotkeyFromEvent(event);
      if (!value || ['Ctrl', 'Alt', 'Shift', 'Meta'].includes(value)) return;
      if (reserved(value, 'chart', editing)) { setConflict(true); return; }
      setConflict(false);
      save({ ...draft, [editing]: value });
      setEditing(null);
    };
    window.addEventListener('keydown', capture, true);
    return () => window.removeEventListener('keydown', capture, true);
  }, [open, editing, onSaveChartHotkeys, draft]);

  useEffect(() => {
    if (!open || !editingPage) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { setEditingPage(null); return; }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        onSavePageHotkeys({ ...pageHotkeys, [editingPage]: '' });
        setConflict(false);
        setEditingPage(null);
        return;
      }
      const value = hotkeyFromEvent(event);
      if (!value || ['Ctrl', 'Alt', 'Shift', 'Meta'].includes(value)) return;
      if (reserved(value, 'page', editingPage)) { setConflict(true); return; }
      onSavePageHotkeys({ ...pageHotkeys, [editingPage]: value });
      setConflict(false);
      setEditingPage(null);
    };
    window.addEventListener('keydown', capture, true);
    return () => window.removeEventListener('keydown', capture, true);
  }, [open, editingPage, pageHotkeys, chartHotkeys, onSavePageHotkeys]);

  const onDialogKeyDown = (event: React.KeyboardEvent) => {
    if (editing || editingPage) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'Tab') {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const elements = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'))
        .filter(element => element.getClientRects().length > 0);
      if (!elements.length) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === elements[0] || document.activeElement === dialog)) {
        event.preventDefault();
        elements[elements.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === elements[elements.length - 1]) {
        event.preventDefault();
        elements[0].focus();
      }
    }
  };

  if (!open || typeof document === 'undefined') return null;
  const groupTitles = {
    general: copy.general, layout: copy.layout, navigation: copy.navigation,
  };
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/85 p-2 sm:p-4"
      data-terminal-hotkeys="open" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="terminal-hotkey-dialog-title"
        onKeyDown={onDialogKeyDown}
        className="flex max-h-[92dvh] w-full max-w-[740px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#0d1420] text-slate-200 shadow-2xl outline-none">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-700 px-4 py-3">
          <h2 id="terminal-hotkey-dialog-title" className="flex items-center gap-2 text-base font-semibold">
            <Keyboard className="h-5 w-5 text-cyan-400" aria-hidden="true" />{copy.title}
          </h2>
          <button type="button" aria-label={copy.close} title={copy.close} onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div role="tablist" aria-label={copy.title} className="flex shrink-0 gap-2 border-b border-slate-800 px-4 py-2">
          <button type="button" role="tab" aria-selected={tab === 'page'} onClick={() => setTab('page')}
            className={`rounded-md px-3 py-1.5 text-[13px] sm:text-sm ${tab === 'page' ? 'bg-cyan-700/40 text-cyan-100' : 'text-slate-400 hover:text-white'}`}>{copy.page}</button>
          <button type="button" role="tab" aria-selected={tab === 'chart'} onClick={() => setTab('chart')}
            className={`rounded-md px-3 py-1.5 text-[13px] sm:text-sm ${tab === 'chart' ? 'bg-cyan-700/40 text-cyan-100' : 'text-slate-400 hover:text-white'}`}>{copy.chart}</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4" role="tabpanel">
          {conflict && <p role="alert" className="mb-2 rounded border border-amber-700/60 p-2 text-xs text-amber-300">{copy.conflict}</p>}
          {tab === 'page' ? <>
            <p className="mb-3 text-xs text-slate-400">{copy.pageInfo}</p>
            <div className="mb-3 flex justify-end">
              <button type="button" onClick={() => { onSavePageHotkeys({ ...DEFAULT_TERMINAL_HOTKEYS }); setConflict(false); }}
                className="flex items-center gap-1 rounded-lg border border-slate-600 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                <RotateCcw className="h-3.5 w-3.5" />{copy.reset}
              </button>
            </div>
            {GROUPS.map(group => <section key={group} className="mb-3 overflow-hidden rounded-lg border border-slate-700/70">
              <h3 className="border-b border-slate-700 bg-slate-800/50 px-3 py-2 text-[15px] leading-[1.4] font-semibold uppercase tracking-wide text-cyan-300">{groupTitles[group]}</h3>
              {TERMINAL_SHORTCUTS.filter(item => item.group === group).map(item =>
                <div key={item.id} className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 last:border-0">
                  <span className="min-w-[120px] flex-1 text-[13px] leading-[1.45] sm:text-sm">{PAGE_LABELS[language][item.id]}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" aria-label={PAGE_LABELS[language][item.id]} aria-pressed={editingPage === item.id}
                      onClick={() => { setEditing(null); setConflict(false); setEditingPage(item.id); }}
                      className={`min-w-28 rounded-md border px-2 py-1 font-mono text-[13px] leading-[1.3] whitespace-normal break-words text-center ${editingPage === item.id ? 'border-amber-500 text-amber-300' : 'border-slate-600 bg-slate-900 text-cyan-200'}`}>
                      {editingPage === item.id ? copy.record : (pageHotkeys[item.id] ? displayTerminalShortcut(pageHotkeys[item.id]) : copy.unassigned)}
                    </button>
                    <button type="button" title={copy.clear} aria-label={copy.clear + ': ' + PAGE_LABELS[language][item.id]}
                      onClick={() => onSavePageHotkeys({ ...pageHotkeys, [item.id]: '' })}
                      className="rounded p-1.5 text-slate-400 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
                    <button type="button" title={copy.reset} aria-label={copy.reset + ': ' + PAGE_LABELS[language][item.id]}
                      onClick={() => onSavePageHotkeys({ ...pageHotkeys, [item.id]: DEFAULT_TERMINAL_HOTKEYS[item.id] })}
                      className="rounded p-1.5 text-slate-400 hover:text-cyan-300"><RotateCcw className="h-3.5 w-3.5" /></button>
                  </div>
                </div>)}
            </section>)}
            {!linkingAvailable && <p className="mb-2 text-xs text-slate-500">{copy.linkingUnavailable}</p>}
          </> : <>
            <p className="mb-3 text-xs text-slate-400">{copy.chartInfo}</p>
            <p className="mb-3 text-xs text-slate-400">{copy.mouse}</p>
            {!onSaveChartHotkeys && <p role="note" className="mb-3 rounded-lg border border-amber-700/50 bg-amber-950/30 p-2 text-xs text-amber-200">{copy.guest}</p>}
            {onSaveChartHotkeys && <div className="mb-3 flex items-center justify-between gap-3">
              <span role="status" className={`text-xs ${status === 'failed' ? 'text-rose-400' : 'text-slate-400'}`}>
                {status === 'saving' ? copy.saving : status === 'saved' ? copy.saved : status === 'failed' ? copy.failed : ''}
              </span>
              <button type="button" onClick={() => save({ ...DEFAULT_HOOKCHART_HOTKEYS })}
                className="flex items-center gap-1 rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                <RotateCcw className="h-3.5 w-3.5" />{copy.reset}
              </button>
            </div>}
            {HOTKEY_GROUPS.map(group => <section key={group.title} className="mb-3 overflow-hidden rounded-lg border border-slate-700/70">
              <h3 className="border-b border-slate-700 bg-slate-800/50 px-3 py-2 text-[15px] leading-[1.4] font-semibold text-cyan-300">
                {hotkeyGroupLabel(language, group.title)}
              </h3>
              {group.rows.map(row => <div key={row.id} className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 last:border-0">
                <span className="min-w-[130px] flex-1 text-[13px] leading-[1.45] sm:text-sm">{hotkeyActionLabel(language, row.id, row.label)}</span>
                <div className="flex items-center gap-1">
                  <button type="button" disabled={!onSaveChartHotkeys} aria-label={`${hotkeyActionLabel(language, row.id, row.label)}: ${editing === row.id ? copy.record : draft[row.id] ? hotkeyDisplay(draft[row.id]) : copy.unassigned}`}
                    aria-pressed={editing === row.id}
                    onClick={() => setEditing(row.id)}
                    className={`min-w-28 max-w-40 rounded-md border px-2 py-1.5 font-mono text-[13px] leading-[1.3] whitespace-normal break-words text-center disabled:cursor-default disabled:opacity-70 ${editing === row.id ? 'border-amber-500 bg-amber-900/30 text-amber-200' : 'border-slate-600 bg-slate-900 text-cyan-200'}`}>
                    {editing === row.id ? copy.record : draft[row.id] ? hotkeyDisplay(draft[row.id]) : copy.unassigned}
                  </button>
                  {onSaveChartHotkeys && <>
                    <button type="button" title={copy.clear} aria-label={`${copy.clear}: ${hotkeyActionLabel(language, row.id, row.label)}`} onClick={() => save({ ...draft, [row.id]: '' })}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
                    <button type="button" title={copy.reset} aria-label={`${copy.reset}: ${hotkeyActionLabel(language, row.id, row.label)}`} onClick={() => save({ ...draft, [row.id]: DEFAULT_HOOKCHART_HOTKEYS[row.id] })}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-cyan-300"><RotateCcw className="h-3.5 w-3.5" /></button>
                  </>}
                </div>
              </div>)}
            </section>)}
          </>}
        </div>
      </div>
    </div>, document.body);
}
