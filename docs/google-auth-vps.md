# Google-вхід на h00k.top

VPS запускає сайт і сервер сповіщень. Google-вхід працює через чинний Firebase-проєкт **knowledgeable-text-whh41**. Той самий проєкт зберігає Firebase UID користувачів і доступ до їхніх даних.

## Налаштування для чинного проєкту та Starter Tier

Застосунок використовує `signInWithPopup` зі стандартним доменом Firebase `knowledgeable-text-whh41.firebaseapp.com`. Це підтримуваний Firebase спосіб Google-входу для сайту, розміщеного поза Firebase Hosting. Після входу користувач продовжує роботу на `https://h00k.top`.

Відкрийте [Firebase Authentication](https://console.firebase.google.com/project/knowledgeable-text-whh41/authentication/providers):

1. **Sign-in method → Google**: provider має бути ввімкнений. Збережіть чинного provider і його OAuth client.
2. **Settings → Authorized domains → Add domain**: додайте `h00k.top`, без `https://` та шляхів. Якщо використовуватиметься `www`, додайте його окремо.
3. Залиште `knowledgeable-text-whh41.firebaseapp.com` у списку дозволених доменів.

У цьому режимі використовується чинний Firebase callback:

```text
https://knowledgeable-text-whh41.firebaseapp.com/__/auth/handler
```

Додавати `https://h00k.top/__/auth/handler` до Google OAuth client для цього режиму не потрібно. Сторінка **Welcome to Starter Tier** є обмеженою консоллю керованого Google AI Studio проєкту; Google-вхід у ньому попередньо налаштований. Для використання чинного Firebase callback не потрібні Upgrade, новий Google Cloud проєкт або платіжна картка.

## Конфігурація VPS

Рекомендовані значення приватного `~/hook2/.env`:

```dotenv
DOMAIN=h00k.top
FIREBASE_AUTH_DOMAIN_OVERRIDE=
```

Порожнє або відсутнє `FIREBASE_AUTH_DOMAIN_OVERRIDE` залишає стандартний `authDomain` з `firebase-applet-config.json`. Старе `FIREBASE_AUTH_DOMAIN=h00k.top` більше не використовується під час build: оновлення виправляє callback навіть зі старим `.env`, без зміни токенів і даних користувачів. Google client secret на VPS вводити не потрібно.

Після успішного Validate автоматичний агент збирає й розгортає новий frontend. Закрийте попереднє вікно помилки Google, перезавантажте `https://h00k.top` і натисніть Google-вхід знову. Вікно входу може показувати домен Firebase — це очікувано для рекомендованої конфігурації.

## Перевірка входу

У звичайному Safari або Chrome відкрийте сайт, натисніть Google-вхід, виберіть власний акаунт і перевірте профіль та власні правила. Повторіть на телефоні. Реєстрація в hook2 не потребує коду й надає 3 дні повного доступу. Подальше продовження описано в [керуванні доступом](access-management.md).

| Помилка | Що перевірити |
| --- | --- |
| `auth/unauthorized-domain` | `h00k.top` в Authorized domains чинного Firebase-проєкту |
| `redirect_uri_mismatch` з `h00k.top/__/auth/handler` | Завантажено старий frontend або заданий custom override; оновіть сторінку та залиште `FIREBASE_AUTH_DOMAIN_OVERRIDE` порожнім |
| `auth/operation-not-allowed` | Google provider увімкнений у Firebase |
| Доступ лише окремим email | Audience, test users і publishing status Google OAuth client, якщо власник змінював ці налаштування |
| `auth/popup-blocked` | Дозвольте спливаючі вікна для h00k.top та відкрийте сайт у звичайному Safari/Chrome, поза вбудованим браузером месенджера |
| Помилка API key/referrer | Якщо API key обмежений HTTP referrer-ами, дозвольте `https://h00k.top/*`; збережіть дозволи для стандартного домену Firebase |

Успішний build та API-перевірка provider не підтверджують завершений вхід конкретного користувача. Остаточну перевірку виконує власник своїм Google-акаунтом.

## Необов'язково: власний домен у Google callback

Цей варіант потрібен лише якщо власник має доступ до конфігурації чинного OAuth client і хоче використовувати `h00k.top` також для Firebase helper. Спочатку налаштуйте Google Cloud, потім увімкніть override на VPS.

У **Google Auth Platform → Branding → Authorized domains** додайте `h00k.top`; якщо Google вимагає підтвердження власності, виконайте його через Google Search Console. У **Clients** відкрийте саме Web application client, зазначений у Google provider Firebase. У поточній конфігурації це `405662237409-6udr4ku1tfhdn9lvmcc4pfto9tcsd8b5.apps.googleusercontent.com`.

| Поле OAuth client | Значення |
| --- | --- |
| Authorized JavaScript origins | `https://h00k.top` |
| Authorized redirect URIs | `https://h00k.top/__/auth/handler` |
| Зберегти чинний Firebase redirect URI | `https://knowledgeable-text-whh41.firebaseapp.com/__/auth/handler` |

Після збереження та застосування налаштувань Google задайте в `.env`:

```dotenv
FIREBASE_AUTH_DOMAIN_OVERRIDE=h00k.top
FIREBASE_AUTH_HOST=knowledgeable-text-whh41.firebaseapp.com
```

Compose передає override під час build. Caddy вже проксіює `/__/auth/*` і `/__/firebase/*` до Firebase. Нове значення застосовується з наступним успішним розгортанням `main`; зміна лише runtime environment не змінює готовий frontend. Для поточного Starter Tier рекомендований стандартний callback вище.

Офіційна документація: [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin), [signInWithPopup для стороннього хостингу](https://firebase.google.com/docs/auth/web/redirect-best-practices#option-2-switch-to-signinwithpopup), [Google AI Studio Starter Tier](https://cloud.google.com/blog/topics/developers-practitioners/the-starter-tier-for-google-ai-studio-explained), [reverse proxy для custom authDomain](https://firebase.google.com/docs/auth/web/redirect-best-practices#option-3-proxy-auth-requests-to-firebaseappcom).
