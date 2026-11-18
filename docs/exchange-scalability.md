## Security audit and dependency refresh (2026-11-08)

A fresh `npm audit --json` on the original lockfile identified **9
vulnerable dependency nodes (8 high, 1 moderate)**. The same count appeared
under `npm audit --omit=dev`, because Vite and the browser-side Firebase SDK
are declared as runtime dependencies in this project.

Patched using a registry-backed lockfile regeneration and compatible
`npm audit fix --package-lock-only`, without `--force` and without any
Firebase downgrade:

| Package | Before | Patched lockfile |
| --- | --- | --- |
| `vite` | 8.3.1 | 8.3.6 |
| `body-parser` | 1.20.8 | 1.20.9 |
| `qs` | 6.16.0 | 6.16.2 |
| `re2js` | 2.8.6 | 2.9.1 |
| `source-map-js` | 1.2.1 | 1.2.2 |
| `@grpc/grpc-js` | 1.9.16 | 1.13.6 |

`firebase` stays **12.19.0** and `@firebase/firestore` stays **4.17.2**.
Firestore's published dependency constraint is `@grpc/grpc-js: ~1.9.0`,
which keeps pulling an older vulnerable gRPC library. Root `overrides`
pins `@grpc/grpc-js` to **1.13.6**, a version with the September 2026
gRPC security fixes (GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4).
The override intentionally crosses Firestore's narrow gRPC minor range
but stays within the same major; this deserves real Firebase Auth/Firestore
functional verification on a staged deployment, not a speculative downgrade
to Firebase 9.

Immediately after regenerating the lockfile, registry `npm audit --json`
returned **0 total vulnerabilities**. The CI `Validate` job now checks
**both** full and `--omit=dev` audits and **fails on any nonzero count**,
so a newly published advisory can block a push-driven production deploy.
`npm ci`, TypeScript, app build, the complete offline test suite, and the
production Docker startup check are required independently.

The temporary write-enabled GitHub Actions lockfile refresh workflow was
**deleted** immediately after the corrected lockfile was committed. Standard
CI uses read-only repository permissions. Do not use `npm audit fix --force`
as it may downgrade Firebase to an incompatible major version.

This is a known-advisory scan at the recorded date, **not a proof that no
undisclosed vulnerabilities exist**; live Firebase behavior, exchange
connectivity, and the shared-IP budgets still need controlled VPS checks.

# H00K exchange limits, WebSocket fan-out, and VPS capacity validation

## Scope and safety

This branch changes server-side **public market data** collection, not alerts' target rules,
surveillance analysis, order book math, chart data formats, authentication, or Telegram payloads.
Do **not** merge into `main` before the CI checks and VPS review: a validated `main`
push currently triggers automatic VPS deployment.

### What the code now does

- `server/exchangeHttp.ts`: one **per-process** Binance Spot, Binance Futures, and Bybit
  budget with short queues, concurrency limits, in-flight HTTP GET deduplication,
  conservative endpoint weights, cooldown after HTTP 418/429/403/451 or Bybit `10006`,
  and non-sensitive counters. Retries via alternate exchange domains cannot bypass cooldown.
- `server/binanceTickerStream.ts` and `server/marketTickerFeed.ts`: one shared WS source per Binance market progressively refreshes 24h quotes. A full REST bootstrap and a one-minute reconciliation preserve discovery of newly listed instruments.
- `server/alertService.ts` + `server/publicPriceFeed.ts`: the alert checker
  reads fresh prices from one Binance all-market mini-ticker socket per market or
  subscribed Bybit public tickers; when a sample is unavailable or old, the
  original REST check still runs. Alert conditions, persistence, and notification
  routing are unchanged.
- `server/surveillance/sharedExchangeStream.ts`: reference-counted exchange
  sockets reused across users monitoring the same exchange/market/symbol.
  Subscriber-specific analysis and listener cleanup stay independent.
- `server/exchangeHistoryCache.ts`: validated historical 5-minute OI
  measurements are reused for up to 60 seconds, independently of the 15-second
  live OI worker timer. That reduces repeated history requests but means
  historical 5-minute values may be up to one minute behind a newly closed
  interval. Inspect accuracy and freshness during VPS staging.
- `server/marketService.ts`: concurrent Open Interest and exchange-symbol
  discovery are coalesced; separate single-exchange OI requests avoid fetching
  irrelevant exchange data from each surveillance worker.
- `server/surveillance/exchangeStream.ts` + `coinWorker.ts`: use a verified,
  live Bybit ticker OI sample at the same 15-second recording cadence. Missing
  live data automatically falls back to the old REST path.
- TradingViewChart retains **2-second disconnected WebSocket fallback**;
  a connected but quiet market now triggers HTTP no more than every 15 seconds.
- HookChart funding *history* is requested every 15 minutes instead of every
  minute. The current funding rate continues to update every 60 seconds.

These budgets are conservative **application controls**, not the exchange's
guaranteed quotas. API quotas can change. No implementation can guarantee
that an exchange will never block an IP.

## Emergency feature rollback during staged VPS rollout

The four switches below default to **enabled**, and do not change public
APIs or user settings. If a WS regression is detected during rollout,
set the affected variable to `0` in the VPS app environment and restart
the application in the maintenance window:

- `H00K_SHARED_STREAMS=0`: return to one public exchange stream per
  Surveillance/Depth worker (uses more exchange connections, so short-term only).
- `H00K_ALERT_PRICE_WS=0`: alerts check the original REST prices (requires
  careful IP budget monitoring while WS alerts are disabled).
- `H00K_BINANCE_TICKER_WS=0`: screener fetches its previous REST
  all-market snapshots; alert WS prices from Binance will fall back to REST.
- `H00K_BYBIT_OI_WS=0`: Surveillance Bybit OI comes from REST instead
  of the existing ticker WS.

The central REST rate limiter remains active in all modes to avoid
aggressive retries during a Binance/Bybit IP cooldown. Test rollbacks
on staging and monitor HTTP 429/418/Bybit 10006 before enabling for all
users. Do not permanently rely on the non-shared mode at scale.

## Private real-time diagnostics

Set a long random token in the VPS application's environment, then restart
the app at a controlled time:

```sh
openssl rand -hex 32
# Put the generated value in the VPS app's .env as H00K_OPS_TOKEN=<generated value>
# Never commit this token.
```

Read diagnostics *locally* on the VPS (if using the provided Docker Compose
configuration, the app HTTP port is bound to localhost):

```sh
curl -fsS -H "Authorization: Bearer ${H00K_OPS_TOKEN}" \
  http://127.0.0.1:3000/api/ops/market-data | jq .
```

The endpoint is **disabled** if `H00K_OPS_TOKEN` is not set or is shorter than
32 bytes. It returns 404 to unauthenticated callers. Do not expose this route
through public telemetry or reverse-proxy logs that store authorization headers.

For a meaningful process CPU number, request the metrics endpoint twice,
10 seconds apart. `processPerformance.cpuPercentOneCore` is CPU usage during
the previous sample interval, normalized to one core (100% = one vCPU).
`eventLoopUtilizationPercent` and `eventLoopDelayP95Ms` help distinguish
slow Node.js computations from time spent awaiting external requests.
`cronJobs` reports each job's last duration and execution count; the
`activeSurveillanceWorkers` counter is the total independent user workers.
None of these fields contains user identities or Telegram data.

The operational token is read from the shell's environment, not automatically
from Docker Compose's `.env` file. For manual local checks, enter it using a
non-echoing shell prompt (do not paste secrets into a public terminal recording):

```sh
read -rs -p "H00K operator token: " OPS_TOKEN; echo
curl --fail --silent --show-error \
  -H "Authorization: Bearer ${OPS_TOKEN}" \
  http://127.0.0.1:3000/api/ops/market-data | jq   '{processPerformance, cronJobs, activeSurveillanceWorkers, exchangeHttp, historicalOiCache}'
sleep 10
curl --fail --silent --show-error \
  -H "Authorization: Bearer ${OPS_TOKEN}" \
  http://127.0.0.1:3000/api/ops/market-data | jq   '{processPerformance, cronJobs, activeSurveillanceWorkers, exchangeHttp, historicalOiCache}'
unset OPS_TOKEN
```

Monitor `historicalOiCache` (cache hits, misses, coalesced readers) and
the `exchangeHttp` counters (`requests`, `rateLimited`, `rejected`,
`cooldownMs`, `observedWeight1m`), WebSocket connected status, shared
stream/subscriber counts, chart depth clients, and process RSS/heap usage.
These are process-local counters since the last restart.

Both public quote optimizations default to enabled. To investigate a
compatibility issue without changing user-visible fields, set
`H00K_QUOTE_GZIP=0` to restore plain JSON, or `H00K_QUOTE_CACHE=0`
to stop reusing public snapshots across requests; restart the app afterward.
The original response format is preserved in either mode.

### Live proxy baseline: gzip already enabled on public HTTPS

On 2026-11-08, the existing, **pre-deployment** h00k site returned:
- Direct localhost `http://127.0.0.1:3000/api/market/quotes?exchange=all&marketType=all&minVolume=0`: HTTP 200, **1,805,720 bytes**, **2.355 s**, `Content-Type: application/json`, no `Content-Encoding`.
- External `https://h00k.top` with the same path and `Accept-Encoding: gzip`: HTTP 200, **269,510 bytes**, **0.167 s**, `Content-Encoding: gzip` and `Vary: Accept-Encoding`.

Public HTTPS **already gzip-compresses** responses through the existing reverse-proxy/CDN layer, before this PR. Roughly **85% smaller (6.7×)** on the sampled responses, although the samples were sequential and could contain different underlying market data. **Do not claim that enabling gzip inside Node will save another 85% of public bandwidth**; it could instead shift compression CPU from reverse proxy to Node, which must be profiled on the 2-vCPU VPS. The greater expected benefit of this PR's public-quote optimization is shared serialization/data enrichment across simultaneous visitors. Test Node CPU both with and without `H00K_QUOTE_GZIP=1`, and keep the option that gives lower overall CPU while preserving HTTPS gzip on public responses. The new `H00K_QUOTE_CACHE` flag can be tested independently.

The app's Docker `tx_bytes` can include uncompressed traffic **to the reverse proxy**, plus WebSocket and other API traffic; it is not a measurement of the public client's HTTPS bytes. Likewise, the very different local/public response times for two sequential requests do not prove any difference in proxy speed: a cold first request may warm the shared exchange cache. Confirm with repeated low-rate requests, recorded `time_starttransfer`, and per-process CPU data.

### Additional concurrency and market correctness guards

The quote-response cache also **caps simultaneous different parameter variants**
at 8, even when many users submit arbitrary min/max volume filters. Readers
with identical parameters still share the same in-flight response. A ninth
distinct in-flight variant receives `HTTP 503` with `Retry-After: 2`;
this prevents unbounded simultaneous full-universe enrichment and compression
under abusive load. The protected operator metrics expose an `overloaded`
counter. This affects only short overload windows; normal unique filters
continue to work as soon as one build completes.

For Binance USD-M Futures market ticks, a background REST reconciliation
can complete after fresh WebSocket updates. The ticker service now overlays
only the **known instrument updates arriving during the REST request**
onto the REST snapshot. This preserves the newest received WS quote while
still discovering new/delisted instruments from the full REST response;
the temporary overlay is removed once reconciliation finishes. Offline tests
cover the delayed-REST race.

CI now launches the real production Docker image with `--network none`
and without VPS credentials, and verifies `/api/health` 200, the disabled
private ops endpoint 404, validation 400, and SPA index 200. This checks
startup and runtime packaging but **does not** constitute live exchange,
Telegram, VPS resource, or multi-user performance testing.

## Public screener response size: preserve the JSON, reduce transmitted bytes

User-supplied production baseline before this PR: one
`/api/market/quotes?exchange=all&marketType=all&minVolume=0` request returned
**HTTP 200, 1,683,924 bytes (~1.61 MiB), 2.796 seconds**. Across a different
15-second interval, the h00k Docker container transmitted **4.13 MiB/s**
and received 0.18 MiB/s. These are server-wide bytes; they cannot be
attributed to a particular endpoint or user without traffic inspection.

`server/marketQuoteResponse.ts` keeps the **same public JSON fields, source
statuses, timestamp and 200/503 behavior**, while reusing the serialized
response for a maximum of 2 seconds for identical exchange/market/volume
filters. At most 8 query variants are cached. An HTTP client advertising
`gzip` gets one asynchronously compressed snapshot generated once per
cache entry, not once per user. Non-gzip clients receive exactly the
same uncompressed JSON. It also precomputes ETags once per entry to avoid
hashing a megabyte of JSON for every browser request.

After staging deployment compare sizes using **two** local requests to
the same endpoint, not a burst load test:

```sh
QUOTE_URL='http://127.0.0.1:3000/api/market/quotes?exchange=all&marketType=all&minVolume=0'
curl --max-time 20 -sS -o /dev/null \
  -w 'plain: HTTP %{http_code}, bytes %{size_download}, seconds %{time_total}\\n' \
  "$QUOTE_URL"
curl --max-time 20 -sS -o /dev/null -H 'Accept-Encoding: gzip' \
  -w 'gzip: HTTP %{http_code}, wire bytes %{size_download}, seconds %{time_total}\\n' \
  "$QUOTE_URL"
```

In a separate follow-up, confirm `Content-Encoding: gzip` and the JSON
shape for a browser request via `curl --compressed`. If the reverse proxy
already compresses external responses, verify both the local app endpoint
and the public HTTPS endpoint. HTTP/TLS/network overhead, other endpoints
and live WebSocket frames still contribute to total traffic.

`publicQuoteDelivery` metrics report the number of served quote payloads,
gzip negotiation, cached variants, shared in-flight readers and **estimated
payload bytes avoided**. These counters describe application payload sizes,
**not** actual network interface bytes (which should still be measured
with Docker or reverse-proxy counters).

Do not estimate server capacity by dividing the current 4.13 MiB/s outbound
rate by response size: several background services and active clients can
contribute. At 30-second polling intervals, raw responses alone would
require roughly 5.35 MiB/s for 100 users or 10.7 MiB/s for 200 users
before gzip and without other network traffic. Actual capacity must be
measured on the VPS and remain below CPU/RAM/connection/API limits.

## Controlled load test on the VPS

Start with the **local** WS endpoint, one symbol, modest ramp, and a quiet
period between runs. This exercises concurrent browser connections without
creating more upstream symbol streams for each synthetic client.

```sh
docker compose exec -T app node scripts/benchmark-ws.mjs --clients 20 --seconds 30 --ramp 5
docker compose exec -T app node scripts/benchmark-ws.mjs --clients 50 --seconds 30 --ramp 5
docker compose exec -T app node scripts/benchmark-ws.mjs --clients 100 --seconds 40 --ramp 5
docker compose exec -T app node scripts/benchmark-ws.mjs --clients 200 --seconds 45 --ramp 5
```

Default target: `ws://127.0.0.1:3000/api/hookchart/depth?exchange=binance&market=futures&symbol=BTCUSDT`.
To target a remote endpoint, pass both `--url wss://...` and
`--allow-remote`; remote runs must be explicitly authorized by the site
operator. Never run many concurrent load tools against the exchange endpoints.

These `docker compose exec` commands run inside the current application
container, where `ws` is already installed. They are good for basic checks,
but the load generator then competes for the **same CPU and RAM** as the app.

For a more representative capacity test, launch a separate one-off probe
container on the same Docker network (without launching a second app server):

```sh
docker compose run --rm --no-deps -T app node scripts/benchmark-http.mjs \
  --url 'http://app:3000/api/market/quotes?exchange=all&marketType=all&minVolume=0' \
  --allow-remote --users 50 --seconds 60

docker compose run --rm --no-deps -T app node scripts/benchmark-ws.mjs \
  --url 'ws://app:3000/api/hookchart/depth?exchange=binance&market=futures&symbol=BTCUSDT' \
  --allow-remote --clients 20 --seconds 30 --ramp 5
```

Inspect the running `app` container separately via `docker stats`.
Even the separate-container test still uses CPU on the same VPS. For
definitive external-user capacity, run the probe from another machine
after verifying proxy limits, network bandwidth and authorization.

The current HookChart depth WS has an intentional **256-client / 64-market
per-process** cap. A 257th connection is expected to receive code 1013; that
is not evidence of a CPU or RAM limit. Raise these caps only after measuring
memory, CPU, bandwidth and data freshness at smaller levels.

The HTTP screener requires a separate test because an open WebSocket does not cover
page rendering, backend CPU, and ordinary browser refresh traffic:

```sh
docker compose exec -T app node scripts/benchmark-http.mjs --users 50 --seconds 60
docker compose exec -T app node scripts/benchmark-http.mjs --users 200 --seconds 60
docker compose exec -T app node scripts/benchmark-http.mjs --users 500 --seconds 90
```

Use one step at a time and monitor VPS telemetry between steps. The last
two samples should only be run if the preceding stage is healthy.
`H00K_MAX_DEPTH_CLIENTS` and `H00K_MAX_DEPTH_MARKETS` may increase the
original depth caps after capacity measurements (defaults 256 and 64).

Record before and after **each** test:

1. VPS CPU, RSS memory, system memory and file descriptors
   (`docker stats`, `top`/ `htop`, `ss -tan`, `lsof -p <pid>`).
2. REST request counters, estimated/observed Binance weights, queue rejects,
   and 429/418/403/Bybit 10006 responses.
3. WebSocket connection successes, 1013 closes, live packet availability,
   first-packet latency and reconnects.
4. User-visible behavior: screener list, 1m chart, order book sequence,
   funding, Bybit OI, multiple-user surveillance, Telegram alert triggers,
   Replay and full scan.
5. Run with 20/50/100 **distinct instruments** separately. Shared-symbol
   load and unique-symbol load have very different upstream costs.

### Required follow-up before any public scale claims

- The limiter is **per Node.js process**. If multiple processes, replicas,
  third-party tools, or another site share the same public egress IP, use a
  shared coordination layer (e.g. Redis) before horizontal scale.
- The existing client-side direct-exchange fallback runs from each **browser
  IP**, not the VPS IP. It should stay a last resort for availability; it cannot
  be monitored by the VPS rate manager.
- The Bybit subscription hub currently caps tickers at 600 topics per
  market/socket. Beyond this, the existing REST fallback is used.
- Distinct order book markets still require their own upstream streams.
  More than a few hundred unique live markets will require stream-sharding,
  network bandwidth/CPU profiling, and load shedding.
- Replay and comprehensive scans still use REST history; the central
  request budget may reject excess concurrent work rather than overload
  the exchange. Display incomplete/stale data as unavailable, never fresh.
- The app includes background and direct-browser network traffic beyond
  these counters. Capture actual VPS egress and exchange headers during
  the staged test to calibrate budgets.

## Validation

GitHub's `Validate` workflow runs `npm ci`, `npm run lint`,
`npm run build`, and `npm test` on the PR. The tests mock external
network requests and validate shared-stream ref counts, HTTP cooldowns,
WS price ingestion, stale fallbacks, and token-protected metrics.
Passing CI is necessary, **not sufficient**, for safe production rollout.
A rollback procedure and the old deployed commit SHA should be kept ready
before merging to `main`.

Official exchange references:

- https://developers.binance.com/en/docs/products/spot/rest-api
- https://github.com/binance/binance-spot-api-docs/blob/master/web-socket-streams.md
- https://bybit-exchange.github.io/docs/v5/ws/connect
- https://bybit-exchange.github.io/docs/v5/websocket/public/ticker
