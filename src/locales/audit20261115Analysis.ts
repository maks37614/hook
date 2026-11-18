/** 2026-11-15 audit: market analysis copy and precise data-provenance disclaimers. */
import type { SupportedLanguage } from './types';
const rows = [
  [
    "Аналізуємо мультитаймфреймовий BTC (15m → 5m → 1m), стакан ордерів, зону POC, інституційний Open Interest та ATR волатильність. Entry, SL і TP беруться з виявленої формації.",
    "We analyze BTC across timeframes (15m → 5m → 1m), the order book, POC area, institutional Open Interest, and ATR volatility. Entry, SL, and TP come from the detected formation.",
    "Анализируем BTC по таймфреймам (15m → 5m → 1m), стакан, зону POC, институциональный Open Interest и волатильность ATR. Entry, SL и TP берутся из обнаруженной формации.",
    "Analizujemy BTC na interwałach (15m → 5m → 1m), arkusz zleceń, obszar POC, instytucjonalny Open Interest i zmienność ATR. Entry, SL i TP pochodzą z wykrytej formacji."
  ],
  [
    "Спробувати знову",
    "Try again",
    "Попробовать снова",
    "Spróbuj ponownie"
  ],
  [
    "Автоматичні кількісні розрахунки з біржових даних, не генеративний AI. Відображаються тільки показники, для яких є доступні дані.",
    "Automatic quantitative calculations using exchange data, not generative AI. Only metrics with available data are shown.",
    "Автоматические количественные расчёты на основе биржевых данных, не генеративный ИИ. Показываются только показатели с доступными данными.",
    "Automatyczne obliczenia ilościowe na podstawie danych giełdowych, a nie generatywna AI. Pokazywane są tylko wskaźniki z dostępnymi danymi."
  ],
  [
    "Волатильність — окремий показник, не альтернативні рівні Entry, SL або TP.",
    "Volatility is a separate metric, not an alternative Entry, SL, or TP level.",
    "Волатильность — отдельный показатель, а не альтернативные уровни Entry, SL или TP.",
    "Zmienność to osobny wskaźnik, a nie alternatywny poziom Entry, SL lub TP."
  ],
  [
    "Аналіз Holders",
    "Holders analysis",
    "Анализ держателей",
    "Analiza posiadaczy"
  ],
  [
    "Великі заявки",
    "Large orders",
    "Крупные заявки",
    "Duże zlecenia"
  ],
  [
    "Лімітні заявки, не угоди китів",
    "Limit orders, not whale trades",
    "Лимитные заявки, не сделки китов",
    "Zlecenia limit, nie transakcje wielorybów"
  ],
  [
    "Вразливість ринку",
    "Market vulnerability",
    "Уязвимость рынка",
    "Podatność rynku"
  ],
  [
    "Евристика, не доказ маніпуляцій",
    "Heuristic, not proof of manipulation",
    "Эвристика, не доказательство манипуляций",
    "Heurystyka, nie dowód manipulacji"
  ],
  [
    "Усі модулі (Повний огляд)",
    "All modules (full overview)",
    "Все модули (полный обзор)",
    "Wszystkie moduły (pełny przegląd)"
  ],
  [
    "Контекст BTC (Binance Futures) на 15m → 5m → 1m",
    "BTC context (Binance Futures) at 15m → 5m → 1m",
    "Контекст BTC (Binance Futures) на 15m → 5m → 1m",
    "Kontekst BTC (Binance Futures) na 15m → 5m → 1m"
  ],
  [
    "Ціна: закриття останньої підтвердженої 1m свічки; не live-котирування.",
    "Price: close of the last confirmed 1m candle; not a live quote.",
    "Цена: закрытие последней подтверждённой свечи 1m; не live-котировка.",
    "Cena: zamknięcie ostatniej potwierdzonej świecy 1m; nie notowanie na żywo."
  ],
  [
    "Календар подій (лише підтверджені дані):",
    "Event calendar (verified data only):",
    "Календарь событий (только подтверждённые данные):",
    "Kalendarz wydarzeń (tylko potwierdzone dane):"
  ],
  [
    "Тренд на основі RSI, Ковзних Середніх та Волатильності",
    "Trend based on RSI, moving averages, and volatility",
    "Тренд на основе RSI, скользящих средних и волатильности",
    "Trend na podstawie RSI, średnich kroczących i zmienności"
  ],
  [
    "Де знаходиться ціна відносно денного High/Low:",
    "Price position relative to daily high/low:",
    "Положение цены относительно дневного High/Low:",
    "Pozycja ceny względem dziennego maksimum/minimum:"
  ],
  [
    "Стакан ордерів, Зона POC та Рівні Ліквідності",
    "Order book, POC zone, and liquidity levels",
    "Стакан ордеров, зона POC и уровни ликвидности",
    "Arkusz zleceń, strefa POC i poziomy płynności"
  ],
  [
    "Найбільша стіна в лонг (Bid Wall):",
    "Largest bid wall:",
    "Крупнейшая стена покупок (Bid Wall):",
    "Największa ściana kupna (Bid Wall):"
  ],
  [
    "Оціночний POC за свічками · 24 закриті 1h (не профіль угод):",
    "Estimated candle-based POC · 24 closed 1h candles (not a trade profile):",
    "Оценочный POC по свечам · 24 закрытые свечи 1h (не профиль сделок):",
    "Szacunkowy POC ze świec · 24 zamknięte świece 1h (nie profil transakcji):"
  ],
  [
    "Найбільша стіна в шорт (Ask Wall):",
    "Largest ask wall:",
    "Крупнейшая стена продаж (Ask Wall):",
    "Największa ściana sprzedaży (Ask Wall):"
  ],
  [
    "Великі лімітні заявки поточного стакана (не виконані угоди):",
    "Large limit orders in the current order book (not executed trades):",
    "Крупные лимитные заявки текущего стакана (не исполненные сделки):",
    "Duże zlecenia limit w bieżącym arkuszu (niezrealizowane transakcje):"
  ],
  [
    "Розрахункові цінові орієнтири (не підтверджені стоп-ордери):",
    "Estimated price reference levels (not confirmed stop orders):",
    "Расчётные ценовые ориентиры (не подтверждённые стоп-ордера):",
    "Szacunkowe poziomy referencyjne cen (niepotwierdzone zlecenia stop):"
  ],
  [
    "Оціночні рівні Support / Resistance (екстремуми 15 закритих свічок з відступом 0,4%):",
    "Estimated support / resistance (extremes of 15 closed candles with a 0.4% margin):",
    "Оценочные уровни поддержки / сопротивления (экстремумы 15 закрытых свечей с отступом 0,4%):",
    "Szacunkowe wsparcie / opór (ekstrema 15 zamkniętych świec z marginesem 0,4%):"
  ],
  [
    "Орієнтовна підтримка:",
    "Estimated support:",
    "Ориентировочная поддержка:",
    "Szacunkowe wsparcie:"
  ],
  [
    "Орієнтовний опір:",
    "Estimated resistance:",
    "Ориентировочное сопротивление:",
    "Szacunkowy opór:"
  ],
  [
    "Деривативи, Open Interest та Funding Rate",
    "Derivatives, open interest, and funding rate",
    "Деривативы, открытый интерес и ставка финансирования",
    "Instrumenty pochodne, Open Interest i Funding Rate"
  ],
  [
    "Ончейн-дані, великі заявки та ринкова вразливість",
    "On-chain data, large orders, and market vulnerability",
    "Ончейн-данные, крупные заявки и уязвимость рынка",
    "Dane on-chain, duże zlecenia i podatność rynku"
  ],
  [
    "Аналіз Holders & Розподіл Гаманців",
    "Holders and wallet distribution analysis",
    "Анализ держателей и распределение кошельков",
    "Analiza posiadaczy i rozkładu portfeli"
  ],
  [
    "Кількість адрес-власників",
    "Number of holder addresses",
    "Количество адресов-держателей",
    "Liczba adresów posiadaczy"
  ],
  [
    "Частка токенів у топ-10% адрес",
    "Token share held by top 10% of addresses",
    "Доля токенов у топ-10% адресов",
    "Udział tokenów należących do 10% największych adresów"
  ],
  [
    "Власники — це адреси, а не окремі люди. Біржі й контракти можуть володіти великими частками.",
    "Holder addresses are not necessarily individual people. Exchanges and contracts may hold large portions.",
    "Держатели — это адреса, а не отдельные люди. Биржи и контракты могут владеть большими долями.",
    "Posiadacze to adresy, niekoniecznie osoby. Giełdy i kontrakty mogą posiadać duże udziały."
  ],
  [
    "Джерело: CoinGecko",
    "Source: CoinGecko",
    "Источник: CoinGecko",
    "Źródło: CoinGecko"
  ],
  [
    "Великі лімітні заявки",
    "Large limit orders",
    "Крупные лимитные заявки",
    "Duże zlecenia limit"
  ],
  [
    "Обсяг у поточному знімку:",
    "Volume in current snapshot:",
    "Объём текущего снимка:",
    "Wolumen w bieżącym zrzucie:"
  ],
  [
    "Це лімітні заявки у стакані, не підтверджені виконані угоди.",
    "These are limit orders in the order book, not confirmed executed trades.",
    "Это лимитные заявки в стакане, а не подтверждённые исполненные сделки.",
    "To zlecenia limit w arkuszu, a nie potwierdzone zrealizowane transakcje."
  ],
  [
    "Підтверджений спред:",
    "Confirmed spread:",
    "Подтверждённый спред:",
    "Potwierdzony spread:"
  ],
  [
    "Евристичний індекс ринкової вразливості",
    "Heuristic market vulnerability index",
    "Эвристический индекс уязвимости рынка",
    "Heurystyczny wskaźnik podatności rynku"
  ]
] as const;
const languages: SupportedLanguage[] = ['uk','en','ru','pl'];
export const audit20261115Analysis = Object.fromEntries(languages.map((lang,i)=>[lang,Object.fromEntries(rows.map(row=>[row[0],row[i]]))])) as Record<SupportedLanguage,Record<string,string>>;
export const audit20261115AnalysisRows = rows;
