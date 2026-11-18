/** Fullscreen HookChart chrome: four languages, no changes to overlays, data or controls. */
import type { SupportedLanguage } from './types';
const rows = [
  [
    "Повноекранний графік HookChart",
    "Fullscreen HookChart",
    "Полноэкранный график HookChart",
    "Pełnoekranowy wykres HookChart"
  ],
  [
    "Оновлення в реальному часі ({{mode}})",
    "Live updates ({{mode}})",
    "Обновления в реальном времени ({{mode}})",
    "Aktualizacje na żywo ({{mode}})"
  ],
  [
    "Сховати шторку обраних монет",
    "Hide watchlist drawer",
    "Скрыть панель избранных монет",
    "Ukryj panel ulubionych monet"
  ],
  [
    "Відкрити шторку обраних монет",
    "Open watchlist drawer",
    "Открыть панель избранных монет",
    "Otwórz panel ulubionych monet"
  ],
  [
    "Надіслати в обраний термінал (Група {{group}})",
    "Send to selected terminal (Group {{group}})",
    "Отправить в выбранный терминал (Группа {{group}})",
    "Wyślij do wybranego terminala (Grupa {{group}})"
  ],
  [
    "Закрити повноцінний графік (Esc)",
    "Close full chart (Esc)",
    "Закрыть полный график (Esc)",
    "Zamknij pełny wykres (Esc)"
  ],
  [
    "Закрити повноцінний графік",
    "Close full chart",
    "Закрыть полный график",
    "Zamknij pełny wykres"
  ],
  [
    "Попередній сценарій, не підтверджений сигнал",
    "Preliminary scenario, unconfirmed signal",
    "Предварительный сценарий, неподтверждённый сигнал",
    "Wstępny scenariusz, niepotwierdzony sygnał"
  ],
  [
    "Дотики",
    "Touches",
    "Касания",
    "Dotknięcia"
  ],
  [
    "умову дотиків виконано",
    "touch requirement met",
    "условие касаний выполнено",
    "warunek dotknięć spełniony"
  ],
  [
    "очікуємо",
    "pending",
    "ожидаем",
    "oczekiwanie"
  ],
  [
    "(після закриття свічки)",
    "(after candle close)",
    "(после закрытия свечи)",
    "(po zamknięciu świecy)"
  ],
  [
    "Не вдалося отримати біржовий крок ціни; рівні лише орієнтовні",
    "Could not verify exchange tick size; levels are estimates only",
    "Не удалось проверить биржевой шаг цены; уровни ориентировочные",
    "Nie udało się zweryfikować kroku ceny; poziomy są tylko szacunkowe"
  ],
  [
    "Згорнути панель прогнозних міток",
    "Collapse projected-level controls",
    "Свернуть панель прогнозных уровней",
    "Zwiń panel prognozowanych poziomów"
  ],
  [
    "Розгорнути панель прогнозних міток",
    "Expand projected-level controls",
    "Развернуть панель прогнозных уровней",
    "Rozwiń panel prognozowanych poziomów"
  ],
  [
    "Згорнути мітки",
    "Collapse markers",
    "Свернуть метки",
    "Zwiń znaczniki"
  ],
  [
    "Розгорнути мітки",
    "Expand markers",
    "Развернуть метки",
    "Rozwiń znaczniki"
  ],
  [
    "Мітки",
    "Markers",
    "Метки",
    "Znaczniki"
  ],
  [
    "Натисніть на прогнозний рівень, щоб увімкнути або вимкнути його лінії на графіку",
    "Tap a projected level to show or hide its chart lines",
    "Нажмите прогнозный уровень, чтобы показать или скрыть его линии на графике",
    "Dotknij prognozowanego poziomu, aby pokazać lub ukryć jego linie na wykresie"
  ],
  [
    "Очікування дотиків {{count}}/{{required}}",
    "Waiting for touches {{count}}/{{required}}",
    "Ожидание касаний {{count}}/{{required}}",
    "Oczekiwanie na dotknięcia {{count}}/{{required}}"
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
    "Линия шеи",
    "Linia szyi"
  ],
  [
    "Приховати",
    "Hide",
    "Скрыть",
    "Ukryj"
  ],
  [
    "Показати",
    "Show",
    "Показать",
    "Pokaż"
  ],
  [
    "лінію на графіку",
    "chart line",
    "линию на графике",
    "linię na wykresie"
  ],
  [
    "Можлива формація: {{name}}. Прогноз приховано — відкрито іншу монету або ринок.",
    "Possible formation: {{name}}. Projection hidden because a different coin or market is open.",
    "Возможная формация: {{name}}. Прогноз скрыт — открыта другая монета или рынок.",
    "Możliwa formacja: {{name}}. Prognoza ukryta — otwarto inną monetę lub rynek."
  ],
  [
    "Сховати шторку",
    "Hide drawer",
    "Скрыть панель",
    "Ukryj panel"
  ],
  [
    "Пошук в обраному...",
    "Search watchlist...",
    "Поиск в избранном...",
    "Szukaj na liście..."
  ],
  [
    "Немає обраних монет",
    "No watchlist coins",
    "Нет избранных монет",
    "Brak ulubionych monet"
  ],
  [
    "Натисніть на зірочку біля монет у таблиці чи картці формацій, щоб вони з'явились тут.",
    "Tap the star next to a coin in the table or formation card to add it here.",
    "Нажмите звёздочку рядом с монетой в таблице или карточке формации, чтобы добавить её сюда.",
    "Dotknij gwiazdki przy monecie w tabeli lub karcie formacji, aby dodać ją tutaj."
  ],
  [
    "Обрані монети",
    "Watchlist coins",
    "Избранные монеты",
    "Obserwowane monety"
  ],
  [
    "Сповіщення",
    "Alerts",
    "Уведомления",
    "Alerty"
  ],
  [
    "Лінковка",
    "Terminal linking",
    "Связь с терминалом",
    "Połączenie z terminalem"
  ],
  [
    "Futures",
    "Futures",
    "Фьючерсы",
    "Kontrakty terminowe"
  ],
  [
    "Spot",
    "Spot",
    "Спот",
    "Spot"
  ],
  [
    "Немає актуальних даних за 24 години",
    "No current 24-hour market data",
    "Нет актуальных данных за 24 часа",
    "Brak aktualnych danych rynkowych za 24 godziny"
  ],
  [
    "Створити сповіщення в Telegram",
    "Create Telegram alert",
    "Создать уведомление в Telegram",
    "Utwórz powiadomienie w Telegramie"
  ],
  [
    "Можлива формація:",
    "Possible formation:",
    "Возможная формация:",
    "Możliwa formacja:"
  ],
  [
    "немає перевірених даних",
    "no verified data",
    "нет проверенных данных",
    "brak zweryfikowanych danych"
  ],
  [
    "Крок ціни не перевірено",
    "Price tick size not verified",
    "Шаг цены не проверен",
    "Nie zweryfikowano kroku ceny"
  ],
  [
    "Очікування дотиків",
    "Waiting for touches",
    "Ожидание касаний",
    "Oczekiwanie na dotknięcia"
  ],
  [
    "Видалити з обраного",
    "Remove from favorites",
    "Удалить из избранного",
    "Usuń z ulubionych"
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
] as const;
const languages: SupportedLanguage[] = ['uk','en','ru','pl'];
export const fullscreenChartPhrases = Object.fromEntries(languages.map((lang, i) => [
  lang, Object.fromEntries(rows.map(row => [row[0], row[i]])),
])) as Record<SupportedLanguage, Record<string,string>>;
export const fullscreenChartRows = rows;
