import assert from 'node:assert/strict';
import test from 'node:test';
import { createMarketStreamIdleRelease } from '../src/components/hookchart/marketStreamIdleRelease';
import { getSharedMarketTradeMetrics, subscribeMarketTrades } from '../src/components/hookchart/marketTradeStream';

test('idle lease preserves a source during rapid remount and closes exactly once later', () => {
  let next = 0;
  const timers = new Map<number, () => void>();
  let cancelled = 0;
  let closed = 0;
  const lease = createMarketStreamIdleRelease(1500,
    callback => {
      const id = ++next;
      timers.set(id, callback);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    timer => { cancelled++; timers.delete(timer as unknown as number); },
  );
  lease.defer('binance:futures:BTCUSDT', () => { closed++; });
  assert.equal(timers.size, 1);
  lease.cancel('binance:futures:BTCUSDT');
  assert.equal(lease.pending(), 0);
  assert.equal(cancelled, 1);
  assert.equal(closed, 0);
  lease.defer('binance:futures:BTCUSDT', () => { closed++; });
  for (const [id, run] of [...timers.entries()]) {
    timers.delete(id);
    run();
  }
  assert.equal(closed, 1);
  assert.equal(lease.pending(), 0);
  assert.equal(timers.size, 0);
});

test('coin switch remount reuses its live market trade socket and dedupes trade IDs', async () => {
  const oldSocket = globalThis.WebSocket;
  const oldFetch = globalThis.fetch;
  const sockets: MockSocket[] = [];
  let seedRequests = 0;

  class MockSocket {
    static OPEN = 1;
    readyState = 1;
    onopen: ((event: any) => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    onclose: ((event: any) => void) | null = null;
    constructor(readonly url: string) {
      sockets.push(this);
      queueMicrotask(() => this.onopen?.({}));
    }
    send() {}
    close() { this.readyState = 3; this.onclose?.({}); }
    trade(id: number, timestamp: number) {
      this.onmessage?.({ data: JSON.stringify({
        e: 'aggTrade', T: timestamp, p: '100', q: '2', a: id, m: false,
      }) });
    }
  }

  (globalThis as any).WebSocket = MockSocket;
  (globalThis as any).fetch = async () => {
    seedRequests++;
    return { ok: true, json: async () => [] };
  };
  const scope = { exchange: 'binance' as const, marketType: 'futures' as const,
    symbol: 'REUSETESTUSDT' };
  let stopFirst: (() => void) | undefined;
  let stopSecond: (() => void) | undefined;
  try {
    const first: string[] = [];
    const firstVolumes: number[] = [];
    stopFirst = subscribeMarketTrades(scope, {
      onTrade: trade => { first.push(trade.id); firstVolumes.push(trade.usd); },
      onPrints: () => {},
      wantsPrints: () => false,
    });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(sockets.length, 1);
    assert.equal(getSharedMarketTradeMetrics().subscribers, 1);
    const timestamp = Date.now();
    sockets[0].trade(1, timestamp);
    assert.deepEqual(first, ['1']);
    assert.deepEqual(firstVolumes, [200]);
    stopFirst();
    stopFirst = undefined;
    assert.equal(getSharedMarketTradeMetrics().idle, 1);
    assert.equal(getSharedMarketTradeMetrics().subscribers, 0);

    const second: string[] = [];
    stopSecond = subscribeMarketTrades(scope, {
      onTrade: trade => second.push(trade.id),
      onPrints: () => {},
      wantsPrints: () => false,
    });
    assert.equal(sockets.length, 1, 'no second WS on quick rejoin');
    assert.equal(seedRequests, 1, 'no duplicate REST seed on quick rejoin');
    assert.equal(getSharedMarketTradeMetrics().idle, 0);
    assert.equal(getSharedMarketTradeMetrics().subscribers, 1);
    assert.deepEqual(second, ['1'], 'late join gets the existing trade exactly once');
    sockets[0].trade(1, timestamp);
    sockets[0].trade(2, timestamp + 1);
    assert.deepEqual(second, ['1', '2'], 'overlapping IDs never double-count');
  } finally {
    stopFirst?.();
    stopSecond?.();
    await new Promise(resolve => setTimeout(resolve, 1600));
    assert.equal(getSharedMarketTradeMetrics().scopes, 0);
    assert.equal(getSharedMarketTradeMetrics().idle, 0);
    globalThis.WebSocket = oldSocket;
    globalThis.fetch = oldFetch;
  }
});
