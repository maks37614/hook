/** Replay preset trade tags: display translations only; stored tag values remain Ukrainian. */
import type { SupportedLanguage } from './types';
export const replayPresetTagRows = [
  [
    "Пробій рівня",
    "Level breakout",
    "Пробой уровня",
    "Wybicie poziomu"
  ],
  [
    "Хибний пробій (Fakeout)",
    "False breakout (Fakeout)",
    "Ложный пробой (Fakeout)",
    "Fałszywe wybicie (Fakeout)"
  ],
  [
    "Відскік від підтримки",
    "Bounce from support",
    "Отскок от поддержки",
    "Odbicie od wsparcia"
  ],
  [
    "Відскік від опору",
    "Rejection from resistance",
    "Отскок от сопротивления",
    "Odbicie od oporu"
  ],
  [
    "Розворот W / Подвійне дно",
    "W reversal / Double bottom",
    "Разворот W / Двойное дно",
    "Odwrócenie W / Podwójne dno"
  ],
  [
    "Розворот M / Подвійна вершина",
    "M reversal / Double top",
    "Разворот M / Двойная вершина",
    "Odwrócenie M / Podwójny szczyt"
  ],
  [
    "Голова і плечі (H&S)",
    "Head and shoulders (H&S)",
    "Голова и плечи (H&S)",
    "Głowa i ramiona (H&S)"
  ],
  [
    "Висхідний тренд",
    "Uptrend",
    "Восходящий тренд",
    "Trend wzrostowy"
  ],
  [
    "Спадний тренд",
    "Downtrend",
    "Нисходящий тренд",
    "Trend spadkowy"
  ],
  [
    "Стиснення (Squeeze)",
    "Compression (Squeeze)",
    "Сжатие (Squeeze)",
    "Kompresja (Squeeze)"
  ],
  [
    "Скальпінг імпульс",
    "Impulse scalping",
    "Скальпинг импульса",
    "Skalping impulsu"
  ],
  [
    "Тест зони ліквідності",
    "Liquidity-zone test",
    "Тест зоны ликвидности",
    "Test strefy płynności"
  ]
] as const;
const languages: SupportedLanguage[] = ['uk','en','ru','pl'];
const translated = Object.fromEntries(languages.map((language, index) => [language,
  Object.fromEntries(replayPresetTagRows.map(row => [row[0], row[index]])),
])) as Record<SupportedLanguage, Record<string,string>>;
export function translateReplayPresetTag(language: SupportedLanguage, tag: string): string {
  return translated[language][tag] ?? tag;
}
