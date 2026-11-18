/** Extra confirmed formation card UI labels and explanations. */
import type { SupportedLanguage } from './types';
const rows = [
  [
    "Правила профілю",
    "Profile rules",
    "Правила профиля",
    "Zasady profilu"
  ],
  [
    " · дотики не підтверджені (немає даних)",
    " · touches not confirmed (no data)",
    " · касания не подтверждены (нет данных)",
    " · dotknięcia niepotwierdzone (brak danych)"
  ],
  [
    "{{count}} підтверджених дотиків",
    "{{count}} confirmed touches",
    "{{count}} подтверждённых касаний",
    "{{count}} potwierdzonych dotknięć"
  ],
  [
    "Технічні показники звичайного сканування",
    "Regular scanning technical indicators",
    "Технические показатели обычного сканирования",
    "Wskaźniki techniczne zwykłego skanowania"
  ],
  [
    "ATR(14) у відсотках від ціни, розрахований із закритих свічок",
    "ATR(14) as a percentage of price, calculated from closed candles",
    "ATR(14) в процентах от цены, рассчитанный по закрытым свечам",
    "ATR(14) jako procent ceny, obliczony z zamkniętych świec"
  ],
  [
    "RSI(14) останньої закритої свічки",
    "RSI(14) of the last closed candle",
    "RSI(14) последней закрытой свечи",
    "RSI(14) ostatniej zamkniętej świecy"
  ],
  [
    "Зміна реального OI у нативних контрактах за вибраний таймфрейм; лише ф'ючерси",
    "Actual OI change in native contracts over the selected timeframe; futures only",
    "Реальное изменение OI в нативных контрактах за выбранный таймфрейм; только фьючерсы",
    "Rzeczywista zmiana OI w kontraktach bazowych w wybranym interwale; tylko kontrakty terminowe"
  ],
  [
    "Дельта агресивних покупок мінус продажів Binance, остання закрита свічка",
    "Aggressive buy-minus-sell delta on Binance, last closed candle",
    "Дельта агрессивных покупок минус продаж на Binance, последняя закрытая свеча",
    "Delta agresywnych zakupów minus sprzedaż na Binance, ostatnia zamknięta świeca"
  ],
  [
    "Сумарна taker delta Binance за останні 20 закритих свічок відносно їхнього обороту",
    "Binance cumulative taker delta over the last 20 closed candles relative to turnover",
    "Суммарная taker-дельта Binance за последние 20 закрытых свечей относительно их оборота",
    "Skumulowana delta taker Binance z ostatnich 20 zamkniętych świec względem obrotu"
  ],
  [
    "RVOL обсягу свічки підтвердженого пробою проти попередніх 20 закритих свічок",
    "RVOL of the confirmed breakout candle against the previous 20 closed candles",
    "RVOL объёма свечи подтверждённого пробоя относительно предыдущих 20 закрытых свечей",
    "RVOL świecy potwierdzonego wybicia względem poprzednich 20 zamkniętych świec"
  ],
  [
    "Кругле число + велика лімітна заявка у поточному знімку стакана. Заявка може зникнути; це не гарантія підтримки або опору.",
    "Round number plus a large limit order in the current order-book snapshot. The order may disappear; it does not guarantee support or resistance.",
    "Круглый уровень и крупная лимитная заявка в текущем снимке стакана. Заявка может исчезнуть; это не гарантирует поддержку или сопротивление.",
    "Okrągły poziom i duże zlecenie limit w bieżącym arkuszu. Zlecenie może zniknąć; nie gwarantuje wsparcia ani oporu."
  ],
  [
    "Формація біля круглого числа",
    "Formation near a round number",
    "Формация возле круглого уровня",
    "Formacja blisko okrągłego poziomu"
  ],
  [
    "Структура та ринковий потік, нормовані за наявними перевіреними показниками до 100. Не ймовірність успіху.",
    "Structure and market flow, normalized to 100 using verified available metrics. Not a probability of success.",
    "Структура и рыночный поток, нормированные до 100 по доступным подтверждённым показателям. Это не вероятность успеха.",
    "Struktura i przepływ rynkowy znormalizowane do 100 na podstawie dostępnych zweryfikowanych danych. To nie prawdopodobieństwo sukcesu."
  ],
  [
    "Нормовано: {{raw}}/{{max}} доступних балів → {{total}}/100. Відсутні показники не зменшують оцінку. Натисни на складову для пояснення.",
    "Normalized: {{raw}}/{{max}} available points → {{total}}/100. Missing metrics do not lower the score. Tap a component for details.",
    "Нормировано: {{raw}}/{{max}} доступных баллов → {{total}}/100. Отсутствующие показатели не снижают оценку. Нажмите на компонент для пояснения.",
    "Normalizacja: {{raw}}/{{max}} dostępnych punktów → {{total}}/100. Brakujące wskaźniki nie obniżają oceny. Dotknij składnika, aby zobaczyć wyjaśnienie."
  ],
  [
    "Очікується:",
    "Awaiting:",
    "Ожидается:",
    "Oczekiwanie na:"
  ],
  [
    "Формація",
    "Formation",
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
    "Кругле число",
    "Round number",
    "Круглый уровень",
    "Okrągły poziom"
  ],
  [
    "Щільність BID/ASK",
    "BID/ASK liquidity walls",
    "Плотности BID/ASK",
    "Duże zlecenia BID/ASK"
  ],
  [
    "RVOL пробою",
    "Breakout RVOL",
    "RVOL пробоя",
    "RVOL wybicia"
  ],
  [
    "Ціль",
    "Target",
    "Цель",
    "Cel"
  ],
  [
    "Стоп",
    "Stop",
    "Стоп",
    "Stop"
  ],
  [
    "Вхід / R:R",
    "Entry / R:R",
    "Вход / R:R",
    "Wejście / R:R"
  ],
  [
    "Очікування дотиків",
    "Waiting for touches",
    "Ожидание касаний",
    "Oczekiwanie na dotknięcia"
  ],
  [
    "Відкрити графік на цілий блок",
    "Expand chart to fill card",
    "Развернуть график на весь блок",
    "Rozszerz wykres na całą kartę"
  ],
  [
    "Повний детальний огляд монети",
    "Full coin detail view",
    "Полный подробный обзор монеты",
    "Pełny widok szczegółów monety"
  ],
  [
    " · дотики {{count}}/{{required}}",
    " · touches {{count}}/{{required}}",
    " · касания {{count}}/{{required}}",
    " · dotknięcia {{count}}/{{required}}"
  ],
  [
    "Вибрати формацію для {{asset}} — {{count}} варіанти",
    "Select a formation for {{asset}} — {{count}} options",
    "Выбрать формацию для {{asset}} — {{count}} варианта",
    "Wybierz formację dla {{asset}} — {{count}} wariantów"
  ],
  [
    "Натисніть на назву, щоб вибрати одну з {{count}} формацій",
    "Tap the name to select one of {{count}} formations",
    "Нажмите на название, чтобы выбрать одну из {{count}} формаций",
    "Dotknij nazwy, aby wybrać jedną z {{count}} formacji"
  ],
  [
    "Відправити в обраний термінал ({{group}})",
    "Send to selected terminal ({{group}})",
    "Отправить в выбранный терминал ({{group}})",
    "Wyślij do wybranego terminala ({{group}})"
  ],
  [
    "Відкрити в обраному терміналі (Група {{group}})",
    "Open in selected terminal (Group {{group}})",
    "Открыть в выбранном терминале (Группа {{group}})",
    "Otwórz w wybranym terminalu (Grupa {{group}})"
  ],
  [
    "Монета на системному нагляді ({{status}}). Натисніть щоб зняти",
    "Coin under system monitoring ({{status}}). Tap to remove",
    "Монета под системным наблюдением ({{status}}). Нажмите для снятия",
    "Moneta pod monitoringiem systemowym ({{status}}). Dotknij, aby usunąć"
  ],
  [
    "Взяти на 24/7 системний нагляд",
    "Add to 24/7 system monitoring",
    "Добавить под системное наблюдение 24/7",
    "Dodaj do monitoringu systemowego 24/7"
  ],
  [
    "Активна 24/7",
    "Active 24/7",
    "Активна 24/7",
    "Aktywna 24/7"
  ],
  [
    "Призупинена",
    "Paused",
    "Приостановлена",
    "Wstrzymana"
  ],
  [
    "Повний детальний огляд",
    "Full detailed overview",
    "Полный подробный обзор",
    "Pełny widok szczegółowy"
  ],
  [
    "Закрити графік (повернутися до картки)",
    "Close chart (back to card)",
    "Закрыть график (вернуться к карточке)",
    "Zamknij wykres (wróć do karty)"
  ],
  [
    "Створити сповіщення ціни в Telegram",
    "Create Telegram price alert",
    "Создать ценовое уведомление в Telegram",
    "Utwórz alert cenowy w Telegramie"
  ]
] as const;
const languages: SupportedLanguage[] = ['uk','en','ru','pl'];
export const formationCardMorePhrases = Object.fromEntries(
  languages.map((lang,i)=>[lang,Object.fromEntries(rows.map(row=>[row[0],row[i]]))])
) as Record<SupportedLanguage,Record<string,string>>;
export const formationCardMoreRows = rows;
