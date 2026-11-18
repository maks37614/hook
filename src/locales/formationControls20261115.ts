/** Chart card control copy not present in earlier four-language locale audits.
 * Source text is the original Ukrainian interface wording.
 */
import type { SupportedLanguage } from './types';
export const formationControlRows = [
  [
    "Монета під 24/7 наглядом",
    "Coin under 24/7 monitoring",
    "Монета под наблюдением 24/7",
    "Moneta monitorowana przez całą dobę"
  ],
  [
    "Взяти монету на 24/7 нагляд",
    "Start monitoring this coin 24/7",
    "Включить наблюдение за монетой 24/7",
    "Włącz monitorowanie tej monety 24/7"
  ],
  [
    "Зняти монету з нагляду",
    "Remove coin from monitoring",
    "Снять монету с наблюдения",
    "Usuń monetę z monitorowania"
  ],
  [
    "Додати монету до нагляду",
    "Add coin to monitoring",
    "Добавить монету в наблюдение",
    "Dodaj monetę do monitorowania"
  ]
] as const;

const languageOrder: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const formationControlPhrases = Object.fromEntries(
  languageOrder.map((language, index) => [
    language,
    Object.fromEntries(formationControlRows.map(row => [row[0], row[index]])),
  ]),
) as Record<SupportedLanguage, Record<string, string>>;
