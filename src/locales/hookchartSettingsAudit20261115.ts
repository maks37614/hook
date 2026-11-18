/** Additional reviewed four-language strings for every HookChart settings tab. */
import type { SupportedLanguage } from './types';

const rows = [
  [
    "Мінімальна сума ліквідації у доларах США",
    "Minimum liquidation amount in US dollars",
    "Минимальная сумма ликвидации в долларах США",
    "Minimalna kwota likwidacji w dolarach amerykańskich"
  ],
  [
    "Тип графіка для візуальних налаштувань",
    "Chart type for visual settings",
    "Тип графика для визуальных настроек",
    "Typ wykresu dla ustawień wizualnych"
  ],
  [
    "Оберіть тип графіка",
    "Select a chart type",
    "Выберите тип графика",
    "Wybierz typ wykresu"
  ],
  [
    "Компактний перегляд масштабу",
    "Compact scale preview",
    "Компактный просмотр масштаба",
    "Kompaktowy podgląd skali"
  ],
  [
    "Схема показує зміни налаштувань без звернень до бірж. У реальному HookChart масштаб залежить від розміру вікна. Типи графіків та налаштування телефона і комп'ютера зберігаються окремо.",
    "This preview shows setting changes without connecting to exchanges. Actual HookChart scaling depends on window size. Chart types and phone/computer settings are saved separately.",
    "Предпросмотр показывает изменения настроек без запросов к биржам. В реальном HookChart масштаб зависит от размера окна. Типы графиков и настройки телефона и компьютера сохраняются отдельно.",
    "Podgląd pokazuje zmiany ustawień bez połączeń z giełdami. Rzeczywista skala HookChart zależy od rozmiaru okna. Typy wykresów i ustawienia telefonu oraz komputera są zapisywane oddzielnie."
  ],
  [
    "Тип графіка",
    "Chart type",
    "Тип графика",
    "Typ wykresu"
  ],
  [
    "Швидкий перегляд і Повний графік мають спільний масштаб для Скрінера та Формацій. Налаштування телефона й комп’ютера залишаються окремими.",
    "Quick preview and Full chart use shared scale presets in Screener and Formations. Phone and computer settings remain separate.",
    "Быстрый просмотр и Полный график используют общие настройки масштаба в Скринере и Формациях. Настройки телефона и компьютера остаются отдельными.",
    "Szybki podgląd i Pełny wykres mają wspólne ustawienia skali w Skanerze i Formacjach. Ustawienia telefonu i komputera pozostają oddzielne."
  ],
  [
    "Пристрій",
    "Device",
    "Устройство",
    "Urządzenie"
  ],
  [
    "Телефон і комп'ютер мають окремі профілі. Редагування одного не змінює вигляд іншого.",
    "Phone and computer have separate profiles. Editing one does not change the other.",
    "У телефона и компьютера отдельные профили. Изменение одного не влияет на другой.",
    "Telefon i komputer mają osobne profile. Zmiana jednego nie wpływa na drugi."
  ],
  [
    "Телефон",
    "Phone",
    "Телефон",
    "Telefon"
  ],
  [
    "Комп’ютер",
    "Computer",
    "Компьютер",
    "Komputer"
  ],
  [
    "Попередній перегляд графіка",
    "Chart preview",
    "Предварительный просмотр графика",
    "Podgląd wykresu"
  ],
  [
    "Повзунки налаштування графіка",
    "Chart scale controls",
    "Ползунки масштаба графика",
    "Suwaki skali wykresu"
  ],
  [
    "Кількість видимих свічок",
    "Number of visible candles",
    "Количество видимых свечей",
    "Liczba widocznych świec"
  ],
  [
    "Визначає бажану кількість свічок на ширину графіка. На маленькому екрані фактична кількість обмежується мінімальною шириною свічки.",
    "Sets the desired number of candles across the chart. On small screens, the actual count is limited by minimum candle width.",
    "Задаёт желаемое количество свечей по ширине графика. На маленьком экране фактическое число ограничено минимальной шириной свечи.",
    "Ustawia docelową liczbę świec na szerokości wykresu. Na małym ekranie rzeczywista liczba jest ograniczona minimalną szerokością świecy."
  ],
  [
    "Вертикальний зум",
    "Vertical zoom",
    "Вертикальный масштаб",
    "Powiększenie pionowe"
  ],
  [
    "Збільшує або зменшує висоту свічок. 1× — природний масштаб. Діапазон 0,01×–100×, можна ввести число вручну. Зміна вимикає автоматичний масштаб ціни.",
    "Increases or decreases candle height. 1× is natural scale. Range: 0.01×–100×; you can enter a value. Changing this disables automatic price scaling.",
    "Увеличивает или уменьшает высоту свечей. 1× — обычный масштаб. Диапазон 0,01×–100×; можно ввести значение. Изменение отключает автоматический масштаб цены.",
    "Zwiększa lub zmniejsza wysokość świec. 1× to skala naturalna. Zakres: 0,01×–100×; wartość można wpisać ręcznie. Zmiana wyłącza automatyczną skalę ceny."
  ],
  [
    "Точний вертикальний зум",
    "Exact vertical zoom",
    "Точный вертикальный масштаб",
    "Dokładne powiększenie pionowe"
  ],
  [
    "Вільний простір праворуч від останньої свічки (у барах). Значення відображається на схемі одразу. На реальному графіку відступ застосовується для вибраного профілю.",
    "Empty space to the right of the last candle (in bars). The preview updates immediately. The actual chart applies the gap for the selected profile.",
    "Свободное место справа от последней свечи (в барах). Значение сразу видно в предпросмотре. На реальном графике отступ применяется к выбранному профилю.",
    "Puste miejsce po prawej stronie ostatniej świecy (w słupkach). Podgląd aktualizuje się od razu. Na wykresie odstęp jest stosowany do wybranego profilu."
  ],
  [
    "Відступ праворуч у барах",
    "Right margin in bars",
    "Отступ справа в барах",
    "Odstęp po prawej w słupkach"
  ],
  [
    "Точний відступ праворуч у барах",
    "Exact right margin in bars",
    "Точный отступ справа в барах",
    "Dokładny odstęp po prawej w słupkach"
  ],
  [
    "Автоматичний масштаб ціни",
    "Automatic price scale",
    "Автоматический масштаб цены",
    "Automatyczna skala ceny"
  ],
  [
    "Збереження та скидання вигляду графіка",
    "Save and reset chart view",
    "Сохранение и сброс вида графика",
    "Zapis i reset widoku wykresu"
  ],
  [
    "Доступно лише для відкритого графіка з вибраним типом і пристроєм. У профілі налаштування зберігаються автоматично.",
    "Available only for an open chart of the selected type and device. Profile settings are saved automatically.",
    "Доступно только для открытого графика выбранного типа и устройства. В профиле настройки сохраняются автоматически.",
    "Dostępne tylko dla otwartego wykresu wybranego typu i urządzenia. Ustawienia profilu zapisują się automatycznie."
  ],
  [
    "Зберегти масштаб і положення свічок із відкритого графіка",
    "Save zoom and candle positions from the open chart",
    "Сохранить масштаб и положение свечей с открытого графика",
    "Zapisz skalę i położenie świec z otwartego wykresu"
  ],
  [
    "Застосувати цей профіль до всіх типів графіків вибраного пристрою",
    "Apply this profile to all chart types on the selected device",
    "Применить этот профиль ко всем типам графиков выбранного устройства",
    "Zastosuj ten profil do wszystkich typów wykresów na wybranym urządzeniu"
  ],
  [
    "Повернути стандартні параметри тільки вибраного профілю",
    "Restore default settings for the selected profile only",
    "Восстановить настройки по умолчанию только для выбранного профиля",
    "Przywróć ustawienia domyślne tylko dla wybranego profilu"
  ],
  [
    "Поточний вигляд передано на збереження.",
    "Current view submitted for saving.",
    "Текущий вид передан на сохранение.",
    "Bieżący widok przesłano do zapisu."
  ],
  [
    "Профіль застосовано до всіх графіків цього пристрою.",
    "Profile applied to all charts on this device.",
    "Профиль применён ко всем графикам этого устройства.",
    "Profil zastosowano do wszystkich wykresów na tym urządzeniu."
  ],
  [
    "Стандартні параметри вибраного профілю відновлено.",
    "Default settings for the selected profile restored.",
    "Настройки выбранного профиля по умолчанию восстановлены.",
    "Przywrócono domyślne ustawienia wybranego profilu."
  ],
  [
    "Зберігаємо…",
    "Saving…",
    "Сохраняем…",
    "Zapisywanie…"
  ],
  [
    "Збережено.",
    "Saved.",
    "Сохранено.",
    "Zapisano."
  ],
  [
    "Помилка збереження: перевірте підключення.",
    "Save error: check your connection.",
    "Ошибка сохранения: проверьте подключение.",
    "Błąd zapisu: sprawdź połączenie."
  ],
  [
    "Про налаштування графіка",
    "About chart settings",
    "О настройках графика",
    "Informacje o ustawieniach wykresu"
  ],
  [
    "Інформація про налаштування графіка",
    "Chart settings information",
    "Информация о настройках графика",
    "Informacje o ustawieniach wykresu"
  ],
  [
    "Налаштування HookChart для Скрінера, Формацій і Термінала. Візуальні профілі телефона, комп’ютера й різних розмірів графіка зберігаються окремо. Усі налаштування зберігаються автоматично.",
    "HookChart settings for Screener, Formations and Terminal. Visual profiles for phones, computers and different chart sizes are saved separately. All settings are saved automatically.",
    "Настройки HookChart для Скринера, Формаций и Терминала. Визуальные профили телефона, компьютера и разных размеров графика сохраняются отдельно. Все настройки сохраняются автоматически.",
    "Ustawienia HookChart dla Skanera, Formacji i Terminala. Profile wizualne telefonu, komputera i różnych rozmiarów wykresu są zapisywane oddzielnie. Wszystkie ustawienia zapisują się automatycznie."
  ],
  [
    "Максимальна історія свічок",
    "Maximum candle history",
    "Максимальная история свечей",
    "Maksymalna historia świec"
  ],
  [
    "Скільки свічок зберігати на графіку. Від 100 до 5000. Історія підвантажується частинами; на біржі може бути менше даних.",
    "Number of candles to keep on the chart, from 100 to 5000. History loads in batches; the exchange may provide less data.",
    "Сколько свечей хранить на графике: от 100 до 5000. История загружается частями; на бирже данных может быть меньше.",
    "Liczba świec przechowywanych na wykresie: od 100 do 5000. Historia jest wczytywana partiami; giełda może udostępniać mniej danych."
  ],
  [
    "Ліквідації",
    "Liquidations",
    "Ликвидации",
    "Likwidacje"
  ],
  [
    "Показувати суми Liq під свічками",
    "Show Liq amounts below candles",
    "Показывать суммы Liq под свечами",
    "Pokaż kwoty Liq pod świecami"
  ],
  [
    "Окремо показує або приховує числові підписи сум L/S під свічками. Не вимикає самі маркери ліквідацій; головний перемикач вище приховує все.",
    "Separately shows or hides the numeric L/S amounts below candles. Liquidation markers remain enabled; the master switch above hides everything.",
    "Отдельно показывает или скрывает суммы L/S под свечами. Сами метки ликвидаций остаются включёнными; общий переключатель выше скрывает всё.",
    "Niezależnie pokazuje lub ukrywa kwoty L/S pod świecami. Znaczniki likwidacji pozostają aktywne; przełącznik główny powyżej ukrywa wszystko."
  ],
  [
    "Прогнозні зони Liq · модель за історією",
    "Projected Liq zones · historical model",
    "Прогнозные зоны Liq · историческая модель",
    "Prognozowane strefy Liq · model historyczny"
  ],
  [
    "Додаткові горизонтальні теплові смуги на основі повторних історичних ліквідацій за тією самою ціною. Це не відомості про відкриті позиції, не підтверджені майбутні ліквідації і не ймовірність у відсотках. Працює лише коли вручну ввімкнено «Карту Liq» на ф'ючерсному графіку.",
    "Additional horizontal heat bands based on repeated historical liquidations near the same price. These do not represent open positions, confirmed future liquidations or percentage probabilities. Available only when Liq Map is enabled manually on a futures chart.",
    "Дополнительные горизонтальные тепловые полосы на основе повторных исторических ликвидаций около одной цены. Это не данные об открытых позициях, не подтверждённые будущие ликвидации и не вероятность в процентах. Работает только при ручном включении «Карты Liq» на фьючерсном графике.",
    "Dodatkowe poziome pasma cieplne oparte na powtarzających się historycznych likwidacjach w pobliżu tej samej ceny. Nie przedstawiają otwartych pozycji, potwierdzonych przyszłych likwidacji ani prawdopodobieństwa procentowego. Działają tylko po ręcznym włączeniu Mapy Liq na wykresie futures."
  ],
  [
    "Liq: сума всіх унікальних отриманих ліквідацій за поточну сесію, незалежно від порогів і перемикачів.",
    "Liq: total of all unique liquidation events received during this session, regardless of thresholds and switches.",
    "Liq: сумма всех уникальных полученных ликвидаций за текущую сессию независимо от порогов и переключателей.",
    "Liq: łączna kwota wszystkich unikalnych likwidacji odebranych podczas bieżącej sesji, niezależnie od progów i przełączników."
  ],
  [
    "Long: примусово закриті довгі позиції. Вимкнення приховує їх на графіку, але не змінює загальну суму Liq.",
    "Long: long positions closed by forced liquidation. Turning this off hides them from the chart but does not change the Liq total.",
    "Long: принудительно закрытые длинные позиции. Отключение скрывает их на графике, но не меняет общую сумму Liq.",
    "Long: długie pozycje zamknięte przymusowo. Wyłączenie ukrywa je na wykresie, ale nie zmienia łącznej kwoty Liq."
  ],
  [
    "Мінімальна сума Long (USD)",
    "Minimum Long amount (USD)",
    "Минимальная сумма Long (USD)",
    "Minimalna kwota Long (USD)"
  ],
  [
    "Порожнє поле = автоматичний поріг. 0 = усі ліквідації Long.",
    "Empty field = automatic threshold. 0 = all Long liquidations.",
    "Пустое поле = автоматический порог. 0 = все ликвидации Long.",
    "Puste pole = próg automatyczny. 0 = wszystkie likwidacje Long."
  ],
  [
    "Short: примусово закриті короткі позиції. Вимкнення приховує їх на графіку, але не змінює загальну суму Liq.",
    "Short: short positions closed by forced liquidation. Turning this off hides them from the chart but does not change the Liq total.",
    "Short: принудительно закрытые короткие позиции. Отключение скрывает их на графике, но не меняет общую сумму Liq.",
    "Short: krótkie pozycje zamknięte przymusowo. Wyłączenie ukrywa je na wykresie, ale nie zmienia łącznej kwoty Liq."
  ],
  [
    "Мінімальна сума Short (USD)",
    "Minimum Short amount (USD)",
    "Минимальная сумма Short (USD)",
    "Minimalna kwota Short (USD)"
  ],
  [
    "Порожнє поле = автоматичний поріг. 0 = усі ліквідації Short.",
    "Empty field = automatic threshold. 0 = all Short liquidations.",
    "Пустое поле = автоматический порог. 0 = все ликвидации Short.",
    "Puste pole = próg automatyczny. 0 = wszystkie likwidacje Short."
  ],
  [
    "Що показувати в AUTO",
    "What to show in AUTO",
    "Что показывать в AUTO",
    "Co wyświetlać w AUTO"
  ],
  [
    "Усі сильні — аномально великі заявки. Потенціал реакції — тільки щільності з контактом ціни та свіжими виконаними угодами або поповненням заявки. Це не гарантія відскоку.",
    "All strong shows unusually large orders. Reaction potential shows only order-book walls with price contact and recent executions or replenishment. It does not guarantee a bounce.",
    "«Все сильные» — аномально крупные заявки. «Потенциал реакции» — только плотности с касанием цены и недавними исполнениями или пополнением заявки. Это не гарантия отскока.",
    "Wszystkie silne oznacza nietypowo duże zlecenia. Potencjał reakcji pokazuje tylko duże zlecenia z kontaktem ceny oraz ostatnimi realizacjami lub uzupełnieniem. Nie gwarantuje odbicia."
  ],
  [
    "Усі сильні",
    "All strong",
    "Все сильные",
    "Wszystkie silne"
  ],
  [
    "Потенціал реакції",
    "Reaction potential",
    "Потенциал реакции",
    "Potencjał reakcji"
  ],
  [
    "Можна вибрати всі шість таймфреймів (5m, 15m, 30m, 1h, 4h, 1d). За замовчуванням: 1h, 4h і 1d. Зніміть усі, щоб вимкнути автовизначення.",
    "You can choose all six timeframes (5m, 15m, 30m, 1h, 4h, 1d). Defaults: 1h, 4h and 1d. Deselect all to disable automatic detection.",
    "Можно выбрать все шесть таймфреймов (5m, 15m, 30m, 1h, 4h, 1d). По умолчанию: 1h, 4h и 1d. Снимите все, чтобы отключить автоопределение.",
    "Można wybrać wszystkie sześć interwałów (5m, 15m, 30m, 1h, 4h, 1d). Domyślnie: 1h, 4h i 1d. Odznacz wszystkie, aby wyłączyć automatyczne wykrywanie."
  ],
  [
    "Розмір тексту міток рівнів",
    "Level label font size",
    "Размер текста меток уровней",
    "Rozmiar tekstu etykiet poziomów"
  ],
  [
    "Глобальний автомасштаб Термінала може мати пріоритет над вертикальним зумом.",
    "Terminal's global autoscale may override manual vertical zoom.",
    "Общий автомасштаб Терминала может иметь приоритет над вертикальным масштабом.",
    "Globalne automatyczne skalowanie Terminala może mieć pierwszeństwo przed powiększeniem pionowym."
  ],
  [
    "Обсяг історії застосовується окремо до кожного графіка після відкриття. Фактична кількість свічок залежить від біржі.",
    "The history limit applies separately to each chart after opening it. The actual candle count depends on the exchange.",
    "Ограничение истории применяется отдельно к каждому графику после открытия. Фактическое количество свечей зависит от биржи.",
    "Limit historii jest stosowany osobno do każdego wykresu po jego otwarciu. Rzeczywista liczba świec zależy od giełdy."
  ],
  [
    "Змінює розмір стрілки від свічки до підпису великих виконаних ринкових угод. Не впливає на суми угод.",
    "Adjusts arrow size from the candle to the label for large executed market trades. Does not affect trade amounts.",
    "Изменяет размер стрелки от свечи к подписи крупных исполненных рыночных сделок. Не влияет на суммы сделок.",
    "Zmienia rozmiar strzałki od świecy do etykiety dużych zrealizowanych transakcji rynkowych. Nie zmienia kwot transakcji."
  ],
  [
    "Змінює розмір тексту сум великих ринкових угод під свічками, не змінюючи поріг їхнього показу.",
    "Adjusts the text size of large market-trade totals below candles without changing the display threshold.",
    "Изменяет размер текста сумм крупных рыночных сделок под свечами, не меняя порог их отображения.",
    "Zmienia rozmiar tekstu kwot dużych transakcji rynkowych pod świecami bez zmiany progu wyświetlania."
  ],
  [
    "Змінює розмір стрілки ліквідації біля свічки, не змінюючи суму або кількість отриманих подій.",
    "Adjusts the liquidation arrow size beside a candle without changing the amount or number of received events.",
    "Изменяет размер стрелки ликвидации возле свечи, не изменяя сумму или количество полученных событий.",
    "Zmienia rozmiar strzałki likwidacji przy świecy, nie zmieniając kwoty ani liczby otrzymanych zdarzeń."
  ],
  [
    "Змінює розмір текстового підпису загальної суми Liq під свічкою, не впливаючи на підрахунок ліквідацій.",
    "Adjusts the total Liq amount label size below a candle without affecting the liquidation calculation.",
    "Изменяет размер текстовой подписи общей суммы Liq под свечой, не влияя на расчёт ликвидаций.",
    "Zmienia rozmiar etykiety łącznej kwoty Liq pod świecą, bez wpływu na obliczanie likwidacji."
  ],
  [
    "Змінює розмір тексту Long і Short під загальною сумою Liq. Показ деталізації вмикається окремо.",
    "Adjusts the Long/Short detail text size below the total Liq amount. Detail visibility is controlled separately.",
    "Изменяет размер текста Long и Short под общей суммой Liq. Отображение детализации включается отдельно.",
    "Zmienia rozmiar tekstu Long/Short pod łączną kwotą Liq. Widoczność szczegółów jest ustawiana osobno."
  ]
] as const;

export const hookchartSettingsAuditPhrases: Record<SupportedLanguage, Record<string,string>> = {
  uk:{}, en:{}, ru:{}, pl:{},
};
for(const [uk,en,ru,pl] of rows) {
  hookchartSettingsAuditPhrases.uk[uk]=uk;
  hookchartSettingsAuditPhrases.en[uk]=en;
  hookchartSettingsAuditPhrases.ru[uk]=ru;
  hookchartSettingsAuditPhrases.pl[uk]=pl;
}
