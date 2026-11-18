# Terminal contextual notifications

The Terminal analysis toggle now runs the contextual scenario engine in one
opt-in browser worker. Nothing is drawn onto the chart. When no result exists,
the notification component renders nothing. At most three transient cards show
the instrument, exchange/market, zone, scenario, timeframe, observed condition,
context, relevant evidence and invalidation level. Warnings and dismiss buttons
are available in Ukrainian, English, Polish and Russian. Clicking a result
focuses its existing chart.

## Scope and performance

- Both the **configured** charts-per-page limit and the actual open chart count
  must be at most ten. Selecting twelve while opening three still disallows
  analysis. The existing selector now includes ten. Raising the limit stops the
  monitor, saves OFF and produces one short explanatory notification.
- Exchange, spot/futures and symbol identify an engine. Repeated views of the
  same instrument share it; chart timeframes remain separate evidence sources.
  Changing a preset keeps the histories, subscriptions and delivered scenarios
  of markets that remain open. A timeframe change adjusts the minute feed
  when needed. Account changes are explicit
  lifecycle boundaries; private marks and results never enter public caches.
- Bootstrap requests at most 289 five-minute candles per unique market. These
  provide up to 24h of history, filtered at the observation timestamp. One-hour
  and four-hour context is aggregated from **complete** five-minute buckets.
  There are no separate 1H/4H requests and no invented daily trend.
- The shared exchange candle transport is reused. One-minute history uses the
  existing shared 180-bar page for minute/30-second charts, or is enabled on
  demand for a strong move or a verified line approach. Auxiliary minute feeds
  are released after ten minutes without a relevant situation. There is no
  synthetic 15-second feed.
- At most two bootstrap/recovery history requests run concurrently per monitor.
  Failed/gapped feeds retry only on a real exchange event, at most once per
  minute. Public bootstrap pages can be reused for fifteen seconds. Cancelling
  the monitor discards queued work and late responses; it does not abort a
  shared request needed by another chart.
- There is at most one outstanding worker update per market plus one coalesced
  pending update, dispatched at most once a second. The same message can carry
  the exchange's final close and the first price of the next candle. A reply
  from a removed chart cannot act on a reopened copy of that market. Heavy context/geometry is
  cached until a newly completed five-minute candle. No tick writes React chart
  state. Histories, engines and scenario identities are bounded in memory.
- Hidden tabs release monitor subscriptions and suspend work. If a candle
  boundary passed while hidden, the feed repairs its history within the same
  request budget before using the next live candle. Leaving the page,
  disabling analysis or changing account terminates its worker. Worker startup
  failure stops cleanly; heavy work never falls back onto the rendering thread.
- The passive chart adapter reads only already available manual levels, visible
  active densities and correctly scoped OI. Disabled density display means no
  density extraction or new depth subscription. No indicator is enabled by the
  monitor. Candle Delta is used only when actual quote-volume provenance exists.

This limits additional work; it does **not** establish zero VPS/network cost.
Five-minute history and an additional shared timeframe can add cold-start
requests and WS subscriptions. The unit microbenchmark measures algorithm CPU
on synthetic data, not production FPS, slow-phone performance or VPS capacity.

## Scenario coverage

| Family | Implemented conditions |
| --- | --- |
| Z5 | Independent lower-level retest after 1–2h; 0.3–0.5% wick undercut, recovery and compressed return after 1–2h. Exactly two families; both warn that the zone is unreliable. |
| Z4 | Ordered three-extreme cascade; large three-contact line; opposite level conditional on actual manual marks and market activity; descending line from a rejected lower high. |
| Z3 | Local pullback returning within 10–20m; two-contact line below a main level; clear consolidation; level rejection followed by a closed support break; distant fast approach only after a new base exists. |
| Z1 | First higher high after 3/4 minute candles gaining at least 7%, a small correction and recovery; post-breakout consolidation, line or cascade continuation. |
| Temka | Four/five-minute held low after a strong impulse; distinguish a nearby pre-existing high from a pump without that reference. Reclaim confirmation requires an earlier delivered watch notification. |
| Trend origin | Pump, sharp dump and gradual post-pump decline are different context families; line reversals need their corresponding history and observations. |

Wick contacts and candle closes are distinct. A pierced line with a close back
inside is not a closed breakout. A re-break requires verified minute bars,
two/three real minutes of retreat without repeated crossings, and a fresh move
through the pierced wick. Its notification names that condition separately.

The decision gate suppresses choppy, contradictory and repeatedly failed level
approaches. Historical response counts use only already observed outcomes in
the current regime. Counts are observations, never a calibrated win probability.
Old confirmed events in bootstrap/recovery pages do not become fresh alerts.
Invalidation uses two new closed candles **after** the original notification;
old history cannot immediately cancel a new watch. Watch, confirmation and
cancellation update one scenario card. Rolling bases retain their identity.

## Explicit limits and engineering choices

- The separate **Z2 catalogue remains undefined**. Temka 2 may have zone 2 as
  context; this does not create additional invented Z2 trading rules.
- **15s remains unsupported**. The existing 30s chart is not relabelled as 15s.
- A strict 24h window cannot establish a multi-day 1D trend. Its availability is
  explicitly false. Missing complete 4H buckets remain unavailable.
- Z5 elapsed time is measured from the first wick contact / undercut to the
  observed return. This implements the documented proposed timestamp convention.
- ATR-based geometry tolerances, volatility-adjusted 2–4% zone distance,
  three-hour minimum context, two-bar pivot confirmation, consolidation width,
  the main-reference age and regime filters are conservative engineering
  defaults. They require calibration on labelled real positive **and negative**
  examples; the supplied schematic pictures cannot establish precision/recall.
- Subtle user concepts such as an “ideal” line or “strong” consolidation are
  represented by measurable contacts, clean intervening action and closed bars;
  no claim of complete discretionary equivalence is made.
- Ambiguous 0.3–0.5 candle-entry units, aggressive discretionary entries, actual
  limit orders, stops and trade execution are not automated.
- General market sentiment is not fetched or fabricated when there is no
  matching already available source in this Terminal. OI/Delta and densities
  remain optional evidence and never claims about an identified trader/bot.
- Canvas rendering, DPR, candle colours, server monitoring, Telegram, Replay
  and Community are not changed. HookChart adds only passive evidence readers.

## Verification

Run `npm run lint`, `npm run build`, and:

```
node --import ./tests/fixtures/offline-network.mjs --import tsx --test tests/terminal-context-*.test.ts
node --import ./tests/fixtures/offline-network.mjs --import tsx --test --test-concurrency=1 tests/*.test.ts
```

Tests cover every implemented family, negatives, wick/close separation,
causality, 24h/future/gap bounds, invalidation timing, owner/market isolation,
the configured limit, transport sharing, cold-start concurrency, late history,
hidden tabs, worker failures, bounded queues, on-demand feed release and all
four result languages. They include a ten-market synthetic CPU microbenchmark.
Direct headless-browser launch was blocked by the environment's Unix-socket
permissions; the provided browser also could not reach the local Vite server.
Visual and real-device/live-VPS load checks therefore remain outstanding.
