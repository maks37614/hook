/** Canvas backing-store resolution only. Never changes CSS geometry or market data. */
export const DEFAULT_MAX_CANVAS_DPR = 4;
export const HOOKCHART_CANVAS_DPR_EVENT = 'hookchart:max-canvas-dpr';
export const GUEST_CANVAS_DPR_KEY = 'hookchart:guest-canvas-dpr';

export function normalizeMaxCanvasDpr(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(4, value))
    : DEFAULT_MAX_CANVAS_DPR;
}

export function effectiveCanvasDpr(deviceDpr: unknown, maxCanvasDpr: unknown): number {
  const nativeDpr = typeof deviceDpr === 'number' && Number.isFinite(deviceDpr) ? Math.max(1, deviceDpr) : 1;
  return Math.min(nativeDpr, normalizeMaxCanvasDpr(maxCanvasDpr));
}

export function readGuestMaxCanvasDpr(): number {
  if (typeof window === 'undefined') return DEFAULT_MAX_CANVAS_DPR;
  try {
    const stored = window.localStorage.getItem(GUEST_CANVAS_DPR_KEY);
    return stored === null ? DEFAULT_MAX_CANVAS_DPR : normalizeMaxCanvasDpr(Number(stored));
  } catch {
    return DEFAULT_MAX_CANVAS_DPR;
  }
}

/** Sync simultaneously mounted charts immediately; account persistence stays in the profile API. */
export function publishMaxCanvasDpr(value: number, uid: string | null): void {
  if (typeof window === 'undefined') return;
  const cap = normalizeMaxCanvasDpr(value);
  if (!uid) {
    try { window.localStorage.setItem(GUEST_CANVAS_DPR_KEY, String(cap)); } catch { /* private mode */ }
  }
  window.dispatchEvent(new CustomEvent(HOOKCHART_CANVAS_DPR_EVENT, { detail: { uid, cap } }));
}
