/** One preference shared by every coin's custom Telegram price-alert panel. */
export const TELEGRAM_ALERT_PANEL_STORAGE_PREFIX = 'h00k:telegram-price-alert-panel:collapsed:v1';

export function telegramAlertPanelStorageKey(uid?: string | null): string {
  return `${TELEGRAM_ALERT_PANEL_STORAGE_PREFIX}:${uid || 'guest'}`;
}

/** Missing or inaccessible browser storage defaults to an expanded panel. */
export function readTelegramAlertPanelCollapsed(
  storage: Pick<Storage, 'getItem'> | null | undefined,
  uid?: string | null,
): boolean {
  try {
    return storage?.getItem(telegramAlertPanelStorageKey(uid)) === 'true';
  } catch {
    return false;
  }
}

/** Local backup works across routes and reloads without touching alert data. */
export function saveTelegramAlertPanelCollapsed(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  collapsed: boolean,
  uid?: string | null,
): void {
  try {
    storage?.setItem(telegramAlertPanelStorageKey(uid), String(collapsed));
  } catch {
    // A blocked/full storage must not prevent the UI from collapsing.
  }
}

/** A failed profile write must not overwrite a newer local choice on reload. */
export function telegramAlertPanelPendingKey(uid: string): string {
  return `${TELEGRAM_ALERT_PANEL_STORAGE_PREFIX}:pending:${uid}`;
}

export function isTelegramAlertPanelSyncPending(
  storage: Pick<Storage, 'getItem'> | null | undefined,
  uid: string,
): boolean {
  try {
    return storage?.getItem(telegramAlertPanelPendingKey(uid)) === 'true';
  } catch {
    return false;
  }
}

export function saveTelegramAlertPanelSyncPending(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined,
  uid: string,
  pending: boolean,
): void {
  try {
    if (pending) storage?.setItem(telegramAlertPanelPendingKey(uid), 'true');
    else storage?.removeItem(telegramAlertPanelPendingKey(uid));
  } catch {
    // Local persistence is best effort and must not block the UI.
  }
}
