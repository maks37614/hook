import uk from './hookchart/uk.json';
import en from './hookchart/en.json';
import ru from './hookchart/ru.json';
import pl from './hookchart/pl.json';
import { normalizeLanguage, translatePhrase, type SupportedLanguage } from './index';
import type { HookChartPreferences } from '../types';

/** Original, user-supplied dictionaries; their keys are phrases, not executable code. */
export const hookChartLanguagePacks: Record<SupportedLanguage, Record<string, string>> = { uk, en, ru, pl };

// These controls were added after the supplied packs. Keep the original JSON files intact.
const additions = [
  // Shared canvas controls and strategy status: never hardcode one language in JSX.
  ['Керування масштабом графіка', 'Chart zoom controls', 'Управление масштабом графика', 'Sterowanie skalą wykresu'],
  ['Збільшити масштаб', 'Zoom in', 'Увеличить масштаб', 'Powiększ wykres'],
  ['Зменшити масштаб', 'Zoom out', 'Уменьшить масштаб', 'Pomniejsz wykres'],
  ['Скинути масштаб', 'Reset', 'Сбросить масштаб', 'Resetuj skalę'],
  ['Вся історія: увімкнено', 'All history: enabled', 'Вся история: включено', 'Cała historia: włączona'],
  ['Вся завантажена історія поточного таймфрейму', 'All loaded history for this timeframe', 'Вся загруженная история текущего таймфрейма', 'Cała wczytana historia bieżącego interwału'],
  ['Показати всю історію', 'Show all history', 'Показать всю историю', 'Pokaż całą historię'],
  ['Згорнути масштабування', 'Collapse zoom controls', 'Свернуть управление масштабом', 'Zwiń sterowanie skalą'],
  ['Розгорнути масштабування', 'Expand zoom controls', 'Развернуть управление масштабом', 'Rozwiń sterowanie skalą'],
  ['Бичачий', 'Bullish', 'Бычий', 'Wzrostowy'],
  ['Ведмежий', 'Bearish', 'Медвежий', 'Spadkowy'],
  ['Нейтральний', 'Neutral', 'Нейтральный', 'Neutralny'],
  ['Ризик', 'Risk', 'Риск', 'Ryzyko'],

  ['За профілем', 'From profile', 'Из профиля', 'Z profilu'],
  ['Немає даних', 'No data', 'Нет данных', 'Brak danych'],
  ["Оптимізація", "Optimization", "Оптимизация", "Optymalizacja"],
  ["Максимальний DPR полотна", "Maximum canvas DPR", "Максимальный DPR полотна", "Maksymalny DPR płótna"],
  ["Обмежує щільність пікселів Canvas: менше навантаження, але тонкі елементи можуть бути менш чіткими.", "Limits Canvas pixel density: less rendering work, but fine details may look less sharp.", "Ограничивает плотность пикселей Canvas: нагрузка ниже, но тонкие элементы могут быть менее чёткими.", "Ogranicza gęstość pikseli Canvas: mniejsze obciążenie, ale drobne detale mogą być mniej ostre."],
  ["DPR екрана:", "Screen DPR:", "DPR экрана:", "DPR ekranu:"],
  ["Фактичний DPR полотна:", "Effective canvas DPR:", "Фактический DPR полотна:", "Efektywny DPR płótna:"],
  ["DPR — щільність пікселів Canvas. Фактичний DPR — менше з DPR екрана та вибраного максимуму. На екрані DPR 3 ліміт 2× зменшує кількість пікселів полотна приблизно на 56%, що може знизити витрати GPU й пам’яті та покращити FPS, особливо за багатьох графіків. Низький DPR робить краї свічок, тонкі тіні, лінії та текст менш чіткими, але не змінює їхні кольори, розміри, масштаб або біржові дані. 4× зберігає попередню якість. Налаштування діє на всіх HookChart, окрім Відтворення.", "DPR is the Canvas pixel-density ratio. The effective DPR is the lower of the device DPR and the selected cap. On a DPR 3 screen, a 2× cap cuts the canvas pixel count by about 56%, potentially reducing GPU and memory costs and improving FPS, especially with many charts. A lower DPR makes candle edges, thin wicks, lines and text less sharp, but does not change their colors, sizes, scale or exchange data. 4× preserves the previous quality. This setting applies to all HookChart views except Replay.", "DPR — плотность пикселей Canvas. Фактический DPR — меньшее из DPR экрана и выбранного ограничения. На экране с DPR 3 лимит 2× уменьшает число пикселей полотна примерно на 56%, что может снизить нагрузку на GPU и память и повысить FPS, особенно при множестве графиков. При низком DPR края свечей, тонкие тени, линии и текст менее чёткие, но цвета, размеры, масштаб и биржевые данные не меняются. 4× сохраняет прежнее качество. Настройка действует на все HookChart, кроме Воспроизведения.", "DPR to gęstość pikseli Canvas. Efektywny DPR to mniejsza wartość z DPR ekranu i wybranego limitu. Na ekranie DPR 3 limit 2× zmniejsza liczbę pikseli płótna o około 56%, co może ograniczyć obciążenie GPU i pamięci oraz poprawić FPS, szczególnie przy wielu wykresach. Niższy DPR sprawia, że krawędzie świec, cienkie knoty, linie i tekst są mniej ostre, ale nie zmienia kolorów, rozmiarów, skali ani danych giełdowych. 4× zachowuje poprzednią jakość. Ustawienie dotyczy wszystkich wykresów HookChart oprócz Odtwarzania."],
  ['Налаштування графіка', 'Chart settings', 'Настройки графика', 'Ustawienia wykresu'],
  ["Налаштування", "Settings", "Настройки", "Ustawienia"],
  ["Закрити", "Close", "Закрыть", "Zamknij"],
  ["Повторити", "Retry", "Повторить", "Ponów"],
  ["Підвантаження старіших свічок…", "Loading older candles…", "Загрузка более ранних свечей…", "Wczytywanie starszych świec…"],
  ["API не повернув старіших свічок.", "The API returned no older candles.", "API не вернул более ранние свечи.", "API nie zwróciło starszych świec."],
  ["Не вдалося завантажити всю історію.", "Could not load full candle history.", "Не удалось загрузить всю историю свечей.", "Nie udało się wczytać pełnej historii świec."],
  ["Зберігаємо…", "Saving…", "Сохранение…", "Zapisywanie…"],
  ["Збережено.", "Saved.", "Сохранено.", "Zapisano."],
  ["Помилка збереження: перевірте підключення.", "Save failed: check your connection.", "Ошибка сохранения: проверьте подключение.", "Błąd zapisu: sprawdź połączenie."], 
  ["Змінює товщину та помітність стрілки від свічки до виконаних великих ринкових угод. Не змінює суми й пороги.", "Adjusts the size and visibility of the arrow from the candle to large executed market trades. Does not change amounts or thresholds.", "Меняет размер и заметность стрелки от свечи к крупным исполненным рыночным сделкам. Не меняет суммы и пороги.", "Zmienia rozmiar i widoczność strzałki od świecy do dużych zrealizowanych transakcji rynkowych. Nie zmienia kwot ani progów."],
  ["Змінює розмір підпису BUY/SELL під свічкою, не впливаючи на розрахунок великих угод.", "Changes the BUY/SELL label font size below candles without affecting large-trade calculations.", "Меняет размер подписи BUY/SELL под свечой без влияния на расчёт крупных сделок.", "Zmienia rozmiar etykiety BUY/SELL pod świecą bez wpływu na obliczenia dużych transakcji."],
  ["Змінює розмір стрілки до суми ліквідацій біля свічки. Не змінює кількість отриманих ліквідацій або їхню загальну суму.", "Changes the arrow size pointing to the liquidation amount near a candle. Does not affect recorded events or their total amount.", "Меняет размер стрелки к сумме ликвидаций возле свечи. Не влияет на число полученных ликвидаций или их общую сумму.", "Zmienia rozmiar strzałki wskazującej kwotę likwidacji przy świecy. Nie zmienia liczby odebranych zdarzeń ani ich sumy."],
  ["Змінює розмір тексту загальної суми ліквідацій під свічкою, не впливаючи на дані ліквідацій.", "Changes the total liquidation amount's font size below a candle without changing liquidation data.", "Меняет размер текста общей суммы ликвидаций под свечой без изменения данных ликвидаций.", "Zmienia rozmiar tekstu łącznej kwoty likwidacji pod świecą bez zmiany danych o likwidacjach."],
  ["Змінює розмір додаткового рядка Long/Short під загальною сумою Liq, не змінюючи розраховані суми.", "Changes the size of the supplementary Long/Short line under the total Liq amount without altering calculated amounts.", "Меняет размер дополнительной строки Long/Short под общей суммой Liq, не изменяя рассчитанные суммы.", "Zmienia rozmiar dodatkowego wiersza Long/Short pod łączną kwotą Liq bez zmiany obliczonych kwot."],
  // Keep the shared Hotkeys section and its five new actions discoverable
  // through the chart-wide translation audit as well as the hotkey UI catalog.
  ['Відображення даних', 'Display data', 'Отображение данных', 'Wyświetlanie danych'],
  ['Показати / приховати щільності BID/ASK', 'Show / hide BID/ASK densities', 'Показать / скрыть плотности BID/ASK', 'Pokaż / ukryj skupiska BID/ASK'],
  ['Показати / приховати ліквідації', 'Show / hide liquidations', 'Показать / скрыть ликвидации', 'Pokaż / ukryj likwidacje'],
  ['Показати / приховати суми ліквідацій під свічками', 'Show / hide liquidation amounts below candles', 'Показать / скрыть суммы ликвидаций под свечами', 'Pokaż / ukryj kwoty likwidacji pod świecami'],
  ['Показати / приховати суми великих ринкових угод під свічками', 'Show / hide large executed trades below candles', 'Показать / скрыть крупные сделки под свечами', 'Pokaż / ukryj duże transakcje pod świecami'],
  ['Перемкнути лупу під курсором (середня кнопка миші — окремо)', 'Toggle cursor magnifier (middle mouse works separately)', 'Переключить лупу курсора (средняя кнопка мыши работает отдельно)', 'Przełącz lupę kursora (środkowy przycisk myszy działa oddzielnie)'],
  ['Автоматична розмітка', 'Automatic chart markup', 'Автоматическая разметка', 'Automatyczne oznaczenia'],
  ['Режим Скальпера', 'Scalper Mode', 'Режим Скальпера', 'Tryb skalpera'],
  ['Вигляд ліній Режиму Скальпера', 'Scalper Mode line style', 'Вид линий Режима скальпера', 'Styl linii trybu skalpera'],
  ['Авто (за статусом)', 'Auto (by status)', 'Авто (по статусу)', 'Auto (wg statusu)'],
  ['Суцільна', 'Solid', 'Сплошная', 'Ciągła'],
  ['Пунктир', 'Dashed', 'Пунктир', 'Linia przerywana'],
  ['Крапки', 'Dotted', 'Точки', 'Kropkowana'],
  ['Авто зберігає поточний вигляд: підтверджені лінії суцільні, інші — пунктирні. Інші варіанти змінюють лише малювання ліній, не логіку пошуку формацій.',
    'Auto preserves the existing display: confirmed lines are solid, other lines are dashed. Other styles change only the drawn lines, not pattern detection.',
    'Авто сохраняет текущий вид: подтверждённые линии сплошные, остальные — пунктирные. Другие стили меняют только отображение линий, но не поиск формаций.',
    'Auto zachowuje obecny wygląd: potwierdzone linie są ciągłe, pozostałe przerywane. Inne style zmieniają tylko wygląd linii, nie wykrywanie formacji.'],
  ['Показувати точки дотику Скальпера', 'Show Scalper Mode touch points', 'Показывать точки касания Скальпера', 'Pokaż punkty styku trybu skalpera'],
  ['Показує або приховує маленькі кружечки у підтверджених High/Low тіней. Лінії, позначки пробою та пошук формацій не змінюються.',
    'Shows or hides small circles at confirmed High/Low wick contacts. Lines, breakout markers and pattern detection stay unchanged.',
    'Показывает или скрывает маленькие кружки на подтверждённых касаниях High/Low теней. Линии, метки пробоя и поиск формаций не меняются.',
    'Pokazuje lub ukrywa małe kółka przy potwierdzonych dotknięciach knotów High/Low. Linie, znaczniki wybicia i wykrywanie formacji pozostają bez zmian.'],
  ['Усереднена регресійна лінія', 'Averaged regression line', 'Усреднённая регрессионная линия', 'Uśredniona linia regresji'],
  ['Альтернативна побудова, як у попередній версії: лінія усереднює підтверджені High/Low методом лінійної регресії. Вона може проходити між кінчиками тіней і через тіла свічок. Якщо вимкнено (за замовчуванням), лінії проходять через фактичні High/Low тіней. Змінює тільки алгоритм розмітки, не біржові дані.',
    'Alternative, previous-version method: the line averages confirmed High/Low pivots using linear regression. It may run between wick tips and through candle bodies. When disabled (default), lines connect actual High/Low wick tips. Only chart pattern analysis changes, not exchange prices.',
    'Альтернативный способ, как в предыдущей версии: линия усредняет подтверждённые High/Low методом линейной регрессии. Она может проходить между кончиками теней и через тела свечей. Когда выключено (по умолчанию), линии соединяют реальные High/Low теней. Изменяется только анализ разметки, не биржевые данные.',
    'Alternatywny sposób z poprzedniej wersji: linia uśrednia potwierdzone punkty High/Low metodą regresji liniowej. Może przebiegać między końcami knotów i przez korpusy świec. Gdy wyłączona (domyślnie), linie łączą rzeczywiste szczyty i dołki knotów. Zmienia się tylko analiza formacji, nie dane giełdowe.'],
  ['Показувати підписи Режиму Скальпера', 'Show Scalper Mode labels', 'Показывать подписи Режима скальпера', 'Pokazuj etykiety trybu skalpera'],
  ['Якщо вимкнено, приховує лише назви фігур та статуси біля автоматично намальованих ліній. Лінії, дотики тіней і позначки пробою залишаються видимими.',
    'When disabled, only pattern names and statuses beside automatically drawn lines are hidden. Lines, wick contacts and breakout markers remain visible.',
    'Если выключено, скрываются только названия фигур и статусы рядом с автоматически нарисованными линиями. Линии, касания теней и отметки пробоя остаются видимыми.',
    'Po wyłączeniu ukrywane są tylko nazwy formacji i statusy obok automatycznie rysowanych linii. Linie, dotknięcia knotów i znaczniki wybicia pozostają widoczne.'],
  ['Автоматично показує на живому графіку підтверджені дотиками діапазони, трикутники, клини, похилі лінії та подвійні вершини/дна. Можливий пробій не є підтвердженим до закриття свічки. Аналіз виконується лише в браузері без нових біржових запитів.',
    'Automatically draws touch-validated ranges, triangles, wedges, trendlines and double tops/bottoms on the live chart. A possible breakout is not confirmed until a candle closes. Analysis runs only in your browser, without new exchange requests.',
    'Автоматически рисует на живом графике диапазоны, треугольники, клинья, наклонные линии и двойные вершины/дна с подтверждёнными касаниями. Возможный пробой подтверждается только после закрытия свечи. Анализ идёт в браузере без новых запросов к бирже.',
    'Automatycznie rysuje na żywym wykresie zakresy, trójkąty, kliny, linie trendu oraz podwójne szczyty i dna potwierdzone dotknięciami. Możliwe wybicie jest potwierdzone dopiero po zamknięciu świecy. Analiza działa lokalnie w przeglądarce, bez nowych żądań do giełdy.'],
  ['Фактично виконані великі покупки та продажі', 'Large buy and sell market trades that have actually executed', 'Фактически исполненные крупные покупки и продажи', 'Faktycznie zrealizowane duże transakcje kupna i sprzedaży'],
  ['Примусове закриття позицій через недостатню маржу', 'Forced closure of positions due to insufficient margin', 'Принудительное закрытие позиций из-за недостаточной маржи', 'Przymusowe zamknięcie pozycji z powodu niewystarczającego depozytu zabezpieczającego'],
  ['Мінімальна сума великих угод під свічкою (USD)', 'Minimum large-trade total per candle (USD)', 'Минимальная сумма крупных сделок под свечой (USD)', 'Minimalna suma dużych transakcji pod świecą (USD)'],
  ['0 = усі суми великих угод. Поріг застосовується до BUY + SELL за одну свічку.', '0 = all qualifying large-trade totals. The threshold applies to BUY + SELL for each candle.', '0 = все суммы крупных сделок. Порог применяется к BUY + SELL за одну свечу.', '0 = wszystkie sumy dużych transakcji. Próg dotyczy BUY + SELL dla każdej świecy.'],
  ['Приховує підписи, якщо сумарний обсяг великих BUY і SELL угод за свічку менший за введену суму у USD. 0 показує всі зібрані великі угоди. Не змінює біржові дані, автоматичний поріг великих угод або ліквідації.', 'Hides labels when the combined volume of qualifying BUY and SELL trades in a candle is below the entered USD amount. 0 shows all collected large trades. Does not affect exchange data, automatic large-trade detection or liquidations.', 'Скрывает подписи, если суммарный объём крупных сделок BUY и SELL за свечу ниже указанной суммы в USD. 0 показывает все собранные крупные сделки. Не влияет на биржевые данные, автоматический порог крупных сделок или ликвидации.', 'Ukrywa etykiety, gdy suma dużych transakcji BUY i SELL w świecy jest mniejsza niż podana kwota w USD. 0 pokazuje wszystkie zebrane duże transakcje. Nie zmienia danych giełdowych, automatycznego progu ani likwidacji.'],
  ['Показує під свічками сумарний обсяг великих ринкових угод', 'Shows the total volume of large market trades below the candles', 'Показывает под свечами суммарный объём крупных рыночных сделок', 'Pokazuje pod świecami łączny wolumen dużych transakcji rynkowych'],
  ['Стрілка до суми великих ринкових угод', 'Arrow to large market-trade amounts', 'Стрелка к сумме крупных рыночных сделок', 'Strzałka do sumy dużych transakcji rynkowych'],
  ['Розмір стрілки ринкових угод', 'Market-trade arrow size', 'Размер стрелки рыночных сделок', 'Rozmiar strzałki transakcji rynkowych'],
  ['Розмір тексту великих ринкових угод', 'Large market-trade text size', 'Размер текста крупных рыночных сделок', 'Rozmiar tekstu dużych transakcji rynkowych'],
  ['Показувати L/S під сумою Liq', 'Show L/S details below Liq amount', 'Показывать L/S под суммой Liq', 'Pokazuj L/S pod kwotą Liq'],
  ['Показувати стрілки ліквідацій', 'Show liquidation arrows', 'Показывать стрелки ликвидаций', 'Pokazuj strzałki likwidacji'],
  ['Розмір стрілки Liq', 'Liq arrow size', 'Размер стрелки Liq', 'Rozmiar strzałki Liq'],
  ['Розмір загальної суми Liq', 'Total Liq amount text size', 'Размер общей суммы Liq', 'Rozmiar tekstu sumy Liq'],
  ['Розмір тексту L/S під сумою', 'L/S detail text size', 'Размер текста L/S под суммой', 'Rozmiar tekstu L/S pod kwotą'],
  ['Окремо показує стрілку від свічки до суми BUY/SELL. Текст можна залишити без стрілки.', 'Separately show an arrow from the candle to the BUY/SELL total; keep text visible without it.', 'Отдельно показывает стрелку от свечи к сумме BUY/SELL. Текст можно оставить без стрелки.', 'Pokazuj osobno strzałkę od świecy do sumy BUY/SELL; tekst może pozostać bez strzałki.'],
  ['Показує загальну суму ліквідацій під свічкою. Стрілка та деталізація L/S налаштовуються окремо.', 'Show the total liquidation amount below a candle; arrow and L/S breakdown are separate controls.', 'Показывает общую сумму ликвидаций под свечой. Стрелка и детали L/S настраиваются отдельно.', 'Pokazuje sumę likwidacji pod świecą; strzałka i rozbicie L/S mają osobne ustawienia.'],
  ['Приховує лише нижній рядок L/S, але залишає загальну суму та стрілку.', 'Hide only the lower L/S line, keeping the total amount and arrow.', 'Скрывает только нижнюю строку L/S, оставляя общую сумму и стрелку.', 'Ukrywa tylko dolny wiersz L/S, pozostawiając sumę i strzałkę.'],
  ['Вмикає або вимикає стрілки біля свічок незалежно від написів Liq.', 'Show or hide arrows at candles independently of Liq text.', 'Включает или выключает стрелки у свечей независимо от текста Liq.', 'Pokazuje lub ukrywa strzałki przy świecach niezależnie od tekstu Liq.'],
  ['Інструменти малювання', 'Drawing tools', 'Инструменты рисования', 'Narzędzia rysowania'],
  ['Товщина горизонтальної лінії', 'Horizontal-line width', 'Толщина горизонтальной линии', 'Grubość linii poziomej'],
  ['Тільки горизонтальна лінія, намальована вручну. Не змінює автоматичні рівні, курсор чи сітку.',
    'Only affects manually drawn horizontal lines. Does not change automatic levels, cursor or grid.',
    'Влияет только на нарисованные вручную горизонтальные линии. Не меняет автоматические уровни, курсор или сетку.',
    'Dotyczy tylko ręcznie narysowanych linii poziomych. Nie zmienia poziomów automatycznych, kursora ani siatki.'],
  ['Товщина лінії тренду', 'Trend-line width', 'Толщина трендовой линии', 'Grubość linii trendu'],
  ['Товщина трендової лінії (Скальпер)', 'Scalper trend-line width', 'Толщина трендовой линии (Скальпер)', 'Grubość linii trendu (Skalper)'],
  ['Змінює лише автоматично знайдені трендові лінії Режиму Скальпера. Не впливає на ручні малюнки, трикутники чи інші фігури.',
    'Changes only automatically detected Scalper Mode trend lines. Does not affect manual drawings, triangles or other patterns.',
    'Изменяет только автоматически найденные трендовые линии Режима скальпера. Не влияет на ручные рисунки, треугольники или другие фигуры.',
    'Zmienia tylko automatycznie wykryte linie trendu trybu skalpera. Nie wpływa na rysunki ręczne, trójkąty ani inne formacje.'],
  ['Тільки лінія тренду, намальована вручну. Не змінює курсор, сітку чи автоматичні рівні.', 'Only affects manually drawn trend lines. Does not change the cursor, grid, or automatic levels.', 'Влияет только на нарисованные вручную линии тренда. Не меняет курсор, сетку или автоматические уровни.', 'Dotyczy tylko ręcznie narysowanych linii trendu. Nie zmienia kursora, siatki ani automatycznych poziomów.'],
  ['Перехрестя', 'Crosshair', 'Перекрестие', 'Krzyżyk'],
  ['Дії з інструментом графіка', 'Chart drawing actions', 'Действия с инструментом графика', 'Działania na narzędziu wykresu'],
  ['Редагувати межі інструмента', 'Edit drawing endpoints', 'Редактировать границы инструмента', 'Edytuj punkty narzędzia'],
  ['Редагувати інструмент', 'Edit drawing', 'Редактировать инструмент', 'Edytuj narzędzie'],
  ['Видалити інструмент', 'Delete drawing', 'Удалить инструмент', 'Usuń narzędzie'],
  ['Змінити текст інструмента', 'Edit label text', 'Изменить текст инструмента', 'Edytuj tekst etykiety'],
  ['Дії з сигнальним рівнем', 'Price alert actions', 'Действия с сигнальным уровнем', 'Działania na poziomie alertu'],
  ['Редагувати сигнальний рівень', 'Edit price alert', 'Изменить сигнальный уровень', 'Edytuj poziom alertu'],
  ['Видалити сигнальний рівень', 'Delete price alert', 'Удалить сигнальный уровень', 'Usuń poziom alertu'],
  ['Товщина ліній', 'Line width', 'Толщина линий', 'Grubość linii'],
  ['Горизонтальна та вертикальна лінії курсора.', 'Horizontal and vertical cursor lines.', 'Горизонтальная и вертикальная линии курсора.', 'Pozioma i pionowa linia kursora.'],
  ['Живий стакан вимкнено у відтворенні', 'Live order book is disabled in replay', 'Живой стакан отключён в воспроизведении', 'Arkusz na żywo jest wyłączony podczas odtwarzania'],
  ['Біржовий стакан недоступний', 'Exchange order book unavailable', 'Биржевой стакан недоступен', 'Arkusz zleceń giełdy jest niedostępny'],
  ['Відновлення стакана', 'Reconnecting order book', 'Восстановление стакана', 'Ponowne łączenie arkusza zleceń'],
  ['Синхронізація стакана', 'Synchronizing order book', 'Синхронизация стакана', 'Synchronizacja arkusza zleceń'],
  ['Підключення стакана', 'Connecting order book', 'Подключение стакана', 'Łączenie arkusza zleceń'],
  ['Множник порогу AUTO', 'AUTO threshold multiplier', 'Множитель порога AUTO', 'Mnożnik progu AUTO'],
  ['Недостатньо рівнів для AUTO', 'Not enough levels for AUTO', 'Недостаточно уровней для AUTO', 'Za mało poziomów dla AUTO'],
  ['Очікування даних', 'Waiting for data', 'Ожидание данных', 'Oczekiwanie na dane'],
  ['Поріг щільностей (USDT)', 'Density threshold (USDT)', 'Порог плотностей (USDT)', 'Próg zleceń (USDT)'],
  ['Дистанція від ціни', 'Distance from price', 'Дистанция от цены', 'Odległość od ceny'],
  ['Дистанція щільностей (%)', 'Density distance (%)', 'Дистанция плотностей (%)', 'Odległość zleceń (%)'],
  ['Стакан наживо', 'Live order book', 'Стакан в реальном времени', 'Arkusz zleceń na żywo'],
  ['Очікування стакана', 'Waiting for order book', 'Ожидание стакана', 'Oczekiwanie na arkusz zleceń'],
  ['У межах доступної глибини стакана біржі.', 'Within the exchange’s available order-book depth.', 'В пределах доступной глубины стакана биржи.', 'W granicach dostępnej głębokości arkusza giełdy.'],
  ['Відступ праворуч', 'Right margin', 'Отступ справа', 'Odstęp po prawej'],
  ['Вільне місце після останньої свічки перед шкалою цін.', 'Empty space after the last candle before the price scale.', 'Свободное место после последней свечи перед шкалой цен.', 'Wolne miejsce za ostatnią świecą przed skalą cen.'],
  ['Розмір відступу праворуч, від 0 до 500 свічок.', 'Right margin size, from 0 to 500 candles.', 'Размер отступа справа, от 0 до 500 свечей.', 'Wielkość odstępu po prawej, od 0 do 500 świec.'],
  ['Увімкніть обидва перемикачі, щоб показати повну сітку.', 'Enable both switches to show the full grid.', 'Включите оба переключателя, чтобы показать полную сетку.', 'Włącz oba przełączniki, aby wyświetlić pełną siatkę.'],
  ['свічок', 'candles', 'свечей', 'świec'],
] as const;
const languages: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
const dictionaries = Object.fromEntries(languages.map((language, index) => [language, {
  ...Object.fromEntries(additions.map(row => [row[0], row[index]])),
  ...hookChartLanguagePacks[language],
}])) as Record<SupportedLanguage, Record<string, string>>;

// The imported packs use original Russian/English keys; the integrated UI also uses
// Ukrainian phrases. Accept every language's values so already-rendered text can switch.
const keys = [...new Set(Object.values(dictionaries).flatMap(dictionary => Object.keys(dictionary)))];
const aliases = new Map<string, string>();
for (const key of keys) for (const dictionary of Object.values(dictionaries)) {
  const value = dictionary[key]?.trim();
  if (value && !aliases.has(value)) aliases.set(value, key);
}
for (const key of keys) aliases.set(key.trim(), key);

export function translateHookChartPhrase(language: SupportedLanguage, input: string): string {
  const key = aliases.get(input.trim());
  const translated = key ? (dictionaries[language][key] ?? dictionaries.uk[key]) : undefined;
  if (translated !== undefined) {
    return `${input.match(/^\s*/)?.[0] || ''}${translated}${input.match(/\s*$/)?.[0] || ''}`;
  }
  return translatePhrase(language, input);
}

export function resolveHookChartLanguage(preferences: HookChartPreferences | undefined, siteLanguage: SupportedLanguage): SupportedLanguage {
  // A later site selection supersedes a chart-specific choice, including when the
  // chart was closed during the site change. Old, inactive language preferences migrate here.
  return preferences?.siteLanguageAtSelection === siteLanguage && preferences.language
    ? normalizeLanguage(preferences.language) : siteLanguage;
}
