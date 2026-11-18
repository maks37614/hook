import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSharedChartJsonFetcher, fetchChartJsonWithDeadline,
} from '../src/utils/sharedChartRequests';

test('stalled HTTP headers expire and abort the shared request transport', async () => {
  const originalFetch = globalThis.fetch;
  let aborts = 0;
  try {
    globalThis.fetch = (_url, options) => new Promise<Response>(() => {
      const signal = options?.signal as AbortSignal;
      signal.addEventListener('abort', () => { aborts++; }, { once: true });
    });
    await assert.rejects(
      fetchChartJsonWithDeadline('https://example.invalid/chart-stalled-headers', 15),
      /Chart data request timed out/,
    );
    assert.equal(aborts, 1, 'timeout aborts the underlying fetch even when it ignores the signal');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('stalled response.json() expires without locking funding and OI pollers', async () => {
  const originalFetch = globalThis.fetch;
  let signal: AbortSignal | undefined;
  try {
    globalThis.fetch = async (_url, options) => {
      signal = options?.signal as AbortSignal;
      return {
        ok: true,
        json: () => new Promise<never>(() => {}),
      } as unknown as Response;
    };
    await assert.rejects(
      fetchChartJsonWithDeadline('https://example.invalid/chart-stalled-body', 15),
      /Chart data request timed out/,
    );
    assert.equal(signal?.aborted, true, 'even a hung body read cancels the HTTP transport');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('many charts share one hung request, evict the failure, then retry and share the recovery', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  const fetcher = createSharedChartJsonFetcher(20);
  const url = '/api/derivatives/oi/history?symbol=DEADLINETESTUSDT';
  try {
    globalThis.fetch = async () => {
      requests++;
      // Emulate an HTTP adapter that never responds to AbortSignal.
      if (requests === 1) return new Promise<Response>(() => {});
      return Response.json({ success: true, binance: [1], bybit: [2] });
    };
    const one = fetcher(url);
    const two = fetcher(url);
    assert.strictEqual(one, two, 'the Terminal must not open duplicate HTTP requests for identical charts');
    const failures = await Promise.allSettled([one, two]);
    assert.equal(requests, 1);
    for (const failure of failures) {
      assert.equal(failure.status, 'rejected');
      if (failure.status === 'rejected')
        assert.match(String(failure.reason), /Chart data request timed out/);
    }

    const recovered = await fetcher(url);
    assert.deepEqual(recovered, { success: true, binance: [1], bybit: [2] });
    assert.equal(requests, 2, 'a failed cached request is evicted and re-fetched');
    assert.strictEqual(await fetcher(url), recovered, 'a healthy response is cached for other charts');
    assert.equal(requests, 2, 'the successful result prevents redundant REST calls');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('funding history and minute data retain independent caches', async () => {
  const originalFetch = globalThis.fetch;
  const fetcher = createSharedChartJsonFetcher(100);
  let requests = 0;
  const url = '/api/chart/funding-independent-test';
  try {
    globalThis.fetch = async () => Response.json({ revision: ++requests });
    const minute = await fetcher(url);
    const history = await fetcher(url, 'funding-history');
    assert.deepEqual(minute, { revision: 1 });
    assert.deepEqual(history, { revision: 2 });
    assert.deepEqual(await fetcher(url), minute);
    assert.deepEqual(await fetcher(url, 'funding-history'), history);
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('HTTP status errors still reject and are evicted for retry', async () => {
  const originalFetch = globalThis.fetch;
  const fetcher = createSharedChartJsonFetcher(100);
  let requests = 0;
  try {
    globalThis.fetch = async () => {
      if (++requests === 1) return new Response('limited', { status: 429 });
      return Response.json({ rate: 0.0002 });
    };
    await assert.rejects(fetcher('/api/chart/retry-after-429'), /Chart data HTTP 429/);
    assert.deepEqual(await fetcher('/api/chart/retry-after-429'), { rate: 0.0002 });
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
