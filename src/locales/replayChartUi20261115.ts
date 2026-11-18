/** Readable chart, controls and training instructions for Replay (all four languages). */
import type { SupportedLanguage } from './types';
export const replayChartUiRows = [
  [
    "page.heading",
    "Тестування на реальному ринку",
    "Real Market Practice",
    "Тестирование на реальном рынке",
    "Ćwiczenia na realnym rynku"
  ],
  [
    "page.intro",
    "Практикуйте рішення на реальних історичних свічках без підглядання в майбутнє. Угоди тут навчальні, без реальних коштів.",
    "Practice decisions on real historical candles without seeing future data. Trades are simulated and use no real funds.",
    "Тренируйтесь на реальных исторических свечах, не заглядывая в будущее. Сделки учебные, без реальных денег.",
    "Ćwicz podejmowanie decyzji na rzeczywistych świecach historycznych bez podglądania przyszłości. Transakcje są symulowane, bez prawdziwych środków."
  ],
  [
    "page.hotkeys",
    "Гарячі клавіші відтворення",
    "Replay keyboard shortcuts",
    "Горячие клавиши воспроизведения",
    "Skróty klawiszowe odtwarzania"
  ],
  [
    "page.space",
    "Пробіл",
    "Space",
    "Пробел",
    "Spacja"
  ],
  [
    "page.playPause",
    "Відтворити / Пауза",
    "Play / Pause",
    "Воспроизвести / Пауза",
    "Odtwarzaj / Pauza"
  ],
  [
    "page.step",
    "+1 свічка",
    "+1 candle",
    "+1 свеча",
    "+1 świeca"
  ],
  [
    "page.retry",
    "Спробувати іншу дату",
    "Try another date",
    "Попробовать другую дату",
    "Wypróbuj inną datę"
  ],
  [
    "speed.title",
    "Швидкість відтворення",
    "Playback speed",
    "Скорость воспроизведения",
    "Szybkość odtwarzania"
  ],
  [
    "speed.label",
    "Швидкість",
    "Speed",
    "Скорость",
    "Szybkość"
  ],
  [
    "speed.choose",
    "Вибрати швидкість відтворення",
    "Choose playback speed",
    "Выбрать скорость воспроизведения",
    "Wybierz szybkość odtwarzania"
  ],
  [
    "chart.entryLine",
    "Вхід {{side}}: {{price}}",
    "Entry {{side}}: {{price}}",
    "Вход {{side}}: {{price}}",
    "Wejście {{side}}: {{price}}"
  ],
  [
    "chart.fullscreenDialog",
    "Повноекранний графік відтворення",
    "Fullscreen replay chart",
    "Полноэкранный график воспроизведения",
    "Pełnoekranowy wykres odtwarzania"
  ],
  [
    "chart.mode",
    "РЕЖИМ ВІДТВОРЕННЯ",
    "REPLAY MODE",
    "РЕЖИМ ВОСПРОИЗВЕДЕНИЯ",
    "TRYB ODTWARZANIA"
  ],
  [
    "chart.autoFocus",
    "🎯 Автофокус на свічках",
    "🎯 Auto-focus on candles",
    "🎯 Автофокус на свечах",
    "🎯 Automatyczne wyśrodkowanie świec"
  ],
  [
    "chart.ohlc",
    "Ціни відкриття, максимуму, мінімуму й закриття свічки",
    "Candle open, high, low and close prices",
    "Цены открытия, максимума, минимума и закрытия свечи",
    "Ceny otwarcia, maksimum, minimum i zamknięcia świecy"
  ],
  [
    "chart.screenshot",
    "Завантажити скриншот графіка (PNG)",
    "Download chart screenshot (PNG)",
    "Скачать снимок графика (PNG)",
    "Pobierz zrzut ekranu wykresu (PNG)"
  ],
  [
    "chart.fit",
    "Масштабувати графік (Fit Content)",
    "Fit chart to content",
    "Масштабировать график по содержимому",
    "Dopasuj wykres do danych"
  ],
  [
    "chart.exitFullscreen",
    "Вийти з повного екрана",
    "Exit fullscreen",
    "Выйти из полноэкранного режима",
    "Wyjdź z pełnego ekranu"
  ],
  [
    "chart.fullscreen",
    "Повний екран",
    "Fullscreen",
    "Полный экран",
    "Pełny ekran"
  ],
  [
    "chart.expand",
    "Розгорнути графік на весь екран",
    "Expand chart to fullscreen",
    "Развернуть график на весь экран",
    "Rozwiń wykres na pełny ekran"
  ],
  [
    "chart.timeframe",
    "Таймфрейм відтворення",
    "Replay timeframe",
    "Таймфрейм воспроизведения",
    "Interwał odtwarzania"
  ],
  [
    "chart.timeframeValue",
    "Таймфрейм {{tf}}",
    "Timeframe {{tf}}",
    "Таймфрейм {{tf}}",
    "Interwał {{tf}}"
  ],
  [
    "actions.group",
    "Повноекранне керування відтворенням",
    "Fullscreen replay controls",
    "Полноэкранное управление воспроизведением",
    "Sterowanie odtwarzaniem na pełnym ekranie"
  ],
  [
    "actions.pauseTitle",
    "Пауза (Пробіл)",
    "Pause (Space)",
    "Пауза (Пробел)",
    "Pauza (Spacja)"
  ],
  [
    "actions.playTitle",
    "Відтворити (Пробіл)",
    "Play (Space)",
    "Воспроизвести (Пробел)",
    "Odtwarzaj (Spacja)"
  ],
  [
    "actions.pause",
    "Пауза",
    "Pause",
    "Пауза",
    "Pauza"
  ],
  [
    "actions.play",
    "Відтворити",
    "Play",
    "Воспроизвести",
    "Odtwarzaj"
  ],
  [
    "actions.stepTitle",
    "+1 свічка (→)",
    "+1 candle (→)",
    "+1 свеча (→)",
    "+1 świeca (→)"
  ],
  [
    "actions.step",
    "+1 свічка",
    "+1 candle",
    "+1 свеча",
    "+1 świeca"
  ],
  [
    "actions.random",
    "Випадкова дата",
    "Random date",
    "Случайная дата",
    "Losowa data"
  ],
  [
    "history.title",
    "Показати доступну історію до початку відтворення (лише кеш)",
    "Show available history before replay (cache only)",
    "Показать доступную историю до начала воспроизведения (только кеш)",
    "Pokaż dostępną historię sprzed odtwarzania (tylko pamięć podręczna)"
  ],
  [
    "history.hide",
    "Повернути звичайний масштаб відтворення",
    "Return to normal replay zoom",
    "Вернуть обычный масштаб воспроизведения",
    "Przywróć normalną skalę odtwarzania"
  ],
  [
    "history.noExtra",
    "Старіших свічок у спільному кеші немає. Показано всю вже завантажену історію.",
    "No earlier candles in the shared cache. Showing all previously loaded history.",
    "В общем кеше нет более ранних свечей. Показана вся загруженная история.",
    "W pamięci podręcznej nie ma wcześniejszych świec. Pokazano całą załadowaną historię."
  ],
  [
    "history.unavailable",
    "Спільний кеш тимчасово недоступний. Показано вже завантажені свічки без запитів до біржі.",
    "Shared cache is temporarily unavailable. Showing loaded candles without exchange requests.",
    "Общий кеш временно недоступен. Показаны загруженные свечи без запросов к бирже.",
    "Wspólna pamięć podręczna jest chwilowo niedostępna. Pokazano załadowane świece bez zapytań do giełdy."
  ],
] as const;
const languages: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const replayChartUiStrings = Object.fromEntries(languages.map((language, index) => [
  language, Object.fromEntries(replayChartUiRows.map(row => ['replay.chart.' + row[0], row[index + 1]])),
])) as Record<SupportedLanguage, Record<string, string>>;
