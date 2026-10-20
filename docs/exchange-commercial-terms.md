# Комерційні дані: перевірка 16.10.2026

Письмові дозволи від бірж у цьому завданні не надавалися. Нижче розділено підтверджений текст і питання, які потребують відповіді біржі. Наявність публічного API або власного VPS не є комерційною ліцензією.

| Джерело | Що підтверджено | Що потрібно для h00k.top |
| --- | --- | --- |
| Binance Vision, історичні набори | [Офіційні Dataset Terms](https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md), версія 1.0, дата 26.08.2026: §3 — некомерційна ліцензія; §3.4 — окрема письмова enterprise-ліцензія для комерційного використання. §4 охоплює також похідні дані, платні продукти та сигнали. MIT у README стосується не автоматичного дозволу продавати набори даних. | Окремо погодити історію, Replay, похідні індикатори й Telegram-сигнали. Завантажувачі архівів Vision у цій зміні не додаються. |
| Binance live REST/WebSocket | [Документація](https://developers.binance.com/en/docs/products/spot/rest-api) описує публічний технічний доступ та IP-ліміти. Сторінка [Product Terms](https://www.binance.com/en/terms) у доступному представленні не дала повного тексту, достатнього для підтвердження прав на платний показ. | Письмово підтвердити live display, серверний кеш/ретрансляцію, похідну аналітику та дозволені юрисдикції. Правила Vision не слід автоматично переносити на всі live API; комерційний дозвіл також не слід припускати. |
| Bybit | [Офіційний API Agreement PDF](https://www.bybit.com/common-static/compliance/legal/BYBIT/df1923006718fbba8ba70d7d762b9866.pdf): §6.7 обмежує перепакування/перепродаж API або Service Data, §6.9 — комерційну експлуатацію API. §5.1 описує обмежену відкличну ліцензію. [Help Center](https://www.bybit.com/en/help-center/article/API-Terms) направляє на [актуальну legal-сторінку](https://www.bybit.com/en/legal/service-specific-terms/API-Terms), але її повний текст не був доступний у текстовому представленні. | Підтвердити актуальну редакцію й застосування до публічних market feeds; отримати письмову згоду/угоду на платний скрінер. Не вважати broker/referral-реєстрацію самостійною ліцензією на дані. |

## Результат

Комерційний дозвіл для h00k.top не підтверджено. Технічні тести та успішний деплой не змінюють цей результат. Завершити договірну частину можна лише відповіддю/угодою правовласника або договором із постачальником, який має потрібні права на подальший показ саме цих даних.

Власнику потрібно звернутися через офіційну підтримку Binance та Bybit і попросити направити запит команді market-data licensing / institutional / API partnerships. Не надсилайте їм API secrets, Telegram-токен або SSH-ключі. Збережіть відповідь разом із версією угоди, дозволеними джерелами/регіонами, строком, обсягом і умовами атрибуції.

## Готовий запит для перевірки й надсилання власником

Subject: Written market-data display and redistribution permission for h00k.top

Hello,

I operate h00k.top, a multi-user cryptocurrency screener hosted on my own OVHcloud VPS (IP 57.129.171.244). Registered users receive a three-day trial; continued access to advanced analytics is offered through a paid subscription.

Please confirm the applicable agreement and whether our proposed use requires a separate commercial market-data license or partnership:

- Display of your Spot and USDT perpetual market data to authenticated users.
- Shared server-side REST/WebSocket collection, bounded caching and fan-out to browsers.
- Candlestick history and Replay/backtesting.
- Derived technical indicators, order-book analysis, price monitoring and personalized Telegram alerts.
- Charging for the screener's analytics and access, without offering an unrestricted raw-data API.

Please specify permitted countries, data categories, historical retention, attribution, limits, fees and whether distribution of derived signals is covered. Please clarify that any written authorization covers both live display and historical/derived data; technical API access or referral registration alone is not being treated as permission.

Operator legal name and country: [to be provided by owner].
Target customer countries and expected concurrent users: [to be provided by owner].

Please send the applicable current terms and any written authorization/license process before we represent this use as approved.

Thank you.

Цей запит підготовлено, але не надіслано від імені власника. Ліцензію не оформлено та жодних платежів/зобов'язань перед біржами не створено.
