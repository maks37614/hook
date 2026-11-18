'use strict';
/* h00k Desktop local settings only. The Ukrainian phrases are stable translation
 * keys; terminal identifiers, profiles and saved docking configuration are not changed. */
(function (root) {
  const rows = [
    // [Ukrainian source, English, Polish, Russian]
    ['Мова','Language','Język','Язык'],
    ['Налаштування прикріплення','Docking settings','Ustawienia dokowania','Настройки прикрепления'],
    ['h00k robot logo','h00k robot logo','Logo robota h00k','Логотип робота h00k'],
    ['▣ Окреме вікно','▣ Separate window','▣ Osobne okno','▣ Отдельное окно'],
    ['↗ У браузері','↗ In browser','↗ W przeglądarce','↗ В браузере'],
    ['Відкрити повноцінне вікно h00k','Open a full h00k window','Otwórz pełne okno h00k','Открыть полноценное окно h00k'],
    ['Відкрити h00k.top у браузері','Open h00k.top in the browser','Otwórz h00k.top w przeglądarce','Открыть h00k.top в браузере'],
    ['ПЕРШИЙ ЗАПУСК · НАЛАШТУВАННЯ','FIRST LAUNCH · SETUP','PIERWSZE URUCHOMIENIE · KONFIGURACJA','ПЕРВЫЙ ЗАПУСК · НАСТРОЙКА'],
    ['Налаштуйте h00k під свій термінал','Set up h00k for your terminal','Skonfiguruj h00k dla swojego terminala','Настройте h00k для своего терминала'],
    ['Оберіть MetaScalp, Tiger.Trade або Vataga, спосіб прикріплення та розташування. Це можна змінити будь-коли через іконку',
      'Choose MetaScalp, Tiger.Trade or Vataga, the attachment mode and position. You can change these any time using the',
      'Wybierz MetaScalp, Tiger.Trade lub Vataga, sposób dokowania oraz pozycję. Możesz to zmienić w dowolnej chwili ikoną',
      'Выберите MetaScalp, Tiger.Trade или Vataga, способ прикрепления и расположение. Эти параметры можно изменить в любой момент через значок'],
    ['⚙ праворуч','⚙ on the right','⚙ po prawej','⚙ справа'],
    ['у вікні h00k.','in the h00k window.','w oknie h00k.','в окне h00k.'],
    ['Оберіть термінал','Choose a terminal','Wybierz terminal','Выберите терминал'],
    ['Налаштуйте панелі','Configure panels','Skonfiguruj panele','Настройте панели'],
    ['Збережіть або прикріпіть','Save or attach','Zapisz lub podłącz','Сохраните или прикрепите'],
    ['1. Торговий термінал','1. Trading terminal','1. Terminal tradingowy','1. Торговый терминал'],
    ['Для кожного термінала окремі налаштування. Можна прикріпити h00k до декількох терміналів одночасно.',
      'Each terminal has its own settings. You can attach h00k to multiple terminals at once.',
      'Każdy terminal ma osobne ustawienia. Możesz podłączyć h00k do kilku terminali jednocześnie.',
      'У каждого терминала собственные настройки. Можно прикрепить h00k к нескольким терминалам одновременно.'],
    ['Шукаю запущені термінали…','Searching for running terminals…','Szukanie uruchomionych terminali…','Поиск запущенных терминалов…'],
    ['Вибрати конкретне вікно вручну','Choose a specific window manually','Wybierz konkretne okno ręcznie','Выбрать конкретное окно вручную'],
    ['Автоматичний пошук','Automatic search','Wyszukiwanie automatyczne','Автоматический поиск'],
    ['Автоматично знайти','Find automatically','Znajdź automatycznie','Найти автоматически'],
    ['Vataga: прикріплення вікон доступне.','Vataga: window attachment is available.','Vataga: dokowanie okien jest dostępne.','Vataga: прикрепление окон доступно.'],
    ["Для підготовки до лінковки: у Vataga відкрийте «Налаштування → Загальні → Інше → Інтеграція застосунків», увімкніть її, потім у стакані виберіть «Прив'язка до вікна → Скринер». Передавання тикерів із h00k поки не активовано, оскільки локальний протокол команд не підтверджений.",
      'To prepare linking, open “Settings → General → Other → App integration” in Vataga and enable it. Then, in the order book, choose “Bind to window → Screener”. Sending tickers from h00k is not enabled yet because the local command protocol has not been verified.',
      'Aby przygotować połączenie, w Vataga otwórz „Ustawienia → Ogólne → Inne → Integracja aplikacji” i ją włącz. Następnie w arkuszu zleceń wybierz „Przypięcie do okna → Screener”. Przesyłanie tickerów z h00k nie jest jeszcze aktywne, ponieważ lokalny protokół poleceń nie został potwierdzony.',
      'Для подготовки связи откройте в Vataga «Настройки → Общие → Другое → Интеграция приложений» и включите её. Затем в стакане выберите «Привязка к окну → Скринер». Передача тикеров из h00k пока не активирована, поскольку локальный протокол команд не подтверждён.'],
    ['2. Що прикріпити?','2. What to attach?','2. Co podłączyć?','2. Что прикрепить?'],
    ['Весь h00k.top','Entire h00k.top','Cały h00k.top','Весь h00k.top'],
    ['Вибрані блоки','Selected sections','Wybrane sekcje','Выбранные разделы'],
    ['Плаваючі вікна','Floating windows','Pływające okna','Плавающие окна'],
    ['Мультивікна','Multi-window','Wiele okien','Мультиокна'],
    ['Мультивікна: окреме вікно h00k біля кожної запущеної копії обраного термінала (до 4). Можна додати інше вікно через ручний вибір вище. Для стабільної роботи одночасно активні не більше 6 мультивікон загалом. h00k не перекриває інші програми.',
      'Multi-window: a separate h00k window beside each running instance of the selected terminal (up to 4). Add another app using the manual window picker above. Up to 6 multi-windows can be active in total for stability. h00k does not cover other applications.',
      'Wiele okien: osobne okno h00k przy każdej uruchomionej kopii wybranego terminala (do 4). Inną aplikację dodasz przez ręczny wybór powyżej. Dla stabilności jednocześnie może działać łącznie do 6 okien. h00k nie zasłania innych programów.',
      'Мультиокна: отдельное окно h00k рядом с каждой запущенной копией выбранного терминала (до 4). Другое приложение можно добавить через ручной выбор выше. Для стабильной работы одновременно активны не более 6 мультиокон в сумме. h00k не перекрывает другие программы.'],
    ['Кожен блок відкриває відповідний розділ h00k у власному вікні.',
      'Each section opens the corresponding part of h00k in its own window.',
      'Każda sekcja otwiera odpowiednią część h00k w osobnym oknie.',
      'Каждый раздел открывает соответствующую часть h00k в отдельном окне.'],
    ['Скрінер','Screener','Skaner','Скринер'],
    ['Формації','Patterns','Formacje','Формации'],
    ['Раннє виявлення','Early detection','Wczesne wykrywanie','Раннее обнаружение'],
    ['Термінал HookChart','HookChart terminal','Terminal HookChart','Терминал HookChart'],
    ['Спостереження','Monitoring','Monitorowanie','Наблюдение'],
    ['Тестування','Market Replay','Testowanie','Тестирование'],
    ['3. Розташування','3. Position','3. Położenie','3. Расположение'],
    ['Автоматично · де більше місця','Automatic · most free space','Automatycznie · najwięcej miejsca','Автоматически · где больше места'],
    ['Праворуч','Right','Po prawej','Справа'],
    ['Знизу','Bottom','Na dole','Снизу'],
    ['Ліворуч','Left','Po lewej','Слева'],
    ['Зверху','Top','U góry','Сверху'],
    ['Ширина панелі, px','Panel width, px','Szerokość panelu, px','Ширина панели, пикс.'],
    ['Висота панелі, px','Panel height, px','Wysokość panelu, px','Высота панели, пикс.'],
    ['«Автоматично» оцінює вільне місце біля термінала на підключених моніторах і розміщує h00k з найкращого боку, не перекриваючи стакан. Ручний вибір сторони також доступний.',
      '“Automatic” checks available space next to the terminal across connected monitors and places h00k on the best side without covering the order book. You can also select a side manually.',
      'Tryb „Automatycznie” sprawdza wolne miejsce obok terminala na podłączonych monitorach i umieszcza h00k po najlepszej stronie, nie zasłaniając arkusza zleceń. Możesz też wybrać stronę ręcznie.',
      'Режим «Автоматически» оценивает свободное место рядом с терминалом на подключённых мониторах и размещает h00k с подходящей стороны, не перекрывая стакан. Сторону также можно выбрать вручную.'],

    ['«Автоматично» перевіряє розташування інших відкритих програм на підключених моніторах, знаходить вільну ділянку біля термінала й не перекриває їхні вікна. Якщо місця немає, h00k повідомить про це. Ручний вибір сторони також доступний.',
      '“Automatic” checks other open apps on connected monitors, finds free space beside the terminal, and avoids covering their windows. If no safe space is available, h00k reports it. You can also select a side manually.',
      'Tryb „Automatycznie” uwzględnia inne otwarte aplikacje na podłączonych monitorach, znajduje wolne miejsce obok terminala i nie zasłania ich okien. Jeśli nie ma bezpiecznego miejsca, h00k wyświetli komunikat. Stronę można też wybrać ręcznie.',
      'Режим «Автоматически» учитывает другие открытые приложения на подключённых мониторах, находит свободное место рядом с терминалом и не перекрывает их окна. Если безопасного места нет, h00k сообщит об этом. Сторону также можно выбрать вручную.'],
    ['4. Автоматизація','4. Automation','4. Automatyzacja','4. Автоматизация'],
    ['Увімкнути термінал','Enable terminal','Włącz terminal','Включить терминал'],
    ['Прикріплювати автоматично','Attach automatically','Podłączaj automatycznie','Прикреплять автоматически'],
    ['Слідувати за вікном','Follow window','Podążaj za oknem','Следовать за окном'],
    ['Завжди поверх вікон','Always on top','Zawsze na wierzchu','Всегда поверх окон'],
    ['Коли «Слідувати» вимкнено, можна вільно розміщувати плаваючі панелі. Їхнє розташування на моніторах автоматично зберігається й відновлюється під час наступного запуску.',
      'When “Follow window” is off, floating panels can be moved freely. Their positions on your monitors are saved automatically and restored on the next launch.',
      'Gdy opcja „Podążaj za oknem” jest wyłączona, pływające panele można dowolnie przesuwać. Ich pozycje na monitorach są automatycznie zapisywane i przywracane przy następnym uruchomieniu.',
      'Когда опция «Следовать за окном» отключена, плавающие панели можно свободно перемещать. Их положение на мониторах автоматически сохраняется и восстанавливается при следующем запуске.'],
    ['Зберегти налаштування','Save settings','Zapisz ustawienia','Сохранить настройки'],
    ['Автоприкріпити зараз','Auto-attach now','Podłącz automatycznie teraz','Автоприкрепить сейчас'],
    ['Відкріпити','Detach','Odłącz','Открепить'],
    ['Налаштування зберігаються лише на цьому комп’ютері. Програма не запитує біржові API-ключі.',
      'Settings are saved on this computer only. The app does not request exchange API keys.',
      'Ustawienia są zapisywane tylko na tym komputerze. Aplikacja nie wymaga kluczy API giełd.',
      'Настройки сохраняются только на этом компьютере. Программа не запрашивает API-ключи бирж.'],
    ['Примітка: Google OAuth може не працювати у вбудованому вікні Windows через правила Google для embedded webviews. Для входу безпосередньо в h00k Desktop використовуйте email і пароль; вхід у зовнішньому браузері не переносить авторизацію автоматично.',
      'Note: Google OAuth may not work in the embedded Windows window because of Google restrictions on embedded webviews. To sign in directly to h00k Desktop, use your email and password; signing in through an external browser does not automatically carry your session over.',
      'Uwaga: Google OAuth może nie działać we wbudowanym oknie Windows z powodu zasad Google dotyczących osadzonych widoków internetowych. Aby zalogować się bezpośrednio do h00k Desktop, użyj e-maila i hasła; zalogowanie w zewnętrznej przeglądarce nie przenosi sesji automatycznie.',
      'Примечание: Google OAuth может не работать во встроенном окне Windows из-за правил Google для встроенных веб-представлений. Для входа непосредственно в h00k Desktop используйте почту и пароль; вход во внешнем браузере не переносит авторизацию автоматически.'],
    ['Термінал не знайдено','Terminal not found','Nie znaleziono terminala','Терминал не найден'],
    ['Очікування','Waiting','Oczekiwanie','Ожидание'],
    ['Очікування термінала','Waiting for terminal','Oczekiwanie na terminal','Ожидание терминала'],
    ['Збережено','Saved','Zapisano','Сохранено'],
    ['Відкріплено','Detached','Odłączono','Откреплено'],
    ['Вимкнено','Disabled','Wyłączone','Выключено'],
    ['Плаваючі панелі без термінала','Floating panels without a terminal','Pływające panele bez terminala','Плавающие панели без терминала'],
    ['Термінал не знайдено: запустіть його або виберіть вікно вручну',
      'Terminal not found: start it or choose a window manually',
      'Nie znaleziono terminala: uruchom go lub wybierz okno ręcznie',
      'Терминал не найден: запустите его или выберите окно вручную'],
    ['Термінал згорнуто','Terminal minimized','Terminal zminimalizowany','Терминал свёрнут'],
    ['Немає достатньо місця навколо термінала; звільніть простір або зменшіть його вікно',
      'Not enough room around the terminal; free up space or resize its window',
      'Za mało miejsca wokół terminala; zwolnij miejsce lub zmniejsz jego okno',
      'Недостаточно места вокруг терминала; освободите пространство или уменьшите его окно'],
    ['Замало місця з вибраного боку; виберіть Автоматично або іншу сторону',
      'Not enough space on the selected side; choose Automatic or another side',
      'Za mało miejsca po wybranej stronie; wybierz Automatycznie lub inną stronę',
      'Недостаточно места с выбранной стороны; выберите Автоматически или другую сторону'],
    ['Плаваючі панелі','Floating panels','Pływające panele','Плавающие панели'],

    ['Місце для h00k зайняте іншим вікном; перемістіть його або виберіть Автоматично',
      'Space for h00k is occupied by another window; move it or choose Automatic',
      'Miejsce dla h00k zajmuje inne okno; przesuń je lub wybierz Automatycznie',
      'Место для h00k занято другим окном; переместите его или выберите Автоматически'],
    ['Немає безпечного місця біля термінала; зменшіть його вікно або звільніть простір',
      'No safe space beside the terminal; resize its window or free up space',
      'Brak bezpiecznego miejsca obok terminala; zmniejsz jego okno lub zwolnij miejsce',
      'Нет безопасного места рядом с терминалом; уменьшите его окно или освободите пространство'],
    ['Прикріплення вікон підтримується лише у Windows',
      'Window attachment is supported only on Windows',
      'Dokowanie okien jest obsługiwane tylko w systemie Windows',
      'Прикрепление окон поддерживается только в Windows'],
    ['Прикріплено','Attached','Przypięto','Прикреплено'],
    ['автоматично','automatically','automatycznie','автоматически'],
    ['праворуч','on the right','po prawej','справа'],
    ['ліворуч','on the left','po lewej','слева'],
    ['зверху','on top','u góry','сверху'],
    ['знизу','at the bottom','na dole','снизу'],
    ['до','to','do','к']
  ];
  const dictionaries = { en: new Map(), pl: new Map(), ru: new Map() };
  for (const [uk, en, pl, ru] of rows) {
    if (dictionaries.en.has(uk)) throw new Error('Duplicate settings translation: ' + uk);
    dictionaries.en.set(uk, en);
    dictionaries.pl.set(uk, pl);
    dictionaries.ru.set(uk, ru);
  }
  function translate(key, language) {
    if (language === 'uk') return key;
    return (dictionaries[language] || dictionaries.uk)?.get(key) || key;
  }
  function translateStatus(value, language) {
    if (typeof value !== 'string') return '';
    const multi = /^Мультивікна: (\d+)\/(\d+)$/.exec(value);
    if (multi) return translate('Мультивікна', language)+': '+multi[1]+'/'+multi[2];
    const m = /^Прикріплено (автоматично )?(праворуч|ліворуч|зверху|знизу) до (.*)$/.exec(value);
    if (!m) return translate(value, language);
    return [translate('Прикріплено', language),
      ...(m[1] ? [translate('автоматично', language)] : []),
      translate(m[2], language), translate('до', language), m[3]].join(' ');
  }
  root.h00kSettingsI18n = Object.freeze({
    languages: Object.freeze(['en','uk','ru','pl']),
    translate, translateStatus,
    keys: Object.freeze(rows.map(row => row[0]))
  });
})(typeof window === 'undefined' ? globalThis : window);
