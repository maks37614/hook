import test from 'node:test';
import assert from 'node:assert/strict';
import { ExchangeGateway } from '../server/exchangeGateway';
import { publicMarketUrl, publicStreamUrl } from '../src/utils/exchangeEndpoints';

const json = (value: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
const price = 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT';

test('the owner can disable a provider without contacting any of its hosts', async () => {
  let calls = 0;
  const gateway = new ExchangeGateway({ disabled: ['binance'], request: async () => { calls++; return json({}); } });
  assert.equal((await gateway.fetch(price)).status, 503);
  assert.equal((await gateway.fetch(price.replace('api.binance.com', 'api1.binance.com'))).status, 503);
  assert.equal(calls, 0); assert.equal(gateway.stats()[0].disabled, true);
});

test('1000 simultaneous public readers share one request and independent response bodies', async () => {
  let calls = 0;
  const gateway = new ExchangeGateway({ request: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return json({ price: '100' }); } });
  const responses = await Promise.all(Array.from({ length: 1000 }, () => gateway.fetch(price)));
  assert.equal(calls, 1);
  assert.equal((await responses[999].json()).price, '100');
  assert.equal((await responses[0].json()).price, '100');
  assert.equal(gateway.stats()[0].shared, 999);
  await gateway.fetch(price); assert.equal(calls, 1);
});

test('cancelling one reader does not cancel a shared quote for other clients', async () => {
  let release!: () => void;
  const gateway = new ExchangeGateway({ request: async (_url, init) => { await new Promise<void>(resolve => { release = resolve; }); assert.equal(init?.signal?.aborted, false); return json({ price: '101' }); } });
  const first = new AbortController();
  const cancelled = gateway.fetch(price, { signal: first.signal });
  const other = gateway.fetch(price);
  await new Promise(resolve => setTimeout(resolve, 0));
  first.abort(); await assert.rejects(cancelled); release();
  assert.equal((await (await other).json()).price, '101');
});

test('provider cooldown stops all mirrors and market endpoints, survives restart and does not block the other exchange', async () => {
  let now = 1000, calls = 0, saved: any;
  const request: typeof fetch = async () => { calls++; return json({}, 429, { 'retry-after': '120' }); };
  const gateway = new ExchangeGateway({ request, now: () => now, saveHolds: holds => { saved = structuredClone(holds); } });
  await gateway.fetch(price);
  for (const source of ['https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&limit=70', 'https://api1.binance.com/api/v3/ticker/price?symbol=ETHUSDT', 'https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=1000']) assert.equal((await gateway.fetch(source)).status, 429);
  assert.equal(calls, 1);
  const restarted = new ExchangeGateway({ request, now: () => now, holds: saved });
  now = 120_999; await restarted.fetch(price); assert.equal(calls, 1);
  now = 121_001; await restarted.fetch(price); assert.equal(calls, 2);
  const bybit = await gateway.fetch('https://api.bybit.com/v5/market/tickers?category=spot'); assert.equal(bybit.status, 429); assert.equal(calls, 3, 'Bybit really requested; its new limit is independent');
});

test('HTML IP ban and Bybit JSON rate limits are respected without successful cache entries', async () => {
  for (const mode of ['bybit', 'html'] as const) {
    let calls = 0;
    const gateway = new ExchangeGateway({ request: async () => { calls++; return mode === 'bybit' ? json({ retCode: 10006 }) : new Response('<html>access too frequent</html>', { status: 403 }); } });
    const url = 'https://api.bybit.com/v5/market/tickers?category=linear';
    const response = await gateway.fetch(url); assert.equal(response.status, mode === 'bybit' ? 429 : 403);
    await gateway.fetch(url); assert.equal(calls, 1);
    const state = gateway.stats().find(item => item.exchange === 'bybit')!;
    assert.ok(state.pausedUntil! > Date.now() + (mode === 'bybit' ? 59_000 : 599_000)); assert.equal(state.cacheHits, 0);
  }
});

test('weighted rolling budgets and private request caps throttle distinct requests', async () => {
  let now = 1000;
  const sent: number[] = [];
  const gateway = new ExchangeGateway({ now: () => now, wait: async ms => { now += ms; }, spacingMs: 0, weightPerMinute: 10, requestsPerFiveSeconds: 100,
    request: async () => { sent.push(now); return json({ price: '10' }); } });
  for (let n = 0; n < 5; n++) await gateway.fetch(price.replace('BTCUSDT', `COIN${n}USDT`));
  assert.equal(sent[0], 1000); assert.ok(sent[2] >= 61_000); assert.ok(sent[4] >= 121_000);
  now = 1000; sent.length = 0;
  const signed = new ExchangeGateway({ now: () => now, wait: async ms => { now += ms; }, spacingMs: 0, request: async () => { sent.push(now); return json({}); } });
  for (let n = 0; n < 9; n++) await signed.fetch('https://api.bybit.com/v5/order/create', { method: 'POST', headers: { 'x-bapi-api-key': 'fixture' }, body: '{}' });
  assert.ok(sent[4] - sent[0] >= 1000); assert.ok(sent[8] - sent[4] >= 1000);
});

test('private credentials never enter shared caches and order timeouts are never retried', async () => {
  const keys: string[] = []; let calls = 0;
  const gateway = new ExchangeGateway({ spacingMs: 0, request: async (_url, init) => { keys.push(new Headers(init?.headers).get('x-mbx-apikey')!); calls++; return json({ account: calls }); } });
  for (const key of ['alice', 'bob', 'alice']) await gateway.fetch('https://api.binance.com/api/v3/account?signature=fixture', { headers: { 'x-mbx-apikey': key } });
  assert.deepEqual(keys, ['alice', 'bob', 'alice']); assert.equal(gateway.stats()[0].cacheHits, 0);
  const failed = new ExchangeGateway({ request: async () => { calls++; throw new TypeError('connection reset after request'); } });
  await assert.rejects(failed.fetch('https://api.binance.com/api/v3/order', { method: 'POST', body: '{}' }));
  assert.equal(calls, 4, 'a possibly accepted order is sent once');
});

test('funding history observes its separate five-minute quota even when the weight budget is free', async () => {
  let now = 1000; const sent: number[] = [];
  const gateway = new ExchangeGateway({ now: () => now, wait: async ms => { now += ms; }, spacingMs: 0, weightPerMinute: 1_000_000, requestsPerFiveSeconds: 1_000_000,
    request: async () => { sent.push(now); return json([]); } });
  for (let index = 0; index < 401; index++) await gateway.fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=COIN${index}USDT`);
  assert.equal(sent.length, 401); assert.ok(sent[400] - sent[0] >= 300_000);
});

test('public relays reject private routes, credentials, arbitrary hosts, ports and invalid topics', () => {
  for (const input of ['http://api.binance.com/api/v3/depth', 'https://api.binance.com:8443/api/v3/depth', 'https://127.0.0.1/api/v3/depth', 'https://api.binance.com.evil.test/api/v3/depth', 'https://api.binance.com/api/v3/account', price + '&signature=x', price + '&timestamp=123', 'https://api.bybit.com/v5/order/create', 'https://api.bybit.com/v5/market/orderbook?limit=5000']) assert.equal(publicMarketUrl(input), null, input);
  assert.equal(publicMarketUrl('https://api.bytick.com/v5/market/tickers?category=spot')?.hostname, 'api.bybit.com');
  assert.ok(publicStreamUrl('wss://fstream.binance.com/public/stream?streams=btcusdt@depth@100ms'));
  assert.ok(publicStreamUrl('wss://fstream.binance.com/market/ws/btcusdt@miniTicker'));
  assert.ok(publicStreamUrl('wss://fstream.binance.com/market/ws/' + encodeURIComponent('币安人生usdt') + '@aggTrade'));
  assert.equal(publicStreamUrl('wss://fstream.binance.com/market/ws/%GG@ticker'), null);
  assert.equal(publicStreamUrl('wss://stream.bybit.com/v5/private'), null);
  assert.equal(publicStreamUrl('wss://evil.test/ws/btcusdt@ticker'), null);
});

test('the shared catalog can load under chart pressure without increasing the venue budget', async () => {
  let now = 1000; const sent: { path: string; at: number }[] = [];
  const gateway = new ExchangeGateway({ now: () => now, wait: async ms => { now += ms; }, spacingMs: 0, requestsPerFiveSeconds: 1000,
    request: async input => { sent.push({ path: new URL(String(input)).pathname, at: now }); return json({}); } });
  for (let n = 0; n < 34; n++) await gateway.fetch(`https://fapi.binance.com/fapi/v1/aggTrades?symbol=COIN${n}USDT`);
  await gateway.fetch(price); // Ordinary traffic has consumed 855 of the existing 900 budget.
  assert.equal(now, 1000);
  await gateway.fetch('https://api.binance.com/api/v3/exchangeInfo');
  await gateway.fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
  assert.equal(now, 1000, 'Broad metadata has a reserved part of the same budget');
  await gateway.fetch(price.replace('BTCUSDT', 'ETHUSDT'));
  assert.ok(now >= 61000, 'Ordinary traffic still waits for the rolling budget');
  assert.deepEqual(sent.slice(-3).map(row => row.path), ['/api/v3/exchangeInfo', '/fapi/v1/exchangeInfo', '/api/v3/ticker/price']);
});
