/** Missing Profile labels and split inline copy audited on 2026-11-15. */
import type { SupportedLanguage } from './types';

export const profileContinuationRows: readonly (readonly [string, string, string, string])[] = [
  [
    "Назва монети",
    "Coin name",
    "Название монеты",
    "Nazwa monety"
  ],
  [
    "Зміна ціни (%)",
    "Price change (%)",
    "Изменение цены (%)",
    "Zmiana ceny (%)"
  ],
  [
    "Ринок (імпульси)",
    "Market (impulses)",
    "Рынок (импульсы)",
    "Rynek (impulsy)"
  ],
  [
    "Тривалість вікна",
    "Time window",
    "Длительность окна",
    "Przedział czasowy"
  ],
  [
    "Зберегти монету й увімкнути імпульси",
    "Save coin and enable impulses",
    "Сохранить монету и включить импульсы",
    "Zapisz monetę i włącz impulsy"
  ],
  [
    "Прослухати",
    "Play sound",
    "Прослушать",
    "Odsłuchaj"
  ],
  [
    "Видалити вибрану",
    "Delete selected",
    "Удалить выбранную",
    "Usuń wybraną"
  ],
  [
    "Вимкнути всі сповіщення сайту",
    "Disable all site notifications",
    "Отключить все уведомления сайта",
    "Wyłącz wszystkie powiadomienia strony"
  ],
  [
    "Як підключити",
    "How to connect",
    "Как подключить",
    "Jak połączyć"
  ],
  [
    "до h00k.top",
    "to h00k.top",
    "к h00k.top",
    "z h00k.top"
  ],
  [
    "Зараховано дотиків:",
    "Counted touches:",
    "Засчитано касаний:",
    "Zaliczonych dotknięć:"
  ],
  [
    "Торгова пара",
    "Trading pair",
    "Торговая пара",
    "Para handlowa"
  ],
  [
    "Створено:",
    "Created:",
    "Создано:",
    "Utworzono:"
  ],
  [
    "· До",
    "· Until",
    "· До",
    "· Do"
  ],
  [
    "Завантаження…",
    "Loading…",
    "Загрузка…",
    "Ładowanie…"
  ],
  [
    "Імпульси та ліквідації — монета",
    "Impulses and liquidations — coin",
    "Импульсы и ликвидации — монета",
    "Impulsy i likwidacje — moneta"
  ],
  [
    "Сповіщення браузера, якщо вкладка згорнута",
    "Browser notifications when the tab is in the background",
    "Уведомления браузера, если вкладка свернута",
    "Powiadomienia przeglądarki, gdy karta jest w tle"
  ],
  [
    "Увімкнути лінковку",
    "Enable terminal linking",
    "Включить связь с терминалом",
    "Włącz połączenie z terminalem"
  ]
];
export const profileContinuationPhrases: Record<SupportedLanguage, Record<string, string>> = {uk: {}, en: {}, ru: {}, pl: {}};
for (const [uk,en,ru,pl] of profileContinuationRows) {
  profileContinuationPhrases.uk[uk] = uk;
  profileContinuationPhrases.en[uk] = en;
  profileContinuationPhrases.ru[uk] = ru;
  profileContinuationPhrases.pl[uk] = pl;
}
