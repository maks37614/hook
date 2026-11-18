# h00k.top + h00k Desktop — чистий Linux

Джерело: maks37614/h00k, commit 89e6c3e849b6a77864f83908e80ab234e5d731e9 (18.11.2026).
Це копія вихідного коду h00k.top, Electron Desktop, Docker, SQL-міграцій, тестів та GitHub workflows.

Без PostgreSQL-даних, старих користувачів, налаштувань профілю, Telegram-прив'язок, секретів VPS та .env.

Щоб відновити на чистому Linux:
1. Встановити Git, Docker Engine, Docker Compose plugin, reverse proxy з TLS.
2. Клонувати https://github.com/maks37614/hook.git.
3. Створити .env за .env.example, заповнивши секрети без збереження у GitHub.
4. Створити порожню PostgreSQL 16 і застосувати міграції з server/migrations.
5. Запустити docker compose up -d --build.
6. Налаштувати HTTPS/WebSocket, SMTP, Telegram і перевірити всі модулі.
7. Windows Desktop збирати окремо через .github/workflows/h00k-desktop-windows.yml.

Важливо: Git-код не містить налаштувань, які існували лише на VPS. До перевстановлення VPS перевірити проксі, секрети та зовнішні інтеграції. Community і незалежні боти цим бекапом не переносяться.
