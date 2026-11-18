import type { VisualChartProfile } from '../hookchart/visualProfiles';
import { normalizeVisualProfile } from '../hookchart/visualProfiles';

/** The shared profile shown by the sliders while fit-all-history is active.
 * The separate persisted fitAll flag makes actual candle count responsive to
 * each chart's history (including fewer or more than 500 loaded candles). */
export const TERMINAL_FIT_HISTORY_PROFILE: VisualChartProfile = {
  visibleBars: 500,
  rightGapBars: 0,
  verticalZoom: 1,
  autoPriceScale: true,
};

/** Pass the chosen viewport with the click. Waiting for profile state can apply
 * stale values while React batches a Terminal workspace update. */
export const TERMINAL_INITIAL_VIEW_APPLY_EVENT = 'h00k:terminal-apply-initial-view';

export type TerminalInitialViewApplyDetail =
  | { view: VisualChartProfile; reset?: never }
  | { reset: true; view?: never };

export function applyTerminalInitialViewNow(
  view: VisualChartProfile,
  target: Pick<EventTarget, 'dispatchEvent'> | undefined =
    typeof window === 'undefined' ? undefined : window,
): void {
  if (!target) return;
  const detail: TerminalInitialViewApplyDetail = {
    view: normalizeVisualProfile(view, 'terminalMedium'),
  };
  target.dispatchEvent(new CustomEvent<TerminalInitialViewApplyDetail>(
    TERMINAL_INITIAL_VIEW_APPLY_EVENT, { detail },
  ));
}

/** Remove an unsaved Terminal preview so the chart restores its actual saved
 * workspace profile or existing HookChart defaults, with no exchange requests. */
export function discardTerminalInitialViewPreview(
  target: Pick<EventTarget, 'dispatchEvent'> | undefined =
    typeof window === 'undefined' ? undefined : window,
): void {
  if (!target) return;
  target.dispatchEvent(new CustomEvent<TerminalInitialViewApplyDetail>(
    TERMINAL_INITIAL_VIEW_APPLY_EVENT, { detail: { reset: true } },
  ));
}
