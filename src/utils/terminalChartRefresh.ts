import { terminalRenderIntervalMs } from './terminalRenderPolicy';

/** Visual-only Terminal candle refresh cadence. Exchange sockets and alerts
 * always continue at their native speed; this setting only batches React paints.
 */
export const TERMINAL_CHART_REFRESH_STORAGE_KEY = 'terminal_chart_refresh_ms';

export const TERMINAL_CHART_REFRESH_OPTIONS = [0, 250, 500, 1000, 2000, 5000] as const;
export type TerminalChartRefreshMs = (typeof TERMINAL_CHART_REFRESH_OPTIONS)[number];

/** Invalid or legacy storage values never slow live charts unexpectedly. */
export function normalizeTerminalChartRefreshMs(value: unknown): TerminalChartRefreshMs {
  const numeric = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return TERMINAL_CHART_REFRESH_OPTIONS.includes(numeric as TerminalChartRefreshMs)
    ? numeric as TerminalChartRefreshMs : 0;
}

/** Keep the old default and ECO behavior unless a user explicitly selects a
 * slower screen refresh. Does not affect exchange event processing.
 */
export function terminalChartUiIntervalMs(
  requestedMs: unknown, ecoMode: boolean, activeCharts = 0,
): number {
  // A 'Live' selection respects the existing adaptive grid budget.
  const baseline = activeCharts > 0
    ? terminalRenderIntervalMs(activeCharts, ecoMode)
    : ecoMode ? 200 : 80;
  return Math.max(baseline, normalizeTerminalChartRefreshMs(requestedMs));
}
