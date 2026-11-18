# Оновлення SEO на h00k.top

Після злиття PR у `main` оновіть сервіс `app` на VPS.

```bash
cd /home/ubuntu/h00k &&
git switch main &&
git pull --ff-only origin main &&
docker compose up -d --build --no-deps app &&
docker compose ps
```

Після того як `app` стане `healthy`, перевірте публічні відповіді.

```bash
curl -fsS https://h00k.top/api/health
curl -fsS https://h00k.top/robots.txt
curl -fsS https://h00k.top/sitemap.xml | grep -c '<loc>'
for lang in uk en pl ru; do
  for page in scalping market-replay liquidations; do
    curl -fsSI "https://h00k.top/$lang/$page.html"
  done
done
curl -sSI https://h00k.top/seo-page-that-does-not-exist
curl -sSI https://www.h00k.top/en/scalping.html
```

Карта сайту має містити 39 URL. Перевірені посібники мають відповідати HTTP 200, неіснуюча адреса — 404, а адреса з `www` — 308 із `Location: https://h00k.top/en/scalping.html`.

Користувацька угода й політика конфіденційності мають повний український текст у початковому HTML за адресами `/terms` та `/privacy`. Збірка використовує ті самі тексти, що й застосунок. Адреси з `.html` перенаправляються на канонічні. Перевірте на VPS, що `curl -fsS https://h00k.top/terms` повертає заголовок і всі розділи документа.

Посібники генеруються під час збірки. Під час їх перегляду браузер завантажує статичні файли. Для HTML посібників, їхнього CSS, `robots.txt` і `sitemap.xml` очікується `Cache-Control: public, max-age=300`. Повторна перевірка незміненого файлу з `If-None-Match` повертає 304 без тіла. Правило `Disallow: /api/` скеровує пошукових роботів до HTML замість службових API. Сторінки угоди та конфіденційності використовують сесію для оформлення профілю й обходяться без торгових потоків, алертів та моніторингу.

Після оновлення відкрийте [Google Search Console](https://search.google.com/search-console/), виберіть ресурс `h00k.top` і подайте `https://h00k.top/sitemap.xml` у розділі «Карти сайту». У «Перевірці URL» перевірте головну й `https://h00k.top/uk/scalping.html`, а потім одну іншу мовну версію. «Перевірити опубліковану URL-адресу» показує доступність сторінки для Google. Звіт індексації та перевірка URL показують фактичну наявність в індексі.

- [Подання карти сайту](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Перевірка індексації](https://support.google.com/webmasters/answer/9012289)

## Пошукові фрази за сторінками

У кожній мовній версії використано фрази, що описують завдання, яке допомагає виконати сторінка. Посібники доступні за адресами `/{мова}/{сторінка}.html`.

| Сторінка | Українська | English | Polski | Русский |
|---|---|---|---|---|
| `crypto-screener` | Криптоскрінер Binance і Bybit з фільтрами | Binance and Bybit crypto screener filters | Filtry skanera kryptowalut Binance i Bybit | Криптоскринер Binance и Bybit с фильтрами |
| `scalping` | Криптоскрінер для скальпінгу, пошук активних монет | Crypto scalping screener, volume and volatility | Skaner kryptowalut do scalpingu | Криптоскринер для скальпинга |
| `day-trading` | Дейтрейдинг криптовалют, внутрішньоденний аналіз | Crypto day trading tools | Narzędzia do day tradingu kryptowalut | Внутридневная торговля криптовалютами |
| `hookchart` | Свічкові графіки, стакан заявок, відкритий інтерес | Candlestick charts, order-book depth, open interest | Wykresy świecowe, arkusz zleceń, open interest | Свечные графики, стакан, открытый интерес |
| `crypto-patterns` | Подвійне дно W, подвійна вершина M, дельта обсягу та CVD | Double bottom, double top, volume delta and CVD | Podwójne dno, podwójny szczyt, delta wolumenu i CVD | Двойное дно, двойная вершина, дельта объёма и CVD |
| `terminal` | Криптотермінал із кількома графіками | Multi-chart crypto terminal | Terminal kryptowalut z wieloma wykresami | Криптотерминал с несколькими графиками |
| `alerts` | Цінові сповіщення в Telegram і браузері | Crypto price alerts on Telegram and in the browser | Alerty cenowe na Telegramie i w przeglądarce | Ценовые уведомления в Telegram и браузере |
| `market-replay` | Відтворення історичних свічок, симулятор торгівлі | Crypto Bar Replay, manual backtesting | Odtwarzanie świec, symulator handlu kryptowalutami | Реплей исторических свечей, симулятор торговли |
| `liquidations` | Карта ліквідацій Binance і Bybit | Binance and Bybit crypto liquidation heatmap | Mapa likwidacji Binance i Bybit | Карта ликвидаций Binance и Bybit |
