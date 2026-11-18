/** Archived formations modal: reviewed UI and dynamic messages, all four site languages. */
import type { SupportedLanguage } from './types';

export const archiveModalRows = [
  [
    "recent",
    "Нещодавно",
    "Recently",
    "Недавно",
    "Niedawno"
  ],
  [
    "title",
    "Збережені формації",
    "Saved formations",
    "Сохранённые формации",
    "Zapisane formacje"
  ],
  [
    "privateStorage",
    "Приватне сховище",
    "Private storage",
    "Личное хранилище",
    "Prywatne archiwum"
  ],
  [
    "linkedTo",
    "Прив'язано до вашого профілю:",
    "Linked to your profile:",
    "Привязано к вашему профилю:",
    "Powiązano z Twoim profilem:"
  ],
  [
    "localOnly",
    "Збережено локально. Увійдіть, щоб зберігати у хмарному профілі.",
    "Saved locally. Sign in to save to your cloud profile.",
    "Сохранено локально. Войдите, чтобы сохранять в облачном профиле.",
    "Zapisano lokalnie. Zaloguj się, aby zapisywać w profilu w chmurze."
  ],
  [
    "exportTitle",
    "Завантажити копію мого архіву (JSON)",
    "Download a copy of my archive (JSON)",
    "Скачать копию моего архива (JSON)",
    "Pobierz kopię mojego archiwum (JSON)"
  ],
  [
    "export",
    "Експорт",
    "Export",
    "Экспорт",
    "Eksport"
  ],
  [
    "clearTitle",
    "Очистити всі мої збережені формації",
    "Clear all my saved formations",
    "Очистить все мои сохранённые формации",
    "Usuń wszystkie moje zapisane formacje"
  ],
  [
    "clear",
    "Очистити мій архів",
    "Clear my archive",
    "Очистить мой архив",
    "Wyczyść moje archiwum"
  ],
  [
    "signIn",
    "Увійти",
    "Sign in",
    "Войти",
    "Zaloguj się"
  ],
  [
    "close",
    "Закрити",
    "Close",
    "Закрыть",
    "Zamknij"
  ],
  [
    "clearConfirm",
    "Видалити всі збережені формації ({{count}}) з вашого особистого архіву? Дані інших користувачів не зміняться.",
    "Delete all saved formations ({{count}}) from your personal archive? Other users' data will not be affected.",
    "Удалить все сохранённые формации ({{count}}) из вашего личного архива? Данные других пользователей не изменятся.",
    "Usunąć wszystkie zapisane formacje ({{count}}) z prywatnego archiwum? Dane innych użytkowników pozostaną bez zmian."
  ],
  [
    "clearing",
    "Очищення…",
    "Clearing…",
    "Очистка…",
    "Usuwanie…"
  ],
  [
    "clearYes",
    "Так, очистити мій архів",
    "Yes, clear my archive",
    "Да, очистить мой архив",
    "Tak, wyczyść moje archiwum"
  ],
  [
    "cancel",
    "Скасувати",
    "Cancel",
    "Отмена",
    "Anuluj"
  ],
  [
    "searchPlaceholder",
    "Пошук за монетою (BTC, SOL…) або патерном…",
    "Search by coin (BTC, SOL…) or pattern…",
    "Поиск по монете (BTC, SOL…) или паттерну…",
    "Szukaj monety (BTC, SOL…) lub formacji…"
  ],
  [
    "allExchanges",
    "Усі біржі",
    "All exchanges",
    "Все биржи",
    "Wszystkie giełdy"
  ],
  [
    "allTypes",
    "Усі типи",
    "All types",
    "Все типы",
    "Wszystkie typy"
  ],
  [
    "bullishPlural",
    "Бичачі ▲",
    "Bullish ▲",
    "Бычьи ▲",
    "Wzrostowe ▲"
  ],
  [
    "bearishPlural",
    "Ведмежі ▼",
    "Bearish ▼",
    "Медвежьи ▼",
    "Spadkowe ▼"
  ],
  [
    "loading",
    "Завантаження збережених формацій…",
    "Loading saved formations…",
    "Загрузка сохранённых формаций…",
    "Wczytywanie zapisanych formacji…"
  ],
  [
    "empty",
    "Збережених формацій поки немає",
    "No saved formations yet",
    "Пока нет сохранённых формаций",
    "Brak zapisanych formacji"
  ],
  [
    "noResults",
    "Нічого не знайдено",
    "No results found",
    "Ничего не найдено",
    "Nie znaleziono wyników"
  ],
  [
    "emptyHelp",
    "Щоб зберегти формацію, відкрийте монету й натисніть «Додати в архів» над графіком.",
    "To save a formation, open a coin and select “Add to archive” above the chart.",
    "Чтобы сохранить формацию, откройте монету и нажмите «Добавить в архив» над графиком.",
    "Aby zapisać formację, otwórz monetę i wybierz „Dodaj do archiwum” nad wykresem."
  ],
  [
    "noResultsHelp",
    "За вибраними критеріями формацій немає. Змініть фільтри або очистьте пошук.",
    "No formations match your criteria. Change the filters or clear the search.",
    "По выбранным условиям формации не найдены. Измените фильтры или очистите поиск.",
    "Brak formacji spełniających kryteria. Zmień filtry lub wyczyść wyszukiwanie."
  ],
  [
    "deleteConfirm",
    "Видалити?",
    "Delete?",
    "Удалить?",
    "Usunąć?"
  ],
  [
    "yes",
    "Так",
    "Yes",
    "Да",
    "Tak"
  ],
  [
    "no",
    "Ні",
    "No",
    "Нет",
    "Nie"
  ],
  [
    "deleteTitle",
    "Видалити з архіву",
    "Remove from archive",
    "Удалить из архива",
    "Usuń z archiwum"
  ],
  [
    "bullish",
    "Бичачий",
    "Bullish",
    "Бычий",
    "Wzrostowy"
  ],
  [
    "bearish",
    "Ведмежий",
    "Bearish",
    "Медвежий",
    "Spadkowy"
  ],
  [
    "neutral",
    "Нейтральний",
    "Neutral",
    "Нейтральный",
    "Neutralny"
  ],
  [
    "confluenceLabel",
    "Узгодженість",
    "Confluence",
    "Согласованность",
    "Zgodność sygnałów"
  ],
  [
    "confluenceHelpTitle",
    "Що означає оцінка узгодженості?",
    "What does the confluence score mean?",
    "Что означает оценка согласованности?",
    "Co oznacza ocena zgodności sygnałów?"
  ],
  [
    "confluenceHelp",
    "Це збережена оцінка технічних підтверджень формації за алгоритмом h00k. Вона відображає узгодженість доступних сигналів на момент аналізу, а не ймовірність прибуткової угоди чи гарантію руху ціни.",
    "This is h00k's saved technical confluence score for the formation. It reflects agreement among available signals at analysis time, not the probability of a profitable trade or a guarantee of price movement.",
    "Это сохранённая оценка технических подтверждений формации по алгоритму h00k. Она отражает согласованность доступных сигналов на момент анализа, а не вероятность прибыльной сделки или гарантию движения цены.",
    "To zapisana ocena zgodności sygnałów technicznych formacji według algorytmu h00k. Odzwierciedla zgodność dostępnych sygnałów w chwili analizy, a nie prawdopodobieństwo zyskownej transakcji ani gwarancję ruchu ceny."
  ],
  [
    "openChart",
    "Графік",
    "Chart",
    "График",
    "Wykres"
  ],
  [
    "entryReason",
    "Причина входу",
    "Entry reason",
    "Причина входа",
    "Powód wejścia"
  ],
  [
    "entryReasonMissing",
    "Причину входу не вказано для цього запису.",
    "No entry reason was provided for this record.",
    "Причина входа для этой записи не указана.",
    "Dla tego wpisu nie podano powodu wejścia."
  ],
  [
    "entry",
    "Точка входу:",
    "Entry:",
    "Точка входа:",
    "Punkt wejścia:"
  ],
  [
    "target",
    "Ціль (тейк):",
    "Target (take profit):",
    "Цель (тейк):",
    "Cel (take profit):"
  ],
  [
    "stopLoss",
    "Стоп-лосс:",
    "Stop-loss:",
    "Стоп-лосс:",
    "Stop-loss:"
  ],
  [
    "savedPrice",
    "Ціна збереження:",
    "Price when saved:",
    "Цена при сохранении:",
    "Cena przy zapisie:"
  ],
  [
    "markers",
    "Збережено міток: {{count}}",
    "Saved markers: {{count}}",
    "Сохранено меток: {{count}}",
    "Zapisane znaczniki: {{count}}"
  ],
  [
    "neck",
    "Шия",
    "Neckline",
    "Линия шеи",
    "Linia szyi"
  ],
  [
    "support",
    "Підтримка",
    "Support",
    "Поддержка",
    "Wsparcie"
  ],
  [
    "resistance",
    "Опір",
    "Resistance",
    "Сопротивление",
    "Opór"
  ],
  [
    "total",
    "Всього в особистому архіві",
    "Total in personal archive",
    "Всего в личном архиве",
    "Łącznie w prywatnym archiwum"
  ],
  [
    "privacy",
    "Усі збереження ізольовані та захищені правилами безпеки",
    "Saved items are isolated and protected by access controls",
    "Все сохранённые данные изолированы и защищены правилами доступа",
    "Zapisane dane są odizolowane i chronione regułami dostępu"
  ]
] as const;
const languages: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const archiveModalStrings = Object.fromEntries(languages.map((language, index) => [
  language, Object.fromEntries(archiveModalRows.map(row => ['archive.' + row[0], row[index + 1]])),
])) as Record<SupportedLanguage, Record<string, string>>;
