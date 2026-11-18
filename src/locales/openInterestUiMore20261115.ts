/** Additional Open Interest guide strings missing from earlier Encyclopedia dictionaries. */
import type { SupportedLanguage } from './types';
export const openInterestUiRows = [
  [
    "зростання",
    "rising",
    "рост",
    "wzrost"
  ],
  [
    "падіння",
    "falling",
    "падение",
    "spadek"
  ],
  [
    "Ціна",
    "Price",
    "Цена",
    "Cena"
  ],
  [
    "Знайди рівень → дочекайся реакції → перевір OI. Зростання OI разом із рухом може підтримувати ідею продовження; падіння OI на імпульсі може свідчити про винос і вимагати швидшої оцінки фіксації.",
    "Identify a level → wait for a reaction → check OI. Rising OI alongside a price move may support continuation; falling OI during an impulse may indicate position flushing and call for quicker profit-taking assessment.",
    "Найди уровень → дождись реакции → проверь OI. Рост OI вместе с движением может поддерживать продолжение; падение OI на импульсе может указывать на вынос позиций и требовать более быстрой оценки фиксации.",
    "Znajdź poziom → poczekaj na reakcję → sprawdź OI. Rosnące OI wraz z ruchem może wspierać kontynuację; spadające OI podczas impulsu może wskazywać na wymiecenie pozycji i potrzebę szybszej oceny realizacji zysku."
  ],
  [
    "Свічка стрімко рухається: стеж за OI. Його зростання може вказувати на нарощування позицій; зниження — на їхнє закриття. Рішення про утримання або вихід підтверджуй реакцією ціни, а не однією цифрою.",
    "The candle is moving rapidly: watch OI. An increase may indicate positions being opened; a decrease may indicate closing. Confirm holding or exit decisions through price action, not one number alone.",
    "Свеча быстро движется: следи за OI. Рост может указывать на открытие позиций, снижение — на закрытие. Решение удерживать или выходить подтверждай реакцией цены, а не одной цифрой.",
    "Świeca porusza się gwałtownie: obserwuj OI. Wzrost może oznaczać otwieranie pozycji, spadek ich zamykanie. Decyzję o utrzymaniu lub wyjściu potwierdzaj reakcją ceny, nie samą liczbą."
  ],
  [
    "і",
    "and",
    "и",
    "i"
  ]
] as const;
const languageOrder: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const openInterestUiPhrases = Object.fromEntries(
 languageOrder.map((language,index) => [language,
   Object.fromEntries(openInterestUiRows.map(row => [row[0], row[index]])),
 ]),
) as Record<SupportedLanguage, Record<string,string>>;
