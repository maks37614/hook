/** Per-account invalidation signals; no private data leaves this module.
 * Ordinary 24/7 snapshots use a 15s budget. New alert events must never wait
 * for that budget, but rapid alerts are coalesced to protect browsers/VPS. */
type Listener = (version: number, urgent?: boolean) => void;
const listeners = new Map<string, Set<Listener>>();
const lastPublished = new Map<string, number>();
const lastUrgent = new Map<string, number>();
const pendingUrgent = new Map<string, ReturnType<typeof setTimeout>>();
const lastVersion = new Map<string, number>();
const MAX_CONNECTIONS = 512;
const MAX_CONNECTIONS_PER_USER = 3;
const URGENT_WINDOW_MS = 750;
let clients = 0;

function emit(userId: string, now: number, urgent: boolean) {
  const set = listeners.get(userId);
  if (!set?.size) return;
  lastPublished.set(userId, now);
  if (urgent) lastUrgent.set(userId, now);
  const version = (lastVersion.get(userId) ?? 0) + 1;
  lastVersion.set(userId, version);
  for (const listener of [...set]) { try { listener(version, urgent); } catch {} }
}

export function subscribeSurveillance(userId: string, listener: Listener): (() => void) | null {
  if (!userId || userId === 'guest' || clients >= MAX_CONNECTIONS) return null;
  let set = listeners.get(userId);
  if (set && set.size >= MAX_CONNECTIONS_PER_USER) return null;
  if (!set) { set = new Set(); listeners.set(userId, set); }
  set.add(listener);
  clients++;
  return () => {
    if (!set?.delete(listener)) return;
    clients--;
    if (!set.size) {
      listeners.delete(userId);
      lastPublished.delete(userId);
      lastUrgent.delete(userId);
      lastVersion.delete(userId);
      const timer = pendingUrgent.get(userId);
      if (timer) clearTimeout(timer);
      pendingUrgent.delete(userId);
    }
  };
}

/** Coalesce ordinary state changes from many workers to at most one per 15s. */
export function publishSurveillance(userId: string, force = false, now = Date.now()): void {
  if (!listeners.get(userId)?.size) return;
  if (!force && now - (lastPublished.get(userId) ?? -Infinity) < 15000) return;
  emit(userId, now, false);
}

/** Dispatch a new private alert promptly; unlike routine state changes this
 * bypasses the 15s gate. A trailing invalidation ensures that later events
 * within the 750ms burst are visible, without one GET per coin/alert. */
export function publishSurveillanceAlert(userId: string, now = Date.now()): void {
  if (!listeners.get(userId)?.size) return;
  const elapsed = now - (lastUrgent.get(userId) ?? -Infinity);
  if (elapsed >= URGENT_WINDOW_MS) {
    emit(userId, now, true);
    return;
  }
  if (pendingUrgent.has(userId)) return;
  const timer = setTimeout(() => {
    pendingUrgent.delete(userId);
    emit(userId, Date.now(), true);
  }, Math.max(0, URGENT_WINDOW_MS - elapsed));
  timer.unref?.();
  pendingUrgent.set(userId, timer);
}

export function surveillanceStreamStats() {
  return { clients, users: listeners.size, limit: MAX_CONNECTIONS, pendingUrgent: pendingUrgent.size };
}
