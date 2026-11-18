/** Additional early-W/M UI phrases, reviewed independently for each language. */
import type { SupportedLanguage } from './types';
const rows = [
  [
    "Раннє виявлення W/M формацій",
    "Early detection of W/M formations",
    "Раннее обнаружение W/M-формаций",
    "Wczesne wykrywanie formacji W/M"
  ],
  [
    "Ранні W/M-сценарії: {{coins}} монет · {{count}} можливих формацій",
    "Early W/M scenarios: {{coins}} coins · {{count}} possible formations",
    "Ранние W/M-сценарии: {{coins}} монет · {{count}} возможных формаций",
    "Wczesne scenariusze W/M: {{coins}} monet · {{count}} możliwych formacji"
  ],
  [
    "Потенційна → Формується · підтвердження перевіряє звичайний сканер",
    "Potential → Forming · the regular scanner checks confirmation",
    "Потенциальная → Формируется · подтверждение проверяет обычный сканер",
    "Potencjalna → W trakcie tworzenia · potwierdzenie sprawdza zwykły skaner"
  ],
  [
    "Лише попередні ознаки на закритих свічках. Другий екстремум і пробій ще не підтверджені. Рівні орієнтовні, не є торговими ордерами чи Telegram-сигналами. R:R враховує приблизно 0,1% витрат на кожен бік угоди; реальні комісії та прослизання можуть бути іншими. Якщо структура порушується, кандидат зникає з активного списку. Пошук охоплює доступні USDT-пари на вибраних біржах, ринках і таймфреймі. Недоступні джерела та свічки відображаються як неповне сканування.",
    "Only preliminary signs from closed candles. The second extreme and breakout are not yet confirmed. Levels are estimates, not trading orders or Telegram signals. R:R assumes about 0.1% costs on each side of a trade; actual fees and slippage may differ. If the structure breaks, the candidate disappears from the active list. The scan covers available USDT pairs on selected exchanges, markets and timeframe. Unavailable sources or candles are reported as an incomplete scan.",
    "Только предварительные признаки на закрытых свечах. Второй экстремум и пробой ещё не подтверждены. Уровни ориентировочные, не являются торговыми ордерами или Telegram-сигналами. R:R учитывает около 0,1% расходов на каждую сторону сделки; реальные комиссии и проскальзывание могут отличаться. При нарушении структуры кандидат исчезает из активного списка. Поиск охватывает доступные USDT-пары выбранных бирж, рынков и таймфрейма. Недоступные источники и свечи отмечаются как неполное сканирование.",
    "Wyłącznie wstępne sygnały z zamkniętych świec. Drugi ekstremum i wybicie nie są jeszcze potwierdzone. Poziomy są szacunkowe, nie stanowią zleceń ani sygnałów Telegram. R:R zakłada około 0,1% kosztów po każdej stronie transakcji; rzeczywiste prowizje i poślizg mogą się różnić. Gdy struktura zostanie naruszona, kandydat znika z aktywnej listy. Skan obejmuje dostępne pary USDT na wybranych giełdach, rynkach i interwale. Brak źródeł lub świec jest zgłaszany jako niepełny skan."
  ],
  [
    "Отримання списку USDT-пар…",
    "Fetching USDT pairs…",
    "Получение списка USDT-пар…",
    "Pobieranie listy par USDT…"
  ],
  [
    "Повний пошук W/M триває",
    "Full W/M scan in progress",
    "Полное сканирование W/M выполняется",
    "Trwa pełne skanowanie W/M"
  ],
  [
    "Повний пошук завершено",
    "Full scan completed",
    "Полное сканирование завершено",
    "Pełne skanowanie zakończone"
  ],
  [
    "Частковий результат: не всі пари перевірено",
    "Partial result: not all pairs checked",
    "Частичный результат: проверены не все пары",
    "Wynik częściowy: nie sprawdzono wszystkich par"
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
    "Не удалось выполнить полное сканирование",
    "Pełne skanowanie nie powiodło się"
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
    "Пересканувати",
    "Scan again",
    "Сканировать снова",
    "Skanuj ponownie"
  ],
  [
    "{{processed}} / {{total}} пар · {{percentage}}% · перевірено {{checked}} · без історії {{skipped}} · помилок {{failed}}",
    "{{processed}} / {{total}} pairs · {{percentage}}% · checked {{checked}} · no history {{skipped}} · errors {{failed}}",
    "{{processed}} / {{total}} пар · {{percentage}}% · проверено {{checked}} · без истории {{skipped}} · ошибок {{failed}}",
    "{{processed}} / {{total}} par · {{percentage}}% · sprawdzono {{checked}} · bez historii {{skipped}} · błędów {{failed}}"
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
    "Частина ринкових даних недоступна; результат не можна вважати повним.",
    "Some market data is unavailable; results should not be considered complete.",
    "Часть рыночных данных недоступна; результат нельзя считать полным.",
    "Część danych rynkowych jest niedostępna; wyniki nie są kompletne."
  ],
  [
    "Недоступні джерела:",
    "Unavailable sources:",
    "Недоступные источники:",
    "Niedostępne źródła:"
  ],
  [
    "Повне сканування не завершено. Нуль знайдених W/M не означає, що їх немає.",
    "Full scan unfinished. Finding zero W/M formations does not mean none exist.",
    "Полное сканирование не завершено. Ноль найденных W/M не означает, что их нет.",
    "Pełne skanowanie nie jest zakończone. Zero znalezionych W/M nie oznacza, że nie istnieją."
  ],
  [
    "Шукаємо ранні W/M-формації…",
    "Looking for early W/M formations…",
    "Ищем ранние W/M-формации…",
    "Wyszukiwanie wczesnych formacji W/M…"
  ],
  [
    "У перевіреній частині ринку можливих W/M-формацій не знайдено.",
    "No possible W/M formations found in the scanned market segment.",
    "В проверенной части рынка возможные W/M-формации не найдены.",
    "Nie znaleziono możliwych formacji W/M w sprawdzonej części rynku."
  ],
  [
    "За поточними фільтрами можливих W/M-формацій не знайдено.",
    "No possible W/M formations match the current filters.",
    "По текущим фильтрам возможные W/M-формации не найдены.",
    "Brak możliwych formacji W/M dla obecnych filtrów."
  ],
  [
    "Спробуйте вибрати «Усі W/M» і стадію «Усі», або зменшити мінімальний обсяг торгів. Сканер перевіряє доступні USDT-пари і лише закриті свічки.",
    "Try “All W/M” and stage “All”, or lower the minimum trading volume. The scanner checks available USDT pairs and only closed candles.",
    "Выберите «Все W/M» и стадию «Все» либо уменьшите минимальный торговый объём. Сканер проверяет доступные USDT-пары и только закрытые свечи.",
    "Wybierz „Wszystkie W/M” i etap „Wszystkie” albo obniż minimalny wolumen. Skaner sprawdza dostępne pary USDT i wyłącznie zamknięte świece."
  ],
  [
    "Можливе подвійне дно (W)",
    "Possible double bottom (W)",
    "Возможное двойное дно (W)",
    "Możliwe podwójne dno (W)"
  ],
  [
    "Можлива подвійна вершина (M)",
    "Possible double top (M)",
    "Возможная двойная вершина (M)",
    "Możliwy podwójny szczyt (M)"
  ],
  [
    "Перше дно і відскок уже є. Ціна наближається до повторного тесту підтримки; друге дно й пробій шиї ще не підтверджені.",
    "First bottom and bounce identified. Price is approaching another support test; the second bottom and neckline breakout remain unconfirmed.",
    "Первое дно и отскок уже есть. Цена приближается к повторному тесту поддержки; второе дно и пробой линии шеи ещё не подтверждены.",
    "Pierwsze dno i odbicie są widoczne. Cena zbliża się do ponownego testu wsparcia; drugie dno i wybicie linii szyi nie są potwierdzone."
  ],
  [
    "Перша вершина і відкат уже є. Ціна наближається до повторного тесту опору; друга вершина й пробій шиї ще не підтверджені.",
    "First peak and pullback identified. Price is nearing another resistance test; the second peak and neckline breakout remain unconfirmed.",
    "Первая вершина и откат уже есть. Цена приближается к повторному тесту сопротивления; вторая вершина и пробой линии шеи ещё не подтверждены.",
    "Pierwszy szczyt i korekta są widoczne. Cena zbliża się do ponownego testu oporu; drugi szczyt i wybicie linii szyi nie są potwierdzone."
  ],
  [
    "Формація ще не підтверджена",
    "Formation not yet confirmed",
    "Формация ещё не подтверждена",
    "Formacja jeszcze niepotwierdzona"
  ],
  [
    "МОЖЛИВА",
    "POSSIBLE",
    "ВОЗМОЖНА",
    "MOŻLIWA"
  ],
  [
    "Формується",
    "Forming",
    "Формируется",
    "W trakcie tworzenia"
  ],
  [
    "Потенційна",
    "Potential",
    "Потенциальная",
    "Potencjalna"
  ],
  [
    "Правила профілю · дотики тінями:",
    "Profile rules · wick touches:",
    "Правила профиля · касания тенями:",
    "Zasady profilu · dotknięcia knotami:"
  ],
  [
    "немає перевірених даних",
    "no verified data",
    "нет проверенных данных",
    "brak zweryfikowanych danych"
  ],
  [
    "Прогноз TP",
    "Projected TP",
    "Прогноз TP",
    "Prognozowany TP"
  ],
  [
    "SL ранній",
    "Early SL",
    "Ранний SL",
    "Wczesny SL"
  ],
  [
    "Ранній вхід",
    "Early entry",
    "Ранний вход",
    "Wczesne wejście"
  ],
  [
    "Очікуємо дотики",
    "Waiting for touches",
    "Ожидаем касания",
    "Oczekiwanie na dotknięcia"
  ],
  [
    "Вхід після пробою",
    "Entry after breakout",
    "Вход после пробоя",
    "Wejście po wybiciu"
  ],
  [
    "SL після пробою",
    "SL after breakout",
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
    "R:R після пробою ≈",
    "Post-breakout R:R ≈",
    "R:R после пробоя ≈",
    "R:R po wybiciu ≈"
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
    "Можлива формація",
    "Possible formation",
    "Возможная формация",
    "Możliwa formacja"
  ],
  [
    "Можлива формація:",
    "Possible formation:",
    "Возможная формация:",
    "Możliwa formacja:"
  ],
  [
    "Можлива формація ·",
    "Possible formation ·",
    "Возможная формация ·",
    "Możliwa formacja ·"
  ],
  [
    "Сценарій без підтвердження другого екстремуму та пробою. Рівні прогнозні, не торгові ордери.",
    "Scenario without confirmation of the second extreme or breakout. Levels are estimates, not orders.",
    "Сценарий без подтверждения второго экстремума и пробоя. Уровни прогнозные, не торговые ордера.",
    "Scenariusz bez potwierdzenia drugiego ekstremum lub wybicia. Poziomy są szacunkowe, nie stanowią zleceń."
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
    "TP · проекция",
    "TP · prognoza"
  ],
  [
    "SL раннього входу",
    "Early-entry SL",
    "SL раннего входа",
    "SL wczesnego wejścia"
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
    "Таймфрейм сценарію:",
    "Scenario timeframe:",
    "Таймфрейм сценария:",
    "Interwał scenariusza:"
  ],
  [
    "Ранній вхід розглядається лише за наявності відскоку або відбою. Підтвердження оцінює основний сканер.",
    "Consider early entry only following a bounce or rejection. The main scanner evaluates confirmation.",
    "Ранний вход рассматривается только при отскоке или отбое. Подтверждение оценивает основной сканер.",
    "Rozważ wczesne wejście tylko po odbiciu lub odrzuceniu. Potwierdzenie ocenia główny skaner."
  ],
  [
    "Попередня структура; підтвердження ще немає",
    "Preliminary structure; not confirmed",
    "Предварительная структура; подтверждения пока нет",
    "Wstępna struktura; brak potwierdzenia"
  ],
  [
    "Графік на весь екран",
    "Fullscreen chart",
    "График на весь экран",
    "Wykres pełnoekranowy"
  ],
  [
    "Завантаження свічок…",
    "Loading candles…",
    "Загрузка свечей…",
    "Ładowanie świec…"
  ],
  [
    "Завантаження свічок з біржі…",
    "Loading candles from exchange…",
    "Загрузка свечей с биржи…",
    "Ładowanie świec z giełdy…"
  ],
  [
    "Повернутися до формацій",
    "Back to formations",
    "Вернуться к формациям",
    "Wróć do formacji"
  ],
  [
    "Можливий ранній вхід · межа 1",
    "Possible early entry · boundary 1",
    "Возможный ранний вход · граница 1",
    "Możliwe wczesne wejście · granica 1"
  ],
  [
    "Можливий ранній вхід · межа 2",
    "Possible early entry · boundary 2",
    "Возможный ранний вход · граница 2",
    "Możliwe wczesne wejście · granica 2"
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
    "Відкрити графік можливої формації на весь екран",
    "Open possible formation in fullscreen",
    "Открыть возможную формацию на весь экран",
    "Otwórz możliwą formację na pełnym ekranie"
  ]
] as const;
const languages: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const earlyWmPhrases = Object.fromEntries(
  languages.map((language, i) => [language, Object.fromEntries(rows.map(row => [row[0], row[i]]))])
) as Record<SupportedLanguage, Record<string, string>>;
export const earlyWmRows = rows;
