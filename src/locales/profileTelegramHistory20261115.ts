/** Four-language copy for Telegram alert history, creation, settings and CRON UI. */
import type { SupportedLanguage } from './types';
export const profileTelegramHistoryRows: readonly (readonly [string, string, string, string])[] = [
  [
    "Сповіщення в Telegram",
    "Telegram notifications",
    "Уведомления в Telegram",
    "Powiadomienia w Telegramie"
  ],
  [
    "Миттєві сповіщення при досягненні ваших рівнів",
    "Instant alerts when your levels are reached",
    "Мгновенные уведомления при достижении ваших уровней",
    "Natychmiastowe alerty po osiągnięciu Twoich poziomów"
  ],
  [
    "ХМАРА • ІЗОЛЬОВАНО",
    "CLOUD • ISOLATED",
    "ОБЛАКО • ИЗОЛИРОВАНО",
    "CHMURA • ODDZIELONE"
  ],
  [
    "Усі сповіщення та налаштування збережено у вашому обліковому записі",
    "All alerts and settings are saved to your account",
    "Все уведомления и настройки сохраняются в вашей учётной записи",
    "Wszystkie alerty i ustawienia zapisano na Twoim koncie"
  ],
  [
    "Сповіщення доступні тільки для зареєстрованих користувачів",
    "Alerts are available to registered users only",
    "Уведомления доступны только зарегистрированным пользователям",
    "Alerty są dostępne tylko dla zarejestrowanych użytkowników"
  ],
  [
    "Увійдіть або зареєструйтесь, щоб створювати сповіщення та отримувати сигнали в Telegram.",
    "Sign in or register to create alerts and receive Telegram signals.",
    "Войдите или зарегистрируйтесь, чтобы создавать уведомления и получать сигналы в Telegram.",
    "Zaloguj się lub zarejestruj, aby tworzyć alerty i otrzymywać sygnały w Telegramie."
  ],
  [
    "Увійти / Зареєструватися",
    "Sign in / Register",
    "Войти / Зарегистрироваться",
    "Zaloguj się / Zarejestruj się"
  ],
  [
    "Фоновий CRON активний: перевірка кожні 5 секунд",
    "Background CRON is active: checks every 5 seconds",
    "Фоновый CRON активен: проверка каждые 5 секунд",
    "CRON działa w tle: sprawdzanie co 5 sekund"
  ],
  [
    "Отримувати сповіщення на робочий стіл навіть коли вкладка згорнута",
    "Get desktop notifications even when the tab is in the background",
    "Получать уведомления на рабочий стол, даже когда вкладка свёрнута",
    "Otrzymuj powiadomienia na pulpicie, nawet gdy karta działa w tle"
  ],
  [
    "Сповіщення браузера дозволено",
    "Browser notifications allowed",
    "Уведомления браузера разрешены",
    "Powiadomienia przeglądarki są dozwolone"
  ],
  [
    "Підключення Telegram",
    "Telegram connection",
    "Подключение Telegram",
    "Połączenie z Telegramem"
  ],
  [
    "Встановлення сповіщень вимагає реєстрації",
    "Setting up alerts requires registration",
    "Для настройки уведомлений нужна регистрация",
    "Konfiguracja alertów wymaga rejestracji"
  ],
  [
    "Щоб створювати та отримувати сповіщення при досягненні цінових рівнів (входу, TP, SL), необхідно увійти у свій обліковий запис або зареєструватися.",
    "Sign in or register to create and receive alerts when price reaches entry, TP, or SL levels.",
    "Чтобы создавать и получать уведомления при достижении ценовых уровней (входа, TP, SL), войдите в аккаунт или зарегистрируйтесь.",
    "Zaloguj się lub zarejestruj, aby tworzyć i otrzymywać alerty po osiągnięciu poziomów wejścia, TP lub SL."
  ],
  [
    "24/7 Моніторинг",
    "24/7 monitoring",
    "Мониторинг 24/7",
    "Monitoring 24/7"
  ],
  [
    "Серверний трекінг цін навіть при вимкненому комп'ютері",
    "Server-side price tracking even when your computer is off",
    "Серверное отслеживание цен даже при выключенном компьютере",
    "Monitorowanie cen na serwerze, nawet gdy komputer jest wyłączony"
  ],
  [
    "Миттєві сигнали прямо в особистий чат або групу",
    "Instant signals sent to a private chat or group",
    "Мгновенные сигналы прямо в личный чат или группу",
    "Natychmiastowe sygnały wysyłane do czatu prywatnego lub grupy"
  ],
  [
    "Персоналізація",
    "Personalization",
    "Персонализация",
    "Personalizacja"
  ],
  [
    "Приватне збереження ваших торгових сетапів",
    "Private storage of your trading setups",
    "Приватное хранение ваших торговых сетапов",
    "Prywatne przechowywanie Twoich ustawień transakcyjnych"
  ],
  [
    "Сховати форму",
    "Hide form",
    "Скрыть форму",
    "Ukryj formularz"
  ],
  [
    "Нове сповіщення",
    "New alert",
    "Новое уведомление",
    "Nowy alert"
  ],
  [
    "Очистити список уже спрацьованих сповіщень",
    "Clear the list of triggered alerts",
    "Очистить список сработавших уведомлений",
    "Wyczyść listę uruchomionych alertów"
  ],
  [
    "Telegram надішле повідомлення миттєво",
    "Telegram will send a message instantly",
    "Telegram отправит сообщение мгновенно",
    "Telegram natychmiast wyśle wiadomość"
  ],
  [
    "Монета / Символ",
    "Coin / symbol",
    "Монета / символ",
    "Moneta / symbol"
  ],
  [
    "Біржа та тип",
    "Exchange and type",
    "Биржа и тип",
    "Giełda i typ"
  ],
  [
    "Умова спрацювання",
    "Trigger condition",
    "Условие срабатывания",
    "Warunek wyzwolenia"
  ],
  [
    "≥ Ціна піднялась або досягла",
    "≥ Price rises to or reaches",
    "≥ Цена поднялась или достигла",
    "≥ Cena wzrosła lub osiągnęła"
  ],
  [
    "≤ Ціна опустилась або досягла",
    "≤ Price falls to or reaches",
    "≤ Цена опустилась или достигла",
    "≤ Cena spadła lub osiągnęła"
  ],
  [
    "Наприклад: 78500",
    "For example: 78500",
    "Например: 78500",
    "Na przykład: 78500"
  ],
  [
    "Створення...",
    "Creating...",
    "Создание...",
    "Tworzenie..."
  ],
  [
    "Зберегти алерт",
    "Save alert",
    "Сохранить алерт",
    "Zapisz alert"
  ],
  [
    "Завантаження сповіщень...",
    "Loading alerts...",
    "Загрузка уведомлений...",
    "Wczytywanie alertów..."
  ],
  [
    "У вас ще немає встановлених сповіщень",
    "You have no configured alerts yet",
    "У вас пока нет настроенных уведомлений",
    "Nie masz jeszcze skonfigurowanych alertów"
  ],
  [
    "Створіть нове сповіщення кнопкою вище або в 1 клік на картці монети чи у вікні детального графіка формації.",
    "Create an alert with the button above or in one click from a coin card or detailed formation chart.",
    "Создайте уведомление кнопкой выше или одним кликом в карточке монеты либо в подробном графике формации.",
    "Utwórz alert przyciskiem powyżej lub jednym kliknięciem na karcie monety albo szczegółowym wykresie formacji."
  ],
  [
    "Створити перше сповіщення",
    "Create your first alert",
    "Создать первое уведомление",
    "Utwórz pierwszy alert"
  ],
  [
    "Умова:",
    "Condition:",
    "Условие:",
    "Warunek:"
  ],
  [
    "Призупинити сповіщення",
    "Pause alert",
    "Приостановить уведомление",
    "Wstrzymaj alert"
  ],
  [
    "Відновити сповіщення",
    "Resume alert",
    "Возобновить уведомление",
    "Wznów alert"
  ],
  [
    "Видалити сповіщення",
    "Delete alert",
    "Удалить уведомление",
    "Usuń alert"
  ],
  [
    "Призупинено",
    "Paused",
    "Приостановлено",
    "Wstrzymano"
  ],
  [
    "Видалити всі спрацьовані сповіщення",
    "Delete all triggered alerts",
    "Удалить все сработавшие уведомления",
    "Usuń wszystkie uruchomione alerty"
  ],
  [
    "Перезапустити сповіщення",
    "Restart alert",
    "Перезапустить уведомление",
    "Uruchom alert ponownie"
  ],
  [
    "Перезапустити",
    "Restart",
    "Перезапустить",
    "Uruchom ponownie"
  ],
  [
    "Ціль:",
    "Target:",
    "Цель:",
    "Cel:"
  ],
  [
    "Зафіксовано:",
    "Recorded:",
    "Зафиксировано:",
    "Zarejestrowano:"
  ],
  [
    "Історія сповіщень вимагає входу",
    "Sign in to view alert history",
    "Для просмотра истории уведомлений нужно войти",
    "Zaloguj się, aby zobaczyć historię alertów"
  ],
  [
    "Увійдіть у свій обліковий запис, щоб переглядати історію всіх надісланих у Telegram сповіщень, збережених на сервері 24/7.",
    "Sign in to view the history of all Telegram alerts stored on the server around the clock.",
    "Войдите в аккаунт, чтобы просматривать историю всех уведомлений Telegram, сохраняемую на сервере круглосуточно.",
    "Zaloguj się, aby przeglądać historię alertów Telegram przechowywaną na serwerze przez całą dobę."
  ],
  [
    "Серверне збереження: повідомлення фіксуються навіть після закриття вкладки або браузера.",
    "Server storage: events are recorded even after the tab or browser is closed.",
    "Хранение на сервере: события сохраняются даже после закрытия вкладки или браузера.",
    "Zapis na serwerze: zdarzenia są rejestrowane nawet po zamknięciu karty lub przeglądarki."
  ],
  [
    "Оновити історію із сервера",
    "Refresh history from server",
    "Обновить историю с сервера",
    "Odśwież historię z serwera"
  ],
  [
    "Очистити всю історію",
    "Clear all history",
    "Очистить всю историю",
    "Wyczyść całą historię"
  ],
  [
    "Завантаження журналу сповіщень із сервера...",
    "Loading alert history from the server...",
    "Загрузка истории уведомлений с сервера...",
    "Wczytywanie historii alertów z serwera..."
  ],
  [
    "Історія сповіщень порожня",
    "Alert history is empty",
    "История уведомлений пуста",
    "Historia alertów jest pusta"
  ],
  [
    "Коли ринкова ціна монети досягне встановленої цілі, сервер миттєво відправить сповіщення у ваш Telegram і зафіксує запис тут.",
    "When a coin reaches your target price, the server sends a Telegram alert and records it here.",
    "Когда рыночная цена монеты достигнет указанной цели, сервер отправит уведомление в Telegram и запишет его здесь.",
    "Gdy cena monety osiągnie wyznaczony poziom, serwer wyśle alert na Telegram i zapisze go tutaj."
  ],
  [
    "Спрацювало на:",
    "Triggered at:",
    "Сработало на:",
    "Uruchomiono przy:"
  ],
  [
    "Помилка:",
    "Error:",
    "Ошибка:",
    "Błąd:"
  ],
  [
    "Відновити це сповіщення знову",
    "Restore this alert",
    "Восстановить это уведомление",
    "Przywróć ten alert"
  ],
  [
    "Відновлення...",
    "Restoring...",
    "Восстановление...",
    "Przywracanie..."
  ],
  [
    "Відновити",
    "Restore",
    "Восстановить",
    "Przywróć"
  ],
  [
    "Видалити з історії",
    "Delete from history",
    "Удалить из истории",
    "Usuń z historii"
  ],
  [
    "Фоновий CRON-моніторинг 24/7",
    "Background CRON monitoring 24/7",
    "Фоновый CRON-мониторинг 24/7",
    "Monitoring CRON w tle 24/7"
  ],
  [
    "АКТИВНИЙ • 24/7",
    "ACTIVE • 24/7",
    "АКТИВЕН • 24/7",
    "AKTYWNY • 24/7"
  ],
  [
    "Серверні завдання cron автоматично контролюють ринок, аналізують ціни Binance і Bybit кожні 5 секунд та доставляють сповіщення навіть коли вкладку сайту закрито.",
    "Server cron jobs monitor the market, check Binance and Bybit prices every 5 seconds, and deliver alerts even when the site tab is closed.",
    "Серверные cron-задачи отслеживают рынок, проверяют цены Binance и Bybit каждые 5 секунд и доставляют уведомления даже при закрытой вкладке сайта.",
    "Zadania cron monitorują rynek, sprawdzają ceny Binance i Bybit co 5 sekund i dostarczają alerty nawet po zamknięciu karty."
  ],
  [
    "Цінові алерти:",
    "Price alerts:",
    "Ценовые уведомления:",
    "Alerty cenowe:"
  ],
  [
    "кожні 5 сек (24/7)",
    "every 5 sec (24/7)",
    "каждые 5 сек (24/7)",
    "co 5 s (24/7)"
  ],
  [
    "Нагляд за монетами:",
    "Coin monitoring:",
    "Мониторинг монет:",
    "Monitoring monet:"
  ],
  [
    "кожні 15 сек",
    "every 15 sec",
    "каждые 15 сек",
    "co 15 s"
  ],
  [
    "Імпульси, сплески",
    "Impulses, spikes",
    "Импульсы, всплески",
    "Impulsy, skoki"
  ],
  [
    "Скринер патернів:",
    "Pattern screener:",
    "Скринер паттернов:",
    "Skaner formacji:"
  ],
  [
    "кожні 60 сек",
    "every 60 sec",
    "каждые 60 сек",
    "co 60 s"
  ],
  [
    "≥88% впевненість",
    "≥88% confidence",
    "≥88% уверенности",
    "≥88% pewności"
  ],
  [
    "Перевіряємо CRON...",
    "Checking CRON...",
    "Проверяем CRON...",
    "Sprawdzanie CRON..."
  ],
  [
    "⚡ Запустити тест CRON та сповіщень",
    "⚡ Run CRON and notification test",
    "⚡ Запустить тест CRON и уведомлений",
    "⚡ Uruchom test CRON i powiadomień"
  ],
  [
    "Успіх!",
    "Success!",
    "Успех!",
    "Sukces!"
  ],
  [
    "Помилка",
    "Error",
    "Ошибка",
    "Błąd"
  ],
  [
    "Оновлення повідомлень...",
    "Updating messages...",
    "Обновление сообщений...",
    "Aktualizowanie wiadomości..."
  ],
  [
    "Оновити формат моїх надісланих повідомлень",
    "Update the format of my sent messages",
    "Обновить формат моих отправленных сообщений",
    "Zaktualizuj format wysłanych wiadomości"
  ],
  [
    "Ф'ючерси",
    "Futures",
    "Фьючерсы",
    "Kontrakty futures"
  ],
  [
    "Спот",
    "Spot",
    "Спот",
    "Spot"
  ],
  [
    "ХМАРА",
    "CLOUD",
    "ОБЛАКО",
    "CHMURA"
  ],
  [
    "Зареєструватися",
    "Register",
    "Зарегистрироваться",
    "Zarejestruj się"
  ]
];
export const profileTelegramHistoryPhrases: Record<SupportedLanguage, Record<string,string>> = {uk:{}, en:{}, ru:{}, pl:{}};
for (const [uk,en,ru,pl] of profileTelegramHistoryRows) {
  profileTelegramHistoryPhrases.uk[uk] = uk;
  profileTelegramHistoryPhrases.en[uk] = en;
  profileTelegramHistoryPhrases.ru[uk] = ru;
  profileTelegramHistoryPhrases.pl[uk] = pl;
}
