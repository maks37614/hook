/** Generic Encyclopedia tab labels absent from the original locale catalogs. */
import type { SupportedLanguage } from './types';
export const encyclopediaModalUiRows = [
  [
    "Скальпінг",
    "Scalping",
    "Скальпинг",
    "Skalping"
  ],
  [
    "Індикатори",
    "Indicators",
    "Индикаторы",
    "Wskaźniki"
  ],
  [
    "Котапич",
    "Kotapych",
    "Котапыч",
    "Kotapych"
  ],
  [
    "Закрити енциклопедію",
    "Close encyclopedia",
    "Закрыть энциклопедию",
    "Zamknij encyklopedię"
  ]
] as const;
const languages: SupportedLanguage[] = ['uk','en','ru','pl'];
export const encyclopediaModalUiPhrases = Object.fromEntries(
 languages.map((language,index) => [language, Object.fromEntries(
  encyclopediaModalUiRows.map(row => [row[0], row[index]]),
 )]),
) as Record<SupportedLanguage, Record<string,string>>;
