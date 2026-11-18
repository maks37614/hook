/** UI-only translation of scanner text containing live numeric values.
 * The scanner's data, statuses and thresholds must remain unchanged.
 */
import type { SupportedLanguage } from './types';

const templates = [
  ['Відстань до рівня пробою: {{distance}} ATR', 'Distance to the breakout level: {{distance}} ATR', 'Расстояние до уровня пробоя: {{distance}} ATR', 'Odległość od poziomu wybicia: {{distance}} ATR'],
  ['Відстань до екстремуму {{distance}}% · сила підходу {{strength}}/100 · тести {{count}}', 'Extreme distance {{distance}}% · approach strength {{strength}}/100 · tests {{count}}', 'Расстояние до экстремума {{distance}}% · сила подхода {{strength}}/100 · тесты {{count}}', 'Odległość od ekstremum {{distance}}% · siła podejścia {{strength}}/100 · testy {{count}}'],
  ['OI {{pct}}% · Зміна OI узгоджується з рухом ціни', 'OI {{pct}}% · OI change aligns with the price move', 'OI {{pct}}% · Изменение OI согласуется с движением цены', 'OI {{pct}}% · Zmiana OI jest zgodna z ruchem ceny'],
  ['OI {{pct}}% · Зміна OI без підтвердження руху ціни', 'OI {{pct}}% · OI change without supporting price action', 'OI {{pct}}% · Изменение OI без подтверждения движения цены', 'OI {{pct}}% · Zmiana OI bez potwierdzenia ruchem ceny'],
  ['Дельта {{pct}}% за останню закриту свічку', 'Delta {{pct}}% on the last closed candle', 'Дельта {{pct}}% за последнюю закрытую свечу', 'Delta {{pct}}% na ostatniej zamkniętej świecy'],
  ['CVD20 {{pct}}% за 20 закритих свічок', 'CVD20 {{pct}}% over 20 closed candles', 'CVD20 {{pct}}% за 20 закрытых свечей', 'CVD20 {{pct}}% z 20 zamkniętych świec'],
  ['Круглий рівень {{price}} · відстань {{distance}}% · сила {{strength}}/100', 'Round level {{price}} · distance {{distance}}% · strength {{strength}}/100', 'Круглый уровень {{price}} · расстояние {{distance}}% · сила {{strength}}/100', 'Okrągły poziom {{price}} · odległość {{distance}}% · siła {{strength}}/100'],
  [
    "Подвійний відскок від зони підтримки ${{bottom}}. Лінія шиї (ключовий опір) на рівні ${{neckline}}. Проєкція цілі патерну: ${{target}}.",
    "Double rebound from the support zone at ${{bottom}}. The neckline (key resistance) is at ${{neckline}}. Projected pattern target: ${{target}}.",
    "Двойной отскок от зоны поддержки ${{bottom}}. Линия шеи (ключевое сопротивление) на уровне ${{neckline}}. Расчётная цель паттерна: ${{target}}.",
    "Podwójne odbicie od strefy wsparcia ${{bottom}}. Linia szyi (kluczowy opór) na ${{neckline}}. Prognozowany cel formacji: ${{target}}."
  ],
  [
    "Подвійний відскок від рівня опору ${{top}}. Лінія шиї (підтримка) на рівні ${{neckline}}. Пробій вниз відкриває ціль на рівні ${{target}}.",
    "Double rejection from resistance at ${{top}}. The neckline (support) is at ${{neckline}}. A downward breakout points to ${{target}}.",
    "Двойной отбой от сопротивления ${{top}}. Линия шеи (поддержка) на уровне ${{neckline}}. Пробой вниз открывает цель на ${{target}}.",
    "Podwójne odrzucenie oporu ${{top}}. Linia szyi (wsparcie) na ${{neckline}}. Przebicie w dół wyznacza cel na ${{target}}."
  ],
  [
    "Бичаче підтискання до горизонтального опору ${{resistance}} із серією вищих мінімумів. Розрахункова ціль пробою: ${{target}}.",
    "Bullish pressure toward horizontal resistance at ${{resistance}} with rising lows. Projected breakout target: ${{target}}.",
    "Бычье поджатие к горизонтальному сопротивлению ${{resistance}} с повышающимися минимумами. Расчётная цель пробоя: ${{target}}.",
    "Bycze dociskanie do poziomego oporu ${{resistance}} przy rosnących dołkach. Prognozowany cel wybicia: ${{target}}."
  ],
  [
    "Ведмеже підтискання до горизонтальної підтримки ${{support}} із послідовним зниженням максимумів. Ціль падіння: ${{target}}.",
    "Bearish pressure toward horizontal support at ${{support}} with lower highs. Downside target: ${{target}}.",
    "Медвежье поджатие к горизонтальной поддержке ${{support}} с понижающимися максимумами. Цель снижения: ${{target}}.",
    "Niedźwiedzie dociskanie do poziomego wsparcia ${{support}} przy niższych szczytach. Cel spadku: ${{target}}."
  ],
  [
    "Імпульсне зростання (+{{percent}}%) перейшло в консолідацію. Розрахункова ціль другого імпульсу: ${{target}}.",
    "An impulsive rise (+{{percent}}%) entered consolidation. Projected target for a second impulse: ${{target}}.",
    "Импульсный рост (+{{percent}}%) перешёл в консолидацию. Расчётная цель второго импульса: ${{target}}.",
    "Gwałtowny wzrost (+{{percent}}%) przeszedł w konsolidację. Prognozowany cel drugiego impulsu: ${{target}}."
  ],
  [
    "Імпульсне падіння (-{{percent}}%) з наступним відкатом. Очікуване продовження шорт-руху до цілі: ${{target}}.",
    "An impulsive fall (-{{percent}}%) followed by a pullback. Expected continuation of the short move toward ${{target}}.",
    "Импульсное падение (-{{percent}}%) с последующим откатом. Ожидаемое продолжение движения вниз к цели ${{target}}.",
    "Gwałtowny spadek (-{{percent}}%) i późniejsza korekta. Oczekiwana kontynuacja ruchu w dół do ${{target}}."
  ],
  [
    "Ключовий рівень ${{level}} протестовано {{touches}} рази. Розрахункова ціль імпульсу: ${{target}}.",
    "Key level ${{level}} tested {{touches}} times. Projected impulse target: ${{target}}.",
    "Ключевой уровень ${{level}} протестирован {{touches}} раз. Расчётная цель импульса: ${{target}}.",
    "Kluczowy poziom ${{level}} został przetestowany {{touches}} razy. Prognozowany cel impulsu: ${{target}}."
  ],
  [
    "Волатильність стиснулася більш ніж удвічі. Діапазон накопичення: [${{low}} - ${{high}}]. Ціль виходу вгору: ${{target}}.",
    "Volatility contracted by more than half. Accumulation range: [${{low}} - ${{high}}]. Upside breakout target: ${{target}}.",
    "Волатильность сократилась более чем вдвое. Диапазон накопления: [${{low}} - ${{high}}]. Цель выхода вверх: ${{target}}.",
    "Zmienność spadła ponad dwukrotnie. Zakres akumulacji: [${{low}} - ${{high}}]. Cel wybicia w górę: ${{target}}."
  ],
  [
    "Довга нижня тінь ({{percent}}% свічки) підтверджує активність лімітного покупця. Ціль відскоку: ${{target}}.",
    "A long lower wick ({{percent}}% of the candle) indicates limit-buyer activity. Rebound target: ${{target}}.",
    "Длинная нижняя тень ({{percent}}% свечи) указывает на активность лимитного покупателя. Цель отскока: ${{target}}.",
    "Długi dolny knot ({{percent}}% świecy) wskazuje na aktywność kupującego zleceniami limit. Cel odbicia: ${{target}}."
  ],
  [
    "Довга верхня тінь ({{percent}}% свічки) свідчить про тиск продавців. Ціль корекції: ${{target}}.",
    "A long upper wick ({{percent}}% of the candle) indicates selling pressure. Pullback target: ${{target}}.",
    "Длинная верхняя тень ({{percent}}% свечи) указывает на давление продавцов. Цель коррекции: ${{target}}.",
    "Długi górny knot ({{percent}}% świecy) wskazuje na presję sprzedających. Cel korekty: ${{target}}."
  ],
  [
    "Зелена свічка повністю перекрила попередню свічку на зростаючому обсязі. Орієнтир для фіксації прибутку: ${{target}}.",
    "A green candle fully engulfed the previous candle on increasing volume. Reference take-profit level: ${{target}}.",
    "Зелёная свеча полностью перекрыла предыдущую на растущем объёме. Ориентир фиксации прибыли: ${{target}}.",
    "Zielona świeca całkowicie objęła poprzednią przy rosnącym wolumenie. Orientacyjny poziom realizacji zysku: ${{target}}."
  ],
  [
    "Червона свічка повністю перекрила тіло попередньої свічки. Очікувана ціль падіння: ${{target}}.",
    "A red candle completely engulfed the body of the previous candle. Expected downside target: ${{target}}.",
    "Красная свеча полностью перекрыла тело предыдущей свечи. Ожидаемая цель снижения: ${{target}}.",
    "Czerwona świeca w całości objęła korpus poprzedniej świecy. Oczekiwany cel spadku: ${{target}}."
  ],
  [
    "Ключова кругла ціна: ${{price}}.",
    "Key round-number price: ${{price}}.",
    "Ключевая круглая цена: ${{price}}.",
    "Kluczowy okrągły poziom ceny: ${{price}}."
  ],
  [
    "Екстремум: Верхній екстремум близько: {{distance}}%; підхід {{approach}}, сила {{strength}}/100.",
    "Extreme: Upper extreme nearby: {{distance}}%; approach {{approach}}, strength {{strength}}/100.",
    "Экстремум: Верхний экстремум рядом: {{distance}}%; приближение {{approach}}, сила {{strength}}/100.",
    "Ekstremum: Górne ekstremum blisko: {{distance}}%; podejście {{approach}}, siła {{strength}}/100."
  ],
  [
    "Екстремум: Нижній екстремум близько: {{distance}}%; підхід {{approach}}, сила {{strength}}/100.",
    "Extreme: Lower extreme nearby: {{distance}}%; approach {{approach}}, strength {{strength}}/100.",
    "Экстремум: Нижний экстремум рядом: {{distance}}%; приближение {{approach}}, сила {{strength}}/100.",
    "Ekstremum: Dolne ekstremum blisko: {{distance}}%; podejście {{approach}}, siła {{strength}}/100."
  ],
  [
    "Екстремум: Формація далеко від релевантного екстремуму ({{distance}}%) або підхід не підтверджений.",
    "Extreme: Formation is far from the relevant extreme ({{distance}}%) or the approach is unconfirmed.",
    "Экстремум: Формация далеко от значимого экстремума ({{distance}}%) или приближение не подтверждено.",
    "Ekstremum: Formacja jest daleko od odpowiedniego ekstremum ({{distance}}%) lub podejście nie jest potwierdzone."
  ],
  [
    "Якість геометрії/формації: {{score}}/100",
    "Formation geometry quality: {{score}}/100",
    "Качество геометрии формации: {{score}}/100",
    "Jakość geometrii formacji: {{score}}/100"
  ],
  [
    "{{role}}; відстань {{distance}}%; підхід {{approach}}; сила {{strength}}/100",
    "{{role}}; distance {{distance}}%; approach {{approach}}; strength {{strength}}/100",
    "{{role}}; расстояние {{distance}}%; приближение {{approach}}; сила {{strength}}/100",
    "{{role}}; odległość {{distance}}%; podejście {{approach}}; siła {{strength}}/100"
  ],
  [
    "Найближчий ключовий рівень: {{distance}}%",
    "Nearest key level: {{distance}}%",
    "Ближайший ключевой уровень: {{distance}}%",
    "Najbliższy kluczowy poziom: {{distance}}%"
  ],
  [
    "R:R {{rr}} нижче мінімуму 2.0",
    "R:R {{rr}} below the 2.0 minimum",
    "R:R {{rr}} ниже минимума 2.0",
    "R:R {{rr}} poniżej minimum 2.0"
  ],
  [
    "{{count}} підтверджених тестів екстремуму",
    "{{count}} confirmed extreme tests",
    "{{count}} подтверждённых тестов экстремума",
    "{{count}} potwierdzonych testów ekstremum"
  ],
  [
    "Немає extreme context",
    "No extreme context",
    "Нет контекста экстремума",
    "Brak kontekstu ekstremum"
  ],
  [
    "Підтверджений breakout",
    "Confirmed breakout",
    "Подтверждённый пробой",
    "Potwierdzone wybicie"
  ],
  [
    "Retest рівня",
    "Level retest",
    "Ретест уровня",
    "Retest poziomu"
  ],
  [
    "Підтвердження обсягом",
    "Volume confirmation",
    "Подтверждение объёмом",
    "Potwierdzenie wolumenem"
  ],
  [
    "Формація не знаходиться в підтвердженій зоні екстремуму",
    "Formation outside confirmed extreme zone",
    "Формация вне подтверждённой зоны экстремума",
    "Formacja poza potwierdzoną strefą ekstremum"
  ],
  [
    "Надмірна волатильність",
    "Excessive volatility",
    "Чрезмерная волатильность",
    "Nadmierna zmienność"
  ],
  [
    "Порушена look-ahead/closed-candle перевірка",
    "Look-ahead/closed-candle check failed",
    "Нарушена проверка look-ahead/closed-candle",
    "Błąd weryfikacji look-ahead/closed-candle"
  ],
  [
    "Є sweep релевантного екстремуму",
    "Relevant extreme sweep detected",
    "Обнаружен захват ликвидности у значимого экстремума",
    "Wykryto wybicie płynności przy istotnym ekstremum"
  ],
  [
    "Breakout підтверджено ретестом",
    "Breakout confirmed by retest",
    "Пробой подтверждён ретестом",
    "Wybicie potwierdzone retestem"
  ],
  [
    "Закритий breakout підтверджено",
    "Closed-candle breakout confirmed",
    "Пробой подтверждён закрытой свечой",
    "Wybicie potwierdzone zamkniętą świecą"
  ],
  [
    "Breakout не підтверджено",
    "Breakout unconfirmed",
    "Пробой не подтверждён",
    "Wybicie niepotwierdzone"
  ],
  [
    "Рівень пробою повторно протестовано й утримано",
    "Breakout level retested and held",
    "Уровень пробоя повторно протестирован и удержан",
    "Poziom wybicia ponownie przetestowany i utrzymany"
  ],
  [
    "Breakout є, але ретест ще не підтверджений",
    "Breakout detected, retest not yet confirmed",
    "Пробой есть, но ретест ещё не подтверждён",
    "Wykryto wybicie, retest jeszcze niepotwierdzony"
  ],
  [
    "Retest неможливий без breakout",
    "Retest requires a breakout",
    "Ретест невозможен без пробоя",
    "Retest wymaga wybicia"
  ],
  [
    "Некоректна відповідь біржі",
    "Invalid exchange response",
    "Некорректный ответ биржи",
    "Nieprawidłowa odpowiedź giełdy"
  ],
  [
    "Помилка з’єднання",
    "Connection error",
    "Ошибка соединения",
    "Błąd połączenia"
  ],
  [
    "недоступно",
    "unavailable",
    "недоступно",
    "niedostępne"
  ],
  [
    "Біржі не повернули доступних USDT-пар.",
    "Exchanges returned no available USDT pairs.",
    "Биржи не вернули доступных USDT-пар.",
    "Giełdy nie zwróciły dostępnych par USDT."
  ],
  [
    "Сканування скасовано",
    "Scan cancelled",
    "Сканирование отменено",
    "Skanowanie anulowane"
  ]
] as const;
export const formationDynamicRows = templates;

const languages: SupportedLanguage[] = ['uk','en','ru','pl'];
const esc = (s: string): string => s.replace(/[.*+?^$\u007b\u007d()|[\]\\]/g, '\\$&');
const compiled = templates.map(row => {
  const names: string[] = [];
  const pieces = row[0].split(/(\{\{[a-zA-Z]+\}\})/g).map(part => {
    const match = /^\{\{([a-zA-Z]+)\}\}$/.exec(part);
    if (match) { names.push(match[1]); return '(.+?)'; }
    return esc(part);
  });
  return { row, names, regex: new RegExp('^' + pieces.join('') + '$', 'u') };
});

function translateOne(lang: SupportedLanguage, text: string, fallback: (source: string) => string): string {
  for (const item of compiled) {
    const matched = item.regex.exec(text);
    if (!matched) continue;
    const values: Record<string, string> = {};
    item.names.forEach((name, i) => { values[name] = matched[i + 1]; });
    return item.row[languages.indexOf(lang)].replace(/\{\{([a-zA-Z]+)\}\}/g, (_, key: string) => {
      const value = values[key] ?? '';
      if (key !== 'role' && key !== 'approach') return value;
      // Extreme approach labels sometimes arrive as lowercase enum values.
      const normalized = key === 'approach' ? value.toUpperCase() : value;
      const translated = fallback(normalized);
      return translated === normalized ? value : translated;
    });
  }
  return fallback(text);
}

/** Format descriptions produced by patternRecognition/extremeAnalysis without touching numbers. */
export function translateFormationDynamicText(
  language: SupportedLanguage,
  source: string,
  fallback: (text: string) => string = text => text,
): string {
  // Scanner composes pattern + extreme context + optional round-number context.
  // Split only at those known suffix boundaries to avoid translating financial data.
  const markers = [' Екстремум: ', ' Ключова кругла ціна: '];
  const indices = markers.map(marker => source.indexOf(marker)).filter(index => index > 0);
  if (indices.length > 0) {
    const at = Math.min(...indices);
    const lead = source.slice(0, at);
    const tail = source.slice(at + 1);
    return translateOne(language, lead, fallback) + ' ' + translateFormationDynamicText(language, tail, fallback);
  }
  return translateOne(language, source, fallback);
}
