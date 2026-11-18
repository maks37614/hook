import test from 'node:test';
import assert from 'node:assert/strict';
import { klineCacheTtlMs, LIVE_KLINES_TTL_MS, HISTORICAL_KLINES_TTL_MS } from '../server/klineHistoryPolicy';
import { fetchHistoricalReplayCandles } from '../src/utils/replayService';
import type { Kline } from '../src/types';

test('live, malformed and recently closed data retain 1.5s freshness; immutable history has bounded reuse', () => {
  const now = Date.UTC(2026, 10, 16, 14);
  assert.equal(klineCacheTtlMs('1m', undefined, now), LIVE_KLINES_TTL_MS);
  assert.equal(klineCacheTtlMs('1m', NaN, now), LIVE_KLINES_TTL_MS);
  assert.equal(klineCacheTtlMs('1m', -10, now), LIVE_KLINES_TTL_MS);
  assert.equal(klineCacheTtlMs('1m', now + 60_000, now), LIVE_KLINES_TTL_MS);
  assert.equal(klineCacheTtlMs('1m', now - 47 * 3_600_000, now), LIVE_KLINES_TTL_MS);
  assert.equal(klineCacheTtlMs('1m', now - 49 * 3_600_000, now), HISTORICAL_KLINES_TTL_MS);
  assert.equal(klineCacheTtlMs('1d', now - 49 * 3_600_000, now), HISTORICAL_KLINES_TTL_MS);
  assert.equal(klineCacheTtlMs('1d', now - 47 * 3_600_000, now), LIVE_KLINES_TTL_MS);
});

test('Replay requests on the same candle align to one public cache key without changing the cutoff', async t => {
  const anchor = Date.UTC(2025, 7, 20, 12);
  const tfMs = 3_600_000;
  const barsBefore = 20, barsAfter = 20;
  const candles: Kline[] = Array.from({ length: 41 }, (_, i) => ({
    time: Math.floor((anchor + (i - barsBefore) * tfMs) / 1000),
    open: 10, high: 12, low: 9, close: 11, volume: 100,
  }));
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    assert.ok(url.startsWith('/api/klines?'));
    return Response.json({ success: true, data: candles });
  });
  const first = await fetchHistoricalReplayCandles('binance', 'futures', 'BTCUSDT',
    '1h', anchor + 5 * 60_000, barsBefore, barsAfter);
  const second = await fetchHistoricalReplayCandles('binance', 'futures', 'BTCUSDT',
    '1h', anchor + 55 * 60_000, barsBefore, barsAfter);
  assert.equal(urls.length, 2, 'both requests succeed on their first shared server path');
  assert.equal(urls[0], urls[1], 'identical hourly page despite different selected minutes');
  const params = new URL(urls[0], 'https://h00k.top').searchParams;
  assert.equal(Number(params.get('startTime')), anchor - barsBefore * tfMs);
  assert.equal(Number(params.get('endTime')), anchor + barsAfter * tfMs);
  assert.equal(first.allCandles.length, 41);
  assert.equal(first.cutoffIndex, 20);
  assert.equal(second.cutoffIndex, 20);
});
