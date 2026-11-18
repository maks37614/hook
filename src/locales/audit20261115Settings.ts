/** 2026-11-15 audit: Screener preferences, terminal linking, HookChart settings and indicators. */
import type { SupportedLanguage } from './types';
const rows = [
  [
    "Налаштування діють лише на сторінці «Скрінер». Пошук, фільтри й порядок монет використовують уже завантажені ринкові дані; HookChart, Формації та Раннє виявлення не змінюються.",
    "These settings affect Screener only. Search, filters, and coin order use market data already loaded; HookChart, Formations, and Early Detection are unchanged.",
    "Настройки действуют только на странице «Скринер». Поиск, фильтры и порядок монет используют уже загруженные рыночные данные; HookChart, Формации и Раннее обнаружение не меняются.",
    "Te ustawienia dotyczą tylko Skanera. Wyszukiwanie, filtry i kolejność monet korzystają z już pobranych danych; HookChart, Formacje i Wczesne wykrywanie pozostają bez zmian."
  ],
  [
    "Налаштувати стандартні параметри",
    "Configure default parameters",
    "Настроить параметры по умолчанию",
    "Skonfiguruj ustawienia domyślne"
  ],
  [
    "Пошук за монетою",
    "Search by coin",
    "Поиск по монете",
    "Wyszukiwanie monety"
  ],
  [
    "Необов’язково. Якщо залишити поле порожнім, скрінер шукатиме всі монети, які відповідають вибраним фільтрам.",
    "Optional. Leave blank to find all coins matching the selected filters.",
    "Необязательно. Если оставить поле пустым, Скринер найдёт все монеты, соответствующие выбранным фильтрам.",
    "Opcjonalnie. Pozostaw puste, aby znaleźć wszystkie monety spełniające wybrane filtry."
  ],
  [
    "Готовий фільтр Скрінера",
    "Saved Screener filter",
    "Готовый фильтр Скринера",
    "Gotowy filtr Skanera"
  ],
  [
    "Ф’ючерси",
    "Futures",
    "Фьючерсы",
    "Kontrakty"
  ],
  [
    "Мінімальна волатильність 5m, %",
    "Minimum 5m volatility, %",
    "Минимальная волатильность 5m, %",
    "Minimalna zmienność 5m, %"
  ],
  [
    "Активні рухи за 5 хв. Для частини монет значення 5m може бути розрахунковою оцінкою.",
    "Active price movements over 5 minutes. The 5m figure may be an estimate for some coins.",
    "Активные движения за 5 минут. Для части монет значение 5m может быть расчётной оценкой.",
    "Aktywne ruchy w ciągu 5 minut. Dla części monet wartość 5m może być szacunkowa."
  ],
  [
    "Ціна від, $",
    "Price from, $",
    "Цена от, $",
    "Cena od, $"
  ],
  [
    "Ціна до, $",
    "Price to, $",
    "Цена до, $",
    "Cena do, $"
  ],
  [
    "Ціна «від» не може бути більшою за «до».",
    "The minimum price cannot exceed the maximum price.",
    "Минимальная цена не может превышать максимальную.",
    "Cena minimalna nie może przekraczać maksymalnej."
  ],
  [
    "До 24h High, відстань %",
    "Distance to 24h high, %",
    "Расстояние до максимума 24h, %",
    "Odległość od maksimum 24h, %"
  ],
  [
    "До 24h Low, відстань %",
    "Distance to 24h low, %",
    "Расстояние до минимума 24h, %",
    "Odległość od minimum 24h, %"
  ],
  [
    "Показувати монети зі знайденими формаціями з уже наявного кешу стандартного сканера. Непроскановані монети не проходять цей фільтр.",
    "Show coins with detected formations from the standard scanner cache. Unscanned coins do not pass this filter.",
    "Показывать монеты с обнаруженными формациями из кеша стандартного сканера. Неотсканированные монеты не проходят фильтр.",
    "Pokazuj monety z wykrytymi formacjami z pamięci podręcznej skanera. Nieprzeskanowane monety nie spełniają filtra."
  ],
  [
    "Open Interest (OI) від, $",
    "Open Interest (OI) from, $",
    "Открытый интерес (OI) от, $",
    "Open Interest (OI) od, $"
  ],
  [
    "Доступні реальні OI з котирувань (зараз переважно Bybit Futures). Без даних OI монета не проходить активний фільтр.",
    "Uses actual OI data from quotes (currently mostly Bybit Futures). Coins without OI data fail this active filter.",
    "Используются реальные данные OI из котировок (сейчас преимущественно Bybit Futures). Монеты без OI не проходят активный фильтр.",
    "Wykorzystuje rzeczywiste OI z notowań (obecnie głównie Bybit Futures). Monety bez OI nie przechodzą aktywnego filtra."
  ],
  [
    "Мінімальний |Funding|, %",
    "Minimum |Funding|, %",
    "Минимальный |Funding|, %",
    "Minimalny |Funding|, %"
  ],
  [
    "Береться з наявних ф’ючерсних котирувань. Якщо Funding недоступний, увімкнений фільтр його не вигадує.",
    "Uses available futures quotes. If funding data is unavailable, the filter does not invent it.",
    "Используются доступные котировки фьючерсов. Если Funding недоступен, фильтр не подставляет вымышленные значения.",
    "Korzysta z dostępnych notowań kontraktów. Jeśli Funding jest niedostępny, filtr nie tworzy fikcyjnych wartości."
  ],
  [
    "RVOL підтвердженого пробою, від ×",
    "Confirmed breakout RVOL, from ×",
    "RVOL подтверждённого пробоя, от ×",
    "RVOL potwierdzonego wybicia, od ×"
  ],
  [
    "Обсяг свічки підтвердженого пробою відносно попередніх 20 закритих свічок. Використовується лише перевірений RVOL з кешу формацій, не загальний RVOL кожної монети.",
    "Volume of the confirmed breakout candle relative to the previous 20 closed candles. Only verified RVOL from the formation cache is used, not a coin's general RVOL.",
    "Объём свечи подтверждённого пробоя относительно предыдущих 20 закрытых свечей. Используется только проверенный RVOL из кеша формаций, не общий RVOL монеты.",
    "Wolumen świecy potwierdzonego wybicia względem poprzednich 20 zamkniętych świec. Używany jest tylko zweryfikowany RVOL z pamięci formacji, a nie ogólny RVOL monety."
  ],
  [
    "Важливо: OI, Funding, RVOL та формації можуть бути доступні не для всіх монет. Увімкнені фільтри не пропускають монети без потрібних даних; нові запити до бірж не додаються.",
    "Important: OI, Funding, RVOL, and formations may not be available for every coin. Enabled filters exclude coins without required data; no extra exchange requests are made.",
    "Важно: OI, Funding, RVOL и формации доступны не для всех монет. Активные фильтры исключают монеты без нужных данных; дополнительные запросы к биржам не выполняются.",
    "Ważne: OI, Funding, RVOL i formacje mogą nie być dostępne dla wszystkich monet. Aktywne filtry odrzucają monety bez danych; nie generują dodatkowych żądań do giełd."
  ],
  [
    "Основний показник сортування",
    "Primary sorting metric",
    "Основной показатель сортировки",
    "Główne kryterium sortowania"
  ],
  [
    "Порядок основного показника",
    "Primary sorting order",
    "Порядок основного показателя",
    "Kolejność sortowania głównego"
  ],
  [
    "Другий пріоритет (за однакових значень)",
    "Secondary priority (for equal values)",
    "Второй приоритет (при равных значениях)",
    "Drugi priorytet (przy równych wartościach)"
  ],
  [
    "Порядок другого показника",
    "Secondary sorting order",
    "Порядок второго показателя",
    "Kolejność drugiego kryterium"
  ],
  [
    "Зберегти як налаштування за замовчуванням",
    "Save as default settings",
    "Сохранить как настройки по умолчанию",
    "Zapisz jako ustawienia domyślne"
  ],
  [
    "Назва власного пресета",
    "Custom preset name",
    "Название собственного пресета",
    "Nazwa własnego presetu"
  ],
  [
    "Завантаження персональних налаштувань графіка…",
    "Loading personal chart settings…",
    "Загрузка персональных настроек графика…",
    "Ładowanie osobistych ustawień wykresu…"
  ],
  [
    "Вкажіть один термінал для відкриття монет з h00k. Дані надсилаються лише у локальну програму на вашому комп’ютері. Торгові заявки, паролі, API-ключі й рівні Entry/SL/TP не передаються.",
    "Choose one terminal for opening h00k coins. Data is sent only to the local app on your computer. Orders, passwords, API keys, and Entry/SL/TP levels are not transmitted.",
    "Выберите один терминал для открытия монет из h00k. Данные отправляются только локальному приложению на вашем компьютере. Ордера, пароли, API-ключи и уровни Entry/SL/TP не передаются.",
    "Wybierz jeden terminal do otwierania monet z h00k. Dane są wysyłane wyłącznie do lokalnej aplikacji. Zlecenia, hasła, klucze API i poziomy Entry/SL/TP nie są przesyłane."
  ],
  [
    "Увімкнути лінковку",
    "Enable terminal linking",
    "Включить связь с терминалом",
    "Włącz połączenie z terminalem"
  ],
  [
    "Локальний HTTP-порт",
    "Local HTTP port",
    "Локальный HTTP-порт",
    "Lokalny port HTTP"
  ],
  [
    "Група лінковки (001–500)",
    "Linking group (001–500)",
    "Группа связывания (001–500)",
    "Grupa połączenia (001–500)"
  ],
  [
    "Локальний WebSocket-порт",
    "Local WebSocket port",
    "Локальный порт WebSocket",
    "Lokalny port WebSocket"
  ],
  [
    "Група за замовчуванням (A–Z, 0–18)",
    "Default group (A–Z, 0–18)",
    "Группа по умолчанию (A–Z, 0–18)",
    "Domyślna grupa (A–Z, 0–18)"
  ],
  [
    "Тест BTCUSDT",
    "Test BTCUSDT",
    "Тест BTCUSDT",
    "Test BTCUSDT"
  ],
  [
    "Офіційна документація MetaScalp API",
    "Official MetaScalp API documentation",
    "Официальная документация MetaScalp API",
    "Oficjalna dokumentacja MetaScalp API"
  ],
  [
    "Офіційна документація Tiger API",
    "Official Tiger API documentation",
    "Официальная документация Tiger API",
    "Oficjalna dokumentacja Tiger API"
  ],
  [
    "Перемикати інструмент під час відкриття графіка з h00k",
    "Switch instrument when opening a chart from h00k",
    "Переключать инструмент при открытии графика из h00k",
    "Zmieniaj instrument przy otwieraniu wykresu z h00k"
  ],
  [
    "Автоматично перемикати за новими сповіщеннями",
    "Automatically switch on new alerts",
    "Автоматически переключать по новым уведомлениям",
    "Automatycznie przełączaj po nowych alertach"
  ],
  [
    "Захисний інтервал між командами",
    "Safety interval between commands",
    "Защитный интервал между командами",
    "Odstęp bezpieczeństwa między komendami"
  ],
  [
    "Мінімальна якість сигналу (0 = вимкнено)",
    "Minimum signal quality (0 = off)",
    "Минимальное качество сигнала (0 = выкл.)",
    "Minimalna jakość sygnału (0 = wyłączone)"
  ],
  [
    "Звук після успішної лінковки в обраному терміналі",
    "Play sound after successful linking in the selected terminal",
    "Звук после успешного связывания в выбранном терминале",
    "Dźwięk po udanym połączeniu w wybranym terminalu"
  ],
  [
    "Ще не реалізовано",
    "Not implemented yet",
    "Пока не реализовано",
    "Jeszcze nie zaimplementowano"
  ],
  [
    "Натисніть на комбінацію та введіть нову. Esc скасовує введення, Backspace або Delete очищає комбінацію.",
    "Select a shortcut and press new keys. Esc cancels; Backspace or Delete clears the shortcut.",
    "Нажмите на сочетание и введите новое. Esc отменяет, Backspace или Delete очищают сочетание.",
    "Kliknij skrót i wprowadź nowy. Esc anuluje, Backspace lub Delete usuwa skrót."
  ],
  [
    "Скинути",
    "Reset",
    "Сбросить",
    "Zresetuj"
  ],
  [
    "Вибір пресета одразу застосовує його параметри та запускає автоматичний аналіз/розмітку графіка.",
    "Selecting a preset immediately applies its settings and starts automatic chart analysis and drawing.",
    "Выбор пресета сразу применяет параметры и запускает автоматический анализ/разметку графика.",
    "Wybór presetu od razu stosuje ustawienia i uruchamia automatyczną analizę oraz oznaczanie wykresu."
  ],
  [
    "Вимкнути",
    "Disable",
    "Отключить",
    "Wyłącz"
  ],
  [
    "Будуть застосовані налаштування",
    "Settings to be applied",
    "Будут применены настройки",
    "Zostaną zastosowane ustawienia"
  ],
  [
    "барів",
    "bars",
    "баров",
    "słupków"
  ],
  [
    "Зберегти поточний вигляд графіка",
    "Save current chart appearance",
    "Сохранить текущий вид графика",
    "Zapisz bieżący wygląd wykresu"
  ],
  [
    "Зробити типовими для всіх графіків",
    "Make default for all charts",
    "Сделать настройками по умолчанию для всех графиков",
    "Ustaw domyślnie dla wszystkich wykresów"
  ],
  [
    "Скинути цей профіль",
    "Reset this profile",
    "Сбросить этот профиль",
    "Zresetuj ten profil"
  ],
  [
    "Глобальний автомасштаб Термінала може мати пріоритет над вертикальним зумом.",
    "Terminal global auto-scale may override vertical zoom.",
    "Глобальный автомасштаб Терминала может иметь приоритет над вертикальным зумом.",
    "Globalne automatyczne skalowanie Terminala może mieć pierwszeństwo przed powiększeniem pionowym."
  ],
  [
    "Параметри зберігаються автоматично",
    "Settings are saved automatically",
    "Параметры сохраняются автоматически",
    "Ustawienia zapisują się automatycznie"
  ],
  [
    "Налаштування HookChart для Скрінера, Формацій і Термінала. Візуальні профілі телефона, комп’ютера й різних розмірів графіка зберігаються окремо. Усі налаштування зберігаються автоматично.",
    "HookChart settings for Screener, Formations, and Terminal. Visual profiles for phones, desktops, and chart sizes are stored separately. All settings are saved automatically.",
    "Настройки HookChart для Скринера, Формаций и Терминала. Визуальные профили телефона, компьютера и разных размеров графика сохраняются отдельно. Все настройки сохраняются автоматически.",
    "Ustawienia HookChart dla Skanera, Formacji i Terminala. Profile wizualne telefonów, komputerów i rozmiarów wykresu są zapisywane osobno. Wszystkie ustawienia zapisują się automatycznie."
  ],
  [
    "Основні",
    "General",
    "Основные",
    "Podstawowe"
  ],
  [
    "Рівні",
    "Levels",
    "Уровни",
    "Poziomy"
  ],
  [
    "Масштаб",
    "Scale",
    "Масштаб",
    "Skala"
  ],
  [
    "Стратегії",
    "Strategies",
    "Стратегии",
    "Strategie"
  ],
  [
    "Гарячі клавіші",
    "Keyboard shortcuts",
    "Горячие клавиши",
    "Skróty klawiszowe"
  ],
  [
    "свічок",
    "candles",
    "свечей",
    "świec"
  ],
  [
    "Обсяг історії застосовується окремо до кожного графіка після відкриття. Фактична кількість свічок залежить від біржі.",
    "History length is applied separately to each chart after opening. Actual candle count depends on the exchange.",
    "Длина истории применяется отдельно к каждому графику после открытия. Фактическое число свечей зависит от биржи.",
    "Zakres historii jest stosowany osobno do każdego otwartego wykresu. Faktyczna liczba świec zależy od giełdy."
  ],
  [
    "Завантажено:",
    "Loaded:",
    "Загружено:",
    "Załadowano:"
  ],
  [
    "· Підвантаження старіших свічок…",
    "· Loading older candles…",
    "· Загрузка более старых свечей…",
    "· Ładowanie starszych świec…"
  ],
  [
    "· API не повернув старіших свічок.",
    "· API returned no older candles.",
    "· API не вернул более старых свечей.",
    "· API nie zwróciło starszych świec."
  ],
  [
    "· Не вдалося завантажити всю історію.",
    "· Could not load the full history.",
    "· Не удалось загрузить всю историю.",
    "· Nie udało się załadować całej historii."
  ],
  [
    "Liq: сума всіх унікальних отриманих ліквідацій за поточну сесію, незалежно від порогів і перемикачів.",
    "Liq: sum of all unique liquidation events received during this session, regardless of thresholds and toggles.",
    "Liq: сумма всех уникальных ликвидаций за текущую сессию независимо от порогов и переключателей.",
    "Liq: suma wszystkich unikalnych likwidacji odebranych w tej sesji, niezależnie od progów i przełączników."
  ],
  [
    "Значення",
    "Value",
    "Значение",
    "Wartość"
  ],
  [
    "Поріг щільностей",
    "Liquidity wall threshold",
    "Порог плотностей",
    "Próg dużych zleceń"
  ],
  [
    "BID (проти продажів)",
    "BID (against selling)",
    "BID (против продаж)",
    "BID (przeciw sprzedaży)"
  ],
  [
    "ASK (проти покупок)",
    "ASK (against buying)",
    "ASK (против покупок)",
    "ASK (przeciw zakupom)"
  ],
  [
    "4× медіана · частка локального стакана ≥25% · зустрічні угоди 5 хв ×0,5",
    "4× median · local order-book share ≥25% · opposite trades over 5 min ×0.5",
    "4× медиана · доля локального стакана ≥25% · встречные сделки за 5 мин ×0,5",
    "4× mediana · udział lokalnego arkusza ≥25% · przeciwne transakcje z 5 min ×0,5"
  ],
  [
    "Поки немає підтверджень. Перемкни «Усі сильні», щоб бачити заявки до контакту з ціною.",
    "No confirmations yet. Switch to “All strong” to see orders before price contact.",
    "Подтверждений пока нет. Переключите на «Все сильные», чтобы видеть заявки до контакта с ценой.",
    "Brak potwierdzeń. Włącz „Wszystkie silne”, aby zobaczyć zlecenia przed kontaktem z ceną."
  ],
  [
    "У межах доступної глибини стакана біржі.",
    "Within available exchange order-book depth.",
    "В пределах доступной глубины биржевого стакана.",
    "W zakresie dostępnej głębokości arkusza zleceń."
  ],
  [
    "МІТКИ",
    "LABELS",
    "МЕТКИ",
    "ETYKIETY"
  ],
  [
    "СУМИ",
    "AMOUNTS",
    "СУММЫ",
    "KWOTY"
  ],
  [
    "Час утримання",
    "Hold time",
    "Время удержания",
    "Czas utrzymania"
  ],
  [
    "сек",
    "sec",
    "сек",
    "s"
  ],
  [
    "Індикатори",
    "Indicators",
    "Индикаторы",
    "Wskaźniki"
  ],
  [
    "Текст",
    "Text",
    "Текст",
    "Tekst"
  ],
  [
    "Локальна мітка не надсилає повідомлення в Telegram.",
    "A local chart marker does not send a Telegram message.",
    "Локальная метка не отправляет сообщение в Telegram.",
    "Lokalny znacznik nie wysyła wiadomości w Telegramie."
  ],
  [
    "Скальпінг",
    "Scalping",
    "Скальпинг",
    "Skalping"
  ],
  [
    "Котапич",
    "Kotapych",
    "Котапыч",
    "Kotapych"
  ]
] as const;
const languages: SupportedLanguage[] = ['uk','en','ru','pl'];
export const audit20261115Settings = Object.fromEntries(languages.map((lang,i)=>[lang,Object.fromEntries(rows.map(row=>[row[0],row[i]]))])) as Record<SupportedLanguage,Record<string,string>>;
export const audit20261115SettingsRows = rows;
