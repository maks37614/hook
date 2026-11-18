# Manual VPS rollout: shared live OI and liquidation history

This change deliberately lives on `feat/scalable-oi-liquidations-diagnostics`.
**Do not merge or auto-deploy before a VPS validation pass.**

## Behavior and limits

- Binance surveillance workers fetch `/fapi/v1/openInterest` at a 60-second cadence. The process-wide cache (60 seconds for both successful and unsuccessful samples, shared in-flight requests) means 500 users monitoring the *same* normalized contract share one upstream request in that window.
- Bybit surveillance keeps its verified 15-second WebSocket OI snapshots. A 60-second REST loop is only a backup if WS OI stops arriving.
- Historical OI remains separate in `regularOI` / `hookchartOI`; live OI does not call the historical 5-minute endpoint.
- One server-side upstream liquidation WS per `exchange:symbol` is shared by browsers. A bounded 30-minute history is saved to `/app/server/data/liquidations.json` inside the named Docker volume. The server retains streams for 30 minutes after the last viewer, subject to market caps; data older than 30 minutes, evicted inactive instruments and downtime cannot be reconstructed from the exchange's public WS.
- All received 5-minute liquidation USD and adaptive large-liquidation USD are displayed separately. The Binance force-order stream does not publish every liquidation occurring within each 1000-ms interval: these figures are observed-only, not complete exchange totals.
- Existing surveillance density engines remain user-configurable. Their upstream market/depth streams are ref-counted per instrument, but deep analysis and per-user state still cost CPU/RAM per worker. Do not assume 500 *different* symbols are supported without a stress test.
- Operator metrics remain disabled (404) without a strong `H00K_OPS_TOKEN`; never paste that token into chat.

## Safe SSH procedure

```bash
cd /home/ubuntu/h00k
git status --short
mkdir -p /home/ubuntu/h00k-backups
git rev-parse HEAD > /home/ubuntu/h00k-backups/pre-oi-revision.txt
sudo docker image tag "$(sudo docker inspect --format '{{.Image}}' h00k-app-1)" h00k-app:pre-oi
git fetch origin feat/scalable-oi-liquidations-diagnostics
git switch --detach FETCH_HEAD
```

This leaves remote `main` untouched and preserves untracked files such as `favicon.png` and `index.html.save`. Stop if `git switch` reports conflicting local changes. Preserve `.env` and back up Docker data before applying schema changes or upgrades.

### Validate before replacing the running app

Run the app's locked dependencies and checks in a temporary Node 22 container:

```bash
cd /home/ubuntu/h00k
sudo docker run --rm \
  -v "$PWD:/app" -v /app/node_modules -w /app \
  node:22-bookworm-slim sh -lc \
  'npm ci && npm run lint && npm test && npm run build'
```

Do **not** deploy if any check fails. The GitHub-hosted Validate workflow may not run when account Actions credits are exhausted.

### Deploy only after all checks pass

```bash
cd /home/ubuntu/h00k
sudo docker compose build app
sudo docker compose up -d --no-deps --no-build app
sudo docker compose ps
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
sudo docker logs --since 10m --tail 100 h00k-app-1
```

Test Binance and Bybit charts, depth densities and liquidations, price alerts and a monitored coin's OI/density state. Give the new OI sample up to a minute to update and allow up to 10 seconds of deterministic startup jitter.

### Operator-only measurement

If `H00K_OPS_TOKEN` is **already** configured, run:

```bash
read -rs -p 'Operator token: ' OPS_TOKEN; echo
curl -fsS -H "Authorization: Bearer ${OPS_TOKEN}" \
  http://127.0.0.1:3000/api/ops/market-data | python3 -m json.tool
unset OPS_TOKEN
```

Compare `liveOiCache.upstreamBinance` and `cacheHits` between two samples 60-70s apart while several accounts watch the same symbol. Also inspect `activeSurveillanceWorkers`, `sharedExchange.totalSubscribers`, `exchangeHttp.rejected` / `rateLimited`, `marketTickerFeed.lastRestFailure`, `liquidationFeed.activeMarkets` / `viewers`, and process CPU/RAM.

### Roll back application without deleting the volume

```bash
cd /home/ubuntu/h00k
git switch --detach "$(cat /home/ubuntu/h00k-backups/pre-oi-revision.txt)"
sudo docker image tag h00k-app:pre-oi h00k-app:latest
sudo docker compose up -d --no-deps --no-build --force-recreate app
sudo docker compose ps
```

Do **not** run `docker compose down -v` because it deletes the persisted data volume.
