/** Reviewable translations for dynamic Formations detail alerts and quality messages. */
import type { SupportedLanguage } from './types';
const rows = [
  [
    "Формація вже в архіві",
    "Formation already saved",
    "Формация уже сохранена",
    "Formacja jest już zapisana"
  ],
  [
    "Формацію додано в архів!",
    "Formation saved!",
    "Формация сохранена!",
    "Formacja zapisana!"
  ],
  [
    "Помилка збереження",
    "Could not save",
    "Ошибка сохранения",
    "Błąd zapisywania"
  ],
  [
    "Збережено в архів формацій",
    "Saved to formations archive",
    "Сохранено в архив формаций",
    "Zapisano w archiwum formacji"
  ],
  [
    "Встановлювати сповіщення можуть тільки зареєстровані користувачі",
    "Only registered users can configure alerts",
    "Настраивать уведомления могут только зарегистрированные пользователи",
    "Tylko zarejestrowani użytkownicy mogą konfigurować alerty"
  ],
  [
    "Введіть коректну ціну",
    "Enter a valid price",
    "Введите корректную цену",
    "Podaj prawidłową cenę"
  ],
  [
    "Сповіщення на ${{price}} додано!",
    "Alert for ${{price}} added!",
    "Уведомление на ${{price}} добавлено!",
    "Dodano alert dla ${{price}}!"
  ],
  [
    "Своя ціль ${{price}} додана",
    "Custom target ${{price}} added",
    "Собственная цель ${{price}} добавлена",
    "Dodano własny cel ${{price}}"
  ],
  [
    "Не вдалося створити сповіщення",
    "Could not create alert",
    "Не удалось создать уведомление",
    "Nie udało się utworzyć alertu"
  ],
  [
    "Вхід очікує потрібну кількість підтверджених дотиків High/Low",
    "Entry is waiting for the required number of confirmed High/Low touches",
    "Для входа требуется необходимое число подтверждённых касаний High/Low",
    "Wejście wymaga wymaganej liczby potwierdzonych dotknięć High/Low"
  ],
  [
    "Встановлення сповіщень доступне тільки для зареєстрованих користувачів. Будь ласка, увійдіть.",
    "Only registered users can set alerts. Please sign in.",
    "Уведомления доступны только зарегистрированным пользователям. Войдите в аккаунт.",
    "Alerty są dostępne tylko dla zarejestrowanych użytkowników. Zaloguj się."
  ],
  [
    "Встановлення сповіщень доступне для зареєстрованих користувачів. Будь ласка, увійдіть.",
    "Alerts are available to registered users. Please sign in.",
    "Уведомления доступны зарегистрированным пользователям. Войдите в аккаунт.",
    "Alerty są dostępne dla zarejestrowanych użytkowników. Zaloguj się."
  ],
  [
    "Вхід",
    "Entry",
    "Вход",
    "Wejście"
  ],
  [
    "Тейк-профіт",
    "Take profit",
    "Тейк-профит",
    "Take profit"
  ],
  [
    "Стоп-лосс",
    "Stop loss",
    "Стоп-лосс",
    "Stop loss"
  ],
  [
    "Алерт на {{level}} додано!",
    "Alert for {{level}} added!",
    "Алерт на {{level}} добавлен!",
    "Dodano alert dla {{level}}!"
  ],
  [
    "Сповіщення Telegram встановлено: {{label}} (${{price}})",
    "Telegram alert set: {{label}} (${{price}})",
    "Уведомление Telegram установлено: {{label}} (${{price}})",
    "Ustawiono alert Telegram: {{label}} (${{price}})"
  ],
  [
    "Спочатку дочекайтеся підтвердження дотиків High/Low для Entry",
    "Wait for confirmed High/Low touches before setting Entry",
    "Сначала дождитесь подтверждённых касаний High/Low для Entry",
    "Najpierw poczekaj na potwierdzone dotknięcia High/Low dla Entry"
  ],
  [
    "Всі 3 рівні додано в Telegram!",
    "All 3 levels added to Telegram!",
    "Все 3 уровня добавлены в Telegram!",
    "Dodano wszystkie 3 poziomy do Telegrama!"
  ],
  [
    "Всі 3 алерти додано в Telegram",
    "All 3 alerts added to Telegram",
    "Все 3 алерта добавлены в Telegram",
    "Dodano wszystkie 3 alerty do Telegrama"
  ],
  [
    "Помилка додавання",
    "Could not add",
    "Ошибка добавления",
    "Błąd dodawania"
  ],
  [
    "Статус патерну",
    "Pattern status",
    "Статус паттерна",
    "Status formacji"
  ],
  [
    "Згорнути складові якості",
    "Hide quality components",
    "Скрыть составляющие качества",
    "Ukryj składniki jakości"
  ],
  [
    "Розгорнути складові якості",
    "Show quality components",
    "Показать составляющие качества",
    "Pokaż składniki jakości"
  ],
  [
    "Зважена оцінка якості, не статистична ймовірність успіху",
    "Weighted quality score, not a statistical probability of success",
    "Взвешенная оценка качества, не статистическая вероятность успеха",
    "Ważona ocena jakości, a nie statystyczne prawdopodobieństwo powodzenia"
  ],
  [
    "Якість сетапу",
    "Setup quality",
    "Качество сетапа",
    "Jakość setupu"
  ],
  [
    "Нормовано: {{raw}} / {{max}} доступних балів → {{total}}/100.",
    "Normalized: {{raw}} / {{max}} available points → {{total}}/100.",
    "Нормировано: {{raw}} / {{max}} доступных баллов → {{total}}/100.",
    "Znormalizowano: {{raw}} / {{max}} dostępnych punktów → {{total}}/100."
  ],
  [
    "Очікується ({{count}}/{{required}})",
    "Pending ({{count}}/{{required}})",
    "Ожидается ({{count}}/{{required}})",
    "Oczekiwanie ({{count}}/{{required}})"
  ],
  [
    "Досягнуто +{{profit}}%",
    "Reached +{{profit}}%",
    "Достигнуто +{{profit}}%",
    "Osiągnięto +{{profit}}%"
  ],
  [
    "Співвідношення Risk / Reward:",
    "Risk / Reward ratio:",
    "Соотношение риска и прибыли:",
    "Stosunek ryzyka do zysku:"
  ],
  [
    "Надіслати в Telegram, коли ціна досягне точки входу",
    "Send a Telegram alert when price reaches entry",
    "Отправить уведомление в Telegram при достижении точки входа",
    "Wyślij alert Telegram po osiągnięciu ceny wejścia"
  ],
  [
    "Надіслати в Telegram, коли ціна досягне тейк-профіту",
    "Send a Telegram alert when price reaches take profit",
    "Отправить уведомление в Telegram при достижении тейк-профита",
    "Wyślij alert Telegram po osiągnięciu take profit"
  ],
  [
    "Надіслати в Telegram, коли ціна досягне стоп-лосу",
    "Send a Telegram alert when price reaches stop loss",
    "Отправить уведомление в Telegram при достижении стоп-лосса",
    "Wyślij alert Telegram po osiągnięciu stop loss"
  ],
  [
    "Встановлення...",
    "Setting up…",
    "Настройка...",
    "Konfigurowanie…"
  ],
  [
    "Встановити всі 3 рівні в Telegram",
    "Set all 3 levels in Telegram",
    "Установить все 3 уровня в Telegram",
    "Ustaw wszystkie 3 poziomy w Telegramie"
  ],
  [
    "Котирування: {{status}} ({{mode}})",
    "Quotes: {{status}} ({{mode}})",
    "Котировки: {{status}} ({{mode}})",
    "Notowania: {{status}} ({{mode}})"
  ],
  [
    "підключено",
    "connected",
    "подключено",
    "połączono"
  ],
  [
    "немає підключення",
    "disconnected",
    "нет подключения",
    "brak połączenia"
  ],
  [
    "Вибрати формацію для {{symbol}}",
    "Select formation for {{symbol}}",
    "Выбрать формацию для {{symbol}}",
    "Wybierz formację dla {{symbol}}"
  ],
  [
    "Знайдено {{count}} формацій — натисніть, щоб змінити",
    "{{count}} formations found — tap to switch",
    "Найдено {{count}} формаций — нажмите для переключения",
    "Znaleziono {{count}} formacji — dotknij, aby zmienić"
  ],
  [
    "Формація: {{name}} ({{status}})",
    "Formation: {{name}} ({{status}})",
    "Формация: {{name}} ({{status}})",
    "Formacja: {{name}} ({{status}})"
  ],
  [
    "Налаштувати сповіщення в Telegram",
    "Configure Telegram alerts",
    "Настроить уведомления Telegram",
    "Skonfiguruj alerty Telegram"
  ],
  [
    "Повернутися в головне меню",
    "Return to main menu",
    "Вернуться в главное меню",
    "Wróć do menu głównego"
  ],
  [
    "Швидкий вибір:",
    "Quick select:",
    "Быстрый выбор:",
    "Szybki wybór:"
  ],
  [
    "Встановлені сповіщення для {{symbol}}:",
    "Alerts set for {{symbol}}:",
    "Установленные уведомления для {{symbol}}:",
    "Alerty ustawione dla {{symbol}}:"
  ],
  [
    "Спрацював (${{price}})",
    "Triggered (${{price}})",
    "Сработал (${{price}})",
    "Uruchomiono (${{price}})"
  ],
  [
    "Формація:",
    "Formation:",
    "Формация:",
    "Formacja:"
  ],
  [
    "Дотики High/Low підтверджено",
    "High/Low touches confirmed",
    "Касания High/Low подтверждены",
    "Potwierdzono dotknięcia High/Low"
  ],
  [
    "Не вдалося завантажити свічки з біржі",
    "Could not load exchange candles",
    "Не удалось загрузить свечи с биржи",
    "Nie udało się załadować świec z giełdy"
  ],
  [
    "Спробувати ще раз",
    "Try again",
    "Попробовать ещё раз",
    "Spróbuj ponownie"
  ],
  [
    "Немає актуальних даних за 24 години",
    "No current 24-hour market data",
    "Нет актуальных данных за 24 часа",
    "Brak aktualnych danych rynkowych za 24 godziny"
  ],
  [
    "Попереднє підтверджене значення OI; очікується оновлення",
    "Last verified OI value; waiting for refresh",
    "Последнее подтверждённое значение OI; ожидание обновления",
    "Ostatnia potwierdzona wartość OI; oczekiwanie na aktualizację"
  ],
  ["Виявлена формація", "Detected formation", "Обнаруженная формация", "Wykryta formacja"],
  ["Довідкові рівні 24h", "Reference 24h levels", "Справочные уровни 24h", "Orientacyjne poziomy 24h"],
  ["Довідковий діапазон 24h", "24h reference range", "Справочный диапазон 24h", "Orientacyjny zakres 24h"],
  ["Довідкові рівні не є підтвердженим торговим сигналом.", "Reference levels are not a confirmed trading signal.", "Справочные уровни не являются подтверждённым торговым сигналом.", "Poziomy orientacyjne nie są potwierdzonym sygnałem transakcyjnym."],
  ["Оцінка не проводилася", "Not scored", "Оценка не проводилась", "Brak oceny"],
  ["Орієнтовні рівні (24h)", "Reference levels (24h)", "Ориентировочные уровни (24h)", "Poziomy orientacyjne (24h)"],
  ["Некоректні рівні Entry/TP/SL: сповіщення не створено", "Invalid Entry/TP/SL levels: no alert was created", "Некорректные уровни Entry/TP/SL: уведомление не создано", "Nieprawidłowe poziomy Entry/TP/SL: nie utworzono alertu"]
] as const;
const languages: SupportedLanguage[] = ['uk','en','ru','pl'];
export const formationDetailsPhrases = Object.fromEntries(languages.map((lang, i) => [lang, Object.fromEntries(rows.map(row => [row[0], row[i]]))])) as Record<SupportedLanguage, Record<string,string>>;
export const formationDetailsRows = rows;
