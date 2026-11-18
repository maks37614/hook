/** Exact UI phrases missing from the existing catalogs in the 2026-11-14 audit.
 * Keep terminology and numeric thresholds unchanged across locales.
 */
import type { SupportedLanguage } from './types';

const phraseRows = [
  [
    "На весь екран",
    "Fullscreen",
    "На весь экран",
    "Pełny ekran"
  ],
  [
    "← Назад",
    "← Back",
    "← Назад",
    "← Wstecz"
  ],
  [
    "Далі →",
    "Next →",
    "Далее →",
    "Dalej →"
  ],
  [
    "Тестування на реальному ринку",
    "Historical market practice",
    "Тестирование на реальном рынке",
    "Trening na rynku historycznym"
  ],
  [
    "Практикуйте рішення на реальних історичних свічках без підглядання в майбутнє. Угоди тут навчальні, без реальних коштів.",
    "Practise decisions on real historical candles without seeing the future. Trades are simulated; no real money is used.",
    "Практикуйте принятие решений на реальных исторических свечах, не заглядывая в будущее. Сделки учебные, без реальных денег.",
    "Ćwicz decyzje na prawdziwych świecach historycznych bez podglądania przyszłości. Transakcje są symulowane, bez prawdziwych pieniędzy."
  ],
  [
    "Пробіл",
    "Space",
    "Пробел",
    "Spacja"
  ],
  [
    "Відтворити / Пауза",
    "Play / Pause",
    "Воспроизвести / Пауза",
    "Odtwórz / Pauza"
  ],
  [
    "+1 свічка",
    "+1 candle",
    "+1 свеча",
    "+1 świeca"
  ],
  [
    "Гарячі клавіші відтворення",
    "Replay keyboard shortcuts",
    "Горячие клавиши воспроизведения",
    "Skróty klawiszowe odtwarzania"
  ],
  [
    "Спробувати іншу дату",
    "Try another date",
    "Попробовать другую дату",
    "Spróbuj innej daty"
  ],
  [
    "Стеження за монетами",
    "Coin monitoring",
    "Мониторинг монет",
    "Monitorowanie monet"
  ],
  [
    "Щільності DOM",
    "Order-book liquidity walls",
    "Плотности стакана",
    "Ściany płynności w arkuszu"
  ],
  [
    "Бектест ретесту підтримки на історичних свічках",
    "Support retest backtest on historical candles",
    "Бэктест ретеста поддержки на исторических свечах",
    "Backtest retestu wsparcia na świecach historycznych"
  ],
  [
    "Медіана росту 4h",
    "Median 4h gain",
    "Медианный рост за 4ч",
    "Mediana wzrostu 4h"
  ],
  [
    "Медіана падіння 4h",
    "Median 4h decline",
    "Медианное падение за 4ч",
    "Mediana spadku 4h"
  ],
  [
    "Завантаження налаштувань графіка…",
    "Loading chart settings…",
    "Загрузка настроек графика…",
    "Ładowanie ustawień wykresu…"
  ],
  [
    "Завантаження налаштувань пошуку…",
    "Loading search settings…",
    "Загрузка настроек поиска…",
    "Ładowanie ustawień wyszukiwania…"
  ],
  [
    "Завантаження налаштувань інтерфейсу…",
    "Loading interface settings…",
    "Загрузка настроек интерфейса…",
    "Ładowanie ustawień interfejsu…"
  ],
  [
    "Завантаження конструктора…",
    "Loading constructor…",
    "Загрузка конструктора…",
    "Ładowanie kreatora…"
  ],
  [
    "Програма h00k",
    "h00k desktop app",
    "Программа h00k",
    "Aplikacja h00k"
  ],
  [
    "Особисті правила формацій, дотики максимумів/мінімумів свічок, візуальний графік",
    "Personal pattern rules, candle high/low touches and chart display",
    "Личные правила формаций, касания максимумов/минимумов свечей и отображение графика",
    "Własne reguły formacji, dotknięcia maksimów/minimów świec i wygląd wykresu"
  ],
  [
    "Безпека та активні сеанси",
    "Security and active sessions",
    "Безопасность и активные сеансы",
    "Bezpieczeństwo i aktywne sesje"
  ],
  [
    "Завершуйте невідомі сеанси. Список завантажується тільки під час відкриття.",
    "Sign out of unfamiliar sessions. The list loads only when opened.",
    "Завершайте неизвестные сеансы. Список загружается только при открытии.",
    "Wyloguj nieznane sesje. Lista ładuje się dopiero po otwarciu."
  ],
  [
    "4 сетапи · 19 тематичних розділів",
    "4 setups · 19 topic sections",
    "4 сетапа · 19 тематических разделов",
    "4 setupy · 19 sekcji tematycznych"
  ],
  [
    "Правила",
    "Rules",
    "Правила",
    "Zasady"
  ],
  [
    "6 тематичних розділів · графічні приклади",
    "6 topic sections · illustrated examples",
    "6 тематических разделов · примеры на графиках",
    "6 sekcji tematycznych · przykłady na wykresach"
  ],
  [
    "Відкритий інтерес · 7 розділів",
    "Open interest · 7 sections",
    "Открытый интерес · 7 разделов",
    "Open interest · 7 sekcji"
  ],
  [
    "Завантажуємо матеріали Котапича…",
    "Loading Kotapych materials…",
    "Загружаем материалы Котапыча…",
    "Ładowanie materiałów Kotapych…"
  ],
  [
    "Завантажуємо правила…",
    "Loading rules…",
    "Загружаем правила…",
    "Ładowanie zasad…"
  ],
  [
    "Завантажуємо матеріали про Open Interest…",
    "Loading Open Interest materials…",
    "Загружаем материалы об открытом интересе…",
    "Ładowanie materiałów o Open Interest…"
  ],
  [
    "Якість сетапу",
    "Setup quality",
    "Качество сетапа",
    "Jakość setupu"
  ],
  [
    "Сценарій без підтвердження другого екстремуму та пробою. Рівні прогнозні, не торгові ордери.",
    "Scenario without confirmation of the second extreme or breakout. Levels are estimates, not trading orders.",
    "Сценарий без подтверждения второго экстремума и пробоя. Уровни прогнозные, а не торговые ордера.",
    "Scenariusz bez potwierdzenia drugiego ekstremum i wybicia. Poziomy są szacunkowe, nie są zleceniami."
  ],
  [
    "Завантаження свічок з біржі…",
    "Loading candles from exchange…",
    "Загрузка свечей с биржи…",
    "Ładowanie świec z giełdy…"
  ],
  [
    "Ранній вхід розглядається лише за наявності відскоку або відбою. Підтвердження оцінює основний сканер.",
    "An early entry is considered only after a bounce or rejection. The main scanner assesses confirmation.",
    "Ранний вход рассматривается только при отскоке или отбое. Подтверждение оценивает основной сканер.",
    "Wczesne wejście rozważa się tylko po odbiciu lub odrzuceniu. Potwierdzenie ocenia główny skaner."
  ],
  [
    "Попередній сценарій, не підтверджений сигнал",
    "Preliminary scenario, not a confirmed signal",
    "Предварительный сценарий, не подтверждённый сигнал",
    "Wstępny scenariusz, niepotwierdzony sygnał"
  ],
  [
    "Мітки",
    "Labels",
    "Метки",
    "Etykiety"
  ],
  [
    "Language / Мова",
    "Language",
    "Язык",
    "Język"
  ],
  [
    "Напрямок W/M",
    "W/M direction",
    "Направление W/M",
    "Kierunek W/M"
  ],
  [
    "Стадія",
    "Stage",
    "Стадия",
    "Etap"
  ],
  [
    "Очікує пробою",
    "Awaiting breakout",
    "Ожидает пробоя",
    "Oczekuje na wybicie"
  ],
  [
    "Ціль досягнуто",
    "Target reached",
    "Цель достигнута",
    "Cel osiągnięty"
  ],
  [
    "ATR (14) · % ціни",
    "ATR (14) · % of price",
    "ATR (14) · % цены",
    "ATR (14) · % ceny"
  ],
  [
    "Будь-яка волатильність",
    "Any volatility",
    "Любая волатильность",
    "Dowolna zmienność"
  ],
  [
    "Низька: менше 0,5%",
    "Low: below 0.5%",
    "Низкая: менее 0,5%",
    "Niska: poniżej 0,5%"
  ],
  [
    "Помірна: 0,5–1,5%",
    "Moderate: 0.5–1.5%",
    "Умеренная: 0,5–1,5%",
    "Umiarkowana: 0,5–1,5%"
  ],
  [
    "Висока: 1,5–3%",
    "High: 1.5–3%",
    "Высокая: 1,5–3%",
    "Wysoka: 1,5–3%"
  ],
  [
    "Дуже висока: від 3%",
    "Very high: 3% or more",
    "Очень высокая: от 3%",
    "Bardzo wysoka: od 3%"
  ],
  [
    "RVOL · обсяг свічки пробою",
    "RVOL · breakout candle volume",
    "RVOL · объём свечи пробоя",
    "RVOL · wolumen świecy wybicia"
  ],
  [
    "Будь-який · без вимоги пробою",
    "Any · breakout not required",
    "Любой · пробой не обязателен",
    "Dowolny · wybicie niewymagane"
  ],
  [
    "Від 1,0×",
    "From 1.0×",
    "От 1,0×",
    "Od 1,0×"
  ],
  [
    "Від 1,2×",
    "From 1.2×",
    "От 1,2×",
    "Od 1,2×"
  ],
  [
    "Від 1,5×",
    "From 1.5×",
    "От 1,5×",
    "Od 1,5×"
  ],
  [
    "Від 2,0×",
    "From 2.0×",
    "От 2,0×",
    "Od 2,0×"
  ],
  [
    "RSI (14) · остання закрита свічка",
    "RSI (14) · last closed candle",
    "RSI (14) · последняя закрытая свеча",
    "RSI (14) · ostatnia zamknięta świeca"
  ],
  [
    "Будь-який RSI",
    "Any RSI",
    "Любой RSI",
    "Dowolne RSI"
  ],
  [
    "Перепроданість: менше 30",
    "Oversold: below 30",
    "Перепроданность: ниже 30",
    "Wyprzedanie: poniżej 30"
  ],
  [
    "Слабкість: 30–45",
    "Weakness: 30–45",
    "Слабость: 30–45",
    "Słabość: 30–45"
  ],
  [
    "Нейтральний: 45–55",
    "Neutral: 45–55",
    "Нейтральный: 45–55",
    "Neutralnie: 45–55"
  ],
  [
    "Сила: 55–70",
    "Strength: 55–70",
    "Сила: 55–70",
    "Siła: 55–70"
  ],
  [
    "Перекупленість: від 70",
    "Overbought: 70 or higher",
    "Перекупленность: от 70",
    "Wykupienie: od 70"
  ],
  [
    "Open Interest · Δ за TF (ф'ючерси)",
    "Open Interest · Δ by timeframe (futures)",
    "Открытый интерес · Δ по таймфрейму (фьючерсы)",
    "Open Interest · Δ wg interwału (kontrakty)"
  ],
  [
    "Не враховувати OI",
    "Ignore OI",
    "Не учитывать OI",
    "Nie uwzględniaj OI"
  ],
  [
    "Зростання OI ≥ 1%",
    "OI increase ≥ 1%",
    "Рост OI ≥ 1%",
    "Wzrost OI ≥ 1%"
  ],
  [
    "Падіння OI ≤ −1%",
    "OI decrease ≤ −1%",
    "Падение OI ≤ −1%",
    "Spadek OI ≤ −1%"
  ],
  [
    "Стабільний OI: від −1% до +1%",
    "Stable OI: −1% to +1%",
    "Стабильный OI: от −1% до +1%",
    "Stabilne OI: od −1% do +1%"
  ],
  [
    "Дельта · остання свічка (Binance)",
    "Delta · last candle (Binance)",
    "Дельта · последняя свеча (Binance)",
    "Delta · ostatnia świeca (Binance)"
  ],
  [
    "Не враховувати дельту",
    "Ignore delta",
    "Не учитывать дельту",
    "Nie uwzględniaj delty"
  ],
  [
    "Перевага покупців: більше 0%",
    "Buyer dominance: above 0%",
    "Преобладание покупателей: выше 0%",
    "Przewaga kupujących: powyżej 0%"
  ],
  [
    "Перевага продавців: менше 0%",
    "Seller dominance: below 0%",
    "Преобладание продавцов: ниже 0%",
    "Przewaga sprzedających: poniżej 0%"
  ],
  [
    "Сильні покупки: від +20%",
    "Strong buying: +20% or more",
    "Сильные покупки: от +20%",
    "Silne zakupy: od +20%"
  ],
  [
    "Сильні продажі: до −20%",
    "Strong selling: −20% or less",
    "Сильные продажи: до −20%",
    "Silna sprzedaż: do −20%"
  ],
  [
    "CVD · останні 20 свічок (Binance)",
    "CVD · last 20 candles (Binance)",
    "CVD · последние 20 свечей (Binance)",
    "CVD · ostatnie 20 świec (Binance)"
  ],
  [
    "Не враховувати CVD",
    "Ignore CVD",
    "Не учитывать CVD",
    "Nie uwzględniaj CVD"
  ],
  [
    "Додатна накопичена дельта",
    "Positive cumulative delta",
    "Положительная накопленная дельта",
    "Dodatnia delta skumulowana"
  ],
  [
    "Від'ємна накопичена дельта",
    "Negative cumulative delta",
    "Отрицательная накопленная дельта",
    "Ujemna delta skumulowana"
  ],
  [
    "Що саме відстежувати",
    "What to monitor",
    "Что отслеживать",
    "Co monitorować"
  ],
  [
    "Усі таймфрейми",
    "All timeframes",
    "Все таймфреймы",
    "Wszystkie interwały"
  ],
  [
    "Пороги спрацювання",
    "Trigger thresholds",
    "Пороги срабатывания",
    "Progi wyzwalania"
  ],
  [
    "Імпульси та ліквідації — монета",
    "Impulses and liquidations — coin",
    "Импульсы и ликвидации — монета",
    "Impulsy i likwidacje — moneta"
  ],
  [
    "1 хвилина",
    "1 minute",
    "1 минута",
    "1 minuta"
  ],
  [
    "Як отримувати",
    "How to receive",
    "Как получать",
    "Sposób otrzymywania"
  ],
  [
    "Дзвін",
    "Bell",
    "Звонок",
    "Dzwonek"
  ],
  [
    "М’який",
    "Soft",
    "Мягкий",
    "Delikatny"
  ],
  [
    "Подвійний імпульс",
    "Double pulse",
    "Двойной импульс",
    "Podwójny impuls"
  ],
  [
    "Моя мелодія",
    "My ringtone",
    "Моя мелодия",
    "Moja melodia"
  ],
  [
    "Звукове сповіщення",
    "Sound notification",
    "Звуковое уведомление",
    "Powiadomienie dźwiękowe"
  ],
  [
    "Сповіщення браузера, якщо вкладка згорнута",
    "Browser notification when the tab is in the background",
    "Уведомление браузера, если вкладка свёрнута",
    "Powiadomienie przeglądarki, gdy karta jest w tle"
  ],
  [
    "Зміни зберігаються автоматично",
    "Changes save automatically",
    "Изменения сохраняются автоматически",
    "Zmiany zapisują się automatycznie"
  ],
  [
    "Пошук монет у Скрінері",
    "Coin search in Screener",
    "Поиск монет в Скринере",
    "Wyszukiwanie monet w Skanerze"
  ],
  [
    "Розширені фільтри пошуку",
    "Advanced search filters",
    "Расширенные фильтры поиска",
    "Zaawansowane filtry wyszukiwania"
  ],
  [
    "Тільки монети з формаціями",
    "Only coins with patterns",
    "Только монеты с формациями",
    "Tylko monety z formacjami"
  ],
  [
    "Не фільтрувати",
    "Do not filter",
    "Не фильтровать",
    "Nie filtruj"
  ],
  [
    "Позитивний (+)",
    "Positive (+)",
    "Положительный (+)",
    "Dodatni (+)"
  ],
  [
    "Негативний (−)",
    "Negative (−)",
    "Отрицательный (−)",
    "Ujemny (−)"
  ],
  [
    "Від 1×",
    "From 1×",
    "От 1×",
    "Od 1×"
  ],
  [
    "Від 2×",
    "From 2×",
    "От 2×",
    "Od 2×"
  ],
  [
    "Від 3×",
    "From 3×",
    "От 3×",
    "Od 3×"
  ],
  [
    "За спаданням ↓",
    "Descending ↓",
    "По убыванию ↓",
    "Malejąco ↓"
  ],
  [
    "За зростанням ↑",
    "Ascending ↑",
    "По возрастанию ↑",
    "Rosnąco ↑"
  ],
  [
    "Без другого показника",
    "No secondary metric",
    "Без второго показателя",
    "Bez drugiego wskaźnika"
  ],
  [
    "Редагувати",
    "Edit",
    "Редактировать",
    "Edytuj"
  ],
  [
    "Зробити стандартним",
    "Set as default",
    "Сделать стандартным",
    "Ustaw jako domyślny"
  ],
  [
    "Початковий показ графіків",
    "Initial chart view",
    "Начальный вид графиков",
    "Początkowy widok wykresów"
  ],
  [
    "Видимі свічки при відкритті",
    "Visible candles on opening",
    "Видимые свечи при открытии",
    "Widoczne świece po otwarciu"
  ],
  [
    "Відступ від шкали ціни праворуч",
    "Right price-scale padding",
    "Отступ от шкалы цен справа",
    "Odstęp od prawej skali cen"
  ],
  [
    "Вертикальний масштаб ціни",
    "Vertical price scale",
    "Вертикальный масштаб цены",
    "Pionowa skala cen"
  ],
  [
    "Автомасштабування ціни при відкритті",
    "Auto-fit price on opening",
    "Автомасштаб цены при открытии",
    "Automatyczne dopasowanie skali cen po otwarciu"
  ],
  [
    "Відтворення свічок",
    "Candle replay",
    "Воспроизведение свечей",
    "Odtwarzanie świec"
  ],
  [
    "🎲 Згенерувати випадкову дату",
    "🎲 Generate a random date",
    "🎲 Сгенерировать случайную дату",
    "🎲 Wylosuj datę"
  ],
  [
    "Лінковка з торговими терміналами",
    "Trading-terminal linking",
    "Связь с торговыми терминалами",
    "Łączenie z terminalami transakcyjnymi"
  ],
  [
    "1. Вибір термінала",
    "1. Choose a terminal",
    "1. Выбор терминала",
    "1. Wybór terminala"
  ],
  [
    "3. Що дозволено передавати",
    "3. What can be sent",
    "3. Что разрешено передавать",
    "3. Co można wysyłać"
  ],
  [
    "4. Групи для різних розділів",
    "4. Groups for different sections",
    "4. Группы для разных разделов",
    "4. Grupy dla różnych sekcji"
  ],
  [
    "5. Автоматизація та захист від випадкових перемикань",
    "5. Automation and accidental-switch protection",
    "5. Автоматизация и защита от случайных переключений",
    "5. Automatyzacja i ochrona przed przypadkowym przełączeniem"
  ],
  [
    "Показати кроки",
    "Show steps",
    "Показать шаги",
    "Pokaż kroki"
  ],
  [
    "Без затримки",
    "No delay",
    "Без задержки",
    "Bez opóźnienia"
  ],
  [
    "0,5 секунди",
    "0.5 seconds",
    "0,5 секунды",
    "0,5 sekundy"
  ],
  [
    "1,2 секунди",
    "1.2 seconds",
    "1,2 секунды",
    "1,2 sekundy"
  ],
  [
    "3 секунди",
    "3 seconds",
    "3 секунды",
    "3 sekundy"
  ],
  [
    "5 секунд",
    "5 seconds",
    "5 секунд",
    "5 sekund"
  ],
  [
    "Лінковка",
    "Terminal linking",
    "Привязка терминала",
    "Łączenie terminala"
  ],
  ["— Відтворити / Пауза","— Play / Pause","— Воспроизвести / Пауза","— Odtwórz / Pauza"],
  ["— +1 свічка","— +1 candle","— +1 свеча","— +1 świeca"],
  ["Використовуються лише вже доступні котирування. Увімкнення сповіщень не запускає додатковий повний скан усіх бірж.","Only available quotes are used. Enabling notifications does not launch another full scan of all exchanges.","Используются только уже доступные котировки. Включение уведомлений не запускает дополнительное полное сканирование всех бирж.","Wykorzystywane są wyłącznie dostępne notowania. Włączenie powiadomień nie uruchamia kolejnego pełnego skanowania wszystkich giełd."],
  ["Виберіть одну монету для WebSocket-потоків. Немає зайвих запитів, поки обидва перемикачі вимкнені.","Select one coin for WebSocket streams. No additional requests are made while both switches are off.","Выберите одну монету для потоков WebSocket. Пока оба переключателя выключены, дополнительные запросы не выполняются.","Wybierz jedną monetę do strumieni WebSocket. Gdy oba przełączniki są wyłączone, nie są wykonywane dodatkowe żądania."],
  ["Імпульси та великі ліквідації працюють лише з відкритою сторінкою. Для ліквідацій використовується ф’ючерсний потік обраної біржі.","Impulses and large liquidations work only while the page is open. Liquidations use the selected exchange's futures stream.","Импульсы и крупные ликвидации работают только при открытой странице. Для ликвидаций используется фьючерсный поток выбранной биржи.","Impulsy i duże likwidacje działają tylko przy otwartej stronie. Likwidacje wykorzystują strumień kontraktów terminowych wybranej giełdy."],
  ["Наприклад, 2 = не далі ніж 2% від максимуму 24г.","For example, 2 means no more than 2% below the 24h high.","Например, 2 означает не дальше чем на 2% от максимума за 24 часа.","Na przykład 2 oznacza odległość nie większą niż 2% od maksimum z 24h."],
  ["Якщо задані обидва рівні, повинні виконуватися обидві умови.","If both limits are set, both conditions must be met.","Если заданы оба уровня, должны выполняться оба условия.","Jeśli ustawiono oba poziomy, oba warunki muszą być spełnione."],
  ["Другий показник визначає порядок лише тоді, коли значення першого однакові. Сортування не створює нових запитів до бірж.","The secondary metric determines order only when the primary values are equal. Sorting makes no new exchange requests.","Второй показатель определяет порядок только при одинаковых значениях первого. Сортировка не создаёт новых запросов к биржам.","Drugi wskaźnik rozstrzyga kolejność tylko przy równych wartościach pierwszego. Sortowanie nie wysyła nowych zapytań do giełd."],
  ["Ще немає збережених пресетів. Створіть перший у редакторі вище.","No saved presets yet. Create the first one in the editor above.","Сохранённых пресетов пока нет. Создайте первый в редакторе выше.","Nie ma jeszcze zapisanych presetów. Utwórz pierwszy w edytorze powyżej."],
  ["Кількість графіків активного пресету змінюється одразу. Більше графіків можуть повільніше працювати на телефоні.","The number of charts in the active preset updates immediately. More charts may run slower on phones.","Количество графиков активного пресета изменяется сразу. Чем больше графиков, тем медленнее они могут работать на телефоне.","Liczba wykresów aktywnego presetu aktualizuje się od razu. Więcej wykresów może działać wolniej na telefonie."],
  ["Пошук працює на вибраному порту та портах 17845–17855. Наявна лінковка MetaScalp збережеться.","Discovery uses the selected port and ports 17845–17855. The existing MetaScalp link will be preserved.","Поиск выполняется на выбранном порту и портах 17845–17855. Существующая привязка MetaScalp сохранится.","Wyszukiwanie działa na wybranym porcie i portach 17845–17855. Istniejące połączenie MetaScalp zostanie zachowane."],
  ["У Tiger потрібно увімкнути локальний сервер сигналів. Покрокова інструкція нижче.","Enable the local signal server in Tiger. See the step-by-step instructions below.","В Tiger необходимо включить локальный сервер сигналов. Пошаговая инструкция ниже.","W Tiger należy włączyć lokalny serwer sygnałów. Instrukcja krok po kroku znajduje się poniżej."],
  ["Vataga підтримує інтеграцію зі скрінерами, але формат локальних команд не оприлюднений. Поки що можливе тільки копіювання тикера. У Vataga увімкніть Налаштування → Загальні → Інше → Інтеграція застосунків і прив’яжіть стакан до скрінера.","Vataga supports screener integration, but its local command format is not public. For now, only copying a ticker is available. In Vataga, enable Settings → General → Other → App integration and link the order book to the screener.","Vataga поддерживает интеграцию со скринерами, но формат локальных команд не опубликован. Пока доступно только копирование тикера. В Vataga включите Настройки → Общие → Другое → Интеграция приложений и привяжите стакан к скринеру.","Vataga obsługuje integrację ze skanerami, ale format lokalnych poleceń nie jest publiczny. Na razie możliwe jest tylko kopiowanie symbolu. W Vataga włącz Ustawienia → Ogólne → Inne → Integracja aplikacji i połącz arkusz zewnętrzny ze skanerem."],
  ["Запустіть MetaScalp на тому самому комп'ютері, де відкрито h00k.top, та підключіть потрібну біржу (Binance або Bybit).","Run MetaScalp on the same computer as h00k.top and connect the required exchange (Binance or Bybit).","Запустите MetaScalp на том же компьютере, где открыт h00k.top, и подключите нужную биржу (Binance или Bybit).","Uruchom MetaScalp na tym samym komputerze co h00k.top i podłącz wybraną giełdę (Binance lub Bybit)."],
  ["У MetaScalp призначте стакану або графіку групу лінковки, наприклад 001 (доступні групи 001–500).","In MetaScalp, assign a link group to the order book or chart, such as 001 (groups 001–500 are available).","В MetaScalp назначьте стакану или графику группу привязки, например 001 (доступны группы 001–500).","W MetaScalp przypisz grupę łączenia do arkusza zleceń lub wykresu, np. 001 (dostępne grupy 001–500)."],
  ["У h00k.top виберіть MetaScalp, введіть ту саму групу та залиште порт 17845, якщо його не змінювали. API запускається разом із MetaScalp; h00k шукає активний порт у діапазоні 17845–17855.","On h00k.top select MetaScalp, enter the same group and keep port 17845 unless you changed it. The API starts with MetaScalp; h00k discovers the active port in the 17845–17855 range.","На h00k.top выберите MetaScalp, укажите ту же группу и оставьте порт 17845, если вы его не меняли. API запускается вместе с MetaScalp; h00k ищет активный порт в диапазоне 17845–17855.","Na h00k.top wybierz MetaScalp, wpisz tę samą grupę i pozostaw port 17845, jeśli go nie zmieniano. API uruchamia się z MetaScalp; h00k szuka aktywnego portu w zakresie 17845–17855."],
  ["Увімкніть лінковку та натисніть «Перевірити з'єднання», потім «Тест BTCUSDT». Переконайтеся, що інструмент змінився у вікнах потрібної групи.","Enable linking and click “Test connection”, then “Test BTCUSDT”. Confirm the instrument changes in the intended group windows.","Включите привязку и нажмите «Проверить соединение», затем «Тест BTCUSDT». Убедитесь, что инструмент изменился в окнах нужной группы.","Włącz łączenie i kliknij „Sprawdź połączenie”, a potem „Test BTCUSDT”. Sprawdź, czy instrument zmienił się w oknach właściwej grupy."],
  ["Запустіть Tiger.com Windows на тому самому комп'ютері, де відкрито h00k.top, та переконайтеся, що потрібні ринки доступні в терміналі.","Run Tiger.com Windows on the same computer as h00k.top and confirm that the required markets are available in the terminal.","Запустите Tiger.com Windows на том же компьютере, где открыт h00k.top, и убедитесь, что нужные рынки доступны в терминале.","Uruchom Tiger.com Windows na tym samym komputerze co h00k.top i upewnij się, że wymagane rynki są dostępne w terminalu."],
  ["У Tiger відкрийте «Настройки» → «Локальный сервер сигналов» → увімкніть «Включить сервер сигналов» → натисніть «Сохранить».","In Tiger, open “Настройки” → “Локальный сервер сигналов”, enable “Включить сервер сигналов” and click “Сохранить”.","В Tiger откройте «Настройки» → «Локальный сервер сигналов», включите «Включить сервер сигналов» и нажмите «Сохранить».","W Tiger otwórz „Настройки” → „Локальный сервер сигналов”, włącz „Включить сервер сигналов” i kliknij „Сохранить”."],
  ["Залиште стандартний порт 7819 або вкажіть однаковий власний порт у Tiger та h00k.top. Опцію «Разрешить торговлю» для лінковки вмикати не потрібно.","Keep the default port 7819 or use the same custom port in Tiger and h00k.top. You do not need to enable the “Разрешить торговлю” option for linking.","Оставьте стандартный порт 7819 или укажите одинаковый собственный порт в Tiger и h00k.top. Для привязки не нужно включать опцию «Разрешить торговлю».","Pozostaw domyślny port 7819 lub ustaw ten sam własny port w Tiger i h00k.top. Do łączenia nie trzeba włączać opcji „Разрешить торговлю”."],
  ["У стакані та/або графіку Tiger виберіть групу лінковки (кольорову літеру A–Z або число 0–18), наприклад A. У h00k.top виберіть ту саму групу.","In Tiger's order book and/or chart select a link group (colored letter A–Z or number 0–18), such as A. Select the same group in h00k.top.","В стакане и/или графике Tiger выберите группу привязки (цветную букву A–Z или число 0–18), например A. На h00k.top выберите ту же группу.","W arkuszu zleceń lub na wykresie Tiger wybierz grupę łączenia (kolorowa litera A–Z lub liczba 0–18), np. A. Wybierz tę samą grupę w h00k.top."],
  ["Увімкніть лінковку, натисніть «Перевірити з'єднання», потім «Тест BTCUSDT» і перевірте зміну інструмента в прив'язаних вікнах Tiger.","Enable linking, click “Test connection”, then “Test BTCUSDT”, and check that the instrument changes in the linked Tiger windows.","Включите привязку, нажмите «Проверить соединение», затем «Тест BTCUSDT» и проверьте смену инструмента в привязанных окнах Tiger.","Włącz łączenie, kliknij „Sprawdź połączenie”, a następnie „Test BTCUSDT”, i sprawdź zmianę instrumentu w powiązanych oknach Tiger."],
  ["Натискання кнопок у вибраних розділах надсилатиме тільки монету, біржу й тип ринку (якщо підтримує термінал). Вимкнені джерела блокуються.","Buttons in selected sections send only the coin, exchange and market type (if supported by the terminal). Disabled sources are blocked.","Нажатие кнопок в выбранных разделах отправляет только монету, биржу и тип рынка (если поддерживается терминалом). Выключенные источники блокируются.","Przyciski w wybranych sekcjach przesyłają tylko monetę, giełdę i typ rynku (jeśli terminal go obsługuje). Wyłączone źródła są blokowane."],
  ["Необов’язково. Порожнє поле означає основну групу термінала.","Optional. An empty field means the terminal's default group.","Необязательно. Пустое поле означает основную группу терминала.","Opcjonalne. Puste pole oznacza główną grupę terminala."],
  ["Якщо вимкнути, працюватимуть тільки кнопки ручної лінковки.","If disabled, only manual linking buttons will work.","Если выключить, будут работать только кнопки ручной привязки.","Po wyłączeniu będą działać tylko przyciski ręcznego łączenia."],
  ["Якщо поріг якості вищий за 0, сигнали без достовірного бала блокуються. Жодні ордери не відкриваються.","If the quality threshold is above 0, signals without a reliable score are blocked. No orders are placed.","Если порог качества выше 0, сигналы без достоверного балла блокируются. Ордера не открываются.","Jeśli próg jakości jest powyżej 0, sygnały bez wiarygodnej oceny są blokowane. Żadne zlecenia nie są składane."],
  ["Енциклопедія формацій & Патернів","Patterns & Formations Encyclopedia","Энциклопедия формаций и паттернов","Encyklopedia formacji i wzorców"],
  ["Правила входу, встановлення стоп-лосу та цілей","Entry rules, stop-losses and targets","Правила входа, установки стоп-лосса и целей","Zasady wejścia, stop-lossy i cele"],
  ["Загальні категорії енциклопедії","Encyclopedia categories","Категории энциклопедии","Kategorie encyklopedii"],
  ["Формації-Патерни","Formations & Patterns","Формации и паттерны","Formacje i wzorce"],
  ["Підкатегорії скальпінгу","Scalping subcategories","Подкатегории скальпинга","Podkategorie scalpingu"],
  ["Точка входу:","Entry point:","Точка входа:","Punkt wejścia:"],
  ["Стоп-лос:","Stop-loss:","Стоп-лосс:","Stop-loss:"],
  ["Тейк-профіт:","Take-profit:","Тейк-профит:","Take-profit:"],
  ["Підтвердження обсягом:","Volume confirmation:","Подтверждение объёмом:","Potwierdzenie wolumenem:"],
  ["Ціна та рівні","Price & Levels","Цена и уровни","Cena i poziomy"],
  ["Стакан та потік","Order Book & Flow","Стакан и поток","Arkusz zleceń i przepływ"],
  ["Формації та Quant","Patterns & Quant","Формации и Quant","Formacje i Quant"],
  ["Особисте та система","Personal & System","Личное и система","Osobiste i system"],
  ["Цінові умови, пробої й психологічні рівні","Price triggers, breakouts and psychological levels","Ценовые условия, пробои и психологические уровни","Warunki cenowe, wybicia i poziomy psychologiczne"],
  ["Реальні потоки угод, ліквідації й ліквідність","Live trade flow, liquidations and liquidity","Реальные потоки сделок, ликвидации и ликвидность","Strumień transakcji, likwidacje i płynność"],
  ["Ранні та підтверджені патерни, оцінка якості","Early and confirmed patterns, quality score","Ранние и подтверждённые паттерны, оценка качества","Wczesne i potwierdzone formacje, ocena jakości"],
  ["Ваші обрані монети, нагляд та стан підключення","Your watchlist, monitoring and connection status","Ваши избранные монеты, мониторинг и состояние подключения","Twoja lista obserwowanych monet, monitoring i stan połączenia"],
  ["Відстань до рівня","Distance to level","Расстояние до уровня","Odległość do poziomu"],
  ["Entry, SL, TP, підтримка та опір","Entry, SL, TP, support and resistance","Entry, SL, TP, поддержка и сопротивление","Entry, SL, TP, wsparcie i opór"],
  ["Відстань до ROUND","Distance to round number","Расстояние до круглого числа","Odległość do okrągłej ceny"],
  ["Максимальна відстань від круглого числа","Maximum distance from a round number","Максимальное расстояние от круглого числа","Maksymalna odległość od okrągłej ceny"],
  ["Аномалія OI","OI anomaly","Аномалия OI","Anomalia OI"],
  ["Модуль зміни Open Interest","Absolute change in Open Interest","Абсолютное изменение Open Interest","Bezwzględna zmiana Open Interest"],
  ["Поріг дисбалансу угод","Trade imbalance threshold","Порог дисбаланса сделок","Próg nierównowagi transakcji"],
  ["Мінімальний RVOL","Minimum RVOL","Минимальный RVOL","Minimalny RVOL"],
  ["Відношення до середнього обсягу","Ratio to average volume","Отношение к среднему объёму","Stosunek do średniego wolumenu"],
  ["Ліквідація від","Liquidation from","Ликвидация от","Likwidacja od"],
  ["Мінімальний розмір однієї події","Minimum value of a single event","Минимальный размер одного события","Minimalna wartość pojedynczego zdarzenia"],
  ["Якість сигналу від","Signal quality from","Качество сигнала от","Jakość sygnału od"],
  ["Для формацій та комплексного аналізу","For patterns and combined analysis","Для формаций и комплексного анализа","Dla formacji i analizy łączonej"],
  ["Крок покращення","Improvement step","Шаг улучшения","Krok poprawy"],
  ["Новий рівень рейтингу якості","New quality rating level","Новый уровень рейтинга качества","Nowy poziom oceny jakości"],
  ["Комплекс: факторів від","Combined: minimum factors","Комплекс: факторов от","Analiza łączona: min. czynników"],
  ["Тільки незалежні наявні підтвердження","Only independent available confirmations","Только независимые доступные подтверждения","Tylko niezależne dostępne potwierdzenia"],
  ["Повтор не частіше","Repeat no more often than","Повторять не чаще","Powtarzaj nie częściej niż"],
  ["Для оновлюваних показників OI / Delta","For updated OI / Delta values","Для обновляемых показателей OI / Delta","Dla aktualizowanych wskaźników OI / Delta"],
  ["балів","points","баллов","punktów"],
  ["із 6","of 6","из 6","z 6"],
  ["хв","min","мин","min"],
  ["Центр сповіщень","Notification Center","Центр уведомлений","Centrum powiadomień"],
  ["Опис сповіщення","Notification description","Описание уведомления","Opis powiadomienia"],
  ["Джерело даних:","Data source:","Источник данных:","Źródło danych:"],
  ["Фільтри біржі, ринку, таймфрейму та монет діють для подій із відповідними даними.","Exchange, market, timeframe and coin filters apply only to events with matching information.","Фильтры биржи, рынка, таймфрейма и монет действуют только для событий с соответствующими данными.","Filtry giełdy, rynku, interwału i monet dotyczą tylko zdarzeń z odpowiednimi danymi."],
  ["Цінові алерти, ліквідації та WebSocket-імпульси не прив’язані до таймфрейму графіка.","Price alerts, liquidations and WebSocket impulses are independent of the chart timeframe.","Ценовые алерты, ликвидации и WebSocket-импульсы не зависят от таймфрейма графика.","Alerty cenowe, likwidacje i impulsy WebSocket nie zależą od interwału wykresu."],
  ["Технічні попередження можуть надходити незалежно від фільтрів монет.","Technical warnings may arrive regardless of coin filters.","Технические предупреждения могут приходить независимо от фильтров монет.","Ostrzeżenia techniczne mogą przychodzić niezależnie od filtrów monet."],
  ["Решта подій без потрібної біржі, ринку або таймфрейму не надходитиме.","Other events without the required exchange, market or timeframe will not be delivered.","Другие события без нужной биржи, рынка или таймфрейма не будут доставляться.","Inne zdarzenia bez wymaganej giełdy, rynku lub interwału nie będą dostarczane."],
  ["Сповіщення обробляються у вашому браузері з уже доступних даних сайту.","Notifications are processed in your browser using available site data.","Уведомления обрабатываются в вашем браузере по уже доступным данным сайта.","Powiadomienia są przetwarzane w przeglądarce na podstawie dostępnych danych strony."],
  ["Додатковий повний пошук монет не запускається. Спочатку увімкніть потрібні категорії.","No additional full coin scan is started. First enable the categories you need.","Дополнительное полное сканирование монет не запускается. Сначала включите нужные категории.","Nie uruchamia się dodatkowe pełne skanowanie monet. Najpierw włącz potrzebne kategorie."],
  ["Цей перемикач керує тільки сповіщеннями та звуком на відкритому h00k.top.","This switch controls only notifications and sounds while h00k.top is open.","Этот переключатель управляет только уведомлениями и звуком на открытом h00k.top.","Ten przełącznik steruje tylko powiadomieniami i dźwiękami przy otwartej stronie h00k.top."],
  ["Він не впливає на цінові алерти або персональний нагляд, налаштовані в інших розділах.","It does not affect price alerts or personal monitoring configured elsewhere.","Он не влияет на ценовые алерты или персональный мониторинг, настроенные в других разделах.","Nie wpływa na alerty cenowe ani indywidualne monitorowanie skonfigurowane w innych sekcjach."],
  ["Коли сайт закрито, локальні сповіщення не працюють.","Local notifications do not work while the site is closed.","Когда сайт закрыт, локальные уведомления не работают.","Powiadomienia lokalne nie działają po zamknięciu strony."],
  ["Ціна зростає + OI зростає","Price rises + OI rises","Цена растёт + OI растёт","Cena rośnie + OI rośnie"],
  ["Кількість відкритих контрактів збільшується: у ринку з’являються нові позиції.","Open contract count is growing: new positions are entering the market.","Количество открытых контрактов увеличивается: на рынке появляются новые позиции.","Liczba otwartych kontraktów rośnie: na rynku pojawiają się nowe pozycje."],
  ["Це може підтверджувати силу висхідного руху, якщо її підтримують обсяг і реакція ціни.","This may confirm the upward move's strength if volume and price action support it.","Это может подтверждать силу роста, если она подкреплена объёмом и реакцией цены.","Może to potwierdzać siłę wzrostu, jeśli wspierają go wolumen i reakcja ceny."],
  ["У матеріалі такий рух названо «здоровим трендом».","The source material calls this a “healthy trend”.","В материале такое движение названо «здоровым трендом».","W materiale taki ruch nazwano „zdrowym trendem”."],
  ["Можна розглядати утримання позиції або пошук продовження руху — тільки за наявності інших підтверджень.","Consider holding a position or seeking continuation only with additional confirmations.","Рассматривать удержание позиции или поиск продолжения стоит только при наличии других подтверждений.","Utrzymanie pozycji lub szukanie kontynuacji rozważaj tylko przy dodatkowych potwierdzeniach."],
  ["Ціна зростає + OI падає","Price rises + OI falls","Цена растёт + OI падает","Cena rośnie + OI spada"],
  ["Кількість відкритих контрактів скорочується: частина учасників закриває позиції.","Open contract count is falling: some participants are closing positions.","Количество открытых контрактов сокращается: часть участников закрывает позиции.","Liczba otwartych kontraktów spada: część uczestników zamyka pozycje."],
  ["Одне з можливих пояснень — закриття шортів або short squeeze, а не формування нового стійкого тренду.","One explanation is short covering or a short squeeze, not necessarily a new sustainable trend.","Одно из возможных объяснений — закрытие шортов или short squeeze, а не новый устойчивый тренд.","Jednym z możliwych wyjaśnień jest zamykanie shortów lub short squeeze, a nie nowy trwały trend."],
  ["Обережніше з новими лонгами: рух може втрачати імпульс, тому корисно перевіряти обсяг і найближчий опір.","Be more cautious with new longs: momentum may be fading. Check volume and nearby resistance.","Осторожнее с новыми лонгами: импульс может ослабевать. Проверяйте объём и ближайшее сопротивление.","Ostrożniej z nowymi longami: impuls może słabnąć. Sprawdź wolumen i najbliższy opór."],
  ["Ціна падає + OI зростає","Price falls + OI rises","Цена падает + OI растёт","Cena spada + OI rośnie"],
  ["Кількість відкритих контрактів збільшується на тлі зниження ціни.","Open contract count increases as the price falls.","Число открытых контрактов увеличивается на фоне падения цены.","Liczba otwartych kontraktów rośnie przy spadku ceny."],
  ["Це може означати появу нових шортових позицій і посилення тиску продавців.","This may indicate new short positions and stronger selling pressure.","Это может означать появление новых шортов и усиление давления продавцов.","Może to wskazywać na nowe shorty i silniejszą presję sprzedających."],
  ["Падіння може мати продовження, якщо продавці активні, але напрямок нових позицій не доводиться самим OI.","The decline may continue if sellers stay active, but OI alone cannot establish the direction of new positions.","Падение может продолжиться при активности продавцов, но OI сам по себе не доказывает направление новых позиций.","Spadek może trwać przy aktywnych sprzedających, ale sam OI nie dowodzi kierunku nowych pozycji."],
  ["Ціна падає + OI падає","Price falls + OI falls","Цена падает + OI падает","Cena spada + OI spada"],
  ["Кількість відкритих контрактів зменшується: учасники виходять із позицій.","Open contract count decreases as traders exit positions.","Количество открытых контрактов снижается: участники выходят из позиций.","Liczba otwartych kontraktów maleje, bo uczestnicy zamykają pozycje."],
  ["Один із можливих сценаріїв — закриття або ліквідація лонгів (капітуляція), інколи наприкінці імпульсу.","One possible scenario is long closing or liquidation (capitulation), sometimes near the end of a move.","Возможный сценарий — закрытие или ликвидация лонгов (капитуляция), иногда в конце импульса.","Możliwy scenariusz to zamykanie lub likwidacja longów (kapitulacja), czasem pod koniec ruchu."],
  ["Спостерігай за ознаками відскоку чи розвороту, але не вважай саме падіння OI готовим сигналом на лонг.","Watch for rebound or reversal signs, but do not treat falling OI alone as a long signal.","Следите за признаками отскока или разворота, но не считайте само падение OI готовым сигналом на лонг.","Szukaj oznak odbicia lub odwrócenia, ale nie traktuj samego spadku OI jako sygnału na long."],
  ["1. Накопичення перед імпульсом","1. Accumulation before an impulse","1. Накопление перед импульсом","1. Akumulacja przed impulsem"],
  ["Ціна перебуває в діапазоні.","Price moves within a range.","Цена движется в диапазоне.","Cena porusza się w zakresie."],
  ["OI поступово зростає.","OI rises gradually.","OI постепенно растёт.","OI stopniowo rośnie."],
  ["У діапазоні накопичуються відкриті позиції; після виходу можливий сильний рух.","Open positions accumulate inside a range; a strong move may follow the breakout.","В диапазоне накапливаются открытые позиции; после выхода возможно сильное движение.","Pozycje gromadzą się w zakresie; po wybiciu może nastąpić silny ruch."],
  ["Визнач межі діапазону й дочекайся реакції або підтвердженого пробою. OI не визначає напрямок майбутнього виходу.","Mark the range boundaries and wait for a reaction or confirmed breakout. OI does not predict the breakout direction.","Определите границы диапазона и дождитесь реакции или подтверждённого пробоя. OI не определяет направление выхода.","Wyznacz granice zakresu i poczekaj na reakcję lub potwierdzone wybicie. OI nie określa kierunku wybicia."],
  ["2. Пастка для учасників (trap)","2. Trader trap","2. Ловушка для участников (trap)","2. Pułapka na uczestników (trap)"],
  ["Ціна йде вгору.","Price moves up.","Цена движется вверх.","Cena idzie w górę."],
  ["OI різко зростає.","OI rises sharply.","OI резко растёт.","OI gwałtownie rośnie."],
  ["Після цього ціна різко падає.","Then the price drops sharply.","После этого цена резко падает.","Następnie cena gwałtownie spada."],
  ["Можлива пастка для пізніх покупців: частину лонгів могли примусово закрити.","This could trap late buyers: some longs may have been forcibly closed.","Возможная ловушка для поздних покупателей: часть лонгов могла быть принудительно закрыта.","Możliwa pułapka na spóźnionych kupujących: część longów mogła zostać przymusowo zamknięta."],
  ["Перевір кластерні обсяги, ліквідації, повернення під рівень і поведінку funding rate.","Check volume clusters, liquidations, a return below the level and funding-rate behavior.","Проверьте кластерные объёмы, ликвидации, возврат под уровень и поведение funding rate.","Sprawdź klastry wolumenu, likwidacje, powrót pod poziom i zachowanie funding rate."],
  ["3. Винос позицій та «очищення» ринку","3. Position flush and market reset","3. Вынос позиций и «очищение» рынка","3. Wymiecenie pozycji i „oczyszczenie” rynku"],
  ["Відбувається різкий ціновий імпульс.","A sharp price impulse occurs.","Происходит резкий ценовой импульс.","Następuje gwałtowny impuls cenowy."],
  ["Водночас OI падає.","At the same time, OI falls.","Одновременно OI падает.","Jednocześnie OI spada."],
  ["Відкриті позиції масово скорочуються; ринок може проходити фазу закриттів або ліквідацій.","Open positions contract sharply; the market may be undergoing closings or liquidations.","Открытые позиции массово сокращаются; рынок может проходить фазу закрытий или ликвидаций.","Liczba otwartych pozycji silnie maleje; rynek może przechodzić fazę zamknięć lub likwidacji."],
  ["Після такого руху спостерігай за новим балансом покупців і продавців. Подальший тренд не гарантований.","After this move, monitor the new balance between buyers and sellers. A continuing trend is not guaranteed.","После такого движения наблюдайте за новым балансом покупателей и продавцов. Дальнейший тренд не гарантирован.","Po takim ruchu obserwuj nową równowagę między kupującymi i sprzedającymi. Dalszy trend nie jest gwarantowany."],
  ["Обсяг (Volume)","Volume","Объём (Volume)","Wolumen (Volume)"],
  ["Скільки контрактів проторгували за певний період. Це потік угод, а не кількість позицій, що залишаються відкритими.","Contracts traded over a period: the flow of transactions, not the number of contracts still open.","Сколько контрактов проторговано за период. Это поток сделок, а не количество оставшихся открытых позиций.","Liczba kontraktów, którymi handlowano w danym okresie. To przepływ transakcji, nie liczba nadal otwartych pozycji."],
  ["Відкритий інтерес (OI)","Open Interest (OI)","Открытый интерес (OI)","Otwarte pozycje (OI)"],
  ["Скільки контрактів залишаються відкритими в конкретному деривативному ринку. Зміни OI показують зміну відкритих зобов’язань.","The number of contracts still open in a derivatives market. Changes in OI show changes in outstanding obligations.","Число контрактов, остающихся открытыми на конкретном рынке деривативов. Изменение OI показывает изменение открытых обязательств.","Liczba kontraktów pozostających otwartymi na danym rynku instrumentów pochodnych. Zmiany OI pokazują zmiany otwartych zobowiązań."],
  ["Допомагає оцінювати перекіс та вартість утримання позицій у безстрокових ф’ючерсах (perpetual futures).","Helps assess positioning imbalance and carrying cost in perpetual futures.","Помогает оценивать перекос позиций и стоимость их удержания на бессрочных фьючерсах.","Pomaga ocenić nierównowagę pozycji i koszt ich utrzymywania na kontraktach perpetual."],
  ["Енциклопедія індикатора Open Interest","Open Interest indicator encyclopedia","Энциклопедия индикатора Open Interest","Encyklopedia wskaźnika Open Interest"],
  ["Індикатори / Open Interest","Indicators / Open Interest","Индикаторы / Open Interest","Wskaźniki / Open Interest"],
  ["Відкритий інтерес (Open Interest, OI)","Open Interest (OI)","Открытый интерес (Open Interest, OI)","Otwarte pozycje (Open Interest, OI)"],
  ["Один із важливих інструментів аналізу деривативів — ф’ючерсів і безстрокових контрактів (perpetual futures).","An important analytical tool for derivatives such as futures and perpetual contracts.","Один из важных инструментов анализа деривативов — фьючерсов и бессрочных контрактов (perpetual futures).","Ważne narzędzie analizy instrumentów pochodnych, takich jak futures i kontrakty perpetual."],
  ["Він показує загальну кількість відкритих контрактів, які ще не були закриті або погашені.","It shows the total number of outstanding contracts that have not yet been closed or settled.","Он показывает общее число открытых контрактов, которые ещё не были закрыты или погашены.","Pokazuje łączną liczbę kontraktów, które nie zostały jeszcze zamknięte lub rozliczone."],
  ["Ключова ідея:","Key idea:","Ключевая идея:","Najważniejsza idea:"],
  ["OI допомагає оцінити участь ринку в русі ціни, а не лише саму зміну ціни.","OI helps assess participation in a price move, not just the price change itself.","OI помогает оценить участие рынка в движении цены, а не только её изменение.","OI pomaga ocenić udział rynku w ruchu ceny, nie tylko samą zmianę ceny."],
  ["Точніше: OI вимірює відкриті контракти, а не безпосередній приплив грошей або те, хто сильніший — покупці чи продавці.","More precisely, OI measures outstanding contracts, not direct money inflows or which side is stronger.","Точнее: OI измеряет открытые контракты, а не прямой приток денег или превосходство покупателей либо продавцов.","Dokładniej: OI mierzy otwarte kontrakty, a nie bezpośredni napływ pieniędzy ani przewagę kupujących lub sprzedających."],
  ["Основи: як читати OI разом із ціною","Basics: reading OI alongside price","Основы: как читать OI вместе с ценой","Podstawy: jak analizować OI wraz z ceną"],
  ["Дивися на індикатор не окремо, а в поєднанні з напрямком ціни. Чотири типові сценарії:","Analyse OI together with price direction, not in isolation. Four common scenarios:","Анализируйте OI вместе с направлением цены, а не отдельно. Четыре типичных сценария:","Analizuj OI razem z kierunkiem ceny, nie osobno. Cztery typowe scenariusze:"],
  ["Практично:","In practice:","Практически:","W praktyce:"],
  ["Що OI показує насправді","What OI really measures","Что OI показывает на самом деле","Co tak naprawdę pokazuje OI"],
  ["Головне запитання:","Main question:","Главный вопрос:","Główne pytanie:"],
  ["збільшується чи зменшується кількість відкритих контрактів?","Is the number of outstanding contracts increasing or decreasing?","Увеличивается или уменьшается число открытых контрактов?","Czy liczba otwartych kontraktów rośnie, czy maleje?"],
  ["OI допомагає оцінити","OI helps assess","OI помогает оценить","OI pomaga ocenić"],
  ["Як змінюється кількість відкритих контрактів.","How the number of outstanding contracts changes.","Как меняется число открытых контрактов.","Jak zmienia się liczba otwartych kontraktów."],
  ["Чи супроводжується ціновий рух появою або закриттям позицій.","Whether a price move coincides with opening or closing positions.","Сопровождается ли движение цены открытием или закрытием позиций.","Czy ruchowi ceny towarzyszy otwieranie lub zamykanie pozycji."],
  ["Чи є підстави перевірити припущення про продовження або виснаження імпульсу.","Whether there is reason to investigate continuation or exhaustion of a move.","Есть ли основания проверить гипотезу о продолжении или истощении импульса.","Czy są podstawy, by sprawdzić hipotezę o kontynuacji lub wyczerpaniu ruchu."],
  ["OI сам по собі не показує","OI alone cannot show","Сам по себе OI не показывает","Sam OI nie pokazuje"],
  ["Хто саме домінує — лонги чи шорти.","Whether longs or shorts dominate.","Кто доминирует — лонги или шорты.","Czy dominują longi, czy shorty."],
  ["Де точно розташовані ліквідації.","The exact liquidation levels.","Где точно находятся ликвидации.","Gdzie dokładnie znajdują się poziomy likwidacji."],
  ["Хто з учасників сильніший.","Which participants have more strength.","Какие участники сильнее.","Którzy uczestnicy są silniejsi."],
  ["Скільки нових грошей фактично зайшло на біржу.","How much new money actually entered an exchange.","Сколько новых денег реально поступило на биржу.","Ile nowych pieniędzy faktycznie trafiło na giełdę."],
  ["Поєднуй OI з кластерами, торговим обсягом, ліквідаціями, funding rate, стаканом і рівнями.","Combine OI with volume clusters, trading volume, liquidations, funding rate, the order book and price levels.","Сочетайте OI с кластерами, торговым объёмом, ликвидациями, funding rate, стаканом и уровнями.","Łącz OI z klastrami, wolumenem, likwidacjami, funding rate, arkuszem zleceń i poziomami."],
  ["Як застосовують OI в криптотрейдингу","How OI is used in crypto trading","Как OI применяют в криптотрейдинге","Jak wykorzystuje się OI w handlu kryptowalutami"],
  ["Що це означає:","What this means:","Что это означает:","Co to oznacza:"],
  ["Що перевірити:","What to check:","Что проверить:","Co sprawdzić:"],
  ["Поширена помилка: OI як готовий сигнал на вхід","Common mistake: treating OI as an entry signal","Распространённая ошибка: OI как готовый сигнал на вход","Częsty błąd: traktowanie OI jako sygnału wejścia"],
  ["OI — це контекст, а не точка входу.","OI provides context, not an entry point.","OI — это контекст, а не точка входа.","OI daje kontekst, a nie punkt wejścia."],
  ["Він допомагає поставити запитання: чи можна довіряти руху, чи це імпульс або винос, чи ринок перевантажений відкритими позиціями?","It raises useful questions: is the move reliable, an impulse or a flush, and is the market crowded with open positions?","Он помогает спросить: можно ли доверять движению, импульс это или вынос, перегружен ли рынок открытыми позициями?","Pomaga zapytać: czy ruch jest wiarygodny, czy to impuls lub wymiecenie i czy rynek jest przeciążony otwartymi pozycjami?"],
  ["Для рішення про угоду потрібні рівень, реакція ціни, ліквідність, обсяг та план ризику.","A trade decision also requires a level, price reaction, liquidity, volume and risk plan.","Для решения о сделке нужны уровень, реакция цены, ликвидность, объём и план риска.","Decyzja o transakcji wymaga też poziomu, reakcji ceny, płynności, wolumenu i planu ryzyka."],
  ["Практика для скальпінгу та внутрішньоденної торгівлі","Scalping and intraday practice","Практика для скальпинга и внутридневной торговли","Praktyka scalpingu i handlu intraday"],
  ["Особливо корисно аналізувати OI поруч із рівнями, імпульсами й щільностями заявок.","OI is especially useful alongside levels, impulses and concentrated limit orders.","OI особенно полезно анализировать вместе с уровнями, импульсами и плотностями заявок.","OI jest szczególnie przydatny razem z poziomami, impulsami i koncentracjami zleceń."],
  ["Перед входом","Before entry","Перед входом","Przed wejściem"],
  ["Під час імпульсу","During an impulse","Во время импульса","Podczas impulsu"],
  ["Біля максимумів і мінімумів","Near highs and lows","У максимумов и минимумов","W pobliżu maksimów i minimów"],
  ["Де дивитися Open Interest","Where to view Open Interest","Где смотреть Open Interest","Gdzie sprawdzać Open Interest"],
  ["Порівнюй дані одного ринку й типу контракту: показники різних бірж і агрегаторів можуть відрізнятися за одиницями та охопленням.","Compare the same market and contract type: exchanges and aggregators may differ in units and coverage.","Сравнивайте один рынок и тип контракта: показатели разных бирж и агрегаторов могут отличаться по единицам и охвату.","Porównuj ten sam rynek i typ kontraktu: giełdy i agregatory mogą różnić się jednostkami oraz zakresem danych."],
  ["Коротка формула — запам’ятай","Short rule to remember","Краткая формула — запомните","Krótka zasada do zapamiętania"],
  ["OI зростає","OI rises","OI растёт","OI rośnie"],
  ["OI падає","OI falls","OI падает","OI spada"],
  ["Матеріал структуровано на основі наданого опису. Типові інтерпретації OI є гіпотезами, а не доведеними сигналами чи індивідуальною інвестиційною рекомендацією.","This guide is based on the supplied description. Typical OI interpretations are hypotheses, not proven signals or personalized investment advice.","Материал структурирован по предоставленному описанию. Интерпретации OI — гипотезы, а не доказанные сигналы или индивидуальные инвестиционные рекомендации.","Materiał opracowano na podstawie dostarczonego opisu. Typowe interpretacje OI są hipotezami, a nie dowiedzionymi sygnałami ani indywidualną poradą inwestycyjną."],
] as const;
const languageOrder: SupportedLanguage[] = ['uk','en','ru','pl'];

export const auditedPhrases = Object.fromEntries(
  languageOrder.map((language, index) => [
    language, Object.fromEntries(phraseRows.map(row => [row[0], row[index]])),
  ]),
) as Record<SupportedLanguage, Record<string, string>>;

export const auditedPhraseRows = phraseRows;
