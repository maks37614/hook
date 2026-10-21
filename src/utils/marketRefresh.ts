interface MarketRefreshEnvironment {
  window: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval'>;
  document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
  navigator: Pick<Navigator, 'onLine'>;
}

/** Resume immediately after reconnecting or returning from a suspended mobile tab. */
export function subscribeMarketRefresh(
  refresh: () => void | Promise<unknown>,
  environment: MarketRefreshEnvironment = { window, document, navigator },
  intervalMs = 30_000,
): () => void {
  const { window: browser, document: page, navigator: network } = environment;
  let pending = false;
  let disposed = false;
  const refreshIfActive = () => {
    if (disposed || pending || page.visibilityState === 'hidden' || network.onLine === false) return;
    const result = refresh();
    if (result) {
      pending = true;
      void Promise.resolve(result).catch(error => console.warn('Market refresh failed:', error))
        .finally(() => { pending = false; });
    }
  };
  browser.addEventListener('online', refreshIfActive);
  page.addEventListener('visibilitychange', refreshIfActive);
  const interval = browser.setInterval(refreshIfActive, intervalMs);
  return () => {
    disposed = true;
    browser.clearInterval(interval);
    browser.removeEventListener('online', refreshIfActive);
    page.removeEventListener('visibilitychange', refreshIfActive);
  };
}
