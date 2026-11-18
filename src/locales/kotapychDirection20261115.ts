/** Presentation labels for Kotapych setup direction badges (not trading-side identifiers). */
import type { SupportedLanguage } from './types';

export const kotapychDirectionRows = [
  [
    "ЛОНГ",
    "LONG",
    "ЛОНГ",
    "LONG"
  ],
  [
    "ШОРТ",
    "SHORT",
    "ШОРТ",
    "SHORT"
  ]
] as const;
const languageOrder: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const kotapychDirectionPhrases = Object.fromEntries(
  languageOrder.map((language, index) => [
    language,
    Object.fromEntries(kotapychDirectionRows.map(row => [row[0], row[index]])),
  ]),
) as Record<SupportedLanguage, Record<string, string>>;
