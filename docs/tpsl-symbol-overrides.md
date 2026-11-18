# TP/SL Constructor — per-symbol templates and free price-line movement

## Effective scope

A profile owns a single opt-in `tpSlConstructorSettings` object. The master switch
defaults to **OFF** and the disabled path returns original scan references.

For a symbol such as `BTCUSDT` and pattern `double_bottom`, effective rules resolve
in this order:

1. User's `BTCUSDT__double_bottom` override (if present)
2. User's global `double_bottom` rule (if present)
3. Scanner AUTO baseline (otherwise)

Symbol scope intentionally covers Binance and Bybit, and spot/futures, under the
same pair string. Pattern-specific and coin-specific rules are independent;
editing BTC does not rewrite ETH. Owner data never enters scanner/cache documents.

## Firestore compatibility

Keep **version 1** and the already-deployed root shape
`{version, enabled, rules}`; encode coin overrides in the reserved
`rules._coins` map. This counts as one root entry under the original
32-entry root map Firestore rule; it avoids a new production security-rules deployment.
The client validates symbol+pattern keys and bounds the nested overrides to 512
entries to constrain profile size. Firestore's user document size quota still
applies. The current server-side Firestore rules validate the root but do not
independently validate every nested `_coins` entry; the client sanitizes on read,
and Firestore access is owner-only.

The decoder accepts preexisting global presets unchanged. A coin AUTO action
deletes only that pair+pattern override; global AUTO deletes only the global
rule. No automatic migration or extra Firestore subscription is needed.

## Free movement

The graph is a real already-closed candlestick sample, **not** the particular
scanned formation's execution chart. Entry/SL/TP have full-width drag targets
and precise numeric price fields. `entryAtrOffset` / `stopAtrBuffer` /
`targetRiskReward` are finite numbers without the previous arbitrary
`[-2,2]`, `[-2,4]`, `[1,10]` clamps.

A manually dragged TP uses `targetAtrOffset` from the *reference scanner TP*
instead of a forced risk/reward multiple. Entry or SL changes no longer
reposition this manually placed TP. A button restores R:R-derived TP.

**Physical trade validity is not an arbitrary limit:** prices must be finite
and strictly positive; stop must be on the loss side of Entry and TP on the
profitable side. Invalid geometry is visualized in the editor so it can be
corrected; an active invalid template cannot be saved, and an invalid projection
on a live formation falls back to scanner prices with `levelStatus: invalid`
while retaining independent wick-touch gating. Early W/M still requires its
stricter fee-, tick-, and structure-aware `evaluateEarlyTradePlans` validation.

## Verification

`npm run lint`, `npm run build`, `npm test` on GitHub Actions.
Regression tests cover old profile compatibility, override precedence and
AUTO fallback, disabled identity path, early W/M coin-specific touches, privacy
of shared scan objects, independent TP, large ATR numbers, and rejection of
malformed price geometry. Live browser QA inside an authenticated profile
remains a separate check; CI cannot substitute for manual pointer/touch QA.
