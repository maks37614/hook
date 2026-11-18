# TP/SL Constructor — opt-in architecture and performance notes

Status: **draft**, no deployment. This document describes the branch `feature/tpsl-constructor-opt-in`.

## Invariants

- An absent or disabled `users/{uid}.tpSlConstructorSettings` is equivalent to the existing scanner output.
- `projectUserCoins(coins, disabledSettings)` returns the **identical array**, not a copy. Individual formations are not recalculated and old confidence/validation remains unchanged.
- No user setting is passed to the server scanner or its shared 45-second cache.
- No new per-card fetch, websocket or polling is added.
- The editor is dynamically imported only after clicking its profile entry and makes one historical candle request while open or switching example asset/timeframe. It neither polls nor has a live stream in the draft.
- A separately opened **early W/M fullscreen chart** reuses its EXISTING market WebSocket and emits a closed-candle event once per completed bar. That event updates local personal touch gating and early Entry markers, not the scanner cache. Unopened chart cards do not create subscriptions.
- All settings live in Firestore's owner-protected `users/{uid}`, are normalized before use, and are not saved in shared server process memory.
- Wick proximity evidence is derived from the already-fetched CLOSED candles, bounded by up to 50 compact [index, wick, close] tuples per W/M pattern, and consumed only in the opted-in client.
- Custom R:R does **not** recalibrate scanner confidence or reclassify a potential early W/M as a confirmed signal.
- Changing only the number/tolerance of wick touches leaves Entry/TP/SL prices untouched; custom level calculations have an independent explicit switch.
- In early W/M, an invalid user TP/SL falls back to original market levels **without disabling the personal wick-entry gate**, and the card warns about fallback.

## Synthetic microbenchmark (GitHub Actions Validate, 2026-11-08)

Sample CI run: https://github.com/maks37614/h00k/actions/runs/42477566780

On the hosted runner, with 1,000 cards and 2,000 W-like formations:
- 20,000 calls to the disabled fast path: **2.823 ms total** (includes test assertion overhead).
- 50 full enabled projections: **268.070 ms total**, or **5.361 ms per 2,000 formations**.
- Sample serialized proximity evidence: **69 bytes** for five nearby wick candles per formation (previous object form: 234 bytes).

These are synthetic microbenchmarks, **not** measurements of H00K's deployed production server, browser FPS, or real-time exchange feed. Results differ by hardware and input mix.

## Remaining before merge

- Measure production-representative scanner response-size delta at multiple market universes; the new proximity metadata does add small traffic/CPU even when disabled.
- Browser profiling of card render, editor drag latency, mobile FPS, and memory. Include symbol switching to ensure no stale candle chart is displayed.
- Verify two actual Firebase accounts and multi-device sync manually, including switch-off preserving baseline.
- Validate false-touch protection on repeated contacts, price gaps, stale candles and both market directions. Automated regression cases now cover repeated/lingering contacts, late rejection, bearish HIGH wicks, invalid early geometry, tick alignment and incremental closed-candle touch updates.
- Validate live chart status on Binance/Bybit in browser. The counter in unopened cards still refreshes only with shared scan results; there is no global realtime touch stream.
- Ensure all alerts, archives, replay, and terminal integrations are intentionally scoped.
- Production VPS deploy workflow does not itself publish `firestore.rules`; deploy revised rules separately through the Firebase project before relying on the new nested schema validation. Existing owner-only security is already in the repo rules.
- Expand touch gating beyond early/regular W/M and implement a dedicated live closed-candle updater only if needed without per-card subscriptions.

The PR stays in Draft and must not be deployed until verified.
