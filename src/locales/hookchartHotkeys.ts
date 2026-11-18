/** Shared four-language labels for HookChart and Terminal keyboard shortcuts.
 * Keep action IDs/keyboard codes separate from localized presentation. */
import type { SupportedLanguage } from './types';
import type { HookChartHotkeyAction } from '../components/hookchart/OriginalHookChartSettings';

export type HotkeyUiCopy = {
  title: string; instructions: string; reset: string; clear: string;
  record: string; unassigned: string;
};
export const HOOKCHART_HOTKEY_UI: Record<SupportedLanguage, HotkeyUiCopy> = {
  uk: {
    title: 'Гарячі клавіші',
    instructions: 'Натисніть на комбінацію та введіть нову. Esc скасовує введення, Backspace або Delete очищає комбінацію.',
    reset: 'Скинути', clear: 'Очистити', record: 'Натисніть клавіші…', unassigned: 'Не призначено',
  },
  en: {
    title: 'Keyboard shortcuts',
    instructions: 'Select a shortcut and press new keys. Esc cancels recording; Backspace or Delete clears the shortcut.',
    reset: 'Reset', clear: 'Clear', record: 'Press keys…', unassigned: 'Not assigned',
  },
  pl: {
    title: 'Skróty klawiszowe',
    instructions: 'Wybierz skrót i naciśnij nową kombinację. Esc anuluje nagrywanie; Backspace lub Delete usuwa skrót.',
    reset: 'Przywróć', clear: 'Wyczyść', record: 'Naciśnij klawisze…', unassigned: 'Nieprzypisany',
  },
  ru: {
    title: 'Горячие клавиши',
    instructions: 'Выберите комбинацию и нажмите новые клавиши. Esc отменяет ввод, Backspace или Delete очищает комбинацию.',
    reset: 'Сбросить', clear: 'Очистить', record: 'Нажмите клавиши…', unassigned: 'Не назначено',
  },
};

export const HOOKCHART_HOTKEY_GROUP_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  uk: {
    'Загальні': 'Загальні', 'Навігація': 'Навігація', 'Графік': 'Графік',
    'Інструменти малювання': 'Інструменти малювання', 'Відображення даних': 'Відображення даних',
  },
  en: {
    'Загальні': 'General', 'Навігація': 'Navigation', 'Графік': 'Chart',
    'Інструменти малювання': 'Drawing tools', 'Відображення даних': 'Display data',
  },
  pl: {
    'Загальні': 'Ogólne', 'Навігація': 'Nawigacja', 'Графік': 'Wykres',
    'Інструменти малювання': 'Narzędzia rysowania', 'Відображення даних': 'Wyświetlanie danych',
  },
  ru: {
    'Загальні': 'Общие', 'Навігація': 'Навигация', 'Графік': 'График',
    'Інструменти малювання': 'Инструменты рисования', 'Відображення даних': 'Отображение данных',
  },
};

export const HOOKCHART_HOTKEY_ACTION_LABELS: Record<Exclude<SupportedLanguage, 'uk'>, Record<HookChartHotkeyAction, string>> = {
  en: {
    cancel: 'Cancel drawing / close dialog', copyTicker: 'Copy current ticker',
    openWindow: 'Open current coin in a new window', openMetaScalp: 'Open coin in MetaScalp',
    deleteCoin: 'Remove current coin', toggleFavorites: 'Show / hide favorites',
    prevCoin: 'Previous coin', nextCoin: 'Next coin', prevChart: 'Previous chart',
    nextChart: 'Next chart', prevTf: 'Previous timeframe', nextTf: 'Next timeframe',
    prevTfAll: 'Previous timeframe for all charts', nextTfAll: 'Next timeframe for all charts',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', tempRuler: 'Temporary ruler',
    erase: 'Toggle erase drawings', signalLevel: 'Signal level',
    clearAlerts: 'Remove all price alerts', ray: 'Ray', level: 'Horizontal line',
    fib: 'Fibonacci', trend: 'Trend line',
    toggleDensity: 'Show / hide BID/ASK densities', toggleLiquidations: 'Show / hide liquidations',
    toggleLiqCandleSums: 'Show / hide liquidation amounts below candles',
    toggleMarketPrintSums: 'Show / hide large executed trades below candles',
    toggleMagnifier: 'Toggle cursor magnifier (middle mouse works separately)',
  },
  pl: {
    cancel: 'Anuluj rysowanie / zamknij okno', copyTicker: 'Kopiuj symbol monety',
    openWindow: 'Otwórz monetę w nowym oknie', openMetaScalp: 'Otwórz monetę w MetaScalp',
    deleteCoin: 'Usuń monetę', toggleFavorites: 'Pokaż / ukryj ulubione',
    prevCoin: 'Poprzednia moneta', nextCoin: 'Następna moneta', prevChart: 'Poprzedni wykres',
    nextChart: 'Następny wykres', prevTf: 'Poprzedni interwał', nextTf: 'Następny interwał',
    prevTfAll: 'Poprzedni interwał wszystkich wykresów', nextTfAll: 'Następny interwał wszystkich wykresów',
    zoomIn: 'Przybliż', zoomOut: 'Oddal', tempRuler: 'Tymczasowa linijka',
    erase: 'Przełącz wymazywanie rysunków', signalLevel: 'Poziom sygnału',
    clearAlerts: 'Usuń wszystkie alerty cenowe', ray: 'Promień', level: 'Linia pozioma',
    fib: 'Fibonacci', trend: 'Linia trendu',
    toggleDensity: 'Pokaż / ukryj skupiska BID/ASK', toggleLiquidations: 'Pokaż / ukryj likwidacje',
    toggleLiqCandleSums: 'Pokaż / ukryj kwoty likwidacji pod świecami',
    toggleMarketPrintSums: 'Pokaż / ukryj duże transakcje pod świecami',
    toggleMagnifier: 'Przełącz lupę kursora (środkowy przycisk myszy działa oddzielnie)',
  },
  ru: {
    cancel: 'Отменить рисование / закрыть окно', copyTicker: 'Скопировать тикер',
    openWindow: 'Открыть монету в новом окне', openMetaScalp: 'Открыть монету в MetaScalp',
    deleteCoin: 'Удалить монету', toggleFavorites: 'Показать / скрыть избранное',
    prevCoin: 'Предыдущая монета', nextCoin: 'Следующая монета', prevChart: 'Предыдущий график',
    nextChart: 'Следующий график', prevTf: 'Предыдущий таймфрейм', nextTf: 'Следующий таймфрейм',
    prevTfAll: 'Предыдущий таймфрейм всех графиков', nextTfAll: 'Следующий таймфрейм всех графиков',
    zoomIn: 'Увеличить масштаб', zoomOut: 'Уменьшить масштаб', tempRuler: 'Временная линейка',
    erase: 'Переключить стирание фигур', signalLevel: 'Сигнальный уровень',
    clearAlerts: 'Удалить ценовые оповещения', ray: 'Луч', level: 'Горизонтальная линия',
    fib: 'Фибоначчи', trend: 'Трендовая линия',
    toggleDensity: 'Показать / скрыть плотности BID/ASK', toggleLiquidations: 'Показать / скрыть ликвидации',
    toggleLiqCandleSums: 'Показать / скрыть суммы ликвидаций под свечами',
    toggleMarketPrintSums: 'Показать / скрыть крупные сделки под свечами',
    toggleMagnifier: 'Переключить лупу курсора (средняя кнопка мыши работает отдельно)',
  },
};

export function hotkeyGroupLabel(language: SupportedLanguage, original: string): string {
  return HOOKCHART_HOTKEY_GROUP_LABELS[language][original] ?? original;
}
export function hotkeyActionLabel(
  language: SupportedLanguage, action: HookChartHotkeyAction, ukrainianLabel: string,
): string {
  return language === 'uk' ? ukrainianLabel : HOOKCHART_HOTKEY_ACTION_LABELS[language][action];
}
