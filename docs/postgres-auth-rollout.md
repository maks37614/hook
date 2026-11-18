# h00k.top — clean PostgreSQL-only registration

## Scope

The owner explicitly chose a **fresh start without migrating existing accounts**.
No old login, user profile or archive is imported. Existing account holders must
register anew with email + password and confirm the email address.

The site continues to expose screener, terminal, chart, replay, formations,
exchange WebSocket data, alerts, Telegram and surveillance routes. Personal
features are available to **newly registered, verified PostgreSQL users**.
The old authentication provider, browser SDK, obsolete access-code flow and
cloud database rules have been removed from this branch.

**The PostgreSQL-only source is on `main`, but this does not prove the VPS has been updated.**
Test on staging first, including real SMTP delivery, actual registration and
protected personal features. Do not replace production until acceptance checks pass.

## Environment variables

For Docker Compose, configure a private .env file (never commit this file):

```dotenv
POSTGRES_PASSWORD=GENERATE_WITH_openssl_rand_hex_32
PUBLIC_BASE_URL=https://h00k.top
AUTH_TRUST_PROXY=1
TURNSTILE_SITE_KEY=YOUR_CLOUDFLARE_PUBLIC_SITE_KEY
TURNSTILE_SECRET_KEY=YOUR_CLOUDFLARE_PRIVATE_SECRET_KEY
SMTP_HOST=smtp.mail.ovh.net
SMTP_PORT=465
SMTP_USER=info@h00k.top
SMTP_PASSWORD=YOUR_SMTP_PASSWORD
SMTP_FROM="h00k <info@h00k.top>"
```

The SMTP example above applies to the owner's OVHcloud MX Plan mailbox; use its
**mailbox password**, never the OVH admin-account password. Verify SPF/DKIM and
real inbox delivery on the VPS. Do not commit `.env` to GitHub.

## Cloudflare Turnstile CAPTCHA (required before production deployment)

1. In Cloudflare Dashboard → **Turnstile** → **Add widget**, create a free
   **Managed** widget for the hostname `h00k.top`. You do **not** need to move
   domain DNS from OVH to Cloudflare just to use the standalone Turnstile widget.
2. Copy the **site key** and **secret key** to `/home/ubuntu/h00k/.env`.
   Never paste the secret in chat, GitHub, client code or public screenshots.
3. Use the actual hostname configured in `PUBLIC_BASE_URL`. Create a separate
   widget/keys for staging, with its exact hostname, if using staging.
4. Rebuild/restart only the application after editing `.env`:
   `docker compose up -d --build --no-deps app`.
5. Check `curl -fsS http://127.0.0.1:3000/api/auth/config`:
   `captcha.configured` must be `true`, and the public site key should appear.
   The secret must **never** appear in the response.
6. In a browser, verify login/signup, email recovery and resend with a real
   challenge. Also test invalid/no token against the API (should fail before DB).
   Test on mobile and desktop, including expired tokens and script-blocking.

CAPTCHA is mandatory for login, registration, password-reset **email requests**,
and resending verification mail. Email-link verification, resetting a password
**with an existing secure email token**, existing sessions, guest screener,
HookChart, replay, terminal, and WebSocket market data do not require CAPTCHA.
Missing/misconfigured keys intentionally block those four vulnerable actions;
this preserves privacy and prevents bot bypass, but login will not work until
configuration is finished. Cloudflare production test keys are rejected.
Cloudflare challenges are verified **server-side**, bound to the configured
hostname and the shared `h00k_auth` action, with a 5-second network timeout
and a 12-request concurrent verification limit. Existing IP/email rate limits
remain active and are enforced before database initialization.
Do not promise bot-proof protection; monitor the CAPTCHA failure rate,
traffic and SMTP delivery after deployment.

SMTP TLS is mandatory. Verification links last 24 hours; password reset
links last 30 minutes. Without working SMTP, registration fails closed.

## Durable mail queue for recovery and verification resend

Password-recovery requests and repeated confirmation-email requests are queued in
the existing PostgreSQL database and return the same generic response for
registered and unknown email addresses without waiting for SMTP delivery.
The queue stores only a user ID and message purpose (never a password, raw
verification/recovery token, email address or SMTP secret).
The background worker processes at most one mail job at a time, every ~3 seconds,
with a 60-second crash-recovery claim, five bounded retries and exponential
backoff. A 60-second per-account/purpose cooldown prevents duplicate emails.
Registration's first confirmation message remains synchronous so the user gets
an immediate delivery failure notice if SMTP cannot send.

To inspect mail delivery *without displaying personal emails or tokens*:

```bash
docker compose exec -T postgres psql -U h00k -d h00k_users -c "
  SELECT purpose, COUNT(*) AS queued, MAX(attempts) AS max_attempts
  FROM auth_mail_outbox
  WHERE completed_at IS NULL
  GROUP BY purpose;"
docker compose logs --tail=100 app | grep '\[Auth email\]' || true
```

Do not delete the PostgreSQL volume. The new table and indexes are created
idempotently by the existing auth migration on startup. Failed mail requests
remain queued for retries and are retired after five failures; an account may
request a new link afterward. The site owner should monitor delivery and
consider a dedicated transactional mail provider if MX Plan quotas are reached.

The Compose database is private (no published 5432 port), stores users and
account settings in a persistent volume, and has 0.5 CPU / 512 MiB limits.
The Node auth connection pool is capped at 4 clients. Password hashing
concurrency is capped at 2 jobs so excessive logins cannot monopolize the VPS.

## Existing file-backed personal alerts

Existing `server/data` files and the Docker volume `h00k_app_data`
may contain alerts and 24/7 monitors belonging to **former user IDs**.
New PostgreSQL registrations get new user IDs. Orphan personal alert workers
can still run independently if old server files are reused; they may continue
sending notifications and wasting resources.

Before switching production:
1. Make an encrypted backup of `h00k_app_data`, the current source revision,
   current proxy configuration and all persistent user/surveillance files.
2. In staging, identify which data files represent **personal alerts,
   Telegram pairings, surveillance and history**, versus shared market caches.
3. Archive and reset **only former-user personal state**, preserving shared
   market data and caches. Explicitly verify old monitors stop.
4. Never use `docker compose down -v` or delete the whole `h00k_app_data`
   volume during rollback; this would also remove unrelated application data.
5. Start fresh registrations and verify new per-user alerts, Telegram linking,
   surveillance and archive storage.

The cleanup of old personal server files is an **operator staging action**
and is not performed automatically by this branch.

## Test and deploy on staging

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/auth/config
```

Run GitHub Actions and follow up with real browser smoke tests on desktop
and mobile: register, receive/verify email, login, remember login, revoke
sessions, password reset, edit profile, synchronize watchlist and HookChart
settings, create/rearm/delete alerts, Telegram connect/test, start/stop
24/7 surveillance, save/delete archived formations, screener, terminal,
fullscreen chart, early W/M, replay and both exchange WebSocket streams.

## Backup the new PostgreSQL database

```bash
docker compose exec -T postgres pg_dump -U h00k -Fc h00k_users > h00k-users-$(date +%F).dump
```

Keep an encrypted and tested copy outside the VPS. PostgreSQL dumps do not
include `h00k_app_data`; back it up separately.

## Shared h00k Community account (future)

Community should use a dedicated authorization-code integration against
the shared identity service, with separate roles and scopes. Do not reuse
a parent-domain authentication cookie on wildcard user subdomains.
**Community single-sign-on is not yet implemented by this change.**
