/** UI texts found missing in the 2026-11-15 audit; preserve trading labels and numbers. */
import type { SupportedLanguage } from './types';

const rows = [
  [
    "Завантажити JSON-копію",
    "Download JSON backup",
    "Скачать JSON-копию",
    "Pobierz kopię JSON"
  ],
  [
    "Повернути хмарну версію",
    "Restore cloud version",
    "Восстановить облачную версию",
    "Przywróć wersję z chmury"
  ],
  [
    "Об'єм 24г:",
    "24h volume:",
    "Объём за 24 ч:",
    "Wolumen 24h:"
  ],
  [
    "Max 24г:",
    "24h high:",
    "Максимум за 24 ч:",
    "Maksimum 24h:"
  ],
  [
    "Min 24г:",
    "24h low:",
    "Минимум за 24 ч:",
    "Minimum 24h:"
  ],
  [
    "Котирування:",
    "Quotes:",
    "Котировки:",
    "Notowania:"
  ],
  [
    "Натисніть на зірочку біля монет у скрінері, щоб вони з'явились тут.",
    "Select the star next to a coin in Screener to see it here.",
    "Нажмите на звёздочку рядом с монетой в Скринере, чтобы она появилась здесь.",
    "Kliknij gwiazdkę obok monety w Skanerze, aby pojawiła się tutaj."
  ],
  [
    "Додайте графік будь-якої монети з біржі Binance або Bybit. Доступно понад 2,400+ монет від $50k до $10B.",
    "Add a chart for any Binance or Bybit coin. Over 2,400 coins are available, from $50k to $10B.",
    "Добавьте график любой монеты Binance или Bybit. Доступно более 2 400 монет от $50k до $10B.",
    "Dodaj wykres dowolnej monety z Binance lub Bybit. Dostępnych jest ponad 2400 monet od $50k do $10B."
  ],
  [
    "+ Додати перший графік",
    "+ Add the first chart",
    "+ Добавить первый график",
    "+ Dodaj pierwszy wykres"
  ],
  [
    "2,400+ монет на біржі ($50k - $10B)",
    "2,400+ exchange coins ($50k–$10B)",
    "Более 2 400 монет на биржах ($50k–$10B)",
    "Ponad 2400 monet na giełdach ($50k–$10B)"
  ],
  [
    "Застосувати стандартні налаштування",
    "Apply default settings",
    "Применить стандартные настройки",
    "Zastosuj ustawienia domyślne"
  ],
  [
    "Скинути всі фільтри",
    "Reset all filters",
    "Сбросить все фильтры",
    "Wyczyść wszystkie filtry"
  ],
  [
    "Статус",
    "Status",
    "Статус",
    "Status"
  ],
  [
    "Скинути технічні",
    "Reset technical filters",
    "Сбросить технические фильтры",
    "Zresetuj filtry techniczne"
  ],
  [
    "Натисніть на зірочку біля будь-якої монети в скринері, щоб додати її сюди.",
    "Tap the star beside any coin in Screener to add it here.",
    "Нажмите на звёздочку возле любой монеты в Скринере, чтобы добавить её сюда.",
    "Kliknij gwiazdkę przy dowolnej monecie w Skanerze, aby ją tu dodać."
  ],
  [
    "Натисніть на зірочку біля монет у таблиці чи картці формацій, щоб вони з'явились тут.",
    "Tap the star next to a coin in the table or formation card to see it here.",
    "Нажмите на звёздочку возле монеты в таблице или карточке формации, чтобы она появилась здесь.",
    "Kliknij gwiazdkę przy monecie w tabeli lub karcie formacji, aby pojawiła się tutaj."
  ],
  [
    "ПРОФІЛЬ",
    "PROFILE",
    "ПРОФИЛЬ",
    "PROFIL"
  ],
  [
    "Профіль",
    "Profile",
    "Профиль",
    "Profil"
  ],
  [
    "Пошук",
    "Search",
    "Поиск",
    "Szukaj"
  ],
  [
    "Встановіть H00K на Windows, Android, iPhone, Mac або Linux прямо із сайту.",
    "Install H00K for Windows, Android, iPhone, Mac, or Linux directly from the website.",
    "Установите H00K на Windows, Android, iPhone, Mac или Linux прямо с сайта.",
    "Zainstaluj H00K na Windows, Android, iPhone, Mac lub Linux bezpośrednio ze strony."
  ],
  [
    "збережено",
    "saved",
    "сохранено",
    "zapisano"
  ],
  [
    "Підключено",
    "Connected",
    "Подключено",
    "Połączono"
  ],
  [
    "Не налаштовано",
    "Not configured",
    "Не настроено",
    "Nie skonfigurowano"
  ],
  [
    "Індивідуальна ізоляція профілю",
    "Private profile isolation",
    "Изоляция данных профиля",
    "Izolacja danych profilu"
  ],
  [
    "Ваш архів збережених формацій, індивідуальні Telegram-сповіщення, лінковка торгових терміналів та список обраних монет надійно закріплені виключно за вашим обліковим записом.",
    "Your saved formations, personalized Telegram alerts, trading terminal linking, and watchlist are securely tied to your account only.",
    "Ваши сохранённые формации, персональные уведомления Telegram, связь с торговыми терминалами и избранные монеты надёжно привязаны только к вашей учётной записи.",
    "Zapisane formacje, spersonalizowane powiadomienia Telegram, połączenia z terminalami i lista obserwowanych monet są bezpiecznie przypisane wyłącznie do Twojego konta."
  ],
  [
    "Застосовуються на всіх сторінках сайту як значення за замовчуванням та зберігаються у профілі",
    "Used as defaults across all site pages and saved in your profile",
    "Применяются по умолчанию на всех страницах сайта и сохраняются в профиле",
    "Stosowane domyślnie na wszystkich stronach i zapisywane w profilu"
  ],
  [
    "Біржа за замовчуванням",
    "Default exchange",
    "Биржа по умолчанию",
    "Domyślna giełda"
  ],
  [
    "Ринок за замовчуванням",
    "Default market",
    "Рынок по умолчанию",
    "Domyślny rynek"
  ],
  [
    "Таймфрейм за замовчуванням",
    "Default timeframe",
    "Таймфрейм по умолчанию",
    "Domyślny interwał"
  ],
  [
    "Часовий пояс",
    "Time zone",
    "Часовой пояс",
    "Strefa czasowa"
  ],
  [
    "Завершити",
    "End session",
    "Завершить сеанс",
    "Zakończ sesję"
  ],
  [
    "Завершити всі сеанси",
    "End all sessions",
    "Завершить все сеансы",
    "Zakończ wszystkie sesje"
  ],
  [
    "Прив'язано до вашого профілю:",
    "Linked to your profile:",
    "Привязано к вашему профилю:",
    "Powiązano z Twoim profilem:"
  ],
  [
    "Видалити всі",
    "Delete all",
    "Удалить всё",
    "Usuń wszystkie"
  ],
  [
    "формацій з вашого особистого архіву? Інші користувачі не будуть зачеплені.",
    "formations from your personal archive? Other users will not be affected.",
    "формаций из вашего личного архива? Другие пользователи не будут затронуты.",
    "formacji z Twojego prywatnego archiwum? Nie wpłynie to na innych użytkowników."
  ],
  [
    "Так",
    "Yes",
    "Да",
    "Tak"
  ],
  [
    "Ціль (Тейк):",
    "Target (take-profit):",
    "Цель (тейк-профит):",
    "Cel (take-profit):"
  ],
  [
    "Ціна збереження:",
    "Price at save:",
    "Цена при сохранении:",
    "Cena przy zapisie:"
  ],
  [
    "Всього в особистому архіві:",
    "Total in personal archive:",
    "Всего в личном архиве:",
    "Łącznie w prywatnym archiwum:"
  ],
  [
    "Всі збереження ізольовані та захищені правилами безпеки",
    "All saved items are isolated and protected by security rules",
    "Все сохранённые данные изолированы и защищены правилами безопасности",
    "Wszystkie zapisane dane są odizolowane i chronione regułami bezpieczeństwa"
  ],
  [
    "Комплексний моніторинг ринку на серверах h00k.top: Local Order Book, Multi-Timeframe структура, рівні, щільності та Telegram алерти",
    "Comprehensive market monitoring on h00k.top servers: local order book, multi-timeframe structure, levels, liquidity walls, and Telegram alerts",
    "Комплексный мониторинг рынка на серверах h00k.top: локальный стакан, мультитаймфреймовая структура, уровни, плотности и оповещения Telegram",
    "Kompleksowy monitoring rynku na serwerach h00k.top: lokalny arkusz zleceń, struktura wielu interwałów, poziomy, duże zlecenia i alerty Telegram"
  ],
  [
    "LIVE СТРІЧКА 24/7",
    "LIVE FEED 24/7",
    "ЛЕНТА LIVE 24/7",
    "STRUMIEŃ LIVE 24/7"
  ],
  [
    "Хронологічний лог тестів рівнів, щільностей стакану, пробоїв, змін структури та сигналів сетапів",
    "Chronological log of level tests, order-book liquidity walls, breakouts, structure changes, and setup signals",
    "Хронологический журнал тестов уровней, плотностей стакана, пробоев, изменений структуры и сигналов сетапов",
    "Chronologiczny dziennik testów poziomów, dużych zleceń w arkuszu, wybić, zmian struktury i sygnałów setupów"
  ],
  [
    "Оберіть монети нижче та натисніть «Стежити». Сервер веде безперервний 24/7 моніторинг ринку через WebSockets навіть при вимкненому комп'ютері.",
    "Choose coins below and tap “Monitor”. The server monitors the market continuously via WebSockets, even when your computer is turned off.",
    "Выберите монеты ниже и нажмите «Следить». Сервер непрерывно отслеживает рынок через WebSocket, даже когда компьютер выключен.",
    "Wybierz monety poniżej i kliknij „Obserwuj”. Serwer monitoruje rynek nieprzerwanie przez WebSocket, nawet gdy komputer jest wyłączony."
  ],
  [
    "+ Обрати монету для стеження",
    "+ Select coin to monitor",
    "+ Выбрать монету для наблюдения",
    "+ Wybierz monetę do monitorowania"
  ],
  [
    "Стеження 24/7",
    "24/7 monitoring",
    "Наблюдение 24/7",
    "Monitoring 24/7"
  ],
  [
    "24/7 Нагляд активний: очікування тесту рівнів, пробою або щільності",
    "24/7 monitoring active: waiting for a level test, breakout, or liquidity wall",
    "Наблюдение 24/7 активно: ожидание теста уровня, пробоя или плотности",
    "Monitoring 24/7 aktywny: oczekiwanie testu poziomu, wybicia lub dużego zlecenia"
  ],
  [
    "Біржовий стакан, Торговельний потік, активні сетапи та каузальний бектест",
    "Order book, trade flow, active setups, and causal backtest",
    "Биржевой стакан, поток сделок, активные сетапы и каузальный бэктест",
    "Arkusz zleceń, przepływ transakcji, aktywne setupy i test historyczny bez podglądu przyszłości"
  ],
  [
    "Живий стакан доступний для активної монети після підключення до біржі. Бектест можна запустити окремо.",
    "Live order book is available for an active coin after connecting to the exchange. Backtesting can run separately.",
    "Живой стакан доступен для активной монеты после подключения к бирже. Бэктест можно запустить отдельно.",
    "Arkusz zleceń na żywo jest dostępny po połączeniu z giełdą. Test historyczny można uruchomić osobno."
  ],
  [
    "Закриті біржові свічки 15m: TP 1.5%, SL 0.8%, горизонт 4h. Історичний DOM не відтворюється. Це модель за OHLC без комісій та прослизання, а не звіт про виконані угоди.",
    "Closed exchange 15m candles: TP 1.5%, SL 0.8%, 4h horizon. Historical DOM is not replayed. This is an OHLC model without fees or slippage, not a record of executed trades.",
    "Закрытые биржевые свечи 15m: TP 1.5%, SL 0.8%, горизонт 4h. Исторический DOM не воспроизводится. Это модель на OHLC без комиссий и проскальзывания, а не отчёт о реальных сделках.",
    "Zamknięte świece giełdowe 15m: TP 1.5%, SL 0.8%, horyzont 4h. Historyczny DOM nie jest odtwarzany. To model OHLC bez prowizji i poślizgu, nie raport wykonanych transakcji."
  ],
  [
    "РЕЖИМ ВІДТВОРЕННЯ",
    "REPLAY MODE",
    "РЕЖИМ ВОСПРОИЗВЕДЕНИЯ",
    "TRYB ODTWARZANIA"
  ],
  [
    "🎯 Автофокус на свічках",
    "🎯 Focus on candles",
    "🎯 Автофокус на свечах",
    "🎯 Automatyczne skupienie na świecach"
  ],
  [
    "Повний список монет на біржі від $50k до $10B (Binance & Bybit, Futures & Spot)",
    "Complete exchange coin list from $50k to $10B (Binance & Bybit, futures & spot)",
    "Полный список монет на биржах от $50k до $10B (Binance и Bybit, фьючерсы и спот)",
    "Pełna lista monet od $50k do $10B (Binance i Bybit, kontrakty i spot)"
  ],
  [
    "Досягнуто ліміт 50 графіків. Видаліть один із поточних графіків, щоб додати інший. Збережені графіки не видаляються автоматично.",
    "50-chart limit reached. Remove an existing chart to add another. Saved charts are never removed automatically.",
    "Достигнут лимит в 50 графиков. Удалите один из текущих графиков, чтобы добавить другой. Сохранённые графики не удаляются автоматически.",
    "Osiągnięto limit 50 wykresów. Usuń jeden z obecnych, aby dodać nowy. Zapisane wykresy nie są usuwane automatycznie."
  ],
  [
    "Швидко додати графік для",
    "Quickly add a chart for",
    "Быстро добавить график для",
    "Szybko dodaj wykres dla"
  ],
  [
    "Вкладка:",
    "Tab:",
    "Вкладка:",
    "Karta:"
  ],
  [
    "Топ за обсягом",
    "Top by volume",
    "Топ по объёму",
    "Największy wolumen"
  ],
  [
    "З формаціями",
    "With formations",
    "С формациями",
    "Z formacjami"
  ],
  [
    "Фʼючерси",
    "Futures",
    "Фьючерсы",
    "Kontrakty"
  ],
  [
    "1 колонка (Стандарт)",
    "1 column (standard)",
    "1 колонка (стандарт)",
    "1 kolumna (standard)"
  ],
  [
    "2 колонки (Широкий)",
    "2 columns (wide)",
    "2 колонки (широкий)",
    "2 kolumny (szeroko)"
  ],
  [
    "3 колонки (Дуже широкий)",
    "3 columns (extra wide)",
    "3 колонки (очень широкий)",
    "3 kolumny (bardzo szeroko)"
  ],
  [
    "Повна ширина",
    "Full width",
    "Полная ширина",
    "Pełna szerokość"
  ],
  [
    "Автоматична висота",
    "Automatic height",
    "Автоматическая высота",
    "Automatyczna wysokość"
  ],
  [
    "Віджет призупинено поза видимою областю. Прокрутіть до блока, щоб завантажити його.",
    "Widget paused outside the visible area. Scroll to the chart to load it.",
    "Виджет приостановлен вне видимой области. Прокрутите до блока, чтобы загрузить его.",
    "Widżet wstrzymany poza widocznym obszarem. Przewiń do wykresu, aby go załadować."
  ]
] as const;
const languages: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const audit20261115Phrases = Object.fromEntries(
  languages.map((language, index) => [language, Object.fromEntries(rows.map(row => [row[0], row[index]]))]),
) as Record<SupportedLanguage, Record<string, string>>;
export const audit20261115Rows = rows;
