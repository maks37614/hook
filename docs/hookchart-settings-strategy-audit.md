# HookChart settings, strategies and performance audit

Checked: 2026-11-10. Source audit covers HookChart settings, controller, renderer, strategy engine, live feeds, terminal/fullscreen integrations and profile persistence.

## Implemented in this change

- The profile has a top-level **Графік** tab reusing the canonical HookChart settings form (Основні, Стратегії, Гарячі клавіші). Changes save to the same per-user `hookChartPreferences` field and propagate to signed-in HookCharts via AuthContext; pending changes are isolated to the account.
- The profile editor mounts no chart canvas, live-feed sockets or candle polling. Live chart-only counts are not faked in the profile.
- A single `strategyPreferencePatch` applies all strategy presets in both locations.
- Chart drawing scope rehydration uses incoming user preferences rather than stale local settings.
- Bounded 45-second cache coalesces identical remote analysis candle requests across chart instances, removes failed requests, and guards overlapping polling.
- OI comparison requires a real time-window baseline. Historical impulse events no longer use the most recent OI result.
- Regression tests cover the shared editor, preset parity, account merge, OI baseline and request deduplication.

## Connected settings verified by source review

Chart controller consumes preferences for history limits, padding, toolbars, drawing scopes, hotkeys, crosshair width, market stats, indicators, grid, candle colors, support/resistance, auto levels, densities, OI/funding, strategy selection and multiple overlays. Account updates are persisted by `updateProfileData` and normalized by `normalizeOriginalHookChartPreferences`.

## Settings requiring further product integration

The canonical form reads 92 `prefs.*` keys. The main chart controller, renderer, live feed, strategy engine, terminal and fullscreen components do not have an operational consumer for these fields beyond storing/displaying their controls:

- `sortEnabled`, `sortDisabled` — sorting configuration
- `analyzedIntervals` — generic analysis intervals
- `roundDistance` — round-number distance column
- `showNearestLevels` — nearest-level list
- `densityTop`, `densityBaseVolume` — density table presentation
- `oiBaseChange` — base-coin OI comparison
- `rBtcTf`, `rBtcCandles` — correlation currently uses chart timeframe and fixed reference history depth
- `duplicateCrosshair` — cross-chart synchronization
- `notificationOpenNew`, `notificationDialog`, `singleWindowSize`, `pagingButtons` — window and paging options awaiting integration

As of 2026-11-15, the 12 unfinished controls listed above (excluding sorting and generic analysis interval controls, which were already absent) are hidden from both the chart settings and the shared profile editor. The empty rBTC correlation section is hidden as well. Existing stored values remain untouched for compatibility. Operational settings, including liquidation controls, remain editable.

## Verification and deployment

- Verification includes TypeScript, the complete offline test suite and a production build. DOM regressions cover Replay portal remounts, latest-candle crosshair data, viewport preservation and hidden unfinished settings.
- Native fullscreen layout on real devices and authenticated browser flows still require deployment validation.
- Before publishing: `npm ci && npm run lint && npm test && npm run build`; keep `.env` and named Docker volumes untouched.
- Benchmark 2–8 simultaneous terminal charts, test profile-to-chart synchronization and inspect network request counts.
