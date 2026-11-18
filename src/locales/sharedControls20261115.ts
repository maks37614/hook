/** Small cross-page labels used by native app toasts and public legal controls. */
import type { SupportedLanguage } from './types';
export const sharedControlRows = [
  [
    "Група",
    "Group",
    "Группа",
    "Grupa"
  ],
  [
    "На весь екран",
    "Fullscreen",
    "На весь экран",
    "Pełny ekran"
  ]
] as const;
const languages: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const sharedControlPhrases = Object.fromEntries(
  languages.map((language, index) => [
    language, Object.fromEntries(sharedControlRows.map(row => [row[0], row[index]])),
  ]),
) as Record<SupportedLanguage, Record<string, string>>;
