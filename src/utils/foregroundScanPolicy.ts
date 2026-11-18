import type { ActivePageType } from '../types';

/** Determine the first visible section before effects start any network scan.
 * A bookmarked Desktop #terminal/#replay pane must not briefly scan the
 * Screener simply because React's initial state defaults to "screener".
 */
export function initialActivePage(hash: string): ActivePageType {
  switch (hash) {
    case '#patterns': return 'patterns';
    case '#terminal': return 'terminal';
    case '#surveillance': return 'surveillance';
    case '#replay': return 'replay';
    default: return 'screener';
  }
}

/** Normal formation scans are only needed on their two actual consumers. */
export function shouldRunStandardScan(
  page: ActivePageType, earlyMode: boolean, chartPageActive: boolean,
): boolean {
  return !chartPageActive && (page === 'screener' || (page === 'patterns' && !earlyMode));
}

/** The exhaustive W/M search belongs only to the early Formations view.
 * It must never auto-start from a remembered toggle in Terminal or Replay.
 */
export function shouldRunEarlyScan(
  page: ActivePageType, earlyMode: boolean, chartPageActive: boolean,
): boolean {
  return !chartPageActive && page === 'patterns' && earlyMode;
}

/** A manual refresh must never launch an unrelated market scan.
 * In particular, Early W/M and regular Formations are separate workloads.
 */
export function foregroundScanKind(
  page: ActivePageType, earlyMode: boolean, chartPageActive: boolean,
): 'regular' | 'early' | null {
  if (shouldRunEarlyScan(page, earlyMode, chartPageActive)) return 'early';
  return shouldRunStandardScan(page, earlyMode, chartPageActive) ? 'regular' : null;
}
