# Liq scaling and historical heatmap rollout (staged)

## What was changed

1. **Exchange upstream:** `LIQ_MULTIPLEX_ENABLED=1` (default) uses one Binance/Bybit public
   WebSocket for up to 64 subscribed symbols per exchange shard, instead of one
   exchange WebSocket per symbol. When 256 markets are viewed (128 Binance,
   128 Bybit), four upstream sockets suffice in the **unit-test model**.
2. **Demand-based markets:** `LIQ_MARKET_CAP=256` (configurable 64–768);
   an idle historical cache is evicted before rejecting a new viewed market.
   Two minutes after the last viewer, its exchange stream is released; the
   existing 30-minute chart event cache stays available, subject to expiry.
3. **Browser fanout:** the existing chart protocol `/api/hookchart/liquidations`
   stays unchanged. An alternative `/api/hookchart/liquidations-multi` can
   carry up to 64 `exchange:symbol` scopes on one site WebSocket.
   Browser use is opt-in via `VITE_LIQ_CLIENT_MULTIPLEX=1` at **build time**.
4. **Live chart semantics:** existing Long/Short, Liq 5m cascade, adaptive
   thresholds, session totals, and depth/density processing are untouched.
   Recent snapshots still retain at most 30 minutes or 1,500 events per market.
   No synthetic liquidation events are generated.
5. **Optional PostgreSQL raw event archive:** `LIQ_ARCHIVE_ENABLED=1` starts a
   bounded, asynchronous writer using the unique
   `(exchange,symbol,event_id)` key. Duplicate packets cannot inflate totals;
   cumulative Binance order updates can increase, not decrease, the notional.
   Database migrations are created on first write. The observed-only API
   `GET /api/hookchart/liquidation-heatmap?exchange=binance&symbol=BTCUSDT&period=24h`
   (or `period=7d`) is available only with the archive enabled.
   The chart-facing map overlay itself is a separate future UI step.

## Important limitations

- No system can reconstruct liquidations from before collection, server
  downtime, or instruments with no active viewers. Public Binance forceOrder
  reports only a subset during 1000 ms intervals; the Bybit price is a
  bankruptcy price. The archive is **observed events**, never complete
  exchange-wide liquidation volume or a predicted liquidation map.
- The default limit is now 256 simultaneous `exchange:symbol` markets,
  **not all listings simultaneously**. Do not blindly raise to 768 on
  a 2-vCPU/4-GB VPS without measuring upstream stability, memory, and FD caps.
- The 2,000 simultaneous **browser-side Liq connections** limit remains until
  performance tests. Optional multi-market browser routing can reduce the
  number of browser WebSockets for Terminal charts.
- Do not enable archiving until the PostgreSQL instance has disk headroom,
  backups, measured write latency and a configured monitoring alert.
  A bounded queue can drop events when PostgreSQL is unavailable; the
  protected operator metrics report `droppedOnOverflow` and failures.
- Inactive markets are not collected continuously. A complete 7-day heatmap
  for every listed contract requires separate collection capacity planning.
- This feature adds **no chart drawing, polling, or browser WS overhead when
  the heatmap UI is off**. The existing Liq feed continues to operate as
  before whenever a futures chart is open.

## Safe deployment on the Ubuntu/Docker VPS

```bash
cd /home/ubuntu/h00k
git status --short
git fetch origin
git pull --ff-only origin main
# Check that /home/ubuntu/h00k/.env has the existing secrets intact.
# Optional flags; they use safe defaults if absent:
# LIQ_MULTIPLEX_ENABLED=1
# LIQ_MARKET_CAP=256
# LIQ_CLIENT_CAP=2000
# VITE_LIQ_CLIENT_MULTIPLEX=0
# LIQ_ARCHIVE_ENABLED=0
docker compose config --quiet
docker compose up -d --build --no-deps app
docker compose ps
docker compose logs --tail 120 app
```

## Validation

1. Open Binance Futures BTCUSDT, Bybit Futures BTCUSDT and another
   coin; verify Liq Long/Short and their individual totals still work.
2. Open the same symbol in multiple Terminal charts and verify each receives
   the shared data without duplicated Liq values.
3. Use the existing protected operator endpoint
   `GET /api/ops/market-data` with the locally configured
   `H00K_OPS_TOKEN` to inspect `liquidationFeed.upstreamPool.shards`,
   `upstreamSockets`, `subscribedTopics`, `rejectedClients`,
   `liquidationArchive.queued`, `failures` and
   `droppedOnOverflow`. Never share this token in chat.
4. Rollback **upstream pooling only**: set `LIQ_MULTIPLEX_ENABLED=0` in
   `.env` and rebuild/restart app. This restores the legacy 64-market
   safety cap without reverting any HookChart visual code.
5. Browser multiplex after full VPS validation: set
   `VITE_LIQ_CLIENT_MULTIPLEX=1` in `.env` and rebuild app;
   set to `0` and rebuild to revert.
6. Before enabling Postgres archive, back up `h00k_users`:
   ```bash
   mkdir -p /home/ubuntu/h00k-backups
   docker compose exec -T postgres pg_dump -U h00k -d h00k_users -Fc \
     > /home/ubuntu/h00k-backups/pre-liq-archive.dump
   ```
   Then set `LIQ_ARCHIVE_ENABLED=1` and restart; monitor file usage,
   write failures and the bounded pending queue over an initial pilot.
   Restore to `0` if postgres, CPU, disk or query latency regress.
   Archive tables are **not automatically deleted** by disabling the flag.

## Test strategy

- `tests/liquidation-upstream-pool.test.ts` ensures 256 market scopes need
  four upstream sockets in the test harness, ACK isolation and cleanup.
- `tests/liquidation-feed.test.ts`, `tests/liquidation-multi-client-relay.test.ts`,
  `tests/liquidation-browser-multiplex.test.ts` verify old/new protocols.
- `tests/liquidation-archive.test.ts` validates idempotent upserts,
  bounded queue, migration constraints and observed-only data.
- Existing HookChart Liq rendering and subscription tests run in
  `.github/workflows/liquidation-scaling.yml`.
- Offline CI tests are not a substitute for actual exchange WebSocket and
  VPS load testing.

## HookChart Liq heatmap UI (optional, default OFF)

- Expand the **top** chart tools via the chevron, then select **«Карта Liq»**.
  Choose 24h (5-minute aggregation) or 7d (15-minute aggregation).
- Supports normal Binance/Bybit **futures** charts. Replay, spots, saved
  snapshot charts and Community previews deliberately remain untouched.
- The map is **observed historic liquidations only**, never simulated future
  stop-outs or the exchange's complete liquidation universe.
- Each cell is located by the chart's very same time transform
  `g.x(eventBucketMs)` and price transform `g.y(priceBucket)` as candles,
  S/R, density overlays and volume. The heatmap is painted **behind**
  the candle bodies and wicks, not as a stretched background screenshot.
- When the switch is off, its separate frontend module is not imported,
  no heatmap API fetch is sent, no heatmap interval runs and the canvas skips
  the painter entirely. Existing Liq WebSockets and candle chart drawing
  keep their existing operation independently of the map.
- Multiple enabled Terminal cards of the same exchange/symbol/period reuse
  one in-flight fetch in a browser tab; the server has a 30-second shared
  cache and a per-IP request cap. Hidden browser tabs skip refreshes.
- To receive **non-empty history**, enable `LIQ_ARCHIVE_ENABLED=1`
  *after a Postgres backup and a limited VPS pilot*. Without it, the
  optional heatmap route returns HTTP 404 and the UI indicates the archive
  is not enabled. Turning the map off does not stop its backend archive:
  recorded history necessarily requires modest server-side writes while
  the switch is off. This background cost is controlled by the feature flag,
  batch queue and protected metrics.
- New history begins **only after** the PostgreSQL archive is enabled and
  an exchange instrument is subscribed. A 24h/7d empty interval does not
  mean no liquidations occurred, only that no events were recorded there.
  Even if the UI paints a bin, its value is an approximation of received
  forced-order notional (Bybit uses bankruptcy price). We do not invent
  data for unobserved markets or missed intervals.

### Launch checklist for the optional map

1. Keep `LIQ_MULTIPLEX_ENABLED=1`, `VITE_LIQ_CLIENT_MULTIPLEX=0`,
   `LIQ_ARCHIVE_ENABLED=0` during the initial live Liq transport pilot.
2. Check PostgreSQL free disk space and make a backup before enabling
   the archive (as shown above). Then change only
   `LIQ_ARCHIVE_ENABLED=1` in the VPS `.env` and
   `docker compose up -d --build --no-deps app`.
3. Inspect `liquidationArchive` in authenticated
   `/api/ops/market-data` for pending queue, write failures,
   dropped-on-overflow count, and write latency. Use the private
   `H00K_OPS_TOKEN` locally, never place it in a browser or chat.
4. Open BTCUSDT Binance Futures and verify the regular Liq markers,
   Long/Short filters, 5m cascade and DOM densities still work.
   Expand the tools, select **«Карта Liq»**, wait for real observed
   events to accumulate and check heatmap alignment through zoom/pan.
5. Disable the map in the UI and check that the browser no longer
   sends `/api/hookchart/liquidation-heatmap` requests. The regular
   `/api/hookchart/liquidations` may continue because it serves other
   existing chart features.
6. If archiving increases disk/CPU/latency, reset
   `LIQ_ARCHIVE_ENABLED=0` and restart. It stops NEW archive writes;
   it does not automatically delete archived rows or undo migrations.


## Automatic monthly cleanup of Liq heatmap data

- **Only** PostgreSQL table `h00k_liquidation_events` is fully erased
  **once per UTC calendar month**. This is a deliberate archive reset:
  the 24h/7d heatmap begins with an empty history after each reset and builds
  again from newly observed events; older data cannot be recovered.
- The archive maintenance marker lives in
  `h00k_liquidation_archive_maintenance` (migration 004).
  A transactional row lock + month marker ensure that multiple servers or
  container restarts cannot reset the table twice in the same month.
  TRUNCATE is applied ONLY to `h00k_liquidation_events`; Community profiles,
  surveillance, user accounts, chart settings, notifications, and the
  existing 30-minute chart Liq buffer are not touched.
- First enablement during a calendar month records the current month without
  immediately deleting data. The first **next-month** rollover triggers a
  purge. If the VPS was offline, the next startup/check catches up.
- With `LIQ_ARCHIVE_ENABLED=1`, the service checks on startup and every 6h,
  and checks again before reading or writing archive data. With archive OFF,
  there is **no timer, database connection or cleanup work**.
- The existing rolling 8-day retention remains as an extra disk-safety guard
  between monthly wipes. Neither mechanism collects events for inactive markets.
- At month rollover, both server and browser response caches use a
  new UTC-month key; old history is not reused. Serialized-map cache budgets
  are **8 MiB on the server** and **3 MiB per browser tab**, with eviction.
  In-memory JS object overhead can be larger than those figures.
- The schedule is **automatic inside the app**, no Ubuntu cron/systemd timer
  and no extra VPS installation task. It starts once the updated Docker app is
  deployed with the optional archive enabled.
- Reclaiming table storage via TRUNCATE is not equivalent to shrinking the
  entire PostgreSQL database or removing old backups/snapshots. Check the
  Docker volume and backups independently; do not auto-delete backups.
- To monitor, query the authenticated ops endpoint and inspect
  `liquidationArchive.monthChecked`, `monthlyResets`,
  `lastMonthlyResetAt`, `failures`, and `droppedOnOverflow`.


## Optional historical recurrence model (separate from observed Liq)

- In **HookChart → Налаштування графіка → Ліквідації**, the default-off
  `Прогнозні зони Liq · модель за історією` setting enables a distinct
  CoinGlass-like horizontal gradient band overlay **only while the chart's
  Карта Liq button is also ON**. Previously observed heatmap rectangles,
  Liq markers, cascades, OI and DOM/density overlays do not change.
- The model groups **previously observed** liquidation events into their
  original 0.5% logarithmic price buckets. A hypothetical recurrence band
  needs at least **5 reported events in 3 different archived time buckets**
  at that price; a single huge liquidation is not sufficient. A recency
  weight favors more recent events and the model limits candidate prices
  to within 20% of the last chart candle close. Up to 16 bands are drawn.
- The bright violet-to-yellow bands are **relative historical recurrence
  intensity**, *not* probabilities, future trade amounts, exact stops,
  leverage distribution, or claims that positions remain open. No phantom
  prices outside previously observed liquidation price buckets are added.
  Truncated history suppresses the model instead of displaying misleading
  rank scores. Insufficient history draws **zero** bands.
- No new endpoint, exchange API, WS subscription, database table, or timer.
  When the setting is OFF, or when the map button is OFF, computation
  returns the shared empty array and there is no additional painter call.
  Computation reuses the already fetched & cached observed 24h/7d bins and
  is memoized by archive snapshot and the 0.5% chart-price bucket, not
  recalculated on every tick.
- The model is **experimental**. Backtesting can later measure whether
  recurrence hotspots correlate with future observed events. Until
  measured, do not describe relative intensity scores as 70% or 90%
  probability of future liquidation. CoinGlass professional heatmaps are
  proprietary position/leverage estimates; this independent recurrence
  model is not an equivalent reconstruction.
