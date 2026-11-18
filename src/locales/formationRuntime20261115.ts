/** Localized scanner labels and runtime evidence shown in regular Formation cards.
 * Each row: [scanner source, Ukrainian, English, Russian, Polish].
 * Translation-only catalog: never changes pattern matching, scoring or market data.
 */
import type { SupportedLanguage } from './types';

export const formationRuntimeRows = [
  ['Якість структури', 'Якість структури', 'Structure quality', 'Качество структуры', 'Jakość struktury'],
  ['Структура оцінюється за однаковою шкалою для всіх ринків. Потік і технічні показники наведені окремо.', 'Структура оцінюється за однаковою шкалою для всіх ринків. Потік і технічні показники наведені окремо.', 'Structure uses the same scale across markets. Flow and technical evidence are shown separately.', 'Структура оценивается по единой шкале для всех рынков. Поток и технические показатели показаны отдельно.', 'Struktura jest oceniana według tej samej skali na wszystkich rynkach. Przepływ i dane techniczne pokazano oddzielnie.'],
  ['Структурні бали {{base}}/72 · Додаткові бали {{points}}', 'Структурні бали {{base}}/72 · Додаткові бали {{points}}', 'Structure points {{base}}/72 · Supplementary points {{points}}', 'Баллы структуры {{base}}/72 · Дополнительные баллы {{points}}', 'Punkty za strukturę {{base}}/72 · Punkty dodatkowe {{points}}'],
  ['Доступність додаткових показників {{available}}/27', 'Доступність додаткових показників {{available}}/27', 'Supplementary evidence available {{available}}/27', 'Доступность дополнительных показателей {{available}}/27', 'Dostępność danych dodatkowych {{available}}/27'],
  ['Оцінка за свічкою, закритою о {{time}}', 'Оцінка за свічкою, закритою о {{time}}', 'Rated using the candle that closed at {{time}}', 'Оценка по свече, закрытой в {{time}}', 'Ocena według świecy zamkniętej o {{time}}'],
  ['Очікує пробою', 'Очікує пробою', 'Waiting for breakout', 'Ожидается пробой', 'Oczekiwanie na wybicie'],
  ['Не застосовується', 'Не застосовується', 'Not applicable', 'Не применяется', 'Nie dotyczy'],
  ['Дані недоступні', 'Дані недоступні', 'Data unavailable', 'Данные недоступны', 'Dane niedostępne'],
  ['Перевірені дані потоку недоступні', 'Перевірені дані потоку недоступні', 'Verified trade-flow data is unavailable', 'Проверенные данные потока недоступны', 'Zweryfikowane dane przepływu są niedostępne'],
  ['Дельта агресивних покупок мінус продажів за останню закриту свічку', 'Дельта агресивних покупок мінус продажів за останню закриту свічку', 'Aggressive buys minus sells on the last closed candle', 'Агрессивные покупки минус продажи за последнюю закрытую свечу', 'Agresywne kupno minus sprzedaż na ostatniej zamkniętej świecy'],
  ['Сумарна дельта за 20 закритих свічок відносно їхнього обороту', 'Сумарна дельта за 20 закритих свічок відносно їхнього обороту', 'Total delta over 20 closed candles relative to their turnover', 'Суммарная дельта за 20 закрытых свечей относительно их оборота', 'Łączna delta z 20 zamkniętych świec względem ich obrotu'],
  ['Якість або час свічок не підтверджено', 'Якість або час свічок не підтверджено', 'Candle quality or timing could not be verified', 'Качество или время свечей не подтверждено', 'Nie potwierdzono jakości lub czasu świec'],
  ['Ціна втратила пробитий рівень', 'Ціна втратила пробитий рівень', 'Price lost the breakout level', 'Цена потеряла пробитый уровень', 'Cena wróciła za wybity poziom'],
  ['Обсяг свічки пробою недоступний', 'Обсяг свічки пробою недоступний', 'Breakout candle volume is unavailable', 'Объём свечи пробоя недоступен', 'Wolumen świecy wybicia jest niedostępny'],
  ['Контекст екстремуму недоступний', 'Контекст екстремуму недоступний', 'Extreme context is unavailable', 'Контекст экстремума недоступен', 'Kontekst ekstremum jest niedostępny'],
  ['Потрібне закриття за рівнем після підтвердження структури', 'Потрібне закриття за рівнем після підтвердження структури', 'A candle must close past the level after the structure is confirmed', 'Свеча должна закрыться за уровнем после подтверждения структуры', 'Świeca musi zamknąć się za poziomem po potwierdzeniu struktury'],
  ['Ретест очікується після пробою', 'Ретест очікується після пробою', 'Retest is evaluated after the breakout', 'Ретест ожидается после пробоя', 'Retest jest oceniany po wybiciu'],
  ['Потрібен обсяг пробою та 20 попередніх свічок', 'Потрібен обсяг пробою та 20 попередніх свічок', 'Needs breakout volume and volume from the previous 20 candles', 'Нужен объём пробоя и 20 предыдущих свечей', 'Wymagany wolumen wybicia i poprzednich 20 świec'],
  ['Відстань до рівня недоступна', 'Відстань до рівня недоступна', 'Distance to the level is unavailable', 'Расстояние до уровня недоступно', 'Odległość od poziomu jest niedostępna'],
  ['Закриті послідовні свічки та коректний час структури', 'Закриті послідовні свічки та коректний час структури', 'Consecutive closed candles and valid structure timing', 'Последовательные закрытые свечи и корректное время структуры', 'Kolejne zamknięte świece i prawidłowy czas struktury'],
  ['Вхід за пробоєм або ретестом застарів', 'Вхід за пробоєм або ретестом застарів', 'The breakout or retest entry has expired', 'Вход по пробою или ретесту устарел', 'Wejście po wybiciu lub reteście wygasło'],
  ['очікування свіжого ретесту', 'очікування свіжого ретесту', 'waiting for a fresh retest', 'ожидание нового ретеста', 'oczekiwanie na nowy retest'],
  ['Період OI не збігається із закриттям свічки', 'Період OI не збігається із закриттям свічки', 'The OI period does not match the candle close', 'Период OI не совпадает с закрытием свечи', 'Okres OI nie zgadza się z zamknięciem świecy'],
  ['Дельта закритої свічки недоступна', 'Дельта закритої свічки недоступна', 'Delta of the closed candle is unavailable', 'Дельта закрытой свечи недоступна', 'Delta zamkniętej świecy jest niedostępna'],
  ['Для CVD20 потрібні 20 свічок із перевіреним потоком', 'Для CVD20 потрібні 20 свічок із перевіреним потоком', 'CVD20 needs 20 candles with verified trade flow', 'Для CVD20 нужны 20 свечей с проверенным потоком', 'CVD20 wymaga 20 świec ze zweryfikowanym przepływem'],
  ['Круглий рівень поза допустимою зоною', 'Круглий рівень поза допустимою зоною', 'Round price is outside the required range', 'Круглый уровень вне допустимой зоны', 'Okrągły poziom jest poza dozwolonym zakresem'],
  ['Стакан не покриває рівень або знімок недоступний', 'Стакан не покриває рівень або знімок недоступний', 'The order book does not cover this level or its snapshot is unavailable', 'Стакан не покрывает уровень или снимок недоступен', 'Arkusz zleceń nie obejmuje tego poziomu lub migawka jest niedostępna'],
  ['Вхід очікує досягнення заданої ціни', 'Вхід очікує досягнення заданої ціни', 'Entry is waiting for the selected price', 'Вход ожидает достижения заданной цены', 'Wejście oczekuje osiągnięcia wybranej ceny'],
  ['Співвідношення R:R за останнім закриттям нижче 2.0', 'Співвідношення R:R за останнім закриттям нижче 2.0', 'R:R at the latest close is below 2.0', 'Соотношение R:R по последнему закрытию ниже 2.0', 'Współczynnik R:R na ostatnim zamknięciu jest poniżej 2,0'],
  ['Дотики за правилами профілю ще не підтверджено', 'Дотики за правилами профілю ще не підтверджено', 'Touches required by the profile rules still await confirmation', 'Касания по правилам профиля ещё не подтверждены', 'Dotknięcia wymagane przez reguły profilu nadal czekają na potwierdzenie'],
  ['Крок ціни біржі недоступний', 'Крок ціни біржі недоступний', 'Exchange price tick is unavailable', 'Шаг цены биржи недоступен', 'Krok ceny giełdy jest niedostępny'],
  [
    "Бичачий прапор (Флагшток)",
    "Бичачий прапор (Флагшток)",
    "Bull flag (flagpole)",
    "Бычий флаг (флагшток)",
    "Flaga byka (maszt)"
  ],
  [
    "Ведмежий прапор",
    "Ведмежий прапор",
    "Bear flag",
    "Медвежий флаг",
    "Flaga niedźwiedzia"
  ],
  [
    "Ретест пробитого рівня",
    "Ретест пробитого рівня",
    "Retest of broken level",
    "Ретест пробитого уровня",
    "Retest wybitego poziomu"
  ],
  [
    "Пробій ключового опору",
    "Пробій ключового опору",
    "Key resistance breakout",
    "Пробой ключевого сопротивления",
    "Wybicie kluczowego oporu"
  ],
  [
    "Молот / Бичачий пін-бар",
    "Молот / Бичачий пін-бар",
    "Hammer / bullish pin bar",
    "Молот / бычий пин-бар",
    "Młot / byczy pin bar"
  ],
  [
    "Падаюча зірка (Пін-бар)",
    "Падаюча зірка (Пін-бар)",
    "Shooting star (pin bar)",
    "Падающая звезда (пин-бар)",
    "Spadająca gwiazda (pin bar)"
  ],
  [
    "Бичаче поглинання",
    "Бичаче поглинання",
    "Bullish engulfing",
    "Бычье поглощение",
    "Objęcie hossy"
  ],
  [
    "Ведмеже поглинання",
    "Ведмеже поглинання",
    "Bearish engulfing",
    "Медвежье поглощение",
    "Objęcie bessy"
  ],
  [
    "Ф'ючерси",
    "Ф'ючерси",
    "Futures",
    "Фьючерсы",
    "Kontrakty futures"
  ],
  [
    "Спот",
    "Спот",
    "Spot",
    "Спот",
    "Spot"
  ],
  [
    "КРУГЛИЙ РІВЕНЬ",
    "КРУГЛИЙ РІВЕНЬ",
    "ROUND",
    "КРУГЛЫЙ УРОВЕНЬ",
    "OKRĄGŁY POZIOM"
  ],
  [
    "КРУГЛИЙ + ЩІЛЬНІСТЬ",
    "КРУГЛИЙ + ЩІЛЬНІСТЬ",
    "ROUND + DENSITY",
    "УРОВЕНЬ + ПЛОТНОСТЬ",
    "POZIOM + ZLECENIE"
  ],
  [
    "ціна далеко від входу, очікуйте ретест",
    "ціна далеко від входу, очікуйте ретест",
    "price far from entry; wait for retest",
    "цена далеко от входа; ожидайте ретест",
    "cena daleko od wejścia; czekaj na retest"
  ],
  [
    "Підтверджений breakout",
    "Підтверджений breakout",
    "Confirmed breakout",
    "Подтверждённый пробой",
    "Potwierdzone wybicie"
  ],
  [
    "Retest рівня",
    "Retest рівня",
    "Level retest",
    "Ретест уровня",
    "Retest poziomu"
  ],
  [
    "Підтвердження обсягом",
    "Підтвердження обсягом",
    "Volume confirmation",
    "Подтверждение объёмом",
    "Potwierdzenie wolumenem"
  ],
  [
    "Підтвердження обсягом свічки пробою",
    "Підтвердження обсягом свічки пробою",
    "Breakout-candle volume confirmation",
    "Подтверждение объёмом свечи пробоя",
    "Potwierdzenie wolumenem świecy wybicia"
  ],
  [
    "Формація не знаходиться в підтвердженій зоні екстремуму",
    "Формація не знаходиться в підтвердженій зоні екстремуму",
    "Formation is outside the confirmed extreme zone",
    "Формация вне подтверждённой зоны экстремума",
    "Formacja poza potwierdzoną strefą ekstremum"
  ],
  [
    "Надмірна волатильність",
    "Надмірна волатильність",
    "Excessive volatility",
    "Чрезмерная волатильность",
    "Nadmierna zmienność"
  ],
  [
    "Порушена look-ahead/closed-candle перевірка",
    "Порушена look-ahead/closed-candle перевірка",
    "Look-ahead / closed-candle validation failed",
    "Ошибка проверки look-ahead / закрытых свечей",
    "Błąd weryfikacji look-ahead / zamkniętych świec"
  ],
  [
    "Є sweep релевантного екстремуму",
    "Є sweep релевантного екстремуму",
    "Relevant extreme sweep detected",
    "Зафиксирован захват ликвидности у экстремума",
    "Wykryto sweep odpowiedniego ekstremum"
  ],
  [
    "Breakout підтверджено ретестом",
    "Breakout підтверджено ретестом",
    "Breakout confirmed by retest",
    "Пробой подтверждён ретестом",
    "Wybicie potwierdzone retestem"
  ],
  [
    "Breakout підтверджено ретестом того самого рівня",
    "Breakout підтверджено ретестом того самого рівня",
    "Breakout confirmed by retest of the same level",
    "Пробой подтверждён ретестом того же уровня",
    "Wybicie potwierdzone retestem tego samego poziomu"
  ],
  [
    "Немає extreme context",
    "Немає extreme context",
    "No extreme context",
    "Нет контекста экстремума",
    "Brak kontekstu ekstremum"
  ],
  [
    "Закритий breakout підтверджено",
    "Закритий breakout підтверджено",
    "Closed-candle breakout confirmed",
    "Пробой по закрытой свече подтверждён",
    "Wybicie na zamkniętej świecy potwierdzone"
  ],
  [
    "Breakout не підтверджено",
    "Breakout не підтверджено",
    "Breakout not confirmed",
    "Пробой не подтверждён",
    "Wybicie niepotwierdzone"
  ],
  [
    "Рівень пробою повторно протестовано й утримано",
    "Рівень пробою повторно протестовано й утримано",
    "Breakout level retested and held",
    "Уровень пробоя повторно протестирован и удержан",
    "Poziom wybicia ponownie przetestowany i utrzymany"
  ],
  [
    "Breakout є, але ретест ще не підтверджений",
    "Breakout є, але ретест ще не підтверджений",
    "Breakout detected, retest unconfirmed",
    "Пробой есть, но ретест не подтверждён",
    "Wybicie wykryte, retest niepotwierdzony"
  ],
  [
    "Retest неможливий без breakout",
    "Retest неможливий без breakout",
    "Retest requires a breakout",
    "Ретест невозможен без пробоя",
    "Retest wymaga wybicia"
  ],
  [
    "Після пробою ціна перевірила той самий рівень і закрилася на правильному боці",
    "Після пробою ціна перевірила той самий рівень і закрилася на правильному боці",
    "Price retested the same level and closed on the correct side",
    "После пробоя цена проверила тот же уровень и закрылась с нужной стороны",
    "Cena przetestowała ten sam poziom i zamknęła się po właściwej stronie"
  ],
  [
    "Пробій без підтвердженого ретесту рівня",
    "Пробій без підтвердженого ретесту рівня",
    "Breakout without confirmed level retest",
    "Пробой без подтверждённого ретеста уровня",
    "Wybicie bez potwierdzonego retestu poziomu"
  ],
  [
    "Ретест потребує пробою",
    "Ретест потребує пробою",
    "Retest requires a breakout",
    "Для ретеста нужен пробой",
    "Retest wymaga wybicia"
  ],
  [
    "свічка пробою",
    "свічка пробою",
    "breakout candle",
    "свеча пробоя",
    "świeca wybicia"
  ],
  [
    "без підтвердженого пробою",
    "без підтвердженого пробою",
    "without confirmed breakout",
    "без подтверждённого пробоя",
    "bez potwierdzonego wybicia"
  ],
  [
    "Немає підтвердженого рівня пробою",
    "Немає підтвердженого рівня пробою",
    "No confirmed breakout level",
    "Нет подтверждённого уровня пробоя",
    "Brak potwierdzonego poziomu wybicia"
  ],
  [
    "R:R {{ratio}} нижче мінімуму {{min}}",
    "R:R {{ratio}} нижче мінімуму {{min}}",
    "R:R {{ratio}} below minimum {{min}}",
    "R:R {{ratio}} ниже минимума {{min}}",
    "R:R {{ratio}} poniżej minimum {{min}}"
  ],
  [
    "Якість геометрії/формації: {{score}}/100",
    "Якість геометрії/формації: {{score}}/100",
    "Pattern geometry quality: {{score}}/100",
    "Качество геометрии/формации: {{score}}/100",
    "Jakość geometrii formacji: {{score}}/100"
  ],
  [
    "Найближчий ключовий рівень: {{pct}}%",
    "Найближчий ключовий рівень: {{pct}}%",
    "Nearest key level: {{pct}}%",
    "Ближайший ключевой уровень: {{pct}}%",
    "Najbliższy kluczowy poziom: {{pct}}%"
  ],
  [
    "Відстань до рівня опору / шиї: {{pct}}%",
    "Відстань до рівня опору / шиї: {{pct}}%",
    "Distance to resistance / neckline: {{pct}}%",
    "Расстояние до сопротивления / линии шеи: {{pct}}%",
    "Odległość do oporu / linii szyi: {{pct}}%"
  ],
  [
    "Відстань до рівня підтримки / шиї: {{pct}}%",
    "Відстань до рівня підтримки / шиї: {{pct}}%",
    "Distance to support / neckline: {{pct}}%",
    "Расстояние до поддержки / линии шеи: {{pct}}%",
    "Odległość do wsparcia / linii szyi: {{pct}}%"
  ],
  [
    "{{count}} підтверджених тестів екстремуму",
    "{{count}} підтверджених тестів екстремуму",
    "{{count}} confirmed extreme tests",
    "{{count}} подтверждённых тестов экстремума",
    "{{count}} potwierdzonych testów ekstremum"
  ],
  [
    "{{role}}; відстань {{pct}}%; підхід {{approach}}; сила {{strength}}/100",
    "{{role}}; відстань {{pct}}%; підхід {{approach}}; сила {{strength}}/100",
    "{{role}}; distance {{pct}}%; approach {{approach}}; strength {{strength}}/100",
    "{{role}}; расстояние {{pct}}%; подход {{approach}}; сила {{strength}}/100",
    "{{role}}; odległość {{pct}}%; podejście {{approach}}; siła {{strength}}/100"
  ],
  [
    "UPPER_EXTREME",
    "Верхній екстремум",
    "Upper extreme",
    "Верхний экстремум",
    "Górne ekstremum"
  ],
  [
    "LOWER_EXTREME",
    "Нижній екстремум",
    "Lower extreme",
    "Нижний экстремум",
    "Dolne ekstremum"
  ],
  [
    "MID_RANGE",
    "Середина діапазону",
    "Middle of range",
    "Середина диапазона",
    "Środek zakresu"
  ],
  [
    "APPROACHING",
    "Наближення",
    "Approaching",
    "Приближение",
    "Zbliżanie"
  ],
  [
    "TESTING",
    "Тестування",
    "Testing",
    "Тестирование",
    "Testowanie"
  ],
  [
    "REJECTING",
    "Відбій",
    "Rejection",
    "Отбой",
    "Odrzucenie"
  ],
  [
    "BREAKING",
    "Пробій",
    "Breaking through",
    "Пробой",
    "Przebicie"
  ],
  [
    "MOVING_AWAY",
    "Віддалення",
    "Moving away",
    "Удаление",
    "Oddalanie"
  ],
  [
    "NEUTRAL",
    "Нейтрально",
    "Neutral",
    "Нейтрально",
    "Neutralnie"
  ],
  [
    "ATR/price {{pct}}%",
    "ATR/ціна {{pct}}%",
    "ATR/price {{pct}}%",
    "ATR/цена {{pct}}%",
    "ATR/cena {{pct}}%"
  ],
  [
    "data={{data}}, candles={{candles}}, lookAhead={{lookAhead}}, closed={{closed}}",
    "дані={{data}}, свічки={{candles}}, lookAhead={{lookAhead}}, закриті={{closed}}",
    "data={{data}}, candles={{candles}}, lookAhead={{lookAhead}}, closed={{closed}}",
    "данные={{data}}, свечи={{candles}}, lookAhead={{lookAhead}}, закрытие={{closed}}",
    "dane={{data}}, świece={{candles}}, lookAhead={{lookAhead}}, zamknięcie={{closed}}"
  ]
] as const;

const languages: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const formationRuntimePhrases = Object.fromEntries(
  languages.map((language, index) => [
    language,
    Object.fromEntries(formationRuntimeRows.map(row => [row[0], row[index + 1]])),
  ]),
) as Record<SupportedLanguage, Record<string, string>>;
