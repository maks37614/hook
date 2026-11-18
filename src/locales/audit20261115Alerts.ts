/** 2026-11-15 audit: formation, Telegram alert and terminal-linking UI. */
import type { SupportedLanguage } from './types';
const rows = [
  [
    "Некоректний власний TP/SL — показано автоматичні ціни",
    "Invalid custom TP/SL — automatic prices are shown",
    "Некорректные пользовательские TP/SL — показаны автоматические цены",
    "Nieprawidłowe własne TP/SL — wyświetlono ceny automatyczne"
  ],
  [
    "Якість сигналу:",
    "Signal quality:",
    "Качество сигнала:",
    "Jakość sygnału:"
  ],
  [
    "МОЖЛИВА",
    "POSSIBLE",
    "ВОЗМОЖНА",
    "MOŻLIWA"
  ],
  [
    "Власна ціна недопустима — рівні АВТО, дотики враховуються",
    "Custom price is invalid — AUTO levels are used; touches are counted",
    "Своя цена недопустима — используются уровни АВТО, касания учитываются",
    "Własna cena jest nieprawidłowa — użyto poziomów AUTO z uwzględnieniem dotknięć"
  ],
  [
    "Не підтверджений сигнал",
    "Unconfirmed signal",
    "Неподтверждённый сигнал",
    "Sygnał niepotwierdzony"
  ],
  [
    "Умовний",
    "Conditional",
    "Условный",
    "Warunkowy"
  ],
  [
    "Ранній вхід — лише за відскоку / відбою.",
    "Early entry — only on a bounce/rejection.",
    "Ранний вход — только при отскоке / отбое.",
    "Wczesne wejście — tylko przy odbiciu / odrzuceniu."
  ],
  [
    "Біржовий крок ціни не перевірено: прогноз не готовий до виставлення ордера.",
    "Exchange tick size not verified: the projection is not ready for order placement.",
    "Биржевой шаг цены не проверен: прогноз не готов для выставления ордера.",
    "Nie zweryfikowano kroku ceny giełdowej: prognoza nie jest gotowa do złożenia zlecenia."
  ],
  [
    "R:R ранній ≈",
    "Early R:R ≈",
    "Ранний R:R ≈",
    "Wczesny R:R ≈"
  ],
  [
    "· після пробою ≈",
    "· after breakout ≈",
    "· после пробоя ≈",
    "· po wybiciu ≈"
  ],
  [
    "Графік на весь екран",
    "Fullscreen chart",
    "График на весь экран",
    "Wykres pełnoekranowy"
  ],
  [
    "Виявлена формація",
    "Detected formation",
    "Обнаруженная формация",
    "Wykryta formacja"
  ],
  [
    "Детальний розподіл балів для цієї формації недоступний.",
    "Detailed score breakdown is unavailable for this formation.",
    "Подробная разбивка баллов для этой формации недоступна.",
    "Szczegółowy podział punktacji tej formacji jest niedostępny."
  ],
  [
    "Торгові рівні (Setup)",
    "Trading levels (setup)",
    "Торговые уровни (сетап)",
    "Poziomy transakcyjne (setup)"
  ],
  [
    "Точка входу (Entry):",
    "Entry point:",
    "Точка входа (Entry):",
    "Punkt wejścia (Entry):"
  ],
  [
    "Ціль (Take Profit):",
    "Take-profit target:",
    "Цель (Take Profit):",
    "Cel (Take Profit):"
  ],
  [
    "Стоп-лос (Stop Loss):",
    "Stop-loss:",
    "Стоп-лосс (Stop Loss):",
    "Stop-loss:"
  ],
  [
    "Керувати",
    "Manage",
    "Управлять",
    "Zarządzaj"
  ],
  [
    "Встановлення сповіщень у Telegram на точки входу, тейк-профіт та стоп-лосс доступне тільки зареєстрованим користувачам.",
    "Telegram alerts for entry, take-profit, and stop-loss levels are available only to registered users.",
    "Уведомления Telegram на уровни входа, тейк-профита и стоп-лосса доступны только зарегистрированным пользователям.",
    "Alerty Telegram dla wejścia, take-profit i stop-loss są dostępne tylko dla zarejestrowanych użytkowników."
  ],
  [
    "Тейк",
    "Take profit",
    "Тейк-профит",
    "Take profit"
  ],
  [
    "Сповіщення Telegram",
    "Telegram alerts",
    "Уведомления Telegram",
    "Powiadomienia Telegram"
  ],
  [
    "Вкажіть будь-яку ціну, при досягненні якої бот надішле миттєвий сигнал",
    "Enter any price that will trigger an instant bot alert when reached",
    "Укажите любую цену, при достижении которой бот отправит мгновенный сигнал",
    "Podaj dowolną cenę, której osiągnięcie wywoła natychmiastowy alert bota"
  ],
  [
    "Не вдалося синхронізувати стан блоку з профілем. Налаштування залишиться локальним у цьому браузері.",
    "Could not sync block state with your profile. The setting will remain local to this browser.",
    "Не удалось синхронизировать состояние блока с профилем. Настройка останется локальной в этом браузере.",
    "Nie udało się zsynchronizować stanu bloku z profilem. Ustawienie pozostanie lokalne w tej przeglądarce."
  ],
  [
    "Цільова ціна ($)",
    "Target price ($)",
    "Целевая цена ($)",
    "Cena docelowa ($)"
  ],
  [
    "Умова спрацювання",
    "Trigger condition",
    "Условие срабатывания",
    "Warunek wyzwolenia"
  ],
  [
    "Нотатка (необов'язково)",
    "Note (optional)",
    "Примечание (необязательно)",
    "Notatka (opcjonalnie)"
  ],
  [
    "РОЗУМНИЙ АНАЛІЗ",
    "SMART ANALYSIS",
    "УМНЫЙ АНАЛИЗ",
    "INTELIGENTNA ANALIZA"
  ],
  [
    "Не вдалося синхронізувати згортання аналізу з профілем. Вибір збережено в цьому браузері.",
    "Could not sync the analysis collapse state with your profile. Your choice is saved in this browser.",
    "Не удалось синхронизировать сворачивание анализа с профилем. Выбор сохранён в этом браузере.",
    "Nie udało się zsynchronizować zwijania analizy z profilem. Wybór zapisano w tej przeglądarce."
  ],
  [
    "Крок ціни не перевірено",
    "Price tick size not verified",
    "Шаг цены не проверен",
    "Nie zweryfikowano kroku ceny"
  ],
  [
    "Миттєві сповіщення при досягненні ваших рівнів",
    "Instant alerts when your levels are reached",
    "Мгновенные уведомления при достижении ваших уровней",
    "Natychmiastowe alerty po osiągnięciu Twoich poziomów"
  ],
  [
    "Профіль:",
    "Profile:",
    "Профиль:",
    "Profil:"
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
    "Персоналізація",
    "Personalization",
    "Персонализация",
    "Personalizacja"
  ],
  [
    "Створити сповіщення ціни",
    "Create price alert",
    "Создать ценовое уведомление",
    "Utwórz alert cenowy"
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
    "Примітка (необов'язково)",
    "Note (optional)",
    "Примечание (необязательно)",
    "Notatka (opcjonalnie)"
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
    "Відпрацьовано",
    "Triggered",
    "Сработало",
    "Uruchomiono"
  ],
  [
    "Перезапустити",
    "Restart",
    "Перезапустить",
    "Uruchom ponownie"
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
    "Журнал спрацьованих сповіщень",
    "Triggered alert log",
    "Журнал сработавших уведомлений",
    "Dziennik uruchomionych alertów"
  ],
  [
    "Коли ринкова ціна монети досягне встановленої цілі, сервер миттєво відправить сповіщення у ваш Telegram і зафіксує запис тут.",
    "When a coin reaches your target price, the server sends a Telegram alert and records it here.",
    "Когда рыночная цена монеты достигнет указанной цели, сервер отправит уведомление в Telegram и запишет его здесь.",
    "Gdy cena monety osiągnie wyznaczony poziom, serwer wyśle alert na Telegram i zapisze go tutaj."
  ],
  [
    "Надіслано в Telegram",
    "Sent to Telegram",
    "Отправлено в Telegram",
    "Wysłano do Telegrama"
  ],
  [
    "У черзі доставки",
    "Queued for delivery",
    "В очереди на отправку",
    "W kolejce do wysłania"
  ],
  [
    "Помилка доставки",
    "Delivery failed",
    "Ошибка доставки",
    "Błąd dostarczenia"
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
    "Активних сповіщень:",
    "Active alerts:",
    "Активных уведомлений:",
    "Aktywne alerty:"
  ],
  [
    "Синхронізація стаканів і графіків терміналу MetaScalp в 1 клік",
    "Sync MetaScalp order books and charts in one click",
    "Синхронизация стаканов и графиков MetaScalp одним нажатием",
    "Synchronizacja arkuszy i wykresów MetaScalp jednym kliknięciem"
  ],
  [
    "Швидкі кнопки перемикання монет у картках, таблиці та модальному вікні",
    "Quick coin-switch buttons in cards, tables, and dialogs",
    "Кнопки быстрого переключения монет в карточках, таблице и модальном окне",
    "Szybkie przyciski zmiany monet w kartach, tabelach i oknach"
  ],
  [
    "Немає зв'язку",
    "Disconnected",
    "Нет соединения",
    "Brak połączenia"
  ],
  [
    "Вкажіть у MetaScalp цей же номер групи на стакані або графіку для синхронізації.",
    "Set the same group number in MetaScalp's order book or chart to synchronize.",
    "Укажите тот же номер группы в стакане или графике MetaScalp для синхронизации.",
    "Ustaw ten sam numer grupy w arkuszu lub wykresie MetaScalp, aby zsynchronizować."
  ],
  [
    "Миттєво надсилати монету в MetaScalp при кліку на картку чи рядок таблиці",
    "Instantly send a coin to MetaScalp when clicking a card or table row",
    "Мгновенно отправлять монету в MetaScalp при нажатии на карточку или строку таблицы",
    "Natychmiast wysyłaj monetę do MetaScalp po kliknięciu karty lub wiersza tabeli"
  ],
  [
    "Відтворювати короткий клік при кожній зміні тікера",
    "Play a short click on each ticker change",
    "Воспроизводить короткий щелчок при смене тикера",
    "Odtwarzaj krótki dźwięk przy każdej zmianie tickera"
  ],
  [
    "1. Запустіть",
    "1. Launch",
    "1. Запустите",
    "1. Uruchom"
  ],
  [
    "на цьому комп'ютері. Локальний API (порт 17845) активний автоматично.",
    "on this computer. The local API (port 17845) is enabled automatically.",
    "на этом компьютере. Локальный API (порт 17845) активируется автоматически.",
    "na tym komputerze. Lokalne API (port 17845) uruchamia się automatycznie."
  ],
  [
    "2. У MetaScalp встановіть групу лінковки (наприклад,",
    "2. Set the linking group in MetaScalp (for example,",
    "2. В MetaScalp задайте группу связи (например,",
    "2. W MetaScalp ustaw grupę połączenia (na przykład,"
  ],
  [
    ") на потрібних стаканах чи графіках.",
    ") on the desired order books or charts.",
    ") в нужных стаканах или графиках.",
    ") w odpowiednich arkuszach lub na wykresach."
  ],
  [
    "Якщо браузер запитає дозвіл на доступ до локальної мережі, надайте його цьому сайту.",
    "If your browser asks for local network access, allow it for this site.",
    "Если браузер запросит доступ к локальной сети, разрешите его для этого сайта.",
    "Jeśli przeglądarka poprosi o dostęp do sieci lokalnej, zezwól tej stronie."
  ],
  [
    "3. Клікайте на кнопку",
    "3. Click the button",
    "3. Нажимайте кнопку",
    "3. Klikaj przycisk"
  ],
  [
    "або на будь-яку монету в скрінері — термінал миттєво переключиться на обраний інструмент.",
    "or any coin in Screener — the terminal switches instantly to the selected instrument.",
    "или любую монету в Скринере — терминал сразу переключится на выбранный инструмент.",
    "lub dowolną monetę w Skanerze — terminal natychmiast przełączy się na wybrany instrument."
  ],
  [
    "Готово",
    "Ready",
    "Готово",
    "Gotowe"
  ]
] as const;
const languages: SupportedLanguage[] = ['uk','en','ru','pl'];
export const audit20261115Alerts = Object.fromEntries(
 languages.map((language,index)=>[language,Object.fromEntries(rows.map(row=>[row[0],row[index]]))]),
) as Record<SupportedLanguage,Record<string,string>>;
export const audit20261115AlertsRows = rows;
