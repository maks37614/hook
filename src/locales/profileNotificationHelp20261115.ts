/** Additional reviewed Profile notification copy in all four supported languages. */
import type { SupportedLanguage } from './types';

export const profileNotificationHelpRows: readonly (readonly [string, string, string, string])[] = [
  [
    "Усі ринки",
    "All markets",
    "Все рынки",
    "Wszystkie rynki"
  ],
  [
    "Імпульси та великі ліквідації працюють лише з відкритою сторінкою. Для ліквідацій використовується ф’ючерсний потік обраної біржі.",
    "Impulses and large liquidations work only while the page is open. Liquidations use the selected exchange's futures stream.",
    "Импульсы и крупные ликвидации работают только при открытой странице. Для ликвидаций используется фьючерсный поток выбранной биржи.",
    "Impulsy i duże likwidacje działają tylko przy otwartej stronie. Likwidacje korzystają ze strumienia kontraktów wybranej giełdy."
  ]
];
export const profileNotificationHelpPhrases: Record<SupportedLanguage, Record<string, string>> = {uk:{},en:{},ru:{},pl:{}};
for (const [uk,en,ru,pl] of profileNotificationHelpRows) {
  profileNotificationHelpPhrases.uk[uk]=uk;
  profileNotificationHelpPhrases.en[uk]=en;
  profileNotificationHelpPhrases.ru[uk]=ru;
  profileNotificationHelpPhrases.pl[uk]=pl;
}
