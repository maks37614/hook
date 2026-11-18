/**
 * Static navigation metadata: this module does not import charting, exchange
 * connections, user data or CSS. It is also directly testable in Node.
 */
export type ScreenerTourLanguage = 'uk' | 'en' | 'pl' | 'ru';
export type ScreenerTourChapter = 'navigation' | 'filters' | 'market' | 'tools';
export const SCREENER_TOUR_STEPS = [
  { key: 'screener', selector: '#nav-category-screener-btn', chapter: 'navigation' },
  { key: 'formations', selector: '#nav-category-patterns-btn', chapter: 'navigation' },
  { key: 'replay', selector: '#nav-category-replay-btn', chapter: 'navigation' },
  { key: 'terminal', selector: '#nav-category-terminal-btn', chapter: 'navigation' },
  { key: 'monitoring', selector: '#open-surveillance-btn', chapter: 'navigation' },
  { key: 'encyclopedia', selector: '#open-guide-btn', chapter: 'navigation' },
  { key: 'presets', selector: '[data-screener-guide="presets"]', chapter: 'filters' },
  { key: 'search', selector: '[data-screener-guide="search"]', chapter: 'filters' },
  { key: 'exchange', selector: '[data-screener-guide="exchange"]', chapter: 'filters' },
  { key: 'market', selector: '[data-screener-guide="market"]', chapter: 'filters' },
  { key: 'sort', selector: '[data-screener-filter="sort"]', chapter: 'filters' },
  { key: 'volume', selector: '[data-screener-filter="volume"]', chapter: 'filters' },
  { key: 'sentiment', selector: '[data-screener-guide="sentiment"]', chapter: 'market' },
  { key: 'views', selector: '[data-screener-guide="views"]', chapter: 'market' },
  { key: 'results', selector: '[data-screener-guide="results"]', chapter: 'market' },
  { key: 'watchlist', selector: '#open-watchlist-btn', chapter: 'tools' },
  { key: 'telegram', selector: '#open-telegram-btn', chapter: 'tools' },
  { key: 'notifications', selector: '#open-site-notifications-btn', chapter: 'tools' },
  { key: 'archive', selector: '#open-archive-btn', chapter: 'tools' },
  { key: 'account', selector: '#user-profile-btn, #auth-login-btn', chapter: 'tools' },
] as const satisfies readonly { key: string; selector: string; chapter: ScreenerTourChapter }[];

export type ScreenerTourStepKey = typeof SCREENER_TOUR_STEPS[number]['key'];
export type ScreenerTourText = { title: string; description: string };
export type ScreenerTourCopy = {
  label: string; pagesLabel: string; close: string; previous: string; next: string; finish: string;
  step: string; of: string; note: string;
  chapters: Record<ScreenerTourChapter, string>;
  steps: Record<ScreenerTourStepKey, ScreenerTourText>;
};

export const SCREENER_TOUR_COPY: Record<ScreenerTourLanguage, ScreenerTourCopy> = {
  uk: {
    label: 'Гайд по Скрінеру', pagesLabel: 'Гайд по сторінках сайту', close: 'Закрити гайд', previous: 'Назад', next: 'Далі', finish: 'Завершити',
    step: 'Крок', of: 'із', note: 'Навчання лише показує елементи: фільтри, збережені монети й сповіщення не змінюються автоматично.',
    chapters: { navigation: 'Розділи', filters: 'Пошук', market: 'Монети', tools: 'Інструменти' },
    steps: {
      screener: { title: 'Скрінер — головна сторінка', description: 'Тут зібрано список криптовалют, котирування, обсяги, зміни цін і швидкий перехід до графіків. Кнопка «Скрінер» повертає до цієї сторінки.' },
      formations: { title: 'Формації та патерни', description: 'Тут система шукає торгові формації та показує їхні оцінки, умови й точки на графіку. Частина можливостей доступна після входу.' },
      replay: { title: 'Тестування на реальному ринку (Replay)', description: 'Історичне покрокове відтворення свічок для тренування й перевірки ідей. Це симуляція без справжніх ордерів.' },
      terminal: { title: 'Термінал — декілька графіків', description: 'Тут можна одночасно стежити за кількома монетами, змінювати розташування графіків і таймфрейми. Для частини функцій потрібна авторизація.' },
      monitoring: { title: 'Моніторинг монет 24/7', description: 'Розділ нагляду за вибраними монетами: правила перевірки ціни та подій, стан спостереження й сповіщення.' },
      encyclopedia: { title: 'Довідник формацій', description: 'Іконка книги відкриває пояснення торгових формацій. Це довідковий матеріал, а не сигнал до входу.' },
      presets: { title: 'Готові категорії монет', description: 'Обирайте всі, активні, лідери зростання або падіння, монети біля максимумів чи мінімумів. Це швидкі фільтри списку.' },
      search: { title: 'Пошук монети й збережені пресети', description: 'Введіть тикер або назву, щоб знайти монету. Авторизовані користувачі можуть відкривати власні збережені набори фільтрів.' },
      exchange: { title: 'Вибір біржі', description: 'Відбирайте монети з Binance, Bybit або обох бірж. Біржа залишається частиною ідентифікатора монети й графіка.' },
      market: { title: 'Futures або Spot', description: 'Показуйте лише ф’ючерсні, лише спотові або всі доступні монети. Деякі дані, зокрема ліквідації й OI, доступні саме для ф’ючерсів.' },
      sort: { title: 'Сортування скрінера', description: 'Виберіть показник сортування: ціна, її зміна, обсяг, волатильність та інші доступні поля. Стрілка змінює напрямок сортування.' },
      volume: { title: 'Обсяг торгів за 24 години', description: 'Установіть поріг у USDT. Стрілка змінює режим «від» (не менше суми) або «до» (не більше суми). Обидва режими фільтрують монети.' },
      sentiment: { title: 'Настрій крипторинку', description: 'Блок показує загальну оцінку настрою ринку. Його варто використовувати як додатковий контекст, а не як самостійний торговий сигнал.' },
      views: { title: 'Таблиця або картки', description: 'Перемикайте компактну таблицю й окремі картки монет. Налаштування змінює вигляд результатів, а не котирування.' },
      results: { title: 'Список знайдених монет', description: 'Тут з’являються монети, які пройшли фільтри. Натисніть на монету, щоб відкрити її графік; для деяких дій сайт запропонує увійти.' },
      watchlist: { title: 'Обрані монети', description: 'Кнопка з закладкою відкриває обрані монети й папки. Додайте монету з рядка або картки, щоб швидко повертатися до неї.' },
      telegram: { title: 'Telegram-сповіщення', description: 'Тут налаштовуються сповіщення про ціну та інші підтримувані події через Telegram. Для налаштування необхідний обліковий запис.' },
      notifications: { title: 'Сповіщення на сайті', description: 'Дзвіночок показує повідомлення всередині сайту, а також переходи до пов’язаних монет і параметрів сповіщень.' },
      archive: { title: 'Архів формацій', description: 'В архіві зберігаються вибрані формації та пов’язані графіки. Збереження доступне користувачам із профілем.' },
      account: { title: 'Профіль та налаштування', description: 'Через цю кнопку можна увійти або відкрити свій профіль: налаштування скрінера, графіків, пошуку та сповіщень.' },
    },
  },
  en: {
    label: 'Screener tour', pagesLabel: 'Site pages guide', close: 'Close tour', previous: 'Back', next: 'Next', finish: 'Finish',
    step: 'Step', of: 'of', note: 'This tour only points out controls; it never changes filters, favorites or alerts on its own.',
    chapters: { navigation: 'Pages', filters: 'Search', market: 'Coins', tools: 'Tools' },
    steps: {
      screener: { title: 'Screener: your home page', description: 'See crypto markets, quotes, volumes, price changes and quick chart access. Select Screener to return to this list.' },
      formations: { title: 'Patterns and formations', description: 'Browse detected trading patterns with quality assessments, conditions and chart levels. Some features require sign-in.' },
      replay: { title: 'Market Replay', description: 'Explore historical candles step by step to practice and test ideas. This is a simulation, not live order placement.' },
      terminal: { title: 'Terminal: multiple charts', description: 'Follow several coins at once, arrange charts and select timeframes. Some options require an account.' },
      monitoring: { title: '24/7 coin monitoring', description: 'Manage the watch service for selected coins, price and event conditions, monitoring status and alerts.' },
      encyclopedia: { title: 'Pattern reference guide', description: 'The book icon opens explanations of trading formations. Educational information is not an entry signal.' },
      presets: { title: 'Quick coin categories', description: 'Choose all coins, active coins, top gainers or losers, or coins near their highs and lows.' },
      search: { title: 'Coin search and saved presets', description: 'Search by ticker or name. Signed-in users can also apply their saved search configurations.' },
      exchange: { title: 'Select an exchange', description: 'Filter for Binance, Bybit or both. The exchange remains part of each coin’s chart identity.' },
      market: { title: 'Futures and Spot', description: 'Select futures, spot or all markets. Some data, including liquidations and open interest, is futures-specific.' },
      sort: { title: 'Sort the market list', description: 'Sort by price, price change, volume, volatility or other available metrics. Use the arrow to reverse the order.' },
      volume: { title: '24-hour trading volume', description: 'Set a volume threshold in USDT. The direction switch selects a minimum (from) or a maximum (up to).' },
      sentiment: { title: 'Crypto market sentiment', description: 'A broad market-mood reading. Use it as context rather than a standalone trading signal.' },
      views: { title: 'Table or card layout', description: 'Switch between a compact table and coin cards. This changes presentation, not the underlying market data.' },
      results: { title: 'Matching coins', description: 'Coins passing the filters appear here. Select a coin to open its chart; some actions may require sign-in.' },
      watchlist: { title: 'Watchlist and folders', description: 'The bookmark opens your favorite coins and folders. Add coins from rows or cards for easy access.' },
      telegram: { title: 'Telegram alerts', description: 'Configure supported price and event alerts delivered via Telegram. An account is required.' },
      notifications: { title: 'On-site notifications', description: 'The bell opens notifications within the site, including links to related coins and alert settings.' },
      archive: { title: 'Saved formations archive', description: 'Find saved trading patterns and associated chart snapshots. Saving requires a user account.' },
      account: { title: 'Account and settings', description: 'Sign in or open your profile to configure Screener, charts, search and notifications.' },
    },
  },
  pl: {
    label: 'Przewodnik po skanerze', pagesLabel: 'Przewodnik po stronach serwisu', close: 'Zamknij przewodnik', previous: 'Wstecz', next: 'Dalej', finish: 'Zakończ',
    step: 'Krok', of: 'z', note: 'Przewodnik wyłącznie pokazuje opcje i sam nie zmienia filtrów, ulubionych monet ani alertów.',
    chapters: { navigation: 'Strony', filters: 'Wyszukiwanie', market: 'Monety', tools: 'Narzędzia' },
    steps: {
      screener: { title: 'Skaner: strona główna', description: 'Lista kryptowalut z notowaniami, wolumenem, zmianami cen i szybkim dostępem do wykresów. Przycisk Skaner przywraca tę stronę.' },
      formations: { title: 'Formacje i wzorce', description: 'Przeglądaj znalezione formacje, ocenę jakości, warunki i poziomy na wykresie. Część funkcji wymaga zalogowania.' },
      replay: { title: 'Odtwarzanie rynku', description: 'Przeglądaj historyczne świece krok po kroku, aby ćwiczyć i testować pomysły. To symulacja bez prawdziwych zleceń.' },
      terminal: { title: 'Terminal: wiele wykresów', description: 'Obserwuj kilka monet jednocześnie, zmieniaj układ wykresów i interwały. Niektóre funkcje wymagają konta.' },
      monitoring: { title: 'Monitoring monet 24/7', description: 'Zarządzaj obserwacją wybranych monet, warunkami cenowymi i zdarzeniami oraz powiadomieniami.' },
      encyclopedia: { title: 'Przewodnik po formacjach', description: 'Ikona książki otwiera objaśnienia formacji. Materiał edukacyjny nie jest sygnałem wejścia.' },
      presets: { title: 'Szybkie kategorie monet', description: 'Wybierz wszystkie monety, aktywne, największe wzrosty lub spadki, monety blisko maksimów albo minimów.' },
      search: { title: 'Wyszukiwanie i zapisane filtry', description: 'Szukaj po nazwie lub symbolu monety. Zalogowani mogą także wybrać zapisane ustawienia wyszukiwania.' },
      exchange: { title: 'Wybór giełdy', description: 'Filtruj monety z Binance, Bybit lub obu giełd. Giełda jest częścią identyfikacji monety na wykresie.' },
      market: { title: 'Futures i Spot', description: 'Wybierz rynek terminowy, spot albo wszystkie. Niektóre dane, jak likwidacje i otwarte pozycje, dotyczą kontraktów futures.' },
      sort: { title: 'Sortowanie skanera', description: 'Sortuj według ceny, zmiany ceny, wolumenu, zmienności i innych wartości. Strzałka zmienia kierunek.' },
      volume: { title: 'Wolumen handlu 24h', description: 'Ustal próg wolumenu w USDT. Przełącznik wybiera minimum („od”) albo maksimum („do”).' },
      sentiment: { title: 'Nastrój rynku krypto', description: 'Ogólny wskaźnik nastroju rynku. Traktuj go jako kontekst, a nie samodzielny sygnał transakcyjny.' },
      views: { title: 'Tabela lub kafelki', description: 'Przełączaj widok tabeli i kart monet. Zmienia się układ, a nie dane rynkowe.' },
      results: { title: 'Znalezione monety', description: 'Tutaj trafiają monety spełniające filtry. Dotknij monety, aby otworzyć wykres; niektóre działania wymagają zalogowania.' },
      watchlist: { title: 'Ulubione monety', description: 'Przycisk zakładki otwiera zapisane monety i foldery. Dodawaj je z tabeli lub kafelków.' },
      telegram: { title: 'Alerty Telegram', description: 'Ustaw powiadomienia o cenie i innych obsługiwanych zdarzeniach przez Telegram. Wymagane jest konto.' },
      notifications: { title: 'Powiadomienia na stronie', description: 'Dzwonek otwiera powiadomienia, powiązane monety i ustawienia alertów.' },
      archive: { title: 'Archiwum formacji', description: 'Zapisane formacje i związane z nimi wykresy. Zapisywanie wymaga profilu.' },
      account: { title: 'Profil i ustawienia', description: 'Zaloguj się lub otwórz profil, aby zmienić ustawienia skanera, wykresów, wyszukiwania i alertów.' },
    },
  },
  ru: {
    label: 'Гид по скринеру', pagesLabel: 'Гид по страницам сайта', close: 'Закрыть гид', previous: 'Назад', next: 'Далее', finish: 'Завершить',
    step: 'Шаг', of: 'из', note: 'Гид лишь показывает элементы и не изменяет фильтры, избранные монеты или уведомления.',
    chapters: { navigation: 'Разделы', filters: 'Поиск', market: 'Монеты', tools: 'Инструменты' },
    steps: {
      screener: { title: 'Скринер — главная страница', description: 'Список криптовалют, котировки, объёмы, изменения цен и быстрый переход к графикам. Кнопка «Скринер» возвращает на страницу.' },
      formations: { title: 'Формации и паттерны', description: 'Просматривайте найденные формации, оценку качества, условия и уровни графика. Некоторые возможности требуют входа.' },
      replay: { title: 'Тестирование рынка (Replay)', description: 'Историческое пошаговое воспроизведение свечей для практики и проверки идей. Это симуляция без реальных ордеров.' },
      terminal: { title: 'Терминал — несколько графиков', description: 'Следите за несколькими монетами, меняйте расположение графиков и таймфреймы. Часть функций доступна после входа.' },
      monitoring: { title: 'Мониторинг монет 24/7', description: 'Настраивайте наблюдение за монетами, ценовыми условиями и событиями, проверяйте состояние мониторинга и уведомлений.' },
      encyclopedia: { title: 'Справочник формаций', description: 'Иконка книги открывает объяснения торговых формаций. Это образовательный материал, не торговый сигнал.' },
      presets: { title: 'Быстрые категории монет', description: 'Выбирайте все, активные, лидеров роста или падения, монеты около максимумов и минимумов.' },
      search: { title: 'Поиск и сохранённые фильтры', description: 'Ищите по тикеру или названию. После входа можно применять сохранённые настройки поиска.' },
      exchange: { title: 'Выбор биржи', description: 'Фильтруйте Binance, Bybit или обе биржи. Биржа является частью идентификатора монеты на графике.' },
      market: { title: 'Futures и Spot', description: 'Выберите фьючерсы, спот или все рынки. Ликвидации и открытый интерес доступны в основном для фьючерсов.' },
      sort: { title: 'Сортировка скринера', description: 'Сортируйте по цене, изменению, объёму, волатильности и другим полям. Стрелка меняет направление.' },
      volume: { title: 'Торговый объём за 24 часа', description: 'Задайте порог в USDT. Переключатель выбирает минимум («от») или максимум («до»).' },
      sentiment: { title: 'Настроение крипторынка', description: 'Общая оценка настроения рынка. Используйте как контекст, а не самостоятельный сигнал.' },
      views: { title: 'Таблица или карточки', description: 'Переключайте компактную таблицу и карточки монет. Это меняет только отображение данных.' },
      results: { title: 'Найденные монеты', description: 'Здесь отображаются монеты, прошедшие фильтры. Нажмите монету для графика; некоторые действия требуют входа.' },
      watchlist: { title: 'Избранные монеты', description: 'Закладка открывает избранное и папки. Добавляйте монеты из строк или карточек.' },
      telegram: { title: 'Telegram-уведомления', description: 'Настройте уведомления о цене и других поддерживаемых событиях в Telegram. Необходим аккаунт.' },
      notifications: { title: 'Уведомления на сайте', description: 'Колокольчик открывает сообщения сайта, связанные монеты и настройки оповещений.' },
      archive: { title: 'Архив формаций', description: 'Здесь находятся сохранённые формации и связанные графики. Для сохранения нужен профиль.' },
      account: { title: 'Профиль и настройки', description: 'Войдите или откройте профиль, чтобы настроить скринер, графики, поиск и уведомления.' },
    },
  },
};

export function screenerTourLanguage(value: string): ScreenerTourLanguage {
  return Object.prototype.hasOwnProperty.call(SCREENER_TOUR_COPY, value)
    ? value as ScreenerTourLanguage : 'uk';
}
