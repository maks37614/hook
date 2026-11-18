/** Shared, per-account visibility of the Smart Analysis panel on coin details. */
export const SMART_ANALYSIS_PANEL_STORAGE_PREFIX = 'h00k:smart-analysis-panel:collapsed:v1';

export function smartAnalysisPanelStorageKey(uid?: string | null): string {
  return `${SMART_ANALYSIS_PANEL_STORAGE_PREFIX}:${uid || 'guest'}`;
}

export function readSmartAnalysisPanelCollapsed(
  storage: Pick<Storage, 'getItem'> | null | undefined,
  uid?: string | null,
): boolean {
  try { return storage?.getItem(smartAnalysisPanelStorageKey(uid)) === 'true'; }
  catch { return false; }
}

export function saveSmartAnalysisPanelCollapsed(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  collapsed: boolean,
  uid?: string | null,
): void {
  try { storage?.setItem(smartAnalysisPanelStorageKey(uid), String(collapsed)); }
  catch { /* Browsers may block local storage; keep the button usable. */ }
}

export function smartAnalysisPanelPendingKey(uid: string): string {
  return `${SMART_ANALYSIS_PANEL_STORAGE_PREFIX}:pending:${uid}`;
}

export function isSmartAnalysisPanelSyncPending(
  storage: Pick<Storage, 'getItem'> | null | undefined,
  uid: string,
): boolean {
  try { return storage?.getItem(smartAnalysisPanelPendingKey(uid)) === 'true'; }
  catch { return false; }
}

export function saveSmartAnalysisPanelSyncPending(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined,
  uid: string,
  pending: boolean,
): void {
  try {
    if (pending) storage?.setItem(smartAnalysisPanelPendingKey(uid), 'true');
    else storage?.removeItem(smartAnalysisPanelPendingKey(uid));
  } catch { /* Retain current UI state even without storage. */ }
}
