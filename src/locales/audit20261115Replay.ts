/** 2026-11-15 audit: Replay trading practice and browser notification UI. */
import type { SupportedLanguage } from './types';
const rows = [
  [
    "Сповіщення обробляються у вашому браузері з уже доступних даних сайту. Додатковий повний пошук монет не запускається. Спочатку увімкніть потрібні категорії.",
    "Alerts are processed in your browser using existing site data. No additional full coin scan runs. Enable the categories you need first.",
    "Уведомления обрабатываются в браузере по доступным данным сайта. Дополнительный полный поиск монет не запускается. Сначала включите нужные категории.",
    "Alerty są przetwarzane w przeglądarce na podstawie dostępnych danych strony. Nie uruchamia się dodatkowego skanowania monet. Najpierw włącz potrzebne kategorie."
  ],
  [
    "Лише мої обрані монети",
    "Only my watchlist coins",
    "Только мои избранные монеты",
    "Tylko monety z mojej listy"
  ],
  [
    "Назва монети",
    "Coin name",
    "Название монеты",
    "Nazwa monety"
  ],
  [
    "Зміна ціни (%)",
    "Price change (%)",
    "Изменение цены (%)",
    "Zmiana ceny (%)"
  ],
  [
    "Ринок (імпульси)",
    "Market (impulses)",
    "Рынок (импульсы)",
    "Rynek (impulsy)"
  ],
  [
    "Тривалість вікна",
    "Window duration",
    "Длительность окна",
    "Długość okna"
  ],
  [
    "Зберегти монету й увімкнути імпульси",
    "Save coin and enable impulses",
    "Сохранить монету и включить импульсы",
    "Zapisz monetę i włącz impulsy"
  ],
  [
    "Звук",
    "Sound",
    "Звук",
    "Dźwięk"
  ],
  [
    "Прослухати",
    "Preview sound",
    "Прослушать",
    "Odsłuchaj"
  ],
  [
    "Видалити вибрану",
    "Remove selected",
    "Удалить выбранную",
    "Usuń wybraną"
  ],
  [
    "На цьому пристрої раніше вибраної мелодії немає. Оберіть один із вбудованих сигналів.",
    "The previously selected sound is unavailable on this device. Choose a built-in signal.",
    "Ранее выбранная мелодия недоступна на этом устройстве. Выберите один из встроенных сигналов.",
    "Poprzednio wybrany dźwięk nie jest dostępny na tym urządzeniu. Wybierz jeden z wbudowanych sygnałów."
  ],
  [
    "Звук і браузерні повідомлення вимагають відкритого сайту. У фонових вкладках Android та iOS сповіщення можуть призупинятися.",
    "Sound and browser notifications require the site to be open. Alerts may pause in background tabs on Android and iOS.",
    "Для звука и уведомлений браузера сайт должен быть открыт. На Android и iOS оповещения в фоновых вкладках могут приостанавливаться.",
    "Dźwięk i powiadomienia przeglądarki wymagają otwartej strony. Alerty mogą zostać wstrzymane w kartach działających w tle na Androidzie i iOS."
  ],
  [
    "Вимкнути всі сповіщення сайту",
    "Disable all site alerts",
    "Выключить все уведомления сайта",
    "Wyłącz wszystkie alerty strony"
  ],
  [
    "Журнал угод порожній",
    "Trade journal is empty",
    "Журнал сделок пуст",
    "Dziennik transakcji jest pusty"
  ],
  [
    "Відкривайте позиції в симуляторі на сторінці Replay. Після закриття угоди за SL, TP або вручну, всі деталі та скриншот графіка збережуться тут!",
    "Open positions in the Replay simulator. Once a trade closes by SL, TP or manually, its details and chart screenshot are saved here!",
    "Открывайте позиции в симуляторе Replay. После закрытия сделки по SL, TP или вручную здесь сохранятся детали и скриншот графика!",
    "Otwieraj pozycje w symulatorze Replay. Po zamknięciu transakcji przez SL, TP lub ręcznie zapiszą się tutaj szczegóły i zrzut wykresu!"
  ],
  [
    "Всього угод",
    "Total trades",
    "Всего сделок",
    "Łącznie transakcji"
  ],
  [
    "Чистий прибуток (Net P&L)",
    "Net profit (Net P&L)",
    "Чистая прибыль (Net P&L)",
    "Zysk netto (Net P&L)"
  ],
  [
    "Співвідношення прибутку",
    "Profit ratio",
    "Соотношение прибыли",
    "Współczynnik zysku"
  ],
  [
    "Краща угода",
    "Best trade",
    "Лучшая сделка",
    "Najlepsza transakcja"
  ],
  [
    "Максимальний профіт",
    "Maximum profit",
    "Максимальная прибыль",
    "Maksymalny zysk"
  ],
  [
    "Гірша угода",
    "Worst trade",
    "Худшая сделка",
    "Najgorsza transakcja"
  ],
  [
    "Максимальний збиток",
    "Maximum loss",
    "Максимальный убыток",
    "Maksymalna strata"
  ],
  [
    "Немає активних відкладених лімітних або стоп-ордерів.",
    "No active pending limit or stop orders.",
    "Нет активных отложенных лимитных или стоп-ордеров.",
    "Brak aktywnych oczekujących zleceń limit lub stop."
  ],
  [
    "Скриншот стану графіка під час угоди",
    "Chart screenshot at the time of the trade",
    "Скриншот графика во время сделки",
    "Zrzut wykresu z czasu transakcji"
  ],
  [
    "Тег:",
    "Tag:",
    "Тег:",
    "Tag:"
  ],
  [
    "Баланс симулятора",
    "Simulator balance",
    "Баланс симулятора",
    "Saldo symulatora"
  ],
  [
    "Закрити / Cover",
    "Close / cover",
    "Закрыть / Cover",
    "Zamknij / Cover"
  ],
  [
    "Розмір:",
    "Size:",
    "Размер:",
    "Rozmiar:"
  ],
  [
    "Причина входу / Тег:",
    "Entry reason / tag:",
    "Причина входа / тег:",
    "Powód wejścia / tag:"
  ],
  [
    "Вкажіть параметри тейкера, біржовий спред та проковзування ордерів для реалістичного тестування торгової стратегії.",
    "Set taker fees, exchange spread and order slippage to test your strategy more realistically.",
    "Укажите комиссию тейкера, биржевой спред и проскальзывание ордеров для реалистичного тестирования стратегии.",
    "Ustaw prowizję takera, spread giełdowy i poślizg zleceń, aby realistycznie testować strategię."
  ],
  [
    "Комісія біржі (%):",
    "Exchange fee (%):",
    "Комиссия биржи (%):",
    "Prowizja giełdy (%):"
  ],
  [
    "За замовчуванням 0.05% (Binance/Bybit Futures taker)",
    "Default 0.05% (Binance/Bybit Futures taker)",
    "По умолчанию 0.05% (тейкер Binance/Bybit Futures)",
    "Domyślnie 0.05% (taker Binance/Bybit Futures)"
  ],
  [
    "Ринковий спред (%):",
    "Market spread (%):",
    "Рыночный спред (%):",
    "Spread rynkowy (%):"
  ],
  [
    "Проковзування / Slippage (%):",
    "Slippage (%):",
    "Проскальзывание / Slippage (%):",
    "Poślizg / Slippage (%):"
  ],
  [
    "Зберегти параметри",
    "Save parameters",
    "Сохранить параметры",
    "Zapisz parametry"
  ],
  [
    "Автофокус",
    "Auto focus",
    "Автофокус",
    "Automatyczne skupienie"
  ],
  [
    "Свічка:",
    "Candle:",
    "Свеча:",
    "Świeca:"
  ],
  [
    "Вибір історичної дати відтворення",
    "Choose historical replay date",
    "Выбор исторической даты воспроизведения",
    "Wybierz historyczną datę odtwarzania"
  ],
  [
    "Виберіть момент у минулому. Графік миттєво переміститься туди, автоматично сфокусується на свічках, а всі наступні свічки будуть приховані для реалістичної торгівлі!",
    "Choose a past date. The chart will jump to it, focus on the candles, and hide future candles for realistic trading practice!",
    "Выберите момент в прошлом. График перейдёт к нему, сфокусируется на свечах и скроет все будущие свечи для реалистичной тренировки!",
    "Wybierz moment w przeszłości. Wykres przejdzie do tej daty, skupi się na świecach i ukryje przyszłe świece, aby zapewnić realistyczny trening!"
  ],
  [
    "Швидкі переходи:",
    "Quick jumps:",
    "Быстрые переходы:",
    "Szybkie przejścia:"
  ],
  [
    "Або точна дата і час:",
    "Or exact date and time:",
    "Или точные дата и время:",
    "Lub dokładna data i godzina:"
  ],
  [
    "Почати відтворення 🚀",
    "Start replay 🚀",
    "Начать воспроизведение 🚀",
    "Rozpocznij odtwarzanie 🚀"
  ],
  [
    "Усі монети ринку криптовалют",
    "All cryptocurrency market coins",
    "Все монеты крипторынка",
    "Wszystkie monety rynku kryptowalut"
  ],
  [
    "Реальний ринок Binance & Bybit з 24г обсягом від",
    "Live Binance & Bybit market with 24h volume from",
    "Реальный рынок Binance и Bybit с объёмом за 24 ч от",
    "Rynek Binance i Bybit z wolumenem 24h od"
  ],
  [
    "24г:",
    "24h:",
    "24 ч:",
    "24h:"
  ],
  [
    "Показано",
    "Shown",
    "Показано",
    "Wyświetlono"
  ],
  [
    "монет на ринку ($100k – $10B)",
    "market coins ($100k–$10B)",
    "монет на рынке ($100k–$10B)",
    "monet na rynku ($100k–$10B)"
  ],
  [
    "Швидкість",
    "Speed",
    "Скорость",
    "Prędkość"
  ]
] as const;
const languages: SupportedLanguage[] = ['uk','en','ru','pl'];
export const audit20261115Replay = Object.fromEntries(languages.map((lang,i)=>[lang,Object.fromEntries(rows.map(row=>[row[0],row[i]]))])) as Record<SupportedLanguage,Record<string,string>>;
export const audit20261115ReplayRows = rows;
