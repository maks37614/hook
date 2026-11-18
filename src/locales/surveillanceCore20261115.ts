/** Monitoring UI translations. The WebSocket/event classification remains unchanged. */
import type { SupportedLanguage } from './types';
export const surveillanceCoreUiRows = [
  [
    "error.selectSymbol",
    "Оберіть або введіть символ монети",
    "Select or enter a coin symbol",
    "Выберите или введите символ монеты",
    "Wybierz lub wpisz symbol monety"
  ],
  [
    "symbolHint",
    "Введіть BTC, ETH чи повний тикер BTCUSDT — виберіть пару зі списку для обраної біржі та ринку.",
    "Type BTC, ETH or a full pair such as BTCUSDT, then choose a match for the selected exchange and market.",
    "Введите BTC, ETH или полный тикер BTCUSDT и выберите пару для выбранной биржи и рынка.",
    "Wpisz BTC, ETH lub pełny symbol BTCUSDT i wybierz parę dla wybranej giełdy i rynku."
  ],
  [
    "searchMatches",
    "Знайдені торгові пари",
    "Matching trading pairs",
    "Найденные торговые пары",
    "Znalezione pary handlowe"
  ],
  [
    "searchingSymbols",
    "Шукаємо монети на вибраній біржі...",
    "Searching coins on the selected exchange...",
    "Ищем монеты на выбранной бирже...",
    "Wyszukiwanie monet na wybranej giełdzie..."
  ],
  [
    "noSymbolMatches",
    "На вибраній біржі та ринку відповідних пар USDT не знайдено.",
    "No matching USDT pairs on the selected exchange and market.",
    "На выбранной бирже и рынке подходящие пары USDT не найдены.",
    "Nie znaleziono pasujących par USDT na wybranej giełdzie i rynku."
  ],
  [
    "error.invalidSymbol",
    "Введіть правильний тикер монети, наприклад BTC або BTCUSDT.",
    "Enter a valid coin symbol, such as BTC or BTCUSDT.",
    "Введите правильный тикер монеты, например BTC или BTCUSDT.",
    "Wpisz poprawny symbol, np. BTC lub BTCUSDT."
  ],
  [
    "error.unsupportedQuote",
    "Для цього нагляду оберіть пару USDT.",
    "Choose a USDT trading pair for monitoring.",
    "Для этого мониторинга выберите пару USDT.",
    "Do monitorowania wybierz parę USDT."
  ],
  [
    "error.unknownPair",
    "Пару не знайдено на вибраній біржі та ринку. Перевірте тикер.",
    "This pair was not found on the selected exchange and market. Check the symbol.",
    "Пара не найдена на выбранной бирже и рынке. Проверьте тикер.",
    "Nie znaleziono pary na wybranej giełdzie i rynku. Sprawdź symbol."
  ],
  [
    "error.marketUnavailable",
    "Біржові котирування тимчасово недоступні. Не можна перевірити скорочений тикер; спробуйте пізніше.",
    "Exchange quotes are temporarily unavailable. A short symbol cannot be verified; try again later.",
    "Биржевые котировки временно недоступны. Короткий тикер проверить нельзя; повторите позже.",
    "Notowania giełdowe są chwilowo niedostępne. Nie można sprawdzić skróconego symbolu; spróbuj później."
  ],
  [
    "repairSymbol",
    "Виправити тикер",
    "Fix symbol",
    "Исправить тикер",
    "Popraw symbol"
  ],
  [
    "repairSymbolHint",
    "Перевірити біржову пару та виправити старий запис без втрати налаштувань.",
    "Verify the exchange pair and fix this legacy entry without losing settings.",
    "Проверить биржевую пару и исправить старую запись без потери настроек.",
    "Sprawdź parę giełdową i popraw stary wpis bez utraty ustawień."
  ],
  [
    "success.repaired",
    "Тикер виправлено: #{{symbol}}. Нагляд відновлено.",
    "Symbol fixed: #{{symbol}}. Monitoring resumed.",
    "Тикер исправлен: #{{symbol}}. Мониторинг возобновлён.",
    "Poprawiono symbol: #{{symbol}}. Monitoring wznowiony."
  ],
  [
    "error.densityPositive",
    "Вкажіть додатний поріг щільності в USDT",
    "Enter a positive density threshold in USDT",
    "Укажите положительный порог плотности в USDT",
    "Podaj dodatni próg gęstości w USDT"
  ],
  [
    "success.updated",
    "Налаштування #{{symbol}} успішно оновлено",
    "Settings for #{{symbol}} updated",
    "Настройки #{{symbol}} обновлены",
    "Ustawienia #{{symbol}} zostały zaktualizowane"
  ],
  [
    "error.update",
    "Помилка оновлення налаштувань",
    "Could not update settings",
    "Ошибка обновления настроек",
    "Nie udało się zaktualizować ustawień"
  ],
  [
    "success.added",
    "Монету #{{symbol}} взято на 24/7 системний нагляд!",
    "Coin #{{symbol}} added to 24/7 monitoring!",
    "Монета #{{symbol}} добавлена в круглосуточный мониторинг!",
    "Dodano monetę #{{symbol}} do monitoringu 24/7!"
  ],
  [
    "error.add",
    "Не вдалося додати монету",
    "Could not add coin",
    "Не удалось добавить монету",
    "Nie udało się dodać monety"
  ],
  [
    "status.paused",
    "Нагляд за #{{symbol}} призупинено",
    "Monitoring for #{{symbol}} paused",
    "Мониторинг #{{symbol}} приостановлен",
    "Wstrzymano monitoring #{{symbol}}"
  ],
  [
    "status.activated",
    "24/7 Нагляд за #{{symbol}} активовано!",
    "24/7 monitoring for #{{symbol}} activated!",
    "Круглосуточный мониторинг #{{symbol}} включён!",
    "Włączono monitoring #{{symbol}} 24/7!"
  ],
  [
    "heading",
    "Стеження за монетами",
    "Coin monitoring",
    "Отслеживание монет",
    "Monitorowanie monet"
  ],
  [
    "helpLabel",
    "Інформація про стеження за монетами",
    "About coin monitoring",
    "Информация о мониторинге монет",
    "Informacje o monitorowaniu monet"
  ],
  [
    "helpText",
    "Комплексний моніторинг ринку на серверах h00k.top: Local Order Book, Multi-Timeframe структура, рівні, щільності та Telegram алерти",
    "Market monitoring on h00k.top servers: local order book, multi-timeframe structure, price levels, liquidity walls and Telegram alerts",
    "Комплексный мониторинг рынка на серверах h00k.top: локальный стакан, мультитаймфреймовая структура, уровни, плотности и Telegram-алерты",
    "Kompleksowe monitorowanie rynku na serwerach h00k.top: lokalny arkusz zleceń, struktura wielu interwałów, poziomy, gęstości i alerty Telegram"
  ],
  [
    "refresh",
    "Оновити дані",
    "Refresh data",
    "Обновить данные",
    "Odśwież dane"
  ],
  [
    "activeCount",
    "Стеження: {{count}} монет",
    "Monitoring: {{count}} coins",
    "Мониторинг: {{count}} монет",
    "Monitorowanie: {{count}} monet"
  ],
  [
    "monitoring",
    "Стеження",
    "Monitoring",
    "Мониторинг",
    "Monitorowanie"
  ],
  [
    "coinCount",
    "МОНЕТ: {{count}}",
    "COINS: {{count}}",
    "МОНЕТ: {{count}}",
    "MONETY: {{count}}"
  ],
  [
    "recentEvents",
    "Останні події нагляду",
    "Recent monitoring events",
    "Последние события мониторинга",
    "Ostatnie zdarzenia monitoringu"
  ],
  [
    "eventCount",
    "Подій: {{count}}",
    "Events: {{count}}",
    "Событий: {{count}}",
    "Zdarzenia: {{count}}"
  ],
  [
    "liveFeed",
    "LIVE СТРІЧКА 24/7",
    "LIVE FEED 24/7",
    "ЛЕНТА LIVE 24/7",
    "TRANSMISJA NA ŻYWO 24/7"
  ],
  [
    "collapse",
    "Згорнути",
    "Collapse",
    "Свернуть",
    "Zwiń"
  ],
  [
    "expand",
    "Розгорнути",
    "Expand",
    "Развернуть",
    "Rozwiń"
  ],
  [
    "feedDescription",
    "Хронологічний лог тестів рівнів, щільностей стакану, пробоїв, змін структури та сигналів сетапів",
    "Chronological log of level tests, order-book walls, breakouts, structure changes and setup signals",
    "Хронологический журнал тестов уровней, плотностей стакана, пробоев, изменений структуры и сигналов сетапов",
    "Chronologiczny dziennik testów poziomów, ścian zleceń, wybić, zmian struktury i sygnałów setupów"
  ],
  [
    "coinFilter",
    "Фільтр монети:",
    "Coin filter:",
    "Фильтр монеты:",
    "Filtr monet:"
  ],
  [
    "allEventCoins",
    "Всі монети ({{count}})",
    "All coins ({{count}})",
    "Все монеты ({{count}})",
    "Wszystkie monety ({{count}})"
  ],
  [
    "noEventsYet",
    "Подій нагляду поки що не зафіксовано",
    "No monitoring events yet",
    "Событий мониторинга пока нет",
    "Nie zarejestrowano jeszcze zdarzeń monitoringu"
  ],
  [
    "noFilteredEvents",
    "Немає подій за обраним фільтром",
    "No events match this filter",
    "Нет событий по выбранному фильтру",
    "Brak zdarzeń dla tego filtra"
  ],
  [
    "noEventsHelp",
    "24/7 сервер аналізує стакан, рівні та структуру ринку. Щойно зʼявиться реакція на рівень, щільність або зміна тренду — сповіщення зʼявиться тут та надійде в Telegram.",
    "The 24/7 server analyzes the order book, levels and market structure. When a level reaction, liquidity wall or trend change is detected, an alert will appear here and in Telegram.",
    "Сервер круглосуточно анализирует стакан, уровни и структуру рынка. При реакции на уровень, появлении плотности или смене тренда оповещение появится здесь и в Telegram.",
    "Serwer 24/7 analizuje arkusz zleceń, poziomy i strukturę rynku. Wykryte reakcje na poziomy, duże zlecenia lub zmiany trendu pojawią się tutaj i w Telegramie."
  ],
  [
    "filterHelp",
    "Спробуйте обрати «Всі події» або інший фільтр категорій.",
    "Choose All events or another category filter.",
    "Попробуйте выбрать «Все события» или другой фильтр категорий.",
    "Wybierz Wszystkie zdarzenia lub inny filtr kategorii."
  ],
  [
    "searchPlaceholder",
    "Пошук монети в нагляді...",
    "Search monitored coins...",
    "Поиск монеты в мониторинге...",
    "Szukaj monitorowanych monet..."
  ],
  [
    "allExchanges",
    "Всі біржі",
    "All exchanges",
    "Все биржи",
    "Wszystkie giełdy"
  ],
  [
    "activeStatus",
    "Активних: {{count}}",
    "Active: {{count}}",
    "Активных: {{count}}",
    "Aktywne: {{count}}"
  ],
  [
    "totalStatus",
    "Всього: {{count}}",
    "Total: {{count}}",
    "Всего: {{count}}",
    "Łącznie: {{count}}"
  ],
  [
    "emptyTitle",
    "Список системного нагляду порожній",
    "Monitoring list is empty",
    "Список мониторинга пуст",
    "Lista monitorowanych monet jest pusta"
  ],
  [
    "emptyHelp",
    "Оберіть монети нижче та натисніть «Стежити». Сервер веде безперервний 24/7 моніторинг ринку через WebSockets навіть при вимкненому комп'ютері.",
    "Select coins below and choose Monitor. The server continuously monitors markets over WebSockets even when your computer is off.",
    "Выберите монеты ниже и нажмите «Отслеживать». Сервер круглосуточно следит за рынком по WebSocket даже при выключенном компьютере.",
    "Wybierz monety poniżej i kliknij Monitoruj. Serwer stale monitoruje rynek przez WebSocket, nawet gdy komputer jest wyłączony."
  ],
  [
    "chooseCoin",
    "+ Обрати монету для стеження",
    "+ Select a coin to monitor",
    "+ Выбрать монету для мониторинга",
    "+ Wybierz monetę do monitorowania"
  ],
  [
    "editTitle",
    "Налаштування #{{symbol}}",
    "Settings for #{{symbol}}",
    "Настройки #{{symbol}}",
    "Ustawienia #{{symbol}}"
  ],
  [
    "addTitle",
    "Додати монету на 24/7 системний нагляд",
    "Add coin to 24/7 monitoring",
    "Добавить монету в круглосуточный мониторинг",
    "Dodaj monetę do monitoringu 24/7"
  ],
  [
    "modalIntro",
    "Параметри Стакана, важливих рівнів, щільностей та Сповіщень",
    "Order-book, key level, density and notification settings",
    "Параметры стакана, важных уровней, плотностей и уведомлений",
    "Ustawienia arkusza zleceń, ważnych poziomów, gęstości i powiadomień"
  ],
  [
    "exchange",
    "Біржа",
    "Exchange",
    "Биржа",
    "Giełda"
  ],
  [
    "market",
    "Ринок",
    "Market",
    "Рынок",
    "Rynek"
  ],
  [
    "symbol",
    "Символ (Тікер)",
    "Symbol (ticker)",
    "Символ (тикер)",
    "Symbol (ticker)"
  ],
  [
    "triggerModes",
    "Режими підтвердження пробою",
    "Breakout confirmation modes",
    "Режимы подтверждения пробоя",
    "Tryby potwierdzenia wybicia"
  ],
  [
    "trigger.bar_close",
    "Закриття 4H",
    "4H candle close",
    "Закрытие свечи 4H",
    "Zamknięcie świecy 4H"
  ],
  [
    "trigger.bar_close_1h",
    "Закриття 1H",
    "1H candle close",
    "Закрытие свечи 1H",
    "Zamknięcie świecy 1H"
  ],
  [
    "trigger.bar_close_15m",
    "Закриття 15m",
    "15m candle close",
    "Закрытие свечи 15m",
    "Zamknięcie świecy 15m"
  ],
  [
    "trigger.realtime",
    "Realtime (Миттєво)",
    "Realtime (immediate)",
    "Реальное время (мгновенно)",
    "Czas rzeczywisty (natychmiast)"
  ],
  [
    "telegram",
    "Telegram Сповіщення",
    "Telegram notifications",
    "Уведомления Telegram",
    "Powiadomienia Telegram"
  ],
  [
    "cancel",
    "Скасувати",
    "Cancel",
    "Отмена",
    "Anuluj"
  ],
  [
    "save",
    "Зберегти зміни",
    "Save changes",
    "Сохранить изменения",
    "Zapisz zmiany"
  ],
  [
    "monitor24h",
    "Стежити 24/7",
    "Monitor 24/7",
    "Отслеживать 24/7",
    "Monitoruj 24/7"
  ],
  [
    "removeSymbol",
    "Видалити {{symbol}} зі стеження",
    "Remove {{symbol}} from monitoring",
    "Удалить {{symbol}} из мониторинга",
    "Usuń {{symbol}} z monitoringu"
  ],
  [
    "removeTitle",
    "Видалити монету зі стеження",
    "Remove coin from monitoring",
    "Удалить монету из мониторинга",
    "Usuń monetę z monitoringu"
  ],
  [
    "removing",
    "Видалення…",
    "Removing…",
    "Удаление…",
    "Usuwanie…"
  ],
  [
    "remove",
    "Видалити",
    "Remove",
    "Удалить",
    "Usuń"
  ],
  [
    "removeFailed",
    "Не вдалося видалити. Повторіть спробу.",
    "Could not remove coin. Try again.",
    "Не удалось удалить монету. Повторите попытку.",
    "Nie udało się usunąć monety. Spróbuj ponownie."
  ],
  [
    "filter.all",
    "Всі ({{count}})",
    "All ({{count}})",
    "Все ({{count}})",
    "Wszystkie ({{count}})"
  ],
  [
    "filter.critical",
    "Критичні ({{count}})",
    "Critical ({{count}})",
    "Критические ({{count}})",
    "Krytyczne ({{count}})"
  ],
  [
    "filter.level",
    "Рівні ({{count}})",
    "Levels ({{count}})",
    "Уровни ({{count}})",
    "Poziomy ({{count}})"
  ],
  [
    "filter.structure",
    "Структура ({{count}})",
    "Structure ({{count}})",
    "Структура ({{count}})",
    "Struktura ({{count}})"
  ],
  [
    "filter.density",
    "Щільності ({{count}})",
    "Density walls ({{count}})",
    "Плотности ({{count}})",
    "Gęstości ({{count}})"
  ],
  [
    "filter.setup",
    "Сетапи ({{count}})",
    "Setups ({{count}})",
    "Сетапы ({{count}})",
    "Setupy ({{count}})"
  ],
  [
    "severity.critical",
    "Критично",
    "Critical",
    "Критично",
    "Krytyczne"
  ],
  [
    "severity.warning",
    "Увага",
    "Warning",
    "Внимание",
    "Uwaga"
  ],
  [
    "severity.info",
    "Інфо",
    "Info",
    "Инфо",
    "Informacje"
  ],
  [
    "qualityScore",
    "Якість",
    "Quality",
    "Качество",
    "Jakość"
  ],
  [
    "confluenceScore",
    "Конфлюенс",
    "Confluence",
    "Конфлюэнс",
    "Konfluencja"
  ],
  [
    "realtimeQuote",
    "У реальному часі",
    "Realtime order book",
    "В реальном времени",
    "Arkusz w czasie rzeczywistym"
  ],
  [
    "price",
    "Ціна:",
    "Price:",
    "Цена:",
    "Cena:"
  ],
  [
    "openOrderBook",
    "Відкрити стакан та аналітику монети",
    "Open order book and coin analytics",
    "Открыть стакан и аналитику монеты",
    "Otwórz arkusz zleceń i analizę monety"
  ],
  [
    "orderBook",
    "Стакан",
    "Order book",
    "Стакан",
    "Arkusz zleceń"
  ],
  [
    "openChart",
    "Відкрити графік",
    "Open chart",
    "Открыть график",
    "Otwórz wykres"
  ],
  [
    "chart",
    "Графік",
    "Chart",
    "График",
    "Wykres"
  ],
  [
    "showMoreEvents",
    "Показати більше подій (ще {{count}})",
    "Show more events ({{count}} remaining)",
    "Показать больше событий (ещё {{count}})",
    "Pokaż więcej zdarzeń (pozostało {{count}})"
  ],
  [
    "refreshNow",
    "Оновити зараз",
    "Refresh now",
    "Обновить сейчас",
    "Odśwież teraz"
  ],
  [
    "coinSettings",
    "Налаштування монети",
    "Coin settings",
    "Настройки монеты",
    "Ustawienia monety"
  ],
  [
    "pause",
    "Пауза",
    "Pause",
    "Пауза",
    "Pauza"
  ],
  [
    "monitor",
    "Стежити",
    "Monitor",
    "Отслеживать",
    "Monitoruj"
  ],
  [
    "removed",
    "#{{symbol}} видалено зі стеження",
    "#{{symbol}} removed from monitoring",
    "#{{symbol}} удалён из мониторинга",
    "Usunięto #{{symbol}} z monitoringu"
  ],
  [
    "domDensities",
    "Щільності DOM",
    "DOM order walls",
    "Плотности DOM",
    "Gęstości DOM"
  ],
  [
    "waitDensity",
    "Очікування щільності…",
    "Waiting for order walls…",
    "Ожидание плотности…",
    "Oczekiwanie na duże zlecenia…"
  ],
  [
    "waitDom",
    "Очікування DOM…",
    "Waiting for DOM…",
    "Ожидание DOM…",
    "Oczekiwanie na DOM…"
  ],
  [
    "noLevelsAbove",
    "Немає рівнів вище порогу",
    "No levels above threshold",
    "Нет уровней выше порога",
    "Brak poziomów powyżej progu"
  ],
  [
    "freshBookRequired",
    "Потрібен свіжий стакан",
    "Fresh order book required",
    "Требуется свежий стакан",
    "Wymagany aktualny arkusz zleceń"
  ],
  [
    "thirdTouch",
    "Третій дотик",
    "Third touch",
    "Третье касание",
    "Trzecie dotknięcie"
  ],
  [
    "waiting",
    "Очікування",
    "Waiting",
    "Ожидание",
    "Oczekiwanie"
  ],
  [
    "distance",
    "Дистанція: {{value}}%",
    "Distance: {{value}}%",
    "Расстояние: {{value}}%",
    "Odległość: {{value}}%"
  ],
  [
    "absent",
    "Відсутній",
    "Absent",
    "Отсутствует",
    "Brak"
  ],
  [
    "tradeFlow",
    "Торговельний потік (1m)",
    "Trade flow (1m)",
    "Торговый поток (1m)",
    "Przepływ transakcji (1m)"
  ],
  [
    "imbalance",
    "{{value}}x Дисбаланс",
    "{{value}}x imbalance",
    "{{value}}x дисбаланс",
    "Nierównowaga {{value}}x"
  ],
  [
    "balance",
    "Баланс",
    "Balanced",
    "Баланс",
    "Równowaga"
  ],
  [
    "openInterest",
    "Відкритий інтерес",
    "Open interest",
    "Открытый интерес",
    "Otwarte pozycje"
  ],
  [
    "marketStructure",
    "Структура ринку:",
    "Market structure:",
    "Структура рынка:",
    "Struktura rynku:"
  ],
  [
    "bookBacktest",
    "Стакан & Бектест",
    "Order book & backtest",
    "Стакан и бэктест",
    "Arkusz zleceń i backtest"
  ],
  [
    "exchangeBook",
    "Біржовий стакан",
    "Exchange order book",
    "Биржевой стакан",
    "Arkusz zleceń giełdy"
  ],
  [
    "searchDensities",
    "Пошук щільностей",
    "Search for order walls",
    "Поиск плотностей",
    "Wyszukiwanie dużych zleceń"
  ],
  [
    "confirmation",
    "Підтвердження",
    "Confirmation",
    "Подтверждение",
    "Potwierdzenie"
  ],
  [
    "levelRetest",
    "Підтримка / Повторне тестування рівня опору",
    "Support / Resistance level retest",
    "Поддержка / Повторный тест сопротивления",
    "Wsparcie / Ponowny test oporu"
  ],
  [
    "structureChange",
    "Зміна структури (BOS / CHoCH)",
    "Structure change (BOS / CHoCH)",
    "Смена структуры (BOS / CHoCH)",
    "Zmiana struktury (BOS / CHoCH)"
  ],
  [
    "channelRetest",
    "Канал / Повторне тестування рівня пробою",
    "Channel / Breakout level retest",
    "Канал / Повторный тест уровня пробоя",
    "Kanał / Ponowny test poziomu wybicia"
  ],
  [
    "density.turnoverUnavailable",
    "Немає обсягу за 24 год — діє консервативний поріг",
    "24h turnover unavailable — conservative threshold applied",
    "Нет объёма за 24 ч — используется консервативный порог",
    "Brak obrotu 24h — obowiązuje konserwatywny próg"
  ],
  [
    "density.depthCoverage",
    "Доступна глибина DOM",
    "Observed DOM coverage",
    "Доступная глубина DOM",
    "Dostępny zakres DOM"
  ],
  [
    "density.depthLimited",
    "За межами показаної глибини заявки невідомі; 3% може бути недоступно.",
    "Beyond the displayed book depth, liquidity is unknown; 3% may not be covered.",
    "За пределами доступной глубины заявки неизвестны; 3% могут быть недоступны.",
    "Poza widoczną głębokością zlecenia są nieznane; zasięg 3% może być niedostępny."
  ],
  [
    "density.largest",
    "Найбільші",
    "Largest",
    "Крупнейшие",
    "Największe"
  ],
  [
    "density.nearby",
    "До 3% від ціни",
    "Within 3% of price",
    "До 3% от цены",
    "Do 3% od ceny"
  ],
  [
    "density.observing",
    "Спостерігається",
    "Observing",
    "Наблюдается",
    "Obserwowany"
  ],
  [
    "density.confirmed",
    "Стійка",
    "Stable",
    "Устойчивая",
    "Stabilny"
  ],
  [
    "density.distance",
    "Відстань",
    "Distance",
    "Расстояние",
    "Odległość"
  ],
  [
    "density.observed",
    "Спостерігаємо",
    "Observed",
    "Наблюдаем",
    "Obserwujemy"
  ],
  [
    "density.observationHelp",
    "Час від першого виявлення сервером; не час постановки заявки на біржі.",
    "Time observed by this server, not exchange order placement time.",
    "Время с первого наблюдения сервером, не время постановки заявки на бирже.",
    "Czas obserwacji przez serwer, nie faktyczny czas złożenia zlecenia."
  ],
  [
    "density.collapse",
    "Згорнути",
    "Collapse",
    "Свернуть",
    "Zwiń"
  ],
  [
    "density.showMore",
    "Показати до {{count}} рівнів",
    "Show up to {{count}} levels",
    "Показать до {{count}} уровней",
    "Pokaż do {{count}} poziomów"
  ],
] as const;
const languages: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const surveillanceCoreUiStrings = Object.fromEntries(languages.map((language, index) => [
  language, Object.fromEntries(surveillanceCoreUiRows.map(row => ['surveillance.ui.' + row[0], row[index + 1]])),
])) as Record<SupportedLanguage, Record<string, string>>;
