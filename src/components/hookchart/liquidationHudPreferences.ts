import type { CascadeRisk } from './engine';

/** One preference per browser account, shared by all HookCharts in that account. */
export const LIQUIDATION_HUD_PREFERENCE_EVENT = 'h00k:liquidation-hud-visibility';

export function liquidationHudPreferenceKey(uid?: string | null): string {
  return 'h00k:hookchart:liquidation-hud-expanded:v1:' + (uid || 'guest');
}

/** A missing or invalid preference means collapsed, never expanded. */
export function readLiquidationHudExpanded(key: string): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function saveLiquidationHudExpanded(key: string, expanded: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, expanded ? '1' : '0');
  } catch {
    // Restricted storage must not prevent the user from opening the panel.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LIQUIDATION_HUD_PREFERENCE_EVENT, {
      detail: { key, expanded },
    }));
  }
}

/**
 * The label "Cascade" is a signal, not a feed-connectivity diagnostic.
 * A single liquidation or a LOW/empty estimate is not a cascade.
 * calcCascadeRisk already caps the score until at least two recent
 * independent large events; require a meaningful MED+ score as well.
 */
export function hasObservedLiquidationCascade(
  risk: CascadeRisk,
  streamLive: boolean,
): boolean {
  return streamLive
    && risk.hasData === true
    && Number.isFinite(risk.score)
    && risk.score >= 34
    && (risk.count1 ?? 0) >= 2
    && risk.count5 >= 2
    && risk.level !== 'LOW';
}
