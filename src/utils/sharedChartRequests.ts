import { createTimedRequestCache } from './sharedAnalysisKlines';
import { isShareableDesktopChartURL, sharedDesktopPublicChartJson } from './desktopSharedPublicChart';

export const SHARED_CHART_REQUEST_DEADLINE_MS = 8_000;

/**
 * Limit both the HTTP handshake and JSON-body read. Abort the underlying
 * transport and reject the shared promise even if a browser/fetch adapter
 * ignores the abort signal. A hung request must never lock every HookChart's
 * Funding/OI/reference data polling for the same symbol.
 */
export async function fetchChartJsonWithDeadline(
  url: string, deadlineMs = SHARED_CHART_REQUEST_DEADLINE_MS,
): Promise<any> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = fetch(url, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Chart data HTTP ' + response.status);
        return response.json();
      });
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Chart data request timed out'));
      }, Math.max(1, deadlineMs));
    });
    return await Promise.race([request, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Deduplicate public chart-support requests across all HookCharts in a tab.
 * Only data common to all users/graphs is cached; replay/order/user endpoints
 * must never call this helper. Rejected requests are evicted by the cache.
 *
 * The factory permits isolated short-deadline tests; the app still uses a
 * single pair of bounded caches shared by every chart in its browser tab.
 */
export function createSharedChartJsonFetcher(deadlineMs = SHARED_CHART_REQUEST_DEADLINE_MS) {
  const minuteCache = createTimedRequestCache<any>(55_000, 256);
  // One-minute volume must not reuse an empty/stale response for 55 seconds.
  // A separate small cache still coalesces simultaneous multi-chart readers.
  const minuteVolumeCache = createTimedRequestCache<any>(10_000, 128);
  const fundingHistoryCache = createTimedRequestCache<any>(10 * 60_000, 128);

  return function fetchSharedJson(
    url: string, category: 'minute' | 'minute-volume' | 'funding-history' = 'minute',
  ): Promise<any> {
    const cache = category === 'funding-history' ? fundingHistoryCache
      : category === 'minute-volume' ? minuteVolumeCache : minuteCache;
    // A funding settlement always creates a fresh key even when an earlier
    // response was cached minutes before 00:00, 08:00 or 16:00 UTC.
    const key = category === 'funding-history'
      ? url + ':' + Math.floor(Date.now() / (5 * 60_000))
      : url;
    return cache.load(key, () => {
      // Desktop uses one persistent Chromium session for every native panel.
      // Share only explicitly allowlisted, public reference JSON. Live klines,
      // order books, private API data and normal browser-site behavior stay
      // unchanged; Web Locks/Channel failures fall back to normal requests.
      const desktop = typeof window !== 'undefined' &&
        new URLSearchParams(window.location?.search || '').get('h00kDesktop') === '1';
      if (desktop && category !== 'funding-history' && isShareableDesktopChartURL(url)) {
        return sharedDesktopPublicChartJson().read(
          url, () => fetchChartJsonWithDeadline(url, deadlineMs),
          AbortSignal.timeout(Math.max(1, deadlineMs)),
        );
      }
      return fetchChartJsonWithDeadline(url, deadlineMs);
    });
  };
}

export const fetchSharedChartJson = createSharedChartJsonFetcher();
