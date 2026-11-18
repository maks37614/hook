/** Keep a stalled historical REST seed from indefinitely buffering valid live
 * WebSocket trades. A deadline covers both the HTTP headers and JSON body.
 * The deadline does not disconnect the independent live trade socket.
 */
export const MARKET_TRADE_SEED_DEADLINE_MS = 8_000;

export async function fetchMarketTradeSeedJson(
  url: string,
  stopSignal: AbortSignal,
  deadlineMs = MARKET_TRADE_SEED_DEADLINE_MS,
): Promise<any> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  stopSignal.addEventListener('abort', stop, { once: true });
  if (stopSignal.aborted) stop();

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (stopSignal.aborted) throw new Error('Market trade seed canceled');
    const request = fetch(url, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Market trade seed HTTP ' + response.status);
      return response.json();
    });
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Market trade seed timed out'));
      }, Math.max(1, deadlineMs));
    });
    // Even if an injected fetch ignores AbortSignal, the pending seed is
    // released so the real-time WebSocket data can become visible.
    return await Promise.race([request, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    stopSignal.removeEventListener('abort', stop);
  }
}
