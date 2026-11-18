import { apiFetch } from './apiFetch';

/** One authenticated, account-scoped SSE connection for all consumers inside
 * one browser window. Reuse across 24/7 monitors and standalone price alerts,
 * so activating both features does not double persistent VPS connections.
 *
 * Only event *names* are delivered. No private payload, session token or
 * user data is ever put into a URL or a browser-global event.
 */
export type UserSignalEvent = 'changed' | 'alert';
type Listener = {
  onEvent: (event: UserSignalEvent) => void;
  onStatus?: (connected: boolean) => void;
};
type Connection = {
  userId: string;
  listeners: Set<Listener>;
  controller: AbortController | null;
  retry: ReturnType<typeof setTimeout> | null;
  connected: boolean;
  attempt: number;
  disposed: boolean;
};
const connections = new Map<string, Connection>();

function setConnected(state: Connection, connected: boolean) {
  if (state.connected === connected) return;
  state.connected = connected;
  for (const listener of [...state.listeners]) {
    try { listener.onStatus?.(connected); } catch {}
  }
}
function emit(state: Connection, event: UserSignalEvent) {
  if (state.disposed) return;
  for (const listener of [...state.listeners]) {
    try { listener.onEvent(event); } catch {}
  }
}
function parseFrame(state: Connection, frame: string) {
  if (frame.startsWith('event: alert\n') || frame === 'event: alert') {
    emit(state, 'alert');
  } else if (frame.startsWith('event: changed\n') || frame === 'event: changed') {
    emit(state, 'changed');
  }
}

async function connect(state: Connection) {
  if (state.disposed || !state.listeners.size) return;
  const controller = new AbortController();
  state.controller = controller;
  try {
    const response = await apiFetch('/api/surveillance/stream', {
      signal: controller.signal,
      headers: { Accept: 'text/event-stream' },
    });
    if (!response.ok || !response.body) throw new Error('Private live alerts unavailable');
    if (state.disposed || state.controller !== controller) return;
    setConnected(state, true);
    state.attempt = 0;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (!state.disposed && state.controller === controller) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
      if (buffer.length > 8192) { buffer = ''; continue; }
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        parseFrame(state, buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }
  } catch {
    // Existing periodic API sync remains the fallback. Never fabricate a
    // server notification or expose private connection errors to listeners.
  } finally {
    if (state.controller === controller) {
      state.controller = null;
      setConnected(state, false);
      controller.abort();
      if (!state.disposed && state.listeners.size) {
        const delay = Math.min(60_000, 3_000 * 2 ** Math.min(state.attempt++, 5));
        state.retry = setTimeout(() => {
          state.retry = null;
          void connect(state);
        }, delay);
      }
    }
  }
}

/** Unsubscribe always aborts the transport when the last consumer leaves.
 * React StrictMode and account switching cannot keep an orphan session alive.
 */
export function subscribeUserSignalStream(userId: string,
  onEvent: Listener['onEvent'], onStatus?: Listener['onStatus']): () => void {
  if (!userId || userId === 'guest') return () => {};
  let state = connections.get(userId);
  if (!state) {
    state = { userId, listeners: new Set(), controller: null, retry: null,
      connected: false, attempt: 0, disposed: false };
    connections.set(userId, state);
  }
  const listener: Listener = { onEvent, onStatus };
  state.listeners.add(listener);
  try { onStatus?.(state.connected); } catch {}
  if (!state.controller && !state.retry) void connect(state);
  return () => {
    if (!state || !state.listeners.delete(listener)) return;
    if (state.listeners.size) return;
    state.disposed = true;
    if (state.retry) clearTimeout(state.retry);
    state.retry = null;
    state.controller?.abort();
    state.controller = null;
    setConnected(state, false);
    connections.delete(userId);
  };
}

/** Only aggregate counts, with no account identifiers. */
export function userSignalStreamStats() {
  return { connections: connections.size,
    subscribers: Array.from(connections.values(), state => state.listeners.size)
      .reduce((total, value) => total + value, 0) };
}
