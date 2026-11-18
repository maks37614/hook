/** Profile authentication, CAPTCHA and Telegram alert UI copy reviewed for all four site languages. */
import type { SupportedLanguage } from './types';
export const profileAuthTelegramRows: readonly (readonly [string, string, string, string])[] = [
  [
    "Не вдалося завантажити CAPTCHA. Перевірте з'єднання або блокувальник.",
    "Could not load CAPTCHA. Check your connection or ad blocker.",
    "Не удалось загрузить CAPTCHA. Проверьте соединение или блокировщик.",
    "Nie udało się wczytać CAPTCHA. Sprawdź połączenie lub blokadę treści."
  ],
  [
    "Перевірка CAPTCHA",
    "CAPTCHA verification",
    "Проверка CAPTCHA",
    "Weryfikacja CAPTCHA"
  ],
  [
    "Повторити",
    "Retry",
    "Повторить",
    "Ponów"
  ],
  [
    "Введіть адресу email.",
    "Enter your email address.",
    "Введите адрес электронной почты.",
    "Wpisz adres e-mail."
  ],
  [
    "Введіть пароль.",
    "Enter your password.",
    "Введите пароль.",
    "Wpisz hasło."
  ],
  [
    "Пароль має містити щонайменше 12 символів.",
    "Your password must contain at least 12 characters.",
    "Пароль должен содержать не менее 12 символов.",
    "Hasło musi mieć co najmniej 12 znaków."
  ],
  [
    "Паролі не збігаються. Введіть однаковий пароль у двох полях.",
    "Passwords do not match. Enter the same password in both fields.",
    "Пароли не совпадают. Введите одинаковый пароль в оба поля.",
    "Hasła nie są zgodne. Wpisz to samo hasło w obu polach."
  ],
  [
    "Спочатку пройдіть перевірку CAPTCHA.",
    "Complete the CAPTCHA verification first.",
    "Сначала пройдите проверку CAPTCHA.",
    "Najpierw ukończ weryfikację CAPTCHA."
  ],
  [
    "Акаунт може бути створений. Після відновлення пошти натисніть «Надіслати лист підтвердження ще раз».",
    "Your account may have been created. When email delivery is restored, select “Resend verification email”.",
    "Аккаунт мог быть создан. После восстановления почты нажмите «Повторно отправить письмо подтверждения».",
    "Konto mogło zostać utworzone. Gdy poczta znów zadziała, wybierz „Wyślij ponownie e-mail weryfikacyjny”."
  ],
  [
    "Ви впевнені, що хочете очистити історію сповіщень?",
    "Are you sure you want to clear notification history?",
    "Вы уверены, что хотите очистить историю уведомлений?",
    "Czy na pewno chcesz wyczyścić historię powiadomień?"
  ],
  [
    "Оновлено: {edited}. Пропущено: {skipped}. Помилок: {failed}.",
    "Updated: {edited}. Skipped: {skipped}. Errors: {failed}.",
    "Обновлено: {edited}. Пропущено: {skipped}. Ошибок: {failed}.",
    "Zaktualizowano: {edited}. Pominięto: {skipped}. Błędy: {failed}."
  ],
  [
    "Старих сповіщень без збереженого Telegram ID: {count}. Їх неможливо відредагувати автоматично.",
    "Older notifications without a saved Telegram ID: {count}. They cannot be edited automatically.",
    "Старых уведомлений без сохранённого Telegram ID: {count}. Их нельзя изменить автоматически.",
    "Starsze powiadomienia bez zapisanego identyfikatora Telegram: {count}. Nie można ich edytować automatycznie."
  ],
  [
    "Не вдалося оновити повідомлення",
    "Could not update messages",
    "Не удалось обновить сообщения",
    "Nie udało się zaktualizować wiadomości"
  ],
  [
    "Сповіщення успішно надіслано в Telegram та підтверджено системою CRON!",
    "Notification sent to Telegram and confirmed by the CRON system!",
    "Уведомление отправлено в Telegram и подтверждено системой CRON!",
    "Powiadomienie wysłano do Telegrama i potwierdzono w systemie CRON!"
  ],
  [
    "Помилка надсилання тестового сповіщення CRON",
    "Could not send the CRON test notification",
    "Ошибка отправки тестового уведомления CRON",
    "Błąd wysyłania testowego powiadomienia CRON"
  ],
  [
    "Не вдалося виконати запит до CRON",
    "Could not contact the CRON service",
    "Не удалось выполнить запрос к CRON",
    "Nie udało się wysłać żądania do CRON"
  ],
  [
    "Встановлювати сповіщення можуть тільки зареєстровані користувачі. Будь ласка, увійдіть або зареєструйтесь.",
    "Only registered users can create alerts. Please sign in or register.",
    "Создавать уведомления могут только зарегистрированные пользователи. Войдите или зарегистрируйтесь.",
    "Tylko zarejestrowani użytkownicy mogą tworzyć alerty. Zaloguj się lub zarejestruj."
  ],
  [
    "Вкажіть символ та цільову ціну",
    "Enter a symbol and target price",
    "Укажите символ и целевую цену",
    "Podaj symbol i cenę docelową"
  ],
  [
    "Невірна цільова ціна",
    "Invalid target price",
    "Неверная целевая цена",
    "Nieprawidłowa cena docelowa"
  ],
  [
    "Сповіщення для {symbol} створено у вашому профілі!",
    "An alert for {symbol} has been created in your profile!",
    "Уведомление для {symbol} создано в вашем профиле!",
    "Alert dla {symbol} został utworzony w Twoim profilu!"
  ],
  [
    "Помилка збереження сповіщення",
    "Could not save the alert",
    "Ошибка сохранения уведомления",
    "Błąd zapisywania alertu"
  ],
  [
    "Сповіщення",
    "Alerts",
    "Уведомления",
    "Alerty"
  ],
  [
    "Історія",
    "History",
    "История",
    "Historia"
  ],
  [
    "Активні сповіщення",
    "Active alerts",
    "Активные уведомления",
    "Aktywne alerty"
  ],
  [
    "Призупинені",
    "Paused",
    "Приостановленные",
    "Wstrzymane"
  ],
  [
    "Відпрацьовані сповіщення",
    "Triggered alerts",
    "Сработавшие уведомления",
    "Uruchomione alerty"
  ],
  [
    "Очистити спрацьовані",
    "Clear triggered alerts",
    "Очистить сработавшие уведомления",
    "Wyczyść uruchomione alerty"
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
    "Профіль:",
    "Profile:",
    "Профиль:",
    "Profil:"
  ],
  [
    "Увімкнути Push браузера",
    "Enable browser push",
    "Включить Push в браузере",
    "Włącz powiadomienia push przeglądarki"
  ],
  [
    "Push: Активно",
    "Push: Enabled",
    "Push: Активно",
    "Push: Aktywne"
  ],
  [
    "Примітка (необов'язково)",
    "Note (optional)",
    "Примечание (необязательно)",
    "Notatka (opcjonalnie)"
  ],
  [
    "Відпрацьовано",
    "Triggered",
    "Сработало",
    "Uruchomiono"
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
    "Telegram: не доставлено —",
    "Telegram: not delivered —",
    "Telegram: не доставлено —",
    "Telegram: niedostarczono —"
  ],
  [
    "Цінова умова спрацювала",
    "Price condition met",
    "Ценовое условие выполнено",
    "Warunek cenowy został spełniony"
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
    "Надіслано в Telegram",
    "Sent to Telegram",
    "Отправлено в Telegram",
    "Wysłano do Telegrama"
  ],
  [
    "Оновити список",
    "Refresh list",
    "Обновить список",
    "Odśwież listę"
  ],
  [
    "Очистити всі",
    "Clear all",
    "Очистить всё",
    "Wyczyść wszystko"
  ],
  [
    "Створити сповіщення ціни",
    "Create price alert",
    "Создать ценовое уведомление",
    "Utwórz alert cenowy"
  ],
  [
    "Цільова ціна ($)",
    "Target price ($)",
    "Целевая цена ($)",
    "Cena docelowa ($)"
  ],
  [
    "Наприклад: Пробій трикутника, тейк-профіт",
    "For example: triangle breakout, take profit",
    "Например: пробой треугольника, тейк-профит",
    "Na przykład: wybicie z trójkąta, realizacja zysku"
  ],
  [
    "Журнал спрацьованих сповіщень",
    "Triggered alert log",
    "Журнал сработавших уведомлений",
    "Dziennik uruchomionych alertów"
  ],
  [
    "Активних сповіщень:",
    "Active alerts:",
    "Активных уведомлений:",
    "Aktywne alerty:"
  ],
  [
    "Аптайм:",
    "Uptime:",
    "Время работы:",
    "Czas działania:"
  ],
  [
    "хв",
    "min",
    "мин",
    "min"
  ],
  [
    "Рівень",
    "Level",
    "Уровень",
    "Poziom"
  ],
  [
    "Тест BTCUSDT",
    "Test BTCUSDT",
    "Тест BTCUSDT",
    "Test BTCUSDT"
  ]
];
export const profileAuthTelegramPhrases: Record<SupportedLanguage, Record<string,string>> = {uk:{},en:{},ru:{},pl:{}};
for (const [uk,en,ru,pl] of profileAuthTelegramRows) {
  profileAuthTelegramPhrases.uk[uk] = uk;
  profileAuthTelegramPhrases.en[uk] = en;
  profileAuthTelegramPhrases.ru[uk] = ru;
  profileAuthTelegramPhrases.pl[uk] = pl;
}
