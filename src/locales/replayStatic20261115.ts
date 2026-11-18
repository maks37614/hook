/** Replay labels translated without changing saved trade data. */
import type { SupportedLanguage } from './types';
export const replayStaticRows = [
  [
    "toolbar.coinTitle",
    "Вибрати монету для Replay (Усі монети ринку з обсягом від $100k до $10B)",
    "Select a coin for Replay (volume $100k–$10B)",
    "Выбрать монету Replay (объём $100k–$10B)",
    "Wybierz monetę do Replay (wolumen $100k–$10B)"
  ],
  [
    "toolbar.replayTitle",
    "Відтворення свічок: вибір історичної дати",
    "Candle replay: choose historical date",
    "Воспроизведение свечей: выбрать дату",
    "Odtwarzanie świec: wybierz datę"
  ],
  [
    "toolbar.replay",
    "Відтворення свічок",
    "Candle replay",
    "Воспроизведение свечей",
    "Odtwarzanie świec"
  ],
  [
    "toolbar.focus",
    "Автофокус",
    "Auto-focus",
    "Автофокус",
    "Autofokus"
  ],
  [
    "toolbar.randomTitle",
    "Вибрати дату випадковим чином (історичний рандом)",
    "Choose a random historical date",
    "Выбрать случайную дату",
    "Wybierz losową datę historyczną"
  ],
  [
    "toolbar.random",
    "Випадкова дата",
    "Random date",
    "Случайная дата",
    "Losowa data"
  ],
  [
    "toolbar.randomShort",
    "🎲 Рандом",
    "🎲 Random",
    "🎲 Случайно",
    "🎲 Losowo"
  ],
  [
    "toolbar.pause",
    "Пауза",
    "Pause",
    "Пауза",
    "Pauza"
  ],
  [
    "toolbar.play",
    "Відтворити",
    "Play",
    "Воспроизвести",
    "Odtwórz"
  ],
  [
    "toolbar.stepTitle",
    "Крок на 1 свічку вперед (Стрілка вправо →)",
    "Advance one candle (→)",
    "На одну свечу вперёд (→)",
    "Przejdź o jedną świecę (→)"
  ],
  [
    "toolbar.step",
    "+1 Свічка",
    "+1 candle",
    "+1 свеча",
    "+1 świeca"
  ],
  [
    "toolbar.resetTitle",
    "Повернутися на початкову дату відтворення",
    "Return to replay start",
    "Вернуться к началу воспроизведения",
    "Wróć do początku odtwarzania"
  ],
  [
    "toolbar.loading",
    "Завантаження свічок з біржі...",
    "Loading candles from exchange...",
    "Загрузка свечей с биржи...",
    "Wczytywanie świec z giełdy..."
  ],
  [
    "toolbar.dateHeading",
    "Вибір історичної дати відтворення",
    "Choose historical replay date",
    "Выбор исторической даты",
    "Wybór historycznej daty odtwarzania"
  ],
  [
    "toolbar.closeDate",
    "Закрити вибір дати",
    "Close date picker",
    "Закрыть выбор даты",
    "Zamknij wybór daty"
  ],
  [
    "toolbar.generate",
    "🎲 Згенерувати випадкову дату",
    "🎲 Generate random date",
    "🎲 Выбрать случайную дату",
    "🎲 Wylosuj datę"
  ],
  [
    "toolbar.quick",
    "Швидкі переходи:",
    "Quick jumps:",
    "Быстрые переходы:",
    "Szybkie przejścia:"
  ],
  [
    "toolbar.exact",
    "Або точна дата і час:",
    "Or exact date and time:",
    "Или точная дата и время:",
    "Lub dokładna data i godzina:"
  ],
  [
    "toolbar.cancel",
    "Скасувати",
    "Cancel",
    "Отмена",
    "Anuluj"
  ],
  [
    "toolbar.start",
    "Почати відтворення 🚀",
    "Start replay 🚀",
    "Начать воспроизведение 🚀",
    "Rozpocznij odtwarzanie 🚀"
  ],
  [
    "toolbar.marketCoins",
    "Усі монети ринку криптовалют",
    "All crypto market coins",
    "Все монеты крипторынка",
    "Wszystkie monety rynku kryptowalut"
  ],
  [
    "toolbar.closeCoin",
    "Закрити вибір монети",
    "Close coin picker",
    "Закрыть выбор монеты",
    "Zamknij wybór monety"
  ],
  [
    "toolbar.search",
    "Пошук монети (BTC, SOL, PEPE, SUI, DOGE...)",
    "Search coins (BTC, SOL, PEPE, SUI, DOGE...)",
    "Поиск монеты (BTC, SOL, PEPE, SUI, DOGE...)",
    "Szukaj monet (BTC, SOL, PEPE, SUI, DOGE...)"
  ],
  [
    "toolbar.sort",
    "Сортування:",
    "Sort:",
    "Сортировка:",
    "Sortowanie:"
  ],
  [
    "toolbar.volumeDesc",
    "Обсяг 24г (найбільші)",
    "24h volume (highest)",
    "Объём 24 ч (наибольший)",
    "Wolumen 24 h (największy)"
  ],
  [
    "toolbar.volumeAsc",
    "Обсяг 24г (найменші)",
    "24h volume (lowest)",
    "Объём 24 ч (наименьший)",
    "Wolumen 24 h (najmniejszy)"
  ],
  [
    "toolbar.changeDesc",
    "Топ ріст (+%)",
    "Top gainers (+%)",
    "Лидеры роста (+%)",
    "Największe wzrosty (+%)"
  ],
  [
    "toolbar.changeAsc",
    "Топ спад (-%)",
    "Top losers (-%)",
    "Лидеры падения (-%)",
    "Największe spadki (-%)"
  ],
  [
    "toolbar.name",
    "За назвою (A-Z)",
    "By name (A–Z)",
    "По названию (А–Я)",
    "Według nazwy (A–Z)"
  ],
  [
    "toolbar.empty",
    "Монет за вказаними фільтрами не знайдено.",
    "No coins match the filters.",
    "Монеты по фильтрам не найдены.",
    "Brak monet pasujących do filtrów."
  ],
  [
    "toolbar.reset",
    "Скинути фільтри",
    "Reset filters",
    "Сбросить фильтры",
    "Zresetuj filtry"
  ],
  [
    "toolbar.close",
    "Закрити",
    "Close",
    "Закрыть",
    "Zamknij"
  ],
  [
    "journal.title",
    "Журнал угод",
    "Trade journal",
    "Журнал сделок",
    "Dziennik transakcji"
  ],
  [
    "journal.stats",
    "Статистика & Аналітика",
    "Statistics & Analytics",
    "Статистика и аналитика",
    "Statystyki i analityka"
  ],
  [
    "journal.pending",
    "Відкладені ордери",
    "Pending orders",
    "Отложенные ордера",
    "Zlecenia oczekujące"
  ],
  [
    "journal.exportTitle",
    "Експортувати журнал угод в CSV",
    "Export trade journal to CSV",
    "Экспортировать журнал в CSV",
    "Eksportuj dziennik do CSV"
  ],
  [
    "journal.export",
    "Експорт CSV",
    "Export CSV",
    "Экспорт CSV",
    "Eksport CSV"
  ],
  [
    "journal.clear",
    "Очистити журнал",
    "Clear journal",
    "Очистить журнал",
    "Wyczyść dziennik"
  ],
  [
    "journal.empty",
    "Журнал угод порожній",
    "Trade journal is empty",
    "Журнал сделок пуст",
    "Dziennik transakcji jest pusty"
  ],
  [
    "journal.coin",
    "Монета / Напрямок",
    "Coin / Direction",
    "Монета / Направление",
    "Moneta / Kierunek"
  ],
  [
    "journal.time",
    "Час входу / виходу",
    "Entry / Exit time",
    "Время входа / выхода",
    "Czas wejścia / wyjścia"
  ],
  [
    "journal.price",
    "Ціна входу / виходу",
    "Entry / Exit price",
    "Цена входа / выхода",
    "Cena wejścia / wyjścia"
  ],
  [
    "journal.size",
    "Розмір / Плече",
    "Size / Leverage",
    "Размер / Плечо",
    "Wielkość / Dźwignia"
  ],
  [
    "journal.reason",
    "Причина / Тег",
    "Reason / Tag",
    "Причина / Тег",
    "Powód / Tag"
  ],
  [
    "journal.screenshot",
    "Скриншот",
    "Screenshot",
    "Скриншот",
    "Zrzut ekranu"
  ],
  [
    "journal.action",
    "Дія",
    "Action",
    "Действие",
    "Działanie"
  ],
  [
    "journal.tp",
    "🎯 TP спрацював",
    "🎯 TP hit",
    "🎯 TP сработал",
    "🎯 Osiągnięto TP"
  ],
  [
    "journal.sl",
    "🛑 SL спрацював",
    "🛑 SL hit",
    "🛑 SL сработал",
    "🛑 Osiągnięto SL"
  ],
  [
    "journal.liq",
    "💥 Ліквідація",
    "💥 Liquidation",
    "💥 Ликвидация",
    "💥 Likwidacja"
  ],
  [
    "journal.manual",
    "👤 Закрито вручну",
    "👤 Closed manually",
    "👤 Закрыто вручную",
    "👤 Zamknięto ręcznie"
  ],
  [
    "journal.preview",
    "Клікніть для перегляду скриншоту графіка",
    "Click to view chart screenshot",
    "Нажмите для просмотра скриншота",
    "Kliknij, aby zobaczyć zrzut wykresu"
  ],
  [
    "journal.none",
    "Немає",
    "None",
    "Нет",
    "Brak"
  ],
  [
    "journal.delete",
    "Видалити запис",
    "Delete entry",
    "Удалить запись",
    "Usuń wpis"
  ],
  [
    "journal.total",
    "Всього угод",
    "Total trades",
    "Всего сделок",
    "Łącznie transakcji"
  ],
  [
    "journal.net",
    "Чистий прибуток (Net P&L)",
    "Net profit (Net P&L)",
    "Чистая прибыль (Net P&L)",
    "Zysk netto (Net P&L)"
  ],
  [
    "journal.factor",
    "Співвідношення прибутку",
    "Profit factor",
    "Коэффициент прибыли",
    "Współczynnik zysku"
  ],
  [
    "journal.best",
    "Краща угода",
    "Best trade",
    "Лучшая сделка",
    "Najlepsza transakcja"
  ],
  [
    "journal.maxProfit",
    "Максимальний профіт",
    "Maximum profit",
    "Максимальная прибыль",
    "Maksymalny zysk"
  ],
  [
    "journal.worst",
    "Гірша угода",
    "Worst trade",
    "Худшая сделка",
    "Najgorsza transakcja"
  ],
  [
    "journal.maxLoss",
    "Максимальний збиток",
    "Maximum loss",
    "Максимальный убыток",
    "Maksymalna strata"
  ],
  [
    "journal.analysis",
    "Аналіз вашої практики на Replay",
    "Review of Replay practice",
    "Анализ практики в Replay",
    "Analiza treningu w Replay"
  ],
  [
    "journal.noPending",
    "Немає активних відкладених лімітних або стоп-ордерів.",
    "No active pending limit or stop orders.",
    "Нет активных отложенных ордеров.",
    "Brak aktywnych oczekujących zleceń limit lub stop."
  ],
  [
    "journal.screenshotHeading",
    "Скриншот стану графіка під час угоди",
    "Chart screenshot during trade",
    "Скриншот графика во время сделки",
    "Zrzut wykresu podczas transakcji"
  ],
  [
    "journal.download",
    "Завантажити фото",
    "Download image",
    "Скачать изображение",
    "Pobierz obraz"
  ],
  [
    "sim.balance",
    "Баланс симулятора",
    "Simulator balance",
    "Баланс симулятора",
    "Saldo symulatora"
  ],
  [
    "sim.settingsTitle",
    "Налаштування симулятора (комісія, спред, проковзування)",
    "Simulator settings (fees, spread, slippage)",
    "Настройки симулятора (комиссия, спред, проскальзывание)",
    "Ustawienia symulatora (prowizje, spread, poślizg)"
  ],
  [
    "sim.reset",
    "Скинути баланс до початкових $10,000",
    "Reset balance to $10,000",
    "Сбросить баланс до $10,000",
    "Zresetuj saldo do $10,000"
  ],
  [
    "sim.close",
    "Закрити / Cover",
    "Close / Cover",
    "Закрыть / Cover",
    "Zamknij / Cover"
  ],
  [
    "sim.pnl",
    "P&L позиції:",
    "Position P&L:",
    "P&L позиции:",
    "P&L pozycji:"
  ],
  [
    "sim.liquidation",
    "Ціна ліквідації:",
    "Liquidation price:",
    "Цена ликвидации:",
    "Cena likwidacji:"
  ],
  [
    "sim.leverage",
    "Кредитне плече:",
    "Leverage:",
    "Кредитное плечо:",
    "Dźwignia:"
  ],
  [
    "sim.size",
    "Розмір позиції ($):",
    "Position size ($):",
    "Размер позиции ($):",
    "Wielkość pozycji ($):"
  ],
  [
    "sim.orPrice",
    "або ціна:",
    "or price:",
    "или цена:",
    "lub cena:"
  ],
  [
    "sim.sl",
    "Ціна SL",
    "SL price",
    "Цена SL",
    "Cena SL"
  ],
  [
    "sim.tp",
    "Ціна TP",
    "TP price",
    "Цена TP",
    "Cena TP"
  ],
  [
    "sim.reason",
    "Причина входу / Тег:",
    "Entry reason / Tag:",
    "Причина входа / Тег:",
    "Powód wejścia / Tag:"
  ],
  [
    "sim.tagPlaceholder",
    "Введіть свій тег або патерн...",
    "Enter tag or pattern...",
    "Введите тег или паттерн...",
    "Wpisz tag lub formację..."
  ],
  [
    "sim.notes",
    "Коментар або план угоди (необов'язково)...",
    "Comment or trade plan (optional)...",
    "Комментарий или план сделки (необязательно)...",
    "Komentarz lub plan transakcji (opcjonalnie)..."
  ],
  [
    "sim.settingsHeading",
    "Параметри симуляції ринку",
    "Market simulation settings",
    "Параметры симуляции рынка",
    "Ustawienia symulacji rynku"
  ],
  [
    "sim.fee",
    "Комісія біржі (%):",
    "Exchange fee (%):",
    "Комиссия биржи (%):",
    "Prowizja giełdy (%):"
  ],
  [
    "sim.defaultFee",
    "За замовчуванням 0.05% (Binance/Bybit Futures taker)",
    "Default 0.05% (Binance/Bybit Futures taker)",
    "По умолчанию 0.05% (Binance/Bybit Futures taker)",
    "Domyślnie 0,05% (Binance/Bybit Futures taker)"
  ],
  [
    "sim.spread",
    "Ринковий спред (%):",
    "Market spread (%):",
    "Рыночный спред (%):",
    "Spread rynkowy (%):"
  ],
  [
    "sim.slippage",
    "Проковзування / Slippage (%):",
    "Slippage (%):",
    "Проскальзывание (%):",
    "Poślizg (slippage) (%):"
  ],
  [
    "sim.save",
    "Зберегти параметри",
    "Save settings",
    "Сохранить параметры",
    "Zapisz ustawienia"
  ],
  [
    "toolbar.pauseShortcut",
    "Пауза (Пробіл)",
    "Pause (Space)",
    "Пауза (Пробел)",
    "Pauza (Spacja)"
  ],
  [
    "toolbar.playShortcut",
    "Відтворення (Пробіл)",
    "Play (Space)",
    "Воспроизведение (Пробел)",
    "Odtwarzanie (Spacja)"
  ],
  [
    "toolbar.candle",
    "Свічка:",
    "Candle:",
    "Свеча:",
    "Świeca:"
  ],
  [
    "toolbar.dateHelp",
    "Виберіть момент у минулому. Графік миттєво переміститься туди, автоматично сфокусується на свічках, а всі наступні свічки будуть приховані для реалістичної торгівлі!",
    "Choose a past date. The chart will jump there, focus on candles, and hide the following candles for realistic practice.",
    "Выберите дату в прошлом. График перейдёт к ней, сфокусируется на свечах и скроет последующие свечи.",
    "Wybierz datę z przeszłości. Wykres przejdzie do niej, skupi się na świecach i ukryje późniejsze świece."
  ],
  [
    "toolbar.autoScale",
    "Автоматичне масштабування та центрування свічок увімкнено.",
    "Automatic candle scaling and centering are enabled.",
    "Автоматическое масштабирование и центрирование свечей включены.",
    "Automatyczne skalowanie i centrowanie świec są włączone."
  ],
  [
    "toolbar.days.1",
    "1 день тому",
    "1 day ago",
    "1 день назад",
    "1 dzień temu"
  ],
  [
    "toolbar.days.3",
    "3 дні тому",
    "3 days ago",
    "3 дня назад",
    "3 dni temu"
  ],
  [
    "toolbar.days.5",
    "5 днів тому",
    "5 days ago",
    "5 дней назад",
    "5 dni temu"
  ],
  [
    "toolbar.days.14",
    "14 днів тому",
    "14 days ago",
    "14 дней назад",
    "14 dni temu"
  ],
  [
    "toolbar.days.30",
    "30 днів тому",
    "30 days ago",
    "30 дней назад",
    "30 dni temu"
  ],
  [
    "toolbar.days.60",
    "60 днів тому",
    "60 days ago",
    "60 дней назад",
    "60 dni temu"
  ],
  [
    "toolbar.days.90",
    "90 днів тому",
    "90 days ago",
    "90 дней назад",
    "90 dni temu"
  ],
  [
    "toolbar.days.180",
    "180 днів тому",
    "180 days ago",
    "180 дней назад",
    "180 dni temu"
  ],
  [
    "toolbar.days.365",
    "1 рік тому",
    "1 year ago",
    "1 год назад",
    "1 rok temu"
  ],
  [
    "toolbar.marketFrom",
    "Реальний ринок Binance & Bybit з 24г обсягом від",
    "Live Binance & Bybit market with 24h volume from",
    "Рынок Binance & Bybit с объёмом за 24 ч от",
    "Rynek Binance & Bybit z wolumenem 24 h od"
  ],
  [
    "toolbar.marketTo",
    "до",
    "to",
    "до",
    "do"
  ],
  [
    "toolbar.volume",
    "Обсяг:",
    "Volume:",
    "Объём:",
    "Wolumen:"
  ],
  [
    "toolbar.allVolume",
    "Всі ($100k - $10B)",
    "All ($100k–$10B)",
    "Все ($100k–$10B)",
    "Wszystkie ($100k–$10B)"
  ],
  [
    "toolbar.allExchanges",
    "Всі біржі",
    "All exchanges",
    "Все биржи",
    "Wszystkie giełdy"
  ],
  [
    "toolbar.allMarkets",
    "Всі ринки",
    "All markets",
    "Все рынки",
    "Wszystkie rynki"
  ],
  [
    "journal.emptyHelp",
    "Відкривайте позиції в симуляторі на сторінці Replay. Після закриття угоди за SL, TP або вручну, всі деталі та скриншот графіка збережуться тут!",
    "Open positions in the Replay simulator. Once a trade closes at SL, TP or manually, its details and screenshot will appear here.",
    "Открывайте позиции в симуляторе Replay. После закрытия по SL, TP или вручную детали и скриншот появятся здесь.",
    "Otwieraj pozycje w symulatorze Replay. Po zamknięciu przez SL, TP lub ręcznie szczegóły i zrzut będą dostępne tutaj."
  ],
  [
    "journal.entry",
    "Вхід:",
    "Entry:",
    "Вход:",
    "Wejście:"
  ],
  [
    "journal.exit",
    "Вихід:",
    "Exit:",
    "Выход:",
    "Wyjście:"
  ],
  [
    "journal.noTag",
    "Без тегу",
    "No tag",
    "Без тега",
    "Bez tagu"
  ],
  [
    "journal.needTrades",
    "Зробіть щонайменше 5-10 угод на історії, щоб побачити стабільну статистику прибутковості вашої торгової системи.",
    "Complete at least 5–10 historical trades for more meaningful performance statistics.",
    "Совершите не менее 5–10 исторических сделок для более содержательной статистики.",
    "Wykonaj co najmniej 5–10 transakcji historycznych, aby uzyskać bardziej miarodajne statystyki."
  ],
  [
    "journal.positive",
    "Чудовий результат! Ваша стратегія показує позитивне математичне очікування та високий Profit Factor.",
    "This simulation shows positive expectancy and a high profit factor.",
    "Эта симуляция показывает положительное матожидание и высокий Profit Factor.",
    "Ta symulacja wskazuje dodatnią wartość oczekiwaną i wysoki współczynnik zysku."
  ],
  [
    "journal.risk",
    "Зверніть увагу на співвідношення ризику до прибутку (R:R) та рівні Stop-Loss для оптимізації відсотка просідання.",
    "Review the risk/reward ratio (R:R) and stop-loss levels to manage drawdowns.",
    "Проверьте соотношение риска к прибыли (R:R) и Stop-Loss для контроля просадки.",
    "Sprawdź stosunek ryzyka do zysku (R:R) oraz poziomy Stop-Loss, aby kontrolować obsunięcia."
  ],
  [
    "journal.tag",
    "Тег:",
    "Tag:",
    "Тег:",
    "Tag:"
  ],
  [
    "sim.entry",
    "Вхід:",
    "Entry:",
    "Вход:",
    "Wejście:"
  ],
  [
    "sim.current",
    "Поточна:",
    "Current:",
    "Текущая:",
    "Bieżąca:"
  ],
  [
    "sim.sizeLabel",
    "Розмір:",
    "Size:",
    "Размер:",
    "Wielkość:"
  ],
  [
    "sim.margin",
    "Маржа:",
    "Margin:",
    "Маржа:",
    "Depozyt:"
  ],
  [
    "sim.none",
    "Немає",
    "None",
    "Нет",
    "Brak"
  ],
  [
    "sim.market",
    "Ринковий",
    "Market",
    "Рыночный",
    "Rynkowe"
  ],
  [
    "sim.limit",
    "Лімітний",
    "Limit",
    "Лимитный",
    "Limit"
  ],
  [
    "sim.stop",
    "Стоп",
    "Stop",
    "Стоп",
    "Stop"
  ],
  [
    "sim.limitPrice",
    "Ціна ліміту:",
    "Limit price:",
    "Цена лимита:",
    "Cena limitu:"
  ],
  [
    "sim.stopPrice",
    "Ціна стопу:",
    "Stop price:",
    "Цена стопа:",
    "Cena stop:"
  ],
  [
    "sim.chooseTag",
    "Вибрати зі списку",
    "Choose from list",
    "Выбрать из списка",
    "Wybierz z listy"
  ],
  [
    "sim.customTag",
    "Власний тег",
    "Custom tag",
    "Свой тег",
    "Własny tag"
  ],
  [
    "sim.settingsHelp",
    "Вкажіть параметри тейкера, біржовий спред та проковзування ордерів для реалістичного тестування торгової стратегії.",
    "Set taker fees, exchange spread and order slippage for more realistic strategy testing.",
    "Укажите комиссии тейкера, биржевой спред и проскальзывание ордеров для реалистичного тестирования стратегии.",
    "Określ prowizję takera, spread giełdowy i poślizg zleceń, aby realistyczniej testować strategię."
  ]
] as const;
const languages: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const replayStaticStrings = Object.fromEntries(languages.map((lang,i) => [lang,
  Object.fromEntries(replayStaticRows.map(row => ['replay.static.' + row[0], row[i+1]])),
])) as Record<SupportedLanguage, Record<string,string>>;
