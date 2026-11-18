/** Additional translations for dynamic strings in user Profile tabs. */
import type { SupportedLanguage } from './types';

export const profileDynamicRows: ReadonlyArray<readonly [string, string, string, string]> = [
  [
    "Мої пресети",
    "My presets",
    "Мои пресеты",
    "Moje presety"
  ],
  [
    "Видалити пресет",
    "Delete preset",
    "Удалить пресет",
    "Usuń preset"
  ],
  [
    "За замовчуванням",
    "Default",
    "По умолчанию",
    "Domyślnie"
  ],
  [
    "· За замовчуванням",
    "· Default",
    "· По умолчанию",
    "· Domyślnie"
  ],
  [
    "активних",
    "active",
    "активных",
    "aktywnych"
  ],
  [
    "Тінь свічки",
    "Candle wick",
    "Тень свечи",
    "Knot świecy"
  ],
  [
    "Раніше збережені мелодії",
    "Previously saved melodies",
    "Ранее сохранённые мелодии",
    "Wcześniej zapisane melodie"
  ],
  [
    "Стандартний звук h00k",
    "Default h00k sound",
    "Стандартный звук h00k",
    "Domyślny dźwięk h00k"
  ],
  [
    "Натисніть, щоб повторити.",
    "Click to retry.",
    "Нажмите, чтобы повторить.",
    "Kliknij, aby spróbować ponownie."
  ],
  [
    "Закрити профіль",
    "Close profile",
    "Закрыть профиль",
    "Zamknij profil"
  ],
  [
    "Обсяг 24г",
    "24h volume",
    "Объём за 24 ч",
    "Wolumen 24 h"
  ],
  [
    "Зміна ціни 24г",
    "24h price change",
    "Изменение цены за 24 ч",
    "Zmiana ceny 24 h"
  ],
  [
    "Ціна",
    "Price",
    "Цена",
    "Cena"
  ],
  [
    "Волатильність",
    "Volatility",
    "Волатильность",
    "Zmienność"
  ],
  [
    "Відстань до максимуму",
    "Distance to high",
    "Расстояние до максимума",
    "Odległość od maksimum"
  ],
  [
    "Відстань до мінімуму",
    "Distance to low",
    "Расстояние до минимума",
    "Odległość od minimum"
  ],
  [
    "Усі монети",
    "All coins",
    "Все монеты",
    "Wszystkie monety"
  ],
  [
    "Активні",
    "Active",
    "Активные",
    "Aktywne"
  ],
  [
    "Топ зростання",
    "Top gainers",
    "Лидеры роста",
    "Największe wzrosty"
  ],
  [
    "Топ падіння",
    "Top losers",
    "Лидеры падения",
    "Największe spadki"
  ],
  [
    "Біля максимумів",
    "Near highs",
    "Около максимумов",
    "Blisko maksimów"
  ],
  [
    "Біля мінімумів",
    "Near lows",
    "Около минимумов",
    "Blisko minimów"
  ],
  [
    "Не вдалося завершити сесію.",
    "Could not end the session.",
    "Не удалось завершить сеанс.",
    "Nie udało się zakończyć sesji."
  ],
  [
    "Не вдалося отримати сесії.",
    "Could not load sessions.",
    "Не удалось загрузить сеансы.",
    "Nie udało się wczytać sesji."
  ],
  [
    "Не вдалося завершити сесії.",
    "Could not end the sessions.",
    "Не удалось завершить сеансы.",
    "Nie udało się zakończyć sesji."
  ],
  [
    "Не вдалося завантажити свічки біржі",
    "Could not load exchange candles",
    "Не удалось загрузить свечи биржи",
    "Nie udało się pobrać świec z giełdy"
  ],
  [
    "Відсутні свічкові дані",
    "No candlestick data available",
    "Нет свечных данных",
    "Brak danych świecowych"
  ],
  [
    "Недостатньо закритих свічок для прикладу",
    "Not enough closed candles for the preview",
    "Недостаточно закрытых свечей для примера",
    "Za mało zamkniętych świec do podglądu"
  ],
  [
    "Помилка графіка",
    "Chart error",
    "Ошибка графика",
    "Błąd wykresu"
  ],
  [
    "Введіть скінченне числове значення.",
    "Enter a finite numeric value.",
    "Введите конечное числовое значение.",
    "Wpisz skończoną wartość liczbową."
  ],
  [
    "Ціна має бути додатним числом.",
    "Price must be a positive number.",
    "Цена должна быть положительным числом.",
    "Cena musi być liczbą dodatnią."
  ]
];
export const profileDynamicPhrases: Record<SupportedLanguage, Record<string, string>> = { uk: {}, en: {}, ru: {}, pl: {} };
for (const [uk, en, ru, pl] of profileDynamicRows) {
  profileDynamicPhrases.uk[uk] = uk;
  profileDynamicPhrases.en[uk] = en;
  profileDynamicPhrases.ru[uk] = ru;
  profileDynamicPhrases.pl[uk] = pl;
}
