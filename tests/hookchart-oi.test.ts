import test from 'node:test';
import assert from 'node:assert/strict';
import { bybitOIToUsd, fetchHookChartOIHistory, normalizeOIHistory, oiHistoryPeriod } from '../server/hookchartOI';

test('open interest periods map to supported exchange intervals', () => {
  assert.deepEqual(oiHistoryPeriod('1m'), { binance: '5m', bybit: '5min', interval: '5' });
  assert.deepEqual(oiHistoryPeriod('4h'), { binance: '4h', bybit: '4h', interval: '240' });
  assert.deepEqual(oiHistoryPeriod('invalid'), oiHistoryPeriod('5m'));
});

test('historical OI is ordered and Bybit quantities use matching historical USD prices', () => {
  assert.deepEqual(normalizeOIHistory([{ t: 20, v: 2 }, { t: 10, v: 1 }, { t: 20, v: 3 }, { t: NaN, v: 4 }, { t: 30, v: -1 }]), [{ t: 10, v: 1 }, { t: 20, v: 3 }]);
  const converted = bybitOIToUsd([{ timestamp: '2000', openInterest: '4' }, { timestamp: '1000', openInterest: '3' }, { timestamp: '500', openInterest: '5' }], [['2000', '0', '0', '0', '12'], ['1000', '0', '0', '0', '10']]);
  assert.deepEqual(converted, [{ t: 1000, v: 30 }, { t: 2000, v: 48 }]);
});

test('OI API supports Unicode symbols, tolerates one failed exchange and deduplicates requests', async () => {
  const originalFetch = globalThis.fetch;
  const calls: URL[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input)); calls.push(url);
    if (url.hostname.includes('binance')) return new Response(JSON.stringify([{ timestamp: '1000', sumOpenInterestValue: '123' }]), { status: 200 });
    return new Response('{}', { status: 503 });
  };
  try {
    const [first, second] = await Promise.all([fetchHookChartOIHistory('龙虾/USDT', '1h'), fetchHookChartOIHistory('龙虾USDT', '1h')]);
    assert.deepEqual(first, { binance: [{ t: 1000, v: 123 }], bybit: [] });
    assert.deepEqual(second, first);
    assert.equal(calls.length, 3);
    assert.ok(calls.every(url => url.searchParams.get('symbol') === '龙虾USDT'));
    await fetchHookChartOIHistory('龙虾USDT', '1h');
    assert.equal(calls.length, 3, 'cached history does not re-query exchanges');
  } finally { globalThis.fetch = originalFetch; }
});

test('OI API reports unavailable data instead of substituting fabricated values', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 503 });
  try { await assert.rejects(fetchHookChartOIHistory('UNAVAILABLEUSDT', '1h'), /unavailable/); }
  finally { globalThis.fetch = originalFetch; }
});
