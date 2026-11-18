/** Screener sorting and site notification center labels (UK, EN, RU, PL). */
import type { SupportedLanguage } from './types';
export const screenerNotificationRows = [
  [
    "screenerSort.volume",
    "Об'єм 24г",
    "24h volume",
    "Объём за 24 ч",
    "Wolumen 24 h"
  ],
  [
    "screenerSort.priceChange",
    "Зміна 24г (%)",
    "24h change (%)",
    "Изменение за 24 ч (%)",
    "Zmiana 24 h (%)"
  ],
  [
    "screenerSort.price",
    "Ціна ($)",
    "Price ($)",
    "Цена ($)",
    "Cena ($)"
  ],
  [
    "screenerSort.volatility",
    "Волатильність",
    "Volatility",
    "Волатильность",
    "Zmienność"
  ],
  [
    "screenerSort.distanceToHigh",
    "Близькість до High",
    "Distance to high",
    "Близость к максимуму",
    "Odległość od maksimum"
  ],
  [
    "screenerSort.distanceToLow",
    "Близькість до Low",
    "Distance to low",
    "Близость к минимуму",
    "Odległość od minimum"
  ],
  [
    "screenerSort.help",
    "Вибрати показник для сортування монет.",
    "Choose a metric to sort coins.",
    "Выбрать показатель для сортировки монет.",
    "Wybierz wskaźnik do sortowania monet."
  ],
  [
    "siteCenter.title",
    "Центр сповіщень",
    "Notification center",
    "Центр уведомлений",
    "Centrum powiadomień"
  ],
  [
    "siteCenter.heading",
    "Сповіщення",
    "Notifications",
    "Уведомления",
    "Powiadomienia"
  ],
  [
    "siteCenter.enabled",
    "Цінові рівні, формації, імпульси та нагляд",
    "Price levels, formations, impulses and monitoring",
    "Ценовые уровни, формации, импульсы и мониторинг",
    "Poziomy cenowe, formacje, impulsy i monitoring"
  ],
  [
    "siteCenter.paused",
    "Сповіщення на сайті призупинено",
    "Site notifications paused",
    "Уведомления на сайте приостановлены",
    "Powiadomienia na stronie wstrzymane"
  ],
  [
    "siteCenter.close",
    "Закрити сповіщення",
    "Close notifications",
    "Закрыть уведомления",
    "Zamknij powiadomienia"
  ],
  [
    "siteCenter.read",
    "Прочитано",
    "Mark all read",
    "Отметить прочитанными",
    "Oznacz jako przeczytane"
  ],
  [
    "siteCenter.clear",
    "Очистити",
    "Clear",
    "Очистить",
    "Wyczyść"
  ],
  [
    "siteCenter.settings",
    "Налаштувати",
    "Configure",
    "Настроить",
    "Skonfiguruj"
  ],
  [
    "siteCenter.empty",
    "Нових сповіщень поки немає. Створіть ціновий алерт або налаштуйте пошук імпульсів у профілі.",
    "No new notifications yet. Create a price alert or enable impulse detection in your profile.",
    "Новых уведомлений пока нет. Создайте ценовой алерт или настройте поиск импульсов в профиле.",
    "Nie ma jeszcze nowych powiadomień. Utwórz alert cenowy lub skonfiguruj wykrywanie impulsów w profilu."
  ],
  [
    "siteCenter.linkUnavailable",
    "Вкажіть біржу й ринок у події та увімкніть її категорію в Профіль → Лінковка",
    "Specify an exchange and market for this event, then enable its category in Profile → Terminal linking.",
    "Укажите биржу и рынок события и включите его категорию в Профиль → Привязка терминала.",
    "Określ giełdę i rynek zdarzenia oraz włącz jego kategorię w Profil → Łączenie z terminalem."
  ],
  [
    "siteCenter.linkReady",
    "Відкрити монету в обраному торговому терміналі",
    "Open coin in selected trading terminal",
    "Открыть монету в выбранном торговом терминале",
    "Otwórz monetę w wybranym terminalu handlowym"
  ],
  [
    "siteCenter.link",
    "У термінал",
    "To terminal",
    "В терминал",
    "Do terminala"
  ],
  [
    "siteCenter.footer",
    "Історія подій на цьому пристрої; історія цінових алертів також відновлюється із сервера.",
    "Event history on this device; price-alert history is also restored from the server.",
    "История событий на этом устройстве; история ценовых алертов также восстанавливается с сервера.",
    "Historia zdarzeń na tym urządzeniu; historia alertów cenowych jest również przywracana z serwera."
  ]
] as const;
const languages: SupportedLanguage[] = ['uk', 'en', 'ru', 'pl'];
export const screenerNotificationStrings = Object.fromEntries(languages.map((language, index) => [
  language, Object.fromEntries(screenerNotificationRows.map(row => ['i18n.' + row[0], row[index + 1]])),
])) as Record<SupportedLanguage, Record<string, string>>;
