# hookchart integration

The canvas engine, indicators and chart styles originate from the user's `2.rar` attachment. The standalone terminal, Electron entry point and global CSS are excluded. Styles are scoped to `.hookchart-root`, and the chart loads as a separate lazy bundle.

`HookChartCanvas` adapts the site's canonical candles from seconds to milliseconds, exposes drawing/indicator controls and restores archive levels. `TradingViewChart` remains the shared live exchange feed. Embedded terminal/fullscreen charts use that feed when hookchart is selected. `ReplayChart` supplies only its visible candles and position/order markers; it never starts a live feed or fetches more history through hookchart.

`defaultChartProvider` is saved through the existing user-profile persistence. Missing or invalid values select HookChart; explicit HookChart and TradingView choices are preserved. The initial-load cache is isolated by user ID. Chart preferences and drawings are saved in `hookChartPreferences`, with drawings separated by renderer context, exchange, market and symbol. Profile writes are serialized and chart maps merged to preserve edits from several terminal blocks.

Historical OI uses `/api/derivatives/oi/history`, which caches and coalesces exchange requests, converts Bybit coin quantities using historical prices and preserves a successful source if the other fails. Spot/replay charts disable live OI. Candle-only volume delta is labelled as an estimate.

Validation includes pure data/indicator tests, offline OI tests and an offline DOM integration fixture exercising profile auto-save, both switching directions, live WebSocket updates, drawings, concurrent profile writes, replay screenshots and embedded charts. The fixture uses no real browser session or user account.
