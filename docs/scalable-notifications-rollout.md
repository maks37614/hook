# h00k.top — low-risk performance and PostgreSQL rollout

## Confirm configuration before deploying

The 2026-11-13 VPS logs show `POSTGRES_PASSWORD` missing and an untracked
`.dockerignore` blocking `git pull`. Do not wipe the repository, `.env`,
`server/data` or Docker volumes. Preserve existing credentials, move only the
conflicting untracked file after verifying its contents, and configure the DB
before starting the new Compose stack.

```bash
cd /home/ubuntu/h00k
git status -sb
test -f .env && echo 'Private environment file exists'
# Configure POSTGRES_PASSWORD privately with openssl rand -hex 32.
# Check without printing secrets:
docker compose config --quiet
docker compose up -d postgres
docker compose ps
```

The old running application may continue serving users even if a new deployment
fails. Avoid restarting it until PostgreSQL is healthy and SMTP has been tested.

## Phase A: shared analysis and closed-candle scheduling

- All CoinWorkers share one six-second deep-analysis timer, grouped by market.
  Each still executes *personal* rules and event history; market-independent
  calculations reuse the existing shared market analysis cache.
- 24/7 bar-close worker checks run after the relevant candle close rather than
  recalculating every 25 seconds. A failed or missing snapshot is retried with a
  capped backoff. Realtime rules keep their periodic checks.
- Existing manual 'check now' bypasses the scheduler and does not force Telegram
  delivery.

These optimizations are live only when the updated app image is deployed.
Only a controlled load test can establish their actual CPU/RAM savings.

## Phase B: stage PostgreSQL state (NO AUTOMATIC CUTOVER)

Run this only after PostgreSQL has been configured, the app can authenticate,
and **encrypted backups of both `h00k_pg_data` and `h00k_app_data` exist**.

```bash
# Inside /home/ubuntu/h00k with valid .env and healthy DB:
docker compose exec -T app node --import tsx server/pgStateMigrator.ts --dry-run

# Explicit, non-destructive batch import; leaves JSON authoritative:
docker compose exec -T app node --import tsx server/pgStateMigrator.ts --apply
```

- Only owner IDs existing in the new `auth_users` table are staged. Guest and
  former-account records are skipped, not reactivated.
- All migration tables have per-user keys and market/active indexes.
- Imports use transactions, advisory locks, fixed-size batched UPSERT operations.
- The source JSON files remain untouched and authoritative. This is **not** a
  completed live PostgreSQL cutover: reads/writes and Telegram deduplication
  still need separately tested repository migration before disabling JSON.

## Phase C: measure without flooding production

The synthetic planner benchmark sends no network requests:

```bash
docker compose exec -T app node --import tsx scripts/benchmark-surveillance.mjs --watchers 100 --markets 20
docker compose exec -T app node --import tsx scripts/benchmark-surveillance.mjs --watchers 500 --markets 50
docker compose exec -T app node --import tsx scripts/benchmark-surveillance.mjs --watchers 1000 --markets 100
```

For actual response times, cautiously use the existing localhost-only
`scripts/benchmark-http.mjs` with modest concurrency, and run WebSocket checks
only during a maintenance window. Never begin a 1000-user simulation directly
against production without an agreed resource and request-rate budget.

When `H00K_OPS_TOKEN` is configured, the authenticated
`/api/ops/market-data` endpoint reports event-loop performance, RSS,
heap use, shared-market subscriptions, shared analysis timer count, bar-close
scheduler counters and external HTTP request statistics. Never print this
token in logs or share it in screenshots.

## Phase D: browser impulse channels

The existing frontend sends its impulse feed directly to Binance/Bybit. Those
browser connections are **not** 1000 WebSockets on the h00k VPS. A centralized
24/7 impulse feed would need a dedicated bounded shared subscription service,
secure cross-user routing and delivery queue. Do not move the browser feed to
VPS without first measuring the additional upstream bandwidth and fanout.
