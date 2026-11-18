/** Additional Terminal card chrome used by the fullscreen multi-chart page. */
import type { SupportedLanguage } from './types';

export const terminalWidgetMoreRows = [
  [
    "Перетягнути для зміни позиції",
    "Drag to reorder",
    "Перетащите, чтобы изменить положение",
    "Przeciągnij, aby zmienić pozycję"
  ],
  [
    "Змінити монету",
    "Change coin",
    "Сменить монету",
    "Zmień monetę"
  ],
  [
    "Клікніть щоб змінити біржу (Binance / Bybit)",
    "Click to switch exchange (Binance / Bybit)",
    "Нажмите, чтобы сменить биржу (Binance / Bybit)",
    "Kliknij, aby zmienić giełdę (Binance / Bybit)"
  ],
  [
    "Клікніть щоб змінити тип ринку (Perp / Spot)",
    "Click to switch market type (Perp / Spot)",
    "Нажмите, чтобы сменить тип рынка (Perp / Spot)",
    "Kliknij, aby zmienić rodzaj rynku (Perp / Spot)"
  ],
  [
    "Налаштувати алерт у Telegram",
    "Configure Telegram alert",
    "Настроить оповещение в Telegram",
    "Skonfiguruj alert w Telegramie"
  ],
  [
    "Ширина та висота блоку (1, 2, 3 колонки, висота)",
    "Chart width and height (1, 2, 3 columns, height)",
    "Ширина и высота блока (1, 2, 3 колонки, высота)",
    "Szerokość i wysokość wykresu (1, 2, 3 kolumny, wysokość)"
  ],
  [
    "Відкрити детальний графік з розширеним аналізом",
    "Open detailed chart with advanced analysis",
    "Открыть подробный график с расширенным анализом",
    "Otwórz szczegółowy wykres z zaawansowaną analizą"
  ],
  [
    "Закрити графік",
    "Close chart",
    "Закрыть график",
    "Zamknij wykres"
  ],
  [
    "Швидкий пошук...",
    "Quick search...",
    "Быстрый поиск...",
    "Szybkie wyszukiwanie..."
  ],
  [
    "1 колонка (Стандарт)",
    "1 column (standard)",
    "1 колонка (стандарт)",
    "1 kolumna (standardowa)"
  ],
  [
    "2 колонки (Широкий)",
    "2 columns (wide)",
    "2 колонки (широкий)",
    "2 kolumny (szeroki)"
  ],
  [
    "3 колонки (Дуже широкий)",
    "3 columns (extra wide)",
    "3 колонки (очень широкий)",
    "3 kolumny (bardzo szeroki)"
  ],
  [
    "Повна ширина",
    "Full width",
    "Полная ширина",
    "Pełna szerokość"
  ],
  [
    "Висота графіка",
    "Chart height",
    "Высота графика",
    "Wysokość wykresu"
  ],
  [
    "Автоматична висота",
    "Automatic height",
    "Автоматическая высота",
    "Automatyczna wysokość"
  ],
  [
    "Віджет призупинено поза видимою областю. Прокрутіть до блока, щоб завантажити його.",
    "Chart paused outside the visible area. Scroll to the chart to load it.",
    "Виджет приостановлен за пределами видимой области. Прокрутите до графика, чтобы загрузить его.",
    "Wykres wstrzymany poza widocznym obszarem. Przewiń do wykresu, aby go załadować."
  ]
] as const;
const languages: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const terminalWidgetMorePhrases = Object.fromEntries(languages.map((lang,i) => [
  lang, Object.fromEntries(terminalWidgetMoreRows.map(row => [row[0], row[i]])),
])) as Record<SupportedLanguage, Record<string,string>>;
