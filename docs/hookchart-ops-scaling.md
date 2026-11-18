# HookChart: shared market delivery, diagnostics and Replay

## Live public Kline relay

Only live Screener, Fullscreen and Terminal HookChart clients use:
`wss://h00k.top/api/hookchart/klines?exchange=binance&market=futures&symbol=BTCUSDT&timeframe=1m`

Within **one running Node process**, all browser clients subscribed to an identical exchange/market/symbol/timeframe receive the same public exchange Kline stream. Server data is intentionally limited to OHLCV plus exchange event time and public buy volume/trade count. No credentials, private notes, open positions, indicators, alerts or user information are relayed.

- Defaults: **128 browser clients**, **48 active Kline scopes** per Node process.
- Configure `H00K_MAX_KLINE_CLIENTS` and `H00K_MAX_KLINE_MARKETS` in the VPS `.env`; do **not** raise limits before load testing.
- If the relay rejects a client, fails, or becomes unresponsive, the browser automatically uses the existing direct Binance/Bybit Kline stream. WebSocket-level backoff still applies.
- Kline relay endpoints are **read only**; large/slow client buffers are disconnected.
- Depth already has a separate shared relay `/api/hookchart/depth`; do **not** connect a second order-book upstream.
- All upstream subscriptions stop when the last browser subscriber leaves. No persistent history is created.
- The design shares streams in a single Node process. Multi-instance deployments need an external message bus, not a per-instance assumption of deduplication.

## Operator-only VPS metrics

Configure `H00K_OPS_TOKEN` in the VPS `.env` (minimum 32 bytes; keep secret). After restarting:

```bash
cd /home/ubuntu/h00k
read -rsp "Operator token: " H00K_TOKEN; echo
curl -fsS -H "Authorization: Bearer ${H00K_TOKEN}" \
  http://127.0.0.1:3000/api/ops/market-data \
  | python3 -m json.tool
unset H00K_TOKEN
```

Look for `hookChartKlineRelay.activeMarkets`, `.clients`, `.upstreamSockets`, `.reconnects`, `.slowConsumers`, `.rejected`, and `.failures`. Existing private operator fields report CPU (one-core normalized), event-loop delay, memory, exchange HTTP budgets, market ticker errors and other feed health.

**No operator token = 404**, not a public performance dashboard.

## Optional browser diagnostics

Open an **actual live HookChart** with `?hookchartPerf=1` in the URL and reload. A small local panel reports browser animation FPS (not trading tick rate), Canvas scene paints and average paint time, Kline arrival lag, relay/direct transport counts, reconnects and WebSocket errors. JS heap uses Chromium's optional `performance.memory`; Firefox/iOS Safari may display `н/д`.

This diagnostic adds a single rAF sampler **only when explicitly enabled**. It does not upload metrics, inspect trades/accounts or write to storage. Remove the query parameter and reload to disable it. Browser diagnostics alone cannot report VPS CPU: use the private endpoint.

## Seven-day Market Recurrence: browser CPU and memory

The Market Recurrence toolbar icon is **off by default**. When switched on,
the user's browser analyzes at most seven days of *closed* OHLCV candles in
a **shared Web Worker**. On a 1m chart, the source for the weekly scan is
5m history (2,016 bars), not 10,080 one-minute candles. This is an
observational frequency tool, **not** a forecast or automated order system.

- The feature adds no new WebSocket upstream, database write, server worker
  or persistent user setting. It uses the public `/api/klines` pathway.
- The browser limits *its own* recurrence-history page requests to two
  concurrent requests per tab. This is **not** a VPS-wide global limit.
- On a normal base-timeframe rollover the previous week's cached bars are
  reused and the latest three candles are requested; a newly opened chart
  may still need several older history pages.
- Historical session-open recognition uses IANA time zones and daylight
  saving time. The algorithm formats only hourly candidates, never every
  five-minute candle.
- Turning the tool off does not cancel another chart's shared history request;
  it prevents that chart from requesting unnecessary subsequent pages.

### Instrument only when needed

Open a **live** HookChart with `?hookchartPerf=1` in the URL and reload.
The optional panel now includes:
- **Recurrence scan count, last/average/max Worker calculation time,
  and analyzed bar count**, measured inside the Worker.
- **History page fetch attempts, cache reuses and cancelled requests.**
  Page attempts can be served by the existing shared HTTP cache, so they
  are **not** a guaranteed count of exchange REST calls.
- The existing browser FPS sampler, Canvas paints/paint time, Kline lag and
  optional Chromium JS heap readings.

Compare **same coin, same device and same chart layout** with the feature
off, then on, at 1, 4, 16, and 36 cards (where available). Record baseline
FPS, Canvas mean/max paint time, Worker mean/max scan time, and heap.
Watch CPU, memory, event-loop delay and exchange-HTTP budgets from the
private `/api/ops/market-data` endpoint separately. The browser FPS sampler
counts browser animation frames, **not** exact HookChart paints or trading
message frequency. Remove `?hookchartPerf=1` after testing.

For a deterministic CPU-only, network-free synthetic benchmark inside a
Node environment with the repository dependencies installed:

```bash
node --import tsx scripts/benchmark-market-recurrence.ts 1
node --import tsx scripts/benchmark-market-recurrence.ts 4
node --import tsx scripts/benchmark-market-recurrence.ts 36
```

This produces processing time and JS heap deltas **for the algorithm only**.
It is not an FPS measurement, an exchange-performance check or proof that
the VPS supports any particular number of users. Never raise existing
server relay limits based solely on this benchmark.

## Controlled capacity test

Run only on your own VPS and **begin small** (beware existing live users):

```bash
docker compose exec -T app node scripts/benchmark-ws.mjs \
  --url 'ws://127.0.0.1:3000/api/hookchart/klines?exchange=binance&market=futures&symbol=BTCUSDT&timeframe=1m' \
  --clients 10 --seconds 20 --ramp 2

docker compose exec -T app node scripts/benchmark-http.mjs \
  --users 20 --seconds 30

docker stats --no-stream
```

Increase the load gradually only if CPU, RSS, event-loop lag, latency and `rejected/slowConsumers` remain acceptable. Sockets created by the benchmark point **only to your own read-only server endpoint**, never place orders. The Kline benchmark checks connection capacity, not full-browser Canvas FPS.

## Historical Replay stays isolated

The historical `ReplayChart` does **not** subscribe to the Kline relay, market trades, depth, liquidations or funding. Its own data controls candle time and causality.

- Forward stepping reuses the unchanged prefix and appends one historical candle.
- Rewind, new date or a modified older candle triggers a **full** history reset.
- The fallback LightweightCharts renderer updates both price and volume incrementally.
- No live liquidation/market-print/DOM visual controls are added to Replay.
