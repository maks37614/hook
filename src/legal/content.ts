import type { SupportedLanguage } from '../locales/types';

export type LegalDocumentType = 'terms' | 'privacy';
export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}
export interface LegalDocument {
  title: string;
  intro: string;
  sections: LegalSection[];
}
export interface LegalCopy {
  tagline: string;
  home: string;
  termsLink: string;
  privacyLink: string;
  contact: string;
  copyright: string;
  terms: LegalDocument;
  privacy: LegalDocument;
}

export const LEGAL_EMAIL = 'info@h00k.top';
export const SITE_URL = 'https://h00k.top';

export const legalContent: Record<SupportedLanguage, LegalCopy> = {
  uk: {
    tagline: 'Професійний криптовалютний скрінер прямо у браузері',
    home: 'На головну',
    termsLink: 'Користувацька угода',
    privacyLink: 'Політика обробки персональних даних',
    contact: 'Зв’язатися з нами',
    copyright: '© 2026. Усі права захищені.',
    terms: {
      title: 'Користувацька угода',
      intro: 'Ці умови регулюють доступ до h00k.top та використання інформаційно-аналітичного криптовалютного скрінера h00k («Сервіс»).',
      sections: [
        { heading: '1. Загальні положення', paragraphs: [
          'Сервіс доступний за адресою https://h00k.top. «Користувач» — відвідувач або особа з обліковим записом. «Адміністрація» — особа, яка забезпечує роботу Сервісу.',
          'Використання функцій Сервісу регулюється цією Угодою. Під час реєстрації може вимагатися окреме підтвердження згоди з умовами. Якщо ви не погоджуєтеся з умовами, не використовуйте відповідні функції.',
          'Ніщо в Угоді не обмежує права споживачів, які не можна обмежити за законом.'
        ]},
        { heading: '2. Призначення та можливості', paragraphs: [
          'h00k надає інструменти моніторингу торгових пар, котирувань, обсягів, волатильності, технічних формацій, патернів та інших ринкових показників.',
          'Залежно від типу доступу можуть бути доступні графіки, фільтри, індикатори настрою ринку, персональні налаштування, Telegram-сповіщення та інтеграція з MetaScalp.',
          'Сервіс не є біржею, банком, брокером, криптовалютним гаманцем або сховищем активів. Наявність аналітичних функцій не означає здійснення угод від імені Користувача.'
        ]},
        { heading: '3. Ринкова інформація та джерела', paragraphs: [
          'Котирування й інші ринкові показники можуть надходити від Binance, Bybit та інших зовнішніх джерел. Доступність, повнота та швидкість оновлення залежить також від їхніх API та мережі.',
          'Дані можуть надходити із затримкою, тимчасово не оновлюватися або відображати останні успішно отримані значення. Позначка «у реальному часі» не гарантує відсутності затримки.',
          'Показана ціна може відрізнятися від ціни виконання операції. Перед торгівлею перевіряйте актуальні дані безпосередньо на відповідній біржі.'
        ]},
        { heading: '4. Аналітика не є інвестиційною порадою', paragraphs: [
          'Сигнали, формації, рейтинги, сповіщення й аналітичні показники є загальною технічною та інформаційною аналітикою, а не персоналізованими інвестиційними рекомендаціями.',
          'Вони не враховують ваші цілі, фінансовий стан, досвід або прийнятний рівень ризику. Жоден сигнал не є обіцянкою прибутку чи прогнозом із гарантованою точністю.',
          'Ви самостійно оцінюєте інформацію та приймаєте торгові рішення. За потреби зверніться до незалежного кваліфікованого фахівця.'
        ]},
        { heading: '5. Попередження про торгові ризики', paragraphs: [
          'Криптоактиви та особливо ф’ючерси й інструменти з кредитним плечем мають високий рівень ризику. Можлива швидка або повна втрата капіталу.',
          'Ризики включають різкі коливання ціни, ліквідацію позицій, нестачу ліквідності, прослизання, збої бірж, помилки даних та затримку сповіщень. Минулі результати не гарантують майбутніх.'
        ]},
        { heading: '6. Обліковий запис і безпека', paragraphs: [
          'Окремі функції доступні лише після реєстрації. Вхід здійснюється за електронною адресою та паролем після підтвердження email.',
          'Надавайте коректні дані й бережіть свої засоби входу. Не використовуйте чужі облікові записи та повідомляйте про підозру на несанкціонований доступ на info@h00k.top.',
          'Запит на закриття облікового запису або видалення пов’язаних даних можна надіслати на контактну адресу. Законні винятки зі стирання описані в Політиці обробки персональних даних.'
        ]},
        { heading: '7. Сповіщення та сторонні інтеграції', paragraphs: [
          'Telegram-сповіщення та інтеграції, зокрема MetaScalp, залежать від сторонніх постачальників і мережевих з’єднань. Доставка повідомлення в конкретний час не гарантується.',
          'Сповіщення не є торговими наказами. Якщо зовнішній інструмент дозволяє торгівлю, перевірка та підтвердження операції залишаються відповідальністю Користувача.',
          'На сторонні продукти додатково поширюються їхні власні правила використання.'
        ]},
        { heading: '8. Заборонене використання', paragraphs: [
          'Заборонено несанкціонований доступ, обхід автентифікації, атаки на інфраструктуру, розповсюдження шкідливого коду, шахрайство та порушення прав третіх осіб.',
          'Не дозволяється масове копіювання або перепродаж захищених даних із порушенням прав їх власників. Законні дії, які не можна заборонити договором, залишаються дозволеними.'
        ]},
        { heading: '9. Інтелектуальна власність', paragraphs: [
          'Оригінальні програмні рішення, дизайн, тексти та інші матеріали h00k охороняються застосовним законодавством. Доступ до Сервісу не передає права власності на них.',
          'Binance, Bybit, Telegram, MetaScalp та інші назви належать відповідним правовласникам. Згадування не означає партнерства, спонсорства або офіційного схвалення.'
        ]},
        { heading: '10. Безкоштовний доступ і майбутні підписки', paragraphs: [
          'Наразі наявні функції Сервісу надаються безкоштовно. У майбутньому можуть з’явитися платні функції або підписки.',
          'Перш ніж пропонувати оплату, Сервіс повинен повідомити про ціну, склад функцій, строк, спосіб оплати, продовження, скасування та повернення коштів. Саме користування безкоштовними функціями не створює платіжного зобов’язання.',
          'Будь-які платні умови застосовуватимуться лише після їх окремого опублікування та відповідного замовлення Користувача з урахуванням обов’язкових прав споживачів.'
        ]},
        { heading: '11. Доступність, зміни та обмеження', paragraphs: [
          'Адміністрація може проводити обслуговування, оновлювати алгоритми, інтерфейс і джерела даних. Деякі функції можуть тимчасово бути недоступними.',
          'Доступ може бути обмежений за обґрунтованої загрози безпеці або порушення правил із дотриманням прав користувачів. Істотні зміни, що зачіпають обов’язкові права, здійснюються відповідно до закону.'
        ]},
        { heading: '12. Відповідальність', paragraphs: [
          'У межах, дозволених застосовним законодавством, Адміністрація не гарантує безперервної роботи сторонніх API, точності кожного котирування або прибутковості самостійних торгових рішень.',
          'Ця Угода не виключає відповідальності за власні протиправні дії, яку не дозволяється виключати законом, і не обмежує обов’язкові права споживачів.'
        ]},
        { heading: '13. Зміни умов, звернення та спори', paragraphs: [
          'Актуальна редакція розміщується на цій сторінці. Про істотні зміни, коли це вимагається законом, повідомляється належним способом.',
          'Для запитань, скарг та звернень щодо облікового запису пишіть на info@h00k.top. Спори вирішуються за застосовним законодавством зі збереженням права звернення до компетентного суду або органу.'
        ]}
      ]
    },
    privacy: {
      title: 'Політика обробки персональних даних',
      intro: 'Ця Політика пояснює, які персональні дані використовує h00k, для чого вони потрібні та які права має Користувач. Вона застосовується до вебсайту https://h00k.top.',
      sections: [
        { heading: '1. Відповідальний за дані та контакт', paragraphs: [
          'Обробку даних у межах роботи Сервісу організовує оператор h00k. Для запитів щодо персональних даних використовується електронна адреса info@h00k.top.',
          'Цей контакт не замінює відомості про юридичну особу контролера, які можуть вимагатися застосовним законодавством. Перш ніж вважати Політику юридично завершеною, такі відомості необхідно перевірити та за потреби оприлюднити.'
        ]},
        { heading: '2. Які дані можуть оброблятися', paragraphs: [
          'Під час реєстрації та входу: електронна адреса, ім’я профілю (якщо надано), ідентифікатор користувача, захищений хеш пароля, відомості про сесію та підтвердження email.',
          'Під час використання: IP-адреса, час запитів, тип браузера, технічні журнали, налаштування фільтрів, графіків, обрані активи, збережені параметри та інформація про сповіщення.',
          'У разі підключення Telegram: ідентифікатор чату, ім’я користувача (якщо передається), мова і налаштування сповіщень. При зверненні до підтримки: адреса відправника, текст повідомлення та надіслані вкладення.'
        ]},
        { heading: '3. Звідки отримуються дані', paragraphs: [
          'Частину даних ви повідомляєте самостійно під час реєстрації, підключення інтеграцій і звернення до підтримки. Технічні дані надходять автоматично під час роботи вебсайту.',
          'Дані для входу ви надаєте безпосередньо Сервісу. Поштовий провайдер може обробляти дані, необхідні для доставки листів підтвердження та відновлення пароля, а Telegram — дані сповіщень при добровільному підключенні. Котирування Binance і Bybit зазвичай не є вашими персональними даними.'
        ]},
        { heading: '4. Цілі та правові підстави', paragraphs: [
          'Дані профілю та налаштувань використовуються для надання запитаних функцій і виконання договору (стаття 6(1)(b) GDPR). Технічні дані безпеки можуть оброблятися на підставі законного інтересу в захисті Сервісу (стаття 6(1)(f)).',
          'Звернення обробляються для підтримки користувачів та захисту законних прав (стаття 6(1)(b) або (f), залежно від ситуації). Дані, які необхідно зберігати за законом, обробляються для виконання юридичного обов’язку (стаття 6(1)(c)).',
          'Необов’язкова аналітика, реклама й інші технології, що потребують згоди, можуть застосовуватися лише після її отримання (стаття 6(1)(a) GDPR та відповідні правила про cookies). Згоду можна відкликати.'
        ]},
        { heading: '5. Локальне зберігання та cookies', paragraphs: [
          'Сервіс може використовувати localStorage, sessionStorage та cookies для авторизації, збереження мови, налаштувань інтерфейсу та захисту сеансу.',
          'Технічно необхідні засоби можуть використовуватися відповідно до законних винятків. Необов’язкові аналітичні чи рекламні засоби, якщо їх підключено, повинні активуватися лише після належної згоди, коли вона потрібна.',
          'Ви можете керувати сховищем у налаштуваннях браузера. Фактичний перелік cookies, їхні строки та постачальників необхідно перевіряти відповідно до конфігурації Сервісу.'
        ]},
        { heading: '6. Отримувачі та постачальники', paragraphs: [
          'Акаунти, захищені хеші паролів та профілі зберігаються в PostgreSQL на VPS. Для листів підтвердження та відновлення пароля використовується налаштований SMTP-провайдер (зокрема OVHcloud MX Plan).',
          'Для запобігання автоматизованим реєстраціям, спробам входу та розсиланню листів використовується Cloudflare Turnstile. Під час перевірки Cloudflare може обробляти IP-адресу, технічні дані браузера й токен перевірки згідно зі своєю політикою конфіденційності.',
          'У разі використання сповіщень дані, необхідні для доставки, передаються Telegram. При роботі інших інтеграцій дані можуть оброблятися відповідними незалежними постачальниками.',
          'Постачальники обробляють дані в межах своїх функцій та застосовних договірних і законодавчих вимог. Для окремих сторонніх платформ діють їхні власні політики конфіденційності.'
        ]},
        { heading: '7. Міжнародна обробка даних', paragraphs: [
          'VPS, що використовується Сервісом, розташований у Великій Британії. Поштові та інші постачальники можуть обробляти необхідні дані в інших країнах відповідно до застосовних гарантій.',
          'Для передавання даних із Європейської економічної зони до Великої Британії може застосовуватися чинне рішення ЄС про належний рівень захисту. Інші міжнародні передавання здійснюються за наявності правомірного механізму, якщо він необхідний.',
          'Відомості про застосовні гарантії та можливість отримати їх копію можна запитати за адресою info@h00k.top.'
        ]},
        { heading: '8. Строки зберігання', paragraphs: [
          'Дані облікового запису та налаштувань зберігаються протягом користування відповідними функціями, доки не виникне підстава для видалення або інша законна потреба в зберіганні.',
          'Ідентифікатори Telegram зберігаються, доки потрібні для підключеної функції, з урахуванням технічного циклу видалення. Технічні журнали, звернення й резервні копії зберігаються лише стільки, скільки обґрунтовано потрібно для безпеки, підтримки, відновлення та виконання законних обов’язків.',
          'Конкретні строки або критерії мають відповідати фактичним налаштуванням серверів і сторонніх постачальників. Коли мета обробки закінчилася, дані видаляються або анонімізуються, якщо закон не вимагає іншого.'
        ]},
        { heading: '9. Захист інформації', paragraphs: [
          'Для захисту даних застосовуються відповідні технічні та організаційні заходи, що мають відповідати реальній архітектурі, зокрема контроль доступу, захист з’єднань і належне управління обліковими даними.',
          'Жодна система не забезпечує абсолютної безпеки. У разі порушення захисту даних виконуються обов’язки з оцінки та повідомлення про інцидент, установлені законом.'
        ]},
        { heading: '10. Ваші права', paragraphs: [
          'За умов, визначених GDPR, ви можете вимагати доступу, виправлення, видалення або обмеження обробки даних, заперечувати проти певної обробки та скористатися правом на перенесення даних.',
          'Якщо обробка ґрунтується на згоді, її можна відкликати в будь-який час. Ви також маєте право подати скаргу до компетентного органу із захисту даних.',
          'Надсилайте запити на info@h00k.top. Якщо застосовується GDPR, відповідь зазвичай надається протягом одного місяця з можливим продовженням у передбачених законом випадках.'
        ]},
        { heading: '11. Автоматизована ринкова аналітика', paragraphs: [
          'Алгоритми h00k аналізують ринкову інформацію, а не ухвалюють щодо вас рішення з юридичними або аналогічно істотними наслідками виключно на підставі автоматизованої обробки персональних даних.',
          'У разі запровадження такої обробки Політику та відповідні процедури буде переглянуто.'
        ]},
        { heading: '12. Неповнолітні', paragraphs: [
          'Сервіс орієнтований на повнолітніх користувачів. Якщо стає відомо про неправомірну обробку даних дитини, застосовуються необхідні заходи відповідно до закону.'
        ]},
        { heading: '13. Зовнішні ресурси', paragraphs: [
          'Посилання на Binance, Bybit, Telegram, Google та інші ресурси ведуть до незалежних платформ, що можуть мати власні політики конфіденційності. Перед використанням їхніх послуг ознайомтеся з відповідними умовами.'
        ]},
        { heading: '14. Зміни та контакти', paragraphs: [
          'Політика може оновлюватися, коли змінюються функції, постачальники або законодавство. Істотні зміни повідомляються належним способом; за потреби запитується нова згода.',
          'З питань конфіденційності, доступу або видалення даних звертайтеся на info@h00k.top.'
        ]}
      ]
    }
  },
  en: {
    tagline: 'Professional cryptocurrency screener directly in your browser',
    home: 'Back to home',
    termsLink: 'Terms of Use',
    privacyLink: 'Privacy Policy',
    contact: 'Contact us',
    copyright: '© 2026. All rights reserved.',
    terms: {
      title: 'Terms of Use',
      intro: 'These terms govern access to h00k.top and the use of the h00k cryptocurrency market analytics screener (the “Service”).',
      sections: [
        { heading: '1. General provisions', paragraphs: [
          'The Service is available at https://h00k.top. A “User” is a visitor or account holder. “Administration” means the person operating the Service.',
          'Use of the Service is subject to these Terms. Account registration may require separate acceptance. If you disagree, do not use the relevant features.',
          'Nothing in these Terms limits consumer rights that cannot be waived under applicable law.'
        ]},
        { heading: '2. Purpose and features', paragraphs: [
          'h00k provides tools for monitoring trading pairs, quotes, volume, volatility, technical patterns, formations and other market metrics.',
          'Depending on access level, charts, filters, market sentiment indicators, saved preferences, Telegram alerts and MetaScalp integration may be available.',
          'The Service is not an exchange, bank, broker, crypto wallet or custodian. Analytical functionality does not mean that h00k executes trades on behalf of Users.'
        ]},
        { heading: '3. Market data and sources', paragraphs: [
          'Quotes and other market metrics may come from Binance, Bybit and other independent providers. Availability, completeness and update speed depend on external APIs and networks.',
          'Data may be delayed, temporarily stale or show the last successfully received value. “Real-time” does not guarantee zero latency.',
          'Displayed prices may differ from execution prices. Verify current market conditions directly with the exchange before trading.'
        ]},
        { heading: '4. No personalized investment advice', paragraphs: [
          'Signals, formations, rankings, alerts and indicators are general technical and informational analysis, not personalized investment advice.',
          'They do not take account of your goals, financial circumstances, experience or risk tolerance. No alert or pattern guarantees performance or future price movement.',
          'You evaluate the information and make trading decisions independently. Seek qualified independent advice where appropriate.'
        ]},
        { heading: '5. Trading risks', paragraphs: [
          'Cryptoassets, especially futures and leveraged instruments, involve substantial risk, including rapid or total loss of funds.',
          'Risks include volatility, liquidations, illiquidity, slippage, exchange outages, incorrect data and delayed notifications. Past performance does not guarantee future results.'
        ]},
        { heading: '6. Accounts and security', paragraphs: [
          'Some features require registration. Sign-in uses an email address and password after email verification.',
          'Provide accurate information and protect your sign-in credentials. Do not access other accounts without authorization. Report suspected account compromise to info@h00k.top.',
          'Requests to close an account or delete related data can be sent to the contact address. Legal exceptions to erasure are explained in the Privacy Policy.'
        ]},
        { heading: '7. Alerts and third-party integrations', paragraphs: [
          'Telegram alerts and integrations such as MetaScalp rely on independent services and networks. Timely delivery is not guaranteed.',
          'Alerts are not trade orders. If a third-party tool permits trading, the User remains responsible for reviewing and confirming transactions.',
          'Third-party products are also subject to their own terms.'
        ]},
        { heading: '8. Prohibited conduct', paragraphs: [
          'Unauthorized access, bypassing authentication, attacks on infrastructure, malicious code, fraud and violations of others’ rights are prohibited.',
          'You may not systematically copy or resell protected data in violation of its owner’s rights. Acts that cannot lawfully be restricted remain permitted.'
        ]},
        { heading: '9. Intellectual property', paragraphs: [
          'Original software, design, content and other elements of h00k may be protected by applicable intellectual property laws. Access does not transfer ownership rights.',
          'Binance, Bybit, Telegram, MetaScalp and other marks belong to their respective owners. References do not imply endorsement, sponsorship or partnership.'
        ]},
        { heading: '10. Free access and future subscriptions', paragraphs: [
          'Currently available features of the Service are offered free of charge. Paid features or subscriptions may be introduced in the future.',
          'Before charging, the Service must disclose pricing, included features, duration, payment method, renewal, cancellation and refund terms. Using free features does not create a payment obligation.',
          'Paid terms will apply only after separate publication and an appropriate order, without limiting mandatory consumer protections.'
        ]},
        { heading: '11. Availability, changes and restrictions', paragraphs: [
          'Administration may perform maintenance and update algorithms, interfaces and data sources. Features may be temporarily unavailable.',
          'Access may be restricted for a substantiated security threat or breach of these Terms, subject to Users’ legal rights. Material changes affecting mandatory rights are handled under applicable law.'
        ]},
        { heading: '12. Liability', paragraphs: [
          'To the extent permitted by law, Administration does not guarantee continuous third-party API availability, error-free quotations or returns from independent trading decisions.',
          'These Terms do not exclude liability that cannot legally be excluded, including mandatory consumer protections.'
        ]},
        { heading: '13. Updates, enquiries and disputes', paragraphs: [
          'The current version appears on this page. Material updates are communicated where required by law.',
          'For questions, complaints or account requests, contact info@h00k.top. Disputes are subject to applicable law without restricting access to competent courts or authorities.'
        ]}
      ]
    },
    privacy: {
      title: 'Privacy Policy',
      intro: 'This Policy explains the personal data h00k uses, why it is needed and the rights available to Users. It applies to https://h00k.top.',
      sections: [
        { heading: '1. Data controller and contact', paragraphs: [
          'The h00k operator organizes processing related to the Service. Privacy enquiries may be sent to info@h00k.top.',
          'This contact address does not replace controller identity details that applicable law may require. Those details must be verified and disclosed where required before treating this Policy as legally complete.'
        ]},
        { heading: '2. Categories of personal data', paragraphs: [
          'Registration and sign-in: email address, profile name where supplied, user identifier, securely hashed password, session details and email verification status.',
          'Service use: IP address, request timestamps, browser type, technical logs, chart and filter preferences, selected assets, saved settings and alert information.',
          'Telegram integration: chat identifier, username if supplied, language and alert settings. Support requests: sender address, message content and any attachments.'
        ]},
        { heading: '3. Sources of information', paragraphs: [
          'You provide certain details when registering, connecting integrations or contacting support. Technical information is automatically generated when you use the website.',
          'You provide sign-in details directly to the Service. The configured mail provider may process data needed to deliver email verification and password-reset messages, and Telegram may supply details for notifications you enable. Market quotes from Binance and Bybit generally are not personal data about you.'
        ]},
        { heading: '4. Purposes and legal bases', paragraphs: [
          'Account data and preferences are used to deliver requested features and perform the agreement (GDPR Art. 6(1)(b)). Technical security data may be processed under legitimate interests in service security (Art. 6(1)(f)).',
          'Support communications are processed to assist Users or protect rights (Art. 6(1)(b) or (f), as appropriate). Data required by law is processed to comply with legal obligations (Art. 6(1)(c)).',
          'Optional analytics, advertising or tracking requiring consent may only be used after obtaining it (Art. 6(1)(a) and applicable cookie rules). Consent can be withdrawn.'
        ]},
        { heading: '5. Local storage and cookies', paragraphs: [
          'The Service may use localStorage, sessionStorage and cookies for authentication, language selection, interface preferences and session security.',
          'Strictly necessary storage may be used under applicable exceptions. Non-essential analytics or advertising technologies, if enabled, require valid prior consent where legally necessary.',
          'You can manage browser storage through your browser settings. Actual cookie names, durations and suppliers must be verified against the deployed configuration.'
        ]},
        { heading: '6. Recipients and providers', paragraphs: [
          'Accounts, protected password hashes and profiles are stored in PostgreSQL on the VPS. Email verification and password-recovery messages are delivered by the configured SMTP provider (including OVHcloud MX Plan).',
          'Cloudflare Turnstile is used to prevent automated registration, login attacks and abuse of recovery emails. During verification, Cloudflare may process IP addresses, browser technical data and challenge tokens under its own privacy policy.',
          'Where Telegram alerts are enabled, delivery-related data is sent to Telegram. Other integrations may involve independent providers processing relevant information.',
          'Providers process data under their applicable agreements and legal duties. Independent platforms have their own privacy policies.'
        ]},
        { heading: '7. International data processing', paragraphs: [
          'The Service uses a VPS located in the United Kingdom. Email and other providers may process necessary information in other countries subject to applicable safeguards.',
          'Transfers from the EEA to the UK may rely on the applicable EU adequacy decision. Other international transfers require a lawful transfer mechanism where applicable.',
          'You may request information about relevant safeguards and obtaining a copy by emailing info@h00k.top.'
        ]},
        { heading: '8. Retention', paragraphs: [
          'Account and preference data are retained while the related features are used, until deletion is appropriate or another lawful retention need exists.',
          'Telegram identifiers are kept as needed for the connected feature, including the technical deletion cycle. Logs, support messages and backups are retained only as reasonably necessary for security, support, recovery and legal duties.',
          'Actual periods or criteria must match server and provider configuration. Once processing is no longer needed, data is deleted or anonymized unless law requires otherwise.'
        ]},
        { heading: '9. Security', paragraphs: [
          'Appropriate technical and organizational protections must reflect the deployed architecture, including access controls, secure connections and credential management.',
          'No system is entirely risk-free. Personal data incidents are assessed and reported as required by applicable law.'
        ]},
        { heading: '10. Your rights', paragraphs: [
          'Where GDPR applies, you may request access, rectification, erasure, restriction of processing, object to certain processing and exercise data portability rights.',
          'Where processing relies on consent, you may withdraw it at any time. You may also lodge a complaint with a competent data protection authority.',
          'Send requests to info@h00k.top. Under GDPR the usual response period is one month, subject to lawful extensions.'
        ]},
        { heading: '11. Automated market analysis', paragraphs: [
          'h00k algorithms analyze market information rather than making solely automated decisions about you with legal or similarly significant effects based on personal data.',
          'If such processing is introduced, this Policy and the related safeguards will be updated.'
        ]},
        { heading: '12. Minors', paragraphs: [
          'The Service is intended for adults. If unlawful processing of a child’s data is identified, appropriate measures will be taken under applicable law.'
        ]},
        { heading: '13. External websites', paragraphs: [
          'Links to Binance, Bybit, Telegram, Google and other services lead to independent providers that may have their own privacy policies. Review their terms when using those services.'
        ]},
        { heading: '14. Changes and contact', paragraphs: [
          'This Policy may change as features, providers or laws change. Material updates will be communicated as appropriate; renewed consent will be sought where needed.',
          'For privacy, access or deletion requests, email info@h00k.top.'
        ]}
      ]
    }
  },
  ru: {
    tagline: 'Профессиональный криптовалютный скринер прямо в браузере',
    home: 'На главную',
    termsLink: 'Пользовательское соглашение',
    privacyLink: 'Политика обработки персональных данных',
    contact: 'Связаться с нами',
    copyright: '© 2026. Все права защищены.',
    terms: {
      title: 'Пользовательское соглашение',
      intro: 'Эти условия регулируют доступ к h00k.top и использование криптовалютного аналитического скринера h00k («Сервис»).',
      sections: [
        { heading: '1. Общие положения', paragraphs: [
          'Сервис доступен по адресу https://h00k.top. «Пользователь» — посетитель или владелец аккаунта. «Администрация» — лицо, обеспечивающее работу Сервиса.',
          'Использование функций регулируется этим Соглашением. При регистрации может потребоваться отдельное подтверждение согласия. Если вы не согласны, не используйте соответствующие функции.',
          'Соглашение не ограничивает обязательные права потребителей, предусмотренные законом.'
        ]},
        { heading: '2. Назначение и функции', paragraphs: [
          'h00k предоставляет инструменты мониторинга торговых пар, котировок, объёмов, волатильности, технических формаций, паттернов и других рыночных показателей.',
          'В зависимости от доступа могут быть доступны графики, фильтры, индикаторы настроений рынка, настройки, уведомления Telegram и интеграция с MetaScalp.',
          'Сервис не является биржей, банком, брокером, криптокошельком или хранителем активов. Аналитические функции не означают исполнения сделок от имени Пользователя.'
        ]},
        { heading: '3. Рыночные данные и источники', paragraphs: [
          'Котировки и показатели могут поступать от Binance, Bybit и других независимых поставщиков. Доступность и скорость обновления зависят от внешних API и сети.',
          'Информация может запаздывать, временно не обновляться или показывать последнее полученное значение. «В реальном времени» не означает отсутствие задержек.',
          'Отображаемая цена может отличаться от цены исполнения. Проверяйте рыночные условия непосредственно на бирже перед торговлей.'
        ]},
        { heading: '4. Не является персональной инвестрекомендацией', paragraphs: [
          'Сигналы, формации, рейтинги, уведомления и индикаторы являются общей технической информацией, а не персональными инвестиционными рекомендациями.',
          'Они не учитывают ваши цели, финансовое положение, опыт или допустимый риск. Ни один сигнал не гарантирует прибыль или движение цены.',
          'Вы самостоятельно оцениваете данные и принимаете торговые решения. При необходимости обратитесь к независимому специалисту.'
        ]},
        { heading: '5. Риски торговли', paragraphs: [
          'Криптоактивы, особенно фьючерсы и инструменты с плечом, связаны с высоким риском, включая быструю или полную потерю капитала.',
          'Риски включают волатильность, ликвидации, недостаток ликвидности, проскальзывание, сбои бирж, неточные данные и задержанные уведомления. Прошлые результаты не гарантируют будущих.'
        ]},
        { heading: '6. Аккаунты и безопасность', paragraphs: [
          'Для некоторых функций нужна регистрация. Вход осуществляется по электронной почте и паролю после подтверждения адреса.',
          'Предоставляйте достоверные сведения и защищайте учётные данные. Не пользуйтесь чужими аккаунтами без разрешения. О подозрении на взлом сообщайте на info@h00k.top.',
          'Запрос на закрытие аккаунта и удаление данных можно отправить на контактный адрес. Законные исключения из удаления указаны в Политике конфиденциальности.'
        ]},
        { heading: '7. Уведомления и сторонние интеграции', paragraphs: [
          'Telegram-уведомления и интеграции, включая MetaScalp, зависят от сторонних сервисов и сетей. Доставка в конкретное время не гарантируется.',
          'Уведомления не являются торговыми поручениями. Если сторонний инструмент позволяет торговать, Пользователь сам проверяет и подтверждает операции.',
          'К сторонним продуктам также применяются собственные условия их поставщиков.'
        ]},
        { heading: '8. Запрещённые действия', paragraphs: [
          'Запрещены несанкционированный доступ, обход авторизации, атаки на инфраструктуру, вредоносное ПО, мошенничество и нарушение прав третьих лиц.',
          'Нельзя массово копировать или перепродавать защищённые данные с нарушением прав владельцев. Законные действия, которые нельзя ограничить договором, остаются разрешёнными.'
        ]},
        { heading: '9. Интеллектуальная собственность', paragraphs: [
          'Оригинальные программы, дизайн, контент и другие элементы h00k могут защищаться законодательством. Доступ не означает передачи прав собственности.',
          'Binance, Bybit, Telegram, MetaScalp и другие обозначения принадлежат правообладателям. Упоминание не означает партнёрства или одобрения.'
        ]},
        { heading: '10. Бесплатный доступ и будущие подписки', paragraphs: [
          'Сейчас доступные функции Сервиса предоставляются бесплатно. В будущем могут появиться платные функции или подписки.',
          'До оплаты Сервис должен сообщить стоимость, функции, срок, способ оплаты, продление, отмену и правила возврата средств. Бесплатное использование не создаёт обязанности платить.',
          'Платные условия будут действовать только после отдельного опубликования и соответствующего заказа с учётом обязательных прав потребителей.'
        ]},
        { heading: '11. Доступность, изменения и ограничения', paragraphs: [
          'Администрация может обслуживать Сервис, обновлять алгоритмы, интерфейс и источники. Отдельные функции могут временно быть недоступны.',
          'Доступ может ограничиваться при обоснованной угрозе безопасности или нарушении правил с соблюдением прав Пользователя. Существенные изменения производятся согласно закону.'
        ]},
        { heading: '12. Ответственность', paragraphs: [
          'В разрешённых законом пределах Администрация не гарантирует бесперебойную работу сторонних API, точность каждой котировки или прибыль от самостоятельных торговых решений.',
          'Это Соглашение не исключает ответственность, которую нельзя исключать по закону, и не ограничивает обязательные права потребителей.'
        ]},
        { heading: '13. Обновления, обращения и споры', paragraphs: [
          'Текущая редакция размещается на этой странице. О существенных изменениях сообщается, если это требуется законом.',
          'Для обращений, жалоб или вопросов об аккаунте пишите на info@h00k.top. Споры регулируются применимым правом без ограничения права обращаться в компетентный суд или орган.'
        ]}
      ]
    },
    privacy: {
      title: 'Политика обработки персональных данных',
      intro: 'Политика объясняет, какие персональные данные использует h00k, зачем они нужны и какие права есть у Пользователя. Она применяется к https://h00k.top.',
      sections: [
        { heading: '1. Ответственный за данные и связь', paragraphs: [
          'Обработку в рамках работы Сервиса организует оператор h00k. По вопросам данных обращайтесь на info@h00k.top.',
          'Этот адрес не заменяет сведения о личности контролёра, если их требует закон. До признания Политики юридически завершённой такие сведения необходимо проверить и раскрыть, когда это обязательно.'
        ]},
        { heading: '2. Категории персональных данных', paragraphs: [
          'Регистрация и вход: email, имя профиля при наличии, идентификатор пользователя, защищённый хеш пароля, сведения о сессиях и подтверждении адреса.',
          'Использование: IP-адрес, время запросов, браузер, технические журналы, настройки фильтров и графиков, выбранные активы и уведомления.',
          'Интеграция Telegram: идентификатор чата, имя пользователя при передаче, язык и настройки уведомлений. Поддержка: email, сообщения и вложения.'
        ]},
        { heading: '3. Источники информации', paragraphs: [
          'Часть данных вы предоставляете при регистрации, подключении интеграций и обращении в поддержку. Технические данные формируются автоматически.',
          'Данные для входа вы предоставляете непосредственно Сервису. Почтовый провайдер может обрабатывать сведения, необходимые для отправки подтверждений и восстановления пароля, а Telegram — данные уведомлений при добровольном подключении. Рыночные котировки Binance и Bybit обычно не являются вашими персональными данными.'
        ]},
        { heading: '4. Цели и правовые основания', paragraphs: [
          'Данные аккаунта и настроек нужны для предоставления функций и выполнения договора (ст. 6(1)(b) GDPR). Данные безопасности могут обрабатываться в законных интересах защиты Сервиса (ст. 6(1)(f)).',
          'Обращения обрабатываются для поддержки или защиты прав (ст. 6(1)(b) либо (f) по ситуации). Обязательные по закону данные — для исполнения юридической обязанности (ст. 6(1)(c)).',
          'Необязательная аналитика, реклама или отслеживание, требующие согласия, могут применяться только после его получения (ст. 6(1)(a) GDPR и нормы о cookies). Согласие можно отозвать.'
        ]},
        { heading: '5. Локальное хранение и cookies', paragraphs: [
          'Сервис может использовать localStorage, sessionStorage и cookies для входа, выбора языка, настроек и защиты сессии.',
          'Технически необходимое хранение может применяться согласно законным исключениям. Необязательные аналитические или рекламные технологии, если включены, требуют предварительного согласия, когда это предусмотрено законом.',
          'Управлять хранилищем можно в браузере. Реальные имена cookies, сроки и поставщиков следует проверять по фактической конфигурации.'
        ]},
        { heading: '6. Получатели и поставщики', paragraphs: [
          'Аккаунты, защищённые хеши паролей и профили хранятся в PostgreSQL на VPS. Письма подтверждения и восстановления пароля отправляет настроенный SMTP-провайдер (в том числе OVHcloud MX Plan).',
          'Для защиты от автоматических регистраций, перебора паролей и злоупотребления почтовыми сообщениями используется Cloudflare Turnstile. Во время проверки Cloudflare может обрабатывать IP-адреса, технические данные браузера и токены проверки согласно своей политике конфиденциальности.',
          'При включённых Telegram-уведомлениях необходимые данные передаются Telegram. Другие интеграции могут включать независимых поставщиков.',
          'Поставщики обрабатывают данные в рамках своих договоров и требований закона. У независимых платформ действуют собственные политики.'
        ]},
        { heading: '7. Международная обработка', paragraphs: [
          'Используемый Сервисом VPS расположен в Великобритании. Почтовые и другие поставщики могут обрабатывать необходимые сведения в других странах при соблюдении применимых гарантий.',
          'Для передачи данных из ЕЭЗ в Великобританию может использоваться решение ЕС об адекватной защите. Иные международные передачи требуют законного механизма, когда он применим.',
          'Информацию о гарантиях и получении их копии можно запросить по адресу info@h00k.top.'
        ]},
        { heading: '8. Сроки хранения', paragraphs: [
          'Данные аккаунта и настроек хранятся, пока используются соответствующие функции, до надлежащего удаления либо при иной законной необходимости хранения.',
          'Идентификаторы Telegram сохраняются по мере необходимости для подключённой функции с учётом технического цикла удаления. Журналы, обращения и резервные копии хранятся столько, сколько разумно требуется для безопасности, поддержки, восстановления и закона.',
          'Фактические сроки и критерии должны соответствовать настройкам сервера и поставщиков. После исчезновения цели данные удаляются или анонимизируются, если закон не требует другого.'
        ]},
        { heading: '9. Безопасность', paragraphs: [
          'Меры защиты должны соответствовать реальной архитектуре, включая контроль доступа, защищённые соединения и управление учётными данными.',
          'Абсолютной безопасности нет. Инциденты оцениваются, а уведомления направляются в случаях, предусмотренных законом.'
        ]},
        { heading: '10. Ваши права', paragraphs: [
          'При применении GDPR вы можете запрашивать доступ, исправление, удаление, ограничение обработки, возражать против некоторых операций и использовать право на переносимость данных.',
          'Если обработка основана на согласии, его можно отозвать. Вы также вправе подать жалобу в компетентный орган защиты данных.',
          'Запросы направляйте на info@h00k.top. По GDPR обычный срок ответа — один месяц с законными возможностями продления.'
        ]},
        { heading: '11. Автоматизированная аналитика', paragraphs: [
          'Алгоритмы h00k анализируют рынки, а не принимают исключительно автоматизированные решения о вас с юридическими или аналогично существенными последствиями на основе персональных данных.',
          'При внедрении такой обработки Политика и меры защиты будут обновлены.'
        ]},
        { heading: '12. Несовершеннолетние', paragraphs: [
          'Сервис ориентирован на совершеннолетних. При выявлении незаконной обработки данных ребёнка принимаются меры согласно закону.'
        ]},
        { heading: '13. Сторонние ресурсы', paragraphs: [
          'Ссылки на Binance, Bybit, Telegram, Google и другие сервисы ведут к независимым поставщикам со своими политиками. Ознакомьтесь с ними перед использованием.'
        ]},
        { heading: '14. Изменения и контакты', paragraphs: [
          'Политика может обновляться при изменении функций, поставщиков или законодательства. Существенные изменения сообщаются надлежащим образом; при необходимости запрашивается новое согласие.',
          'По вопросам конфиденциальности, доступа или удаления данных пишите на info@h00k.top.'
        ]}
      ]
    }
  },
  pl: {
    tagline: 'Profesjonalny skaner kryptowalut bezpośrednio w przeglądarce',
    home: 'Strona główna',
    termsLink: 'Regulamin korzystania',
    privacyLink: 'Polityka przetwarzania danych osobowych',
    contact: 'Kontakt',
    copyright: '© 2026. Wszelkie prawa zastrzeżone.',
    terms: {
      title: 'Regulamin korzystania',
      intro: 'Niniejszy regulamin określa zasady dostępu do h00k.top i korzystania z serwisu analitycznego rynku kryptowalut h00k („Serwis”).',
      sections: [
        { heading: '1. Postanowienia ogólne', paragraphs: [
          'Serwis jest dostępny pod adresem https://h00k.top. „Użytkownik” oznacza odwiedzającego lub posiadacza konta. „Administracja” oznacza osobę prowadzącą Serwis.',
          'Korzystanie z funkcji Serwisu podlega niniejszemu Regulaminowi. Rejestracja może wymagać odrębnego zaakceptowania warunków. Jeśli nie wyrażasz zgody, nie korzystaj z odpowiednich funkcji.',
          'Regulamin nie ogranicza ustawowych praw konsumenta, których nie można wyłączyć umową.'
        ]},
        { heading: '2. Przeznaczenie i funkcje', paragraphs: [
          'h00k umożliwia monitorowanie par handlowych, notowań, wolumenu, zmienności, formacji technicznych, wzorców i innych wskaźników rynkowych.',
          'W zależności od dostępu dostępne mogą być wykresy, filtry, wskaźniki nastroju rynku, ustawienia, powiadomienia Telegram oraz integracja z MetaScalp.',
          'Serwis nie jest giełdą, bankiem, brokerem, portfelem kryptowalutowym ani powiernikiem aktywów. Funkcje analityczne nie oznaczają wykonywania transakcji w imieniu Użytkownika.'
        ]},
        { heading: '3. Dane rynkowe i źródła', paragraphs: [
          'Notowania i wskaźniki mogą pochodzić z Binance, Bybit i innych niezależnych źródeł. Dostępność i szybkość aktualizacji zależą od zewnętrznych API i sieci.',
          'Dane mogą być opóźnione, chwilowo nieaktualne lub przedstawiać ostatnią odebraną wartość. Określenie „w czasie rzeczywistym” nie gwarantuje braku opóźnień.',
          'Wyświetlana cena może różnić się od ceny realizacji zlecenia. Przed transakcją sprawdź aktualne warunki bezpośrednio na giełdzie.'
        ]},
        { heading: '4. Brak indywidualnych porad inwestycyjnych', paragraphs: [
          'Sygnały, formacje, rankingi, alerty i wskaźniki mają ogólny, informacyjno-analityczny charakter i nie są zindywidualizowanymi rekomendacjami inwestycyjnymi.',
          'Nie uwzględniają Twoich celów, sytuacji finansowej, doświadczenia ani tolerancji ryzyka. Żaden sygnał nie gwarantuje zysku ani określonego ruchu ceny.',
          'Samodzielnie oceniasz informacje i podejmujesz decyzje. W razie potrzeby skorzystaj z niezależnej specjalistycznej porady.'
        ]},
        { heading: '5. Ryzyko handlu', paragraphs: [
          'Kryptoaktywa, zwłaszcza kontrakty futures i instrumenty lewarowane, wiążą się z wysokim ryzykiem, w tym szybką lub całkowitą utratą środków.',
          'Ryzyka obejmują zmienność, likwidację pozycji, brak płynności, poślizg cenowy, awarie giełd, błędne dane i opóźnione powiadomienia. Wyniki historyczne nie gwarantują przyszłych.'
        ]},
        { heading: '6. Konta i bezpieczeństwo', paragraphs: [
          'Niektóre funkcje wymagają rejestracji. Logowanie odbywa się przez e-mail i hasło po potwierdzeniu adresu.',
          'Podawaj prawdziwe dane i chroń dane logowania. Nie uzyskuj dostępu do cudzych kont bez zgody. Podejrzenia przejęcia konta zgłaszaj na info@h00k.top.',
          'Prośbę o zamknięcie konta lub usunięcie danych możesz wysłać na wskazany adres. Ustawowe wyjątki od usunięcia opisuje Polityka prywatności.'
        ]},
        { heading: '7. Alerty i zewnętrzne integracje', paragraphs: [
          'Powiadomienia Telegram i integracje, np. MetaScalp, zależą od usług osób trzecich i sieci. Terminowe dostarczenie nie jest gwarantowane.',
          'Alerty nie są zleceniami handlowymi. Jeśli zewnętrzne narzędzie umożliwia handel, Użytkownik odpowiada za sprawdzenie i zatwierdzenie transakcji.',
          'Do produktów zewnętrznych stosuje się także ich własne regulaminy.'
        ]},
        { heading: '8. Niedozwolone działania', paragraphs: [
          'Zakazane są nieuprawniony dostęp, obchodzenie uwierzytelniania, ataki na infrastrukturę, złośliwe oprogramowanie, oszustwa i naruszanie praw innych osób.',
          'Nie wolno masowo kopiować ani odsprzedawać chronionych danych z naruszeniem praw właścicieli. Działania, których nie można prawnie zakazać, pozostają dozwolone.'
        ]},
        { heading: '9. Własność intelektualna', paragraphs: [
          'Oryginalne oprogramowanie, projekt graficzny, treści i inne elementy h00k mogą być chronione prawem własności intelektualnej. Dostęp nie przenosi praw własności.',
          'Binance, Bybit, Telegram, MetaScalp i inne znaki należą do odpowiednich właścicieli. Ich wymienienie nie oznacza partnerstwa ani poparcia.'
        ]},
        { heading: '10. Bezpłatny dostęp i przyszłe subskrypcje', paragraphs: [
          'Obecnie dostępne funkcje Serwisu są bezpłatne. W przyszłości mogą zostać wprowadzone płatne funkcje lub subskrypcje.',
          'Przed pobraniem opłaty Serwis musi poinformować o cenie, funkcjach, czasie trwania, płatności, odnowieniu, anulowaniu i zwrotach. Korzystanie z bezpłatnych funkcji nie rodzi obowiązku zapłaty.',
          'Warunki płatne będą obowiązywać dopiero po osobnym opublikowaniu i odpowiednim zamówieniu, z poszanowaniem obowiązkowych praw konsumentów.'
        ]},
        { heading: '11. Dostępność, zmiany i ograniczenia', paragraphs: [
          'Administracja może prowadzić konserwację oraz zmieniać algorytmy, interfejs i źródła danych. Niektóre funkcje mogą czasowo nie działać.',
          'Dostęp może być ograniczony z uzasadnionych względów bezpieczeństwa lub naruszenia Regulaminu, z poszanowaniem praw Użytkowników. Istotne zmiany podlegają odpowiednim przepisom.'
        ]},
        { heading: '12. Odpowiedzialność', paragraphs: [
          'W zakresie dozwolonym prawem Administracja nie gwarantuje nieprzerwanej pracy cudzych API, bezbłędności wszystkich notowań ani zysku z samodzielnych decyzji handlowych.',
          'Regulamin nie wyłącza odpowiedzialności, której nie można wyłączyć ustawowo, ani obowiązkowych praw konsumenta.'
        ]},
        { heading: '13. Aktualizacje, kontakt i spory', paragraphs: [
          'Aktualna wersja jest publikowana na tej stronie. O istotnych zmianach informuje się, gdy wymaga tego prawo.',
          'Pytania, reklamacje i wnioski dotyczące kont kieruj na info@h00k.top. Spory podlegają obowiązującemu prawu bez ograniczania dostępu do właściwego sądu lub organu.'
        ]}
      ]
    },
    privacy: {
      title: 'Polityka przetwarzania danych osobowych',
      intro: 'Niniejsza Polityka wyjaśnia, jakie dane osobowe przetwarza h00k, w jakim celu i jakie prawa przysługują Użytkownikom. Dotyczy https://h00k.top.',
      sections: [
        { heading: '1. Administrator danych i kontakt', paragraphs: [
          'Przetwarzanie danych związanych z działaniem Serwisu organizuje operator h00k. Pytania dotyczące prywatności można kierować na info@h00k.top.',
          'Ten adres kontaktowy nie zastępuje danych identyfikujących administratora, jeśli wymaga ich prawo. Przed uznaniem Polityki za prawnie kompletną należy je zweryfikować i ujawnić tam, gdzie jest to obowiązkowe.'
        ]},
        { heading: '2. Kategorie danych osobowych', paragraphs: [
          'Rejestracja i logowanie: adres e-mail, nazwa profilu (jeżeli podana), identyfikator użytkownika, zabezpieczony skrót hasła, dane sesji oraz status potwierdzenia adresu.',
          'Korzystanie z Serwisu: adres IP, czas żądań, rodzaj przeglądarki, logi techniczne, ustawienia filtrów i wykresów, wybrane aktywa, zapisane preferencje oraz alerty.',
          'Integracja Telegram: identyfikator czatu, nazwa użytkownika (jeśli przekazana), język i ustawienia powiadomień. Pomoc techniczna: adres nadawcy, treść wiadomości i załączniki.'
        ]},
        { heading: '3. Źródła danych', paragraphs: [
          'Część danych podajesz podczas rejestracji, uruchamiania integracji i kontaktu z pomocą. Dane techniczne powstają automatycznie podczas korzystania ze strony.',
          'Dane logowania przekazujesz bezpośrednio Serwisowi. Dostawca poczty może przetwarzać informacje potrzebne do wysyłania potwierdzeń adresu i odzyskiwania hasła, a Telegram — dane powiadomień po dobrowolnym połączeniu. Notowania Binance i Bybit zwykle nie są Twoimi danymi osobowymi.'
        ]},
        { heading: '4. Cele i podstawy prawne', paragraphs: [
          'Dane konta i ustawień służą świadczeniu zamówionych funkcji i wykonaniu umowy (art. 6 ust. 1 lit. b RODO). Dane bezpieczeństwa mogą być przetwarzane w prawnie uzasadnionym interesie ochrony Serwisu (art. 6 ust. 1 lit. f).',
          'Wiadomości do pomocy obsługujemy w celu wsparcia lub ochrony praw (art. 6 ust. 1 lit. b lub f, zależnie od sprawy). Dane wymagane prawem przetwarzamy na podstawie obowiązku prawnego (art. 6 ust. 1 lit. c).',
          'Nieobowiązkowa analityka, reklama i śledzenie wymagające zgody mogą być uruchamiane tylko po jej uzyskaniu (art. 6 ust. 1 lit. a RODO i przepisy o cookies). Zgodę można wycofać.'
        ]},
        { heading: '5. Pamięć lokalna i cookies', paragraphs: [
          'Serwis może korzystać z localStorage, sessionStorage i cookies do logowania, wyboru języka, ustawień interfejsu i zabezpieczenia sesji.',
          'Niezbędne technicznie przechowywanie może korzystać z ustawowych wyjątków. Nieobowiązkowe technologie analityczne lub reklamowe, jeśli są uruchomione, wymagają uprzedniej zgody tam, gdzie nakazuje to prawo.',
          'Pamięcią przeglądarki możesz zarządzać w jej ustawieniach. Faktyczne nazwy, okresy i dostawców cookies należy zweryfikować z konfiguracją Serwisu.'
        ]},
        { heading: '6. Odbiorcy i dostawcy', paragraphs: [
          'Konta, zabezpieczone skróty haseł i profile są przechowywane w PostgreSQL na VPS. Wiadomości weryfikacyjne i służące do odzyskiwania hasła dostarcza skonfigurowany dostawca SMTP (w tym OVHcloud MX Plan).',
          'Do ochrony przed automatyczną rejestracją, próbami logowania i nadużywaniem wiadomości e-mail służy Cloudflare Turnstile. Podczas weryfikacji Cloudflare może przetwarzać adres IP, dane techniczne przeglądarki i token weryfikacyjny zgodnie ze swoją polityką prywatności.',
          'Przy włączonych alertach informacje niezbędne do doręczenia są przekazywane Telegramowi. Inne integracje mogą obejmować niezależnych dostawców.',
          'Dostawcy przetwarzają dane zgodnie z odpowiednimi umowami i obowiązkami prawnymi. Niezależne platformy mają własne polityki prywatności.'
        ]},
        { heading: '7. Międzynarodowe przetwarzanie', paragraphs: [
          'Serwis korzysta z serwera VPS w Wielkiej Brytanii. Dostawcy poczty i innych usług mogą przetwarzać niezbędne dane w innych państwach z zastosowaniem odpowiednich zabezpieczeń.',
          'Przekazywanie danych z EOG do Wielkiej Brytanii może opierać się na obowiązującej decyzji UE o odpowiednim stopniu ochrony. Inne transfery międzynarodowe wymagają właściwej podstawy prawnej, gdy ma to zastosowanie.',
          'Informacje o zabezpieczeniach i możliwości uzyskania ich kopii można uzyskać pod adresem info@h00k.top.'
        ]},
        { heading: '8. Okres przechowywania', paragraphs: [
          'Dane konta i preferencji przechowuje się podczas korzystania z funkcji, do czasu odpowiedniego usunięcia lub w razie innej zgodnej z prawem potrzeby.',
          'Identyfikatory Telegrama są przechowywane tak długo, jak są potrzebne do aktywnej integracji, z uwzględnieniem technicznego cyklu usuwania. Logi, korespondencja i kopie zapasowe pozostają tylko tak długo, jak jest to racjonalnie niezbędne dla bezpieczeństwa, pomocy, odtworzenia i obowiązków prawnych.',
          'Rzeczywiste okresy lub kryteria muszą być zgodne z konfiguracją serwerów i dostawców. Po ustaniu celu dane są usuwane lub anonimizowane, jeśli prawo nie wymaga inaczej.'
        ]},
        { heading: '9. Bezpieczeństwo', paragraphs: [
          'Środki techniczne i organizacyjne powinny odpowiadać rzeczywistej architekturze, w tym kontroli dostępu, ochronie połączeń i zarządzaniu danymi logowania.',
          'Żaden system nie jest całkowicie wolny od ryzyka. Incydenty są oceniane i zgłaszane, gdy wymagają tego przepisy.'
        ]},
        { heading: '10. Twoje prawa', paragraphs: [
          'Gdy stosuje się RODO, możesz żądać dostępu, sprostowania, usunięcia, ograniczenia przetwarzania, sprzeciwić się określonemu przetwarzaniu i korzystać z prawa przenoszenia danych.',
          'Jeśli podstawą jest zgoda, możesz ją wycofać. Możesz również wnieść skargę do właściwego organu nadzorczego.',
          'Wnioski wysyłaj na info@h00k.top. Zgodnie z RODO standardowy czas odpowiedzi to miesiąc, z możliwością ustawowego przedłużenia.'
        ]},
        { heading: '11. Zautomatyzowana analiza rynku', paragraphs: [
          'Algorytmy h00k analizują dane rynkowe, a nie podejmują wobec Ciebie decyzji wyłącznie automatycznych o skutkach prawnych lub podobnie istotnych na podstawie danych osobowych.',
          'Jeśli takie przetwarzanie zostanie wprowadzone, Polityka i odpowiednie zabezpieczenia zostaną zaktualizowane.'
        ]},
        { heading: '12. Osoby niepełnoletnie', paragraphs: [
          'Serwis jest przeznaczony dla dorosłych. Po stwierdzeniu niezgodnego z prawem przetwarzania danych dziecka zostaną podjęte wymagane działania.'
        ]},
        { heading: '13. Strony zewnętrzne', paragraphs: [
          'Linki do Binance, Bybit, Telegram, Google i innych usług prowadzą do niezależnych podmiotów z własnymi politykami prywatności. Zapoznaj się z ich zasadami.'
        ]},
        { heading: '14. Zmiany i kontakt', paragraphs: [
          'Polityka może się zmieniać wraz z funkcjami, dostawcami i przepisami. Istotne zmiany są komunikowane odpowiednio; nowa zgoda jest uzyskiwana, jeśli jest potrzebna.',
          'W sprawach prywatności, dostępu lub usunięcia danych pisz na info@h00k.top.'
        ]}
      ]
    }
  }
};

export function getLegalCopy(language: SupportedLanguage): LegalCopy {
  return legalContent[language] ?? legalContent.uk;
}
