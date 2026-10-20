import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketRequestError, requestMarketJson, requestMarketTickers } from '../src/utils/marketRequests';
import { MarketTickerFeed } from '../server/marketTickerFeed';
import { subscribeMarketRefresh } from '../src/utils/marketRefresh';

const ticker = { symbol: 'BTCUSDT', lastPrice: '100', priceChangePercent: '2', quoteVolume: '1000', highPrice: '102', lowPrice: '98' };
const json = (data: unknown, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', ...headers },
});

test('temporary network, proxy, and JSON failures recover with one bounded retry', async () => {
  for (const failure of ['network', 'html', 408, 502, 503, 504] as const) {
    let calls = 0;
    const result = await requestMarketTickers('binance', 'futures', {
      retryDelayMs: 0,
      request: async function(this: unknown, _url, options) {
        assert.equal(this, undefined, 'browser fetch must be called without a dependency-object receiver');
        assert.equal(options?.cache, 'no-store');
        if (++calls === 1) {
          if (failure === 'network') throw new TypeError('Failed to fetch');
          if (failure === 'html') return new Response('<html>Proxy unavailable</html>');
          return json({}, failure);
        }
        return json([ticker]);
      },
    });
    assert.equal(result[0].price, 100);
    assert.equal(calls, 2);
  }
});

test('timeouts include response bodies and each retry gets a fresh signal', async () => {
  for (const stalledBody of [false, true]) {
    const signals: AbortSignal[] = [];
    const external = new AbortController();
    const result = await requestMarketJson(['/quotes'], {
      timeoutMs: 10, retryDelayMs: 0, signal: external.signal,
      request: async (_url, options) => {
        const signal = options!.signal!;
        signals.push(signal);
        if (signals.length > 1) return json({ recovered: true });
        const stalled = new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
        return stalledBody ? Object.assign(new Response(), { json: () => stalled }) : stalled;
      },
    });
    assert.deepEqual(result, { recovered: true });
    assert.equal(signals.length, 2);
    assert.equal(signals[0].aborted, true);
    assert.equal(signals[1].aborted, false);
    assert.equal(external.signal.aborted, false);
  }
});

test('cancelling during backoff prevents the next request', async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = requestMarketJson(['/quotes'], {
    signal: controller.signal, retryDelayMs: 10_000,
    request: async () => {
      calls++;
      setTimeout(() => controller.abort(), 10);
      throw new TypeError('Failed to fetch');
    },
  });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('late responses cannot become successful snapshots after cancellation', async () => {
  const controller = new AbortController();
  await assert.rejects(requestMarketJson(['/quotes'], {
    signal: controller.signal,
    request: async () => { controller.abort(); return json({ success: true }); },
  }), { name: 'AbortError' });
});

test('persistent malformed data stops after two attempts', async () => {
  let calls = 0;
  await assert.rejects(requestMarketTickers('binance', 'spot', {
    retryDelayMs: 0, request: async () => { calls++; return json({ unexpected: [] }); },
  }), /Некоректна відповідь/);
  assert.equal(calls, 2);
});

test('HTTP denials and rate limits never retry another exchange host, including HTML responses', async () => {
  for (const status of [400, 401, 403, 404, 418, 429, 451]) {
    let calls = 0;
    await assert.rejects(requestMarketTickers('bybit', 'spot', {
      retryDelayMs: 0,
      request: async () => { calls++; return new Response('<html>Denied</html>', { status }); },
    }), (error: unknown) => error instanceof MarketRequestError && error.status === status);
    assert.equal(calls, 1);
  }
});

test('Retry-After seconds and dates prevent immediate retries even for a 503', async () => {
  const now = 1_700_000_000_000;
  for (const header of ['120', new Date(now + 120_000).toUTCString()]) {
    let calls = 0;
    await assert.rejects(requestMarketJson(['/first', '/second'], {
      retryDelayMs: 0, now: () => now,
      request: async () => { calls++; return json({}, 503, { 'retry-after': header }); },
    }), (error: unknown) => error instanceof MarketRequestError && error.retryAfterMs === 120_000);
    assert.equal(calls, 1);
  }
});

test('Bybit rate limits stop immediately while temporary API errors can recover', async () => {
  let limitedCalls = 0;
  await assert.rejects(requestMarketTickers('bybit', 'futures', {
    retryDelayMs: 0, now: () => 1000,
    request: async () => {
      limitedCalls++;
      return json({ retCode: 10006 }, 200, { 'X-Bapi-Limit-Reset-Timestamp': '121000' });
    },
  }), (error: unknown) => error instanceof MarketRequestError && error.retryAfterMs === 120_000);
  assert.equal(limitedCalls, 1);
  for (const retCode of [10000, 10016]) {
    const urls: string[] = [];
    const result = await requestMarketTickers('bybit', 'spot', {
      retryDelayMs: 0,
      request: async url => {
        urls.push(String(url));
        return json(urls.length === 1 ? { retCode } : { retCode: 0, result: { list: [] } });
      },
    });
    assert.deepEqual(result, []);
    assert.equal(urls.length, 2);
    assert.notEqual(urls[0], urls[1]);
  }
});

test('concurrent consumers share the retry and only a successful fetch updates freshness', async () => {
  let calls = 0;
  let now = 1000;
  const feed = new MarketTickerFeed(async () => {
    calls++;
    if (calls === 1) throw new TypeError('connection reset');
    now = 2000;
    return json([ticker]);
  }, () => now);
  const results = await Promise.all(Array.from({ length: 4 }, () => feed.get('binance', 'futures')));
  assert.equal(calls, 2);
  results.forEach(result => assert.equal(result[0].price, 100));
  assert.deepEqual(feed.status('binance', 'futures'), {
    exchange: 'binance', marketType: 'futures', status: 'live', updatedAt: 2000,
  });
});

test('the shared feed observes cooldowns before requesting again', async () => {
  for (const source of ['http', 'bybit'] as const) {
    let calls = 0;
    let now = 1_700_000_000_000;
    const retryAt = now + 120_000;
    const feed = new MarketTickerFeed(async () => {
      calls++;
      if (calls > 1) return json(source === 'bybit' ? { retCode: 0, result: { list: [] } } : [ticker]);
      return source === 'http' ? json({}, 429, { 'retry-after': new Date(retryAt).toUTCString() })
        : json({ retCode: 10006 }, 200, { 'X-Bapi-Limit-Reset-Timestamp': String(retryAt) });
    }, () => now);
    const exchange = source === 'http' ? 'binance' : 'bybit';
    await feed.get(exchange, 'spot');
    now = retryAt - 1;
    await feed.get(exchange, 'spot');
    assert.equal(calls, 1);
    assert.equal(feed.status(exchange, 'spot').updatedAt, null);
    now = retryAt;
    await feed.get(exchange, 'spot');
    assert.equal(calls, 2);
    assert.equal(feed.status(exchange, 'spot').status, 'live');
    assert.equal(feed.status(exchange, 'spot').updatedAt, retryAt);
  }
});

test('polling pauses in background/offline and resumes on visibility/online; unmount removes listeners', () => {
  let interval: (() => void) | undefined;
  const browser = Object.assign(new EventTarget(), {
    setInterval: ((callback: () => void, ms: number) => {
      assert.equal(ms, 30_000); interval = callback; return 1;
    }) as Window['setInterval'],
    clearInterval: (_id: number | undefined) => { interval = undefined; },
  });
  const page = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  const network = { onLine: true };
  let refreshes = 0;
  const stop = subscribeMarketRefresh(() => { refreshes++; }, { window: browser, document: page, navigator: network });
  interval!();
  assert.equal(refreshes, 1);
  page.visibilityState = 'hidden';
  interval!();
  page.dispatchEvent(new Event('visibilitychange'));
  browser.dispatchEvent(new Event('online'));
  assert.equal(refreshes, 1);
  page.visibilityState = 'visible';
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshes, 2, 'returning to the tab refreshes without waiting 30 seconds');
  network.onLine = false;
  interval!();
  assert.equal(refreshes, 2);
  network.onLine = true;
  browser.dispatchEvent(new Event('online'));
  assert.equal(refreshes, 3, 'reconnecting refreshes immediately');
  stop();
  assert.equal(interval, undefined);
  page.dispatchEvent(new Event('visibilitychange'));
  browser.dispatchEvent(new Event('online'));
  assert.equal(refreshes, 3);
});
