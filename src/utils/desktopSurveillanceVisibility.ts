/**
 * Desktop pages are separately mounted React trees. Each can otherwise keep
 * its own authenticated surveillance SSE open while hidden, even though 24/7
 * monitoring, persistence and Telegram delivery are already server-side.
 * These functions never suppress monitoring tasks or regular browser tabs.
 */
export function isDesktopSurveillanceView(search: string): boolean {
  return new URLSearchParams(search).get('h00kDesktop') === '1';
}

export function shouldConnectSurveillanceSSE(
  authenticated: boolean,
  hasActiveMonitors: boolean,
  desktopView: boolean,
  pageVisible: boolean,
): boolean {
  return authenticated && hasActiveMonitors && (!desktopView || pageVisible);
}
