/** One wall-clock tick for all Desktop Terminal panes sharing the h00k origin.
 * The Browser/WebSocket live feed is not affected: this schedules only the
 * Terminal's 30-second public quote-list refresh. */
export const TERMINAL_MARKET_REFRESH_MS = 30_000;

export function nextTerminalMarketRefreshDelay(now: number, desktop: boolean): number {
  if (!desktop || !Number.isFinite(now)) return TERMINAL_MARKET_REFRESH_MS;
  const offset = ((now % TERMINAL_MARKET_REFRESH_MS) + TERMINAL_MARKET_REFRESH_MS)
    % TERMINAL_MARKET_REFRESH_MS;
  // A too-close boundary would be skipped by Terminal's existing 25s
  // minimum-gap guard and could leave prices unchanged for almost a minute.
  // Use a 25s intermediate refresh instead; its phase moves toward the next
  // common 30s boundary on subsequent ticks, without sacrificing freshness.
  const untilBoundary = offset === 0 ? TERMINAL_MARKET_REFRESH_MS
    : TERMINAL_MARKET_REFRESH_MS - offset;
  return Math.max(25_000, untilBoundary);
}
