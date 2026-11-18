/**
 * Missing interface phrases identified during four-language audit.
 * Keep the Ukrainian source text as the lookup key, preserve trading symbols,
 * and avoid touching JSX/layout. Additions never override existing translations.
 */
import type { SupportedLanguage } from './types';

const phraseRows = [
  [
    "Відтворення (доступно після реєстрації)",
    "Replay (available after registration)",
    "Воспроизведение (доступно после регистрации)",
    "Odtwarzanie (dostępne po rejestracji)"
  ],
  [
    "Увійдіть у свій акаунт, щоб відкрити сторінку «Відтворення».",
    "Sign in to your account to open Replay.",
    "Войдите в свою учётную запись, чтобы открыть страницу «Воспроизведение».",
    "Zaloguj się na swoje konto, aby otworzyć stronę Odtwarzanie."
  ],
  [
    "Введіть адресу email.",
    "Enter your email address.",
    "Введите адрес электронной почты.",
    "Podaj adres e-mail."
  ],
  [
    "Введіть пароль.",
    "Enter your password.",
    "Введите пароль.",
    "Wpisz hasło."
  ],
  [
    "Пароль має містити щонайменше 12 символів.",
    "Password must contain at least 12 characters.",
    "Пароль должен содержать не менее 12 символов.",
    "Hasło musi mieć co najmniej 12 znaków."
  ],
  [
    "Паролі не збігаються.",
    "Passwords do not match.",
    "Пароли не совпадают.",
    "Hasła nie są zgodne."
  ],
  [
    "Спочатку пройдіть перевірку CAPTCHA.",
    "Complete the CAPTCHA check first.",
    "Сначала пройдите проверку CAPTCHA.",
    "Najpierw ukończ weryfikację CAPTCHA."
  ],
  [
    "Безкоштовна реєстрація",
    "Free registration",
    "Бесплатная регистрация",
    "Bezpłatna rejestracja"
  ],
  [
    "Відновлення доступу",
    "Recover access",
    "Восстановление доступа",
    "Odzyskiwanie dostępu"
  ],
  [
    "Новий пароль",
    "New password",
    "Новый пароль",
    "Nowe hasło"
  ],
  [
    "Вхід до h00k",
    "Sign in to h00k",
    "Вход в h00k",
    "Logowanie do h00k"
  ],
  [
    "Створіть акаунт без коду запрошення та без оплати.",
    "Create an account without an invitation code or payment.",
    "Создайте аккаунт без кода приглашения и оплаты.",
    "Utwórz konto bez kodu zaproszenia i opłat."
  ],
  [
    "Надішлемо посилання для відновлення на ваш email.",
    "We will email you a recovery link.",
    "Отправим ссылку для восстановления на вашу почту.",
    "Wyślemy link do odzyskania dostępu na Twój e-mail."
  ],
  [
    "Створіть новий надійний пароль для свого акаунта.",
    "Create a new secure password for your account.",
    "Создайте новый надёжный пароль для аккаунта.",
    "Utwórz nowe bezpieczne hasło do konta."
  ],
  [
    "Увійдіть, щоб увімкнути персональні сповіщення.",
    "Sign in to enable personal alerts.",
    "Войдите, чтобы включить персональные уведомления.",
    "Zaloguj się, aby włączyć osobiste powiadomienia."
  ],
  [
    "Ваші налаштування, архів і обрані монети будуть доступні між пристроями.",
    "Your settings, archive and watchlist will be available across devices.",
    "Ваши настройки, архив и избранные монеты будут доступны на разных устройствах.",
    "Twoje ustawienia, archiwum i obserwowane monety będą dostępne na różnych urządzeniach."
  ],
  [
    "Авторизація",
    "Authentication",
    "Авторизация",
    "Uwierzytelnianie"
  ],
  [
    "Увійти",
    "Sign in",
    "Войти",
    "Zaloguj się"
  ],
  [
    "Зареєструватися",
    "Register",
    "Зарегистрироваться",
    "Zarejestruj się"
  ],
  [
    "Акаунт може бути створений. Після відновлення пошти натисніть «Надіслати лист підтвердження ще раз».",
    "Your account may have been created. Once email is restored, select “Resend verification email”.",
    "Аккаунт мог быть создан. После восстановления почты нажмите «Отправить письмо с подтверждением ещё раз».",
    "Konto mogło zostać utworzone. Gdy poczta znów będzie działać, wybierz „Wyślij ponownie e-mail weryfikacyjny”."
  ],
  [
    "Ім'я або позивний",
    "Name or nickname",
    "Имя или псевдоним",
    "Imię lub pseudonim"
  ],
  [
    "Наприклад: Alex Scalper",
    "For example: Alex Scalper",
    "Например: Alex Scalper",
    "Na przykład: Alex Scalper"
  ],
  [
    "Електронна пошта",
    "Email address",
    "Электронная почта",
    "Adres e-mail"
  ],
  [
    "Пароль",
    "Password",
    "Пароль",
    "Hasło"
  ],
  [
    "Ваш пароль",
    "Your password",
    "Ваш пароль",
    "Twoje hasło"
  ],
  [
    "Щонайменше 12 символів",
    "At least 12 characters",
    "Не менее 12 символов",
    "Co najmniej 12 znaków"
  ],
  [
    "Приховати пароль",
    "Hide password",
    "Скрыть пароль",
    "Ukryj hasło"
  ],
  [
    "Показати пароль",
    "Show password",
    "Показать пароль",
    "Pokaż hasło"
  ],
  [
    "Повторіть пароль",
    "Confirm password",
    "Повторите пароль",
    "Powtórz hasło"
  ],
  [
    "Введіть пароль ще раз",
    "Enter password again",
    "Введите пароль ещё раз",
    "Wpisz hasło ponownie"
  ],
  [
    "Запам'ятати мене",
    "Remember me",
    "Запомнить меня",
    "Zapamiętaj mnie"
  ],
  [
    "Забули пароль?",
    "Forgot password?",
    "Забыли пароль?",
    "Nie pamiętasz hasła?"
  ],
  [
    "Захист від ботів",
    "Bot protection",
    "Защита от ботов",
    "Ochrona przed botami"
  ],
  [
    "Завантажуємо перевірку CAPTCHA…",
    "Loading CAPTCHA verification…",
    "Загружаем проверку CAPTCHA…",
    "Ładowanie weryfikacji CAPTCHA…"
  ],
  [
    "CAPTCHA ще не налаштована або недоступна. Зверніться до адміністратора.",
    "CAPTCHA is not configured or is unavailable. Contact the administrator.",
    "CAPTCHA не настроена или недоступна. Свяжитесь с администратором.",
    "CAPTCHA nie jest skonfigurowana lub jest niedostępna. Skontaktuj się z administratorem."
  ],
  [
    "Обробка…",
    "Processing…",
    "Обработка…",
    "Przetwarzanie…"
  ],
  [
    "Зареєструватися безкоштовно",
    "Register for free",
    "Зарегистрироваться бесплатно",
    "Zarejestruj się bezpłatnie"
  ],
  [
    "Надіслати посилання",
    "Send link",
    "Отправить ссылку",
    "Wyślij link"
  ],
  [
    "Змінити пароль",
    "Change password",
    "Изменить пароль",
    "Zmień hasło"
  ],
  [
    "Надіслати лист підтвердження ще раз",
    "Resend verification email",
    "Отправить письмо подтверждения ещё раз",
    "Wyślij ponownie e-mail weryfikacyjny"
  ],
  [
    "Повернутися до входу",
    "Back to sign in",
    "Вернуться ко входу",
    "Wróć do logowania"
  ],
  [
    "Безкоштовний акаунт · CAPTCHA · Захищені сесії · Підтвердження email",
    "Free account · CAPTCHA · Secure sessions · Email verification",
    "Бесплатный аккаунт · CAPTCHA · Защищённые сеансы · Подтверждение email",
    "Bezpłatne konto · CAPTCHA · Bezpieczne sesje · Weryfikacja e-mail"
  ],
  [
    "Закрити",
    "Close",
    "Закрыть",
    "Zamknij"
  ],
  [
    "Центр сповіщень",
    "Notification center",
    "Центр уведомлений",
    "Centrum powiadomień"
  ],
  [
    "Сповіщення",
    "Notifications",
    "Уведомления",
    "Powiadomienia"
  ],
  [
    "Цінові рівні, формації, імпульси та нагляд",
    "Price levels, patterns, impulses and surveillance",
    "Ценовые уровни, формации, импульсы и наблюдение",
    "Poziomy cenowe, formacje, impulsy i nadzór"
  ],
  [
    "Сповіщення на сайті призупинено",
    "Site notifications paused",
    "Уведомления на сайте приостановлены",
    "Powiadomienia w serwisie wstrzymane"
  ],
  [
    "Закрити сповіщення",
    "Close notifications",
    "Закрыть уведомления",
    "Zamknij powiadomienia"
  ],
  [
    "Прочитано",
    "Mark as read",
    "Прочитано",
    "Oznacz jako przeczytane"
  ],
  [
    "Очистити",
    "Clear",
    "Очистить",
    "Wyczyść"
  ],
  [
    "Налаштувати",
    "Configure",
    "Настроить",
    "Konfiguruj"
  ],
  [
    "Нових сповіщень поки немає. Створіть ціновий алерт або налаштуйте пошук імпульсів у профілі.",
    "No new notifications yet. Create a price alert or configure impulse detection in your profile.",
    "Новых уведомлений пока нет. Создайте ценовой алерт или настройте поиск импульсов в профиле.",
    "Brak nowych powiadomień. Utwórz alert cenowy lub skonfiguruj wykrywanie impulsów w profilu."
  ],
  [
    "Вкажіть біржу й ринок у події та увімкніть її категорію в Профіль → Лінковка",
    "Specify the exchange and market in the event and enable its category in Profile → Terminal linking",
    "Укажите биржу и рынок в событии и включите его категорию в Профиль → Связь с терминалом",
    "Wskaż giełdę i rynek w zdarzeniu oraz włącz jego kategorię w Profil → Łączenie z terminalem"
  ],
  [
    "Відкрити монету в обраному торговому терміналі",
    "Open coin in the selected trading terminal",
    "Открыть монету в выбранном торговом терминале",
    "Otwórz monetę w wybranym terminalu handlowym"
  ],
  [
    "У термінал",
    "To terminal",
    "В терминал",
    "Do terminala"
  ],
  [
    "Діапазон",
    "Range",
    "Диапазон",
    "Zakres"
  ],
  [
    "Історія подій на цьому пристрої; історія цінових алертів також відновлюється із сервера.",
    "Event history on this device; price alert history is also recovered from the server.",
    "История событий на этом устройстве; история ценовых алертов также восстанавливается с сервера.",
    "Historia zdarzeń na tym urządzeniu; historia alertów cenowych jest również pobierana z serwera."
  ],
  [
    "Не вдалося скопіювати",
    "Could not copy",
    "Не удалось скопировать",
    "Nie udało się skopiować"
  ],
  [
    "Гостьовий доступ до Скрінера",
    "Guest access to the Screener",
    "Гостевой доступ к Скринеру",
    "Dostęp gościnny do Skanera"
  ],
  [
    "Тільки перегляд списку",
    "Coin list view only",
    "Только просмотр списка",
    "Tylko podgląd listy"
  ],
  [
    "Вам доступний перегляд списку монет, котирувань та аналітичних фільтрів.",
    "You can view the coin list, quotes and analytical filters.",
    "Вам доступен просмотр списка монет, котировок и аналитических фильтров.",
    "Możesz przeglądać listę monet, notowania i filtry analityczne."
  ],
  [
    "графіки",
    "charts",
    "графики",
    "wykresy"
  ],
  [
    "сповіщення в Telegram",
    "Telegram alerts",
    "уведомления в Telegram",
    "powiadomienia w Telegramie"
  ],
  [
    "лінковку з торговим терміналом",
    "trading-terminal linking",
    "связь с торговым терминалом",
    "łączenie z terminalem handlowym"
  ],
  [
    "увійдіть або зареєструйтеся",
    "sign in or register",
    "войдите или зарегистрируйтесь",
    "zaloguj się lub zarejestruj"
  ],
  [
    "Навігація скрінера",
    "Screener navigation",
    "Навигация скринера",
    "Nawigacja skanera"
  ],
  [
    "На початок списку монет",
    "Go to the start of the coin list",
    "К началу списка монет",
    "Przejdź na początek listy monet"
  ],
  [
    "У кінець списку монет",
    "Go to the end of the coin list",
    "В конец списка монет",
    "Przejdź na koniec listy monet"
  ],
  [
    "Пошук монет",
    "Search coins",
    "Поиск монет",
    "Wyszukaj monety"
  ],
  [
    "Очистити пошук монет",
    "Clear coin search",
    "Очистить поиск монет",
    "Wyczyść wyszukiwanie monet"
  ],
  [
    "Розгорнути пресети пошуку",
    "Expand search presets",
    "Развернуть пресеты поиска",
    "Rozwiń presety wyszukiwania"
  ],
  [
    "Пресети пошуку",
    "Search presets",
    "Пресеты поиска",
    "Presety wyszukiwania"
  ],
  [
    "Перемкнути обсяг на Від (≥)",
    "Switch volume to From (≥)",
    "Переключить объём на От (≥)",
    "Przełącz wolumen na Od (≥)"
  ],
  [
    "Перемкнути обсяг на До (≤)",
    "Switch volume to Up to (≤)",
    "Переключить объём на До (≤)",
    "Przełącz wolumen na Do (≤)"
  ],
  [
    "Показано монети з обсягом не більше вибраного (≤). Перемкнути на від (≥).",
    "Showing coins with volume no greater than the selected value (≤). Switch to from (≥).",
    "Показаны монеты с объёмом не выше выбранного (≤). Переключить на от (≥).",
    "Wyświetlane są monety o wolumenie nie większym niż wybrany (≤). Przełącz na od (≥)."
  ],
  [
    "Показано монети з обсягом не менше вибраного (≥). Перемкнути на до (≤).",
    "Showing coins with volume at least the selected value (≥). Switch to up to (≤).",
    "Показаны монеты с объёмом не ниже выбранного (≥). Переключить на до (≤).",
    "Wyświetlane są monety o wolumenie nie mniejszym niż wybrany (≥). Przełącz na do (≤)."
  ],
  [
    "Спробуйте зменшити нижню межу обсягу, змінити фільтр або очистити пошук.",
    "Try lowering the minimum volume, changing a filter or clearing the search.",
    "Попробуйте снизить нижнюю границу объёма, изменить фильтр или очистить поиск.",
    "Spróbuj zmniejszyć minimalny wolumen, zmienić filtr lub wyczyścić wyszukiwanie."
  ],
  [
    "Спробуйте збільшити верхню межу обсягу, змінити фільтр або очистити пошук.",
    "Try increasing the maximum volume, changing a filter or clearing the search.",
    "Попробуйте увеличить верхнюю границу объёма, изменить фильтр или очистить поиск.",
    "Spróbuj zwiększyć maksymalny wolumen, zmienić filtr lub wyczyścić wyszukiwanie."
  ],
  [
    "Лінковка з торговим терміналом (тільки для зареєстрованих)",
    "Trading terminal linking (registered users only)",
    "Связь с торговым терминалом (только для зарегистрированных)",
    "Łączenie z terminalem handlowym (tylko dla zarejestrowanych)"
  ],
  [
    "Відкрити в обраному терміналі",
    "Open in selected terminal",
    "Открыть в выбранном терминале",
    "Otwórz w wybranym terminalu"
  ],
  [
    "Активна 24/7",
    "Active 24/7",
    "Активно 24/7",
    "Aktywne 24/7"
  ],
  [
    "Призупинена",
    "Paused",
    "Приостановлено",
    "Wstrzymane"
  ],
  [
    "Завантаження монет…",
    "Loading coins…",
    "Загрузка монет…",
    "Ładowanie monet…"
  ],
  [
    "24h Range (Low - High)",
    "24h Range (Low - High)",
    "Диапазон 24ч (мин. — макс.)",
    "Zakres 24h (min. — maks.)"
  ],
  [
    "Орієнтовний індекс із перевіреної цінової динаміки, обсягів та доступних історичних рівнів",
    "Estimated index based on verified price movements, volume and available historical levels",
    "Оценочный индекс на основе проверенной динамики цен, объёмов и доступных исторических уровней",
    "Szacunkowy indeks oparty na zweryfikowanych ruchach cen, wolumenie i dostępnych poziomach historycznych"
  ],
  [
    "Не вдалося зберегти стан блока у вашому профілі.",
    "Could not save the panel state to your profile.",
    "Не удалось сохранить состояние блока в профиле.",
    "Nie udało się zapisać stanu panelu w profilu."
  ],
  [
    "Ринкові дані тимчасово недоступні",
    "Market data temporarily unavailable",
    "Рыночные данные временно недоступны",
    "Dane rynkowe są chwilowo niedostępne"
  ],
  [
    "Не вдалося оновити індекс. Перевірте з’єднання або стан бірж.",
    "Could not update the index. Check your connection or exchange status.",
    "Не удалось обновить индекс. Проверьте соединение или состояние бирж.",
    "Nie udało się zaktualizować indeksu. Sprawdź połączenie lub stan giełd."
  ],
  [
    "Настрій ринку:",
    "Market sentiment:",
    "Настроение рынка:",
    "Nastroje rynkowe:"
  ],
  [
    "Завантаження даних…",
    "Loading data…",
    "Загрузка данных…",
    "Ładowanie danych…"
  ],
  [
    "Немає достовірних даних",
    "No reliable data",
    "Нет достоверных данных",
    "Brak wiarygodnych danych"
  ],
  [
    "Настрій Ринку",
    "Market Sentiment",
    "Настроение рынка",
    "Nastroje rynkowe"
  ],
  [
    "Оновити дані",
    "Refresh data",
    "Обновить данные",
    "Odśwież dane"
  ],
  [
    "Сторінки монет активного пресету",
    "Coin pages in the active preset",
    "Страницы монет активного пресета",
    "Strony monet w aktywnym presecie"
  ],
  [
    "Автоматичний масштаб свічок усіх графіків",
    "Auto-scale candles on all charts",
    "Автоматический масштаб свечей на всех графиках",
    "Automatyczne skalowanie świec na wszystkich wykresach"
  ],
  [
    "Автомасштабування доступне для HookChart",
    "Auto-scaling is available for HookChart",
    "Автомасштабирование доступно для HookChart",
    "Automatyczne skalowanie jest dostępne dla HookChart"
  ],
  [
    "Вимкнути автоматичне масштабування свічок усіх графіків",
    "Disable candle auto-scaling on all charts",
    "Выключить автомасштабирование свечей на всех графиках",
    "Wyłącz automatyczne skalowanie świec na wszystkich wykresach"
  ],
  [
    "Автоматично підлаштовувати всі графіки так, щоб свічки не перекривали об’єми",
    "Automatically fit all charts so candles do not overlap volume bars",
    "Автоматически подгонять графики, чтобы свечи не перекрывали объёмы",
    "Automatycznie dopasuj wykresy, aby świece nie zasłaniały słupków wolumenu"
  ],
  [
    "Кількість відкритих блоків монет",
    "Number of open coin panels",
    "Количество открытых блоков монет",
    "Liczba otwartych paneli monet"
  ],
  [
    "1 колонка (зберегти всі графіки)",
    "1 column (keep all charts)",
    "1 колонка (сохранить все графики)",
    "1 kolumna (zachowaj wszystkie wykresy)"
  ],
  [
    "Недостатньо місця у сховищі браузера для локальної копії. Зараз завантажте JSON-файл, щоб не втратити графіки.",
    "Not enough browser storage for a local backup. Download the JSON file now to avoid losing your charts.",
    "Недостаточно места в хранилище браузера для локальной копии. Скачайте JSON-файл сейчас, чтобы не потерять графики.",
    "Brak miejsca w pamięci przeglądarki na kopię lokalną. Pobierz teraz plik JSON, aby nie utracić wykresów."
  ],
  [
    "оновлено",
    "updated",
    "обновлено",
    "zaktualizowano"
  ],
  [
    "завантаження",
    "loading",
    "загрузка",
    "ładowanie"
  ],
  [
    "неповні дані",
    "incomplete data",
    "неполные данные",
    "niepełne dane"
  ],
  [
    "Сторінки великої робочої області",
    "Large workspace pages",
    "Страницы большой рабочей области",
    "Strony dużego obszaru roboczego"
  ],
  [
    "Відтворення свічок готове",
    "Candle replay ready",
    "Воспроизведение свечей готово",
    "Odtwarzanie świec gotowe"
  ],
  [
    "Гарячі клавіші відтворення",
    "Replay hotkeys",
    "Горячие клавиши воспроизведения",
    "Skróty klawiszowe odtwarzania"
  ],
  [
    "Вхід очікує потрібну кількість підтверджених дотиків High/Low",
    "Entry awaits the required number of confirmed High/Low touches",
    "Вход ожидает необходимого количества подтверждённых касаний High/Low",
    "Wejście oczekuje wymaganej liczby potwierdzonych dotknięć High/Low"
  ],
  [
    "Спочатку дочекайтеся підтвердження дотиків High/Low для Entry",
    "Wait for confirmed High/Low touches before Entry",
    "Сначала дождитесь подтверждения касаний High/Low для Entry",
    "Najpierw poczekaj na potwierdzenie dotknięć High/Low przed Entry"
  ],
  [
    "Згорнути складові якості",
    "Collapse quality components",
    "Свернуть составляющие качества",
    "Zwiń składniki jakości"
  ],
  [
    "Розгорнути складові якості",
    "Expand quality components",
    "Развернуть составляющие качества",
    "Rozwiń składniki jakości"
  ],
  [
    "Зважена оцінка якості, не статистична ймовірність успіху",
    "Weighted quality score, not a statistical probability of success",
    "Взвешенная оценка качества, а не статистическая вероятность успеха",
    "Ważona ocena jakości, a nie statystyczne prawdopodobieństwo sukcesu"
  ],
  [
    "Формація",
    "Pattern",
    "Формация",
    "Formacja"
  ],
  [
    "Екстремум",
    "Extreme",
    "Экстремум",
    "Ekstremum"
  ],
  [
    "Пробій",
    "Breakout",
    "Пробой",
    "Wybicie"
  ],
  [
    "Ретест",
    "Retest",
    "Ретест",
    "Retest"
  ],
  [
    "Обсяг",
    "Volume",
    "Объём",
    "Wolumen"
  ],
  [
    "Рівень",
    "Level",
    "Уровень",
    "Poziom"
  ],
  [
    "Якість даних",
    "Data quality",
    "Качество данных",
    "Jakość danych"
  ],
  [
    "Дельта",
    "Delta",
    "Дельта",
    "Delta"
  ],
  [
    "Кругле число",
    "Round number",
    "Круглое число",
    "Okrągła liczba"
  ],
  [
    "Встановлення...",
    "Applying...",
    "Установка...",
    "Ustawianie..."
  ],
  [
    "Встановити всі 3 рівні в Telegram",
    "Set all 3 levels in Telegram",
    "Установить все 3 уровня в Telegram",
    "Ustaw wszystkie 3 poziomy w Telegramie"
  ],
  [
    "Поточна ціна та зміна за 24 години",
    "Current price and 24-hour change",
    "Текущая цена и изменение за 24 часа",
    "Bieżąca cena i zmiana w ciągu 24 godzin"
  ],
  [
    "Розгорнути сповіщення Telegram",
    "Expand Telegram alerts",
    "Развернуть уведомления Telegram",
    "Rozwiń powiadomienia Telegram"
  ],
  [
    "Згорнути сповіщення Telegram",
    "Collapse Telegram alerts",
    "Свернуть уведомления Telegram",
    "Zwiń powiadomienia Telegram"
  ],
  [
    "Розгорнути Розумний аналіз AI + Quant",
    "Expand AI + Quant Smart Analysis",
    "Развернуть умный анализ AI + Quant",
    "Rozwiń inteligentną analizę AI + Quant"
  ],
  [
    "Розгорнути Розумний аналіз",
    "Expand Smart Analysis",
    "Развернуть умный анализ",
    "Rozwiń inteligentną analizę"
  ],
  [
    "· дотики не підтверджені (немає даних)",
    "· touches not confirmed (no data)",
    "· касания не подтверждены (нет данных)",
    "· dotknięcia niepotwierdzone (brak danych)"
  ],
  [
    "Технічні показники звичайного сканування",
    "Technical metrics from the standard scan",
    "Технические показатели обычного сканирования",
    "Wskaźniki techniczne ze standardowego skanowania"
  ],
  [
    "ATR(14) у відсотках від ціни, розрахований із закритих свічок",
    "ATR(14) as a percentage of price, calculated from closed candles",
    "ATR(14) в процентах от цены, рассчитанный по закрытым свечам",
    "ATR(14) jako procent ceny, obliczony z zamkniętych świec"
  ],
  [
    "RSI(14) останньої закритої свічки",
    "RSI(14) of the latest closed candle",
    "RSI(14) последней закрытой свечи",
    "RSI(14) ostatniej zamkniętej świecy"
  ],
  [
    "Зміна реального OI у нативних контрактах за вибраний таймфрейм; лише ф'ючерси",
    "Change in actual OI (native contracts) over the selected timeframe; futures only",
    "Изменение реального OI в нативных контрактах за выбранный таймфрейм; только фьючерсы",
    "Zmiana rzeczywistego OI w kontraktach natywnych w wybranym interwale; tylko futures"
  ],
  [
    "Дельта агресивних покупок мінус продажів Binance, остання закрита свічка",
    "Aggressive buy-minus-sell delta on Binance, latest closed candle",
    "Дельта агрессивных покупок минус продаж на Binance, последняя закрытая свеча",
    "Delta agresywnych zakupów minus sprzedaży na Binance, ostatnia zamknięta świeca"
  ],
  [
    "Сумарна taker delta Binance за останні 20 закритих свічок відносно їхнього обороту",
    "Cumulative Binance taker delta across the last 20 closed candles relative to turnover",
    "Суммарная taker delta Binance за последние 20 закрытых свечей относительно оборота",
    "Skumulowana delta takerów Binance z ostatnich 20 zamkniętych świec względem obrotu"
  ],
  [
    "RVOL обсягу свічки підтвердженого пробою проти попередніх 20 закритих свічок",
    "RVOL of the confirmed breakout candle versus the previous 20 closed candles",
    "RVOL объёма свечи подтверждённого пробоя относительно предыдущих 20 закрытых свечей",
    "RVOL świecy potwierdzonego wybicia względem 20 wcześniejszych zamkniętych świec"
  ],
  [
    "OI сам не визначає напрямок позицій; дельта й CVD — взаємопов'язані дані.",
    "OI alone does not indicate position direction; delta and CVD are related measures.",
    "Сам OI не определяет направление позиций; дельта и CVD — взаимосвязанные данные.",
    "Samo OI nie określa kierunku pozycji; delta i CVD to powiązane miary."
  ],
  [
    "Потік: немає перевірених даних · без штрафу",
    "Flow: no verified data · no penalty",
    "Поток: нет проверенных данных · без штрафа",
    "Przepływ: brak zweryfikowanych danych · bez kary"
  ],
  [
    "✓ Вхід додатково підтверджено потоком",
    "✓ Entry additionally confirmed by order flow",
    "✓ Вход дополнительно подтверждён потоком",
    "✓ Wejście dodatkowo potwierdzone przepływem"
  ],
  [
    "⚠ Дельта та CVD суперечать входу",
    "⚠ Delta and CVD contradict the entry",
    "⚠ Дельта и CVD противоречат входу",
    "⚠ Delta i CVD przeczą wejściu"
  ],
  [
    "Потік підтримує напрямок; основний вхід ще очікується",
    "Order flow supports the direction; primary entry is still pending",
    "Поток поддерживает направление; основной вход ещё ожидается",
    "Przepływ wspiera kierunek; główne wejście jest nadal oczekiwane"
  ],
  [
    "Структура та ринковий потік, нормовані за наявними перевіреними показниками до 100. Не ймовірність успіху.",
    "Structure and market flow normalized to 100 using available verified metrics. Not a success probability.",
    "Структура и рыночный поток нормированы до 100 по доступным проверенным показателям. Не вероятность успеха.",
    "Struktura i przepływ rynkowy znormalizowane do 100 na podstawie dostępnych zweryfikowanych danych. To nie prawdopodobieństwo sukcesu."
  ],
  [
    "Очікування дотиків",
    "Waiting for touches",
    "Ожидание касаний",
    "Oczekiwanie na dotknięcia"
  ],
  [
    "Повноекранний графік HookChart",
    "Fullscreen HookChart chart",
    "Полноэкранный график HookChart",
    "Pełnoekranowy wykres HookChart"
  ],
  [
    "немає перевірених даних",
    "no verified data",
    "нет проверенных данных",
    "brak zweryfikowanych danych"
  ],
  [
    "умову дотиків виконано",
    "touch condition met",
    "условие касаний выполнено",
    "warunek dotknięć spełniony"
  ],
  [
    "очікуємо",
    "waiting",
    "ожидаем",
    "oczekiwanie"
  ],
  [
    "Не вдалося отримати біржовий крок ціни; рівні лише орієнтовні",
    "Could not retrieve exchange tick size; levels are estimates only",
    "Не удалось получить шаг цены биржи; уровни ориентировочные",
    "Nie udało się pobrać kroku ceny z giełdy; poziomy są tylko orientacyjne"
  ],
  [
    "Згорнути панель прогнозних міток",
    "Collapse projected label panel",
    "Свернуть панель прогнозных меток",
    "Zwiń panel etykiet prognozy"
  ],
  [
    "Розгорнути панель прогнозних міток",
    "Expand projected label panel",
    "Развернуть панель прогнозных меток",
    "Rozwiń panel etykiet prognozy"
  ],
  [
    "Згорнути мітки",
    "Collapse labels",
    "Свернуть метки",
    "Zwiń etykiety"
  ],
  [
    "Розгорнути мітки",
    "Expand labels",
    "Развернуть метки",
    "Rozwiń etykiety"
  ],
  [
    "Натисніть на прогнозний рівень, щоб увімкнути або вимкнути його лінії на графіку",
    "Select a projected level to show or hide its lines on the chart",
    "Нажмите на прогнозный уровень, чтобы показать или скрыть его линии на графике",
    "Kliknij prognozowany poziom, aby pokazać lub ukryć jego linie na wykresie"
  ],
  [
    "Ранній вхід",
    "Early entry",
    "Ранний вход",
    "Wczesne wejście"
  ],
  [
    "Вхід після пробою",
    "Entry after breakout",
    "Вход после пробоя",
    "Wejście po wybiciu"
  ],
  [
    "Прогноз TP",
    "Projected TP",
    "Прогноз TP",
    "Prognoza TP"
  ],
  [
    "SL ранній",
    "Early SL",
    "Ранний SL",
    "Wczesny SL"
  ],
  [
    "SL пробій",
    "Breakout SL",
    "SL пробоя",
    "SL wybicia"
  ],
  [
    "Шия",
    "Neckline",
    "Шея",
    "Linia szyi"
  ],
  [
    "Завантажуємо котирування з біржі…",
    "Loading exchange quotes…",
    "Загружаем котировки с биржи…",
    "Wczytywanie notowań z giełdy…"
  ],
  [
    "Не вдалося оновити котирування. Повторимо запит автоматично.",
    "Could not update quotes. We will retry automatically.",
    "Не удалось обновить котировки. Автоматически повторим запрос.",
    "Nie udało się odświeżyć notowań. Automatycznie ponowimy próbę."
  ],
  [
    "Котирування біржі тимчасово недоступні. Монета залишається в обраному.",
    "Exchange quotes temporarily unavailable. Coin stays in your watchlist.",
    "Котировки биржи временно недоступны. Монета остаётся в избранном.",
    "Notowania giełdowe są chwilowo niedostępne. Moneta pozostaje na liście obserwowanych."
  ],
  [
    "Для цієї пари біржа зараз не повернула котирування.",
    "The exchange has not returned quotes for this pair.",
    "Биржа сейчас не вернула котировки для этой пары.",
    "Giełda nie zwróciła obecnie notowań dla tej pary."
  ],
  [
    "Очікуємо котирування біржі. Монета залишається в обраному.",
    "Waiting for exchange quotes. Coin stays in your watchlist.",
    "Ожидаем котировки биржи. Монета остаётся в избранном.",
    "Oczekiwanie na notowania giełdowe. Moneta pozostaje na liście obserwowanych."
  ],
  [
    "Закрити обрані монети",
    "Close watchlist",
    "Закрыть избранные монеты",
    "Zamknij obserwowane monety"
  ],
  [
    "Назва нової папки",
    "New folder name",
    "Название новой папки",
    "Nazwa nowego folderu"
  ],
  [
    "Сортувати обрані монети",
    "Sort watchlist coins",
    "Сортировать избранные монеты",
    "Sortuj obserwowane monety"
  ],
  [
    "Загальний список",
    "All coins",
    "Общий список",
    "Lista ogólna"
  ],
  [
    "Відкрити графік або скопіювати назву",
    "Open chart or copy symbol",
    "Открыть график или скопировать название",
    "Otwórz wykres lub skopiuj symbol"
  ],
  [
    "Немає котирувань",
    "No quotes",
    "Нет котировок",
    "Brak notowań"
  ],
  [
    "Папка для",
    "Folder for",
    "Папка для",
    "Folder dla"
  ],
  [
    "Дії з обраною монетою",
    "Watchlist coin actions",
    "Действия с избранной монетой",
    "Działania dla obserwowanej monety"
  ],
  [
    "Виберіть папку для монети",
    "Choose a folder for the coin",
    "Выберите папку для монеты",
    "Wybierz folder dla monety"
  ],
  [
    "Напрямок ранньої W/M",
    "Early W/M direction",
    "Направление ранней W/M",
    "Kierunek wczesnej W/M"
  ],
  [
    "Напрямок формації",
    "Pattern direction",
    "Направление формации",
    "Kierunek formacji"
  ],
  [
    "Усі W/M",
    "All W/M",
    "Все W/M",
    "Wszystkie W/M"
  ],
  [
    "Стадія ранньої формації",
    "Early pattern stage",
    "Стадия ранней формации",
    "Etap wczesnej formacji"
  ],
  [
    "Потенційна",
    "Potential",
    "Потенциальная",
    "Potencjalna"
  ],
  [
    "Формується",
    "Forming",
    "Формируется",
    "W trakcie formowania"
  ],
  [
    "Фільтри рівнів",
    "Level filters",
    "Фильтры уровней",
    "Filtry poziomów"
  ],
  [
    "Щільність",
    "Liquidity wall",
    "Плотность",
    "Ściana zleceń"
  ],
  [
    "Щільність — лише формації з підтвердженою великою лімітною заявкою в стакані",
    "Liquidity wall — only patterns with a confirmed large limit order in the order book",
    "Плотность — только формации с подтверждённой крупной лимитной заявкой в стакане",
    "Ściana zleceń — tylko formacje z potwierdzonym dużym zleceniem limit w arkuszu"
  ],
  [
    "Круглі числа (ROUND)",
    "Round numbers (ROUND)",
    "Круглые числа (ROUND)",
    "Okrągłe liczby (ROUND)"
  ],
  [
    "Круглі числа (ROUND) — формації біля круглого рівня",
    "Round numbers (ROUND) — patterns near a round-number level",
    "Круглые числа (ROUND) — формации возле круглого уровня",
    "Okrągłe liczby (ROUND) — formacje w pobliżu okrągłego poziomu"
  ],
  [
    "За стадією",
    "By stage",
    "По стадии",
    "Według etapu"
  ],
  [
    "За R:R раннього входу",
    "By early entry R:R",
    "По R:R раннего входа",
    "Według R:R wczesnego wejścia"
  ],
  [
    "За прибутком до TP (%)",
    "By profit to TP (%)",
    "По прибыли до TP (%)",
    "Według zysku do TP (%)"
  ],
  [
    "Спадання — змінити на зростання",
    "Descending — switch to ascending",
    "Убывание — переключить на возрастание",
    "Malejąco — zmień na rosnąco"
  ],
  [
    "Зростання — змінити на спадання",
    "Ascending — switch to descending",
    "Возрастание — переключить на убывание",
    "Rosnąco — zmień na malejąco"
  ],
  [
    "Сортувати за зростанням",
    "Sort ascending",
    "Сортировать по возрастанию",
    "Sortuj rosnąco"
  ],
  [
    "Сортувати за спаданням",
    "Sort descending",
    "Сортировать по убыванию",
    "Sortuj malejąco"
  ],
  [
    "Інформація про стеження за монетами",
    "About coin surveillance",
    "Информация о наблюдении за монетами",
    "Informacje o monitorowaniu monet"
  ],
  [
    "Стежити",
    "Monitor",
    "Наблюдать",
    "Monitoruj"
  ],
  [
    "Очікування щільності…",
    "Waiting for liquidity wall…",
    "Ожидание плотности…",
    "Oczekiwanie na ścianę zleceń…"
  ],
  [
    "Очікування DOM…",
    "Waiting for DOM…",
    "Ожидание DOM…",
    "Oczekiwanie na DOM…"
  ],
  [
    "Немає рівнів вище порогу",
    "No levels above threshold",
    "Нет уровней выше порога",
    "Brak poziomów powyżej progu"
  ],
  [
    "Потрібен свіжий стакан",
    "Fresh order book required",
    "Нужен свежий стакан",
    "Wymagany aktualny arkusz zleceń"
  ],
  [
    "тільки що",
    "just now",
    "только что",
    "przed chwilą"
  ],
  [
    "Немає свіжих даних",
    "No fresh data",
    "Нет свежих данных",
    "Brak aktualnych danych"
  ],
  [
    "Немає щільностей вище поточного порогу в доступній глибині стакана. Очікуємо нових рівнів DOM.",
    "No liquidity walls above the current threshold within available order-book depth. Waiting for new DOM levels.",
    "Нет плотностей выше текущего порога на доступной глубине стакана. Ожидаем новые уровни DOM.",
    "Brak ścian zleceń powyżej bieżącego progu w dostępnej głębokości arkusza. Oczekiwanie na nowe poziomy DOM."
  ],
  [
    "Пошук щільностей очікує свіжого, синхронізованого стакана.",
    "Liquidity wall detection is waiting for a fresh, synchronized order book.",
    "Поиск плотностей ожидает свежий синхронизированный стакан.",
    "Wykrywanie ścian zleceń oczekuje aktualnego, zsynchronizowanego arkusza."
  ],
  [
    "Аналіз...",
    "Analyzing...",
    "Анализ...",
    "Analiza..."
  ],
  [
    "Запустити бектест",
    "Run backtest",
    "Запустить бэктест",
    "Uruchom backtest"
  ],
  [
    "Адаптивний поріг обчислюється з актуальних рівнів DOM та обсягу торгів.",
    "Adaptive threshold is calculated from current DOM levels and trading volume.",
    "Адаптивный порог рассчитывается по текущим уровням DOM и объёму торгов.",
    "Próg adaptacyjny jest obliczany na podstawie aktualnych poziomów DOM i wolumenu."
  ],
  [
    "Застосовується більший із ручного та адаптивного порогів. Сусідні рівні не об’єднуються для досягнення суми.",
    "The higher of manual and adaptive thresholds is applied. Adjacent levels are not combined to meet the amount.",
    "Применяется больший из ручного и адаптивного порогов. Соседние уровни не объединяются для достижения суммы.",
    "Stosowany jest wyższy próg: ręczny lub adaptacyjny. Sąsiednie poziomy nie są łączone w celu osiągnięcia kwoty."
  ],
  [
    "Розділи профілю",
    "Profile sections",
    "Разделы профиля",
    "Sekcje profilu"
  ],
  [
    "УВІМКНЕНО",
    "ON",
    "ВКЛЮЧЕНО",
    "WŁĄCZONE"
  ],
  [
    "ВИМКНЕНО",
    "OFF",
    "ВЫКЛЮЧЕНО",
    "WYŁĄCZONE"
  ],
  [
    "Переглянути",
    "View",
    "Просмотреть",
    "Zobacz"
  ],
  [
    "Невідомий пристрій",
    "Unknown device",
    "Неизвестное устройство",
    "Nieznane urządzenie"
  ],
  [
    "Не вдалося завершити сесію.",
    "Could not end the session.",
    "Не удалось завершить сеанс.",
    "Nie udało się zakończyć sesji."
  ],
  [
    "Не вдалося отримати сесії.",
    "Could not load sessions.",
    "Не удалось получить сеансы.",
    "Nie udało się pobrać sesji."
  ],
  [
    "Не вдалося завершити сесії.",
    "Could not end the sessions.",
    "Не удалось завершить сеансы.",
    "Nie udało się zakończyć sesji."
  ],
  [
    "Не вдалося зупинити серверний пошук",
    "Could not stop the server-side scan",
    "Не удалось остановить серверный поиск",
    "Nie udało się zatrzymać skanowania serwera"
  ],
  [
    "Не отримано підтвердження зупинки",
    "Stop confirmation not received",
    "Не получено подтверждение остановки",
    "Nie otrzymano potwierdzenia zatrzymania"
  ],
  [
    "Не вдалося надіслати команду зупинки. Спробуйте ще раз.",
    "Could not send stop command. Try again.",
    "Не удалось отправить команду остановки. Попробуйте ещё раз.",
    "Nie udało się wysłać polecenia zatrzymania. Spróbuj ponownie."
  ],
  [
    "Пошук зупинено. Уже знайдені формації збережено.",
    "Scan stopped. Previously found patterns were saved.",
    "Поиск остановлен. Уже найденные формации сохранены.",
    "Skanowanie zatrzymane. Wcześniej znalezione formacje zapisano."
  ],
  [
    "Зупиняємо пошук після поточного пакета…",
    "Stopping scan after the current batch…",
    "Останавливаем поиск после текущего пакета…",
    "Zatrzymywanie skanowania po bieżącej partii…"
  ],
  [
    "Інше повне сканування триває. Очікування вільного слота…",
    "Another full scan is running. Waiting for an available slot…",
    "Другое полное сканирование выполняется. Ожидание свободного слота…",
    "Trwa inne pełne skanowanie. Oczekiwanie na wolne miejsce…"
  ],
  [
    "Пошук зупинено до початку перевірки свічок.",
    "Scan stopped before candle verification.",
    "Поиск остановлен до начала проверки свечей.",
    "Skanowanie zatrzymane przed weryfikacją świec."
  ],
  [
    "Сервер повного сканування недоступний",
    "Full-scan server unavailable",
    "Сервер полного сканирования недоступен",
    "Serwer pełnego skanowania jest niedostępny"
  ],
  [
    "Сервер не повернув ID сканування",
    "Server did not return a scan ID",
    "Сервер не вернул ID сканирования",
    "Serwer nie zwrócił ID skanowania"
  ],
  [
    "Втрачено зв’язок із сервером сканування",
    "Connection to scan server lost",
    "Потеряна связь с сервером сканирования",
    "Utracono połączenie z serwerem skanowania"
  ],
  [
    "Пошук не повернув прогрес",
    "Scan progress not returned",
    "Поиск не вернул прогресс",
    "Nie otrzymano postępu skanowania"
  ],
  [
    "Зупинено. Якщо сервер уже отримав запит, він може завершити поточну операцію.",
    "Stopped. If the server already received the request, it may finish its current operation.",
    "Остановлено. Если сервер уже получил запрос, он может завершить текущую операцию.",
    "Zatrzymano. Jeśli serwer otrzymał już żądanie, może dokończyć bieżącą operację."
  ],
  [
    "Зв’язок із поточним серверним скануванням втрачено. Оновіть пошук, щоб відновити перевірку.",
    "Connection to the current server scan was lost. Restart the scan to resume verification.",
    "Связь с текущим серверным сканированием потеряна. Перезапустите поиск для возобновления проверки.",
    "Utracono połączenie z bieżącym skanowaniem serwera. Uruchom je ponownie, aby wznowić weryfikację."
  ],
  [
    "Сервер недоступний. Повна перевірка через браузер…",
    "Server unavailable. Full scan via browser…",
    "Сервер недоступен. Полная проверка через браузер…",
    "Serwer niedostępny. Pełne skanowanie w przeglądarce…"
  ],
  [
    "Повний пошук недоступний.",
    "Full scan unavailable.",
    "Полный поиск недоступен.",
    "Pełne skanowanie niedostępne."
  ],
  [
    "Не вдалося надіслати тикер. Перевірте з’єднання з локальним терміналом.",
    "Could not send ticker. Check the connection to your local terminal.",
    "Не удалось отправить тикер. Проверьте соединение с локальным терминалом.",
    "Nie udało się wysłać tickera. Sprawdź połączenie z lokalnym terminalem."
  ],
  [
    "Дані вибраної формації недоступні в цій вкладці. Показано живий графік монети без непідтверджених рівнів.",
    "Selected pattern data is unavailable in this tab. Showing a live coin chart without unconfirmed levels.",
    "Данные выбранной формации недоступны на этой вкладке. Показан живой график монеты без неподтверждённых уровней.",
    "Dane wybranej formacji nie są dostępne w tej karcie. Wyświetlany jest wykres na żywo bez niepotwierdzonych poziomów."
  ],
  [
    "Проблема сканування",
    "Scan issue",
    "Проблема сканирования",
    "Problem ze skanowaniem"
  ],
  [
    "Підготовка графіка…",
    "Preparing chart…",
    "Подготовка графика…",
    "Przygotowywanie wykresu…"
  ],
  [
    "Ранній режим увімкнено",
    "Early mode enabled",
    "Ранний режим включён",
    "Tryb wczesny włączony"
  ],
  [
    "Увімкнути ранній режим",
    "Enable early mode",
    "Включить ранний режим",
    "Włącz tryb wczesny"
  ],
  [
    "Немає доступної оцінки",
    "No score available",
    "Нет доступной оценки",
    "Brak dostępnej oceny"
  ],
  [
    "Буфер обміну недоступний у браузері",
    "Clipboard unavailable in browser",
    "Буфер обмена недоступен в браузере",
    "Schowek niedostępny w przeglądarce"
  ],
  [
    "Не вдалося скопіювати оцінку",
    "Could not copy the score",
    "Не удалось скопировать оценку",
    "Nie udało się skopiować oceny"
  ],
  [
    "Не вдалося підготувати знімок",
    "Could not prepare snapshot",
    "Не удалось подготовить снимок",
    "Nie udało się przygotować migawki"
  ],
  [
    "Адреса Community недійсна",
    "Invalid Community address",
    "Неверный адрес Community",
    "Nieprawidłowy adres Community"
  ],
  [
    "Не вдалося передати формацію",
    "Could not share pattern",
    "Не удалось передать формацию",
    "Nie udało się przekazać formacji"
  ],
  [
    "Бичачий",
    "Bullish",
    "Бычий",
    "Wzrostowy"
  ],
  [
    "Ведмежий",
    "Bearish",
    "Медвежий",
    "Spadkowy"
  ],
  [
    "Нейтральний",
    "Neutral",
    "Нейтральный",
    "Neutralny"
  ],
  [
    "Передати свічки та авторські Entry/SL/TP у чернетку Community. Публікація лише після вашого підтвердження.",
    "Send candles and your Entry/SL/TP levels to a Community draft. Publish only after you confirm.",
    "Передать свечи и авторские уровни Entry/SL/TP в черновик Community. Публикация только после вашего подтверждения.",
    "Prześlij świece i własne poziomy Entry/SL/TP do szkicu Community. Publikacja dopiero po Twoim potwierdzeniu."
  ],
  [
    "Готуємо графік…",
    "Preparing chart…",
    "Готовим график…",
    "Przygotowywanie wykresu…"
  ],
  [
    "У Community",
    "To Community",
    "В Community",
    "Do Community"
  ],
  [
    "Архівна оцінка з підписом сервера h00k. Не є незалежною перевіркою сигналу.",
    "Archived score signed by the h00k server. Not an independent signal verification.",
    "Архивная оценка с подписью сервера h00k. Не является независимой проверкой сигнала.",
    "Archiwalna ocena podpisana przez serwer h00k. Nie stanowi niezależnej weryfikacji sygnału."
  ],
  [
    "Скопійовано",
    "Copied",
    "Скопировано",
    "Skopiowano"
  ],
  [
    "Підписуємо…",
    "Signing…",
    "Подписываем…",
    "Podpisywanie…"
  ],
  [
    "Оцінка для Community",
    "Score for Community",
    "Оценка для Community",
    "Ocena dla Community"
  ],
  [
    "Свічковий аналіз ціни",
    "Candlestick price analysis",
    "Свечной анализ цены",
    "Analiza ceny na świecach"
  ],
  [
    "Загальні категорії енциклопедії",
    "Encyclopedia categories",
    "Общие категории энциклопедии",
    "Kategorie encyklopedii"
  ],
  [
    "Підкатегорії скальпінгу",
    "Scalping subcategories",
    "Подкатегории скальпинга",
    "Podkategorie skalpingu"
  ],
  [
    "Мінімальна сума ліквідації у доларах США",
    "Minimum liquidation amount in US dollars",
    "Минимальная сумма ликвидации в долларах США",
    "Minimalna kwota likwidacji w dolarach USA"
  ],
  [
    "Тип графіка для візуальних налаштувань",
    "Chart type for visual settings",
    "Тип графика для визуальных настроек",
    "Typ wykresu dla ustawień wizualnych"
  ],
  [
    "Оберіть тип графіка",
    "Select chart type",
    "Выберите тип графика",
    "Wybierz typ wykresu"
  ],
  [
    "Компактний перегляд масштабу",
    "Compact scale preview",
    "Компактный просмотр масштаба",
    "Kompaktowy podgląd skali"
  ],
  [
    "Тип графіка",
    "Chart type",
    "Тип графика",
    "Typ wykresu"
  ],
  [
    "Швидкий перегляд і Повний графік мають спільний масштаб для Скрінера та Формацій. Налаштування телефона й комп’ютера залишаються окремими.",
    "Quick View and Full Chart share scale between Screener and Patterns. Phone and desktop settings remain separate.",
    "Быстрый просмотр и полный график используют общий масштаб для Скринера и Формаций. Настройки телефона и компьютера остаются раздельными.",
    "Szybki podgląd i pełny wykres współdzielą skalę dla Skanera i Formacji. Ustawienia telefonu i komputera pozostają oddzielne."
  ],
  [
    "Пристрій",
    "Device",
    "Устройство",
    "Urządzenie"
  ],
  [
    "Телефон і комп'ютер мають окремі профілі. Редагування одного не змінює вигляд іншого.",
    "Phone and desktop have separate profiles. Editing one does not affect the other.",
    "Телефон и компьютер имеют отдельные профили. Изменение одного не влияет на другой.",
    "Telefon i komputer mają oddzielne profile. Zmiana jednego nie wpływa na drugi."
  ],
  [
    "Телефон",
    "Phone",
    "Телефон",
    "Telefon"
  ],
  [
    "Комп’ютер",
    "Desktop",
    "Компьютер",
    "Komputer"
  ],
  [
    "Попередній перегляд графіка",
    "Chart preview",
    "Предпросмотр графика",
    "Podgląd wykresu"
  ],
  [
    "Повзунки налаштування графіка",
    "Chart adjustment sliders",
    "Ползунки настройки графика",
    "Suwaki ustawień wykresu"
  ],
  [
    "Кількість видимих свічок",
    "Visible candles",
    "Количество видимых свечей",
    "Liczba widocznych świec"
  ],
  [
    "Визначає бажану кількість свічок на ширину графіка. На маленькому екрані фактична кількість обмежується мінімальною шириною свічки.",
    "Sets the desired number of candles across the chart. On small screens, minimum candle width limits the actual count.",
    "Задаёт желаемое количество свечей по ширине графика. На маленьких экранах фактическое количество ограничено минимальной шириной свечи.",
    "Ustawia żądaną liczbę świec na szerokości wykresu. Na małych ekranach rzeczywistą liczbę ogranicza minimalna szerokość świecy."
  ],
  [
    "Вертикальний зум",
    "Vertical zoom",
    "Вертикальный масштаб",
    "Powiększenie pionowe"
  ],
  [
    "Збільшує або зменшує висоту свічок. 1× — природний масштаб. Діапазон 0,01×–100×, можна ввести число вручну. Зміна вимикає автоматичний масштаб ціни.",
    "Increases or decreases candle height. 1× is the natural scale. Range: 0.01×–100×; values can be entered manually. Changing it disables automatic price scaling.",
    "Увеличивает или уменьшает высоту свечей. 1× — естественный масштаб. Диапазон 0,01×–100×, значение можно ввести вручную. Изменение выключает автоматический масштаб цены.",
    "Zwiększa lub zmniejsza wysokość świec. 1× to skala naturalna. Zakres: 0,01×–100×; wartość można wpisać ręcznie. Zmiana wyłącza automatyczne skalowanie ceny."
  ],
  [
    "Точний вертикальний зум",
    "Precise vertical zoom",
    "Точный вертикальный масштаб",
    "Dokładne powiększenie pionowe"
  ],
  [
    "Вільний простір праворуч від останньої свічки (у барах). Значення відображається на схемі одразу. На реальному графіку відступ застосовується для вибраного профілю.",
    "Empty space to the right of the last candle (in bars). The preview updates immediately. The actual chart uses the selected profile's margin.",
    "Свободное пространство справа от последней свечи (в барах). Значение сразу видно на схеме. На реальном графике отступ применяется для выбранного профиля.",
    "Wolna przestrzeń na prawo od ostatniej świecy (w słupkach). Podgląd aktualizuje się od razu. Na wykresie odstęp zależy od wybranego profilu."
  ],
  [
    "Відступ праворуч у барах",
    "Right margin in bars",
    "Отступ справа в барах",
    "Prawy odstęp w słupkach"
  ],
  [
    "Точний відступ праворуч у барах",
    "Precise right margin in bars",
    "Точный отступ справа в барах",
    "Dokładny prawy odstęp w słupkach"
  ],
  [
    "Автоматичний масштаб ціни",
    "Automatic price scale",
    "Автоматический масштаб цены",
    "Automatyczne skalowanie ceny"
  ],
  [
    "Збереження та скидання вигляду графіка",
    "Save and reset chart appearance",
    "Сохранение и сброс вида графика",
    "Zapis i reset wyglądu wykresu"
  ],
  [
    "Доступно лише для відкритого графіка з вибраним типом і пристроєм. У профілі налаштування зберігаються автоматично.",
    "Available only for an open chart of the selected type and device. Profile settings save automatically.",
    "Доступно только для открытого графика выбранного типа и устройства. Настройки профиля сохраняются автоматически.",
    "Dostępne tylko dla otwartego wykresu wybranego typu i urządzenia. Ustawienia profilu zapisują się automatycznie."
  ],
  [
    "Зберегти масштаб і положення свічок із відкритого графіка",
    "Save scale and candle positions from the open chart",
    "Сохранить масштаб и положение свечей открытого графика",
    "Zapisz skalę i położenie świec z otwartego wykresu"
  ],
  [
    "Застосувати цей профіль до всіх типів графіків вибраного пристрою",
    "Apply this profile to all chart types for the selected device",
    "Применить этот профиль ко всем типам графиков выбранного устройства",
    "Zastosuj ten profil do wszystkich typów wykresów na wybranym urządzeniu"
  ],
  [
    "Повернути стандартні параметри тільки вибраного профілю",
    "Restore defaults for selected profile only",
    "Восстановить стандартные параметры только выбранного профиля",
    "Przywróć wartości domyślne tylko dla wybranego profilu"
  ],
  [
    "Поточний вигляд передано на збереження.",
    "Current appearance queued for saving.",
    "Текущий вид отправлен на сохранение.",
    "Bieżący wygląd przekazano do zapisania."
  ],
  [
    "Профіль застосовано до всіх графіків цього пристрою.",
    "Profile applied to all charts on this device.",
    "Профиль применён ко всем графикам на этом устройстве.",
    "Profil zastosowano do wszystkich wykresów na tym urządzeniu."
  ],
  [
    "Стандартні параметри вибраного профілю відновлено.",
    "Selected profile defaults restored.",
    "Стандартные параметры выбранного профиля восстановлены.",
    "Przywrócono ustawienia domyślne wybranego profilu."
  ],
  [
    "Зберігаємо…",
    "Saving…",
    "Сохраняем…",
    "Zapisywanie…"
  ],
  [
    "Збережено.",
    "Saved.",
    "Сохранено.",
    "Zapisano."
  ],
  [
    "Помилка збереження: перевірте підключення.",
    "Save error: check your connection.",
    "Ошибка сохранения: проверьте соединение.",
    "Błąd zapisu: sprawdź połączenie."
  ],
  [
    "Про налаштування графіка",
    "About chart settings",
    "О настройках графика",
    "O ustawieniach wykresu"
  ],
  [
    "Інформація про налаштування графіка",
    "Chart settings information",
    "Информация о настройках графика",
    "Informacje o ustawieniach wykresu"
  ],
  [
    "Максимальна історія свічок",
    "Maximum candle history",
    "Максимальная история свечей",
    "Maksymalna historia świec"
  ],
  [
    "Скільки свічок зберігати на графіку. Від 100 до 5000. Історія підвантажується частинами; на біржі може бути менше даних.",
    "Number of candles to keep on the chart (100–5000). History loads in batches; the exchange may have less data.",
    "Сколько свечей хранить на графике: от 100 до 5000. История загружается частями; у биржи может быть меньше данных.",
    "Liczba świec przechowywanych na wykresie (100–5000). Historia ładuje się partiami; giełda może mieć mniej danych."
  ],
  [
    "Ліквідації",
    "Liquidations",
    "Ликвидации",
    "Likwidacje"
  ],
  [
    "Прогнозні зони Liq · модель за історією",
    "Projected Liq zones · historical model",
    "Прогнозные зоны Liq · историческая модель",
    "Prognozowane strefy Liq · model historyczny"
  ],
  [
    "Long: примусово закриті довгі позиції. Вимкнення приховує їх на графіку, але не змінює загальну суму Liq.",
    "Long: forcibly closed long positions. Disabling hides them on the chart but does not change the total Liq amount.",
    "Long: принудительно закрытые длинные позиции. Отключение скрывает их на графике, но не меняет общую сумму Liq.",
    "Long: przymusowo zamknięte pozycje długie. Wyłączenie ukrywa je na wykresie, ale nie zmienia sumy Liq."
  ],
  [
    "Мінімальна сума Long (USD)",
    "Minimum Long amount (USD)",
    "Минимальная сумма Long (USD)",
    "Minimalna kwota Long (USD)"
  ],
  [
    "Порожнє поле = автоматичний поріг. 0 = усі ліквідації Long.",
    "Empty field = automatic threshold. 0 = all Long liquidations.",
    "Пустое поле = автоматический порог. 0 = все ликвидации Long.",
    "Puste pole = próg automatyczny. 0 = wszystkie likwidacje Long."
  ],
  [
    "Short: примусово закриті короткі позиції. Вимкнення приховує їх на графіку, але не змінює загальну суму Liq.",
    "Short: forcibly closed short positions. Disabling hides them on the chart but does not change the total Liq amount.",
    "Short: принудительно закрытые короткие позиции. Отключение скрывает их на графике, но не меняет общую сумму Liq.",
    "Short: przymusowo zamknięte pozycje krótkie. Wyłączenie ukrywa je na wykresie, ale nie zmienia sumy Liq."
  ],
  [
    "Мінімальна сума Short (USD)",
    "Minimum Short amount (USD)",
    "Минимальная сумма Short (USD)",
    "Minimalna kwota Short (USD)"
  ],
  [
    "Порожнє поле = автоматичний поріг. 0 = усі ліквідації Short.",
    "Empty field = automatic threshold. 0 = all Short liquidations.",
    "Пустое поле = автоматический порог. 0 = все ликвидации Short.",
    "Puste pole = próg automatyczny. 0 = wszystkie likwidacje Short."
  ],
  [
    "Що показувати в AUTO",
    "What to show in AUTO",
    "Что показывать в AUTO",
    "Co wyświetlać w AUTO"
  ],
  [
    "Усі сильні — аномально великі заявки. Потенціал реакції — тільки щільності з контактом ціни та свіжими виконаними угодами або поповненням заявки. Це не гарантія відскоку.",
    "All strong: abnormally large orders. Reaction potential: only liquidity walls touched by price with recent trades or order replenishment. No rebound is guaranteed.",
    "Все сильные — аномально крупные заявки. Потенциал реакции — только плотности с касанием цены и свежими сделками или пополнением заявки. Это не гарантия отскока.",
    "Wszystkie silne — wyjątkowo duże zlecenia. Potencjał reakcji — tylko ściany dotknięte przez cenę z niedawnymi transakcjami lub uzupełnieniem zleceń. To nie gwarantuje odbicia."
  ],
  [
    "Усі сильні",
    "All strong",
    "Все сильные",
    "Wszystkie silne"
  ],
  [
    "Потенціал реакції",
    "Reaction potential",
    "Потенциал реакции",
    "Potencjał reakcji"
  ],
  [
    "Розмір тексту міток рівнів",
    "Level label text size",
    "Размер текста меток уровней",
    "Rozmiar tekstu etykiet poziomów"
  ],
  [
    "Відстань до рівня",
    "Distance to level",
    "Расстояние до уровня",
    "Odległość od poziomu"
  ],
  [
    "Відстань до ROUND",
    "Distance to ROUND",
    "Расстояние до ROUND",
    "Odległość od ROUND"
  ],
  [
    "Аномалія OI",
    "OI anomaly",
    "Аномалия OI",
    "Anomalia OI"
  ],
  [
    "Мінімальний RVOL",
    "Minimum RVOL",
    "Минимальный RVOL",
    "Minimalny RVOL"
  ],
  [
    "Ліквідація від",
    "Liquidation from",
    "Ликвидация от",
    "Likwidacja od"
  ],
  [
    "Мінімальний розмір однієї події",
    "Minimum size of one event",
    "Минимальный размер одного события",
    "Minimalna wielkość jednego zdarzenia"
  ],
  [
    "Якість сигналу від",
    "Signal quality from",
    "Качество сигнала от",
    "Jakość sygnału od"
  ],
  [
    "Для формацій та комплексного аналізу",
    "For patterns and comprehensive analysis",
    "Для формаций и комплексного анализа",
    "Dla formacji i analizy kompleksowej"
  ],
  [
    "Крок покращення",
    "Improvement step",
    "Шаг улучшения",
    "Krok poprawy"
  ],
  [
    "балів",
    "points",
    "баллов",
    "punktów"
  ],
  [
    "Новий рівень рейтингу якості",
    "New quality rating level",
    "Новый уровень рейтинга качества",
    "Nowy poziom oceny jakości"
  ],
  [
    "Комплекс: факторів від",
    "Composite: factors from",
    "Комплекс: факторов от",
    "Analiza łączna: czynników od"
  ],
  [
    "із 6",
    "out of 6",
    "из 6",
    "z 6"
  ],
  [
    "Тільки незалежні наявні підтвердження",
    "Only independent available confirmations",
    "Только независимые доступные подтверждения",
    "Tylko niezależne dostępne potwierdzenia"
  ],
  [
    "Повтор не частіше",
    "Repeat no more often than",
    "Повторять не чаще",
    "Powtarzaj nie częściej niż"
  ],
  [
    "хв",
    "min",
    "мин",
    "min"
  ],
  [
    "Для оновлюваних показників OI / Delta",
    "For updated OI / Delta metrics",
    "Для обновляемых показателей OI / Delta",
    "Dla aktualizowanych wskaźników OI / Delta"
  ],
  [
    "Ціна та рівні",
    "Price and levels",
    "Цена и уровни",
    "Cena i poziomy"
  ],
  [
    "Цінові умови, пробої й психологічні рівні",
    "Price conditions, breakouts and psychological levels",
    "Ценовые условия, пробои и психологические уровни",
    "Warunki cenowe, wybicia i poziomy psychologiczne"
  ],
  [
    "Стакан та потік",
    "Order book and flow",
    "Стакан и поток",
    "Arkusz zleceń i przepływ"
  ],
  [
    "Реальні потоки угод, ліквідації й ліквідність",
    "Real trades, liquidations and liquidity",
    "Реальные потоки сделок, ликвидации и ликвидность",
    "Rzeczywisty przepływ transakcji, likwidacje i płynność"
  ],
  [
    "Формації та Quant",
    "Patterns and Quant",
    "Формации и Quant",
    "Formacje i Quant"
  ],
  [
    "Ранні та підтверджені патерни, оцінка якості",
    "Early and confirmed patterns, quality score",
    "Ранние и подтверждённые паттерны, оценка качества",
    "Wczesne i potwierdzone formacje, ocena jakości"
  ],
  [
    "Особисте та система",
    "Personal and system",
    "Личное и система",
    "Osobiste i systemowe"
  ],
  [
    "Ваші обрані монети, нагляд та стан підключення",
    "Your watchlist, surveillance and connection status",
    "Ваши избранные монеты, наблюдение и состояние подключения",
    "Twoja lista obserwowanych, monitorowanie i stan połączenia"
  ],
  [
    "Не вдалося прочитати локально збережені мелодії.",
    "Could not read locally saved sounds.",
    "Не удалось прочитать локально сохранённые мелодии.",
    "Nie udało się odczytać lokalnie zapisanych dźwięków."
  ],
  [
    "Не вдалося вибрати мелодію.",
    "Could not select the sound.",
    "Не удалось выбрать мелодию.",
    "Nie udało się wybrać dźwięku."
  ],
  [
    "Вибрану мелодію видалено тільки з цього пристрою.",
    "Selected sound removed from this device only.",
    "Выбранная мелодия удалена только с этого устройства.",
    "Wybrany dźwięk usunięto tylko z tego urządzenia."
  ],
  [
    "Не вдалося видалити мелодію.",
    "Could not remove the sound.",
    "Не удалось удалить мелодию.",
    "Nie udało się usunąć dźwięku."
  ],
  [
    "Вкажіть монету BTC або BTCUSDT і відсоток від 0,1 до 50.",
    "Enter BTC or BTCUSDT and a percentage from 0.1 to 50.",
    "Укажите BTC или BTCUSDT и процент от 0,1 до 50.",
    "Podaj BTC lub BTCUSDT oraz procent od 0,1 do 50."
  ],
  [
    "Монету та поріг збережено. Переконайтеся, що головний перемикач також увімкнений.",
    "Coin and threshold saved. Make sure the main switch is enabled too.",
    "Монета и порог сохранены. Убедитесь, что основной переключатель тоже включён.",
    "Zapisano monetę i próg. Upewnij się, że główny przełącznik też jest włączony."
  ],
  [
    "Цей браузер не підтримує такі сповіщення. Центр на сайті працюватиме.",
    "This browser does not support these notifications. The site's notification center will still work.",
    "Этот браузер не поддерживает такие уведомления. Центр на сайте продолжит работать.",
    "Ta przeglądarka nie obsługuje takich powiadomień. Centrum powiadomień w serwisie nadal będzie działać."
  ],
  [
    "Центр сповіщень вимкнено. Дозвіл браузера не активує доставку.",
    "Notification center disabled. Browser permission will not enable delivery.",
    "Центр уведомлений отключён. Разрешение браузера не включит доставку.",
    "Centrum powiadomień jest wyłączone. Zgoda przeglądarki nie włączy dostarczania."
  ],
  [
    "Браузер не надав дозвіл. Перевірте налаштування браузера.",
    "Browser permission not granted. Check your browser settings.",
    "Браузер не предоставил разрешение. Проверьте настройки браузера.",
    "Nie przyznano zgody przeglądarki. Sprawdź jej ustawienia."
  ],
  [
    "Сповіщення на сайті, звуки та повідомлення браузера вимкнені. Інші розділи не змінено.",
    "Site notifications, sounds and browser notifications disabled. Other sections are unchanged.",
    "Уведомления на сайте, звуки и уведомления браузера отключены. Другие разделы не изменены.",
    "Powiadomienia w serwisie, dźwięki i powiadomienia przeglądarki wyłączone. Pozostałe sekcje bez zmian."
  ],
  [
    "Налаштування сповіщень",
    "Notification settings",
    "Настройки уведомлений",
    "Ustawienia powiadomień"
  ],
  [
    "Увімкнено",
    "Enabled",
    "Включено",
    "Włączone"
  ],
  [
    "Вимкнено",
    "Disabled",
    "Выключено",
    "Wyłączone"
  ],
  [
    "Дозволити сповіщення на сайті",
    "Allow site notifications",
    "Разрешить уведомления на сайте",
    "Zezwól na powiadomienia w serwisie"
  ],
  [
    "Увімкнути:",
    "Enable:",
    "Включить:",
    "Włącz:"
  ],
  [
    "Що означає:",
    "Meaning:",
    "Что означает:",
    "Znaczenie:"
  ],
  [
    "Опис сповіщення",
    "Notification description",
    "Описание уведомления",
    "Opis powiadomienia"
  ],
  [
    "Монети для сповіщень",
    "Coins for alerts",
    "Монеты для уведомлений",
    "Monety do powiadomień"
  ],
  [
    "BTC, ETH, SOL — пусто означає всі",
    "BTC, ETH, SOL — empty means all",
    "BTC, ETH, SOL — пусто означает все",
    "BTC, ETH, SOL — puste pole oznacza wszystkie"
  ],
  [
    "BTC або BTCUSDT",
    "BTC or BTCUSDT",
    "BTC или BTCUSDT",
    "BTC lub BTCUSDT"
  ],
  [
    "Вибрати одну зі своїх мелодій",
    "Choose one of your sounds",
    "Выбрать одну из своих мелодий",
    "Wybierz jeden ze swoich dźwięków"
  ],
  [
    "Усі монети",
    "All coins",
    "Все монеты",
    "Wszystkie monety"
  ],
  [
    "Біля максимумів",
    "Near highs",
    "Возле максимумов",
    "Blisko maksimów"
  ],
  [
    "Біля мінімумів",
    "Near lows",
    "Возле минимумов",
    "Blisko minimów"
  ],
  [
    "Не вдалося зберегти налаштування пошуку",
    "Could not save search settings",
    "Не удалось сохранить настройки поиска",
    "Nie udało się zapisać ustawień wyszukiwania"
  ],
  [
    "Мінімальна ціна не може перевищувати максимальну.",
    "Minimum price cannot exceed maximum price.",
    "Минимальная цена не может превышать максимальную.",
    "Cena minimalna nie może przekraczać maksymalnej."
  ],
  [
    "Налаштування за замовчуванням збережено для Скрінера.",
    "Default settings saved for the Screener.",
    "Настройки по умолчанию сохранены для Скринера.",
    "Zapisano ustawienia domyślne dla Skanera."
  ],
  [
    "Введіть назву пресета.",
    "Enter a preset name.",
    "Введите название пресета.",
    "Podaj nazwę presetu."
  ],
  [
    "Досягнуто ліміт 12 пресетів. Видаліть непотрібний.",
    "Limit of 12 presets reached. Delete an unused one.",
    "Достигнут лимит в 12 пресетов. Удалите ненужный.",
    "Osiągnięto limit 12 presetów. Usuń niepotrzebny."
  ],
  [
    "Пресет із такою назвою вже існує.",
    "A preset with this name already exists.",
    "Пресет с таким названием уже существует.",
    "Preset o tej nazwie już istnieje."
  ],
  [
    "Пресет оновлено.",
    "Preset updated.",
    "Пресет обновлён.",
    "Preset zaktualizowano."
  ],
  [
    "Пресет створено.",
    "Preset created.",
    "Пресет создан.",
    "Preset utworzono."
  ],
  [
    "Обраний пресет застосовуватиметься при відкритті Скрінера.",
    "The selected preset will apply when opening Screener.",
    "Выбранный пресет будет применяться при открытии Скринера.",
    "Wybrany preset zostanie zastosowany po otwarciu Skanera."
  ],
  [
    "Пресет видалено.",
    "Preset deleted.",
    "Пресет удалён.",
    "Preset usunięto."
  ],
  [
    "Редагування пресета",
    "Edit preset",
    "Редактирование пресета",
    "Edytuj preset"
  ],
  [
    "Редактор фільтрів і сортування",
    "Filters and sorting editor",
    "Редактор фильтров и сортировки",
    "Edytor filtrów i sortowania"
  ],
  [
    "Наприклад, BTC або ETH",
    "For example, BTC or ETH",
    "Например, BTC или ETH",
    "Na przykład BTC lub ETH"
  ],
  [
    "Межа обсягу за 24 години",
    "24-hour volume threshold",
    "Порог объёма за 24 часа",
    "Próg wolumenu 24h"
  ],
  [
    "До вибраного обсягу включно (≤). Перемкнути на Від.",
    "Up to and including the selected volume (≤). Switch to From.",
    "До выбранного объёма включительно (≤). Переключить на От.",
    "Do wybranego wolumenu włącznie (≤). Przełącz na Od."
  ],
  [
    "Від вибраного обсягу включно (≥). Перемкнути на До.",
    "From and including the selected volume (≥). Switch to Up to.",
    "От выбранного объёма включительно (≥). Переключить на До.",
    "Od wybranego wolumenu włącznie (≥). Przełącz na Do."
  ],
  [
    "≥ — від вибраної суми включно",
    "≥ — at least the selected amount",
    "≥ — от выбранной суммы включительно",
    "≥ — od wybranej kwoty włącznie"
  ],
  [
    "≤ — до вибраної суми включно",
    "≤ — no more than the selected amount",
    "≤ — до выбранной суммы включительно",
    "≤ — do wybranej kwoty włącznie"
  ],
  [
    "Найближчі до межі монети показуються першими, якщо не змінити порядок вручну.",
    "Coins nearest the limit appear first unless sorting is changed manually.",
    "Монеты, ближайшие к границе, отображаются первыми, если не изменить порядок вручную.",
    "Monety najbliższe limitowi są pokazywane jako pierwsze, chyba że ręcznie zmienisz sortowanie."
  ],
  [
    "Необмежено",
    "Unlimited",
    "Без ограничений",
    "Bez ograniczeń"
  ],
  [
    "Наприклад, Скальпінг",
    "For example, Scalping",
    "Например, Скальпинг",
    "Na przykład: Skalping"
  ],
  [
    "Оновити пресет",
    "Update preset",
    "Обновить пресет",
    "Zaktualizuj preset"
  ],
  [
    "Створити пресет",
    "Create preset",
    "Создать пресет",
    "Utwórz preset"
  ],
  [
    "· За замовчуванням",
    "· Default",
    "· По умолчанию",
    "· Domyślnie"
  ],
  [
    "Видалити пресет",
    "Delete preset",
    "Удалить пресет",
    "Usuń preset"
  ],
  [
    "Група MetaScalp має містити число від 001 до 500.",
    "MetaScalp group must be a number from 001 to 500.",
    "Группа MetaScalp должна содержать число от 001 до 500.",
    "Grupa MetaScalp musi zawierać liczbę od 001 do 500."
  ],
  [
    "Порт MetaScalp має бути цілим числом від 1 до 65535.",
    "MetaScalp port must be an integer from 1 to 65535.",
    "Порт MetaScalp должен быть целым числом от 1 до 65535.",
    "Port MetaScalp musi być liczbą całkowitą od 1 do 65535."
  ],
  [
    "Група Tiger: вкажіть A–Z або 0–18.",
    "Tiger group: enter A–Z or 0–18.",
    "Группа Tiger: укажите A–Z или 0–18.",
    "Grupa Tiger: podaj A–Z lub 0–18."
  ],
  [
    "Порт Tiger має бути цілим числом від 1 до 65535.",
    "Tiger port must be an integer from 1 to 65535.",
    "Порт Tiger должен быть целым числом от 1 до 65535.",
    "Port Tiger musi być liczbą całkowitą od 1 do 65535."
  ],
  [
    "Неправильний формат групи для:",
    "Invalid group format for:",
    "Неверный формат группы для:",
    "Nieprawidłowy format grupy dla:"
  ],
  [
    "Налаштування лінковки збережено в профілі.",
    "Terminal linking settings saved in profile.",
    "Настройки связи с терминалом сохранены в профиле.",
    "Ustawienia łączenia z terminalem zapisano w profilu."
  ],
  [
    "Не вдалося зберегти налаштування.",
    "Could not save settings.",
    "Не удалось сохранить настройки.",
    "Nie udało się zapisać ustawień."
  ],
  [
    "MetaScalp знайдено на локальному порту",
    "MetaScalp found on local port",
    "MetaScalp найден на локальном порту",
    "Wykryto MetaScalp na lokalnym porcie"
  ],
  [
    "MetaScalp не знайдено. Запустіть програму й дозвольте локальний доступ.",
    "MetaScalp not found. Start the app and allow local access.",
    "MetaScalp не найден. Запустите программу и разрешите локальный доступ.",
    "Nie znaleziono MetaScalp. Uruchom aplikację i zezwól na dostęp lokalny."
  ],
  [
    "Для Vataga перевірка API поки недоступна. Потрібна офіційна специфікація локального протоколу.",
    "API connectivity test is not yet available for Vataga. An official local protocol specification is required.",
    "Для Vataga проверка API пока недоступна. Нужна официальная спецификация локального протокола.",
    "Test API nie jest jeszcze dostępny dla Vataga. Wymagana jest oficjalna specyfikacja lokalnego protokołu."
  ],
  [
    "· Скопійовано до буфера.",
    "· Copied to clipboard.",
    "· Скопировано в буфер.",
    "· Skopiowano do schowka."
  ],
  [
    "Помилка тестової передачі монети.",
    "Test coin transfer failed.",
    "Ошибка тестовой передачи монеты.",
    "Błąd testowego przesłania monety."
  ],
  [
    "Без лінковки",
    "No terminal linking",
    "Без связи с терминалом",
    "Bez połączenia z terminalem"
  ],
  [
    "Перевіряємо...",
    "Checking...",
    "Проверяем...",
    "Sprawdzanie..."
  ],
  [
    "Перевірити з’єднання",
    "Test connection",
    "Проверить соединение",
    "Sprawdź połączenie"
  ],
  [
    "Увімкніть джерело Скрінер для тестової передачі",
    "Enable Screener as a source for a test transfer",
    "Включите источник Скринер для тестовой передачи",
    "Włącz Skaner jako źródło do przesłania testowego"
  ],
  [
    "Надіслати BTCUSDT Binance Futures у вибраний термінал",
    "Send BTCUSDT Binance Futures to selected terminal",
    "Отправить BTCUSDT Binance Futures в выбранный терминал",
    "Wyślij BTCUSDT Binance Futures do wybranego terminala"
  ],
  [
    "Автоматизація Vataga недоступна до реалізації прямого API.",
    "Vataga automation is unavailable until a direct API is implemented.",
    "Автоматизация Vataga недоступна до реализации прямого API.",
    "Automatyzacja Vataga będzie niedostępna do czasu wdrożenia bezpośredniego API."
  ],
  [
    "Збереження…",
    "Saving…",
    "Сохранение…",
    "Zapisywanie…"
  ],
  [
    "Графіків на сторінці пресету",
    "Charts per preset page",
    "Графиков на странице пресета",
    "Wykresów na stronie presetu"
  ],
  [
    "Початковий показ графіків Термінала",
    "Initial Terminal chart display",
    "Начальный показ графиков Терминала",
    "Początkowy widok wykresów Terminala"
  ],
  [
    "Відновити типовий показ графіків",
    "Restore default chart display",
    "Восстановить стандартный показ графиков",
    "Przywróć domyślny widok wykresów"
  ],
  [
    "Початкова кількість свічок Термінала",
    "Initial Terminal candle count",
    "Начальное количество свечей Терминала",
    "Początkowa liczba świec Terminala"
  ],
  [
    "Початковий відступ Термінала в барах",
    "Initial Terminal right margin in bars",
    "Начальный отступ Терминала в барах",
    "Początkowy prawy odstęp Terminala w słupkach"
  ],
  [
    "Початковий вертикальний масштаб Термінала",
    "Initial Terminal vertical scale",
    "Начальный вертикальный масштаб Терминала",
    "Początkowa pionowa skala Terminala"
  ],
  [
    "Початковий автоматичний масштаб ціни Термінала",
    "Initial Terminal automatic price scaling",
    "Начальный автоматический масштаб цены Терминала",
    "Początkowe automatyczne skalowanie ceny Terminala"
  ],
  [
    "JSON-копія перевищує 2 МБ.",
    "JSON backup exceeds 2 MB.",
    "Размер JSON-копии превышает 2 МБ.",
    "Kopia JSON przekracza 2 MB."
  ],
  [
    "Робочу область відновлено з JSON-копії.",
    "Workspace restored from JSON backup.",
    "Рабочая область восстановлена из JSON-копии.",
    "Przywrócono obszar roboczy z kopii JSON."
  ],
  [
    "Не вдалося імпортувати JSON-копію.",
    "Could not import JSON backup.",
    "Не удалось импортировать JSON-копию.",
    "Nie udało się zaimportować kopii JSON."
  ],
  [
    "У пресеті може бути до 50 графіків.",
    "A preset can contain up to 50 charts.",
    "В пресете может быть до 50 графиков.",
    "Preset może zawierać maksymalnie 50 wykresów."
  ],
  [
    "Імпортувати JSON-копію Термінала",
    "Import Terminal JSON backup",
    "Импортировать JSON-копию Терминала",
    "Importuj kopię JSON Terminala"
  ],
  [
    "Інший пристрій уже змінив Термінал. Хмарну робочу область не перезаписано. Локальні графіки залишаються в цьому браузері.",
    "Another device has already changed Terminal. Cloud workspace was not overwritten. Local charts remain in this browser.",
    "Другое устройство уже изменило Терминал. Облачная рабочая область не перезаписана. Локальные графики остались в этом браузере.",
    "Inne urządzenie zmieniło już Terminal. Obszar roboczy w chmurze nie został nadpisany. Lokalne wykresy pozostają w tej przeglądarce."
  ],
  [
    "Не вдалося синхронізувати пресети.",
    "Could not sync presets.",
    "Не удалось синхронизировать пресеты.",
    "Nie udało się zsynchronizować presetów."
  ],
  [
    "Додайте монети до обраних у скрінері або виберіть поточні графіки. Для обраних монет мають бути доступні дані вибраної біржі та ринку.",
    "Add coins to your Screener watchlist or select current charts. Market data must be available for your selected exchange and market.",
    "Добавьте монеты в избранное Скринера или выберите текущие графики. Данные выбранной биржи и рынка должны быть доступны.",
    "Dodaj monety do obserwowanych w Skanerze lub wybierz bieżące wykresy. Dane muszą być dostępne dla wybranej giełdy i rynku."
  ],
  [
    "Додайте графіки до термінала.",
    "Add charts to Terminal.",
    "Добавьте графики в Терминал.",
    "Dodaj wykresy do Terminala."
  ],
  [
    "Відтворення свічок: вибір історичної дати",
    "Candle replay: choose a historical date",
    "Воспроизведение свечей: выбор исторической даты",
    "Odtwarzanie świec: wybór daty historycznej"
  ],
  [
    "Повернутися на початкову дату відтворення",
    "Return to initial replay date",
    "Вернуться к начальной дате воспроизведения",
    "Wróć do początkowej daty odtwarzania"
  ],
  [
    "Закрити вибір дати",
    "Close date picker",
    "Закрыть выбор даты",
    "Zamknij wybór daty"
  ],
  [
    "1 день тому",
    "1 day ago",
    "1 день назад",
    "1 dzień temu"
  ],
  [
    "3 дні тому",
    "3 days ago",
    "3 дня назад",
    "3 dni temu"
  ],
  [
    "5 днів тому",
    "5 days ago",
    "5 дней назад",
    "5 dni temu"
  ],
  [
    "Закрити вибір монети",
    "Close coin picker",
    "Закрыть выбор монеты",
    "Zamknij wybór monety"
  ],
  [
    "Без тегу",
    "No tag",
    "Без тега",
    "Bez tagu"
  ],
  [
    "Ціна ліміту:",
    "Limit price:",
    "Лимитная цена:",
    "Cena limit: "
  ],
  [
    "Ціна стопу:",
    "Stop price:",
    "Цена стопа:",
    "Cena stop:"
  ],
  [
    "Перевірка CAPTCHA",
    "CAPTCHA verification",
    "Проверка CAPTCHA",
    "Weryfikacja CAPTCHA"
  ],
  [
    "н/д",
    "n/a",
    "н/д",
    "b/d"
  ],
  [
    "Сервер не повернув коректну відповідь розумного аналізу",
    "Server did not return a valid smart analysis response",
    "Сервер не вернул корректный ответ умного анализа",
    "Serwer nie zwrócił poprawnej odpowiedzi analizy inteligentnej"
  ],
  [
    "Згорнути Розумний аналіз AI + Quant",
    "Collapse AI + Quant Smart Analysis",
    "Свернуть умный анализ AI + Quant",
    "Zwiń inteligentną analizę AI + Quant"
  ],
  [
    "Згорнути Розумний аналіз",
    "Collapse Smart Analysis",
    "Свернуть умный анализ",
    "Zwiń inteligentną analizę"
  ],
  [
    "RSI, EMA, Об'єми та Спред",
    "RSI, EMA, Volume and Spread",
    "RSI, EMA, Объёмы и Спред",
    "RSI, EMA, Wolumen i Spread"
  ],
  [
    "Об’єми",
    "Volume",
    "Объёмы",
    "Wolumen"
  ],
  [
    "Спред",
    "Spread",
    "Спред",
    "Spread"
  ],
  [
    "Стакан, POC та Ліквідність",
    "Order book, POC and Liquidity",
    "Стакан, POC и Ликвидность",
    "Arkusz zleceń, POC i Płynność"
  ],
  [
    "Ліквідність",
    "Liquidity",
    "Ликвидность",
    "Płynność"
  ],
  [
    "Open Interest та Деривативи",
    "Open Interest and Derivatives",
    "Open Interest и Деривативы",
    "Open Interest i Derywaty"
  ],
  [
    "Holders / Заявки / ММ / Ризики",
    "Holders / Orders / MM / Risks",
    "Holders / Заявки / ММ / Риски",
    "Holders / Zlecenia / MM / Ryzyko"
  ],
  [
    "Заявки",
    "Orders",
    "Заявки",
    "Zlecenia"
  ],
  [
    "Маркет-мейкер",
    "Market maker",
    "Маркет-мейкер",
    "Animator rynku"
  ],
  [
    "Ризики",
    "Risks",
    "Риски",
    "Ryzyko"
  ],
  [
    "Ковзні середні EMA20 / EMA50",
    "Moving averages EMA20 / EMA50",
    "Скользящие средние EMA20 / EMA50",
    "Średnie kroczące EMA20 / EMA50"
  ],
  [
    "Обсяг останньої закритої 1h свічки (≈ USD)",
    "Volume of the latest closed 1h candle (≈ USD)",
    "Объём последней закрытой свечи 1h (≈ USD)",
    "Wolumen ostatniej zamkniętej świecy 1h (≈ USD)"
  ],
  [
    "Обсяг 24 закритих 1h свічок (≈ USD)",
    "Volume of 24 closed 1h candles (≈ USD)",
    "Объём 24 закрытых свечей 1h (≈ USD)",
    "Wolumen 24 zamkniętych świec 1h (≈ USD)"
  ],
  [
    "Частка обсягу в ціновому кошику:",
    "Volume share in price bucket:",
    "Доля объёма в ценовом диапазоне:",
    "Udział wolumenu w przedziale cenowym:"
  ],
  [
    "Реальна історія OI, лише послідовні свічки",
    "Real OI history, contiguous candles only",
    "Реальная история OI, только последовательные свечи",
    "Rzeczywista historia OI, tylko kolejne świece"
  ],
  [
    "OI доступної біржі",
    "OI of available exchange",
    "OI доступной биржи",
    "OI dostępnej giełdy"
  ],
  [
    "Сумарний OI",
    "Total OI",
    "Суммарный OI",
    "Łączny OI"
  ],
  [
    "Решта",
    "Other",
    "Остальное",
    "Pozostałe"
  ],
  [
    "Реєстрація",
    "Register",
    "Регистрация",
    "Rejestracja"
  ],
  [
    "Вам доступний перегляд списку монет, котирувань та аналітичних фільтрів. Щоб відкривати",
    "You can view the coin list, quotes and analytical filters. To open",
    "Вы можете просматривать список монет, котировки и аналитические фильтры. Чтобы открывать",
    "Możesz przeglądać listę monet, notowania i filtry analityczne. Aby otwierać"
  ],
  [
    ", налаштовувати",
    ", configure",
    ", настраивать",
    ", konfigurować"
  ],
  [
    "та використовувати",
    "and use",
    "и использовать",
    "i korzystać z"
  ],
  [
    ", увійдіть або зареєструйтесь.",
    ", sign in or register.",
    ", войдите или зарегистрируйтесь.",
    ", zaloguj się lub zarejestruj."
  ],
  [
    "Не отримано даних",
    "No data received",
    "Данные не получены",
    "Nie otrzymano danych"
  ],
  [
    "Головна сторінка: Скрінер",
    "Home page: Screener",
    "Главная страница: Скринер",
    "Strona główna: Skaner"
  ],
  [
    "На весь екран (Fullscreen)",
    "Fullscreen",
    "Во весь экран",
    "Pełny ekran"
  ],
  [
    "Основна навігація",
    "Main navigation",
    "Основная навигация",
    "Nawigacja główna"
  ],
  [
    "Формації та патерни (доступно після реєстрації)",
    "Patterns (registration required)",
    "Формации и паттерны (после регистрации)",
    "Formacje (wymagana rejestracja)"
  ],
  [
    "Market Replay: симулятор ринку та відтворення історії свічка за свічкою",
    "Market Replay: market simulator and candle-by-candle history playback",
    "Market Replay: симулятор рынка и воспроизведение истории свеча за свечой",
    "Market Replay: symulator rynku i odtwarzanie historii świeca po świecy"
  ],
  [
    "Торговий термінал (доступно після реєстрації)",
    "Trading terminal (registration required)",
    "Торговый терминал (после регистрации)",
    "Terminal handlowy (wymagana rejestracja)"
  ],
  [
    "Термінал",
    "Terminal",
    "Терминал",
    "Terminal"
  ],
  [
    "Список обраних монет (тільки для зареєстрованих)",
    "Watchlist (registered users only)",
    "Избранные монеты (только для зарегистрированных)",
    "Obserwowane monety (tylko dla zarejestrowanych)"
  ],
  [
    "Список обраних монет",
    "Watchlist",
    "Список избранных монет",
    "Lista obserwowanych monet"
  ],
  [
    "Сповіщення ціни в Telegram (тільки для зареєстрованих)",
    "Telegram price alerts (registered users only)",
    "Уведомления о цене в Telegram (только для зарегистрированных)",
    "Alerty cenowe Telegram (tylko dla zarejestrowanych)"
  ],
  [
    "Сповіщення ціни в Telegram",
    "Telegram price alerts",
    "Уведомления о цене в Telegram",
    "Alerty cenowe Telegram"
  ],
  [
    "Системний нагляд (тільки для зареєстрованих)",
    "System surveillance (registered users only)",
    "Системное наблюдение (только для зарегистрированных)",
    "Monitorowanie systemowe (tylko dla zarejestrowanych)"
  ],
  [
    "Стеження за Монетою (Системний нагляд SignalHook)",
    "Coin surveillance (SignalHook system monitoring)",
    "Наблюдение за монетой (системный мониторинг SignalHook)",
    "Monitorowanie monety (system SignalHook)"
  ],
  [
    "Архів збережених формацій (тільки для зареєстрованих)",
    "Saved patterns archive (registered users only)",
    "Архив сохранённых формаций (только для зарегистрированных)",
    "Archiwum zapisanych formacji (tylko dla zarejestrowanych)"
  ],
  [
    "Архів збережених формацій та графіків",
    "Saved patterns and charts archive",
    "Архив сохранённых формаций и графиков",
    "Archiwum zapisanych formacji i wykresów"
  ],
  [
    "Довідник формацій",
    "Pattern guide",
    "Справочник формаций",
    "Przewodnik po formacjach"
  ],
  [
    "Особистий профіль та налаштування",
    "Personal profile and settings",
    "Личный профиль и настройки",
    "Profil osobisty i ustawienia"
  ],
  [
    "Увійти або створити профіль",
    "Sign in or create a profile",
    "Войти или создать профиль",
    "Zaloguj się lub utwórz profil"
  ],
  [
    "Інтерфейс",
    "Interface",
    "Интерфейс",
    "Interfejs"
  ],
  [
    "Кольори інтерфейсу",
    "Interface colors",
    "Цвета интерфейса",
    "Kolory interfejsu"
  ],
  [
    "Оберіть фон і колір акцентів. Попередній перегляд застосовується одразу до всіх сторінок. Збереження синхронізує вибір з профілем.",
    "Choose the background and accent color. The preview immediately applies to all pages. Saving synchronizes your choice with your profile.",
    "Выберите фон и акцентный цвет. Предпросмотр сразу применяется ко всем страницам. При сохранении выбор синхронизируется с профилем.",
    "Wybierz tło i kolor akcentów. Podgląd od razu dotyczy wszystkich stron. Zapis synchronizuje wybór z profilem."
  ],
  [
    "Фон сайту",
    "Site background",
    "Фон сайта",
    "Tło strony"
  ],
  [
    "Колір акцентів",
    "Accent color",
    "Акцентный цвет",
    "Kolor akcentów"
  ],
  [
    "Оформлення діє на Скрінері, Формаціях, Терміналі, Replay та вікнах сайту. Кольори свічок і торгових сигналів не змінюються.",
    "Appearance applies to Screener, Patterns, Terminal, Replay and site windows. Candle and trading-signal colors stay unchanged.",
    "Оформление действует на Скринере, Формациях, Терминале, Replay и в окнах сайта. Цвета свечей и торговых сигналов не меняются.",
    "Wygląd obowiązuje w Skanerze, Formacjach, Terminalu, Replay i oknach serwisu. Kolory świec i sygnałów handlowych nie zmieniają się."
  ],
  [
    "Кольори збережено у вашому профілі.",
    "Colors saved to your profile.",
    "Цвета сохранены в вашем профиле.",
    "Kolory zapisano w Twoim profilu."
  ],
  [
    "Не вдалося зберегти кольори.",
    "Could not save colors.",
    "Не удалось сохранить цвета.",
    "Nie udało się zapisać kolorów."
  ],
  [
    "Стандартні кольори",
    "Default colors",
    "Стандартные цвета",
    "Kolory domyślne"
  ],
  [
    "Збереження...",
    "Saving...",
    "Сохранение...",
    "Zapisywanie..."
  ],
  [
    "Зберегти кольори",
    "Save colors",
    "Сохранить цвета",
    "Zapisz kolory"
  ],
  [
    "Стандартна",
    "Default",
    "Стандартная",
    "Domyślne"
  ],
  [
    "Оригінальний темно-синій h00k",
    "Original h00k dark blue",
    "Оригинальный тёмно-синий h00k",
    "Oryginalny ciemnogranatowy h00k"
  ],
  [
    "Нічна",
    "Night",
    "Ночная",
    "Nocne"
  ],
  [
    "Глибокий темно-синій фон",
    "Deep dark blue background",
    "Глубокий тёмно-синий фон",
    "Głębokie ciemnogranatowe tło"
  ],
  [
    "Графіт",
    "Graphite",
    "Графит",
    "Grafit"
  ],
  [
    "Нейтральний темно-сірий",
    "Neutral dark gray",
    "Нейтральный тёмно-серый",
    "Neutralny ciemnoszary"
  ],
  [
    "Сливова",
    "Plum",
    "Сливовая",
    "Śliwkowe"
  ],
  [
    "Темний фіолетовий відтінок",
    "Dark purple hue",
    "Тёмный фиолетовый оттенок",
    "Ciemny odcień fioletu"
  ],
  [
    "Бірюзовий",
    "Turquoise",
    "Бирюзовый",
    "Turkusowy"
  ],
  [
    "Синій",
    "Blue",
    "Синий",
    "Niebieski"
  ],
  [
    "Фіолетовий",
    "Purple",
    "Фиолетовый",
    "Fioletowy"
  ],
  [
    "М’ятний",
    "Mint",
    "Мятный",
    "Miętowy"
  ],
  [
    "Бурштиновий",
    "Amber",
    "Янтарный",
    "Bursztynowy"
  ],
  [
    "Оформлення збережено у вашому профілі.",
    "Appearance saved to your profile.",
    "Оформление сохранено в вашем профиле.",
    "Wygląd zapisano w Twoim profilu."
  ],
  [
    "Не вдалося зберегти оформлення.",
    "Could not save appearance.",
    "Не удалось сохранить оформление.",
    "Nie udało się zapisać wyglądu."
  ],
  [
    "Оформлення сайту",
    "Site appearance",
    "Оформление сайта",
    "Wygląd strony"
  ],
  [
    "Кольори й шрифти змінюються одразу. Щоб зберегти їх для свого акаунта та інших пристроїв, натисніть «Зберегти».",
    "Colors and fonts change immediately. To save them for your account and other devices, select “Save”.",
    "Цвета и шрифты изменяются сразу. Чтобы сохранить их для аккаунта и других устройств, нажмите «Сохранить».",
    "Kolory i czcionki zmieniają się od razu. Aby zapisać je na koncie i innych urządzeniach, wybierz „Zapisz”."
  ],
  [
    "Шрифт сайту",
    "Site font",
    "Шрифт сайта",
    "Czcionka strony"
  ],
  [
    "Розмір тексту на сайті",
    "Site text size",
    "Размер текста на сайте",
    "Rozmiar tekstu na stronie"
  ],
  [
    "Розмір впливає на інтерфейс, але не змінює розрахунки та масштаб свічок на графіках.",
    "Text size affects the interface but does not change calculations or candle scaling on charts.",
    "Размер текста влияет на интерфейс, но не меняет расчёты или масштаб свечей на графиках.",
    "Rozmiar tekstu wpływa na interfejs, ale nie zmienia obliczeń ani skali świec na wykresach."
  ],
  [
    "Фон блоків графіків",
    "Chart panel background",
    "Фон блоков графиков",
    "Tło paneli wykresów"
  ],
  [
    "Власний колір графіка",
    "Custom chart color",
    "Свой цвет графика",
    "Własny kolor wykresu"
  ],
  [
    "Оберіть темніший колір для читабельності цін та ліній.",
    "Choose a darker color to keep prices and lines readable.",
    "Выберите более тёмный цвет для читаемости цен и линий.",
    "Wybierz ciemniejszy kolor, aby ceny i linie były czytelne."
  ],
  [
    "Для графіків доступні темні відтінки, щоб осі цін, свічки та торгові позначки залишалися видимими.",
    "Charts support dark shades so price axes, candles and trade markers remain visible.",
    "Для графиков доступны тёмные оттенки, чтобы оси цен, свечи и торговые отметки оставались видимыми.",
    "Na wykresach dostępne są ciemne odcienie, aby osie cenowe, świece i oznaczenia transakcyjne były widoczne."
  ],
  [
    "Мій CSS",
    "My CSS",
    "Мой CSS",
    "Mój CSS"
  ],
  [
    "CSS застосовується тільки у вашому браузері. Дозволені кольори, розміри тексту, товщина шрифту та заокруглення. Заборонені імпорт, URL, анімації та правила зміни розміщення елементів.",
    "CSS applies only in your browser. Colors, text sizes, font weights and rounded corners are allowed. Imports, URLs, animations and layout-changing rules are not allowed.",
    "CSS применяется только в вашем браузере. Разрешены цвета, размеры текста, насыщенность шрифта и скругления. Импорт, URL, анимации и правила изменения расположения элементов запрещены.",
    "CSS działa tylko w Twojej przeglądarce. Dozwolone są kolory, rozmiary tekstu, grubości czcionki i zaokrąglenia. Importy, adresy URL, animacje i reguły zmieniające układ są zabronione."
  ],
  [
    "CSS перевірено: безпечний для попереднього перегляду.",
    "CSS validated: safe for preview.",
    "CSS проверен: безопасен для предпросмотра.",
    "CSS sprawdzony: bezpieczny do podglądu."
  ],
  [
    "Переглянути CSS",
    "Preview CSS",
    "Предпросмотр CSS",
    "Podgląd CSS"
  ],
  [
    "Очистити CSS",
    "Clear CSS",
    "Очистить CSS",
    "Wyczyść CSS"
  ],
  [
    "Зберегти",
    "Save",
    "Сохранить",
    "Zapisz"
  ],
  [
    "Ранковий туман",
    "Morning mist",
    "Утренний туман",
    "Poranna mgła"
  ],
  [
    "Світло-блакитна",
    "Light blue",
    "Светло-голубой",
    "Jasnoniebieskie"
  ],
  [
    "Теплий пісок",
    "Warm sand",
    "Тёплый песок",
    "Ciepły piasek"
  ],
  [
    "Тепла кремова",
    "Warm cream",
    "Тёплый кремовый",
    "Ciepłe kremowe"
  ],
  [
    "Лаванда",
    "Lavender",
    "Лаванда",
    "Lawenda"
  ],
  [
    "Ніжна бузкова",
    "Soft lilac",
    "Нежно-сиреневый",
    "Delikatny liliowy"
  ],
  [
    "Світла м’ята",
    "Light mint",
    "Светлая мята",
    "Jasna mięta"
  ],
  [
    "М’яка зелена",
    "Soft green",
    "Мягкий зелёный",
    "Delikatna zieleń"
  ],
  [
    "Системний",
    "System",
    "Системный",
    "Systemowy"
  ],
  [
    "Моноширинний",
    "Monospace",
    "Моноширинный",
    "O stałej szerokości"
  ],
  [
    "Стандартний",
    "Default",
    "Стандартный",
    "Standardowy"
  ],
  [
    "Чорний",
    "Black",
    "Чёрный",
    "Czarny"
  ],
  [
    "Темно-синій",
    "Dark blue",
    "Тёмно-синий",
    "Ciemnogranatowy"
  ],
  [
    "Сливовий",
    "Plum",
    "Сливовый",
    "Śliwkowy"
  ],
  [
    "CSS має бути текстом.",
    "CSS must be text.",
    "CSS должен быть текстом.",
    "CSS musi być tekstem."
  ],
  [
    "Максимум 3500 символів CSS.",
    "Maximum 3500 CSS characters.",
    "Максимум 3500 символов CSS.",
    "Maksymalnie 3500 znaków CSS."
  ],
  [
    "Заборонені @правила, коментарі та CSS-екранування.",
    "@-rules, comments and CSS escapes are not allowed.",
    "@правила, комментарии и CSS-экранирование запрещены.",
    "Reguły @, komentarze i sekwencje ucieczki CSS są zabronione."
  ],
  [
    "Перевірте закривальні дужки CSS.",
    "Check CSS closing braces.",
    "Проверьте закрывающие скобки CSS.",
    "Sprawdź nawiasy zamykające CSS."
  ],
  [
    "Максимум 24 CSS-правила.",
    "Maximum 24 CSS rules.",
    "Максимум 24 CSS-правила.",
    "Maksymalnie 24 reguły CSS."
  ],
  [
    "Формат: .class { color: #ffffff; }",
    "Format: .class { color: #ffffff; }",
    "Формат: .class { color: #ffffff; }",
    "Format: .class { color: #ffffff; }"
  ],
  [
    "Дозволені прості селектори класів і текстових елементів.",
    "Only simple class and text-element selectors are allowed.",
    "Разрешены только простые селекторы классов и текстовых элементов.",
    "Dozwolone są tylko proste selektory klas i elementów tekstowych."
  ],
  [
    "Максимум 12 властивостей у правилі.",
    "Maximum 12 properties per rule.",
    "Максимум 12 свойств в правиле.",
    "Maksymalnie 12 właściwości na regułę."
  ],
  [
    "Непідтримувана CSS-властивість.",
    "Unsupported CSS property.",
    "Неподдерживаемое CSS-свойство.",
    "Nieobsługiwana właściwość CSS."
  ],
  [
    "Оновлення не вдалося — показані останні отримані дані.",
    "Refresh failed — showing the latest received data.",
    "Не удалось обновить — показаны последние полученные данные.",
    "Nie udało się odświeżyć — wyświetlane są ostatnio pobrane dane."
  ],
  [
    "Частка інструментів із достатньою добовою історією",
    "Share of instruments with sufficient daily history",
    "Доля инструментов с достаточной суточной историей",
    "Udział instrumentów z wystarczającą historią dobową"
  ],
  [
    "достатньо",
    "sufficient",
    "достаточно",
    "wystarczająco"
  ],
  [
    "недостатньо",
    "insufficient",
    "недостаточно",
    "niewystarczająco"
  ],
  [
    "OI/Funding недоступні",
    "OI/Funding unavailable",
    "OI/Funding недоступны",
    "OI/Funding niedostępne"
  ],
  [
    "Джерело: Bybit USDT Perpetual",
    "Source: Bybit USDT Perpetual",
    "Источник: Bybit USDT Perpetual",
    "Źródło: Bybit USDT Perpetual"
  ],
  [
    "Паролі не збігаються. Введіть однаковий пароль у двох полях.",
    "Passwords do not match. Enter the same password in both fields.",
    "Пароли не совпадают. Введите одинаковый пароль в оба поля.",
    "Hasła nie są zgodne. Wpisz to samo hasło w obu polach."
  ],
  [
    "Завантаження…",
    "Loading…",
    "Загрузка…",
    "Wczytywanie…"
  ],
  [
    "Можлива формація",
    "Potential pattern",
    "Возможная формация",
    "Możliwa formacja"
  ],
  [
    "Котирування підключено",
    "Quotes connected",
    "Котировки подключены",
    "Notowania połączone"
  ],
  [
    "Очікування котирування",
    "Waiting for quotes",
    "Ожидание котировок",
    "Oczekiwanie na notowania"
  ],
  [
    "Попередня структура; підтвердження ще немає",
    "Preliminary structure; not confirmed yet",
    "Предварительная структура; подтверждения пока нет",
    "Wstępna struktura; jeszcze bez potwierdzenia"
  ],
  [
    "Власне цінове сповіщення Telegram (не сигнал ранньої формації)",
    "Custom Telegram price alert (not an early pattern signal)",
    "Собственное ценовое уведомление Telegram (не сигнал ранней формации)",
    "Własny alert cenowy Telegram (nie sygnał wczesnej formacji)"
  ],
  [
    "Налаштувати власне сповіщення ціни",
    "Configure custom price alert",
    "Настроить собственное уведомление о цене",
    "Skonfiguruj własny alert cenowy"
  ],
  [
    "Лінковка ·",
    "Terminal link ·",
    "Связь с терминалом ·",
    "Połączenie z terminalem ·"
  ],
  [
    "Відкрити MetaScalp",
    "Open MetaScalp",
    "Открыть MetaScalp",
    "Otwórz MetaScalp"
  ],
  [
    "Повернутися до формацій",
    "Back to patterns",
    "Вернуться к формациям",
    "Wróć do formacji"
  ],
  [
    "Ранній вхід · зона",
    "Early entry · zone",
    "Ранний вход · зона",
    "Wczesne wejście · strefa"
  ],
  [
    "TP · проєкція",
    "TP · projection",
    "TP · прогноз",
    "TP · prognoza"
  ],
  [
    "SL раннього входу",
    "Early entry SL",
    "SL раннего входа",
    "SL wczesnego wejścia"
  ],
  [
    "SL після пробою",
    "Post-breakout SL",
    "SL после пробоя",
    "SL po wybiciu"
  ],
  [
    "Лінія шиї",
    "Neckline",
    "Линия шеи",
    "Linia szyi"
  ],
  [
    "Формація ще не підтверджена",
    "Pattern not confirmed yet",
    "Формация пока не подтверждена",
    "Formacja nie jest jeszcze potwierdzona"
  ],
  [
    "Відкрити графік на весь екран",
    "Open chart fullscreen",
    "Открыть график на весь экран",
    "Otwórz wykres na pełnym ekranie"
  ],
  [
    "Відкрити графік можливої формації на весь екран",
    "Open potential pattern chart fullscreen",
    "Открыть график возможной формации на весь экран",
    "Otwórz wykres możliwej formacji na pełnym ekranie"
  ],
  [
    "Повернутися до картки",
    "Back to card",
    "Вернуться к карточке",
    "Wróć do karty"
  ],
  [
    "Закрити швидкий графік",
    "Close quick chart",
    "Закрыть быстрый график",
    "Zamknij szybki wykres"
  ],
  [
    "R:R ранній 1:",
    "Early R:R 1:",
    "Ранний R:R 1:",
    "Wczesny R:R 1:"
  ],
  [
    "Очікуємо дотики",
    "Waiting for touches",
    "Ожидаем касаний",
    "Oczekiwanie na dotknięcia"
  ],
  [
    "Швидкий перегляд графіка",
    "Quick chart preview",
    "Быстрый просмотр графика",
    "Szybki podgląd wykresu"
  ],
  [
    "Лінковка з терміналом",
    "Trading terminal linking",
    "Связь с торговым терминалом",
    "Łączenie z terminalem"
  ],
  [
    "Власне сповіщення ціни в Telegram, не сигнал ранньої формації",
    "Custom Telegram price alert, not an early pattern signal",
    "Собственное ценовое уведомление Telegram, не сигнал ранней формации",
    "Własny alert cenowy Telegram, nie sygnał wczesnej formacji"
  ],
  [
    "активна",
    "active",
    "активна",
    "aktywna"
  ],
  [
    "призупинена",
    "paused",
    "приостановлена",
    "wstrzymana"
  ],
  [
    "Раннє виявлення W/M формацій",
    "Early W/M pattern detection",
    "Раннее обнаружение W/M формаций",
    "Wczesne wykrywanie formacji W/M"
  ],
  [
    "Отримання списку USDT-пар…",
    "Loading USDT pairs…",
    "Получение списка USDT-пар…",
    "Pobieranie listy par USDT…"
  ],
  [
    "Повний пошук W/M триває",
    "Full W/M scan running",
    "Полный поиск W/M продолжается",
    "Trwa pełne skanowanie W/M"
  ],
  [
    "Повний пошук завершено",
    "Full scan complete",
    "Полный поиск завершён",
    "Pełne skanowanie zakończone"
  ],
  [
    "Частковий результат: не всі пари перевірено",
    "Partial result: not all pairs scanned",
    "Частичный результат: проверены не все пары",
    "Wynik częściowy: nie wszystkie pary sprawdzono"
  ],
  [
    "Зупиняємо пошук…",
    "Stopping scan…",
    "Останавливаем поиск…",
    "Zatrzymywanie skanowania…"
  ],
  [
    "Пошук зупинено",
    "Scan stopped",
    "Поиск остановлен",
    "Skanowanie zatrzymane"
  ],
  [
    "Повний пошук не вдалося виконати",
    "Full scan failed",
    "Не удалось выполнить полный поиск",
    "Nie udało się przeprowadzić pełnego skanowania"
  ],
  [
    "Зупиняється…",
    "Stopping…",
    "Останавливается…",
    "Zatrzymywanie…"
  ],
  [
    "Зупинити пошук",
    "Stop scan",
    "Остановить поиск",
    "Zatrzymaj skanowanie"
  ],
  [
    "Очікування списку торгових пар від бірж",
    "Waiting for trading pairs from exchanges",
    "Ожидание списка торговых пар от бирж",
    "Oczekiwanie na listę par handlowych z giełd"
  ],
  [
    "Хід повного пошуку W/M",
    "Full W/M scan progress",
    "Ход полного поиска W/M",
    "Postęp pełnego skanowania W/M"
  ],
  [
    "У перевіреній частині ринку можливих W/M-формацій не знайдено.",
    "No potential W/M patterns found in the scanned market segment.",
    "В проверенной части рынка возможные W/M-формации не найдены.",
    "W sprawdzonej części rynku nie znaleziono potencjalnych formacji W/M."
  ],
  [
    "За поточними фільтрами можливих W/M-формацій не знайдено.",
    "No potential W/M patterns match the current filters.",
    "По текущим фильтрам возможные W/M-формации не найдены.",
    "Żadne potencjalne formacje W/M nie pasują do bieżących filtrów."
  ],
  [
    "Повноекранний графік відтворення",
    "Fullscreen replay chart",
    "Полноэкранный график воспроизведения",
    "Pełnoekranowy wykres odtwarzania"
  ],
  [
    "Ціни відкриття, максимуму, мінімуму й закриття свічки",
    "Candle open, high, low and close prices",
    "Цены открытия, максимума, минимума и закрытия свечи",
    "Ceny otwarcia, maksimum, minimum i zamknięcia świecy"
  ],
  [
    "Розгорнути графік на весь екран",
    "Expand chart fullscreen",
    "Развернуть график на весь экран",
    "Rozwiń wykres na pełny ekran"
  ],
  [
    "Таймфрейм відтворення",
    "Replay timeframe",
    "Таймфрейм воспроизведения",
    "Interwał odtwarzania"
  ],
  [
    "Вибрати показник для сортування монет.",
    "Select a metric for sorting coins.",
    "Выберите показатель для сортировки монет.",
    "Wybierz wskaźnik do sortowania monet."
  ],
  [
    "Не вдалося оновити повідомлення",
    "Could not update messages",
    "Не удалось обновить сообщения",
    "Nie udało się odświeżyć wiadomości"
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
    "Nowe powiadomienie"
  ],
  [
    "Telegram: доставлено",
    "Telegram: delivered",
    "Telegram: доставлено",
    "Telegram: dostarczono"
  ],
  [
    "Telegram: очікує повторної спроби",
    "Telegram: retry pending",
    "Telegram: ожидает повторной попытки",
    "Telegram: oczekiwanie na ponowną próbę"
  ],
  [
    "Цінова умова спрацювала",
    "Price condition triggered",
    "Ценовое условие сработало",
    "Warunek cenowy został spełniony"
  ],
  [
    "Ф'ючерси",
    "Futures",
    "Фьючерсы",
    "Kontrakty terminowe"
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
    "Перевіряємо CRON...",
    "Checking CRON...",
    "Проверяем CRON...",
    "Sprawdzanie CRON..."
  ],
  [
    "⚡ Запустити тест CRON та сповіщень",
    "⚡ Run CRON and alerts test",
    "⚡ Запустить тест CRON и уведомлений",
    "⚡ Uruchom test CRON i powiadomień"
  ],
  [
    "Успіх!",
    "Success!",
    "Успешно!",
    "Sukces!"
  ],
  [
    "Оновлення повідомлень...",
    "Updating messages...",
    "Обновление сообщений...",
    "Aktualizowanie wiadomości..."
  ],
  [
    "Оновити формат моїх надісланих повідомлень",
    "Update format of my sent messages",
    "Обновить формат моих отправленных сообщений",
    "Zaktualizuj format moich wysłanych wiadomości"
  ],
  [
    "Відступ праворуч",
    "Right margin",
    "Отступ справа",
    "Odstęp po prawej"
  ],
  [
    "Перехрестя",
    "Crosshair",
    "Перекрестие",
    "Krzyżyk"
  ],
  [
    "Товщина ліній",
    "Line width",
    "Толщина линий",
    "Grubość linii"
  ],
  [
    "Горизонтальна та вертикальна лінії курсора.",
    "Horizontal and vertical cursor lines.",
    "Горизонтальная и вертикальная линии курсора.",
    "Pozioma i pionowa linia kursora."
  ],
  [
    "Увімкніть обидва перемикачі, щоб показати повну сітку.",
    "Enable both switches to show the full grid.",
    "Включите оба переключателя, чтобы показать полную сетку.",
    "Włącz oba przełączniki, aby wyświetlić pełną siatkę."
  ],
  [
    "Дистанція від ціни",
    "Distance from price",
    "Расстояние от цены",
    "Odległość od ceny"
  ],
  [
    "Множник порогу AUTO",
    "AUTO threshold multiplier",
    "Множитель порога AUTO",
    "Mnożnik progu AUTO"
  ],
  [
    "Робочу область змінено на іншому пристрої. Локальна копія збережена окремо, автоматичну синхронізацію призупинено.",
    "Workspace changed on another device. A separate local copy was preserved; automatic synchronization is paused.",
    "Рабочая область изменена на другом устройстве. Локальная копия сохранена отдельно, автоматическая синхронизация приостановлена.",
    "Obszar roboczy zmieniono na innym urządzeniu. Lokalna kopia została zachowana osobno; automatyczna synchronizacja jest wstrzymana."
  ],
  [
    "Вибрати таймфрейм",
    "Select timeframe",
    "Выбрать таймфрейм",
    "Wybierz interwał"
  ],
  [
    "Змінити таймфрейм",
    "Change timeframe",
    "Изменить таймфрейм",
    "Zmień interwał"
  ],
  [
    "Виберіть таймфрейм",
    "Choose timeframe",
    "Выберите таймфрейм",
    "Wybierz interwał"
  ],
  [
    "Швидкість відтворення",
    "Replay speed",
    "Скорость воспроизведения",
    "Szybkość odtwarzania"
  ],
  [
    "Вибрати швидкість відтворення",
    "Select replay speed",
    "Выбрать скорость воспроизведения",
    "Wybierz szybkość odtwarzania"
  ],
  [
    "Повноекранне керування відтворенням",
    "Fullscreen replay controls",
    "Полноэкранное управление воспроизведением",
    "Sterowanie odtwarzaniem na pełnym ekranie"
  ],
  [
    "Відтворити (Пробіл)",
    "Play (Space)",
    "Воспроизвести (Пробел)",
    "Odtwórz (Spacja)"
  ],
  [
    "Відтворити",
    "Play",
    "Воспроизвести",
    "Odtwórz"
  ],
  [
    "+1 свічка (→)",
    "+1 candle (→)",
    "+1 свеча (→)",
    "+1 świeca (→)"
  ],
  [
    "+1 свічка",
    "+1 candle",
    "+1 свеча",
    "+1 świeca"
  ],
  [
    "Не вдалося скопіювати назву монети",
    "Could not copy coin symbol",
    "Не удалось скопировать название монеты",
    "Nie udało się skopiować symbolu monety"
  ],
  [
    "Не вдалося зберегти налаштування графіка",
    "Could not save chart settings",
    "Не удалось сохранить настройки графика",
    "Nie udało się zapisać ustawień wykresu"
  ],
  [
    "Налаштування HookChart у профілі",
    "HookChart settings in profile",
    "Настройки HookChart в профиле",
    "Ustawienia HookChart w profilu"
  ],
  [
    "Збережено у профілі",
    "Saved in profile",
    "Сохранено в профиле",
    "Zapisano w profilu"
  ],
  [
    "Щільність BID/ASK",
    "BID/ASK liquidity wall",
    "Плотность BID/ASK",
    "Ściana zleceń BID/ASK"
  ],
  [
    "RVOL пробою",
    "Breakout RVOL",
    "RVOL пробоя",
    "RVOL wybicia"
  ],
  [
    "Кругле число + велика лімітна заявка у поточному знімку стакана. Заявка може зникнути; це не гарантія підтримки або опору.",
    "Round number plus a large limit order in the current order-book snapshot. The order may disappear; support or resistance is not guaranteed.",
    "Круглое число и крупная лимитная заявка в текущем снимке стакана. Заявка может исчезнуть; это не гарантия поддержки или сопротивления.",
    "Okrągły poziom i duże zlecenie limit w bieżącym arkuszu. Zlecenie może zniknąć; nie gwarantuje wsparcia ani oporu."
  ],
  [
    "Канал",
    "Channel",
    "Канал",
    "Kanał"
  ],
  [
    "Нотатка",
    "Note",
    "Заметка",
    "Notatka"
  ],
  [
    "Історія свічок недоступна",
    "Candle history unavailable",
    "История свечей недоступна",
    "Historia świec niedostępna"
  ],
  [
    "Некоректні історичні свічки",
    "Invalid historical candles",
    "Некорректные исторические свечи",
    "Nieprawidłowe świece historyczne"
  ],
  [
    "У режимі відтворення Telegram-сповіщення недоступні.",
    "Telegram alerts are unavailable in replay mode.",
    "В режиме воспроизведения уведомления Telegram недоступны.",
    "Alerty Telegram są niedostępne w trybie odtwarzania."
  ],
  [
    "Увійдіть в акаунт, щоб встановити Telegram-сповіщення.",
    "Sign in to set up Telegram alerts.",
    "Войдите в аккаунт, чтобы настроить уведомления Telegram.",
    "Zaloguj się, aby ustawić alerty Telegram."
  ],
  [
    "Спочатку підключіть Telegram у розділі «Сповіщення».",
    "First connect Telegram in the Notifications section.",
    "Сначала подключите Telegram в разделе «Уведомления».",
    "Najpierw połącz Telegram w sekcji Powiadomienia."
  ],
  [
    "Не вдалося визначити поточну ціну монети.",
    "Could not determine the coin's current price.",
    "Не удалось определить текущую цену монеты.",
    "Nie udało się ustalić bieżącej ceny monety."
  ],
  [
    "На цій ціні вже існує активне сповіщення.",
    "An active alert already exists at this price.",
    "На этой цене уже есть активное уведомление.",
    "Dla tej ceny istnieje już aktywny alert."
  ],
  [
    "Не вдалося зберегти сповіщення.",
    "Could not save the alert.",
    "Не удалось сохранить уведомление.",
    "Nie udało się zapisać alertu."
  ],
  [
    "Не вдалося видалити Telegram-сповіщення.",
    "Could not delete the Telegram alert.",
    "Не удалось удалить уведомление Telegram.",
    "Nie udało się usunąć alertu Telegram."
  ],
  [
    "Мітку та пов’язане сповіщення видалено.",
    "Marker and linked alert deleted.",
    "Метка и связанное уведомление удалены.",
    "Znacznik i powiązany alert usunięte."
  ],
  [
    "Не вдалося видалити мітку.",
    "Could not delete the marker.",
    "Не удалось удалить метку.",
    "Nie udało się usunąć znacznika."
  ],
  [
    "Монета, біржа та таймфрейми",
    "Coin, exchange and timeframes",
    "Монета, биржа и таймфреймы",
    "Moneta, giełda i interwały"
  ],
  [
    "Інструменти блока",
    "Panel tools",
    "Инструменты блока",
    "Narzędzia panelu"
  ],
  [
    "Згорнути панель інструментів HookChart",
    "Collapse HookChart toolbar",
    "Свернуть панель инструментов HookChart",
    "Zwiń pasek narzędzi HookChart"
  ],
  [
    "Розгорнути панель інструментів HookChart",
    "Expand HookChart toolbar",
    "Развернуть панель инструментов HookChart",
    "Rozwiń pasek narzędzi HookChart"
  ],
  [
    "Згорнути панель інструментів",
    "Collapse toolbar",
    "Свернуть панель инструментов",
    "Zwiń pasek narzędzi"
  ],
  [
    "Розгорнути панель інструментів",
    "Expand toolbar",
    "Развернуть панель инструментов",
    "Rozwiń pasek narzędzi"
  ],
  [
    "Додаткові інструменти HookChart",
    "Additional HookChart tools",
    "Дополнительные инструменты HookChart",
    "Dodatkowe narzędzia HookChart"
  ],
  [
    "Прокрутити інструменти вліво",
    "Scroll tools left",
    "Прокрутить инструменты влево",
    "Przewiń narzędzia w lewo"
  ],
  [
    "Прокрутити додаткові інструменти вліво",
    "Scroll additional tools left",
    "Прокрутить дополнительные инструменты влево",
    "Przewiń dodatkowe narzędzia w lewo"
  ],
  [
    "Прокручуваний список додаткових інструментів",
    "Scrollable list of additional tools",
    "Прокручиваемый список дополнительных инструментов",
    "Przewijana lista dodatkowych narzędzi"
  ],
  [
    "TP/SL: немає розрахованих рівнів для цієї монети",
    "TP/SL: no calculated levels for this coin",
    "TP/SL: для этой монеты нет рассчитанных уровней",
    "TP/SL: brak wyliczonych poziomów dla tej monety"
  ],
  [
    "Приховати TP, Вхід і SL",
    "Hide TP, Entry and SL",
    "Скрыть TP, Вход и SL",
    "Ukryj TP, Wejście i SL"
  ],
  [
    "Показати TP, Вхід і SL",
    "Show TP, Entry and SL",
    "Показать TP, Вход и SL",
    "Pokaż TP, Wejście i SL"
  ],
  [
    "TP/SL стане доступним, коли будуть розраховані Вхід, Ціль і Стоп",
    "TP/SL becomes available after Entry, Target and Stop are calculated",
    "TP/SL будет доступен после расчёта Входа, Цели и Стопа",
    "TP/SL będzie dostępne po obliczeniu Wejścia, Celu i Stopu"
  ],
  [
    "Приховати всі три мітки: TP, Вхід, SL",
    "Hide all three labels: TP, Entry, SL",
    "Скрыть все три метки: TP, Вход, SL",
    "Ukryj wszystkie trzy etykiety: TP, Wejście, SL"
  ],
  [
    "Показати всі три мітки: TP, Вхід, SL",
    "Show all three labels: TP, Entry, SL",
    "Показать все три метки: TP, Вход, SL",
    "Pokaż wszystkie trzy etykiety: TP, Wejście, SL"
  ],
  [
    "Недостатньо заявок у діапазоні",
    "Not enough orders in range",
    "Недостаточно заявок в диапазоне",
    "Za mało zleceń w zakresie"
  ],
  [
    "Фільтр реакції щільностей",
    "Liquidity-wall reaction filter",
    "Фильтр реакции плотностей",
    "Filtr reakcji ścian zleceń"
  ],
  [
    "Прокрутити інструменти вправо",
    "Scroll tools right",
    "Прокрутить инструменты вправо",
    "Przewiń narzędzia w prawo"
  ],
  [
    "Прокрутити додаткові інструменти вправо",
    "Scroll additional tools right",
    "Прокрутить дополнительные инструменты вправо",
    "Przewiń dodatkowe narzędzia w prawo"
  ],
  [
    "Карта ліквідацій",
    "Liquidation map",
    "Карта ликвидаций",
    "Mapa likwidacji"
  ],
  [
    "Період карти ліквідацій",
    "Liquidation map period",
    "Период карты ликвидаций",
    "Okres mapy likwidacji"
  ],
  [
    "Вимкнути карту ліквідацій",
    "Disable liquidation map",
    "Выключить карту ликвидаций",
    "Wyłącz mapę likwidacji"
  ],
  [
    "Увімкнути карту ліквідацій",
    "Enable liquidation map",
    "Включить карту ликвидаций",
    "Włącz mapę likwidacji"
  ],
  [
    "Вимкнути карту ліквідацій (отримані події, не прогноз)",
    "Disable liquidation map (recorded events, not a forecast)",
    "Выключить карту ликвидаций (полученные события, не прогноз)",
    "Wyłącz mapę likwidacji (zarejestrowane zdarzenia, nie prognoza)"
  ],
  [
    "Увімкнути карту ліквідацій (отримані події, не прогноз)",
    "Enable liquidation map (recorded events, not a forecast)",
    "Включить карту ликвидаций (полученные события, не прогноз)",
    "Włącz mapę likwidacji (zarejestrowane zdarzenia, nie prognoza)"
  ],
  [
    "Дії графіка",
    "Chart actions",
    "Действия с графиком",
    "Działania wykresu"
  ],
  [
    "· неповний набір",
    "· incomplete data",
    "· неполный набор",
    "· niepełne dane"
  ],
  [
    "· смуги: історична модель, НЕ підтверджені майбутні ліквідації",
    "· bands: historical model, NOT confirmed future liquidations",
    "· полосы: историческая модель, НЕ подтверждённые будущие ликвидации",
    "· pasma: model historyczny, NIE potwierdzone przyszłe likwidacje"
  ],
  [
    "· для модельних смуг недостатньо повторів або дані неповні",
    "· insufficient repetitions or incomplete data for modeled bands",
    "· для модельных полос недостаточно повторов или данные неполные",
    "· za mało powtórzeń lub niepełne dane dla modelowanych pasm"
  ],
  [
    "· без прогнозу",
    "· no forecast",
    "· без прогноза",
    "· bez prognozy"
  ],
  [
    "За цей період збережених Liq немає",
    "No recorded Liq events for this period",
    "За этот период нет сохранённых Liq",
    "Brak zapisanych zdarzeń Liq w tym okresie"
  ],
  [
    "Архів Liq не увімкнений на сервері",
    "Liq archive is not enabled on the server",
    "Архив Liq не включён на сервере",
    "Archiwum Liq nie jest włączone na serwerze"
  ],
  [
    "Історія Liq тимчасово недоступна",
    "Liq history temporarily unavailable",
    "История Liq временно недоступна",
    "Historia Liq jest chwilowo niedostępna"
  ],
  [
    "Завантаження карти Liq…",
    "Loading Liq map…",
    "Загрузка карты Liq…",
    "Ładowanie mapy Liq…"
  ],
  [
    "Очистити фігури та локальні мітки (Telegram-сповіщення видаляються натисканням на лінію)",
    "Clear drawings and local markers (remove Telegram alerts by selecting their line)",
    "Очистить фигуры и локальные метки (уведомления Telegram удаляются нажатием на линию)",
    "Wyczyść rysunki i lokalne znaczniki (alerty Telegram usuwa się przez kliknięcie linii)"
  ],
  [
    "Видалити цінове сповіщення",
    "Delete price alert",
    "Удалить ценовое уведомление",
    "Usuń alert cenowy"
  ],
  [
    "Telegram-сповіщення",
    "Telegram alert",
    "Уведомление Telegram",
    "Alert Telegram"
  ],
  [
    "Локальна мітка",
    "Local marker",
    "Локальная метка",
    "Lokalny znacznik"
  ],
  [
    "Видалення…",
    "Deleting…",
    "Удаление…",
    "Usuwanie…"
  ],
  [
    "Закрити повідомлення",
    "Close message",
    "Закрыть сообщение",
    "Zamknij komunikat"
  ],
  [
    "Показники ринку",
    "Market indicators",
    "Рыночные показатели",
    "Wskaźniki rynkowe"
  ],
  [
    "Кореляція BTC недоступна: недостатньо однакових закритих свічок або немає відповіді біржі.",
    "BTC correlation unavailable: insufficient matching closed candles or no exchange response.",
    "Корреляция BTC недоступна: недостаточно одинаковых закрытых свечей или нет ответа биржи.",
    "Korelacja BTC niedostępna: zbyt mało zgodnych zamkniętych świec lub brak odpowiedzi giełdy."
  ],
  [
    "Справжня кількість угод за останні 24 години за даними Binance 24h ticker. Якщо даних немає, показано —.",
    "Actual number of trades in the past 24 hours from Binance 24h ticker. If unavailable, — is shown.",
    "Фактическое количество сделок за последние 24 часа по данным Binance 24h ticker. Если данных нет, показано —.",
    "Rzeczywista liczba transakcji w ostatnich 24 godzinach według danych Binance 24h ticker. Jeśli brak danych, wyświetlane jest —."
  ],
  [
    "Змінює мову підписів, меню й повідомлень HookChart. Не змінює мову назв монет або біржових даних.",
    "Changes HookChart labels, menus and messages. Coin symbols and exchange data are not translated.",
    "Меняет язык подписей, меню и сообщений HookChart. Названия монет и биржевые данные не переводятся.",
    "Zmienia język etykiet, menu i komunikatów HookChart. Symbole monet i dane giełdowe nie są tłumaczone."
  ],
  [
    "Визначає часовий пояс для підписів часу на графіку та пов’язаних часових відміток. На самі свічки й біржові ціни не впливає.",
    "Sets the time zone for chart time labels and related timestamps. Candle and exchange prices are unaffected.",
    "Задаёт часовой пояс для подписей времени на графике и связанных временных отметок. На свечи и биржевые цены не влияет.",
    "Ustawia strefę czasową etykiet na wykresie i powiązanych znaczników czasu. Nie zmienia świec ani cen giełdowych."
  ],
  [
    "Вмикає або вимикає звичайні пояснення елементів інтерфейсу при наведенні. Пояснення біля знаків «?» у цій вкладці залишаються доступними.",
    "Shows or hides standard tooltips on hover. Help beside the '?' icons in this tab remains available.",
    "Включает или выключает обычные подсказки при наведении. Пояснения возле значков «?» в этой вкладке остаются доступны.",
    "Włącza lub wyłącza zwykłe podpowiedzi po najechaniu. Wyjaśnienia przy ikonach „?” w tej karcie pozostają dostępne."
  ],
  [
    "Передбачає відкриття монети зі сповіщення в окремому вікні замість поточної сторінки.",
    "Opens a coin from a notification in a separate window rather than the current page.",
    "Открывает монету из уведомления в отдельном окне вместо текущей страницы.",
    "Otwiera monetę z powiadomienia w osobnym oknie zamiast na bieżącej stronie."
  ],
  [
    "Обмежує кількість історичних свічок у пам’яті одного графіка (від 100 до 5000). Старіші свічки підвантажуються за наявності даних у біржі.",
    "Limits historical candles kept in one chart's memory (100–5000). Older candles load when available from the exchange.",
    "Ограничивает количество исторических свечей в памяти одного графика (от 100 до 5000). Более старые свечи загружаются при наличии данных биржи.",
    "Ogranicza liczbę świec historycznych w pamięci wykresu (100–5000). Starsze świece są pobierane, jeśli giełda udostępnia dane."
  ],
  [
    "Показує або приховує інструменти керування HookChart: малювання, накладання та інші кнопки в області графіка.",
    "Shows or hides HookChart controls such as drawing, overlays and other chart buttons.",
    "Показывает или скрывает инструменты HookChart: рисование, наложения и другие кнопки на графике.",
    "Pokazuje lub ukrywa narzędzia HookChart, w tym rysowanie, nakładki i pozostałe przyciski wykresu."
  ],
  [
    "Керує додатковими іконками над графіком. Вибір таймфрейму залишається доступним.",
    "Controls additional icons above the chart. Timeframe selection remains available.",
    "Управляет дополнительными значками над графиком. Выбор таймфрейма остаётся доступным.",
    "Steruje dodatkowymi ikonami nad wykresem. Wybór interwału pozostaje dostępny."
  ],
  [
    "Показує під свічками сумарні обсяги великих ринкових угод, якщо для цього інструмента є дані.",
    "Shows total volumes of large market trades beneath candles when data is available for the instrument.",
    "Показывает под свечами суммарный объём крупных рыночных сделок, если есть данные по инструменту.",
    "Pokazuje pod świecami łączny wolumen dużych transakcji rynkowych, jeśli dane są dostępne."
  ],
  [
    "Показує або приховує гістограму торгових обсягів унизу графіка.",
    "Shows or hides the trading-volume histogram at the bottom of the chart.",
    "Показывает или скрывает гистограмму торговых объёмов внизу графика.",
    "Pokazuje lub ukrywa histogram wolumenu obrotu na dole wykresu."
  ],
  [
    "Показує або приховує нижній рядок ринкових показників під графіком.",
    "Shows or hides the lower row of market metrics beneath the chart.",
    "Показывает или скрывает нижнюю строку рыночных показателей под графиком.",
    "Pokazuje lub ukrywa dolny wiersz wskaźników rynkowych pod wykresem."
  ],
  [
    "Передбачає відображення діалогу сповіщень у режимі кількох графіків та на графіку однієї монети.",
    "Displays the alerts dialog in multi-chart mode and in a single-coin chart.",
    "Предусматривает показ окна уведомлений в режиме нескольких графиков и на графике одной монеты.",
    "Wyświetla okno alertów w trybie wielu wykresów oraz na wykresie pojedynczej monety."
  ],
  [
    "Передбачає вибір розміру окремого вікна графіка як відсотка від екрана.",
    "Lets you set a separate chart window's size as a percentage of the screen.",
    "Позволяет выбрать размер отдельного окна графика в процентах от экрана.",
    "Pozwala ustawić rozmiar osobnego okna wykresu jako procent ekranu."
  ],
  [
    "Передбачає окремі кнопки переходу між графіками в режимі перегляду всіх монет.",
    "Provides dedicated buttons to switch between charts when viewing all coins.",
    "Добавляет отдельные кнопки перехода между графиками в режиме просмотра всех монет.",
    "Udostępnia osobne przyciski do przełączania wykresów w widoku wszystkich monet."
  ],
  [
    "Дозволяє використовувати збережені фігури малювання однієї монети в різних режимах перегляду.",
    "Reuses saved drawings for a coin across chart view modes.",
    "Позволяет использовать сохранённые рисунки одной монеты в разных режимах просмотра.",
    "Pozwala używać zapisanych rysunków danej monety w różnych trybach widoku."
  ],
  [
    "Передбачає синхронне відображення ліній курсора на пов’язаних графіках.",
    "Synchronizes cursor crosshair lines across linked charts.",
    "Синхронизирует линии перекрестия курсора на связанных графиках.",
    "Synchronizuje linie kursora na powiązanych wykresach."
  ],
  [
    "Вмикає або приховує позначки примусових ліквідацій позицій на свічковому графіку.",
    "Shows or hides forced-position-liquidation markers on the candlestick chart.",
    "Показывает или скрывает отметки принудительных ликвидаций позиций на свечном графике.",
    "Pokazuje lub ukrywa znaczniki przymusowych likwidacji pozycji na wykresie świecowym."
  ],
  [
    "Показує або приховує інформаційний блок ліквідацій (Liq) та каскадної активності.",
    "Shows or hides the liquidations (Liq) and cascade-activity information panel.",
    "Показывает или скрывает информационный блок ликвидаций (Liq) и каскадной активности.",
    "Pokazuje lub ukrywa panel informacji o likwidacjach (Liq) i aktywności kaskadowej."
  ],
  [
    "Показує примусово закриті довгі позиції. Вимкнення прибирає їхні позначки, але не змінює загальний лічильник Liq.",
    "Shows forcibly closed long positions. Turning this off hides the markers without changing the total Liq counter.",
    "Показывает принудительно закрытые длинные позиции. Отключение скрывает метки, но не меняет общий счётчик Liq.",
    "Pokazuje przymusowo zamknięte pozycje długie. Wyłączenie ukrywa znaczniki, ale nie zmienia licznika Liq."
  ],
  [
    "Мінімальний розмір ліквідації Long у доларах для показу позначки. Порожньо — автоматичний поріг, 0 — усі отримані події.",
    "Minimum Long liquidation amount in USD for a marker. Blank means automatic threshold; 0 shows all received events.",
    "Минимальная сумма ликвидации Long в долларах для метки. Пустое поле — автоматический порог, 0 — все полученные события.",
    "Minimalna kwota likwidacji Long w USD dla znacznika. Puste pole — próg automatyczny, 0 — wszystkie otrzymane zdarzenia."
  ],
  [
    "Показує примусово закриті короткі позиції. Вимкнення прибирає їхні позначки, але не змінює загальний лічильник Liq.",
    "Shows forcibly closed short positions. Turning this off hides the markers without changing the total Liq counter.",
    "Показывает принудительно закрытые короткие позиции. Отключение скрывает метки, но не меняет общий счётчик Liq.",
    "Pokazuje przymusowo zamknięte pozycje krótkie. Wyłączenie ukrywa znaczniki, ale nie zmienia licznika Liq."
  ],
  [
    "Мінімальний розмір ліквідації Short у доларах для показу позначки. Порожньо — автоматичний поріг, 0 — усі отримані події.",
    "Minimum Short liquidation amount in USD for a marker. Blank means automatic threshold; 0 shows all received events.",
    "Минимальная сумма ликвидации Short в долларах для метки. Пустое поле — автоматический порог, 0 — все полученные события.",
    "Minimalna kwota likwidacji Short w USD dla znacznika. Puste pole — próg automatyczny, 0 — wszystkie otrzymane zdarzenia."
  ],
  [
    "Змінює товщину горизонтальної та вертикальної ліній перехрестя курсора в пікселях.",
    "Changes the thickness of horizontal and vertical crosshair lines in pixels.",
    "Изменяет толщину горизонтальной и вертикальной линий перекрестия в пикселях.",
    "Zmienia grubość poziomej i pionowej linii kursora w pikselach."
  ],
  [
    "Показує або приховує горизонтальні лінії сітки на рівнях цін.",
    "Shows or hides horizontal grid lines at price levels.",
    "Показывает или скрывает горизонтальные линии сетки на уровнях цен.",
    "Pokazuje lub ukrywa poziome linie siatki przy poziomach cenowych."
  ],
  [
    "Показує або приховує вертикальні лінії сітки вздовж часової осі.",
    "Shows or hides vertical grid lines along the time axis.",
    "Показывает или скрывает вертикальные линии сетки вдоль временной оси.",
    "Pokazuje lub ukrywa pionowe linie siatki wzdłuż osi czasu."
  ],
  [
    "Застосовує набір готових кольорів для свічок, щільностей і підписів. Пізніше кожен колір можна змінити окремо.",
    "Applies a preset color palette to candles, liquidity walls and labels. Each color can be adjusted later.",
    "Применяет готовую палитру цветов свечей, плотностей и подписей. Каждый цвет можно изменить отдельно.",
    "Stosuje gotową paletę kolorów świec, ścian zleceń i etykiet. Każdy kolor można później zmienić osobno."
  ],
  [
    "Вибирає колір свічок зростання ціни.",
    "Selects the color of rising-price candles.",
    "Выбирает цвет свечей роста цены.",
    "Wybiera kolor świec wzrostowych."
  ],
  [
    "Визначає колір свічок зниження ціни у графіках HookChart, де застосовується цей профіль оформлення.",
    "Sets the color of falling-price candles in charts using this HookChart appearance profile.",
    "Определяет цвет свечей падения цены на графиках HookChart с этим профилем оформления.",
    "Ustawia kolor świec spadkowych na wykresach z tym profilem wyglądu HookChart."
  ],
  [
    "Вмикає або вимикає сценарну оцінку монет за сукупністю доступних ринкових ознак.",
    "Enables or disables scenario-based coin scoring using available market signals.",
    "Включает или выключает сценарную оценку монет по совокупности доступных рыночных признаков.",
    "Włącza lub wyłącza ocenę scenariuszową monet na podstawie dostępnych sygnałów rynkowych."
  ],
  [
    "Передбачає показ відстані поточної ціни до найближчого психологічного круглого рівня.",
    "Shows the current price's distance to the nearest psychological round-number level.",
    "Показывает расстояние текущей цены до ближайшего психологического круглого уровня.",
    "Pokazuje odległość bieżącej ceny od najbliższego psychologicznego okrągłego poziomu."
  ],
  [
    "Визначає, наскільки грубо або детально алгоритм визначає круглі цінові рівні.",
    "Controls how coarse or detailed the algorithm's round-price-level detection is.",
    "Определяет, насколько грубо или детально алгоритм ищет круглые ценовые уровни.",
    "Określa dokładność wykrywania okrągłych poziomów cenowych przez algorytm."
  ],
  [
    "Накладає на графік тонкі лінії на круглих цінових рівнях.",
    "Draws thin lines at round-number price levels on the chart.",
    "Наносит на график тонкие линии на круглых ценовых уровнях.",
    "Rysuje cienkie linie na okrągłych poziomach cenowych."
  ],
  [
    "Вмикає автоматичні лінії підтримки (S) й опору (R) на графіку. Підтверджено пробиті рівні можуть приховуватися окремою логікою.",
    "Enables automatic support (S) and resistance (R) lines. Confirmed broken levels may be hidden separately.",
    "Включает автоматические линии поддержки (S) и сопротивления (R). Подтверждённые пробитые уровни могут скрываться отдельно.",
    "Włącza automatyczne linie wsparcia (S) i oporu (R). Potwierdzone przebite poziomy mogą być ukrywane osobno."
  ],
  [
    "Вмикає або вимикає текстові позначки S і R поруч із рівнями, не змінюючи самих ліній.",
    "Shows or hides S/R text labels without changing the level lines.",
    "Показывает или скрывает подписи S и R, не изменяя сами линии уровней.",
    "Pokazuje lub ukrywa etykiety S i R bez zmiany samych linii poziomów."
  ],
  [
    "Визначає, на яких таймфреймах шукати автоматичні цінові рівні. Якщо зняти всі, автовизначення вимикається.",
    "Chooses timeframes used to detect automatic price levels. Deselecting all disables detection.",
    "Выбирает таймфреймы поиска автоматических ценовых уровней. Снятие всех отключает автоопределение.",
    "Wybiera interwały do wykrywania automatycznych poziomów cenowych. Odznaczenie wszystkich wyłącza wykrywanie."
  ],
  [
    "Змінює колір підписів і активних рівнів. Пробиті рівні можуть відображатися сірим.",
    "Changes the color of labels and active levels. Broken levels may appear gray.",
    "Меняет цвет подписей и активных уровней. Пробитые уровни могут отображаться серыми.",
    "Zmienia kolor etykiet i aktywnych poziomów. Przebite poziomy mogą być szare."
  ],
  [
    "Показує окремі модельні горизонтальні смуги там, де історичні ліквідації повторювалися в кількох незалежних часових кошиках. Не відображає підтверджені відкриті позиції, суми майбутніх ліквідацій або достовірну ймовірність. Обчислюється лише після ручного увімкнення карти Liq.",
    "Shows modeled horizontal bands where historical liquidations repeated across independent time buckets. These are not verified open positions, future liquidation amounts or reliable probabilities. Calculated only after manually enabling the Liq map.",
    "Показывает модельные горизонтальные полосы там, где исторические ликвидации повторялись в нескольких независимых временных интервалах. Это не подтверждённые открытые позиции, суммы будущих ликвидаций или достоверная вероятность. Расчёт выполняется только после ручного включения карты Liq.",
    "Pokazuje modelowane poziome pasma tam, gdzie historyczne likwidacje powtarzały się w niezależnych przedziałach czasowych. Nie oznaczają potwierdzonych pozycji, przyszłych kwot likwidacji ani wiarygodnego prawdopodobieństwa. Obliczane tylko po ręcznym włączeniu mapy Liq."
  ],
  [
    "Задає товщину ліній автоматично знайдених рівнів у пікселях. За замовчуванням 0,3 px.",
    "Sets the width of automatically detected level lines in pixels. Default: 0.3 px.",
    "Задаёт толщину линий автоматически найденных уровней в пикселях. По умолчанию 0,3 px.",
    "Ustawia grubość automatycznie wykrytych linii poziomów w pikselach. Domyślnie 0,3 px."
  ],
  [
    "Змінює розмір текстових підписів автоматичних рівнів (ціна й таймфрейм), не змінюючи товщину ліній.",
    "Changes automatic-level label size (price and timeframe) without changing line thickness.",
    "Изменяет размер подписей автоматических уровней (цена и таймфрейм), не меняя толщину линий.",
    "Zmienia rozmiar etykiet automatycznych poziomów (cena i interwał) bez zmiany grubości linii."
  ],
  [
    "Перемикає вигляд підписів рівнів: звичайний текст, заливка або обведена рамка.",
    "Switches level-label style between plain text, filled background and outline.",
    "Переключает оформление подписей уровней: обычный текст, заливка или рамка.",
    "Przełącza wygląd etykiet poziomów: zwykły tekst, wypełnienie lub obramowanie."
  ],
  [
    "Вибирає стиль ліній рівнів: суцільні, пунктирні або крапкові.",
    "Selects solid, dashed or dotted level lines.",
    "Выбирает стиль линий уровней: сплошные, пунктирные или точечные.",
    "Wybiera styl linii poziomów: ciągłe, kreskowane lub kropkowane."
  ],
  [
    "Передбачає показ найближчих рівнів підтримки й опору в списку монет.",
    "Shows nearby support and resistance levels in the coin list.",
    "Показывает ближайшие уровни поддержки и сопротивления в списке монет.",
    "Pokazuje najbliższe poziomy wsparcia i oporu na liście monet."
  ],
  [
    "Визначає локальне вікно свічок, яке аналізується для пошуку рівня.",
    "Sets the local candle window analyzed to detect a level.",
    "Задаёт локальное окно свечей, анализируемое при поиске уровня.",
    "Określa lokalne okno świec analizowane podczas wykrywania poziomu."
  ],
  [
    "Встановлює кількість історичних свічок для аналізу на кожному обраному таймфреймі.",
    "Sets how many historical candles are analyzed for each selected timeframe.",
    "Задаёт количество исторических свечей для анализа на каждом выбранном таймфрейме.",
    "Ustawia liczbę świec historycznych analizowanych dla każdego wybranego interwału."
  ],
  [
    "Визначає, скільки незалежних торкань або підходів потрібно для підтвердження рівня.",
    "Sets the number of independent touches or approaches needed to confirm a level.",
    "Задаёт число независимых касаний или подходов для подтверждения уровня.",
    "Określa liczbę niezależnych dotknięć lub podejść potrzebnych do potwierdzenia poziomu."
  ],
  [
    "Визначає допустиме відхилення цін у відсотках, за якого близькі рівні вважаються одним.",
    "Sets the allowed percentage price deviation for merging nearby levels.",
    "Определяет допустимое отклонение цены в процентах, при котором близкие уровни считаются одним.",
    "Ustawia dopuszczalne procentowe odchylenie cen, przy którym pobliskie poziomy traktowane są jako jeden."
  ],
  [
    "Встановлює відсотковий поріг виходу ціни за рівень для визначення його пробою.",
    "Sets the percentage threshold beyond a level used to confirm a breakout.",
    "Устанавливает процентный порог выхода цены за уровень для определения пробоя.",
    "Ustawia procentowy próg przekroczenia poziomu wymagany do stwierdzenia wybicia."
  ],
  [
    "Керує часом показу підписів: завжди, лише при наведенні або ніколи.",
    "Controls when labels appear: always, on hover only or never.",
    "Управляет показом подписей: всегда, только при наведении или никогда.",
    "Określa, kiedy wyświetlać etykiety: zawsze, po najechaniu lub nigdy."
  ],
  [
    "Відображає раніше підтверджені пробиті рівні у приглушеному сірому кольорі.",
    "Displays previously confirmed broken levels in muted gray.",
    "Отображает ранее подтверждённые пробитые уровни приглушённым серым цветом.",
    "Wyświetla wcześniej potwierdzone przebite poziomy w stonowanym szarym kolorze."
  ],
  [
    "Дозволяє тіні свічки ненадовго перейти рівень без негайного визнання пробою, поки немає підтвердження закриттям.",
    "Allows a candle wick to briefly cross a level without treating it as a breakout until a closing confirmation.",
    "Позволяет тени свечи кратковременно пересечь уровень без признания пробоя до подтверждения закрытием.",
    "Pozwala knotowi świecy na chwilę przekroczyć poziom bez uznania wybicia, dopóki nie potwierdzi go zamknięcie."
  ],
  [
    "Вибирає таймфрейми, за якими аналізуються напрямки тренду та похилі лінії. Доступно до трьох інтервалів.",
    "Chooses up to three timeframes for analyzing trend direction and sloping trend lines.",
    "Выбирает до трёх таймфреймов для анализа направления тренда и наклонных линий.",
    "Wybiera maksymalnie trzy interwały do analizy kierunku trendu i nachylonych linii."
  ],
  [
    "Встановлює кількість історичних свічок для побудови трендових ліній.",
    "Sets the number of historical candles used to draw trend lines.",
    "Устанавливает число исторических свечей для построения трендовых линий.",
    "Ustawia liczbę świec historycznych używanych do rysowania linii trendu."
  ],
  [
    "Вмикає аналіз великих ордерів у стакані та пошук цінових щільностей.",
    "Enables analysis of large order-book orders and detection of liquidity walls.",
    "Включает анализ крупных ордеров в стакане и поиск ценовых плотностей.",
    "Włącza analizę dużych zleceń w arkuszu i wykrywanie ścian płynności."
  ],
  [
    "Передбачає окрему таблицю найбільших лімітних заявок.",
    "Displays a separate table of the largest limit orders.",
    "Показывает отдельную таблицу крупнейших лимитных заявок.",
    "Wyświetla osobną tabelę największych zleceń z limitem."
  ],
  [
    "Передбачає показ обсягів ордерів у базовій монеті замість валюти котирування.",
    "Shows order size in the base coin instead of the quote currency.",
    "Показывает объёмы ордеров в базовой монете вместо валюты котировки.",
    "Pokazuje wielkość zleceń w monecie bazowej zamiast w walucie kwotowanej."
  ],
  [
    "Відображає співвідношення сум лімітних заявок BID і ASK поблизу поточної ціни.",
    "Shows the ratio of BID to ASK limit-order amounts near the current price.",
    "Показывает соотношение сумм лимитных заявок BID и ASK рядом с текущей ценой.",
    "Pokazuje stosunek sum zleceń limit BID i ASK w pobliżu bieżącej ceny."
  ],
  [
    "Керує видимістю ліній щільностей, їхніх міток і сум всередині міток незалежно одна від одної.",
    "Separately controls the visibility of liquidity-wall lines, labels and amounts within labels.",
    "Независимо управляет видимостью линий плотностей, меток и сумм внутри меток.",
    "Niezależnie steruje widocznością linii ścian zleceń, etykiet i kwot w etykietach."
  ],
  [
    "Задає мінімальний час існування лімітної заявки перед відображенням її як щільності.",
    "Sets the minimum age of a limit order before showing it as a liquidity wall.",
    "Задаёт минимальное время существования лимитной заявки до её показа как плотности.",
    "Ustawia minimalny czas istnienia zlecenia limit, zanim zostanie pokazane jako ściana zleceń."
  ],
  [
    "Обмежує максимальну відстань у відсотках від поточної ціни, на якій шукаються щільності.",
    "Limits the maximum percentage distance from current price for liquidity-wall detection.",
    "Ограничивает максимальное расстояние в процентах от текущей цены для поиска плотностей.",
    "Ogranicza maksymalną procentową odległość od bieżącej ceny przy wykrywaniu ścian zleceń."
  ],
  [
    "Визначає мінімальний розмір заявки: автоматично за ринковими даними або вручну в доларах.",
    "Sets the minimum order size automatically from market data or manually in USD.",
    "Задаёт минимальный размер заявки автоматически по рынку или вручную в долларах.",
    "Określa minimalną wielkość zlecenia automatycznie na podstawie rynku lub ręcznie w USD."
  ],
  [
    "«Усі сильні» показує великі щільності, а «Потенціал реакції» — лише щільності з додатковими ознаками взаємодії з ціною. Це не прогноз із гарантією.",
    "“All strong” shows large liquidity walls; “Reaction potential” shows only those with additional signs of price interaction. Neither guarantees a forecast.",
    "«Все сильные» показывает крупные плотности, а «Потенциал реакции» — только плотности с дополнительными признаками взаимодействия с ценой. Это не гарантированный прогноз.",
    "„Wszystkie silne” pokazuje duże ściany zleceń, a „Potencjał reakcji” tylko te z dodatkowymi oznakami interakcji z ceną. Nie jest to gwarantowana prognoza."
  ],
  [
    "Робить автоматичний поріг великих заявок суворішим або м’якшим. Більший множник зазвичай залишає менше заявок.",
    "Makes the automatic large-order threshold stricter or looser. A higher multiplier usually leaves fewer orders.",
    "Ужесточает или смягчает автоматический порог крупных заявок. Больший множитель обычно оставляет меньше заявок.",
    "Zaostrza lub łagodzi automatyczny próg dużych zleceń. Wyższy mnożnik zwykle pozostawia mniej zleceń."
  ],
  [
    "Обмежує список великих ордерів заявками поблизу визначених рівнів; самі щільності на графіку не приховує.",
    "Limits the large-order list to orders near detected levels, without hiding liquidity walls on the chart.",
    "Ограничивает список крупных ордеров заявками возле уровней, но не скрывает плотности на графике.",
    "Ogranicza listę dużych zleceń do tych w pobliżu wykrytych poziomów, nie ukrywając ścian na wykresie."
  ],
  [
    "Визначає колір ліній великих лімітних заявок на графіку.",
    "Sets the color of large limit-order lines on the chart.",
    "Задаёт цвет линий крупных лимитных заявок на графике.",
    "Ustawia kolor linii dużych zleceń z limitem na wykresie."
  ],
  [
    "Визначає колір текстових міток великих лімітних заявок.",
    "Sets the color of large limit-order text labels.",
    "Задаёт цвет текстовых меток крупных лимитных заявок.",
    "Ustawia kolor etykiet tekstowych dużych zleceń z limitem."
  ],
  [
    "Змінює товщину ліній позначення щільностей у пікселях.",
    "Changes liquidity-wall line width in pixels.",
    "Изменяет толщину линий плотностей в пикселях.",
    "Zmienia grubość linii ścian zleceń w pikselach."
  ],
  [
    "Визначає стиль ліній щільностей: суцільні, пунктирні або крапкові.",
    "Selects solid, dashed or dotted liquidity-wall lines.",
    "Задаёт стиль линий плотностей: сплошные, пунктирные или точечные.",
    "Określa styl linii ścian zleceń: ciągłe, kreskowane lub kropkowane."
  ],
  [
    "Змінює розмір тексту міток щільностей на графіку.",
    "Changes the size of liquidity-wall labels on the chart.",
    "Изменяет размер текста меток плотностей на графике.",
    "Zmienia rozmiar tekstu etykiet ścian zleceń na wykresie."
  ],
  [
    "Вмикає показ відкритого інтересу — обсягу незакритих деривативних позицій — у відповідній колонці.",
    "Shows open interest (the volume of outstanding derivative positions) in the corresponding column.",
    "Включает показ открытого интереса — объёма незакрытых деривативных позиций — в соответствующей колонке.",
    "Pokazuje open interest, czyli wolumen otwartych pozycji pochodnych, w odpowiedniej kolumnie."
  ],
  [
    "Вибирає відображення відкритого інтересу як абсолютного значення або зміни.",
    "Displays open interest as an absolute value or a change.",
    "Выбирает отображение открытого интереса как абсолютного значения или изменения.",
    "Wybiera wyświetlanie open interest jako wartości bezwzględnej lub zmiany."
  ],
  [
    "Передбачає розрахунок зміни відкритого інтересу в одиницях базової монети.",
    "Calculates open-interest change in units of the base coin.",
    "Рассчитывает изменение открытого интереса в единицах базовой монеты.",
    "Oblicza zmianę open interest w jednostkach monety bazowej."
  ],
  [
    "Визначає історичний інтервал (1, 12 або 24 години) для порівняння відкритого інтересу.",
    "Sets the historical interval (1, 12 or 24 hours) for open-interest comparison.",
    "Задаёт исторический интервал (1, 12 или 24 часа) для сравнения открытого интереса.",
    "Określa przedział historyczny (1, 12 lub 24 godziny) do porównania open interest."
  ],
  [
    "Показує або приховує ставку фінансування для безстрокових ф’ючерсів, якщо біржа надає ці дані.",
    "Shows or hides the funding rate for perpetual futures when the exchange provides it.",
    "Показывает или скрывает ставку финансирования бессрочных фьючерсов, если биржа предоставляет данные.",
    "Pokazuje lub ukrywa stopę finansowania kontraktów perpetual, gdy giełda udostępnia dane."
  ],
  [
    "Показує зміну ціни монети за останні 24 години у відсотках.",
    "Shows the coin's 24-hour price change as a percentage.",
    "Показывает процентное изменение цены монеты за последние 24 часа.",
    "Pokazuje procentową zmianę ceny monety w ostatnich 24 godzinach."
  ],
  [
    "Показує добовий торговий обсяг у валюті котирування, наприклад USDT.",
    "Shows 24-hour trading volume in the quote currency, such as USDT.",
    "Показывает суточный торговый объём в валюте котировки, например USDT.",
    "Pokazuje 24-godzinny wolumen obrotu w walucie kwotowanej, np. USDT."
  ],
  [
    "Визначає таймфрейм розрахунку NATR — показника відносної волатильності ціни.",
    "Selects the timeframe for NATR, an indicator of relative price volatility.",
    "Выбирает таймфрейм для NATR — показателя относительной волатильности цены.",
    "Wybiera interwał do obliczeń NATR, wskaźnika względnej zmienności ceny."
  ],
  [
    "Задає кількість свічок для розрахунку NATR. Менший період швидше реагує на зміну волатильності.",
    "Sets the candle period for NATR. A shorter period responds faster to volatility changes.",
    "Задаёт число свечей для расчёта NATR. Меньший период быстрее реагирует на изменение волатильности.",
    "Ustawia liczbę świec do obliczeń NATR. Krótszy okres szybciej reaguje na zmiany zmienności."
  ],
  [
    "Вибирає таймфрейм, на якому порівнюється поточний обсяг зі звичайним обсягом торгів.",
    "Selects the timeframe for comparing current volume against typical trading volume.",
    "Выбирает таймфрейм сравнения текущего объёма с обычным торговым объёмом.",
    "Wybiera interwał porównania bieżącego wolumenu z typowym wolumenem obrotu."
  ],
  [
    "Визначає довжину історії свічок, яка використовується для оцінки типового обсягу.",
    "Sets the number of historical candles used to estimate typical volume.",
    "Задаёт длину истории свечей для оценки обычного объёма.",
    "Określa długość historii świec używanej do oszacowania typowego wolumenu."
  ],
  [
    "Задає таймфрейм показника зміни ціни PΔ.",
    "Sets the timeframe for price-change indicator PΔ.",
    "Задаёт таймфрейм показателя изменения цены PΔ.",
    "Ustawia interwał wskaźnika zmiany ceny PΔ."
  ],
  [
    "Задає таймфрейм середньої ціни Pavg.",
    "Sets the timeframe for average-price indicator Pavg.",
    "Задаёт таймфрейм показателя средней цены Pavg.",
    "Ustawia interwał wskaźnika ceny średniej Pavg."
  ],
  [
    "Визначає кількість свічок, за якими обчислюється Pavg.",
    "Sets how many candles are used to calculate Pavg.",
    "Задаёт количество свечей для расчёта Pavg.",
    "Określa liczbę świec używanych do obliczania Pavg."
  ],
  [
    "Передбачає вибір таймфрейму для розрахунку кореляції динаміки монети з BTC.",
    "Selects the timeframe for calculating a coin's price-movement correlation with BTC.",
    "Выбирает таймфрейм расчёта корреляции движения цены монеты с BTC.",
    "Wybiera interwał do obliczenia korelacji ruchów ceny monety z BTC."
  ],
  [
    "Передбачає вибір кількості свічок для статистичного порівняння змін ціни монети та BTC.",
    "Selects the candle count for statistical comparison of the coin's price changes with BTC.",
    "Выбирает число свечей для статистического сравнения изменения цены монеты и BTC.",
    "Wybiera liczbę świec do statystycznego porównania zmian ceny monety z BTC."
  ],
  [
    "Задає інтервал часу, за який підраховуються угоди Binance.",
    "Sets the time window used to count Binance trades.",
    "Задаёт временной интервал подсчёта сделок Binance.",
    "Ustawia przedział czasu do zliczania transakcji Binance."
  ],
  [
    "Вмикає показ загальної кількості угод за вибране часове вікно.",
    "Shows the total number of trades in the selected time window.",
    "Включает показ общего числа сделок за выбранный интервал.",
    "Pokazuje łączną liczbę transakcji w wybranym przedziale czasu."
  ],
  [
    "Показує відхилення кількості угод від її середнього значення.",
    "Shows the trade-count deviation from its average.",
    "Показывает отклонение количества сделок от среднего значения.",
    "Pokazuje odchylenie liczby transakcji od średniej."
  ],
  [
    "Визначає кількість свічок історії для обчислення середньої частоти угод.",
    "Sets the historical candle count used to calculate average trade frequency.",
    "Задаёт количество исторических свечей для расчёта средней частоты сделок.",
    "Określa liczbę świec historycznych do obliczania średniej częstotliwości transakcji."
  ],
  [
    "Налаштування hookchart",
    "HookChart settings",
    "Настройки HookChart",
    "Ustawienia HookChart"
  ],
  [
    "Підтримка та опір",
    "Support and resistance",
    "Поддержка и сопротивление",
    "Wsparcie i opór"
  ],
  [
    "Показувати підтримку та опір",
    "Show support and resistance",
    "Показывать поддержку и сопротивление",
    "Pokaż wsparcie i opór"
  ],
  [
    "S — підтримка нижче ціни, R — опір вище ціни. Рівні з підтвердженим пробоєм приховуються.",
    "S is support below price; R is resistance above price. Levels with confirmed breakouts are hidden.",
    "S — поддержка ниже цены, R — сопротивление выше цены. Уровни с подтверждённым пробоем скрываются.",
    "S oznacza wsparcie poniżej ceny, a R opór powyżej ceny. Poziomy z potwierdzonym wybiciem są ukrywane."
  ],
  [
    "Показувати мітки S/R",
    "Show S/R labels",
    "Показывать метки S/R",
    "Pokaż etykiety S/R"
  ],
  [
    "Вмикає або вимикає підписи підтримки й опору; лінії керуються перемикачем вище.",
    "Turns support and resistance labels on or off; the switch above controls the lines.",
    "Включает или отключает подписи поддержки и сопротивления; линии управляются переключателем выше.",
    "Włącza lub wyłącza etykiety wsparcia i oporu; liniami steruje przełącznik powyżej."
  ],
  [
    "Автоматичні рівні",
    "Automatic levels",
    "Автоматические уровни",
    "Poziomy automatyczne"
  ],
  [
    "Таймфрейми автовизначення рівнів",
    "Automatic level detection timeframes",
    "Таймфреймы автоматического определения уровней",
    "Interwały automatycznego wykrywania poziomów"
  ],
  [
    "Можна вибрати всі п’ять таймфреймів. За замовчуванням: 1г, 4г і 1d; 5 хв та 15 хв вимкнено. Зніміть усі, щоб вимкнути автовизначення.",
    "You can select all five timeframes. Defaults: 1h, 4h and 1d; 5m and 15m are off. Deselect all to disable automatic detection.",
    "Можно выбрать все пять таймфреймов. По умолчанию: 1ч, 4ч и 1d; 5м и 15м выключены. Снимите все отметки, чтобы отключить автоопределение.",
    "Możesz wybrać wszystkie pięć interwałów. Domyślnie: 1h, 4h i 1d; 5m i 15m są wyłączone. Odznacz wszystkie, aby wyłączyć automatyczne wykrywanie."
  ],
  [
    "Колір міток рівнів",
    "Level label color",
    "Цвет меток уровней",
    "Kolor etykiet poziomów"
  ],
  [
    "Колір активних рівнів та їхніх підписів. Пробиті рівні залишаються сірими.",
    "Color of active levels and their labels. Broken levels remain gray.",
    "Цвет активных уровней и их подписей. Пробитые уровни остаются серыми.",
    "Kolor aktywnych poziomów i ich etykiet. Przebite poziomy pozostają szare."
  ],
  [
    "Розмір міток рівнів",
    "Level label size",
    "Размер меток уровней",
    "Rozmiar etykiet poziomów"
  ],
  [
    "Тип міток рівнів",
    "Level label style",
    "Тип меток уровней",
    "Styl etykiet poziomów"
  ],
  [
    "Із заливкою",
    "Filled",
    "С заливкой",
    "Z wypełnieniem"
  ],
  [
    "Із рамкою",
    "Outlined",
    "С рамкой",
    "Z obramowaniem"
  ],
  [
    "Тип ліній рівнів",
    "Level line style",
    "Тип линий уровней",
    "Styl linii poziomów"
  ],
  [
    "Індекс настрою ринку: від страху до жадібності",
    "Market sentiment index: from fear to greed",
    "Индекс настроения рынка: от страха до жадности",
    "Indeks nastrojów rynkowych: od strachu do chciwości"
  ],
  [
    "Шукаємо рівні DOM від вказаної суми (ціна × кількість на одному рівні). Якщо таких немає, чекаємо наступних оновлень стакана.",
    "Searching for DOM levels above the specified value (price × quantity at one level). If none are found, wait for the next order-book updates.",
    "Ищем уровни DOM от заданной суммы (цена × количество на одном уровне). Если таких нет, ждём следующих обновлений стакана.",
    "Szukamy poziomów DOM od podanej kwoty (cena × ilość na jednym poziomie). Jeśli ich brak, czekamy na kolejne aktualizacje arkusza."
  ],
  [
    "Не вдалося виконати запит. Спробуйте пізніше.",
    "The request failed. Try again later.",
    "Не удалось выполнить запрос. Попробуйте позже.",
    "Nie udało się wykonać żądania. Spróbuj ponownie później."
  ],
  [
    "Неповні дані сесії.",
    "Incomplete session data.",
    "Неполные данные сеанса.",
    "Niepełne dane sesji."
  ],
  [
    "Електронну пошту підтверджено. Ви увійшли до h00k.",
    "Email verified. You are now signed in to h00k.",
    "Электронная почта подтверждена. Вы вошли в h00k.",
    "Adres e-mail potwierdzony. Zalogowano do h00k."
  ],
  [
    "Не вдалося перевірити авторизацію.",
    "Could not verify authentication.",
    "Не удалось проверить авторизацию.",
    "Nie udało się zweryfikować uwierzytelnienia."
  ],
  [
    "Помилка авторизації.",
    "Authentication error.",
    "Ошибка авторизации.",
    "Błąd uwierzytelnienia."
  ],
  [
    "Якщо адреса зареєстрована, перевірте пошту.",
    "If this address is registered, check your email.",
    "Если адрес зарегистрирован, проверьте почту.",
    "Jeśli ten adres jest zarejestrowany, sprawdź pocztę."
  ],
  [
    "Якщо такий акаунт існує, лист із посиланням на відновлення надійде найближчим часом.",
    "If the account exists, a recovery email will arrive shortly.",
    "Если такой аккаунт существует, письмо со ссылкой для восстановления скоро придёт.",
    "Jeśli takie konto istnieje, wiadomość z linkiem do odzyskania dostępu wkrótce dotrze."
  ],
  [
    "Посилання відновлення недійсне.",
    "The recovery link is invalid.",
    "Ссылка для восстановления недействительна.",
    "Link do odzyskania dostępu jest nieprawidłowy."
  ],
  [
    "Пароль змінено. Тепер увійдіть до акаунта.",
    "Password changed. You can now sign in.",
    "Пароль изменён. Теперь войдите в аккаунт.",
    "Hasło zmienione. Możesz teraz się zalogować."
  ],
  [
    "Увійдіть у свій акаунт.",
    "Sign in to your account.",
    "Войдите в свой аккаунт.",
    "Zaloguj się na swoje konto."
  ],
  [
    "Обліковий запис змінився.",
    "The account has changed.",
    "Учётная запись изменилась.",
    "Konto zostało zmienione."
  ],
  [
    "Не вдалося зберегти профіль.",
    "Could not save your profile.",
    "Не удалось сохранить профиль.",
    "Nie udało się zapisać profilu."
  ],
  [
    "Не вдалося завантажити сесії.",
    "Could not load sessions.",
    "Не удалось загрузить сеансы.",
    "Nie udało się pobrać sesji."
  ],
  [
    "Браузер не дозволяє зберегти налаштування. Перевірте доступ до локального сховища.",
    "The browser cannot save settings. Check access to local storage.",
    "Браузер не позволяет сохранить настройки. Проверьте доступ к локальному хранилищу.",
    "Przeglądarka nie może zapisać ustawień. Sprawdź dostęp do pamięci lokalnej."
  ],
  [
    "Браузер не дозволяє зберегти вибір звуку на цьому пристрої.",
    "The browser cannot save your sound selection on this device.",
    "Браузер не позволяет сохранить выбранный звук на этом устройстве.",
    "Przeglądarka nie może zapisać wybranego dźwięku na tym urządzeniu."
  ],
  [
    "З’єднання з потоком ліквідацій перерване; триває повторне підключення.",
    "The liquidation feed connection was interrupted; reconnecting.",
    "Соединение с потоком ликвидаций прервано; идёт переподключение.",
    "Połączenie ze strumieniem likwidacji zostało przerwane; trwa ponowne łączenie."
  ],
  [
    "З’єднання втрачено",
    "Connection lost",
    "Соединение потеряно",
    "Utracono połączenie"
  ],
  [
    "Пристрій перейшов в офлайн. Ринкові дані можуть бути застарілими.",
    "Your device is offline. Market data may be outdated.",
    "Устройство перешло в офлайн. Рыночные данные могут быть устаревшими.",
    "Urządzenie jest offline. Dane rynkowe mogą być nieaktualne."
  ],
  [
    "Вкажіть торгову пару у форматі BTCUSDT (2–24 літери/цифри).",
    "Enter a trading pair like BTCUSDT (2–24 letters or digits).",
    "Укажите торговую пару в формате BTCUSDT (2–24 буквы или цифры).",
    "Wpisz parę handlową, np. BTCUSDT (2–24 litery lub cyfry)."
  ],
  [
    "Не вдалося завантажити свічки біржі",
    "Could not load exchange candles",
    "Не удалось загрузить свечи с биржи",
    "Nie udało się pobrać świec z giełdy"
  ],
  [
    "Відсутні свічкові дані",
    "No candle data available",
    "Нет данных о свечах",
    "Brak danych świecowych"
  ],
  [
    "Недостатньо закритих свічок для прикладу",
    "Not enough closed candles for the example",
    "Недостаточно закрытых свечей для примера",
    "Za mało zamkniętych świec do przykładu"
  ],
  [
    "Помилка графіка",
    "Chart error",
    "Ошибка графика",
    "Błąd wykresu"
  ],
  [
    "Досягнуто обмеження сховища: 512 індивідуальних шаблонів. Видаліть зайві шаблони.",
    "Storage limit reached: 512 individual templates. Delete unused templates.",
    "Достигнут лимит хранения: 512 индивидуальных шаблонов. Удалите лишние шаблоны.",
    "Osiągnięto limit 512 indywidualnych szablonów. Usuń niepotrzebne szablony."
  ],
  [
    "Спочатку натисніть OK біля назви монети, щоб застосувати нову пару.",
    "First click OK next to the coin name to apply the new pair.",
    "Сначала нажмите OK рядом с названием монеты, чтобы применить новую пару.",
    "Najpierw kliknij OK obok nazwy monety, aby zastosować nową parę."
  ],
  [
    "Перевірте напрям угоди: Stop Loss має бути з боку збитку, Take Profit — з боку прибутку.",
    "Check the trade direction: Stop Loss must be on the loss side and Take Profit on the profit side.",
    "Проверьте направление сделки: Stop Loss должен находиться со стороны убытка, Take Profit — со стороны прибыли.",
    "Sprawdź kierunek transakcji: Stop Loss musi być po stronie straty, a Take Profit po stronie zysku."
  ],
  [
    "Не вдалося зберегти правила",
    "Could not save rules",
    "Не удалось сохранить правила",
    "Nie udało się zapisać reguł"
  ],
  [
    "Конструктор TP/SL",
    "TP/SL Builder",
    "Конструктор TP/SL",
    "Kreator TP/SL"
  ],
  [
    "Закрити без збереження",
    "Close without saving",
    "Закрыть без сохранения",
    "Zamknij bez zapisywania"
  ],
  [
    "Торгова пара",
    "Trading pair",
    "Торговая пара",
    "Para handlowa"
  ],
  [
    "Завантажити свічки і вибрати монету",
    "Load candles and select coin",
    "Загрузить свечи и выбрать монету",
    "Pobierz świece i wybierz monetę"
  ],
  [
    "Глобальний шаблон: застосовується до кожної монети з цією формацією.",
    "Global template: applies to every coin with this pattern.",
    "Глобальный шаблон: применяется к каждой монете с этой формацией.",
    "Szablon globalny: dotyczy każdej monety z tą formacją."
  ],
  [
    "Натисніть OK для вибору нової монети.",
    "Click OK to select the new coin.",
    "Нажмите OK, чтобы выбрать новую монету.",
    "Kliknij OK, aby wybrać nową monetę."
  ],
  [
    "Глобальні правила",
    "Global rules",
    "Глобальные правила",
    "Reguły globalne"
  ],
  [
    "Власний шаблон для цієї області дії",
    "Custom template for this scope",
    "Свой шаблон для этой области действия",
    "Własny szablon dla tego zakresu"
  ],
  [
    "Шаблон успадковано від глобальних правил",
    "Template inherited from global rules",
    "Шаблон унаследован от глобальных правил",
    "Szablon odziedziczony z reguł globalnych"
  ],
  [
    "Автоматичні правила — власного шаблону немає",
    "Automatic rules — no custom template",
    "Автоматические правила — собственного шаблона нет",
    "Reguły automatyczne — brak własnego szablonu"
  ],
  [
    "Зміщення Entry (ATR)",
    "Entry offset (ATR)",
    "Смещение Entry (ATR)",
    "Przesunięcie Entry (ATR)"
  ],
  [
    "Відступ SL (ATR)",
    "SL offset (ATR)",
    "Отступ SL (ATR)",
    "Odstęp SL (ATR)"
  ],
  [
    "Ціль R:R (якщо TP не пересували)",
    "Target R:R (if TP was not moved)",
    "Цель R:R (если TP не перемещали)",
    "Docelowe R:R (jeśli TP nie przesuwano)"
  ],
  [
    "Введіть скінченне числове значення.",
    "Enter a finite numeric value.",
    "Введите конечное числовое значение.",
    "Wpisz skończoną wartość liczbową."
  ],
  [
    "Дотики Low (за тінями)",
    "Low touches (by wicks)",
    "Касания Low (по теням)",
    "Dotknięcia Low (cieniami)"
  ],
  [
    "Дотики High (за тінями)",
    "High touches (by wicks)",
    "Касания High (по теням)",
    "Dotknięcia High (cieniami)"
  ],
  [
    "Допуск дотику (%)",
    "Touch tolerance (%)",
    "Допуск касания (%)",
    "Tolerancja dotknięcia (%)"
  ],
  [
    "Проміжок між дотиками (свічок)",
    "Gap between touches (candles)",
    "Интервал между касаниями (свечей)",
    "Odstęp między dotknięciami (świece)"
  ],
  [
    "Ціна має бути додатним числом.",
    "Price must be a positive number.",
    "Цена должна быть положительным числом.",
    "Cena musi być liczbą dodatnią."
  ],
  [
    "Персональні правила активні після збереження",
    "Personal rules activate after saving",
    "Персональные правила активируются после сохранения",
    "Reguły osobiste będą aktywne po zapisaniu"
  ],
  [
    "Вимкнено: старий алгоритм без змін",
    "Disabled: the original algorithm remains unchanged",
    "Отключено: исходный алгоритм без изменений",
    "Wyłączone: dotychczasowy algorytm bez zmian"
  ],
  [
    "Зберегти правила",
    "Save rules",
    "Сохранить правила",
    "Zapisz reguły"
  ],
  [
    "Правила формації для всіх монет або окремої монети · ВИМКНЕНО за замовчуванням",
    "Pattern rules for all coins or a specific coin · OFF by default",
    "Правила формации для всех монет или отдельной монеты · по умолчанию ВЫКЛ.",
    "Reguły formacji dla wszystkich monet lub jednej monety · domyślnie WYŁ."
  ],
  [
    "Увімкнути конструктор",
    "Enable builder",
    "Включить конструктор",
    "Włącz kreator"
  ],
  [
    "Тип формації",
    "Pattern type",
    "Тип формации",
    "Typ formacji"
  ],
  [
    "Область дії правил",
    "Rule scope",
    "Область действия правил",
    "Zakres reguł"
  ],
  [
    "Усі монети · ця формація",
    "All coins · this pattern",
    "Все монеты · эта формация",
    "Wszystkie monety · ta formacja"
  ],
  [
    "Монета (будь-яка пара)",
    "Coin (any pair)",
    "Монета (любая пара)",
    "Moneta (dowolna para)"
  ],
  [
    "Біржа графіка",
    "Chart exchange",
    "Биржа графика",
    "Giełda wykresu"
  ],
  [
    "Завантаження реальних свічок…",
    "Loading live exchange candles…",
    "Загрузка реальных биржевых свечей…",
    "Ładowanie rzeczywistych świec giełdowych…"
  ],
  [
    "Зараховано дотиків:",
    "Counted touches:",
    "Засчитано касаний:",
    "Zaliczone dotknięcia:"
  ],
  [
    "Авто",
    "Auto",
    "Авто",
    "Auto"
  ],
  [
    "Змінювати Entry/TP/SL (окремо від фільтра дотиків)",
    "Adjust Entry/TP/SL (independent of touch filter)",
    "Изменять Entry/TP/SL (отдельно от фильтра касаний)",
    "Zmieniaj Entry/TP/SL (niezależnie od filtra dotknięć)"
  ],
  [
    "Повернути розрахунок TP через R:R",
    "Restore TP calculation via R:R",
    "Вернуть расчёт TP через R:R",
    "Przywróć obliczanie TP przez R:R"
  ],
  [
    "Вимагати відскок закритої свічки",
    "Require a rejection by a closed candle",
    "Требовать отскок закрытой свечи",
    "Wymagaj odbicia zamkniętej świecy"
  ],
  [
    "Налаштування пари однакові для Binance/Bybit та spot/futures.",
    "Pair settings are shared across Binance/Bybit and spot/futures.",
    "Настройки пары одинаковы для Binance/Bybit и spot/futures.",
    "Ustawienia pary są wspólne dla Binance/Bybit oraz spot/futures."
  ],
  [
    "Подвійне дно (W)",
    "Double bottom (W)",
    "Двойное дно (W)",
    "Podwójne dno (W)"
  ],
  [
    "Подвійна вершина (M)",
    "Double top (M)",
    "Двойная вершина (M)",
    "Podwójny szczyt (M)"
  ],
  [
    "Висхідний трикутник",
    "Ascending triangle",
    "Восходящий треугольник",
    "Trójkąt zwyżkujący"
  ],
  [
    "Низхідний трикутник",
    "Descending triangle",
    "Нисходящий треугольник",
    "Trójkąt zniżkujący"
  ],
  [
    "Бичачий прапор",
    "Bull flag",
    "Бычий флаг",
    "Bycza flaga"
  ],
  [
    "Ведмежий прапор",
    "Bear flag",
    "Медвежий флаг",
    "Niedźwiedzia flaga"
  ],
  [
    "Пробій ключового рівня",
    "Key level breakout",
    "Пробой ключевого уровня",
    "Wybicie kluczowego poziomu"
  ],
  [
    "Стиснення волатильності",
    "Volatility squeeze",
    "Сжатие волатильности",
    "Kompresja zmienności"
  ],
  [
    "Молот",
    "Hammer",
    "Молот",
    "Młot"
  ],
  [
    "Падаюча зірка",
    "Shooting star",
    "Падающая звезда",
    "Spadająca gwiazda"
  ],
  [
    "Бичаче поглинання",
    "Bullish engulfing",
    "Бычье поглощение",
    "Objęcie hossy"
  ],
  [
    "Ведмеже поглинання",
    "Bearish engulfing",
    "Медвежье поглощение",
    "Objęcie bessy"
  ],
  [
    "Скопійовано!",
    "Copied!",
    "Скопировано!",
    "Skopiowano!"
  ]
] as const;
const stringRows = [
  [
    "ui.copy.symbol",
    "Скопіювати {{symbol}}",
    "Copy {{symbol}}",
    "Скопировать {{symbol}}",
    "Skopiuj {{symbol}}"
  ],
  [
    "ui.copy.symbolTitle",
    "Копіювати {{symbol}}",
    "Copy {{symbol}}",
    "Копировать {{symbol}}",
    "Kopiuj {{symbol}}"
  ],
  [
    "ui.copy.copied",
    "Скопійовано: {{symbol}}",
    "Copied: {{symbol}}",
    "Скопировано: {{symbol}}",
    "Skopiowano: {{symbol}}"
  ],
  [
    "ui.copy.copiedAria",
    "Скопійовано {{symbol}}",
    "Copied {{symbol}}",
    "Скопировано {{symbol}}",
    "Skopiowano {{symbol}}"
  ],
  [
    "ui.copy.failed",
    "Не вдалося скопіювати",
    "Could not copy",
    "Не удалось скопировать",
    "Nie udało się skopiować"
  ],
  [
    "ui.copy.failedSymbol",
    "Не вдалося скопіювати {{symbol}}",
    "Could not copy {{symbol}}",
    "Не удалось скопировать {{symbol}}",
    "Nie udało się skopiować {{symbol}}"
  ],
  [
    "ui.copy.only",
    "Скопіювати лише {{symbol}}",
    "Copy only {{symbol}}",
    "Скопировать только {{symbol}}",
    "Skopiuj tylko {{symbol}}"
  ],
  [
    "ui.notifications.unread",
    "Сповіщення на сайті, непрочитаних: {{count}}",
    "Site notifications, unread: {{count}}",
    "Уведомления на сайте, непрочитанных: {{count}}",
    "Powiadomienia w serwisie, nieprzeczytane: {{count}}"
  ],
  [
    "ui.chart.openFull",
    "Відкрити повний графік {{symbol}}",
    "Open fullscreen chart for {{symbol}}",
    "Открыть полный график {{symbol}}",
    "Otwórz pełnoekranowy wykres {{symbol}}"
  ],
  [
    "ui.chart.open",
    "Відкрити графік {{symbol}}",
    "Open chart for {{symbol}}",
    "Открыть график {{symbol}}",
    "Otwórz wykres {{symbol}}"
  ],
  [
    "ui.coins.showMore",
    "Показати ще 50 монет (залишилось {{remaining}})",
    "Show 50 more coins ({{remaining}} remaining)",
    "Показать ещё 50 монет (осталось {{remaining}})",
    "Pokaż 50 kolejnych monet (pozostało {{remaining}})"
  ],
  [
    "header.terminalNone",
    "вимкнена",
    "Disabled",
    "отключена",
    "Wyłączone"
  ],
  [
    "header.linking.enabled",
    "увімкнена",
    "enabled",
    "включена",
    "włączone"
  ],
  [
    "header.linking.disabled",
    "вимкнена",
    "disabled",
    "выключена",
    "wyłączone"
  ],
  [
    "header.linking.guest",
    "Лінковка — доступна після реєстрації",
    "Terminal linking — registration required",
    "Связь с терминалом — после регистрации",
    "Łączenie z terminalem — wymagana rejestracja"
  ],
  [
    "header.linking.title",
    "Лінковка: {{terminal}} — {{status}}. Відкрити налаштування профілю",
    "Terminal linking: {{terminal}} — {{status}}. Open profile settings",
    "Связь с терминалом: {{terminal}} — {{status}}. Открыть настройки профиля",
    "Łączenie z terminalem: {{terminal}} — {{status}}. Otwórz ustawienia profilu"
  ],
  [
    "header.linking.aria",
    "Налаштування лінковки: {{terminal}}, {{status}}",
    "Terminal linking settings: {{terminal}}, {{status}}",
    "Настройки связи с терминалом: {{terminal}}, {{status}}",
    "Ustawienia łączenia: {{terminal}}, {{status}}"
  ],
  [
    "ui.notifications.range",
    "Діапазон {{percent}}%",
    "Range {{percent}}%",
    "Диапазон {{percent}}%",
    "Zakres {{percent}}%"
  ],
  [
    "ui.interface.disallowedValue",
    "Недозволене значення: {{property}}",
    "Disallowed value: {{property}}",
    "Недопустимое значение: {{property}}",
    "Niedozwolona wartość: {{property}}"
  ],
  [
    "ui.notifications.title.priceReached",
    "Ціновий рівень досягнуто · ",
    "Price level reached · ",
    "Ценовой уровень достигнут · ",
    "Osiągnięto poziom ceny · "
  ],
  [
    "ui.notifications.title.priceLevel",
    "Ціновий рівень · ",
    "Price level · ",
    "Ценовой уровень · ",
    "Poziom ceny · "
  ],
  [
    "ui.notifications.title.volatility",
    "≈ Сплеск волатильності · ",
    "≈ Volatility spike · ",
    "≈ Всплеск волатильности · ",
    "≈ Skok zmienności · "
  ],
  [
    "ui.notifications.title.impulseUp",
    "▲ Імпульс зростання · ",
    "▲ Upward impulse · ",
    "▲ Импульс роста · ",
    "▲ Impuls wzrostowy · "
  ],
  [
    "ui.notifications.title.impulseDown",
    "▼ Імпульс падіння · ",
    "▼ Downward impulse · ",
    "▼ Импульс падения · ",
    "▼ Impuls spadkowy · "
  ],
  [
    "ui.notifications.title.cascade",
    "Каскад ліквідацій ",
    "Liquidation cascade ",
    "Каскад ликвидаций ",
    "Kaskada likwidacji "
  ],
  [
    "ui.notifications.title.liqUnavailable",
    "Потік ліквідацій недоступний · ",
    "Liquidation feed unavailable · ",
    "Поток ликвидаций недоступен · ",
    "Strumień likwidacji niedostępny · "
  ],
  [
    "ui.notifications.levelReached",
    "Рівень {{level}} досягнуто",
    "Level {{level}} reached",
    "Уровень {{level}} достигнут",
    "Osiągnięto poziom {{level}}"
  ],
  [
    "ui.notifications.priceHistory",
    "Ціна {{price}} · ціль {{target}}",
    "Price {{price}} · target {{target}}",
    "Цена {{price}} · цель {{target}}",
    "Cena {{price}} · cel {{target}}"
  ],
  [
    "ui.notifications.fluctuationRange",
    "Діапазон коливань {{value}}",
    "Fluctuation range {{value}}",
    "Диапазон колебаний {{value}}",
    "Zakres wahań {{value}}"
  ],
  [
    "ui.notifications.elapsedWindow",
    "{{subject}} за {{elapsed}} (вікно {{minutes}} хв){{suffix}}",
    "{{subject}} over {{elapsed}} ({{minutes}} min window){{suffix}}",
    "{{subject}} за {{elapsed}} (окно {{minutes}} мин){{suffix}}",
    "{{subject}} w ciągu {{elapsed}} (okno {{minutes}} min){{suffix}}"
  ],
  [
    "ui.notifications.cascadeDescription",
    "{{count}} ліквідацій за 5 хв · {{usd}}",
    "{{count}} liquidations in 5 min · {{usd}}",
    "{{count}} ликвидаций за 5 мин · {{usd}}",
    "{{count}} likwidacji w 5 min · {{usd}}"
  ],
  [
    "ui.tpsl.scopeCoin",
    "Лише {{symbol}} · ця формація",
    "Only {{symbol}} · this pattern",
    "Только {{symbol}} · эта формация",
    "Tylko {{symbol}} · ta formacja"
  ],
  [
    "ui.tpsl.coinTemplate",
    "Індивідуальний шаблон: тільки {{symbol}} + обрана формація. За його відсутності — глобальний шаблон.",
    "Individual template: only {{symbol}} + the selected pattern. Otherwise the global template applies.",
    "Индивидуальный шаблон: только {{symbol}} + выбранная формация. Если его нет, применяется глобальный шаблон.",
    "Szablon indywidualny: tylko {{symbol}} i wybrana formacja. W przeciwnym razie obowiązuje szablon globalny."
  ],
  [
    "ui.tpsl.rulesForCoin",
    "Правила {{symbol}}",
    "Rules for {{symbol}}",
    "Правила для {{symbol}}",
    "Reguły dla {{symbol}}"
  ],
  [
    "ui.tpsl.templateCount",
    "· Індивідуальних шаблонів: {{count}}",
    "· Individual templates: {{count}}",
    "· Индивидуальных шаблонов: {{count}}",
    "· Szablony indywidualne: {{count}}"
  ],
  [
    "ui.tpsl.independentTarget",
    "Незалежний TP: {{offset}} ATR від стандартного TP.",
    "Independent TP: {{offset}} ATR from the default TP.",
    "Независимый TP: {{offset}} ATR от стандартного TP.",
    "Niezależny TP: {{offset}} ATR od domyślnego TP."
  ],
  [
    "ui.tpsl.levelPrice",
    "Ціна {{level}}",
    "{{level}} price",
    "Цена {{level}}",
    "Cena {{level}}"
  ],
  [
    "ui.tpsl.chartExplanation",
    "Графік показує реальні закриті свічки: тягніть Entry, SL, TP за лінію в будь-якому її місці. Значення ATR не обмежують пересування; TP після ручного зсуву незалежний від Entry та SL. Це приклад, а не сигнал: зберігаються відносні ATR-правила, а не одна фіксована ціна для всіх свічок.",
    "The chart shows real closed candles: drag the Entry, SL and TP lines from anywhere along them. ATR values do not limit movement; after manual adjustment, TP remains independent of Entry and SL. This is an example, not a signal: relative ATR rules are saved, not one fixed price for every candle.",
    "На графике показаны реальные закрытые свечи: перетаскивайте линии Entry, SL и TP за любую их точку. ATR не ограничивает перемещение; после ручного сдвига TP не зависит от Entry и SL. Это пример, а не сигнал: сохраняются относительные ATR-правила, а не одна фиксированная цена для всех свечей.",
    "Wykres pokazuje rzeczywiste zamknięte świece: przeciągaj linie Entry, SL i TP w dowolnym miejscu. ATR nie ogranicza przesuwania; po ręcznej zmianie TP pozostaje niezależny od Entry i SL. To przykład, a nie sygnał: zapisywane są względne reguły ATR, nie jedna stała cena dla wszystkich świec."
  ],
  [
    "ui.tpsl.geometryWarning",
    "Рівні можна пересувати без ATR-лімітів, але для сигналу SL має бути на боці збитку, а TP — прибутку. Виправте геометрію перед збереженням активного шаблону.",
    "Levels can be moved without ATR limits, but for a valid signal SL must be on the loss side and TP on the profit side. Correct the levels before saving an active template.",
    "Уровни можно перемещать без ограничений ATR, но для сигнала SL должен быть со стороны убытка, а TP — прибыли. Исправьте уровни перед сохранением активного шаблона.",
    "Poziomy można przesuwać bez limitów ATR, ale aby sygnał był poprawny, SL musi być po stronie straty, a TP po stronie zysku. Popraw poziomy przed zapisaniem aktywnego szablonu."
  ],
  [
    "ui.tpsl.privacyNote",
    "Дотики як умова Entry працюють для W/M. Глобальні правила можна перекрити окремим шаблоном для кожної пари й формації; «Авто» скидає лише вибраний рівень. Налаштування приватні й зберігаються у профілі користувача.",
    "Touch conditions for Entry apply to W/M patterns. Global rules can be overridden per pair and pattern; Auto resets only the selected level. Settings are private and saved in your profile.",
    "Условия касаний для Entry действуют для формаций W/M. Глобальные правила можно переопределить для каждой пары и формации; «Авто» сбрасывает только выбранный уровень. Настройки приватны и сохраняются в вашем профиле.",
    "Warunki dotknięć Entry dotyczą formacji W/M. Reguły globalne można nadpisać dla każdej pary i formacji; Auto resetuje tylko wybrany poziom. Ustawienia są prywatne i zapisane w profilu."
  ]
] as const;
const languages: SupportedLanguage[] = ['uk','en','ru','pl'];

export const extraPhrases = Object.fromEntries(
  languages.map((lang, i) => [lang, Object.fromEntries(phraseRows.map(row => [row[0], row[i]]))]),
) as Record<SupportedLanguage, Record<string, string>>;
export const extraStrings = Object.fromEntries(
  languages.map((lang, i) => [lang, Object.fromEntries(stringRows.map(row => [row[0], row[i + 1]]))]),
) as Record<SupportedLanguage, Record<string, string>>;
