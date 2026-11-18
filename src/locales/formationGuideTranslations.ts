/** Localized descriptions for the eight pattern examples in the Encyclopedia.
 * The original Ukrainian copy remains the source in FormationGuideModal.
 * Trading thresholds, stops and target geometry are unchanged.
 */
import type { SupportedLanguage } from './types';

const fields = ["name","category","description","entryRule","stopLossRule","targetRule","volumeRule"] as const;
const rows = [
  [
    "double_bottom",
    [
      "Double Bottom (W pattern)",
      "Reversal pattern",
      "Two similar lows separated by a peak (neckline). The pattern is a hypothesis until breakout, retest and other confirmations.",
      "Enter on an upward neckline breakout or a conservative retest from above.",
      "Stop below the second bottom or slightly below the consolidation low.",
      "Project the distance from the bottoms to the neckline upward from the breakout.",
      "High volume at the first bottom, less at the second, and a sharp rise on breakout."
    ],
    [
      "Двойное дно (W-паттерн)",
      "Разворотная формация",
      "Два близких минимума с промежуточной вершиной (линией шеи). Паттерн — лишь гипотеза до пробоя, ретеста и других подтверждений.",
      "Вход при пробое линии шеи вверх или осторожном ретесте сверху.",
      "Стоп ниже второго дна либо локального минимума консолидации.",
      "Высоту от минимумов до линии шеи откладывают вверх от пробоя.",
      "Высокий объём у первого дна, меньший у второго и резкий рост при пробое."
    ],
    [
      "Podwójne dno (formacja W)",
      "Formacja odwrócenia",
      "Dwa podobne dołki oddzielone szczytem (linią szyi). Formacja pozostaje hipotezą do wybicia, retestu i innych potwierdzeń.",
      "Wejście po wybiciu linii szyi w górę lub zachowawczym retescie od góry.",
      "Stop poniżej drugiego dołka lub minimum konsolidacji.",
      "Odległość od dołków do linii szyi odłóż w górę od wybicia.",
      "Wysoki wolumen przy pierwszym dołku, mniejszy przy drugim i silny wzrost na wybiciu."
    ]
  ],
  [
    "double_top",
    [
      "Double Top (M pattern)",
      "Reversal pattern",
      "A bearish reversal pattern suggesting buyer exhaustion after two failed attempts at a new high.",
      "Enter short on a downward neckline breakout or a retest from below.",
      "Stop above the second top or highest wick.",
      "Project the distance from the tops to the neckline downward.",
      "Selling volume spikes on the downward neckline breakout."
    ],
    [
      "Двойная вершина (M-паттерн)",
      "Разворотная формация",
      "Медвежий разворотный паттерн, указывающий на ослабление покупателей после двух неудачных попыток обновить максимум.",
      "Шорт при пробое линии шеи вниз или ретесте снизу.",
      "Стоп выше второй вершины или самого высокого фитиля.",
      "Высоту от вершин до линии шеи откладывают вниз.",
      "Объём продаж резко растёт на пробое линии шеи вниз."
    ],
    [
      "Podwójny szczyt (formacja M)",
      "Formacja odwrócenia",
      "Niedźwiedzia formacja odwrócenia wskazująca na słabnięcie kupujących po dwóch nieudanych próbach ustanowienia maksimum.",
      "Short po wybiciu linii szyi w dół lub retescie od dołu.",
      "Stop ponad drugim szczytem lub najwyższym knotem.",
      "Wysokość od szczytów do linii szyi odłóż w dół.",
      "Wolumen sprzedaży rośnie gwałtownie przy wybiciu linii szyi w dół."
    ]
  ],
  [
    "asc_triangle",
    [
      "Ascending Triangle",
      "Breakout pattern",
      "Horizontal resistance and a series of higher lows show growing buyer pressure.",
      "Enter long on a strong breakout above resistance or a retest.",
      "Stop below the latest higher low.",
      "Project the triangle's maximum height upward from the breakout.",
      "Volume contracts while the triangle forms and rises sharply on breakout."
    ],
    [
      "Восходящий треугольник",
      "Пробойная формация",
      "Горизонтальное сопротивление и повышающиеся минимумы (Higher Lows) указывают на давление покупателей.",
      "Лонг при импульсном пробое сопротивления или ретесте.",
      "Стоп ниже последнего повышающегося минимума.",
      "Максимальную высоту треугольника откладывают вверх от пробоя.",
      "Объём снижается внутри треугольника и резко растёт на пробое."
    ],
    [
      "Trójkąt zwyżkujący",
      "Formacja wybicia",
      "Poziomy opór i coraz wyższe dołki (Higher Lows) wskazują na rosnącą presję kupujących.",
      "Long po dynamicznym wybiciu oporu lub retescie.",
      "Stop poniżej ostatniego wyższego dołka.",
      "Maksymalną wysokość trójkąta odłóż w górę od wybicia.",
      "Wolumen maleje w trójkącie i gwałtownie rośnie przy wybiciu."
    ]
  ],
  [
    "desc_triangle",
    [
      "Descending Triangle",
      "Breakout pattern",
      "Horizontal support and a series of lower highs show sustained seller pressure against buy orders.",
      "Enter short when a candle closes below support.",
      "Stop above the most recent lower high.",
      "Project the triangle base's height downward from support.",
      "Volume increases on a support breakout."
    ],
    [
      "Нисходящий треугольник",
      "Пробойная формация",
      "Горизонтальная поддержка и снижающиеся максимумы (Lower Highs) указывают на давление продавцов на лимитные заявки покупателей.",
      "Шорт при закрытии свечи ниже поддержки.",
      "Стоп выше последнего понижающегося максимума.",
      "Высоту основания треугольника откладывают вниз от поддержки.",
      "Объём растёт при пробое поддержки."
    ],
    [
      "Trójkąt zniżkujący",
      "Formacja wybicia",
      "Poziome wsparcie i niższe szczyty (Lower Highs) pokazują presję sprzedających na zlecenia kupna.",
      "Short po zamknięciu świecy poniżej wsparcia.",
      "Stop powyżej ostatniego niższego szczytu.",
      "Wysokość podstawy trójkąta odłóż w dół od wsparcia.",
      "Wolumen rośnie przy wybiciu wsparcia."
    ]
  ],
  [
    "bull_flag",
    [
      "Bull Flag",
      "Trend continuation",
      "A strong upward flagpole is followed by a compact downward or sideways consolidation with falling volume.",
      "Enter on a breakout above the flag's upper sloping edge.",
      "Stop below the flag's lower edge.",
      "A new impulse can match the length of the previous flagpole.",
      "High volume on the flagpole, lower during consolidation and rising again on breakout."
    ],
    [
      "Бычий флаг (Bull Flag)",
      "Продолжение тренда",
      "Сильный рост (флагшток) сменяется короткой нисходящей или боковой консолидацией на меньшем объёме.",
      "Вход при пробое верхней наклонной границы флага.",
      "Стоп ниже нижней границы полотнища.",
      "Новый импульс может быть равен длине предыдущего флагштока.",
      "Высокий объём на флагштоке, спад при консолидации и новый всплеск при пробое."
    ],
    [
      "Flaga byka (Bull Flag)",
      "Kontynuacja trendu",
      "Silny wzrost (maszt) przechodzi w krótką konsolidację spadkową lub boczną przy malejącym wolumenie.",
      "Wejście po wybiciu górnej pochyłej granicy flagi.",
      "Stop poniżej dolnej krawędzi flagi.",
      "Nowy impuls może odpowiadać długości wcześniejszego masztu.",
      "Wysoki wolumen na maszcie, niższy w konsolidacji i ponowny wzrost przy wybiciu."
    ]
  ],
  [
    "bear_flag",
    [
      "Bear Flag",
      "Trend continuation",
      "A sharp drop is followed by a weak upward pullback, sometimes before a continuation of the sell-off.",
      "Enter short on a breakout below the rising channel's lower boundary.",
      "Stop above the pullback channel's upper boundary.",
      "Project the flagpole's height downward from breakout.",
      "High volume on the decline and lower volume during the pullback."
    ],
    [
      "Медвежий флаг (Bear Flag)",
      "Продолжение тренда",
      "Резкое падение сменяется слабым восходящим откатом перед возможным продолжением распродажи.",
      "Шорт при пробое нижней границы восходящего канала.",
      "Стоп выше верхней границы канала отката.",
      "Высоту флагштока откладывают вниз от пробоя.",
      "Высокий объём на падении и меньший при откате."
    ],
    [
      "Flaga niedźwiedzia (Bear Flag)",
      "Kontynuacja trendu",
      "Gwałtowny spadek przechodzi w słabe odbicie w górę przed możliwą kontynuacją wyprzedaży.",
      "Short po wybiciu dolnej granicy rosnącego kanału.",
      "Stop powyżej górnej granicy kanału korekty.",
      "Wysokość masztu odłóż w dół od wybicia.",
      "Wysoki wolumen podczas spadku, mniejszy podczas odbicia."
    ]
  ],
  [
    "volatility_squeeze",
    [
      "Range Compression (Squeeze)",
      "Accumulation / Compression",
      "The trading range narrows sharply and ATR falls. A directional breakout may follow, but direction is neutral before the break.",
      "Enter in the direction of a strong move beyond the accumulation range.",
      "Stop beyond the opposite range boundary.",
      "Target at least two to three times the compressed range.",
      "Very low volume during compression followed by a sharp rise when movement begins."
    ],
    [
      "Сжатие диапазона (Squeeze)",
      "Накопление / Сжатие",
      "Сужение торгового диапазона и снижение ATR предшествуют возможному направленному пробою; до пробоя направление нейтрально.",
      "Вход в сторону импульсного выхода из диапазона накопления.",
      "Стоп за противоположной границей диапазона.",
      "Цель минимум две-три высоты диапазона.",
      "Аномально низкий объём при сжатии и резкий рост в начале движения."
    ],
    [
      "Ściskanie zakresu (Squeeze)",
      "Akumulacja / Kompresja",
      "Zakres notowań gwałtownie się zwęża, a ATR spada. Może nastąpić wybicie kierunkowe; przed nim kierunek pozostaje neutralny.",
      "Wejście zgodnie z silnym ruchem poza zakresem akumulacji.",
      "Stop za przeciwległą granicą zakresu.",
      "Cel wynosi co najmniej dwie–trzy wysokości zakresu.",
      "Bardzo niski wolumen podczas kompresji i gwałtowny wzrost na początku ruchu."
    ]
  ],
  [
    "candlestick_pa",
    [
      "Candlestick Patterns (Pin Bar, Engulfing)",
      "Candlestick price analysis",
      "At key levels, hammer/pin bars suggest false breakouts and buying back, while engulfing candles can show a shift in control.",
      "Enter at candle close or on a 50% retracement of a long pin-bar wick.",
      "Stop beyond the pin-bar wick or the engulfing candle's extreme.",
      "Target the nearest support/resistance with risk-to-reward of at least 1:2.",
      "Reversal candles on higher volume may carry more weight."
    ],
    [
      "Свечные формации (Пин-бар, Поглощение)",
      "Свечной анализ цены",
      "На ключевых уровнях молот/пин-бар показывает ложный пробой и выкуп, а поглощение — смену контроля.",
      "Вход на закрытии свечи или откате на 50% длинной тени пин-бара.",
      "Стоп за тенью пин-бара или экстремумом свечи поглощения.",
      "Цель — ближайший уровень сопротивления/поддержки с R:R от 1:2.",
      "Разворотные свечи на повышенном объёме могут быть сильнее."
    ],
    [
      "Formacje świecowe (Pin bar, Objęcie)",
      "Analiza formacji świecowych",
      "Przy kluczowych poziomach młot/pin bar sugeruje fałszywe wybicie i wykup, a objęcie może oznaczać zmianę kontroli.",
      "Wejście na zamknięciu świecy lub cofnięciu o 50% długiego knota pin bara.",
      "Stop za knotem pin bara lub ekstremum świecy obejmującej.",
      "Cel to najbliższe wsparcie/opór z R:R co najmniej 1:2.",
      "Świece odwrócenia przy wyższym wolumenie mogą mieć większe znaczenie."
    ]
  ]
] as const;
export const translatedFormationGuideIds = rows.map(row => row[0]);
export const translatedFormationGuideFields = fields;
export function localizeFormationGuideItem<T extends Record<(typeof fields)[number], string> & { id: string }>(
  language: SupportedLanguage,
  item: T,
): T {
  if (language === 'uk') return item;
  const row = rows.find(row => row[0] === item.id);
  if (!row) return item;
  const values = language === 'en' ? row[1] : language === 'ru' ? row[2] : row[3];
  const localized = { ...item };
  for (const [fieldIndex, field] of fields.entries()) {
    (localized as Record<string, string>)[field] = values[fieldIndex];
  }
  return localized;
}

/** Visible badge labels only: the underlying formation bias stays unchanged. */
export type FormationGuideBias = 'bullish' | 'bearish' | 'neutral';

const formationGuideBiasLabels: Record<SupportedLanguage, Record<FormationGuideBias, string>> = {
  uk: { bullish: 'ЛОНГ', bearish: 'ШОРТ', neutral: 'НЕЙТРАЛЬНО' },
  en: { bullish: 'LONG', bearish: 'SHORT', neutral: 'NEUTRAL' },
  ru: { bullish: 'ЛОНГ', bearish: 'ШОРТ', neutral: 'НЕЙТРАЛЬНО' },
  pl: { bullish: 'LONG', bearish: 'SHORT', neutral: 'NEUTRALNY' },
};

export function localizeFormationGuideBias(language: SupportedLanguage, bias: FormationGuideBias): string {
  return formationGuideBiasLabels[language][bias];
}
