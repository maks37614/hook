import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchSharedChartJson } from '../src/utils/sharedChartRequests';

test('100 identical live chart support requests produce one HTTP fetch per tab', async () => {
  const previousFetch = globalThis.fetch;
  let count = 0;
  try {
    globalThis.fetch = (async (url: string | URL | Request) => {
      count++;
      await new Promise(resolve => setImmediate(resolve));
      return { ok: true, json: async () => ({ url: String(url), success: true }) } as Response;
    }) as typeof fetch;
    const url = '/api/derivatives/oi/history?symbol=TESTSHAREDUSDT&timeframe=5m';
    const rows = await Promise.all(Array.from({ length: 100 }, () => fetchSharedChartJson(url)));
    assert.equal(count, 1);
    assert.equal(new Set(rows.map(row => row.url)).size, 1);
    await fetchSharedChartJson(url);
    assert.equal(count, 1, 'fresh identical cache hit does not poll again');
    await fetchSharedChartJson(url.replace('5m', '15m'));
    assert.equal(count, 2, 'each timeframe has independent data');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('failed support HTTP requests are not cached indefinitely', async () => {
  const previousFetch = globalThis.fetch;
  let count = 0;
  try {
    globalThis.fetch = (async () => {
      count++;
      if (count === 1) return { ok: false, status: 503 } as Response;
      return { ok: true, json: async () => ({ success: true }) } as Response;
    }) as typeof fetch;
    const url = '/api/chart/trades24h?exchange=binance&symbol=RETRYSHAREDUSDT';
    await assert.rejects(fetchSharedChartJson(url), /503/);
    assert.deepEqual(await fetchSharedChartJson(url), { success: true });
    assert.equal(count, 2);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
