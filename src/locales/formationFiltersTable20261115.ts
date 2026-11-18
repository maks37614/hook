/** Four-language labels for early W/M, regular formation filters and results table. */
import type { SupportedLanguage } from './types';
export const formationFiltersTableRows = [
  [
    "formationFilters.directionWM",
    "Напрямок W/M",
    "W/M direction",
    "Направление W/M",
    "Kierunek W/M"
  ],
  [
    "formationFilters.earlyDirection",
    "Напрямок ранньої W/M",
    "Early W/M direction",
    "Направление ранней W/M",
    "Kierunek wczesnego W/M"
  ],
  [
    "formationFilters.direction",
    "Напрямок формації",
    "Formation direction",
    "Направление формации",
    "Kierunek formacji"
  ],
  [
    "formationFilters.allWM",
    "Усі W/M",
    "All W/M",
    "Все W/M",
    "Wszystkie W/M"
  ],
  [
    "formationFilters.earlyStage",
    "Стадія ранньої формації",
    "Early formation stage",
    "Стадия ранней формации",
    "Etap wczesnej formacji"
  ],
  [
    "formationFilters.stage",
    "Стадія",
    "Stage",
    "Стадия",
    "Etap"
  ],
  [
    "formationFilters.stage.all",
    "Усі",
    "All",
    "Все",
    "Wszystkie"
  ],
  [
    "formationFilters.stage.potential",
    "Потенційна",
    "Potential",
    "Потенциальная",
    "Potencjalna"
  ],
  [
    "formationFilters.stage.forming",
    "Формується",
    "Forming",
    "Формируется",
    "W trakcie formowania"
  ],
  [
    "formationFilters.levelsGroup",
    "Фільтри рівнів",
    "Level filters",
    "Фильтры уровней",
    "Filtry poziomów"
  ],
  [
    "formationFilters.density",
    "Щільність",
    "Order-book density",
    "Плотность стакана",
    "Gęstość zleceń"
  ],
  [
    "formationFilters.densityTip",
    "Щільність — лише формації з підтвердженою великою лімітною заявкою в стакані",
    "Density — only formations with a confirmed large limit order in the order book",
    "Плотность — только формации с подтверждённой крупной лимитной заявкой в стакане",
    "Gęstość — tylko formacje z potwierdzonym dużym zleceniem limitowanym w arkuszu"
  ],
  [
    "formationFilters.round",
    "Круглі числа (ROUND)",
    "Round numbers (ROUND)",
    "Круглые числа (ROUND)",
    "Okrągłe poziomy (ROUND)"
  ],
  [
    "formationFilters.roundTip",
    "Круглі числа (ROUND) — формації біля круглого рівня",
    "Round numbers (ROUND) — formations near a round price level",
    "Круглые числа (ROUND) — формации вблизи круглого уровня цены",
    "Okrągłe poziomy (ROUND) — formacje w pobliżu okrągłego poziomu ceny"
  ],
  [
    "formationFilters.status",
    "Статус",
    "Status",
    "Статус",
    "Status"
  ],
  [
    "formationFilters.status.all",
    "Усі",
    "All",
    "Все",
    "Wszystkie"
  ],
  [
    "formationFilters.status.forming",
    "Формується",
    "Forming",
    "Формируется",
    "Formuje się"
  ],
  [
    "formationFilters.status.ready_to_break",
    "Очікує пробою",
    "Awaiting breakout",
    "Ожидает пробоя",
    "Oczekiwanie na wybicie"
  ],
  [
    "formationFilters.status.breakout",
    "Пробій",
    "Breakout",
    "Пробой",
    "Wybicie"
  ],
  [
    "formationFilters.status.retest",
    "Ретест",
    "Retest",
    "Ретест",
    "Retest"
  ],
  [
    "formationFilters.status.target_reached",
    "Ціль досягнуто",
    "Target reached",
    "Цель достигнута",
    "Cel osiągnięty"
  ],
  [
    "formationFilters.fromVolume",
    "Від {{volume}}",
    "From {{volume}}",
    "От {{volume}}",
    "Od {{volume}}"
  ],
  [
    "formationFilters.sortStage",
    "За стадією",
    "By stage",
    "По стадии",
    "Według etapu"
  ],
  [
    "formationFilters.sortEarlyRR",
    "За R:R раннього входу",
    "By early-entry R:R",
    "По R:R раннего входа",
    "Według R:R wczesnego wejścia"
  ],
  [
    "formationFilters.sortProfit",
    "За прибутком до TP (%)",
    "By profit to TP (%)",
    "По прибыли до TP (%)",
    "Według potencjalnego zysku do TP (%)"
  ],
  [
    "formationFilters.sortAscTip",
    "Спадання — змінити на зростання",
    "Descending — switch to ascending",
    "Убывание — переключить на возрастание",
    "Malejąco — zmień na rosnąco"
  ],
  [
    "formationFilters.sortDescTip",
    "Зростання — змінити на спадання",
    "Ascending — switch to descending",
    "Возрастание — переключить на убывание",
    "Rosnąco — zmień na malejąco"
  ],
  [
    "formationFilters.sortAscAria",
    "Сортувати за зростанням",
    "Sort ascending",
    "Сортировать по возрастанию",
    "Sortuj rosnąco"
  ],
  [
    "formationFilters.sortDescAria",
    "Сортувати за спаданням",
    "Sort descending",
    "Сортировать по убыванию",
    "Sortuj malejąco"
  ],
  [
    "formationTable.levels",
    "Рівні (Entry / TP / SL)",
    "Levels (Entry / TP / SL)",
    "Уровни (Entry / TP / SL)",
    "Poziomy (Entry / TP / SL)"
  ],
  [
    "formationTable.volatility",
    "Волатильність: {{value}}%",
    "Volatility: {{value}}%",
    "Волатильность: {{value}}%",
    "Zmienność: {{value}}%"
  ],
  [
    "formationTable.highDistance",
    "Відстань до максимуму: -{{value}}%",
    "Distance to high: -{{value}}%",
    "Расстояние до максимума: -{{value}}%",
    "Odległość od maksimum: -{{value}}%"
  ],
  [
    "formationTable.lowDistance",
    "Відстань до мінімуму: +{{value}}%",
    "Distance to low: +{{value}}%",
    "Расстояние до минимума: +{{value}}%",
    "Odległość od minimum: +{{value}}%"
  ],
  [
    "formationTable.high",
    "Хай: -{{value}}%",
    "High: -{{value}}%",
    "Макс.: -{{value}}%",
    "Maks.: -{{value}}%"
  ],
  [
    "formationTable.low",
    "Лой: +{{value}}%",
    "Low: +{{value}}%",
    "Мин.: +{{value}}%",
    "Min.: +{{value}}%"
  ],
  [
    "formationTable.formationCount",
    "Формацій монети: {{count}}",
    "Coin formations: {{count}}",
    "Формаций монеты: {{count}}",
    "Formacje monety: {{count}}"
  ],
  [
    "formationTable.viewPattern",
    "Переглянути {{name}}",
    "View {{name}}",
    "Посмотреть {{name}}",
    "Zobacz {{name}}"
  ],
  [
    "formationTable.entry",
    "Вхід:",
    "Entry:",
    "Вход:",
    "Wejście:"
  ],
  [
    "formationTable.target",
    "Ціль",
    "Target",
    "Цель",
    "Cel"
  ],
  [
    "formationTable.stop",
    "Стоп-лос",
    "Stop loss",
    "Стоп-лосс",
    "Stop loss"
  ],
  [
    "formationTable.terminalGroup",
    "Відкрити в обраному терміналі (Група {{group}})",
    "Open in selected terminal (Group {{group}})",
    "Открыть в выбранном терминале (Группа {{group}})",
    "Otwórz w wybranym terminalu (grupa {{group}})"
  ],
  [
    "formationTable.telegram",
    "Сповіщення ціни в Telegram",
    "Telegram price alert",
    "Ценовое уведомление в Telegram",
    "Alert cenowy w Telegramie"
  ],
  [
    "formationTable.openChart",
    "Відкрити графік",
    "Open chart",
    "Открыть график",
    "Otwórz wykres"
  ]
] as const;
const languages: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const formationFiltersTableStrings = Object.fromEntries(languages.map((language, index) => [
  language, Object.fromEntries(formationFiltersTableRows.map(row => ['i18n.' + row[0], row[index + 1]])),
])) as Record<SupportedLanguage, Record<string, string>>;
