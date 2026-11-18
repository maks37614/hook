/** 2026-11-15 audit: educational copy and source disclaimers. */
import type { SupportedLanguage } from './types';
const rows = [
  [
    "Без бази — немає входу",
    "No base — no entry",
    "Нет базы — нет входа",
    "Brak bazy — brak wejścia"
  ],
  [
    "Скальпінг / Правила",
    "Scalping / Rules",
    "Скальпинг / Правила",
    "Skalping / Zasady"
  ],
  [
    "Правила торгівлі",
    "Trading rules",
    "Правила торговли",
    "Zasady handlu"
  ],
  [
    "Структурований навчальний регламент за 10-сторінковим документом «Свод правил»: відбір сетапів, рівні, проторговки, каскади, одиночний хай і похилі лінії.",
    "Structured learning guide based on the 10-page “Свод правил” document: selecting setups, levels, consolidation bases, cascades, isolated highs and trendlines.",
    "Структурированный учебный регламент по 10-страничному документу «Свод правил»: отбор сетапов, уровни, проторговки, каскады, одиночный хай и наклонные линии.",
    "Ustrukturyzowany poradnik na podstawie 10-stronicowego dokumentu „Свод правил”: wybór setupów, poziomy, konsolidacje, kaskady, pojedynczy szczyt i linie trendu."
  ],
  [
    "Це особистий регламент із документа, а не універсальна система. «1 сетап — 1 спроба» та інші суворі правила наведено як авторські обмеження.",
    "This is a personal rulebook from the document, not a universal system. “1 setup — 1 attempt” and similar strict rules are the author's own limits.",
    "Это личный регламент из документа, а не универсальная система. «1 сетап — 1 попытка» и другие строгие правила приведены как авторские ограничения.",
    "To osobisty regulamin z dokumentu, a nie system uniwersalny. „1 setup — 1 próba” i podobne surowe zasady są ograniczeniami autora."
  ],
  [
    "Уточнення чисел:",
    "Note on values:",
    "Уточнение чисел:",
    "Uwaga dotycząca wartości:"
  ],
  [
    "значення «0,35» та «0,3» з PDF залишені дослівно за змістом, але їхні одиниці автор не вказав. Без уточнення їх не можна використовувати як готовий відсоток стопа.",
    "The values “0,35” and “0,3” from the PDF are retained, but the author did not specify their units. Do not treat them as stop percentages without clarification.",
    "Значения «0,35» и «0,3» из PDF сохранены, но автор не указал их единицы. Без уточнения нельзя считать их готовыми процентами стопа.",
    "Wartości „0,35” i „0,3” z PDF zachowano, lecz autor nie podał jednostek. Bez wyjaśnienia nie można ich używać jako procentu stop-lossa."
  ],
  [
    "Ключове правило:",
    "Key rule:",
    "Ключевое правило:",
    "Kluczowa zasada:"
  ],
  [
    "без проторговки — одна спроба в рівень, тільки коли свічка відкрилася на ньому. Інакше це не відповідний сетап.",
    "Without a consolidation base — one attempt at the level, only if a candle opened at it. Otherwise it is not a qualifying setup.",
    "Без проторговки — одна попытка у уровня, только когда свеча открылась на нём. Иначе сетап не подходит.",
    "Bez konsolidacji — jedna próba na poziomie, tylko jeśli świeca otworzyła się na nim. W przeciwnym razie setup nie spełnia zasad."
  ],
  [
    "Обмеження:",
    "Limitations:",
    "Ограничения:",
    "Ograniczenia:"
  ],
  [
    "у широких каскадах без чіткої бази автор радить очікувати нову проторговку замість довільного входу між хаями.",
    "For wide cascades without a clear base, the author advises waiting for a new consolidation rather than entering between highs.",
    "В широких каскадах без чёткой базы автор советует ждать новую проторговку, а не входить между хаями.",
    "Przy szerokich kaskadach bez wyraźnej bazy autor zaleca czekać na nową konsolidację zamiast wchodzić między szczytami."
  ],
  [
    "молодші таймфрейми в прикладах деталізують той самий рівень, але не замінюють читабельної базової формації.",
    "Lower timeframes in the examples refine the same level but do not replace a clear base formation.",
    "Младшие таймфреймы в примерах уточняют тот же уровень, но не заменяют читаемую базовую формацию.",
    "Niższe interwały w przykładach precyzują ten sam poziom, ale nie zastępują wyraźnej formacji bazowej."
  ],
  [
    "Припини натягувати нахилку:",
    "Stop forcing the trendline:",
    "Не натягивай наклонную:",
    "Nie naciągaj linii trendu:"
  ],
  [
    "коли нових хаїв немає і ціна переходить у боковик. Познач верхню та нижню межі й чекай більшої структури.",
    "when no new highs form and price enters a range. Mark the upper and lower boundaries and wait for a larger structure.",
    "когда новых хаёв нет и цена уходит в боковик. Отметь верхнюю и нижнюю границы и дождись более крупной структуры.",
    "gdy nie ma nowych szczytów, a cena przechodzi w konsolidację. Oznacz górną i dolną granicę i poczekaj na większą strukturę."
  ],
  [
    "Словник позначень",
    "Glossary of terms",
    "Словарь обозначений",
    "Słownik pojęć"
  ],
  [
    "Навчальна адаптація наданого PDF. Усі графіки перемальовані як умовні схеми, а не копії біржових даних. Правила не є індивідуальною інвестиційною рекомендацією.",
    "Educational adaptation of the supplied PDF. Charts are redrawn as schematic illustrations, not copies of exchange data. These rules are not personalized investment advice.",
    "Учебная адаптация предоставленного PDF. Все графики перерисованы как условные схемы, а не копии биржевых данных. Правила не являются индивидуальной инвестиционной рекомендацией.",
    "Edukacyjna adaptacja dostarczonego PDF. Wszystkie wykresy przerysowano jako schematy, a nie kopie danych giełdowych. Zasady nie są indywidualną poradą inwestycyjną."
  ],
  [
    "Умовна схема логіки, не реальний графік з документа",
    "Illustrative diagram, not an actual chart from the document",
    "Условная схема логики, не реальный график из документа",
    "Schemat poglądowy, nie rzeczywisty wykres z dokumentu"
  ],
  [
    "Скальпінг / Котапич",
    "Scalping / Kotapych",
    "Скальпинг / Котапыч",
    "Skalping / Kotapych"
  ],
  [
    "Торгова методика «Котапич»",
    "Kotapych trading methodology",
    "Торговая методика «Котапыч»",
    "Metodyka handlu „Kotapych”"
  ],
  [
    "Чотири сетапи та поглиблений систематизований аналіз контексту, ліквідності, обсягів, ризику й прикладів із двох документів.",
    "Four setups and a systematic analysis of market context, liquidity, volume, risk, and examples from two documents.",
    "Четыре сетапа и углублённый системный анализ контекста, ликвидности, объёмов, рисков и примеров из двух документов.",
    "Cztery setupy oraz pogłębiona analiza kontekstu, płynności, wolumenu, ryzyka i przykładów z dwóch dokumentów."
  ],
  [
    "Основна ідея: шукати підтверджену реакцію ринку на межі проторговки, оцінювати швидкість руху, обсяги та поведінку покупців і продавців. Прокол ліквідності — лише частина контексту.",
    "Core idea: look for a confirmed market reaction at a consolidation boundary, then assess speed, volume, and buyer/seller behavior. A liquidity sweep is only one part of the context.",
    "Основная идея: искать подтверждённую реакцию рынка на границе проторговки, оценивать скорость движения, объёмы и поведение покупателей и продавцов. Снятие ликвидности — лишь часть контекста.",
    "Główna idea: szukaj potwierdzonej reakcji rynku przy granicy konsolidacji, oceniając tempo ruchu, wolumen i zachowanie kupujących oraz sprzedających. Zebranie płynności to tylko część kontekstu."
  ],
  [
    "Відкрити аналіз",
    "Open analysis",
    "Открыть анализ",
    "Otwórz analizę"
  ],
  [
    "Відсотки прибутковості та співвідношення R:R у файлах — особисті приклади автора, не підтверджені бектестом. Ризик кожної угоди розраховується окремо.",
    "Return percentages and R:R ratios in the files are the author's personal examples, not backtest-verified. Each trade's risk is calculated separately.",
    "Проценты доходности и соотношения R:R в файлах — личные примеры автора, не подтверждённые бэктестом. Риск каждой сделки рассчитывается отдельно.",
    "Procenty zysku i R:R w plikach to osobiste przykłady autora, niepotwierdzone testem historycznym. Ryzyko każdej transakcji liczy się osobno."
  ],
  [
    "Навчальна енциклопедія. Не є індивідуальною інвестиційною рекомендацією.",
    "Educational encyclopedia. Not personalized investment advice.",
    "Учебная энциклопедия. Не является индивидуальной инвестиционной рекомендацией.",
    "Encyklopedia edukacyjna. Nie stanowi indywidualnej porady inwestycyjnej."
  ],
  [
    "Різке зростання OI може свідчити про накопичення позицій натовпом. Перевір, чи не формується пастка, розворот або наступний винос; не відкривай контртрендову угоду лише за високим OI.",
    "A sharp OI rise may indicate crowded positions. Check for a trap, reversal, or liquidation sweep; do not enter a countertrend trade solely on high OI.",
    "Резкий рост OI может означать скопление позиций. Проверь, не формируется ли ловушка, разворот или вынос; не входи против тренда только из-за высокого OI.",
    "Gwałtowny wzrost OI może oznaczać zatłoczone pozycje. Sprawdź, czy nie tworzy się pułapka, odwrócenie lub ruch likwidacyjny; nie graj przeciw trendowi wyłącznie z powodu wysokiego OI."
  ],
  [
    "У матеріалі згадані",
    "The material mentions",
    "В материале упомянуты",
    "W materiale wspomniano"
  ],
  [
    "(доступність OI залежить від інструмента),",
    "(OI availability depends on the instrument),",
    "(доступность OI зависит от инструмента),",
    "(dostępność OI zależy od instrumentu),"
  ],
  [
    "→ відкритих контрактів стає більше → рух може продовжитися, але напрямок сам OI не визначає.",
    "→ more contracts remain open → the move may continue, but OI alone does not indicate direction.",
    "→ открытых контрактов становится больше → движение может продолжиться, но сам OI не определяет направление.",
    "→ rośnie liczba otwartych kontraktów → ruch może trwać dalej, ale sam OI nie określa kierunku."
  ],
  [
    "→ відкритих контрактів стає менше → рух може виснажуватися, але розворот не гарантований.",
    "→ fewer contracts remain open → momentum may weaken, but reversal is not guaranteed.",
    "→ открытых контрактов становится меньше → движение может ослабевать, но разворот не гарантирован.",
    "→ maleje liczba otwartych kontraktów → ruch może słabnąć, ale odwrócenie nie jest gwarantowane."
  ]
] as const;
const languages: SupportedLanguage[] = ['uk','en','ru','pl'];
export const audit20261115Encyclopedia = Object.fromEntries(languages.map((lang,i)=>[lang,Object.fromEntries(rows.map(row=>[row[0],row[i]]))])) as Record<SupportedLanguage,Record<string,string>>;
export const audit20261115EncyclopediaRows = rows;
