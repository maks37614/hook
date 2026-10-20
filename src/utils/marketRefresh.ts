interface MarketRefreshEnvironment {
  window: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval'>;
  document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
  navigator: Pick<Navigator, 'onLine'>;
}

/** Resume immediately after reconnecting or returning from a suspended mobile tab. */
export function subscribeMarketRefresh(
  refresh: () => void,
  environment: MarketRefreshEnvironment = { window, document, navigator },
): () => void {
  const { window: browser, document: page, navigator: network } = environment;
  const refreshIfActive = () => {
    if (page.visibilityState !== 'hidden' && network.onLine !== false) refresh();
  };
  browser.addEventListener('online', refreshIfActive);
  page.addEventListener('visibilitychange', refreshIfActive);
  const interval = browser.setInterval(refreshIfActive, 30_000);
  return () => {
    browser.clearInterval(interval);
    browser.removeEventListener('online', refreshIfActive);
    page.removeEventListener('visibilitychange', refreshIfActive);
  };
}
