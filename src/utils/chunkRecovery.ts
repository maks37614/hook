const RELOAD_KEY = 'h00k:chunk-reload-at';
const RELOAD_COOLDOWN_MS = 60_000;

/** An old open tab can reference a bundle removed by a deployment. Refresh the
 * HTML once; persistent failures and unavailable storage must not cause loops. */
export function reloadForMissingChunk(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  reload: () => void,
  now = Date.now(),
): boolean {
  try {
    const saved = storage.getItem(RELOAD_KEY);
    const previous = saved === null ? NaN : Number(saved);
    if (Number.isFinite(previous) && now >= previous && now - previous < RELOAD_COOLDOWN_MS) return false;
    storage.setItem(RELOAD_KEY, String(now));
    reload();
    return true;
  } catch { return false; }
}

export function installChunkRecovery(
  target: Pick<Window, 'addEventListener' | 'removeEventListener' | 'location' | 'sessionStorage'>,
): () => void {
  const onPreloadError = (event: Event) => {
    try {
      if (reloadForMissingChunk(target.sessionStorage, () => target.location.reload())) event.preventDefault();
    } catch { /* Storage can be disabled by the browser. Leave normal error handling active. */ }
  };
  target.addEventListener('vite:preloadError', onPreloadError);
  return () => target.removeEventListener('vite:preloadError', onPreloadError);
}
