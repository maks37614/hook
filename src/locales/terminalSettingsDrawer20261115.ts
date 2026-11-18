/** Terminal settings drawer and workspace synchronization UI; translations only. */
import type { SupportedLanguage } from './types';
export const terminalSettingsDrawerRows = [
  [
    "header",
    "Налаштування термінала",
    "Terminal settings",
    "Настройки терминала",
    "Ustawienia Terminala"
  ],
  [
    "close",
    "Закрити налаштування Термінала",
    "Close Terminal settings",
    "Закрыть настройки Терминала",
    "Zamknij ustawienia Terminala"
  ],
  [
    "conflictAria",
    "Узгодження робочої області",
    "Workspace synchronization conflict",
    "Конфликт синхронизации рабочего пространства",
    "Konflikt synchronizacji obszaru roboczego"
  ],
  [
    "conflictDetails",
    "Локальна робоча область відрізняється від версії в профілі. Це можливо після змін в іншій вкладці, браузері або пристрої чи під час входу. Спочатку завантажте JSON-копію, щоб не втратити графіки.",
    "The local workspace differs from the version saved in your profile. This may happen after edits in another tab, browser or device, or during sign-in. Download a JSON backup first to protect your charts.",
    "Локальное рабочее пространство отличается от версии в профиле. Это возможно после изменений в другой вкладке, браузере или устройстве либо при входе. Сначала скачайте JSON-копию, чтобы не потерять графики.",
    "Lokalny obszar roboczy różni się od wersji zapisanej w profilu. Może to nastąpić po zmianach w innej karcie, przeglądarce lub na innym urządzeniu albo podczas logowania. Najpierw pobierz kopię JSON, aby nie utracić wykresów."
  ],
  [
    "conflictBackupFailed",
    "Не вдалося зберегти резервну копію в сховищі браузера. Завантажте JSON-файл, перш ніж відновлювати хмарну версію.",
    "Could not save the backup in browser storage. Download a JSON file before restoring the cloud version.",
    "Не удалось сохранить резервную копию в хранилище браузера. Скачайте JSON-файл перед восстановлением облачной версии.",
    "Nie udało się zapisać kopii zapasowej w pamięci przeglądarki. Pobierz plik JSON przed przywróceniem wersji z chmury."
  ],
  [
    "downloadBackup",
    "Завантажити JSON-копію",
    "Download JSON backup",
    "Скачать JSON-копию",
    "Pobierz kopię JSON"
  ],
  [
    "restoreCloud",
    "Повернути хмарну версію",
    "Restore cloud version",
    "Восстановить облачную версию",
    "Przywróć wersję z chmury"
  ],
  [
    "presetCoins",
    "Монети пресетів",
    "Preset coins",
    "Монеты пресетов",
    "Monety presetów"
  ],
  [
    "exchange",
    "Біржа",
    "Exchange",
    "Биржа",
    "Giełda"
  ],
  [
    "presetExchange",
    "Біржа пресету",
    "Preset exchange",
    "Биржа пресета",
    "Giełda presetu"
  ],
  [
    "allExchanges",
    "Усі біржі",
    "All exchanges",
    "Все биржи",
    "Wszystkie giełdy"
  ],
  [
    "market",
    "Ринок",
    "Market",
    "Рынок",
    "Rynek"
  ],
  [
    "presetMarket",
    "Ринок пресету",
    "Preset market",
    "Рынок пресета",
    "Rynek presetu"
  ],
  [
    "spotFutures",
    "Спот + ф'ючерси",
    "Spot + futures",
    "Спот + фьючерсы",
    "Spot + futures"
  ],
  [
    "futures",
    "Ф'ючерси",
    "Futures",
    "Фьючерсы",
    "Futures"
  ],
  [
    "spot",
    "Спот",
    "Spot",
    "Спот",
    "Spot"
  ],
  [
    "chartsPerPage",
    "Графіків на сторінці",
    "Charts per page",
    "Графиков на странице",
    "Wykresy na stronie"
  ],
  [
    "presetChartsPerPage",
    "Графіків на сторінці Термінала",
    "Charts per Terminal page",
    "Графиков на странице Терминала",
    "Wykresy na stronie Terminala"
  ],
  [
    "chartsPerPageHelp",
    "Діє для всіх графіків і пресетів. Наприклад, 30 монет при виборі 10 показуються на 3 сторінках — жодна монета не видаляється.",
    "Applies to all charts and presets. With 30 coins and a limit of 10, you get 3 pages; no coins are deleted.",
    "Действует для всех графиков и пресетов. При 30 монетах и лимите 10 будет 3 страницы — монеты не удаляются.",
    "Dotyczy wszystkich wykresów i presetów. Przy 30 monetach i limicie 10 otrzymasz 3 strony; żadna moneta nie zostanie usunięta."
  ],
  [
    "gridPresets",
    "Шаблони розташування сітки",
    "Grid layout templates",
    "Шаблоны расположения сетки",
    "Szablony układu siatki"
  ],
  [
    "columns",
    "Кількість колонок на екрані",
    "Number of columns on screen",
    "Количество колонок на экране",
    "Liczba kolumn na ekranie"
  ],
  [
    "autoFit",
    "Під розмір монітора (Auto-Fit)",
    "Fit monitor size (Auto-Fit)",
    "Под размер монитора (Auto-Fit)",
    "Dopasuj do monitora (Auto-Fit)"
  ],
  [
    "autoFitDesc",
    "Графіки займають рівно 100% висоти вікна без зайвого скролу",
    "Charts fill the window height without extra scrolling",
    "Графики занимают всю высоту окна без лишней прокрутки",
    "Wykresy wypełniają wysokość okna bez dodatkowego przewijania"
  ],
  [
    "autoFitAria",
    "Автоматично підігнати висоту графіків під екран",
    "Automatically fit charts to screen height",
    "Автоматически подогнать высоту графиков под экран",
    "Automatycznie dopasuj wysokość wykresów do ekranu"
  ],
  [
    "showClock",
    "Показувати годинник",
    "Show clock",
    "Показывать часы",
    "Pokaż zegar"
  ],
  [
    "clockDescription",
    "Годинник і меню торгових сесій у шапці Термінала",
    "Clock and trading-session menu in the Terminal header",
    "Часы и меню торговых сессий в шапке Терминала",
    "Zegar i menu sesji handlowych w nagłówku Terminala"
  ],
  [
    "clockAria",
    "Показувати годинник у Терміналі",
    "Show clock in Terminal",
    "Показывать часы в Терминале",
    "Pokaż zegar w Terminalu"
  ],
  [
    "blockHeight",
    "Масштаб / Висота блоків графіка",
    "Chart block scale / height",
    "Масштаб / высота блоков графиков",
    "Skala / wysokość paneli wykresów"
  ],
  [
    "heightCompact",
    "Компактний",
    "Compact",
    "Компактный",
    "Kompaktowy"
  ],
  [
    "heightMedium",
    "Стандартний",
    "Standard",
    "Стандартный",
    "Standardowy"
  ],
  [
    "heightLarge",
    "Великий",
    "Large",
    "Большой",
    "Duży"
  ],
  [
    "initialViewAria",
    "Початковий показ графіків Термінала",
    "Initial view of Terminal charts",
    "Начальный вид графиков Терминала",
    "Początkowy widok wykresów Terminala"
  ],
  [
    "initialView",
    "Початковий показ графіків",
    "Initial chart view",
    "Начальный вид графиков",
    "Początkowy widok wykresów"
  ],
  [
    "initialViewHelp",
    "Масштаб і відступ під час відкриття кожного графіка Термінала. Зміни застосовуються лише тут і зберігаються для вашого робочого простору.",
    "Scale and spacing when opening each Terminal chart. Changes apply only here and are saved in your workspace.",
    "Масштаб и отступ при открытии каждого графика Терминала. Изменения применяются только здесь и сохраняются в рабочем пространстве.",
    "Skala i odstęp przy otwieraniu każdego wykresu Terminala. Zmiany dotyczą tylko tego miejsca i są zapisywane w obszarze roboczym."
  ],
  [
    "resetInitial",
    "Відновити типовий показ графіків",
    "Restore default chart view",
    "Восстановить вид графиков по умолчанию",
    "Przywróć domyślny widok wykresów"
  ],
  [
    "initialVisible",
    "Видимі свічки при відкритті",
    "Candles visible on open",
    "Видимые свечи при открытии",
    "Świece widoczne po otwarciu"
  ],
  [
    "initialVisibleAria",
    "Початкова кількість свічок Термінала",
    "Initial number of Terminal candles",
    "Начальное количество свечей Терминала",
    "Początkowa liczba świec Terminala"
  ],
  [
    "rightGap",
    "Відступ від шкали ціни праворуч",
    "Right-side gap before price scale",
    "Отступ от шкалы цен справа",
    "Odstęp od skali cen po prawej"
  ],
  [
    "rightGapAria",
    "Початковий відступ Термінала в барах",
    "Initial Terminal offset in bars",
    "Начальный отступ Терминала в барах",
    "Początkowy odstęp Terminala w słupkach"
  ],
  [
    "verticalZoom",
    "Вертикальний масштаб ціни",
    "Vertical price scale",
    "Вертикальный масштаб цены",
    "Pionowa skala ceny"
  ],
  [
    "verticalZoomAria",
    "Початковий вертикальний масштаб Термінала",
    "Initial vertical scale in Terminal",
    "Начальный вертикальный масштаб Терминала",
    "Początkowa skala pionowa Terminala"
  ],
  [
    "autoPrice",
    "Автомасштабування ціни при відкритті",
    "Auto-scale price on open",
    "Автомасштаб цены при открытии",
    "Automatyczna skala ceny po otwarciu"
  ],
  [
    "autoPriceAria",
    "Початковий автоматичний масштаб ціни Термінала",
    "Initial automatic price scale in Terminal",
    "Начальный автоматический масштаб цены Терминала",
    "Początkowa automatyczna skala ceny Terminala"
  ],
  [
    "applyInitial",
    "Застосувати початковий вигляд",
    "Apply initial view",
    "Применить начальный вид",
    "Zastosuj widok początkowy"
  ],
  [
    "fitHistory",
    "Показати всю завантажену історію",
    "Fit all loaded history",
    "Показать всю загруженную историю",
    "Dopasuj całą wczytaną historię"
  ],
  [
    "defaultsApplied",
    "Стандартні параметри встановлено. Натисніть «Готово», щоб зберегти їх у своєму профілі.",
    "Default settings applied. Press Done to save them to your profile.",
    "Стандартные настройки применены. Нажмите «Готово», чтобы сохранить их в профиле.",
    "Zastosowano ustawienia domyślne. Kliknij „Gotowe”, aby zapisać je w swoim profilu."
  ],
  [
    "allLoadedCandles",
    "Уся історія",
    "All history",
    "Вся история",
    "Cała historia"
  ],
  [
    "initialApplied",
    "Усі графіки підігнано під завантажену історію. Значення вище оновлено — натисніть «Готово», щоб зберегти.",
    "All Terminal charts fitted to loaded history. The controls above are updated — press Done to save.",
    "Все графики подогнаны под загруженную историю. Настройки выше обновлены — нажмите «Готово», чтобы сохранить.",
    "Wszystkie wykresy dopasowano do wczytanej historii. Ustawienia powyżej zaktualizowano — kliknij „Gotowe”, aby zapisać."
  ],
  [
    "initialInfo",
    "Повзунки змінюють параметри для наступного відкриття графіків. «Застосувати початковий вигляд» повертає стандартні значення всіх чотирьох параметрів і показує їх на графіках. Окрема кнопка дозволяє підігнати всю історію. «Готово» зберігає вибрані параметри в персональному профілі Термінала. Автомасштабування у шапці має пріоритет над ручним вертикальним масштабом.",
    "Sliders adjust each chart's startup view. Apply initial view restores all four built-in defaults and previews them on the charts. A separate button fits the entire history. Done saves the selected settings to your personal Terminal profile. Header auto-scaling overrides manual vertical zoom.",
    "Ползунки задают параметры при открытии графиков. «Применить начальный вид» восстанавливает все четыре стандартных значения и показывает их на графиках. Отдельная кнопка подгоняет всю историю. «Готово» сохраняет настройки в личном профиле Терминала. Автомасштабирование в шапке имеет приоритет над ручным вертикальным масштабом.",
    "Suwaki określają wygląd wykresów przy otwieraniu. „Zastosuj widok początkowy” przywraca cztery ustawienia domyślne i pokazuje je na wykresach. Osobny przycisk dopasowuje całą historię. „Gotowe” zapisuje ustawienia w osobistym profilu Terminala. Automatyczna skala w nagłówku ma pierwszeństwo przed ręczną skalą pionową."
  ],
  [
    "globalTimeframe",
    "Глобальний таймфрейм (для всіх графіків одразу)",
    "Global timeframe (all charts at once)",
    "Общий таймфрейм (для всех графиков сразу)",
    "Globalny interwał (wszystkie wykresy naraz)"
  ],
  [
    "quickPresets",
    "Швидкі набори монет для трейдингу",
    "Quick trading coin presets",
    "Быстрые наборы монет для торговли",
    "Szybkie zestawy monet do handlu"
  ],
  [
    "btcFocus",
    "BTC Focus (1 графік)",
    "BTC Focus (1 chart)",
    "BTC Focus (1 график)",
    "BTC Focus (1 wykres)"
  ],
  [
    "btcFocusHelp",
    "Повний екран, максимальна концентрація",
    "Full screen, maximum focus",
    "Полный экран, максимальная концентрация",
    "Pełny ekran, maksymalne skupienie"
  ],
  [
    "topLiquidity",
    "Топ-3 Ліквідність",
    "Top 3 by liquidity",
    "Топ-3 по ликвидности",
    "Top 3 według płynności"
  ],
  [
    "threeCharts",
    "3 графіки",
    "3 charts",
    "3 графика",
    "3 wykresy"
  ],
  [
    "square4",
    "2x2 Квадрат (Топ-4)",
    "2x2 square (Top 4)",
    "2x2 квадрат (Топ-4)",
    "2x2 kwadrat (Top 4)"
  ],
  [
    "fourCharts",
    "4 графіки",
    "4 charts",
    "4 графика",
    "4 wykresy"
  ],
  [
    "topPatterns",
    "Топ-4 монети з формаціями",
    "Top 4 coins with patterns",
    "Топ-4 монеты с формациями",
    "Top 4 monety z formacjami"
  ],
  [
    "topPatternsHelp",
    "Монети з найвищим скорингом патернів",
    "Coins with the highest pattern scores",
    "Монеты с самыми высокими оценками паттернов",
    "Monety o najwyższych ocenach formacji"
  ],
  [
    "patterns",
    "Патерни",
    "Patterns",
    "Паттерны",
    "Formacje"
  ],
  [
    "clearWorkspace",
    "Очистити робоче місце",
    "Clear workspace",
    "Очистить рабочее место",
    "Wyczyść obszar roboczy"
  ],
  [
    "done",
    "Готово",
    "Done",
    "Готово",
    "Gotowe"
  ],
  [
    "syncPresetConflict",
    "Локальні графіки відрізняються від хмарної версії. Збереження в профіль призупинено, але графіки залишилися в цьому браузері.",
    "Local charts differ from the cloud version. Saving to your profile is paused, but your charts remain in this browser.",
    "Локальные графики отличаются от облачной версии. Сохранение в профиль приостановлено, но графики остались в этом браузере.",
    "Lokalne wykresy różnią się od wersji w chmurze. Zapisywanie w profilu zostało wstrzymane, ale wykresy pozostały w tej przeglądarce."
  ],
  [
    "syncPresetFailed",
    "Не вдалося синхронізувати пресети.",
    "Could not synchronize presets.",
    "Не удалось синхронизировать пресеты.",
    "Nie udało się zsynchronizować presetów."
  ],
  [
    "syncDownload",
    "Завантажити локальну копію (.json)",
    "Download local backup (.json)",
    "Скачать локальную копию (.json)",
    "Pobierz lokalną kopię (.json)"
  ],
  [
    "syncRetry",
    "Повторити збереження",
    "Retry saving",
    "Повторить сохранение",
    "Ponów zapisywanie"
  ],
  [
    "presetsFromFavorites",
    "Створити з обраних монет",
    "Create from favorites",
    "Создать из избранных монет",
    "Utwórz z ulubionych monet"
  ],
  [
    "presetsFromWorkspace",
    "Зберегти монети термінала",
    "Save Terminal coins",
    "Сохранить монеты терминала",
    "Zapisz monety Terminala"
  ],
  [
    "presetsExport",
    "Експорт JSON",
    "Export JSON",
    "Экспорт JSON",
    "Eksport JSON"
  ],
  [
    "presetsImport",
    "Імпорт JSON",
    "Import JSON",
    "Импорт JSON",
    "Import JSON"
  ],
  [
    "presetsImportAria",
    "Імпортувати JSON-копію Термінала",
    "Import Terminal JSON backup",
    "Импортировать JSON-копию Терминала",
    "Zaimportuj kopię JSON Terminala"
  ],
  [
    "presetsGuest",
    "Пресети зберігаються на цьому пристрої. Увійдіть для збереження у профілі.",
    "Presets are stored on this device. Sign in to save them to your profile.",
    "Пресеты сохраняются на этом устройстве. Войдите, чтобы сохранить их в профиле.",
    "Presety są zapisywane na tym urządzeniu. Zaloguj się, aby zapisywać je w profilu."
  ],
  [
    "presetName",
    "Назва",
    "Name",
    "Название",
    "Nazwa"
  ],
  [
    "presetNameAria",
    "Назва пресету",
    "Preset name",
    "Название пресета",
    "Nazwa presetu"
  ],
  [
    "presetNameExample",
    "Наприклад, Мої альткоїни",
    "For example, My altcoins",
    "Например, Мои альткоины",
    "Na przykład: Moje altcoiny"
  ],
  [
    "presetClose",
    "Закрити створення пресету",
    "Close preset creation",
    "Закрыть создание пресета",
    "Zamknij tworzenie presetu"
  ],
  [
    "presetCoinsLabel",
    "Монети:",
    "Coins:",
    "Монеты:",
    "Monety:"
  ],
  [
    "presetFavorites",
    "Обрані монети",
    "Favorite coins",
    "Избранные монеты",
    "Ulubione monety"
  ],
  [
    "presetCurrent",
    "Поточні графіки",
    "Current charts",
    "Текущие графики",
    "Bieżące wykresy"
  ],
  [
    "presetSelectAll",
    "Вибрати всі",
    "Select all",
    "Выбрать все",
    "Zaznacz wszystkie"
  ],
  [
    "presetClearSelection",
    "Зняти вибір",
    "Clear selection",
    "Снять выбор",
    "Wyczyść zaznaczenie"
  ],
  [
    "presetNoFavorites",
    "Додайте монети до обраних у скрінері або виберіть поточні графіки. Для обраних монет мають бути доступні дані вибраної біржі та ринку.",
    "Add coins to favorites in Screener or select current charts. Market data must be available for favorites on the selected exchange and market.",
    "Добавьте монеты в избранное в Скринере или выберите текущие графики. Для избранных монет должны быть доступны данные выбранной биржи и рынка.",
    "Dodaj monety do ulubionych w Skanerze lub wybierz bieżące wykresy. Dla ulubionych monet muszą być dostępne dane wybranej giełdy i rynku."
  ],
  [
    "presetNoCharts",
    "Додайте графіки до термінала.",
    "Add charts to Terminal.",
    "Добавьте графики в Терминал.",
    "Dodaj wykresy do Terminala."
  ],
  [
    "presetDelete",
    "Видалити пресет",
    "Delete preset",
    "Удалить пресет",
    "Usuń preset"
  ],
  [
    "presetEmpty",
    "Збережіть власний набір монет, щоб відкривати його одним натисканням.",
    "Save a custom coin set to open it with one click.",
    "Сохраните свой набор монет, чтобы открывать его одним нажатием.",
    "Zapisz własny zestaw monet, aby otwierać go jednym kliknięciem."
  ],
  [
    "settingsTooltip",
    "Налаштування робочого простору",
    "Workspace settings",
    "Настройки рабочего пространства",
    "Ustawienia obszaru roboczego"
  ],
  [
    "conflictTooltip",
    "Налаштування · локальні зміни потребують узгодження",
    "Settings · local changes need reconciliation",
    "Настройки · локальные изменения требуют согласования",
    "Ustawienia · lokalne zmiany wymagają uzgodnienia"
  ],
  [
    "conflictIndicator",
    "Потрібне узгодження робочої області",
    "Workspace changes need reconciliation",
    "Требуется согласование рабочего пространства",
    "Wymagane uzgodnienie obszaru roboczego"
  ],
  [
    "presetPanelAria",
    "Пресети монет термінала",
    "Terminal coin presets",
    "Пресеты монет терминала",
    "Presety monet Terminala"
  ],
  [
    "conflictHelpButton",
    "Пояснення конфлікту синхронізації",
    "Explain the sync conflict",
    "Объяснение конфликта синхронизации",
    "Wyjaśnij konflikt synchronizacji"
  ],
  [
    "conflictHelpTitle",
    "Чому з’явилося це попередження?",
    "Why am I seeing this warning?",
    "Почему появилось это предупреждение?",
    "Dlaczego widzę to ostrzeżenie?"
  ],
  [
    "conflictHelpReason",
    "Графіки та пресети в цьому браузері відрізняються від збереженої версії в профілі. Це може статися після змін в іншій вкладці, браузері чи пристрої або під час входу в акаунт. Щоб не перезаписати дані, автоматичну синхронізацію призупинено.",
    "Charts and presets in this browser differ from the saved profile version. This can happen after edits in another tab, browser or device, or during sign-in. Automatic syncing is paused to avoid overwriting your data.",
    "Графики и пресеты в этом браузере отличаются от версии в профиле. Это бывает после изменений в другой вкладке, браузере или устройстве либо при входе в аккаунт. Автосинхронизация приостановлена, чтобы не перезаписать данные.",
    "Wykresy i presety w tej przeglądarce różnią się od wersji zapisanej w profilu. Może to nastąpić po zmianach w innej karcie, przeglądarce lub na innym urządzeniu albo podczas logowania. Synchronizacja automatyczna jest wstrzymana, aby nie nadpisać danych."
  ],
  [
    "conflictHelpStepsTitle",
    "Як безпечно вирішити",
    "How to resolve it safely",
    "Как безопасно решить проблему",
    "Jak bezpiecznie rozwiązać problem"
  ],
  [
    "conflictHelpBackup",
    "Спочатку натисніть «Завантажити JSON-копію» та збережіть файл на комп’ютері. Він містить поточні локальні графіки, пресети й налаштування.",
    "First click “Download JSON backup” and save the file on your computer. It contains your current local charts, presets and settings.",
    "Сначала нажмите «Скачать JSON-копию» и сохраните файл на компьютере. Он содержит текущие локальные графики, пресеты и настройки.",
    "Najpierw kliknij „Pobierz kopię JSON” i zapisz plik na komputerze. Zawiera on bieżące lokalne wykresy, presety i ustawienia."
  ],
  [
    "conflictHelpCloud",
    "Якщо хочете залишити версію з профілю, натисніть «Повернути хмарну версію» й підтвердьте дію. Поточна локальна робоча область буде замінена.",
    "If you want to keep the profile version, click “Restore cloud version” and confirm. The current local workspace will be replaced.",
    "Если хотите оставить версию из профиля, нажмите «Восстановить облачную версию» и подтвердите действие. Текущая локальная рабочая область будет заменена.",
    "Jeśli chcesz zachować wersję z profilu, kliknij „Przywróć wersję z chmury” i potwierdź. Bieżący lokalny obszar roboczy zostanie zastąpiony."
  ],
  [
    "conflictHelpLocal",
    "Якщо потрібні локальні графіки, після збереження JSON-копії відновіть хмарну версію, дочекайтеся завантаження Термінала та імпортуйте збережений файл через «Пресети монет → Імпорт JSON». Підтвердьте заміну робочої області.",
    "If you need your local charts, save the JSON backup first, restore the cloud version, let Terminal finish loading, then import the saved file via “Coin presets → Import JSON”. Confirm that the workspace will be replaced.",
    "Если нужны локальные графики, сначала сохраните JSON-копию, восстановите облачную версию, дождитесь загрузки Терминала и импортируйте сохранённый файл через «Пресеты монет → Импорт JSON». Подтвердите замену рабочей области.",
    "Jeśli chcesz zachować lokalne wykresy, najpierw zapisz kopię JSON, przywróć wersję z chmury, poczekaj na załadowanie Terminala, a potem zaimportuj zapisany plik przez „Presety monet → Import JSON”. Potwierdź zastąpienie obszaru roboczego."
  ],
  [
    "conflictHelpSafety",
    "Увага: версії не об’єднуються автоматично. Не відновлюйте хмарний стан без JSON-копії, якщо хочете зберегти локальні зміни.",
    "Important: versions are not merged automatically. Do not restore the cloud version without a JSON backup if you need your local changes.",
    "Важно: версии не объединяются автоматически. Не восстанавливайте облачную версию без JSON-копии, если нужно сохранить локальные изменения.",
    "Ważne: wersje nie są automatycznie łączone. Nie przywracaj wersji z chmury bez kopii JSON, jeśli chcesz zachować lokalne zmiany."
  ]
] as const;
const languages: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const terminalSettingsDrawerStrings = Object.fromEntries(
  languages.map((language, index) => [language, Object.fromEntries(
    terminalSettingsDrawerRows.map(row => [`terminal.drawer.${row[0]}`, row[index + 1]]),
  )]),
) as Record<SupportedLanguage, Record<string, string>>;
