/** Reviewed four-language UI strings for HookChart visual settings and profile preview. */
import type { SupportedLanguage } from './types';
export const profileChartVisualRows: readonly (readonly [string, string, string, string])[] = [
  [
    "Скрінер · Швидкий перегляд",
    "Screener · Quick preview",
    "Скринер · Быстрый просмотр",
    "Skaner · Szybki podgląd"
  ],
  [
    "Скрінер · Повний графік",
    "Screener · Full chart",
    "Скринер · Полный график",
    "Skaner · Pełny wykres"
  ],
  [
    "Формації · Швидкий перегляд",
    "Patterns · Quick preview",
    "Формации · Быстрый просмотр",
    "Formacje · Szybki podgląd"
  ],
  [
    "Формації · Повний графік",
    "Patterns · Full chart",
    "Формации · Полный график",
    "Formacje · Pełny wykres"
  ],
  [
    "Термінал · Великий графік",
    "Terminal · Large chart",
    "Терминал · Большой график",
    "Terminal · Duży wykres"
  ],
  [
    "Термінал · Середній графік",
    "Terminal · Medium chart",
    "Терминал · Средний график",
    "Terminal · Średni wykres"
  ],
  [
    "Термінал · Компактний графік",
    "Terminal · Compact chart",
    "Терминал · Компактный график",
    "Terminal · Kompaktowy wykres"
  ],
  [
    "Швидкий перегляд",
    "Quick preview",
    "Быстрый просмотр",
    "Szybki podgląd"
  ],
  [
    "Повний графік",
    "Full chart",
    "Полный график",
    "Pełny wykres"
  ],
  [
    "Штучні свічки · без підключень до бірж",
    "Synthetic candles · no exchange connections",
    "Искусственные свечи · без подключения к биржам",
    "Sztuczne świece · bez połączeń z giełdami"
  ],
  [
    "Маленький штучний графік для попереднього перегляду масштабу та відступів",
    "Small synthetic chart preview for zoom and spacing",
    "Мини-график с искусственными свечами для просмотра масштаба и отступов",
    "Miniwykres ze sztucznymi świecami do podglądu skali i odstępów"
  ],
  [
    "Масштаб",
    "Scale",
    "Масштаб",
    "Skala"
  ],
  [
    "бар.",
    "bars",
    "бар.",
    "sł."
  ],
  [
    "барів",
    "bars",
    "баров",
    "słupków"
  ],
  [
    "видимих барів · умовний ціновий діапазон",
    "visible bars · illustrative price range",
    "видимых баров · условный ценовой диапазон",
    "widocznych słupków · przykładowy zakres cen"
  ],
  [
    "Вільний простір праворуч:",
    "Free space on the right:",
    "Свободное место справа:",
    "Wolne miejsce po prawej:"
  ],
  [
    "% ширини схеми",
    "% of preview width",
    "% ширины схемы",
    "% szerokości podglądu"
  ],
  [
    "Це схематичний перегляд. Під час зміни повзунка підсвічена зона та кількість вільних барів оновлюються одразу. На реальному HookChart масштаб залежить від ширини екрана й обраного типу графіка.",
    "This is a schematic preview. Moving the slider immediately updates the highlighted area and free bars. In the live HookChart, scale also depends on screen width and chart type.",
    "Это схематический предварительный просмотр. При движении ползунка подсвеченная область и количество свободных баров обновляются сразу. На реальном HookChart масштаб также зависит от ширины экрана и типа графика.",
    "To schematyczny podgląd. Przesunięcie suwaka natychmiast aktualizuje podświetlony obszar i liczbę wolnych słupków. W rzeczywistym HookChart skala zależy też od szerokości ekranu i rodzaju wykresu."
  ],
  [
    "HookChart підлаштовує діапазон цін під видимі свічки. Вимкніть для ручного вертикального зуму. У Терміналі глобальний автомасштаб свічок, якщо увімкнений, має пріоритет над цим перемикачем.",
    "HookChart adjusts the price range to visible candles. Turn this off to zoom vertically by hand. In Terminal, the global candle autoscale takes priority if enabled.",
    "HookChart подбирает диапазон цен по видимым свечам. Выключите для ручного вертикального масштаба. В Терминале общий автомасштаб свечей имеет приоритет, если включён.",
    "HookChart dopasowuje zakres cen do widocznych świec. Wyłącz, aby ręcznie zmieniać skalę pionową. W Terminalu globalne automatyczne skalowanie świec ma pierwszeństwo, jeśli jest włączone."
  ],
  [
    "Автоматично для вибраної монети: 4× типова заявка, ≥25% локальної ліквідності та ≥50% зустрічного потоку за 5 хвилин. Множник змінює базовий поріг; без угод розрахунок використовує стакан.",
    "For the selected coin, the automatic baseline is 4× a typical order, ≥25% of local liquidity and ≥50% of opposing flow over 5 minutes. The multiplier adjusts this baseline; without trades, the calculation uses the order book.",
    "Для выбранной монеты автоматическая база: 4× типичная заявка, ≥25% локальной ликвидности и ≥50% встречного потока за 5 минут. Множитель изменяет базовый порог; без сделок расчёт использует стакан.",
    "Dla wybranej monety wartość bazowa AUTO to 4× typowe zlecenie, ≥25% lokalnej płynności i ≥50% przeciwnego przepływu w ciągu 5 minut. Mnożnik zmienia ten próg; bez transakcji obliczenia korzystają z arkusza zleceń."
  ],
  [
    "Пояснення:",
    "Explanation:",
    "Пояснение:",
    "Wyjaśnienie:"
  ],
  [
    "Ця функція ще не реалізована.",
    "This feature is not implemented yet.",
    "Эта функция ещё не реализована.",
    "Ta funkcja nie została jeszcze wdrożona."
  ],
  [
    "Ще не реалізовано",
    "Not implemented yet",
    "Ещё не реализовано",
    "Jeszcze nie wdrożono"
  ],
  [
    "Повторити",
    "Retry",
    "Повторить",
    "Ponów"
  ],
  [
    "Завантажено:",
    "Loaded:",
    "Загружено:",
    "Wczytano:"
  ],
  [
    "· Підвантаження старіших свічок…",
    "· Loading older candles…",
    "· Загрузка более старых свечей…",
    "· Wczytywanie starszych świec…"
  ],
  [
    "· API не повернув старіших свічок.",
    "· API returned no older candles.",
    "· API не вернул более старых свечей.",
    "· API nie zwróciło starszych świec."
  ],
  [
    "· Не вдалося завантажити всю історію.",
    "· Could not load the full history.",
    "· Не удалось загрузить всю историю.",
    "· Nie udało się wczytać całej historii."
  ]
];
export const profileChartVisualPhrases: Record<SupportedLanguage, Record<string,string>> = {uk:{},en:{},ru:{},pl:{}};
for (const [uk,en,ru,pl] of profileChartVisualRows) {
  profileChartVisualPhrases.uk[uk]=uk;
  profileChartVisualPhrases.en[uk]=en;
  profileChartVisualPhrases.ru[uk]=ru;
  profileChartVisualPhrases.pl[uk]=pl;
}
