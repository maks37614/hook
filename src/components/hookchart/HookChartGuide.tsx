import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import './hookChartGuide.css';

type GuideLanguage = 'uk' | 'en' | 'pl' | 'ru';
type StepKey = 'timeframe' | 'cursor' | 'drawing' | 'measure' | 'candles' | 'price' | 'indicators' | 'liq' | 'stats' | 'settings';
type AdvancedStepKey = 'liqVisibility' | 'liqSums' | 'liqLong' | 'liqShort' | 'liqThreshold' | 'liqPanel' | 'marketPrints'
  | 'levelsIntervals' | 'levelsLabels' | 'levelsAppearance'
  | 'densityEnable' | 'densityDisplay' | 'densityThreshold' | 'densityAuto'
  | 'liqMapToggle' | 'liqMapPeriod' | 'liqMapModel';
type GuideStepKey = StepKey | AdvancedStepKey;
type GuideTab = 'main' | 'levels';
type GuideStep = { key: GuideStepKey; selector: string; tab?: GuideTab; chapter: 'basics' | 'liq' | 'levels' | 'density' | 'map' };
const setting = (label: string) => '[data-hookchart-guide-setting="' + label + '"]';
const GUIDE_STEPS: readonly GuideStep[] = [
  { key: 'timeframe', selector: '.hookchart-timeframes', chapter: 'basics' },
  { key: 'cursor', selector: '[data-hookchart-guide-tool="cursor"]', chapter: 'basics' },
  { key: 'drawing', selector: '[data-hookchart-guide-tool="trend"]', chapter: 'basics' },
  { key: 'measure', selector: '[data-hookchart-guide-tool="ruler"]', chapter: 'basics' },
  { key: 'candles', selector: '.chartCanvasSurface', chapter: 'basics' },
  { key: 'price', selector: '.chartCanvasSurface', chapter: 'basics' },
  { key: 'indicators', selector: '[data-hookchart-guide="indicators"]', chapter: 'basics' },
  { key: 'liq', selector: '.liqRiskHud', chapter: 'basics' },
  { key: 'stats', selector: '.marketStatsBar', chapter: 'basics' },
  { key: 'settings', selector: '.chartSettingsBtn', chapter: 'basics' },

  { key: 'liqVisibility', selector: setting('Ліквідації на графіку'), tab: 'main', chapter: 'liq' },
  { key: 'liqSums', selector: setting('Показувати суми Liq під свічками'), tab: 'main', chapter: 'liq' },
  { key: 'liqLong', selector: setting('Long (L)'), tab: 'main', chapter: 'liq' },
  { key: 'liqShort', selector: setting('Short (S)'), tab: 'main', chapter: 'liq' },
  { key: 'liqThreshold', selector: setting('Мінімальна сума Long (USD)'), tab: 'main', chapter: 'liq' },
  { key: 'liqPanel', selector: setting('Блок Liq + каскад'), tab: 'main', chapter: 'liq' },
  { key: 'marketPrints', selector: setting('Показувати суми великих ринкових заявок під свічками'), tab: 'main', chapter: 'liq' },

  { key: 'levelsIntervals', selector: setting('Таймфрейми автовизначення рівнів'), tab: 'levels', chapter: 'levels' },
  { key: 'levelsLabels', selector: setting('Підписи рівнів'), tab: 'levels', chapter: 'levels' },
  { key: 'levelsAppearance', selector: setting('Тип міток рівнів'), tab: 'levels', chapter: 'levels' },

  { key: 'densityEnable', selector: setting('Аналіз великих лімітних заявок (щільностей)'), tab: 'main', chapter: 'density' },
  { key: 'densityDisplay', selector: setting('Щільності на графіку'), tab: 'main', chapter: 'density' },
  { key: 'densityThreshold', selector: setting('Пороговий об’єм великих ордерів'), tab: 'main', chapter: 'density' },
  { key: 'densityAuto', selector: setting('Що показувати в AUTO'), tab: 'main', chapter: 'density' },

  { key: 'liqMapToggle', selector: '.liqHeatmapSwitch', chapter: 'map' },
  { key: 'liqMapPeriod', selector: '.liqHeatmapTools', chapter: 'map' },
  { key: 'liqMapModel', selector: setting('Прогнозні зони Liq · модель за історією'), tab: 'main', chapter: 'map' },
];

type StepText = { title: string; description: string };
type GuideCopy = {
  name: string;
  close: string;
  back: string;
  next: string;
  done: string;
  step: string;
  of: string;
  safe: string;
  steps: Record<StepKey, StepText>;
};

const COPY: Record<GuideLanguage, GuideCopy> = {
  uk: {
    name: 'Гайд по HookChart', close: 'Закрити гайд', back: 'Назад', next: 'Далі', done: 'Завершити',
    step: 'Крок', of: 'із', safe: 'Гайд не змінює параметри сам. Ви можете натискати підсвічені перемикачі.',
    steps: {
      timeframe: { title: 'Таймфрейми', description: 'Оберіть інтервал свічок: 1м, 5м, 15м, 1г тощо. Кожна свічка показує рух ціни за цей час.' },
      cursor: { title: 'Курсор і лупа', description: 'Курсор допомагає переглядати ціну та час. На телефоні коротке утримання показує курсор, довше нерухоме — лупу для точного вибору точки.' },
      drawing: { title: 'Інструменти малювання', description: 'Лінія тренду, горизонтальний рівень, прямокутник і Фібоначчі допомагають позначати зони. Після створення мітку можна редагувати або видалити.' },
      measure: { title: 'Вимірювання', description: 'Інструмент-лінійка показує зміну ціни у відсотках і проміжок часу. Точки вимірювання можна пересувати.' },
      candles: { title: 'Свічки та обсяг', description: 'Зелені й червоні свічки відображають зміну ціни. Стовпчики внизу — торговий обсяг. Пересувайте графік пальцем або мишею, масштабуйте двома пальцями.' },
      price: { title: 'Шкала ціни', description: 'Праворуч розташована шкала цін. Її можна використати для зміни вертикального масштабу; подвійний дотик повертає автоматичний масштаб.' },
      indicators: { title: 'Індикатори', description: 'Тут вмикаються додаткові показники, наприклад обсяг і Open Interest, якщо вони доступні для обраного ринку.' },
      liq: { title: 'Ліквідації (Liq)', description: 'Цей блок показує отримані події ліквідацій і стан каскаду. Це ринкові спостереження, а не прогноз майбутніх ліквідацій.' },
      stats: { title: 'Статистика ринку', description: 'Під графіком доступні обсяг за 24 години, максимум, мінімум, кореляція BTC та інші поточні показники.' },
      settings: { title: 'Налаштування HookChart', description: 'Тут змінюються вигляд графіка, кольори, інструменти та інші параметри. Гайд не змінює їх автоматично.' },
    },
  },
  en: {
    name: 'HookChart tour', close: 'Close tour', back: 'Back', next: 'Next', done: 'Finish',
    step: 'Step', of: 'of', safe: 'The tour does not change settings by itself. You can use the highlighted switches.',
    steps: {
      timeframe: { title: 'Timeframes', description: 'Choose a candle interval, such as 1m, 5m, 15m or 1h. Each candle shows price movement during that interval.' },
      cursor: { title: 'Cursor and magnifier', description: 'Inspect price and time with the cursor. On touchscreens, a short hold activates the cursor; a longer still hold opens the magnifier for accurate placement.' },
      drawing: { title: 'Drawing tools', description: 'Trend lines, horizontal levels, rectangles and Fibonacci levels mark areas of interest. You can edit or remove your drawings afterwards.' },
      measure: { title: 'Measure', description: 'The ruler shows percentage price movement and elapsed time. Its endpoints can be adjusted.' },
      candles: { title: 'Candles and volume', description: 'Green and red candles show price action; columns below show trading volume. Drag to move through history and pinch to zoom.' },
      price: { title: 'Price scale', description: 'The right-hand axis shows prices. Adjust the vertical scale here; double-tap it to restore auto-scaling.' },
      indicators: { title: 'Indicators', description: 'Enable additional measures such as volume and Open Interest when supported by the selected market.' },
      liq: { title: 'Liquidations (Liq)', description: 'The Liq panel displays received liquidation events and cascade status. These are observations, not predictions.' },
      stats: { title: 'Market statistics', description: 'Below the chart are 24h volume, high, low, BTC correlation and other current market metrics.' },
      settings: { title: 'HookChart settings', description: 'Adjust chart appearance, colors, tools and other preferences here. The tour changes none of them.' },
    },
  },
  pl: {
    name: 'Przewodnik po HookChart', close: 'Zamknij przewodnik', back: 'Wstecz', next: 'Dalej', done: 'Zakończ',
    step: 'Krok', of: 'z', safe: 'Przewodnik sam nie zmienia ustawień. Możesz używać podświetlonych przełączników.',
    steps: {
      timeframe: { title: 'Interwały', description: 'Wybierz interwał świec, np. 1m, 5m, 15m lub 1h. Każda świeca pokazuje ruch ceny w tym czasie.' },
      cursor: { title: 'Kursor i lupa', description: 'Kursor pokazuje cenę i czas. Krótkie przytrzymanie palca włącza kursor, a dłuższe bez ruchu — lupę do dokładnego umieszczania punktów.' },
      drawing: { title: 'Narzędzia rysowania', description: 'Linie trendu, poziomy, prostokąty i Fibonacci pomagają oznaczać strefy. Rysunki można później edytować i usuwać.' },
      measure: { title: 'Pomiar', description: 'Linijka pokazuje zmianę ceny w procentach i upływ czasu. Można przesuwać jej punkty.' },
      candles: { title: 'Świece i wolumen', description: 'Zielone i czerwone świece pokazują zmiany ceny, a słupki u dołu — wolumen. Przesuń wykres lub powiększ go gestem szczypania.' },
      price: { title: 'Skala ceny', description: 'Po prawej stronie znajduje się skala ceny. Można zmieniać skalę pionową, a dwukrotne dotknięcie przywraca autoskalowanie.' },
      indicators: { title: 'Wskaźniki', description: 'Włącz dodatkowe dane, np. wolumen i Open Interest, jeśli są dostępne dla wybranego rynku.' },
      liq: { title: 'Likwidacje (Liq)', description: 'Panel pokazuje odebrane likwidacje i stan kaskady. To obserwacje rynku, nie prognoza.' },
      stats: { title: 'Statystyki rynku', description: 'Pod wykresem znajdziesz wolumen 24h, maksimum, minimum, korelację BTC i inne wskaźniki.' },
      settings: { title: 'Ustawienia HookChart', description: 'Dostosuj wygląd wykresu, kolory i narzędzia. Przewodnik niczego nie zmienia.' },
    },
  },
  ru: {
    name: 'Гид по HookChart', close: 'Закрыть гид', back: 'Назад', next: 'Далее', done: 'Завершить',
    step: 'Шаг', of: 'из', safe: 'Сам гид не меняет настройки. Вы можете нажимать подсвеченные переключатели.',
    steps: {
      timeframe: { title: 'Таймфреймы', description: 'Выберите интервал свечей: 1м, 5м, 15м, 1ч и т. д. Каждая свеча показывает изменение цены за этот период.' },
      cursor: { title: 'Курсор и лупа', description: 'Курсор показывает цену и время. Короткое удержание пальца включает курсор, более долгое без движения — лупу для точной установки точки.' },
      drawing: { title: 'Инструменты рисования', description: 'Линии тренда, уровни, прямоугольники и Фибоначчи помогают размечать зоны. Метки можно редактировать и удалять.' },
      measure: { title: 'Измерение', description: 'Линейка показывает изменение цены в процентах и прошедшее время. Её точки можно передвигать.' },
      candles: { title: 'Свечи и объём', description: 'Зелёные и красные свечи отображают движение цены, столбцы снизу — торговый объём. Перемещайте график и масштабируйте двумя пальцами.' },
      price: { title: 'Шкала цены', description: 'Справа расположена шкала цены. Здесь можно менять вертикальный масштаб, двойное касание восстанавливает автомасштаб.' },
      indicators: { title: 'Индикаторы', description: 'Включайте дополнительные показатели, например объём и Open Interest, если они доступны на выбранном рынке.' },
      liq: { title: 'Ликвидации (Liq)', description: 'Блок показывает полученные события ликвидаций и состояние каскада. Это наблюдения, а не прогноз.' },
      stats: { title: 'Статистика рынка', description: 'Под графиком находятся объём за 24 часа, максимум, минимум, корреляция BTC и другие показатели.' },
      settings: { title: 'Настройки HookChart', description: 'Здесь настраиваются внешний вид графика, цвета и инструменты. Гид ничего не меняет.' },
    },
  },
};


const ADVANCED: Record<GuideLanguage, Record<AdvancedStepKey, StepText>> = {
  uk: {
    liqVisibility: { title: 'Увімкнути / приховати Liq', description: 'Шестерня → Основні → Ліквідації → «Ліквідації на графіку». Вимкнення приховує позначки ліквідацій та суми під свічками, але не змінює отримані біржові події.' },
    liqSums: { title: 'Суми Liq під свічками', description: 'Окремий перемикач «Показувати суми Liq під свічками» приховує або показує числові підписи у USD та L/S. Коли його вимкнено, малі маркери залишаються. Головний Liq вимикає обидва.' },
    liqLong: { title: 'Ліквідації Long', description: '«Long (L)» показує або приховує примусове закриття довгих позицій. Це не лонгові входи. Перемикач не змінює незалежний загальний лічильник Liq.' },
    liqShort: { title: 'Ліквідації Short', description: '«Short (S)» окремо керує позначками примусово закритих коротких позицій. Обидва типи можна відображати разом або окремо.' },
    liqThreshold: { title: 'Пороги сум ліквідацій', description: 'Для Long і Short є свої поля «Мінімальна сума ... (USD)». Порожньо — автоматичний поріг, 0 — усі отримані події, число — лише суми не менші за нього. Нижче є аналогічне поле для Short.' },
    liqPanel: { title: 'Лічильник Liq і каскад', description: '«Блок Liq + каскад» керує інформаційною панеллю на графіку. Її стрілка згортає деталі. Значення Liq — сума унікальних отриманих подій за сесію, незалежно від порогів видимості.' },
    marketPrints: { title: 'Не плутайте з ринковими заявками', description: '«Суми великих ринкових заявок під свічками» показує великі виконані BUY/SELL-угоди. Це НЕ ліквідації. Для сум Liq використовуйте окремий перемикач у розділі «Ліквідації».' },
    levelsIntervals: { title: 'Мітки рівнів 5m / 30m / 1h / 1d', description: 'Шестерня → Рівні → Автоматичні рівні → «Таймфрейми автовизначення рівнів». Натисніть потрібні 5m, 15m, 30m, 1h, 4h і 1d. Можна вибрати кілька одночасно або вимкнути всі. За замовчуванням активні 1h, 4h, 1d.' },
    levelsLabels: { title: 'Показувати підписи рівнів', description: 'У «Підписи рівнів» виберіть «Завжди», «При наведенні» або «Вимкнені». Лінії залишаються, якщо вимкнено лише текст. Для S/R є окремий перемикач «Показувати мітки S/R».' },
    levelsAppearance: { title: 'Вигляд і товщина рівнів', description: 'Оберіть тип міток: текст, заливка чи рамка. Поряд налаштовуються колір, товщина ліній, розмір тексту й стиль ліній (суцільний, пунктир, крапки).' },
    densityEnable: { title: 'Увімкнути аналіз щільностей', description: 'Шестерня → Основні → Щільності → «Аналіз великих лімітних заявок». Це BID/ASK-заявки зі стакана, а не виконані угоди. Потрібні доступні біржові дані стакана.' },
    densityDisplay: { title: 'Лінії, мітки й суми щільностей', description: 'У «Щільності на графіку» окремо увімкніть «Лінії», «Мітки» й «Суми». Вимикайте лише непотрібне; аналіз у фоновому режимі налаштовується окремо.' },
    densityThreshold: { title: 'Поріг AUTO або MANUAL', description: '«Пороговий об’єм великих ордерів»: «Авто» обирає поріг за даними стакана, «Значення» дозволяє ввести суму USD. Нижче налаштовуються дистанція від ціни й час утримання заявки.' },
    densityAuto: { title: 'Фільтри щільностей AUTO', description: '«Усі сильні» показує великі заявки, а «Потенціал реакції» — лише з додатковими ознаками контакту. Це не гарантія руху ціни. На графіку також є швидка кнопка щільностей у розгорнутій верхній панелі.' },
    liqMapToggle: { title: 'Увімкнути карту ліквідацій', description: 'На ф’ючерсному HookChart у правій частині верхньої панелі натисніть іконку карти. Карта показує збережені ІСТОРИЧНІ події Liq, не відкриті позиції. На споті та в Replay вона недоступна.' },
    liqMapPeriod: { title: 'Період карти 24h або 7d', description: 'Після ввімкнення карти поруч з іконкою з’являються 24h і 7d. Оберіть період. За порожнього архіву або вимкненого архівування карта може не мати даних.' },
    liqMapModel: { title: 'Модельні зони Liq', description: 'Шестерня → Основні → Ліквідації → «Прогнозні зони Liq · модель за історією». Вмикайте лише за потреби й після відкриття карти; це модель повторів історичних подій, НЕ підтверджені майбутні ліквідації.' },
  },
  en: {
    liqVisibility: { title: 'Show or hide liquidations', description: 'Settings → Main → Liquidations → “Ліквідації на графіку”. Turning it off hides Liq markers and candle totals, not the exchange events themselves.' },
    liqSums: { title: 'Liquidation totals under candles', description: 'The “Показувати суми Liq під свічками” switch controls USD and L/S totals separately from the small liquidation markers. The master Liq switch hides both.' },
    liqLong: { title: 'Long liquidations', description: '“Long (L)” shows forced closing of long positions, not long trade entries. It does not change the cumulative Liq counter.' },
    liqShort: { title: 'Short liquidations', description: '“Short (S)” independently shows forced closing of short positions. Display either or both sides.' },
    liqThreshold: { title: 'USD thresholds by side', description: 'Set separate minimum USD sizes for Long and Short. Empty means automatic; 0 means all received events; a number filters smaller events. The Short field is below.' },
    liqPanel: { title: 'Liq and cascade panel', description: '“Блок Liq + каскад” shows the information panel. Its arrow collapses the details. The session Liq total counts all unique received events regardless of display thresholds.' },
    marketPrints: { title: 'Trade prints are different', description: '“Показувати суми великих ринкових заявок під свічками” shows large executed BUY/SELL trades, NOT liquidations. Use the separate Liq totals control.' },
    levelsIntervals: { title: 'Automatic 5m, 30m, 1h and daily levels', description: 'Settings → Levels → Automatic levels: select any combination of 5m, 15m, 30m, 1h, 4h and 1d. Deselect all to disable automatic levels. Defaults: 1h, 4h, 1d.' },
    levelsLabels: { title: 'Show level labels', description: 'Choose Always, On hover or Off. Turning text off does not necessarily remove the lines. Support/resistance S/R labels have their own switch.' },
    levelsAppearance: { title: 'Style and thickness of levels', description: 'Choose plain text, filled or outlined labels. Nearby controls change color, line thickness, text size and line pattern.' },
    densityEnable: { title: 'Enable order-book densities', description: 'Settings → Main → Densities → Enable analysis of large limit orders. These are BID/ASK orders in the live book, not executed trades.' },
    densityDisplay: { title: 'Lines, labels and amounts', description: 'Under “Щільності на графіку”, toggle Lines, Labels and Amounts independently. The data analysis setting is separate.' },
    densityThreshold: { title: 'AUTO and MANUAL thresholds', description: 'AUTO computes a threshold from the order book; Value uses a chosen USD threshold. Configure distance from price and minimum order age below.' },
    densityAuto: { title: 'AUTO density filters', description: 'All strong shows large orders; Reaction potential adds confirmation signals. Neither predicts a guaranteed price move. The expanded top toolbar also has a quick density control.' },
    liqMapToggle: { title: 'Turn on the liquidation map', description: 'On futures charts, tap the map icon at the upper right. The map displays archived historical liquidations, not open positions. Unavailable on spot and Replay.' },
    liqMapPeriod: { title: 'Map period: 24h / 7d', description: 'After enabling the map, 24h and 7d buttons appear. Select a period; empty or disabled exchange-event archives can leave the map empty.' },
    liqMapModel: { title: 'Modeled Liq zones', description: 'Settings → Main → Liquidations → “Прогнозні зони Liq · модель за історією”. Requires the map to be active. These bands model historical repetition, not confirmed future liquidations.' },
  },
  pl: {
    liqVisibility: { title: 'Pokaż lub ukryj likwidacje', description: 'Ustawienia → Główne → Likwidacje → „Ліквідації на графіку”. Wyłączenie ukrywa znaczniki i kwoty Liq na wykresie, ale nie zmienia odebranych zdarzeń giełdowych.' },
    liqSums: { title: 'Kwoty Liq pod świecami', description: '„Показувати суми Liq під свічками” osobno włącza/wyłącza kwoty USD oraz L/S. Małe znaczniki pozostają widoczne; przełącznik główny ukrywa wszystko.' },
    liqLong: { title: 'Likwidacje Long', description: '„Long (L)” pokazuje wymuszone zamknięcia długich pozycji, nie wejścia Long. Nie zmienia sumarycznego licznika Liq.' },
    liqShort: { title: 'Likwidacje Short', description: '„Short (S)” osobno pokazuje wymuszone zamknięcia krótkich pozycji. Możesz wybrać jedną lub obie strony.' },
    liqThreshold: { title: 'Progi kwot w USD', description: 'Osobne minimalne kwoty dla Long i Short. Puste pole to próg automatyczny, 0 to wszystkie odebrane zdarzenia, a liczba ukrywa mniejsze kwoty. Pole Short jest niżej.' },
    liqPanel: { title: 'Panel Liq i kaskady', description: '„Блок Liq + каскад” pokazuje panel informacyjny. Strzałka zwija szczegóły. Licznik sesji obejmuje wszystkie unikalne zdarzenia, niezależnie od filtrów.' },
    marketPrints: { title: 'Duże transakcje to nie Liq', description: '„Показувати суми великих ринкових заявок під свічками” pokazuje zrealizowane transakcje BUY/SELL, a NIE likwidacje. Użyj osobnego przełącznika kwot Liq.' },
    levelsIntervals: { title: 'Poziomy 5m / 30m / 1h / 1d', description: 'Ustawienia → Poziomy → Poziomy automatyczne: zaznacz 5m, 15m, 30m, 1h, 4h lub 1d. Można zaznaczyć kilka naraz albo odznaczyć wszystkie. Domyślne: 1h, 4h, 1d.' },
    levelsLabels: { title: 'Etykiety poziomów', description: 'Wybierz Zawsze, Po najechaniu lub Wyłączone. Ukrycie tekstu nie usuwa linii. Etykiety S/R mają osobny przełącznik.' },
    levelsAppearance: { title: 'Styl poziomów', description: 'Wybierz tekst, wypełnienie albo obramowanie etykiet. Pozostałe opcje kontrolują kolor, grubość, rozmiar tekstu i styl linii.' },
    densityEnable: { title: 'Włącz gęstości zleceń', description: 'Ustawienia → Główne → Gęstości: włącz analizę dużych zleceń limit. To zlecenia BID/ASK w arkuszu, nie wykonane transakcje.' },
    densityDisplay: { title: 'Linie, etykiety, kwoty', description: 'W sekcji „Щільності на графіку” osobno włącz linie, etykiety i kwoty. Obliczanie danych ma osobny przełącznik.' },
    densityThreshold: { title: 'Progi AUTO / MANUAL', description: 'AUTO oblicza próg na podstawie arkusza zleceń. Tryb Wartość pozwala wpisać próg w USD. Niżej ustawisz dystans od ceny i czas utrzymania zlecenia.' },
    densityAuto: { title: 'Filtrowanie gęstości AUTO', description: 'Wszystkie silne pokazuje duże zlecenia; Potencjał reakcji wymaga dodatkowych sygnałów. To nie gwarantuje ruchu ceny. Jest też szybka kontrolka w górnym pasku.' },
    liqMapToggle: { title: 'Włącz mapę likwidacji', description: 'Na wykresie futures naciśnij ikonę mapy w prawym górnym rogu. Mapa pokazuje historyczne zdarzenia Liq, nie otwarte pozycje. Nie działa na spot i Replay.' },
    liqMapPeriod: { title: 'Mapa: 24h / 7d', description: 'Po włączeniu mapy pojawiają się przyciski 24h i 7d. Wybierz okres. Przy braku archiwalnych danych mapa może być pusta.' },
    liqMapModel: { title: 'Modelowane strefy Liq', description: 'Ustawienia → Główne → Likwidacje → „Прогнозні зони Liq · модель за історією”. Funkcja wymaga aktywnej mapy. To model na podstawie historii, nie potwierdzone przyszłe likwidacje.' },
  },
  ru: {
    liqVisibility: { title: 'Включить / скрыть ликвидации', description: 'Настройки → Основные → Ликвидации → «Ліквідації на графіку». Выключение скрывает метки и суммы Liq, не изменяя сами биржевые события.' },
    liqSums: { title: 'Суммы Liq под свечами', description: '«Показувати суми Liq під свічками» отдельно скрывает/показывает суммы в USD и L/S. Маленькие маркеры остаются; главный переключатель скрывает оба вида.' },
    liqLong: { title: 'Ликвидации Long', description: '«Long (L)» отображает принудительно закрытые длинные позиции, а не точки входа. Общий счётчик Liq не меняется.' },
    liqShort: { title: 'Ликвидации Short', description: '«Short (S)» отдельно отображает принудительно закрытые короткие позиции. Можно включить обе стороны или только одну.' },
    liqThreshold: { title: 'Пороги сумм USD', description: 'Для Long и Short предусмотрены отдельные пороги. Пусто — автоматический; 0 — все полученные события; число — отбор по размеру. Поле Short находится ниже.' },
    liqPanel: { title: 'Блок Liq и каскад', description: '«Блок Liq + каскад» управляет информационным блоком. Стрелка сворачивает подробности. Общий Liq учитывает все уникальные события за сессию независимо от порога.' },
    marketPrints: { title: 'Рыночные сделки — не Liq', description: '«Показувати суми великих ринкових заявок під свічками» показывает крупные исполненные BUY/SELL сделки, а НЕ ликвидации. Для Liq есть отдельный переключатель.' },
    levelsIntervals: { title: 'Уровни 5m / 30m / 1h / 1d', description: 'Настройки → Уровни → Автоматические уровни: выберите 5m, 15m, 30m, 1h, 4h, 1d. Можно отметить несколько интервалов или убрать все. По умолчанию: 1h, 4h, 1d.' },
    levelsLabels: { title: 'Подписи уровней', description: 'Выберите Всегда, При наведении или Выкл. Скрытие текста не убирает линии. Для подписей S/R есть отдельный переключатель.' },
    levelsAppearance: { title: 'Стиль и толщина уровней', description: 'Выберите текстовые, залитые или контурные метки. Рядом настраиваются цвет, толщина и тип линий, размер текста.' },
    densityEnable: { title: 'Включить плотности заявок', description: 'Настройки → Основные → Плотности: включите анализ крупных лимитных ордеров. Это заявки BID/ASK в стакане, не исполненные сделки.' },
    densityDisplay: { title: 'Линии, метки и суммы', description: 'В пункте «Щільності на графіку» отдельно переключайте линии, метки и суммы. Анализ данных настраивается отдельно.' },
    densityThreshold: { title: 'Пороги AUTO / MANUAL', description: 'AUTO вычисляет порог по стакану, Значение — ваш порог в USD. Ниже находятся дистанция от цены и время удержания заявки.' },
    densityAuto: { title: 'Фильтры плотностей AUTO', description: 'Все сильные показывает крупные заявки, Потенциал реакции — только с дополнительными сигналами. Это не гарантия движения цены. В верхней панели есть быстрый доступ.' },
    liqMapToggle: { title: 'Включить карту ликвидаций', description: 'На фьючерсном графике нажмите иконку карты справа вверху. Карта показывает сохранённые исторические Liq, не открытые позиции. Недоступна на споте и в Replay.' },
    liqMapPeriod: { title: 'Карта: 24h / 7d', description: 'После включения карты появятся кнопки 24h и 7d. Выберите период; при отсутствии архива карта может быть пустой.' },
    liqMapModel: { title: 'Модельные зоны Liq', description: 'Настройки → Основные → Ликвидации → «Прогнозні зони Liq · модель за історією». Нужна активная карта. Это модель повторений в истории, не подтверждённые будущие ликвидации.' },
  },
};

const CHAPTERS: Record<GuideLanguage, Record<GuideStep['chapter'], string>> = {
  uk: { basics:'Основи', liq:'Liq', levels:'Рівні', density:'Щільності', map:'Карта Liq' },
  en: { basics:'Basics', liq:'Liq', levels:'Levels', density:'Densities', map:'Liq map' },
  pl: { basics:'Podstawy', liq:'Liq', levels:'Poziomy', density:'Gęstości', map:'Mapa Liq' },
  ru: { basics:'Основы', liq:'Liq', levels:'Уровни', density:'Плотности', map:'Карта Liq' },
};
type Highlight = { x: number; y: number; width: number; height: number; cardX: number; cardY: number };
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Portal above the modal settings. Highlighting is passive; the target remains clickable. */
export function HookChartGuide({ rootRef, language, onClose, onNavigate, liquidationMapSupported }: {
  rootRef: React.RefObject<HTMLDivElement | null>;
  language: string;
  onClose: () => void;
  onNavigate: (tab: GuideTab | null) => void;
  liquidationMapSupported: boolean;
}) {
  const activeLanguage = (COPY[language as GuideLanguage] ? language : 'uk') as GuideLanguage;
  const copy = COPY[activeLanguage];
  const steps = useMemo(() => GUIDE_STEPS.filter(item =>
    item.tab || (item.key === 'liqMapToggle' || item.key === 'liqMapPeriod'
      ? !!rootRef.current?.querySelector(liquidationMapSupported ? '.liqHeatmapTools' : '.chartSettingsBtn')
      : !!rootRef.current?.querySelector(item.selector))
  ), [rootRef, liquidationMapSupported]);
  const [index, setIndex] = useState(0);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const step = steps[Math.min(index, Math.max(steps.length - 1, 0))];

  useEffect(() => {
    if (step) onNavigate(step.tab ?? null);
  }, [step, onNavigate]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', keyDown, true);
    return () => document.removeEventListener('keydown', keyDown, true);
  }, [onClose]);

  useLayoutEffect(() => {
    if (!step) return;
    // Keep the old spotlight visible until the next target can be measured:
    // CSS can then animate the transition instead of flashing on each step.
    let frame = 0;
    let running = true;
    let observing: ResizeObserver | null = null;
    let measuredTarget: HTMLElement | null = null;
    const queryTarget = () => step.tab
      ? document.querySelector<HTMLElement>('.hookchart-settings-portal ' + step.selector)
      : rootRef.current?.querySelector<HTMLElement>(
          !liquidationMapSupported && (step.key === 'liqMapToggle' || step.key === 'liqMapPeriod')
            ? '.chartSettingsBtn' : step.selector,
        ) || null;

    const measure = () => {
      frame = 0;
      const target = queryTarget();
      if (!target || !running) return;
      if (measuredTarget !== target) {
        measuredTarget = target;
        if (step.tab) target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        else if (target.closest('.floatingDrawTools'))
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        observing?.observe(target);
      }
      const r = target.getBoundingClientRect();
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (!r.width || !r.height || w < 80 || h < 80) return;
      let x = r.left, y = r.top, width = r.width, height = r.height;
      if (step.key === 'candles') {
        x += Math.min(width * .25, 135);
        y += Math.min(height * .22, 90);
        width = Math.min(220, Math.max(95, width * .56));
        height = Math.min(150, Math.max(75, height * .37));
      } else if (step.key === 'price') {
        x += Math.max(0, width - 78);
        y += Math.min(height * .28, 125);
        width = Math.min(width, 76);
        height = Math.min(150, Math.max(70, height * .35));
      }
      const pad = 3;
      x = clamp(x-pad, 4, w-8);
      y = clamp(y-pad, 4, h-8);
      width = Math.max(4, Math.min(width+pad*2, w-x-4));
      height = Math.max(4, Math.min(height+pad*2, h-y-4));
      const cardWidth = Math.min(350, Math.max(180, w - 18));
      const cardHeight = Math.min(302, Math.max(200, h * .4));
      const below = y + height + cardHeight + 12 <= h;
      const cardY = below ? y + height + 12 : clamp(y - cardHeight - 12, 6, Math.max(6, h - cardHeight - 6));
      const cardX = clamp(x, 9, Math.max(9, w - cardWidth - 9));
      setHighlight({ x, y, width, height, cardX, cardY });
    };
    const schedule = () => { if (!frame && running) frame = requestAnimationFrame(measure); };
    // Mounting a settings tab happens after this effect. Watch only until
    // the target appears, then rely on resize and scroll to avoid chart work.
    const mutationObserver = new MutationObserver(() => {
      if (!queryTarget()) return;
      mutationObserver.disconnect();
      schedule();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    observing = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (rootRef.current) observing?.observe(rootRef.current);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    schedule();
    return () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      observing?.disconnect();
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [step, rootRef, liquidationMapSupported]);

  const hasHighlight = Boolean(highlight);
  useEffect(() => { if (hasHighlight) panelRef.current?.focus({ preventScroll: true }); }, [index, hasHighlight]);
  if (!step || !highlight || typeof document === 'undefined') return null;
  const data = step.key in copy.steps
    ? copy.steps[step.key as StepKey] : ADVANCED[activeLanguage][step.key as AdvancedStepKey];
  const targetChapter = step.chapter;
  return createPortal(
    <div className="hookchart-guide-overlay" role="presentation" lang={activeLanguage}>
      <div className="hookchart-guide-spotlight" aria-hidden="true"
        style={{ left: highlight.x, top: highlight.y, width: highlight.width, height: highlight.height }} />
      <div className="hookchart-guide-card" role="dialog" aria-label={copy.name}
        ref={panelRef} tabIndex={-1} style={{ left: highlight.cardX, top: highlight.cardY }}>
        <div className="hookchart-guide-heading">
          <span>{copy.step} {index + 1} {copy.of} {steps.length}</span>
          <button type="button" aria-label={copy.close} onClick={onClose}><X size={16} /></button>
        </div>
        <div className="hookchart-guide-chapters" role="group" aria-label={copy.name}>
          {(['basics','liq','levels','density','map'] as const).filter(ch => steps.some(item => item.chapter === ch)).map(ch =>
            <button type="button" key={ch} className={ch===targetChapter?'selected':''}
              aria-pressed={ch===targetChapter}
              onClick={() => { const next = steps.findIndex(item => item.chapter === ch); if (next >= 0) setIndex(next); }}>
              {CHAPTERS[activeLanguage][ch]}
            </button>
          )}
        </div>
        <strong>{data.title}</strong>
        <p>{data.description}</p>
        <small>{copy.safe}</small>
        <div className="hookchart-guide-footer">
          <div className="hookchart-guide-progress" aria-hidden="true">
            {steps.map((item, i) => <i key={item.key} className={i === index ? 'current' : ''} />)}
          </div>
          <div className="hookchart-guide-actions">
            <button type="button" disabled={index === 0} onClick={() => setIndex(v => Math.max(0, v - 1))}>
              <ArrowLeft size={14} /> {copy.back}
            </button>
            <button type="button" className="primary"
              onClick={() => index === steps.length - 1 ? onClose() : setIndex(v => Math.min(steps.length - 1, v + 1))}>
              {index === steps.length - 1 ? copy.done : copy.next} <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
