import type { OIHistoryPoint } from './hookchartOI';

export interface VerifiedUsdOISummary {
  currentUsd: number | null;
  change1hPct: number | null;
  history: number[];
}

/** A graph is trustworthy only if successive 1h exchange snapshots are contiguous. */
export function summarizeVerifiedUsdOI(
  rows: OIHistoryPoint[], nowMs: number, intervalMs = 3_600_000,
): VerifiedUsdOISummary {
  const unavailable = { currentUsd: null, change1hPct: null, history: [] };
  if (!Number.isFinite(nowMs) || !Number.isFinite(intervalMs) || intervalMs <= 0 || !rows.length) return unavailable;
  if (rows.some(row => !Number.isFinite(row.t) || row.t <= 0 || !Number.isFinite(row.v) || row.v <= 0)) return unavailable;
  const sorted = [...rows].sort((a,b) => a.t - b.t);
  const last = sorted[sorted.length - 1];
  if (last.t > nowMs + 60_000 || nowMs - last.t > intervalMs * 2 + 90_000) return unavailable;
  const consecutive: OIHistoryPoint[] = [last];
  for (let i = sorted.length - 2; i >= 0 && consecutive.length < 8; i--) {
    if (consecutive[0].t - sorted[i].t !== intervalMs) break;
    consecutive.unshift(sorted[i]);
  }
  const prev = consecutive.length >= 2 ? consecutive[consecutive.length-2] : null;
  return {
    currentUsd: Math.round(last.v),
    change1hPct: prev ? Number(((last.v - prev.v) / prev.v * 100).toFixed(2)) : null,
    history: consecutive.length >= 3 ? consecutive.map(x => Math.round(x.v)) : [],
  };
}
