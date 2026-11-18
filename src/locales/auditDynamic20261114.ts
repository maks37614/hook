/** Dynamic UI messages with placeholders, audited across four languages. */
import type { SupportedLanguage } from './types';

const rows = [
  [
    "replay.history.unavailable",
    "Не вдалося отримати історичні свічки для {{symbol}} на дату {{date}}. Спробуйте іншу дату або монету.",
    "Could not load historical candles for {{symbol}} on {{date}}. Try another date or coin.",
    "Не удалось загрузить исторические свечи для {{symbol}} на дату {{date}}. Попробуйте другую дату или монету.",
    "Nie udało się pobrać świec historycznych dla {{symbol}} z dnia {{date}}. Wybierz inną datę lub monetę."
  ],
  [
    "replay.history.readyTitle",
    "Відтворення свічок готове",
    "Candle replay ready",
    "Воспроизведение свечей готово",
    "Odtwarzanie świec gotowe"
  ],
  [
    "replay.history.readyDescription",
    "Завантажено {{count}} свічок. Автофокус на даті {{date}} (наступні свічки приховані).",
    "Loaded {{count}} candles. Focused on {{date}} (future candles hidden).",
    "Загружено {{count}} свечей. Фокус на дате {{date}} (будущие свечи скрыты).",
    "Załadowano {{count}} świec. Widok ustawiony na {{date}} (przyszłe świece ukryte)."
  ],
  [
    "replay.history.loadError",
    "Помилка завантаження історичних даних.",
    "Failed to load historical data.",
    "Ошибка загрузки исторических данных.",
    "Błąd ładowania danych historycznych."
  ],
  [
    "replay.history.endTitle",
    "Кінець історії",
    "End of history",
    "Конец истории",
    "Koniec historii"
  ],
  [
    "replay.history.endDescription",
    "Досягнуто останню доступну свічку у вікні Replay.",
    "Reached the last available candle in the Replay window.",
    "Достигнута последняя доступная свеча в окне Replay.",
    "Osiągnięto ostatnią dostępną świecę w oknie odtwarzania."
  ],
  [
    "replay.order.filledTitle",
    "Відкладений {{type}} виконано",
    "Pending {{type}} filled",
    "Отложенный {{type}} исполнен",
    "Zlecenie oczekujące {{type}} wykonane"
  ],
  [
    "replay.order.filledPrice",
    "{{side}} {{symbol}} за ціною ${{price}}",
    "{{side}} {{symbol}} at ${{price}}",
    "{{side}} {{symbol}} по цене ${{price}}",
    "{{side}} {{symbol}} po cenie ${{price}}"
  ],
  [
    "replay.order.tpTitle",
    "Take-Profit спрацював! 🎯",
    "Take-Profit triggered! 🎯",
    "Сработал Take-Profit! 🎯",
    "Take-Profit zrealizowany! 🎯"
  ],
  [
    "replay.order.tpDescription",
    "Позицію закрито з профітом +${{pnl}} (+{{pct}}%)",
    "Position closed with profit +${{pnl}} (+{{pct}}%)",
    "Позиция закрыта с прибылью +${{pnl}} (+{{pct}}%)",
    "Pozycję zamknięto z zyskiem +${{pnl}} (+{{pct}}%)"
  ],
  [
    "replay.order.slTitle",
    "Stop-Loss спрацював! 🛑",
    "Stop-Loss triggered! 🛑",
    "Сработал Stop-Loss! 🛑",
    "Stop-Loss uruchomiony! 🛑"
  ],
  [
    "replay.order.slDescription",
    "Позицію закрито зі збитком -${{pnl}} ({{pct}}%)",
    "Position closed with loss -${{pnl}} ({{pct}}%)",
    "Позиция закрыта с убытком -${{pnl}} ({{pct}}%)",
    "Pozycję zamknięto ze stratą -${{pnl}} ({{pct}}%)"
  ],
  [
    "replay.order.liquidationTitle",
    "Позицію ліквідовано! 💥",
    "Position liquidated! 💥",
    "Позиция ликвидирована! 💥",
    "Pozycja zlikwidowana! 💥"
  ],
  [
    "replay.order.liquidationDescription",
    "Ціна досягла рівня ліквідації ${{price}}",
    "Price reached liquidation level ${{price}}",
    "Цена достигла уровня ликвидации ${{price}}",
    "Cena osiągnęła poziom likwidacji ${{price}}"
  ],
  [
    "replay.order.alreadyOpenTitle",
    "Позиція вже відкрита",
    "Position already open",
    "Позиция уже открыта",
    "Pozycja jest już otwarta"
  ],
  [
    "replay.order.alreadyOpenDescription",
    "Закрийте поточну позицію перед відкриттям нової.",
    "Close the current position before opening another.",
    "Закройте текущую позицию перед открытием новой.",
    "Zamknij bieżącą pozycję przed otwarciem kolejnej."
  ],
  [
    "replay.order.marginTitle",
    "Недостатньо маржі",
    "Insufficient margin",
    "Недостаточно маржи",
    "Niewystarczający depozyt"
  ],
  [
    "replay.order.marginDescription",
    "Потрібно ${{needed}}, баланс: ${{balance}}",
    "Required: ${{needed}}; balance: ${{balance}}",
    "Требуется ${{needed}}, баланс: ${{balance}}",
    "Wymagane: ${{needed}}, saldo: ${{balance}}"
  ],
  [
    "replay.order.marketOpenTitle",
    "{{side}} ордер відкрито!",
    "{{side}} order opened!",
    "Ордер {{side}} открыт!",
    "Zlecenie {{side}} otwarte!"
  ],
  [
    "replay.order.marketOpenDescription",
    "{{symbol}} ${{size}} ({{leverage}}x) за ціною ${{price}}",
    "{{symbol}} ${{size}} ({{leverage}}x) at ${{price}}",
    "{{symbol}} ${{size}} ({{leverage}}x) по цене ${{price}}",
    "{{symbol}} ${{size}} ({{leverage}}x) po cenie ${{price}}"
  ],
  [
    "replay.order.pendingCreatedTitle",
    "Відкладений {{type}} створено",
    "Pending {{type}} created",
    "Отложенный {{type}} создан",
    "Utworzono zlecenie oczekujące {{type}}"
  ],
  [
    "replay.order.pendingCreatedDescription",
    "{{side}} за ціною ${{price}}",
    "{{side}} at ${{price}}",
    "{{side}} по цене ${{price}}",
    "{{side}} po cenie ${{price}}"
  ],
  [
    "replay.order.manualCloseTitle",
    "Позицію закрито вручну",
    "Position closed manually",
    "Позиция закрыта вручную",
    "Pozycję zamknięto ręcznie"
  ],
  [
    "replay.order.manualCloseDescription",
    "Результат: {{sign}}${{pnl}} ({{pct}}%)",
    "Result: {{sign}}${{pnl}} ({{pct}}%)",
    "Результат: {{sign}}${{pnl}} ({{pct}}%)",
    "Wynik: {{sign}}${{pnl}} ({{pct}}%)"
  ],
  [
    "replay.action.resetTitle",
    "Скинуто на початок",
    "Reset to beginning",
    "Сброшено к началу",
    "Przywrócono początek"
  ],
  [
    "replay.action.resetDescription",
    "Графік повернуто на початкову дату Replay.",
    "Chart returned to the initial Replay date.",
    "График возвращён к начальной дате Replay.",
    "Wykres wrócił do początkowej daty odtwarzania."
  ],
  [
    "replay.action.screenshotTitle",
    "Скриншот завантажено",
    "Screenshot saved",
    "Скриншот сохранён",
    "Zapisano zrzut ekranu"
  ],
  [
    "replay.action.screenshotDescription",
    "Знімок графіка успішно збережено на вашому пристрої.",
    "Chart screenshot was saved to your device.",
    "Снимок графика успешно сохранён на устройстве.",
    "Zrzut wykresu zapisano na urządzeniu."
  ],
  [
    "replay.action.balanceTitle",
    "Баланс скинуто",
    "Balance reset",
    "Баланс сброшен",
    "Saldo zresetowane"
  ],
  [
    "replay.action.balanceDescription",
    "Баланс відновлено до $10,000 USDT.",
    "Balance restored to $10,000 USDT.",
    "Баланс восстановлен до $10,000 USDT.",
    "Saldo przywrócono do $10,000 USDT."
  ],
  [
    "replay.action.cancelTitle",
    "Ордер скасовано",
    "Order cancelled",
    "Ордер отменён",
    "Zlecenie anulowane"
  ],
  [
    "replay.action.cancelDescription",
    "Відкладений ордер видалено зі списку.",
    "Pending order removed from the list.",
    "Отложенный ордер удалён из списка.",
    "Zlecenie oczekujące usunięto z listy."
  ],
  [
    "replay.action.journalTitle",
    "Журнал очищено",
    "Journal cleared",
    "Журнал очищен",
    "Dziennik wyczyszczony"
  ],
  [
    "replay.action.journalDescription",
    "Всі записи угод видалено.",
    "All trade entries removed.",
    "Все записи сделок удалены.",
    "Usunięto wszystkie wpisy transakcji."
  ],
  [
    "screener.surveillance.removed",
    "#{{symbol}} видалено зі системного нагляду",
    "#{{symbol}} removed from monitoring",
    "#{{symbol}} удалён из системного наблюдения",
    "#{{symbol}} usunięto z monitorowania"
  ],
  [
    "screener.surveillance.added",
    "Монету #{{symbol}} додано на 24/7 системний нагляд!",
    "Coin #{{symbol}} added to 24/7 monitoring!",
    "Монета #{{symbol}} добавлена под круглосуточное наблюдение!",
    "Dodano monetę #{{symbol}} do monitorowania 24/7!"
  ],
  [
    "screener.surveillance.failed",
    "Не вдалося додати #{{symbol}}",
    "Could not add #{{symbol}}",
    "Не удалось добавить #{{symbol}}",
    "Nie udało się dodać #{{symbol}}"
  ],
  [
    "terminal.preset.found",
    "знайдено {{count}} монет",
    "{{count}} coins found",
    "найдено {{count}} монет",
    "znaleziono {{count}} monet"
  ],
  [
    "terminal.preset.shown",
    "графіки {{from}}–{{to}}",
    "charts {{from}}–{{to}}",
    "графики {{from}}–{{to}}",
    "wykresy {{from}}–{{to}}"
  ],
  [
    "terminal.market.loadError",
    "Не вдалося оновити монети.",
    "Could not refresh coins.",
    "Не удалось обновить монеты.",
    "Nie udało się odświeżyć monet."
  ],
  ["sentiment.title","Настрій Ринку","Market Sentiment","Настроение рынка","Nastroje rynkowe"],
  ["sentiment.description","Орієнтовний індекс із перевіреної цінової динаміки, обсягів та доступних історичних рівнів","Indicative index based on verified price dynamics, volumes and available historical levels","Ориентировочный индекс на основе проверенной динамики цен, объёмов и доступных исторических уровней","Orientacyjny indeks oparty na zweryfikowanej dynamice cen, wolumenach i dostępnych poziomach historycznych"],
  ["sentiment.state.extreme_fear","Екстремальний страх / Сильний тиск продавців","Extreme fear / Strong selling pressure","Экстремальный страх / Сильное давление продавцов","Skrajny strach / Silna presja sprzedających"],
  ["sentiment.state.fear","Страх / Переважають продавці","Fear / Sellers dominate","Страх / Преобладают продавцы","Strach / Przewaga sprzedających"],
  ["sentiment.state.neutral","Нейтральний стан ринку (Баланс сил)","Neutral market (Balanced)","Нейтральный рынок (Баланс сил)","Neutralny rynek (Równowaga)"],
  ["sentiment.state.greed","Жадібність / Переважають покупці","Greed / Buyers dominate","Жадность / Преобладают покупатели","Chciwość / Przewaga kupujących"],
  ["sentiment.state.extreme_greed","Екстремальна жадібність / Сильний попит","Extreme greed / Strong demand","Экстремальная жадность / Высокий спрос","Skrajna chciwość / Silny popyt"],
  ["sentiment.summary","Настрій ринку: {{label}} ({{score}}/100). Зростають {{advancing}} із {{total}} пар ({{pct}}%), падають {{declining}}, без суттєвого руху {{unchanged}}; середня зміна ціни за 24 год: {{change}}%. Середній добовий діапазон: {{range}}%. Індекс є орієнтовною оцінкою цінової динаміки, не вимірюванням грошових потоків.","Market sentiment: {{label}} ({{score}}/100). {{advancing}} of {{total}} pairs rising ({{pct}}%), {{declining}} falling, {{unchanged}} largely unchanged; average 24h price change: {{change}}%. Average daily range: {{range}}%. The index estimates price dynamics; it does not measure cash flows.","Настроение рынка: {{label}} ({{score}}/100). Растут {{advancing}} из {{total}} пар ({{pct}}%), падают {{declining}}, без существенного движения {{unchanged}}; среднее изменение цены за 24ч: {{change}}%. Средний дневной диапазон: {{range}}%. Индекс приблизительно оценивает динамику цен, а не денежные потоки.","Nastroje rynkowe: {{label}} ({{score}}/100). Rośnie {{advancing}} z {{total}} par ({{pct}}%), spada {{declining}}, bez istotnego ruchu {{unchanged}}; średnia zmiana ceny w 24h: {{change}}%. Średni zakres dzienny: {{range}}%. Indeks szacuje dynamikę cen, nie mierzy przepływów kapitału."],
  ["sentiment.summary.history","Багатомісячні рівні не враховано: достатня історія доступна лише для {{count}} пар ({{pct}}%).","Multi-month levels excluded: sufficient history is available for only {{count}} pairs ({{pct}}%).","Многомесячные уровни не учтены: достаточно истории только для {{count}} пар ({{pct}}%).","Nie uwzględniono poziomów wielomiesięcznych: wystarczająca historia jest dostępna tylko dla {{count}} par ({{pct}}%)."],
  ["sentiment.trend","Тренд & Динаміка","Trend & Dynamics","Тренд и динамика","Trend i dynamika"],
  ["sentiment.trendCounts","{{up}} зростають / {{down}} падають","{{up}} rising / {{down}} falling","{{up}} растут / {{down}} падают","{{up}} rośnie / {{down}} spada"],
  ["sentiment.unchanged","Без суттєвого руху: {{count}}","Little change: {{count}}","Без существенного движения: {{count}}","Bez istotnego ruchu: {{count}}"],
  ["sentiment.volume","Обсяги торгів","Trading volumes","Объёмы торгов","Wolumeny obrotu"],
  ["sentiment.turnover","Сумарний оборот за 24 год","Total 24h turnover","Суммарный оборот за 24ч","Łączny obrót w 24h"],
  ["sentiment.volatility","Волатильність","Volatility","Волатильность","Zmienność"],
  ["sentiment.volatility.high","Висока добова волатильність","High daily volatility","Высокая суточная волатильность","Wysoka zmienność dzienna"],
  ["sentiment.volatility.moderate","Помірна добова волатильність","Moderate daily volatility","Умеренная суточная волатильность","Umiarkowana zmienność dzienna"],
  ["sentiment.volatility.low","Низька добова волатильність","Low daily volatility","Низкая суточная волатильность","Niska zmienność dzienna"],
  ["sentiment.index","Індекс: {{score}}/100","Index: {{score}}/100","Индекс: {{score}}/100","Indeks: {{score}}/100"],
  ["sentiment.breadth","Ширина ринку","Market breadth","Ширина рынка","Szerokość rynku"],
  ["sentiment.emaAbove","EMA20: {{pct}}% вище","EMA20: {{pct}}% above","EMA20: {{pct}}% выше","EMA20: {{pct}}% powyżej"],
  ["sentiment.emaUnavailable","EMA20: н/д","EMA20: n/a","EMA20: н/д","EMA20: b/d"],
  ["sentiment.history","Історія: {{pct}}% · {{status}}","History: {{pct}}% · {{status}}","История: {{pct}}% · {{status}}","Historia: {{pct}}% · {{status}}"],
  ["sentiment.historyReliable","достатньо","sufficient","достаточно","wystarczająco"],
  ["sentiment.historyUnreliable","недостатньо","insufficient","недостаточно","niewystarczająco"],
  ["sentiment.historyHelp","Частка інструментів із достатньою добовою історією","Share of instruments with sufficient daily history","Доля инструментов с достаточной дневной историей","Odsetek instrumentów z wystarczającą historią dzienną"],
  ["sentiment.capitalFlows","Рух капіталу","Capital flow activity","Движение капитала","Ruch kapitału"],
  ["sentiment.takerSource","Дельта тейкерів Binance {{market}} · {{coverage}} пар · UTC сьогодні","Binance {{market}} taker delta · {{coverage}} pairs · UTC today","Дельта тейкеров Binance {{market}} · {{coverage}} пар · UTC сегодня","Delta takerów Binance {{market}} · {{coverage}} par · dziś UTC"],
  ["sentiment.takerUnavailable","Дельта тейкерів: Binance Futures/Spot тимчасово недоступні","Taker delta: Binance Futures/Spot temporarily unavailable","Дельта тейкеров: Binance Futures/Spot временно недоступны","Delta takerów: Binance Futures/Spot tymczasowo niedostępna"],
  ["sentiment.oiFunding","OI & Funding","OI & Funding","OI и фандинг","OI i funding"],
  ["sentiment.funding","Фандинг: {{rate}}","Funding: {{rate}}","Фандинг: {{rate}}","Funding: {{rate}}"],
  ["sentiment.derivativesSource","Bybit USDT Linear · OI {{oi}} / Funding {{funding}} контрактів","Bybit USDT Linear · OI {{oi}} / Funding {{funding}} contracts","Bybit USDT Linear · OI {{oi}} / Funding {{funding}} контрактов","Bybit USDT Linear · OI {{oi}} / Funding {{funding}} kontraktów"],
  ["sentiment.derivativesUnavailable","OI/Funding недоступні","OI/Funding unavailable","OI/фандинг недоступны","OI/Funding niedostępne"],
  ["sentiment.bybitSource","Джерело: Bybit USDT Perpetual","Source: Bybit USDT Perpetual","Источник: Bybit USDT Perpetual","Źródło: Bybit USDT Perpetual"],
  ["sentiment.loading","Завантаження даних…","Loading data…","Загрузка данных…","Ładowanie danych…"],
  ["sentiment.noData","Немає достовірних даних","No reliable data","Нет достоверных данных","Brak wiarygodnych danych"],
  ["sentiment.fetchError","Не вдалося оновити індекс. Перевірте з’єднання або стан бірж.","Could not refresh the index. Check your connection or exchange status.","Не удалось обновить индекс. Проверьте соединение или состояние бирж.","Nie udało się odświeżyć indeksu. Sprawdź połączenie lub stan giełd."],
  ["sentiment.refreshFail","Оновлення не вдалося — показані останні отримані дані.","Refresh failed — showing the last received data.","Обновление не удалось — показаны последние полученные данные.","Nie udało się odświeżyć — wyświetlane są ostatnie dostępne dane."],
  ["sentiment.staleSources","Частина джерел ринку недоступна або застаріла ({{fresh}}/{{total}} актуальних).","Some market sources are unavailable or stale ({{fresh}}/{{total}} current).","Часть рыночных источников недоступна или устарела ({{fresh}}/{{total}} актуальных).","Część źródeł rynkowych jest niedostępna lub nieaktualna ({{fresh}}/{{total}} aktualnych)."],
  ["sentiment.preferenceError","Не вдалося зберегти стан блока у вашому профілі.","Could not save this panel's state to your profile.","Не удалось сохранить состояние блока в профиле.","Nie udało się zapisać stanu panelu w profilu."],
  ["sentiment.meterAria","Індекс настрою ринку: від страху до жадібності","Market sentiment index: fear to greed","Индекс настроений рынка: от страха к жадности","Indeks nastrojów rynkowych: od strachu do chciwości"],
  ["sentiment.meterValue","{{score}} зі 100 — {{label}}","{{score}} out of 100 — {{label}}","{{score}} из 100 — {{label}}","{{score}} na 100 — {{label}}"],
  ["sentiment.fear","Страх","Fear","Страх","Strach"],
  ["sentiment.neutral","Нейтрально","Neutral","Нейтрально","Neutralnie"],
  ["sentiment.greed","Жадібність","Greed","Жадность","Chciwość"],
  ["screener.volume.fromTooltip","Показати пари з добовим обсягом від вибраної суми включно. Якщо обрано сортування за обсягом, спочатку показуються монети найближче до мінімуму.","Show pairs with 24h volume at or above the selected amount. With volume sorting, pairs nearest the minimum appear first.","Показать пары с суточным объёмом от выбранной суммы включительно. При сортировке по объёму сначала идут монеты ближе всего к минимуму.","Pokaż pary o wolumenie 24h od wybranej kwoty włącznie. Przy sortowaniu według wolumenu najpierw pojawią się monety najbliższe minimum."],
  ["screener.volume.toTooltip","Показати пари з добовим обсягом до вибраної суми включно. Якщо обрано сортування за обсягом, спочатку показуються монети найближче до максимуму.","Show pairs with 24h volume at or below the selected amount. With volume sorting, pairs nearest the maximum appear first.","Показать пары с суточным объёмом до выбранной суммы включительно. При сортировке по объёму сначала идут монеты ближе всего к максимуму.","Pokaż pary o wolumenie 24h do wybranej kwoty włącznie. Przy sortowaniu według wolumenu najpierw pojawią się monety najbliższe maksimum."],
  ["sentiment.notAvailable","н/д","n/a","н/д","b/d"],
  ["terminal.workspace.summary","Збережено {{total}} графіків · показано {{from}}–{{to}}","{{total}} charts saved · showing {{from}}–{{to}}","Сохранено {{total}} графиков · показано {{from}}–{{to}}","Zapisano {{total}} wykresów · pokazano {{from}}–{{to}}"],
  ["terminal.workspace.page","Сторінка {{page}} / {{total}}","Page {{page}} / {{total}}","Страница {{page}} / {{total}}","Strona {{page}} / {{total}}"],
  ["notifications.sound.readError","Не вдалося прочитати локально збережені мелодії.","Could not read locally saved sounds.","Не удалось прочитать локально сохранённые мелодии.","Nie udało się odczytać dźwięków zapisanych lokalnie."],
  ["notifications.sound.selectError","Не вдалося вибрати мелодію.","Could not select the ringtone.","Не удалось выбрать мелодию.","Nie udało się wybrać melodii."],
  ["notifications.sound.deleted","Вибрану мелодію видалено тільки з цього пристрою.","The selected ringtone was removed from this device only.","Выбранная мелодия удалена только с этого устройства.","Wybrany dźwięk usunięto tylko z tego urządzenia."],
  ["notifications.sound.deleteError","Не вдалося видалити мелодію.","Could not delete the ringtone.","Не удалось удалить мелодию.","Nie udało się usunąć melodii."],
  ["notifications.impulse.invalid","Вкажіть монету BTC або BTCUSDT і відсоток від 0,1 до 50.","Enter a coin such as BTC or BTCUSDT and a percentage between 0.1 and 50.","Укажите монету BTC или BTCUSDT и процент от 0,1 до 50.","Wpisz monetę BTC lub BTCUSDT oraz procent od 0,1 do 50."],
  ["notifications.impulse.saved","Монету та поріг збережено. Переконайтеся, що головний перемикач також увімкнений.","Coin and threshold saved. Make sure the main switch is enabled too.","Монета и порог сохранены. Убедитесь, что главный переключатель тоже включён.","Zapisano monetę i próg. Sprawdź, czy główny przełącznik również jest włączony."],
  ["notifications.browser.unsupported","Цей браузер не підтримує такі сповіщення. Центр на сайті працюватиме.","This browser does not support these notifications. The site's notification center will still work.","Этот браузер не поддерживает такие уведомления. Центр уведомлений на сайте продолжит работать.","Ta przeglądarka nie obsługuje takich powiadomień. Centrum powiadomień na stronie nadal będzie działać."],
  ["notifications.browser.disabled","Центр сповіщень вимкнено. Дозвіл браузера не активує доставку.","Notifications are switched off. Browser permission will not enable delivery.","Центр уведомлений выключен. Разрешение браузера не активирует доставку.","Centrum powiadomień jest wyłączone. Zgoda przeglądarki nie włączy dostarczania."],
  ["notifications.browser.denied","Браузер не надав дозвіл. Перевірте налаштування браузера.","Browser permission was not granted. Check your browser settings.","Браузер не предоставил разрешение. Проверьте настройки браузера.","Przeglądarka nie udzieliła zgody. Sprawdź jej ustawienia."],
  ["notifications.center.reset","Сповіщення на сайті, звуки та повідомлення браузера вимкнені. Інші розділи не змінено.","Site notifications, sounds and browser messages are disabled. Other sections were not changed.","Уведомления сайта, звуки и сообщения браузера выключены. Остальные разделы не изменены.","Wyłączono powiadomienia na stronie, dźwięki i wiadomości przeglądarki. Inne sekcje pozostały bez zmian."],
] as const;
const languages: SupportedLanguage[] = ['uk','en','ru','pl'];

export const auditedStrings = Object.fromEntries(
  languages.map((language, index) => [
    language, Object.fromEntries(rows.map(row => [row[0], row[index + 1]])),
  ]),
) as Record<SupportedLanguage, Record<string, string>>;

export const auditedStringRows = rows;
