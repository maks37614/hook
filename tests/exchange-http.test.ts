import test from 'node:test';
import assert from 'node:assert/strict';
import { ExchangeHttpManager, ExchangeBudgetError } from '../server/exchangeHttp';

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, { status, headers });

test('identical concurrent exchange GETs share a single request, but each consumer gets its own body', async () => {
  let calls = 0;
  const manager = new ExchangeHttpManager(async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 10));
    return json({ price: '100' });
  });
  const url = 'https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT';
  const responses = await Promise.all(Array.from({ length: 50 }, () => manager.fetch(url)));
  const bodies = await Promise.all(responses.map(r => r.json()));
  assert.equal(calls, 1);
  assert.equal(bodies.length, 50);
  assert.ok(bodies.every(row => row.price === '100'));
  assert.equal(manager.stats().find(x => x.scope === 'binance-futures')?.requests, 1);
});

test('Binance 429 starts a shared per-market cooldown across mirror hosts and honors Retry-After', async () => {
  let clock = 1000;
  let calls = 0;
  const manager = new ExchangeHttpManager(async () => {
    calls++;
    return json({}, calls === 1 ? 429 : 200, { 'retry-after': '120' });
  }, () => clock);
  const first = await manager.fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
  assert.equal(first.status, 429);
  await assert.rejects(
    manager.fetch('https://data-api.binance.vision/api/v3/ticker/price?symbol=ETHUSDT'),
    ExchangeBudgetError,
  );
  assert.equal(calls, 1);
  clock += 120_001;
  assert.equal((await manager.fetch('https://data-api.binance.vision/api/v3/ticker/price?symbol=ETHUSDT')).status, 200);
  assert.equal(calls, 2);
});

test('Bybit retCode 10006 blocks additional requests even when HTTP reports success', async () => {
  let calls = 0;
  const manager = new ExchangeHttpManager(async () => {
    calls++;
    return json({ retCode: 10006, retMsg: 'rate limit' });
  });
  const a = await manager.fetch('https://api.bybit.com/v5/market/tickers?category=linear');
  assert.equal((await a.json()).retCode, 10006);
  await assert.rejects(
    manager.fetch('https://api.bytick.com/v5/market/tickers?category=spot'),
    ExchangeBudgetError,
  );
  assert.equal(calls, 1);
  assert.equal(manager.stats().find(x => x.scope === 'bybit')?.rateLimited, 1);
});

test('403 and 451 stop automatic mirror retries, not only 429', async () => {
  for (const status of [403, 451, 418]) {
    let calls = 0;
    const manager = new ExchangeHttpManager(async () => { calls++; return json({}, status); });
    await manager.fetch('https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m');
    await assert.rejects(manager.fetch('https://fapi1.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=5m'));
    assert.equal(calls, 1);
  }
});

test('observes Binance IP weight response header and exposes non-sensitive aggregate stats', async () => {
  const manager = new ExchangeHttpManager(async () => json([], 200, { 'X-MBX-USED-WEIGHT-1M': '223' }));
  await manager.fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m');
  const stat = manager.stats().find(s => s.scope === 'binance-spot');
  assert.equal(stat?.observedWeight1m, 223);
  assert.ok((stat?.estimatedWindowWeight || 0) > 0);
});

test('non-exchange traffic passes through untouched', async () => {
  let calls = 0;
  const manager = new ExchangeHttpManager(async () => { calls++; return json({ ok: true }); });
  await manager.fetch('https://example.org/unrelated');
  await manager.fetch('https://example.org/unrelated');
  assert.equal(calls, 2);
});

test('respects high Binance IP weight reported by exchange even when local process used little', async () => {
  let clock = 1_000, calls = 0;
  const manager = new ExchangeHttpManager(async () => {
    calls++;
    return json({}, 200, { 'X-MBX-USED-WEIGHT-1M': calls === 1 ? '3500' : '100' });
  }, () => clock);
  const a = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m';
  const b = 'https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1m';
  await manager.fetch(a);
  await assert.rejects(manager.fetch(b), ExchangeBudgetError);
  assert.equal(calls, 1);
  clock += 16_000;
  assert.equal((await manager.fetch(b)).status, 200);
  assert.equal(calls, 2);
});

test('one user aborting a coalesced public REST request does not fail another user', async () => {
  let requests = 0, upstreamAborts = 0;
  let finish!: () => void;
  const manager = new ExchangeHttpManager(async (_url, init) => {
    requests++;
    return new Promise<Response>((resolve, reject) => {
      finish = () => resolve(json({ price: '125' }));
      init?.signal?.addEventListener('abort', () => {
        upstreamAborts++;
        reject(new Error('upstream aborted'));
      });
    });
  });
  const url = 'https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT';
  const controller = new AbortController();
  const first = manager.fetch(url, { signal: controller.signal });
  const second = manager.fetch(url);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(requests, 1);
  controller.abort(new Error('user closed page'));
  await assert.rejects(first, /user closed page/);
  assert.equal(upstreamAborts, 0, 'the shared upstream must remain active for the second user');
  finish();
  assert.equal((await (await second).json()).price, '125');
  assert.equal(requests, 1);
});

test('exchange HTTP limits cap simultaneous independent public requests under heavy concurrency', async () => {
  let active = 0, peak = 0;
  const manager = new ExchangeHttpManager(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 3));
    active--;
    return json({ ok: true });
  });
  const responses = await Promise.all(Array.from({ length: 80 }, (_, i) =>
    manager.fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=T${i}USDT`)));
  assert.equal(responses.length, 80);
  assert.ok(peak <= 8, `more than eight concurrent exchange requests: ${peak}`);
  assert.equal(manager.stats().find(x => x.scope === 'bybit')?.requests, 80);
});

test('USD-M Futures request estimates retain safety margin without starving charts', async () => {
  const manager = new ExchangeHttpManager(async () => json({ ok: true }, 200, {
    'X-MBX-USED-WEIGHT-1M': '12',
  }));
  // Fourteen routine snapshots fill the 420-weight background allowance.
  for (let i = 0; i < 14; i++) {
    await manager.fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=TEST${i}USDT&limit=1000`);
  }
  // A fifteenth snapshot requested by an open chart can still use protected
  // headroom, together with its candle history and 24-hour trade count.
  await manager.fetch('https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=1000', undefined, 'chart');
  await manager.fetch('https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=20', undefined, 'chart');
  await manager.fetch('https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT', undefined, 'chart');
  const stat = manager.stats().find(s => s.scope === 'binance-futures');
  assert.equal(stat?.requests, 17);
  assert.equal(stat?.estimatedWindowWeight, 15 * 30 + 2 + 2);
  assert.ok((stat?.estimatedWindowWeight || 0) < 600);
  assert.equal(stat?.observedWeight1m, 12);
});

test('chart retains protected REST capacity after scanners saturate the background allowance', async () => {
  let requests = 0;
  const manager = new ExchangeHttpManager(async () => {
    requests++;
    return json({ ok: true }, 200, { 'X-MBX-USED-WEIGHT-1M': String(requests * 20) });
  });
  const base = 'https://fapi.binance.com/fapi/v1/';
  // 14 depth-1000 snapshots consume 420 of the 600 locally budgeted
  // Futures weight units. This was enough to block all subsequent chart data.
  for (let i = 0; i < 14; i++) {
    await manager.fetch(`${base}depth?symbol=BACKGROUND${i}USDT&limit=1000`);
  }
  // Background work must stop before it consumes chart headroom.
  const chartDepthUrl = `${base}depth?symbol=BTCUSDT&limit=1000`;
  // Simulate a background request for the exact same URL becoming queued;
  // the chart must not join and inherit that rejected background request.
  await assert.rejects(manager.fetch(chartDepthUrl, {
    signal: AbortSignal.timeout(100),
  }));
  // Opening a chart may spend the reserved headroom, but still shares the
  // exact same hard exchange budget, header-based guard and concurrency.
  assert.equal((await manager.fetch(chartDepthUrl, undefined, 'chart')).status, 200);
  assert.equal((await manager.fetch(`${base}klines?symbol=BTCUSDT&limit=20`, undefined, 'chart')).status, 200);
  assert.equal((await manager.fetch(`${base}ticker/24hr?symbol=BTCUSDT`, undefined, 'chart')).status, 200);
  const stat = manager.stats().find(s => s.scope === 'binance-futures');
  assert.equal(requests, 17);
  assert.equal(stat?.estimatedWindowWeight, 420 + 30 + 2 + 2);
  assert.equal(stat?.rateLimited, 0); // no upstream 429/403/451 was observed
});

test('chart reservation cannot bypass exchange-observed IP headroom or cooldown', async () => {
  let calls = 0;
  const manager = new ExchangeHttpManager(async () => {
    calls++;
    return json({}, 200, { 'X-MBX-USED-WEIGHT-1M': '1250' });
  });
  await manager.fetch('https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&limit=20', undefined, 'chart');
  await assert.rejects(manager.fetch('https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT',
    undefined, 'chart'), ExchangeBudgetError);
  assert.equal(calls, 1);
});
