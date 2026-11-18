/** Additional MetaScalp settings UI phrases; networking and group IDs are unaffected. */
import type { SupportedLanguage } from './types';

export const metaScalpModalRows = [
  [
    "З'єднання встановлено! MetaScalp активний на порту",
    "Connected! MetaScalp is active on port",
    "Соединение установлено! MetaScalp работает на порту",
    "Połączono! MetaScalp działa na porcie"
  ],
  [
    "Помилка перевірки:",
    "Connection test error:",
    "Ошибка проверки:",
    "Błąd sprawdzania:"
  ],
  [
    "Сервер не відповів",
    "Server did not respond",
    "Сервер не ответил",
    "Serwer nie odpowiedział"
  ],
  [
    "Terminal Link",
    "Зв'язок із терміналом",
    "Связь с терминалом",
    "Połączenie z terminalem"
  ],
  [
    "Синхронізація стаканів і графіків терміналу MetaScalp в 1 клік",
    "Sync MetaScalp order books and charts in one click",
    "Синхронизация стаканов и графиков MetaScalp одним нажатием",
    "Synchronizuj arkusze zleceń i wykresy MetaScalp jednym kliknięciem"
  ],
  [
    "Швидкі кнопки перемикання монет у картках, таблиці та модальному вікні",
    "Quick coin-switch buttons in cards, tables and pop-up windows",
    "Кнопки быстрого переключения монет в карточках, таблицах и всплывающих окнах",
    "Przyciski szybkiego przełączania monet w kartach, tabelach i oknach"
  ],
  [
    "Активно",
    "Active",
    "Активно",
    "Aktywne"
  ],
  [
    "Немає зв'язку",
    "Disconnected",
    "Нет соединения",
    "Brak połączenia"
  ],
  [
    "Тест",
    "Test",
    "Тест",
    "Test"
  ],
  [
    "Вкажіть у MetaScalp цей же номер групи на стакані або графіку для синхронізації.",
    "Set the same group number in the MetaScalp order book or chart to synchronize it.",
    "Для синхронизации установите такой же номер группы в стакане или графике MetaScalp.",
    "Aby zsynchronizować, ustaw ten sam numer grupy w arkuszu zleceń lub na wykresie MetaScalp."
  ],
  [
    "Миттєво надсилати монету в MetaScalp при кліку на картку чи рядок таблиці",
    "Instantly send the selected coin to MetaScalp when clicking a card or table row",
    "Мгновенно отправлять выбранную монету в MetaScalp при нажатии на карточку или строку таблицы",
    "Natychmiast wysyłaj wybraną monetę do MetaScalp po kliknięciu karty lub wiersza tabeli"
  ],
  [
    "Відтворювати короткий клік при кожній зміні тікера",
    "Play a short click sound on every ticker change",
    "Воспроизводить короткий щелчок при каждой смене тикера",
    "Odtwarzaj krótki dźwięk kliknięcia przy każdej zmianie tickera"
  ],
  [
    "Копіювати",
    "Copy",
    "Копировать",
    "Kopiuj"
  ],
  [
    "1. Запустіть",
    "1. Launch",
    "1. Запустите",
    "1. Uruchom"
  ],
  [
    "на цьому комп'ютері. Локальний API (порт 17845) активний автоматично.",
    "on this computer. The local API (port 17845) starts automatically.",
    "на этом компьютере. Локальный API (порт 17845) запускается автоматически.",
    "na tym komputerze. Lokalne API (port 17845) uruchamia się automatycznie."
  ],
  [
    "2. У MetaScalp встановіть групу лінковки (наприклад,",
    "2. In MetaScalp, set the link group (for example,",
    "2. В MetaScalp задайте группу связи (например,",
    "2. W MetaScalp ustaw grupę powiązania (np."
  ],
  [
    ") на потрібних стаканах чи графіках.",
    ") on the required order books or charts.",
    ") в нужных стаканах или графиках.",
    ") na wybranych arkuszach zleceń lub wykresach."
  ],
  [
    "Якщо браузер запитає дозвіл на доступ до локальної мережі, надайте його цьому сайту.",
    "If the browser asks for local network access, allow it for this website.",
    "Если браузер запросит доступ к локальной сети, разрешите его для этого сайта.",
    "Jeśli przeglądarka poprosi o dostęp do sieci lokalnej, zezwól na niego dla tej witryny."
  ],
  [
    "3. Клікайте на кнопку",
    "3. Click the",
    "3. Нажмите кнопку",
    "3. Kliknij przycisk"
  ],
  [
    "або на будь-яку монету в скрінері — термінал миттєво переключиться на обраний інструмент.",
    "or any coin in Screener to switch the terminal to the selected instrument immediately.",
    "или любую монету в Скринере — терминал сразу переключится на выбранный инструмент.",
    "lub dowolną monetę w Skanerze, aby terminal natychmiast przełączył się na wybrany instrument."
  ],
  [
    "Готово",
    "Done",
    "Готово",
    "Gotowe"
  ]
] as const;
const languages: SupportedLanguage[] = ['uk','en','ru','pl'];
export const metaScalpModalPhrases = Object.fromEntries(
  languages.map((language,index) => [
    language, Object.fromEntries(metaScalpModalRows.map(row => [row[0], row[index]])),
  ]),
) as Record<SupportedLanguage, Record<string,string>>;
