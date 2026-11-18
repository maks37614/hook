/** Watchlist drawer labels and dynamic exchange-quote feedback. */
import type { SupportedLanguage } from './types';
export const watchlistUiRows = [
  [
    "quoteLoading",
    "Завантажуємо котирування з біржі…",
    "Loading exchange quotes…",
    "Загружаем котировки с биржи…",
    "Pobieranie notowań z giełdy…"
  ],
  [
    "quoteRetry",
    "Не вдалося оновити котирування. Повторимо запит автоматично.",
    "Could not refresh quotes. We will retry automatically.",
    "Не удалось обновить котировки. Повторим запрос автоматически.",
    "Nie udało się odświeżyć notowań. Spróbujemy ponownie automatycznie."
  ],
  [
    "quoteUnavailable",
    "Котирування біржі тимчасово недоступні. Монета залишається в обраному.",
    "Exchange quotes are temporarily unavailable. This coin remains in your favorites.",
    "Котировки биржи временно недоступны. Монета остаётся в избранном.",
    "Notowania giełdowe są tymczasowo niedostępne. Moneta pozostaje w ulubionych."
  ],
  [
    "quoteMissing",
    "Для цієї пари біржа зараз не повернула котирування.",
    "The exchange has not returned quotes for this pair.",
    "Биржа пока не вернула котировки для этой пары.",
    "Giełda nie zwróciła obecnie notowań dla tej pary."
  ],
  [
    "quoteWaiting",
    "Очікуємо котирування біржі. Монета залишається в обраному.",
    "Waiting for exchange quotes. This coin remains in your favorites.",
    "Ожидаем котировки биржи. Монета остаётся в избранном.",
    "Oczekiwanie na notowania giełdowe. Moneta pozostaje w ulubionych."
  ],
  [
    "heading",
    "Обрані монети",
    "Favorite coins",
    "Избранные монеты",
    "Ulubione monety"
  ],
  [
    "close",
    "Закрити обрані монети",
    "Close favorite coins",
    "Закрыть избранные монеты",
    "Zamknij ulubione monety"
  ],
  [
    "newFolder",
    "Нова папка",
    "New folder",
    "Новая папка",
    "Nowy folder"
  ],
  [
    "newFolderName",
    "Назва нової папки",
    "New folder name",
    "Название новой папки",
    "Nazwa nowego folderu"
  ],
  [
    "add",
    "Додати",
    "Add",
    "Добавить",
    "Dodaj"
  ],
  [
    "sort",
    "Сортувати обрані монети",
    "Sort favorite coins",
    "Сортировать избранные монеты",
    "Sortuj ulubione monety"
  ],
  [
    "sortName",
    "За назвою",
    "By name",
    "По названию",
    "Według nazwy"
  ],
  [
    "sortPrice",
    "За ціною",
    "By price",
    "По цене",
    "Według ceny"
  ],
  [
    "sortChange",
    "За зміною 24г",
    "By 24h change",
    "По изменению за 24 ч",
    "Według zmiany 24 h"
  ],
  [
    "sortVolume",
    "За об'ємом",
    "By volume",
    "По объёму",
    "Według wolumenu"
  ],
  [
    "sortDirection",
    "Змінити напрямок сортування",
    "Reverse sort direction",
    "Изменить направление сортировки",
    "Zmień kierunek sortowania"
  ],
  [
    "emptyTitle",
    "В обраному поки немає монет",
    "No favorite coins yet",
    "В избранном пока нет монет",
    "Nie masz jeszcze ulubionych monet"
  ],
  [
    "emptyHelp",
    "Натисніть на зірочку біля будь-якої монети в скринері, щоб додати її сюди.",
    "Select the star next to a coin in the Screener to add it here.",
    "Нажмите на звёздочку рядом с монетой в Скринере, чтобы добавить её сюда.",
    "Kliknij gwiazdkę obok monety w Skanerze, aby dodać ją tutaj."
  ],
  [
    "general",
    "Загальний список",
    "General list",
    "Общий список",
    "Lista ogólna"
  ],
  [
    "coinActionsFor",
    "Дії для монети {{name}}",
    "Actions for coin {{name}}",
    "Действия для монеты {{name}}",
    "Działania dla monety {{name}}"
  ],
  [
    "openOrCopy",
    "Відкрити графік або скопіювати назву",
    "Open chart or copy symbol",
    "Открыть график или скопировать название",
    "Otwórz wykres lub skopiuj symbol"
  ],
  [
    "loading",
    "Завантаження…",
    "Loading…",
    "Загрузка…",
    "Ładowanie…"
  ],
  [
    "noQuotes",
    "Немає котирувань",
    "No quotes",
    "Нет котировок",
    "Brak notowań"
  ],
  [
    "openTerminal",
    "Відкрити в обраному терміналі [{{group}}]",
    "Open in selected terminal [{{group}}]",
    "Открыть в выбранном терминале [{{group}}]",
    "Otwórz w wybranym terminalu [{{group}}]"
  ],
  [
    "moveFolder",
    "Перемістити в папку",
    "Move to folder",
    "Переместить в папку",
    "Przenieś do folderu"
  ],
  [
    "folderFor",
    "Папка для {{symbol}} ({{exchange}})",
    "Folder for {{symbol}} ({{exchange}})",
    "Папка для {{symbol}} ({{exchange}})",
    "Folder dla {{symbol}} ({{exchange}})"
  ],
  [
    "remove",
    "Видалити з обраного",
    "Remove from favorites",
    "Удалить из избранного",
    "Usuń z ulubionych"
  ],
  [
    "coinActions",
    "Дії з обраною монетою",
    "Favorite coin actions",
    "Действия с избранной монетой",
    "Działania na ulubionej monecie"
  ],
  [
    "openChart",
    "Відкрити графік",
    "Open chart",
    "Открыть график",
    "Otwórz wykres"
  ],
  [
    "copied",
    "Скопійовано: {{symbol}}",
    "Copied: {{symbol}}",
    "Скопировано: {{symbol}}",
    "Skopiowano: {{symbol}}"
  ],
  [
    "copyFailed",
    "Не вдалося скопіювати",
    "Could not copy",
    "Не удалось скопировать",
    "Nie udało się skopiować"
  ],
  [
    "copySymbol",
    "Копіювати {{symbol}}",
    "Copy {{symbol}}",
    "Копировать {{symbol}}",
    "Kopiuj {{symbol}}"
  ],
  [
    "chooseFolder",
    "Виберіть папку для монети",
    "Choose a folder for the coin",
    "Выберите папку для монеты",
    "Wybierz folder dla monety"
  ]
] as const;
const languages: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const watchlistUiStrings = Object.fromEntries(languages.map((language, index) => [
  language, Object.fromEntries(watchlistUiRows.map(row => ['ui.watchlist.' + row[0], row[index + 1]])),
])) as Record<SupportedLanguage, Record<string, string>>;
