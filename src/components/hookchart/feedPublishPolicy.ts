/**
 * Preserve all active event/hold-time updates while avoiding React writes for
 * unchanged empty live data (especially many idle Terminal graphs).
 */
export function shouldPublishDepthView(ready: boolean, wasReady: boolean): boolean {
  return ready || wasReady;
}

/** Keep periodic cascade expiry while rows exist; emit the final empty state once. */
export function shouldPublishLiquidationView(rowsRemaining: number, previouslyHadRows: boolean): boolean {
  return rowsRemaining > 0 || previouslyHadRows;
}

/**
 * CascadeRisk uses inclusive 1m and 5m event windows. Re-evaluate only on
 * a new event or when an existing event enters/leaves either window, rather
 * than forcing a full chart render every two seconds with unchanged data.
 * The +1 ms preserves the existing <= window-boundary semantics.
 */
export function nextLiquidationCascadeTransition(
  rows: readonly { t: number; usd: number }[], now: number,
): number {
  let earliest = Infinity;
  for (const row of rows) {
    if (!Number.isFinite(row.t) || !Number.isFinite(row.usd) || row.usd <= 0) continue;
    const entry = row.t;
    const oneMinuteExit = entry + 60_001;
    const fiveMinuteExit = entry + 300_001;
    if (entry > now && entry < earliest) earliest = entry;
    if (oneMinuteExit > now && oneMinuteExit < earliest) earliest = oneMinuteExit;
    if (fiveMinuteExit > now && fiveMinuteExit < earliest) earliest = fiveMinuteExit;
  }
  return earliest;
}

/**
 * The adaptive Liq display cutoff looks at events at most 15 minutes old,
 * including the exact boundary. Cache its quantile until the oldest eligible
 * event becomes too old; changes in the event buffer invalidate separately.
 */
export function nextLiquidationAdaptiveCutExpiry(
  rows: readonly { t: number; usd: number }[], now: number,
): number {
  let earliest = Infinity;
  for (const row of rows) {
    if (!Number.isFinite(row.t) || !Number.isFinite(row.usd) || row.usd <= 0) continue;
    const expiresAt = row.t + 15 * 60_000;
    if (expiresAt >= now && expiresAt < earliest) earliest = expiresAt;
  }
  return earliest;
}

/** Fresh empty arrays and unchanged depth counters must not trigger a React
 * redraw in each idle chart's once-per-second hold-time refresh. */
export function equalDepthAutoStats(
  a: { baseline: number; bidCut: number; askCut: number; buy5m: number; sell5m: number },
  b: { baseline: number; bidCut: number; askCut: number; buy5m: number; sell5m: number },
): boolean {
  return a.baseline === b.baseline && a.bidCut === b.bidCut &&
    a.askCut === b.askCut && a.buy5m === b.buy5m && a.sell5m === b.sell5m;
}
