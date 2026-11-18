import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDesktopQuoteBridge, DESKTOP_QUOTE_TTL_MS,
  type DesktopQuoteChannel, type DesktopQuoteLock,
} from '../src/utils/desktopMarketQuotes';
import type { MarketCoinSnapshot } from '../src/utils/marketCoinLoader';

const sample: MarketCoinSnapshot = {
  coins: [{ symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures',
    price: 50000, volumeUsd: 123456 } as MarketCoinSnapshot['coins'][number]],
  timestamp: 1_000,
  warning: null,
};
const abort = () => new AbortController().signal;
const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

class Bus {
  private clients = new Set<{ listeners: Set<(event: MessageEvent<unknown>) => void> }>();

  channel(): DesktopQuoteChannel {
    const client = { listeners: new Set<(event: MessageEvent<unknown>) => void>() };
    this.clients.add(client);
    return {
      postMessage: (message: unknown) => {
        for (const other of this.clients) {
          if (other === client) continue;
          queueMicrotask(() => {
            for (const listener of other.listeners) {
              listener({ data: message } as MessageEvent<unknown>);
            }
          });
        }
      },
      addEventListener: (_name, listener) => { client.listeners.add(listener); },
      removeEventListener: (_name, listener) => { client.listeners.delete(listener); },
    };
  }
}

class LockQueue {
  private tail = new Map<string, Promise<void>>();
  readonly run: DesktopQuoteLock = async (key, task, signal) => {
    const previous = this.tail.get(key) || Promise.resolve();
    let release!: () => void;
    const done = new Promise<void>(resolve => { release = resolve; });
    this.tail.set(key, previous.then(() => done));
    await previous;
    try {
      signal.throwIfAborted();
      return await task();
    } finally {
      release();
    }
  };
}

test('simultaneous Desktop windows coalesce one public quote fetch via Web Locks', async () => {
  const bus = new Bus();
  const locks = new LockQueue();
  const a = createDesktopQuoteBridge({ channel: bus.channel(), lock: locks.run, now: () => 10_000 });
  const b = createDesktopQuoteBridge({ channel: bus.channel(), lock: locks.run, now: () => 10_000 });
  let requests = 0;
  const fetchFresh = async () => { requests++; await sleep(6); return sample; };
  try {
    const [first, second] = await Promise.all([
      a.read('["all","all"]', fetchFresh, abort()),
      b.read('["all","all"]', fetchFresh, abort()),
    ]);
    assert.deepEqual(first, sample);
    assert.deepEqual(second, sample);
    assert.equal(requests, 1, 'two Chromium windows should not download the same quote payload');
  } finally { a.close(); b.close(); }
});

test('a newly opened Desktop window can receive a fresh snapshot from an existing pane', async () => {
  const bus = new Bus();
  const a = createDesktopQuoteBridge({ channel: bus.channel(), now: () => 10_000 });
  let fetches = 0;
  await a.read('["binance","futures"]', async () => { fetches++; return sample; }, abort());
  const b = createDesktopQuoteBridge({ channel: bus.channel(), now: () => 10_000 });
  try {
    const result = await b.read('["binance","futures"]', async () => { fetches++; return sample; }, abort());
    assert.deepEqual(result, sample);
    assert.equal(fetches, 1);
  } finally { a.close(); b.close(); }
});

test('snapshots expire quickly; a market selection can never reuse another selection', async () => {
  const bus = new Bus();
  let clock = 10_000;
  const instance = createDesktopQuoteBridge({ channel: bus.channel(), now: () => clock });
  let fetches = 0;
  const fetchFresh = async () => { fetches++; return sample; };
  try {
    await instance.read('["binance","spot"]', fetchFresh, abort());
    await instance.read('["binance","spot"]', fetchFresh, abort());
    assert.equal(fetches, 1);
    await instance.read('["bybit","futures"]', fetchFresh, abort());
    assert.equal(fetches, 2, 'exchange and market are part of the cache key');
    clock += DESKTOP_QUOTE_TTL_MS + 1;
    await instance.read('["binance","spot"]', fetchFresh, abort());
    assert.equal(fetches, 3, 'no stale quotes after the short desktop TTL');
  } finally { instance.close(); }
});

test('missing peer channel bypasses Web Locks and uses ordinary fetch', async () => {
  let attemptedLock = false;
  const instance = createDesktopQuoteBridge({
    channel: null,
    lock: async (_key, task) => { attemptedLock = true; return task(); },
  });
  try {
    const value = await instance.read('["all","all"]', async () => sample, abort());
    assert.deepEqual(value, sample);
    assert.equal(attemptedLock, false, 'never serialize windows if sharing is unavailable');
  } finally { instance.close(); }
});

test('aborted Desktop quote requests never proceed to exchange fallback', async () => {
  const instance = createDesktopQuoteBridge({ channel: new Bus().channel() });
  const controller = new AbortController();
  let calls = 0;
  try {
    const pending = instance.read('["all","all"]', async () => { calls++; return sample; }, controller.signal);
    controller.abort(new Error('cancelled'));
    await assert.rejects(pending, /cancelled/);
    assert.equal(calls, 0);
  } finally { instance.close(); }
});

test('malformed cross-window messages cannot poison public quote snapshots', async () => {
  const bus = new Bus();
  const instance = createDesktopQuoteBridge({ channel: bus.channel() });
  const sender = bus.channel();
  sender.postMessage({ type: 'snapshot', key: '["all","all"]',
    receivedAt: Date.now(), snapshot: { coins: [], timestamp: 'bad', warning: null } });
  await Promise.resolve();
  let fetched = false;
  try {
    await instance.read('["all","all"]', async () => { fetched = true; return sample; }, abort());
    assert.equal(fetched, true);
  } finally { instance.close(); }
});
