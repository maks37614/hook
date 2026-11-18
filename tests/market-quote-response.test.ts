import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { gunzipSync } from 'node:zlib';
import express from 'express';
import { PublicQuoteResponseCache, PublicQuoteCapacityError, installMarketQuoteRoutes } from '../server/marketQuoteResponse';

const source = { exchange: 'binance' as const, marketType: 'futures' as const,
  status: 'live' as const, updatedAt: 1700000000000 };
const selection = { exchange: 'all' as const, marketType: 'all' as const,
  minVolumeUsd: 0, maxVolumeUsd: Number.MAX_VALUE };

function fixtures() {
  let requests = 0;
  const coins = [{
    symbol: 'BTCUSDT', exchange: 'binance' as const, marketType: 'futures' as const,
    price: 100, volumeUsd: 50_000_000, high24h: 110, low24h: 90, exchangeUrl: 'https://binance.com',
    // Repetitive payload makes gzip savings comparable to a real public coin list.
    label: 'Bitcoin '.repeat(1000),
  }];
  return {
    dependencies: {
      fetchCoins: async (_selection: any) => {
        requests++;
        await new Promise(resolve => setTimeout(resolve, 5));
        return coins as any;
      },
      sourceStatuses: (_selection: any) => [source],
    },
    count: () => requests,
  };
}

test('100 parallel browser readers share a single public JSON serialization and gzip', async () => {
  let now = 1000;
  const mock = fixtures();
  const cache = new PublicQuoteResponseCache(mock.dependencies, () => now);
  const results = await Promise.all(Array.from({ length: 100 }, () => cache.get(selection)));
  assert.equal(mock.count(), 1);
  assert.equal(results.length, 100);
  assert.equal(results[0].raw.toString(), results[99].raw.toString());
  assert.equal(results[0].compressed && gunzipSync(results[0].compressed).toString(),
    results[0].raw.toString());
  assert.ok((results[0].compressed?.length || Infinity) < results[0].raw.length);
  assert.equal(cache.stats().generated, 1);
  assert.ok(cache.stats().concurrentShared > 0);

  now += 1000;
  await cache.get(selection);
  assert.equal(mock.count(), 1);
  now += 2000;
  await cache.get(selection);
  assert.equal(mock.count(), 2, 'expired quote snapshot re-renders with no long-term staleness');
});

test('API gzip and plain responses have exact same fields and source warning metadata', async () => {
  const app = express();
  const mock = fixtures();
  installMarketQuoteRoutes(app, new PublicQuoteResponseCache(mock.dependencies));
  const server = app.listen(0, '127.0.0.1');
  const read = async (path: string, encoding: string) => {
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    return new Promise<{ status: number; headers: any; buffer: Buffer }>((resolve, reject) => {
      const req = httpRequest({
        hostname: '127.0.0.1', port: addr.port, path, method: 'GET',
        headers: { 'Accept-Encoding': encoding },
      }, response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.from(chunk)));
        response.on('end', () => resolve({
          status: response.statusCode || 0, headers: response.headers, buffer: Buffer.concat(chunks),
        }));
        response.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    });
  };
  try {
    await new Promise<void>(resolve => server.once('listening', resolve));
    const path = '/api/market/quotes?exchange=all&marketType=all&minVolume=0';
    const plain = await read(path, 'identity');
    const compressed = await read(path, 'gzip, deflate, br');
    const disabled = await read(path, 'gzip;q=0, identity;q=1');
    const legacyAlias = await read('/api/screener/coins?exchange=all&marketType=all&minVolume=0', 'gzip');
    assert.equal(plain.status, 200);
    assert.equal(compressed.status, 200);
    assert.equal(legacyAlias.status, 200, 'the original legacy screener alias still works');
    assert.equal(compressed.headers['content-encoding'], 'gzip');
    assert.ok(plain.headers.etag && compressed.headers.etag);
    assert.notEqual(plain.headers.etag, compressed.headers.etag,
      'compressed and plain representations use different strong ETags');
    assert.equal(compressed.headers['vary'], 'Accept-Encoding');
    assert.equal(compressed.headers['cache-control'], 'no-store');
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.equal(disabled.headers['content-encoding'], undefined);
    assert.deepEqual(JSON.parse(gunzipSync(compressed.buffer).toString()), JSON.parse(plain.buffer.toString()));
    assert.deepEqual(JSON.parse(disabled.buffer.toString()), JSON.parse(plain.buffer.toString()));
    assert.deepEqual(JSON.parse(gunzipSync(legacyAlias.buffer).toString()),
      JSON.parse(plain.buffer.toString()), 'the legacy endpoint must keep all coin fields');
    assert.equal(mock.count(), 1, 'different browser compression options share the same data');
    const badQuery = await read('/api/market/quotes?exchange=invalid&minVolume=0', 'gzip');
    assert.equal(badQuery.status, 400);
    assert.equal(JSON.parse(badQuery.buffer.toString()).success, false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

test('unavailable exchange sources remain HTTP 503 with unchanged response contract', async () => {
  const cache = new PublicQuoteResponseCache({
    fetchCoins: async () => [],
    sourceStatuses: () => [{ exchange: 'bybit', marketType: 'spot', status: 'unavailable',
      updatedAt: null, error: 'source offline' }],
  });
  const snapshot = await cache.get(selection);
  assert.equal(snapshot.httpStatus, 503);
  const payload = JSON.parse(snapshot.raw.toString());
  assert.equal(payload.success, false);
  assert.equal(payload.partial, true);
  assert.equal(payload.count, 0);
  assert.equal(payload.sources[0].status, 'unavailable');
  assert.match(payload.error, /source offline/);
});

test('bounded quote response cache does not grow across arbitrary user filters', async () => {
  const cache = new PublicQuoteResponseCache(fixtures().dependencies, Date.now, 2000, 3);
  for (let i = 0; i < 20; i++)
    await cache.get({ ...selection, minVolumeUsd: i * 100 });
  assert.equal(cache.stats().cachedSelections, 3);
});

test('operator can disable gzip without altering screener JSON fields', async () => {
  const previous = process.env.H00K_QUOTE_GZIP;
  try {
    process.env.H00K_QUOTE_GZIP = '0';
    const cache = new PublicQuoteResponseCache(fixtures().dependencies);
    const snapshot = await cache.get(selection);
    assert.equal(snapshot.compressed, null);
    assert.equal(JSON.parse(snapshot.raw.toString()).success, true);
  } finally {
    if (previous === undefined) delete process.env.H00K_QUOTE_GZIP;
    else process.env.H00K_QUOTE_GZIP = previous;
  }
});


test('many unique filters cannot exhaust memory through unbounded concurrent response builds', async () => {
  let unblock!: () => void;
  const wait = new Promise<void>(resolve => { unblock = resolve; });
  let calls = 0;
  const cache = new PublicQuoteResponseCache({
    fetchCoins: async () => {
      calls++;
      await wait;
      return [];
    },
    sourceStatuses: () => [source],
  }, Date.now, 2000, 3);

  const running = [1, 2, 3].map(i =>
    cache.get({ ...selection, minVolumeUsd: i }));
  // Same-filter followers must join an in-flight build even when the
  // distinct-filter limit is already reached.
  const followers = Array.from({ length: 30 }, () =>
    cache.get({ ...selection, minVolumeUsd: 1 }));
  await assert.rejects(cache.get({ ...selection, minVolumeUsd: 4 }),
    error => error instanceof PublicQuoteCapacityError);
  assert.equal(cache.stats().inFlight, 3);
  assert.equal(cache.stats().overloaded, 1);
  assert.equal(calls, 3, 'do not start work for rejected variant');
  unblock();
  await Promise.all([...running, ...followers]);
  assert.equal(cache.stats().inFlight, 0);
  assert.ok(cache.stats().concurrentShared >= 30);
  await cache.get({ ...selection, minVolumeUsd: 4 });
  assert.equal(calls, 4, 'new filters become available after inflight work finishes');
});
