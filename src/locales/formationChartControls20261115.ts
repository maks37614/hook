/** Chart controls used by the Formations detail and shared chart surfaces. */
import type { SupportedLanguage } from './types';
const rows=[
  [
    "Формацію збережено в архіві",
    "Formation saved in archive",
    "Формация сохранена в архиве",
    "Formacja zapisana w archiwum"
  ],
  [
    "Додати монету та формацію в архів",
    "Save coin and formation to archive",
    "Добавить монету и формацию в архив",
    "Zapisz monetę i formację w archiwum"
  ],
  [
    "Відкрити повний графік",
    "Open full chart",
    "Открыть полный график",
    "Otwórz pełny wykres"
  ],
  [
    "Оновлення в реальному часі ({{mode}})",
    "Live updates ({{mode}})",
    "Обновления в реальном времени ({{mode}})",
    "Aktualizacje na żywo ({{mode}})"
  ],
  [
    "Приховати рівні Вхід, TP і SL",
    "Hide Entry, TP and SL levels",
    "Скрыть уровни входа, TP и SL",
    "Ukryj poziomy wejścia, TP i SL"
  ],
  [
    "Показати рівні Вхід, TP і SL",
    "Show Entry, TP and SL levels",
    "Показать уровни входа, TP и SL",
    "Pokaż poziomy wejścia, TP i SL"
  ],
  [
    "TP/SL: немає трьох розрахованих рівнів",
    "TP/SL: three calculated levels unavailable",
    "TP/SL: нет трёх рассчитанных уровней",
    "TP/SL: brak trzech wyliczonych poziomów"
  ],
  [
    "Увімкнути або вимкнути всі три рівні: Вхід, TP, SL",
    "Toggle all three levels: Entry, TP, SL",
    "Включить или выключить все три уровня: вход, TP, SL",
    "Włącz lub wyłącz wszystkie trzy poziomy: wejście, TP, SL"
  ],
  [
    "Потрібні ціни входу, цілі та стопу",
    "Entry, target and stop prices are required",
    "Нужны цены входа, цели и стопа",
    "Wymagane są ceny wejścia, celu i stopu"
  ],
  [
    "Наблизити до останніх свічок",
    "Zoom to the latest candles",
    "Приблизить последние свечи",
    "Powiększ najnowsze świece"
  ],
  [
    "Останні свічки",
    "Latest candles",
    "Последние свечи",
    "Najnowsze świece"
  ],
  [
    "Вписати всю завантажену історію свічок",
    "Fit all loaded candle history",
    "Вместить всю загруженную историю свечей",
    "Dopasuj całą załadowaną historię świec"
  ],
  [
    "Вся історія",
    "All history",
    "Вся история",
    "Cała historia"
  ],
  [
    "Час до закриття поточної {{timeframe}} свічки: {{remaining}}",
    "Time until current {{timeframe}} candle closes: {{remaining}}",
    "Время до закрытия текущей свечи {{timeframe}}: {{remaining}}",
    "Czas do zamknięcia bieżącej świecy {{timeframe}}: {{remaining}}"
  ],
  [
    "Час до закриття свічки",
    "Time until candle close",
    "Время до закрытия свечи",
    "Czas do zamknięcia świecy"
  ],
  [
    "Помилка отримання свічок",
    "Error loading candles",
    "Ошибка загрузки свечей",
    "Błąd ładowania świec"
  ],
  [
    "Цей локальний час не існує або введений некоректно",
    "This local time does not exist or is invalid",
    "Это местное время не существует или введено неверно",
    "Ten czas lokalny nie istnieje lub jest nieprawidłowy"
  ],
  [
    "Для майбутньої дати ще немає свічок",
    "No candles are available for a future date",
    "Для будущей даты ещё нет свечей",
    "Brak świec dla przyszłej daty"
  ],
  [
    "Для цього часу ще немає свічки",
    "No candle is available for this time",
    "Для этого времени ещё нет свечи",
    "Brak świecy dla tego czasu"
  ],
  [
    "Не вдалося завантажити цю ділянку історії",
    "Could not load this part of the history",
    "Не удалось загрузить этот участок истории",
    "Nie udało się wczytać tego fragmentu historii"
  ],
  [
    "Перейти до дати або часу",
    "Jump to date or time",
    "Перейти к дате или времени",
    "Przejdź do daty lub godziny"
  ],
  [
    "Графік",
    "Chart",
    "График",
    "Wykres"
  ],
  [
    "Сьогодні",
    "Today",
    "Сегодня",
    "Dzisiaj"
  ],
  [
    "Вчора",
    "Yesterday",
    "Вчера",
    "Wczoraj"
  ],
  [
    "−2 дні",
    "−2 days",
    "−2 дня",
    "−2 dni"
  ],
  [
    "−3 дні",
    "−3 days",
    "−3 дня",
    "−3 dni"
  ],
  [
    "−7 днів",
    "−7 days",
    "−7 дней",
    "−7 dni"
  ],
  [
    "Цілий день",
    "Full day",
    "Целый день",
    "Cały dzień"
  ],
  [
    "Конкретний час",
    "Specific time",
    "Конкретное время",
    "Konkretna godzina"
  ],
  [
    "Дата",
    "Date",
    "Дата",
    "Data"
  ],
  [
    "Час",
    "Time",
    "Время",
    "Godzina"
  ],
  [
    "Завантаження…",
    "Loading…",
    "Загрузка…",
    "Ładowanie…"
  ],
  [
    "Перейти",
    "Go",
    "Перейти",
    "Przejdź"
  ],
  [
    "Сховати Liq / каскад",
    "Hide Liq / cascade",
    "Скрыть Liq / каскад",
    "Ukryj Liq / kaskadę"
  ],
  [
    "Показати Liq / каскад",
    "Show Liq / cascade",
    "Показать Liq / каскад",
    "Pokaż Liq / kaskadę"
  ],
  [
    "Сховати блок ліквідацій",
    "Hide liquidation panel",
    "Скрыть панель ликвидаций",
    "Ukryj panel likwidacji"
  ],
  [
    "Показати блок ліквідацій",
    "Show liquidation panel",
    "Показать панель ликвидаций",
    "Pokaż panel likwidacji"
  ],
  [
    "Каскад:",
    "Cascade:",
    "Каскад:",
    "Kaskada:"
  ],
  [
    "Немає",
    "None",
    "Нет",
    "Brak"
  ],
  [
    "Рух пальцем без утримання — перетягнути графік. Коротко утримуйте палець для вільного курсора; довше утримуйте нерухомо для лупи. Після появи лупи другим пальцем змінюйте її масштаб по правій шкалі цін. На комп’ютері утримуйте середню кнопку миші (колесо), щоб показати лупу. Два пальці без активної лупи — масштаб графіка.",
    "Drag with one finger to move the chart. Hold briefly for the free cursor; hold longer without moving for the magnifier. With the magnifier open, drag a second finger along the right price scale to zoom it. On desktop, hold the middle mouse button to show the magnifier. Two fingers without the magnifier zoom the chart.",
    "Перемещайте график одним пальцем без удержания. Короткое удержание открывает свободный курсор; более длительное неподвижное удержание — лупу. Когда лупа активна, вторым пальцем изменяйте её масштаб по правой шкале цен. На компьютере удерживайте среднюю кнопку мыши для лупы. Два пальца без лупы масштабируют график.",
    "Przeciągnij jednym palcem, aby przesunąć wykres. Krótkie przytrzymanie włącza swobodny kursor, a dłuższe bez ruchu — lupę. Gdy lupa jest widoczna, drugim palcem zmieniaj jej powiększenie na prawej skali cen. Na komputerze przytrzymaj środkowy przycisk myszy, aby wyświetlić lupę. Dwa palce bez lupy powiększają wykres."
  ]
] as const;
const languages:SupportedLanguage[]=['uk','en','ru','pl'];
export const formationChartControls=Object.fromEntries(languages.map((lang,index)=>[lang,Object.fromEntries(rows.map(r=>[r[0],r[index]]))])) as Record<SupportedLanguage,Record<string,string>>;
export const formationChartControlRows=rows;
