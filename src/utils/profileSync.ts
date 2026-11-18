/** Lightweight tab invalidation: no passwords, session tokens or full profiles
 * ever enter localStorage or BroadcastChannel. The server remains authoritative.
 */
export const PROFILE_SYNC_SIGNAL_KEY = 'h00k:profile-sync:v1';
export const PROFILE_FOCUS_REFRESH_MS = 45_000;
// The site has many guests: a guest refocus seldom merits another session read.
export const PROFILE_GUEST_FOCUS_REFRESH_MS = 5 * 60_000;
export const PROFILE_SIGNAL_COALESCE_MS = 2_500;

export type ProfileSyncSignal = {
  uid: string | null;
  kind: 'profile' | 'session';
  nonce: string;
};

export function parseProfileSyncSignal(raw: string | null): ProfileSyncSignal | null {
  if (!raw || raw.length > 400) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (value.kind !== 'profile' && value.kind !== 'session') return null;
    if (value.uid !== null && (typeof value.uid !== 'string' || !value.uid || value.uid.length > 128))
      return null;
    if (value.kind === 'profile' && value.uid === null) return null;
    if (typeof value.nonce !== 'string' || !value.nonce || value.nonce.length > 90) return null;
    return { uid: value.uid as string | null, kind: value.kind, nonce: value.nonce };
  } catch {
    return null;
  }
}

/** Only the same account's profile writes, or browser-session changes, matter. */
export function isProfileSyncRelevant(signal: ProfileSyncSignal, currentUid: string | null): boolean {
  return signal.kind === 'session' || (currentUid !== null && signal.uid === currentUid);
}

/** Foreground checks only: no interval and no work while a tab is hidden. */
export function shouldRefreshProfileOnFocus(
  lastCheckAt: number, now: number, interval = PROFILE_FOCUS_REFRESH_MS,
): boolean {
  return !Number.isFinite(lastCheckAt) || now < lastCheckAt ||
    now - lastCheckAt >= interval;
}

/** Invalidation only, not an auth or profile data transport. */
export function publishProfileSyncSignal(uid: string | null, kind: 'profile' | 'session'): void {
  if (typeof window === 'undefined') return;
  if (kind === 'profile' && !uid) return;
  try {
    const signal: ProfileSyncSignal = {
      uid, kind,
      nonce: `${Date.now()}:${Math.random().toString(36).slice(2)}`,
    };
    window.localStorage.setItem(PROFILE_SYNC_SIGNAL_KEY, JSON.stringify(signal));
  } catch {
    // Storage disabled/private mode: the next foreground session check remains a fallback.
  }
}
