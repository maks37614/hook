import test from 'node:test';
import assert from 'node:assert/strict';
import { ExchangeHttpManager, exchangeHttp } from '../server/exchangeHttp';
import { fetchHookChartOIHistory } from '../server/hookchartOI';

const now = 1_794_264_600_000;

function bybitResponse(url: URL): Response {
  if (url.pathname.endsWith('/open-interest')) {
    return Response.json({ retCode: 0, result: { list: [
      { timestamp: String(now), openInterest: '10' },
    ] } });
  }
  return Response.json({ retCode: 0, result: { list: [
    [String(now), '75000', '75000', '75000', '75000'],
    [String(now - 300_000), '75000', '75000', '75000', '75000'],
  ] } });
}

// Exercise the production budget path with fixture HTTP responses. The normal
// offline harness bypasses this singleton so unrelated tests cannot exhaust it.
function useManager(t: test.TestContext, manager: ExchangeHttpManager): void {
  const offline = process.env.H00K_OFFLINE_TESTS;
  delete process.env.H00K_OFFLINE_TESTS;
  t.mock.method(exchangeHttp, 'fetch', manager.fetch.bind(manager));
  t.after(() => {
    if (offline === undefined) delete process.env.H00K_OFFLINE_TESTS;
    else process.env.H00K_OFFLINE_TESTS = offline;
  });
}

test('HookChart OI can use chart headroom after scanners fill the background budget', async t => {
  let binanceHistoryRequests = 0;
  const manager = new ExchangeHttpManager(async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/openInterestHist')) {
      binanceHistoryRequests++;
      return Response.json([{ timestamp: now, sumOpenInterestValue: '7427304568.897642' }]);
    }
    if (url.hostname === 'api.bybit.com') return bybitResponse(url);
    return Response.json({});
  });
  for (let i = 0; i < 14; i++) {
    await manager.fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=SCAN${i}USDT&limit=1000`);
  }
  assert.equal(manager.stats().find(row => row.scope === 'binance-futures')?.estimatedWindowWeight, 420);
  useManager(t, manager);

  const [result, shared] = await Promise.all([
    fetchHookChartOIHistory('BTCUSDT', '5m'),
    fetchHookChartOIHistory('BTCUSDT', '5m'),
  ]);
  assert.deepEqual(result.binance, [{ t: now, v: 7427304568.897642 }]);
  assert.deepEqual(result.bybit, [{ t: now, v: 750_000 }]);
  assert.deepEqual(shared, result);
  assert.equal(binanceHistoryRequests, 1, 'concurrent charts share one historical request');
  await fetchHookChartOIHistory('BTCUSDT', '5m');
  assert.equal(binanceHistoryRequests, 1, 'successful history remains cached');
  const stats = manager.stats().find(row => row.scope === 'binance-futures')!;
  assert.equal(stats.estimatedWindowWeight, 425);
  assert.equal(stats.rejected, 0);
});

test('HookChart OI respects Binance cooldown and identifies partial-source failures', async t => {
  let binanceRequests = 0;
  const manager = new ExchangeHttpManager(async input => {
    const url = new URL(String(input));
    if (url.hostname === 'fapi.binance.com') {
      binanceRequests++;
      return Response.json({ code: -1003 }, { status: 429 });
    }
    return bybitResponse(url);
  });
  const warnings = t.mock.method(console, 'warn', () => {});
  useManager(t, manager);

  const partial = await fetchHookChartOIHistory('ETHUSDT', '5m');
  assert.deepEqual(partial.binance, []);
  assert.equal(partial.bybit.length, 1);
  assert.deepEqual(warnings.mock.calls[0].arguments[1], {
    source: 'binance', symbol: 'ETHUSDT', period: '5m',
    error: 'Error: Open interest source HTTP 429',
  });

  const duringCooldown = await fetchHookChartOIHistory('SOLUSDT', '5m');
  assert.deepEqual(duringCooldown.binance, []);
  assert.equal(duringCooldown.bybit.length, 1);
  assert.equal(binanceRequests, 1, 'chart requests must not bypass the exchange cooldown');
  assert.match(warnings.mock.calls[1].arguments[1].error, /ExchangeBudgetError:.*cooling down/);
});

test('HookChart OI rejects a complete source outage and records each failed source', async t => {
  const manager = new ExchangeHttpManager(async () => Response.json({}, { status: 503 }));
  const warnings = t.mock.method(console, 'warn', () => {});
  useManager(t, manager);

  await assert.rejects(fetchHookChartOIHistory('XRPUSDT', '15m'), /Open interest unavailable/);
  assert.deepEqual(warnings.mock.calls.map(call => call.arguments[1].source), [
    'binance', 'bybit', 'bybit-price',
  ]);
  assert.ok(warnings.mock.calls.every(call => /HTTP 503/.test(call.arguments[1].error)));
});

test('HTTP 200 Bybit API errors are logged instead of silently returning an empty series', async t => {
  const manager = new ExchangeHttpManager(async input => {
    const url = new URL(String(input));
    return url.hostname === 'fapi.binance.com'
      ? Response.json([{ timestamp: now, sumOpenInterestValue: '5000' }])
      : Response.json({ retCode: 10006, retMsg: 'Too many visits' });
  });
  const warnings = t.mock.method(console, 'warn', () => {});
  useManager(t, manager);
  const partial = await fetchHookChartOIHistory('APICODEUSDT', '5m');
  assert.equal(partial.binance.length, 1);
  assert.deepEqual(partial.bybit, []);
  assert.ok(warnings.mock.calls.some(call => call.arguments[1].source === 'bybit'
    && /API 10006/.test(call.arguments[1].error)));
});

test('invalid HTTP 200 Binance and Bybit payloads identify the failed source', async t => {
  for (const source of ['binance', 'bybit', 'bybit-price']) await t.test(source, async child => {
    const manager = new ExchangeHttpManager(async input => {
      const url = new URL(String(input));
      if (url.hostname === 'fapi.binance.com') return Response.json(source === 'binance'
        ? { code: -1121 } : [{ timestamp: now, sumOpenInterestValue: '5000' }]);
      const selected = url.pathname.endsWith('/kline') ? 'bybit-price' : 'bybit';
      return selected === source ? Response.json({ retCode: 0, result: { list: [null] } }) : bybitResponse(url);
    });
    const warnings = child.mock.method(console, 'warn', () => {});
    useManager(child, manager);
    const result = await fetchHookChartOIHistory(`BAD${source.replace('-', '').toUpperCase()}USDT`, '5m');
    assert.ok(result.binance.length || result.bybit.length);
    assert.ok(warnings.mock.calls.some(call => call.arguments[1].source === source
      && /API -1121|invalid response/.test(call.arguments[1].error)));
  });
});
