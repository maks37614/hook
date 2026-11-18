/** Parameterized Replay UI text. Keep trading prices and symbols untouched. */
import type { SupportedLanguage } from './types';

export const replayDynamicRows = [
  [
    "replay.dynamic.volumeAmount",
    "Обсяг: ${{volume}}",
    "Volume: ${{volume}}",
    "Объём: ${{volume}}",
    "Wolumen: ${{volume}}"
  ],
  [
    "replay.dynamic.volumeRange",
    "Обсяг $100k–$10B",
    "Volume $100k–$10B",
    "Объём $100k–$10B",
    "Wolumen $100k–$10B"
  ],
  [
    "replay.dynamic.coinCount",
    "Монет: {{count}}",
    "Coins: {{count}}",
    "Монет: {{count}}",
    "Monety: {{count}}"
  ],
  [
    "replay.dynamic.volume24h",
    "Обсяг 24г:",
    "24h volume:",
    "Объём за 24 ч:",
    "Wolumen 24 h:"
  ],
  [
    "replay.dynamic.showMore",
    "Показати ще 300 · залишилося: {{count}}",
    "Show 300 more · remaining: {{count}}",
    "Показать ещё 300 · осталось: {{count}}",
    "Pokaż kolejne 300 · pozostało: {{count}}"
  ],
  [
    "replay.dynamic.showAll",
    "Показати всі ({{count}})",
    "Show all ({{count}})",
    "Показать все ({{count}})",
    "Pokaż wszystkie ({{count}})"
  ],
  [
    "replay.dynamic.listSummary",
    "Показано: {{shown}} / {{total}} · Ринок $100k–$10B",
    "Shown: {{shown}} / {{total}} · Market $100k–$10B",
    "Показано: {{shown}} / {{total}} · Рынок $100k–$10B",
    "Wyświetlono: {{shown}} / {{total}} · Rynek $100k–$10B"
  ],
  [
    "replay.dynamic.clearJournalConfirm",
    "Очистити всі записи журналу угод симулятора?",
    "Clear all simulator trade journal entries?",
    "Очистить все записи журнала сделок симулятора?",
    "Wyczyścić wszystkie wpisy dziennika transakcji symulatora?"
  ],
  [
    "replay.dynamic.marginAmount",
    "маржа: ${{amount}}",
    "margin: ${{amount}}",
    "маржа: ${{amount}}",
    "depozyt: ${{amount}}"
  ],
  [
    "replay.dynamic.profitLoss",
    "Прибуток: +${{profit}} | Збиток: -${{loss}}",
    "Profit: +${{profit}} | Loss: -${{loss}}",
    "Прибыль: +${{profit}} | Убыток: -${{loss}}",
    "Zysk: +${{profit}} | Strata: -${{loss}}"
  ],
  [
    "replay.dynamic.orderPrice",
    "Ціна: ${{price}}",
    "Price: ${{price}}",
    "Цена: ${{price}}",
    "Cena: ${{price}}"
  ],
  [
    "replay.dynamic.orderSize",
    "Розмір: ${{size}} ({{leverage}}x)",
    "Size: ${{size}} ({{leverage}}x)",
    "Размер: ${{size}} ({{leverage}}x)",
    "Wielkość: ${{size}} ({{leverage}}x)"
  ],
  [
    "replay.dynamic.currentPrice",
    "Поточна (${{price}})",
    "Current (${{price}})",
    "Текущая (${{price}})",
    "Bieżąca (${{price}})"
  ],
  [
    "replay.dynamic.candlesRemaining",
    "Залишилося свічок: {{count}}",
    "Candles remaining: {{count}}",
    "Осталось свечей: {{count}}",
    "Pozostałe świece: {{count}}"
  ],
  [
    "replay.dynamic.winLoss",
    "Виграшних: {{wins}} | Програшних: {{losses}}",
    "Winning: {{wins}} | Losing: {{losses}}",
    "Прибыльных: {{wins}} | Убыточных: {{losses}}",
    "Zyskowne: {{wins}} | Stratne: {{losses}}"
  ]
] as const;
const languages: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const replayDynamicStrings = Object.fromEntries(languages.map((language, index) => [
  language, Object.fromEntries(replayDynamicRows.map(row => [row[0], row[index + 1]])),
])) as Record<SupportedLanguage, Record<string, string>>;
