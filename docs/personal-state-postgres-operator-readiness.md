# Перевірка безпечного переходу персональних станів на PostgreSQL

**Поточний статус:** h00k.top усе ще записує `surveillance.json`, `alerts.json`
і `alert_history.json` як основне джерело даних. PostgreSQL містить лише
окремі staged-копії. Навіть успішний `--ready` **не вмикає PostgreSQL як
джерело істини**: для цього потрібне окреме переписування runtime-сховища
та тестування атомарних записів і відкату.

## Вимоги перед роботою

- Перевірити, що немає незбережених локальних змін і вільне місце для двох
  резервних копій.
- Зробити незалежні резервні копії *обох* Docker-томів: `h00k_app_data`
  та `h00k_pg_data`. Не виконувати `docker compose down -v`.
- Поставити застосунок на технічну паузу (всі його інстанси і workers, які
  записують ці три JSON). Перевірити, що немає зовнішніх процесів-записувачів.
- Не видаляти історію, алерти або staging marker, щоб «очистити» конфлікт.
  Розбіжності потрібно розслідувати, а не замовчувати.

Нижченаведені кроки призначені для оператора VPS, у каталогові
`/home/ubuntu/h00k`. Перед ними оновити код і перевірити стан Compose.

```bash
cd /home/ubuntu/h00k
git status --short
docker compose ps
df -h /
# Окремий дамп PostgreSQL поза Docker-томом:
umask 077
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "h00k-pg-backup-$(date -u +%Y%m%dT%H%M%SZ).sql"
# Зробити також незалежну копію h00k_app_data.
docker compose stop app
# JSON більше не повинен змінюватися. Команди запускаються в тимчасовому
# контейнері з підключеним тим самим app_data та PostgreSQL.
docker compose run --rm --no-deps app node --import tsx server/pgStateMigrator.ts --backup
docker compose run --rm --no-deps app node --import tsx server/pgStateMigrator.ts --dry-run
docker compose run --rm --no-deps app node --import tsx server/pgStateMigrator.ts --apply
docker compose run --rm --no-deps app node --import tsx server/pgStateMigrator.ts --verify
```

Остання команда повертає успіх тільки коли всі очікувані PostgreSQL-рядки
повністю збігаються з JSON, включно з payload і кількістю додаткових/відсутніх
рядків. Якщо записувач змінив JSON під час staging, CLI завершується з
помилкою. **JSON залишається авторитетним**.

Для підготовчого підтвердження слід підставити *точний* шлях резервної копії,
який надрукувала команда `--backup`. Ця перевірка вимагає явного підтвердження,
що записувачі зупинені, і звіряє digest backup із чинним JSON та PostgreSQL.
Вона блокує cutover навіть при одному невідомому власнику або некоректному
дубльованому ID.

```bash
docker compose run --rm --no-deps \
  -e H00K_PERSONAL_STATE_WRITERS_STOPPED=1 \
  app node --import tsx server/pgStateMigrator.ts \
  --ready /app/server/data/personal-state-backups/EXACT_BACKUP_NAME.json
```

Вивід містить лише агреговані лічильники й SHA-256, без приватних payload.
Exit code `2` означає, що `--verify` або `--ready` не пройшли.

Після перевірки *відновити поточний JSON-режим*:

```bash
docker compose up -d --no-deps app
docker compose ps
curl -fsS http://127.0.0.1:3000/api/health
```

## Контроль видалення персональних даних

Міграція `006_personal_state_owner_fk.sql` додає перевірені зовнішні
ключі між `auth_users` та трьома персональними PostgreSQL-таблицями.
Після застосування видалення зареєстрованого акаунта з `auth_users`
автоматично видаляє staged-копії нагляду, алертів та історії цього
користувача. Це **не** змінює окремі JSON-файли, які залишаються
авторитетними до повного runtime cutover.

Міграція **навмисно не видаляє сиріт**. Якщо в PostgreSQL уже існують
персональні рядки з невідомим `user_id`, вона завершується помилкою
без успішного застосування FK. Зіставляй такі записи лише з перевіреною
резервною копією; не вимикай перевірку чи каскадний захист.

Після резервного копіювання PostgreSQL та під час зупинених записувачів
можна застосувати міграцію вручну (вона не запускається автоматично):

```bash
cd /home/ubuntu/h00k
docker compose exec -T postgres sh -c \
  'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < server/migrations/006_personal_state_owner_fk.sql
```

Це змінює лише обмеження PostgreSQL і **не** активує
`PgPersonalStateRuntimeRepository`. Перевірка робочих процесів,
відновлення й видалення JSON має здійснюватися окремо.

## Що ще потрібне для справжнього runtime cutover

Потрібно атомарно переписати синхронні `saveSurveillanceStore`,
`saveAlerts`, `saveHistory` та їхні читання/маршрути на транзакційний
PostgreSQL репозиторій, перенести tombstones, відновлення після збоїв,
відстеження epoch та черги Telegram; протестувати атомарність під паралельними
записами, вимкненням БД і відкатом. До цього моменту ніякий прапорець
`PG_ONLY` не можна вважати безпечним.

Не запускати `--apply` під час роботи застосунку і не знищувати JSON після
успішної staging-міграції.
