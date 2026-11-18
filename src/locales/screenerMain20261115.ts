/** Screener main page UI copy, not market/scanner data. */
import type { SupportedLanguage } from './types';

export const screenerMainRows = [
  [
    "navigation",
    "Навігація скрінера",
    "Screener navigation",
    "Навигация скринера",
    "Nawigacja skanera"
  ],
  [
    "toTop",
    "На початок списку монет",
    "Go to the top of the coin list",
    "В начало списка монет",
    "Na początek listy monet"
  ],
  [
    "toBottom",
    "У кінець списку монет",
    "Go to the end of the coin list",
    "В конец списка монет",
    "Na koniec listy monet"
  ],
  [
    "openWatchlist",
    "Відкрити обрані монети",
    "Open favorite coins",
    "Открыть избранные монеты",
    "Otwórz ulubione monety"
  ],
  [
    "watchlistGuest",
    "Обрані монети (тільки для зареєстрованих)",
    "Favorite coins (registered users only)",
    "Избранные монеты (только для зарегистрированных)",
    "Ulubione monety (tylko dla zarejestrowanych)"
  ],
  [
    "watchlist",
    "Обрані монети",
    "Favorite coins",
    "Избранные монеты",
    "Ulubione monety"
  ],
  [
    "search",
    "Пошук монет",
    "Search coins",
    "Поиск монет",
    "Szukaj monet"
  ],
  [
    "clearSearch",
    "Очистити пошук монет",
    "Clear coin search",
    "Очистить поиск монет",
    "Wyczyść wyszukiwanie monet"
  ],
  [
    "expandPresets",
    "Розгорнути пресети пошуку",
    "Open search presets",
    "Развернуть пресеты поиска",
    "Rozwiń presety wyszukiwania"
  ],
  [
    "searchPresets",
    "Пресети пошуку",
    "Search presets",
    "Пресеты поиска",
    "Presety wyszukiwania"
  ],
  [
    "applyDefault",
    "Застосувати стандартні налаштування",
    "Apply default settings",
    "Применить стандартные настройки",
    "Zastosuj ustawienia domyślne"
  ],
  [
    "refreshQuotes",
    "Оновити котирування",
    "Refresh quotes",
    "Обновить котировки",
    "Odśwież notowania"
  ],
  [
    "sortLabel",
    "Сортувати:",
    "Sort by:",
    "Сортировать:",
    "Sortuj według:"
  ],
  [
    "sortDesc",
    "За спаданням",
    "Descending order",
    "По убыванию",
    "Malejąco"
  ],
  [
    "sortAsc",
    "За зростанням",
    "Ascending order",
    "По возрастанию",
    "Rosnąco"
  ],
  [
    "volumeSwitchFrom",
    "Перемкнути обсяг на Від (≥)",
    "Switch volume filter to From (≥)",
    "Переключить объём на От (≥)",
    "Przełącz wolumen na Od (≥)"
  ],
  [
    "volumeSwitchTo",
    "Перемкнути обсяг на До (≤)",
    "Switch volume filter to Up to (≤)",
    "Переключить объём на До (≤)",
    "Przełącz wolumen na Do (≤)"
  ],
  [
    "volumeTooltipTo",
    "Показано монети з обсягом не більше вибраного (≤). Перемкнути на від (≥).",
    "Showing coins with volume at or below the selected limit (≤). Switch to minimum (≥).",
    "Показаны монеты с объёмом не выше выбранного (≤). Переключить на минимум (≥).",
    "Pokazywane są monety z wolumenem nie większym niż wybrany (≤). Przełącz na minimum (≥)."
  ],
  [
    "volumeTooltipFrom",
    "Показано монети з обсягом не менше вибраного (≥). Перемкнути на до (≤).",
    "Showing coins with volume at or above the selected minimum (≥). Switch to maximum (≤).",
    "Показаны монеты с объёмом не ниже выбранного (≥). Переключить на максимум (≤).",
    "Pokazywane są monety z wolumenem nie mniejszym niż wybrany (≥). Przełącz na maksimum (≤)."
  ],
  [
    "foundCount",
    "Знайдено: {{matched}} з {{total}}",
    "Found: {{matched}} of {{total}}",
    "Найдено: {{matched}} из {{total}}",
    "Znaleziono: {{matched}} z {{total}}"
  ],
  [
    "filterLabel",
    "Фільтр: {{name}}",
    "Filter: {{name}}",
    "Фильтр: {{name}}",
    "Filtr: {{name}}"
  ],
  [
    "filterActive",
    "Активні",
    "Active",
    "Активные",
    "Aktywne"
  ],
  [
    "filterGainers",
    "Топ зростання",
    "Top gainers",
    "Лидеры роста",
    "Największe wzrosty"
  ],
  [
    "filterLosers",
    "Топ падіння",
    "Top losers",
    "Лидеры падения",
    "Największe spadki"
  ],
  [
    "filterHighs",
    "На максимумах",
    "Near highs",
    "У максимумов",
    "Blisko maksimów"
  ],
  [
    "filterLows",
    "На мінімумах",
    "Near lows",
    "У минимумов",
    "Blisko minimów"
  ],
  [
    "updated",
    "Оновлено: {{time}}",
    "Updated: {{time}}",
    "Обновлено: {{time}}",
    "Zaktualizowano: {{time}}"
  ],
  [
    "retry",
    "Повторити",
    "Retry",
    "Повторить",
    "Ponów"
  ],
  [
    "guestTitle",
    "Гостьовий доступ до Скрінера",
    "Guest access to Screener",
    "Гостевой доступ к Скринеру",
    "Dostęp gościa do Skanera"
  ],
  [
    "guestReadOnly",
    "Тільки перегляд списку",
    "List view only",
    "Только просмотр списка",
    "Tylko przeglądanie listy"
  ],
  [
    "guestIntro",
    "Вам доступний перегляд списку монет, котирувань та аналітичних фільтрів. Щоб відкривати",
    "You can view the coin list, quotes, and analytical filters. To open",
    "Вам доступен просмотр списка монет, котировок и аналитических фильтров. Чтобы открывать",
    "Możesz przeglądać listę monet, notowania i filtry analityczne. Aby otwierać"
  ],
  [
    "guestCharts",
    "графіки",
    "charts",
    "графики",
    "wykresy"
  ],
  [
    "guestBetweenChartsAndAlerts",
    ", налаштовувати",
    ", configure",
    ", настраивать",
    ", konfigurować"
  ],
  [
    "guestAlerts",
    "сповіщення в Telegram",
    "Telegram alerts",
    "уведомления в Telegram",
    "powiadomienia w Telegramie"
  ],
  [
    "guestBetweenAlertsAndLink",
    "та використовувати",
    "and use",
    "и использовать",
    "oraz korzystać z"
  ],
  [
    "guestLink",
    "лінковку з торговим терміналом",
    "trading terminal linking",
    "связь с торговым терминалом",
    "integracji z terminalem handlowym"
  ],
  [
    "guestEnd",
    ", увійдіть або зареєструйтесь.",
    ", sign in or register.",
    ", войдите или зарегистрируйтесь.",
    ", zaloguj się lub zarejestruj."
  ],
  [
    "signIn",
    "Увійти",
    "Sign in",
    "Войти",
    "Zaloguj się"
  ],
  [
    "register",
    "Реєстрація",
    "Register",
    "Регистрация",
    "Rejestracja"
  ],
  [
    "noResultsTitle",
    "Монет не знайдено",
    "No coins found",
    "Монеты не найдены",
    "Nie znaleziono monet"
  ],
  [
    "noResultsIntro",
    "За заданими параметрами та фільтрами монет не знайдено.",
    "No coins match the selected settings and filters.",
    "По заданным параметрам и фильтрам монеты не найдены.",
    "Żadne monety nie pasują do wybranych ustawień i filtrów."
  ],
  [
    "noResultsFrom",
    "Спробуйте зменшити нижню межу обсягу, змінити фільтр або очистити пошук.",
    "Try lowering the minimum volume, changing filters, or clearing the search.",
    "Попробуйте уменьшить минимальный объём, изменить фильтр или очистить поиск.",
    "Spróbuj obniżyć minimalny wolumen, zmienić filtry lub wyczyścić wyszukiwanie."
  ],
  [
    "noResultsTo",
    "Спробуйте збільшити верхню межу обсягу, змінити фільтр або очистити пошук.",
    "Try raising the maximum volume, changing filters, or clearing the search.",
    "Попробуйте увеличить максимальный объём, изменить фильтр или очистить поиск.",
    "Spróbuj podnieść maksymalny wolumen, zmienić filtry lub wyczyścić wyszukiwanie."
  ],
  [
    "resetFilters",
    "Скинути всі фільтри",
    "Reset all filters",
    "Сбросить все фильтры",
    "Wyczyść wszystkie filtry"
  ],
  [
    "range24h",
    "Діапазон 24г (мін. — макс.)",
    "24h range (low – high)",
    "Диапазон 24ч (мин. — макс.)",
    "Zakres 24h (min. – maks.)"
  ],
  [
    "guestRowTitle",
    "Гостьовий режим: перегляд списку монет (для відкриття графіку потрібна реєстрація)",
    "Guest mode: coin list only (register to open charts)",
    "Гостевой режим: только список монет (для графиков нужна регистрация)",
    "Tryb gościa: tylko lista monet (zarejestruj się, aby otwierać wykresy)"
  ],
  [
    "openDetail",
    "Клікніть, щоб відкрити графік та детальний аналіз",
    "Click to open chart and detailed analysis",
    "Нажмите, чтобы открыть график и подробный анализ",
    "Kliknij, aby otworzyć wykres i szczegółową analizę"
  ],
  [
    "guestFavorite",
    "Додати в обране (доступно після реєстрації)",
    "Add to favorites (registration required)",
    "Добавить в избранное (после регистрации)",
    "Dodaj do ulubionych (wymagana rejestracja)"
  ],
  [
    "favoriteRemove",
    "Видалити з обраного",
    "Remove from favorites",
    "Удалить из избранного",
    "Usuń z ulubionych"
  ],
  [
    "favoriteAdd",
    "Додати в обране",
    "Add to favorites",
    "Добавить в избранное",
    "Dodaj do ulubionych"
  ],
  [
    "chartRegister",
    "Графік доступний після реєстрації",
    "Chart available after registration",
    "График доступен после регистрации",
    "Wykres dostępny po rejestracji"
  ],
  [
    "chartShort",
    "графік",
    "chart",
    "график",
    "wykres"
  ],
  [
    "highActivity",
    "Висока активність та об'єм",
    "High activity and volume",
    "Высокая активность и объём",
    "Wysoka aktywność i wolumen"
  ],
  [
    "linkGuest",
    "Лінковка з торговим терміналом (тільки для зареєстрованих)",
    "Trading terminal integration (registered users only)",
    "Связь с торговым терминалом (только для зарегистрированных)",
    "Integracja z terminalem (tylko dla zarejestrowanych)"
  ],
  [
    "linkOpen",
    "Відкрити в обраному терміналі",
    "Open in selected terminal",
    "Открыть в выбранном терминале",
    "Otwórz w wybranym terminalu"
  ],
  [
    "linkOpenGroup",
    "Відкрити в обраному терміналі ({{group}})",
    "Open in selected terminal ({{group}})",
    "Открыть в выбранном терминале ({{group}})",
    "Otwórz w wybranym terminalu ({{group}})"
  ],
  [
    "telegramGuest",
    "Telegram сповіщення (тільки для зареєстрованих)",
    "Telegram alerts (registered users only)",
    "Уведомления Telegram (только для зарегистрированных)",
    "Alerty Telegram (tylko dla zarejestrowanych)"
  ],
  [
    "telegramSet",
    "Встановити сповіщення в Telegram",
    "Set a Telegram alert",
    "Установить уведомление в Telegram",
    "Ustaw alert w Telegramie"
  ],
  [
    "telegramAlerts",
    "Telegram сповіщення",
    "Telegram alerts",
    "Уведомления Telegram",
    "Alerty Telegram"
  ],
  [
    "surveillanceGuest",
    "Системний нагляд (тільки для зареєстрованих)",
    "24/7 monitoring (registered users only)",
    "Системное наблюдение (только для зарегистрированных)",
    "Monitoring 24/7 (tylko dla zarejestrowanych)"
  ],
  [
    "surveillanceCurrent",
    "Монета на системному нагляді ({{status}}). Натисніть щоб зняти",
    "Coin under system monitoring ({{status}}). Click to stop",
    "Монета под системным наблюдением ({{status}}). Нажмите, чтобы снять",
    "Moneta objęta monitoringiem ({{status}}). Kliknij, aby zakończyć"
  ],
  [
    "surveillanceActive",
    "Активна 24/7",
    "Active 24/7",
    "Активна 24/7",
    "Aktywna 24/7"
  ],
  [
    "surveillancePaused",
    "Призупинена",
    "Paused",
    "Приостановлена",
    "Wstrzymana"
  ],
  [
    "surveillanceAdd",
    "Взяти монету на 24/7 системний нагляд",
    "Enable 24/7 monitoring for this coin",
    "Включить мониторинг монеты 24/7",
    "Włącz monitoring monety 24/7"
  ],
  [
    "price",
    "Ціна",
    "Price",
    "Цена",
    "Cena"
  ],
  [
    "change24h",
    "24г Зміна",
    "24h change",
    "Изменение 24ч",
    "Zmiana 24h"
  ],
  [
    "low",
    "Мін.:",
    "Low:",
    "Мин.:",
    "Min.:"
  ],
  [
    "high",
    "Макс.:",
    "High:",
    "Макс.:",
    "Maks.:"
  ],
  [
    "fromLow",
    "+{{percent}}% від мінімуму",
    "+{{percent}}% above low",
    "+{{percent}}% от минимума",
    "+{{percent}}% od minimum"
  ],
  [
    "fromHigh",
    "−{{percent}}% від максимуму",
    "−{{percent}}% below high",
    "−{{percent}}% от максимума",
    "−{{percent}}% od maksimum"
  ],
  [
    "turnover24h",
    "Оборот 24г",
    "24h turnover",
    "Оборот 24ч",
    "Obrót 24h"
  ],
  [
    "volatility5m",
    "Волатильність 5m",
    "5m volatility",
    "Волатильность 5м",
    "Zmienność 5m"
  ],
  [
    "quoteFailed",
    "Не вдалося оновити дані бірж.",
    "Could not refresh exchange data.",
    "Не удалось обновить данные бирж.",
    "Nie udało się odświeżyć danych giełdowych."
  ],
  [
    "staleData",
    "Показано останні отримані дані; час їх отримання вказано над списком.",
    "Showing the last received data; the retrieval time is shown above the list.",
    "Показаны последние полученные данные; время их получения указано над списком.",
    "Pokazano ostatnio otrzymane dane; czas ich pobrania znajduje się nad listą."
  ],
  [
    "cardChartOpen",
    "Показати графік у картці",
    "Show chart inside card",
    "Показать график в карточке",
    "Pokaż wykres w karcie"
  ],
  [
    "cardChartClose",
    "Закрити графік та повернутися до картки",
    "Close chart and return to card",
    "Закрыть график и вернуться к карточке",
    "Zamknij wykres i wróć do karty"
  ],
  [
    "cardChartDetails",
    "Відкрити повний графік та аналіз",
    "Open full chart and analysis",
    "Открыть полный график и анализ",
    "Otwórz pełny wykres i analizę"
  ],
  [
    "cardChartLoading",
    "Завантаження свічок…",
    "Loading candles…",
    "Загрузка свечей…",
    "Ładowanie świec…"
  ],
  [
    "cardChartError",
    "Не вдалося завантажити свічки",
    "Could not load candles",
    "Не удалось загрузить свечи",
    "Nie udało się załadować świec"
  ],
  [
    "cardChartRetry",
    "Повторити",
    "Retry",
    "Повторить",
    "Ponów"
  ]

] as const;

const languages: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const screenerMainStrings = Object.fromEntries(
  languages.map((language, index) => [language, Object.fromEntries(screenerMainRows.map(row => [`screener.main.${row[0]}`, row[index + 1]]))]),
) as Record<SupportedLanguage, Record<string, string>>;
