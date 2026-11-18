import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeMarketTrades } from '../src/components/hookchart/marketTradeStream';

type Timer = { run: () => void; delay: number };
class FakeBybitSocket {
  static OPEN = 1;
  static instances: FakeBybitSocket[] = [];
  readyState = 1;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(readonly url: string) { FakeBybitSocket.instances.push(this); }
  send(message: string) { this.sent.push(message); }
  close() { this.readyState = 3; this.onclose?.(); }
}

test('stale socket closes do not stop a newer Bybit heartbeat; unstable opens back off', async () => {
  const saved = {
    fetch: globalThis.fetch,
    WebSocket: globalThis.WebSocket,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    now: Date.now,
  };
  let now = 2_000_000_000_000;
  let nextTimerId = 0;
  const timeouts = new Map<number, Timer>();
  const intervals = new Map<number, Timer>();
  let unsubscribe: (() => void) | undefined;

  try {
    Date.now = () => now;
    FakeBybitSocket.instances = [];
    globalThis.fetch = async () => Response.json({ retCode: 0, result: { list: [] } });
    globalThis.WebSocket = FakeBybitSocket as unknown as typeof WebSocket;

    globalThis.setTimeout = ((fn: () => void, delay: number) => {
      const id = ++nextTimerId;
      timeouts.set(id, { run: fn, delay });
      return id;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((id: number) => { timeouts.delete(id); }) as unknown as typeof clearTimeout;
    globalThis.setInterval = ((fn: () => void, delay: number) => {
      const id = ++nextTimerId;
      intervals.set(id, { run: fn, delay });
      return id;
    }) as unknown as typeof setInterval;
    globalThis.clearInterval = ((id: number) => { intervals.delete(id); }) as unknown as typeof clearInterval;

    const nextRetry = (): number => {
      const candidates = [...timeouts].filter(([, timer]) => timer.delay < 7_000);
      assert.equal(candidates.length, 1, 'one pending reconnect for the shared Bybit market');
      const [id, timer] = candidates[0];
      timeouts.delete(id);
      timer.run();
      return timer.delay;
    };

    unsubscribe = subscribeMarketTrades(
      { exchange: 'bybit', marketType: 'futures', symbol: 'HEARTBEATUSDT' },
      { onTrade: () => {}, onPrints: () => {} },
    );
    const first = FakeBybitSocket.instances[0];
    assert.ok(first);
    first.onopen?.();
    assert.equal(intervals.size, 1, 'initial connection creates exactly one ping interval');

    first.close();
    assert.equal(intervals.size, 0, 'closing the current socket clears its ping');
    const firstDelay = nextRetry();
    assert.ok(firstDelay >= 1_000 && firstDelay <= 2_000);
    const second = FakeBybitSocket.instances[1];
    assert.ok(second);
    second.onopen?.();
    assert.equal(intervals.size, 1);

    // The browser may deliver a delayed duplicate close from the first
    // socket AFTER the replacement's onopen handler. It must be a no-op.
    first.onclose?.();
    assert.equal(intervals.size, 1, 'old close must not cancel replacement ping');
    assert.ok([...timeouts.values()].every(timer => timer.delay >= 7_000),
      'stale socket must not schedule another reconnect');
    [...intervals.values()][0].run();
    assert.ok(second.sent.some(payload => JSON.parse(payload).op === 'ping'),
      'replacement websocket must keep sending heartbeats');

    second.close();
    assert.equal(intervals.size, 0);
    const secondDelay = nextRetry();
    assert.ok(secondDelay >= 2_000 && secondDelay <= 3_000,
      'a successfully opened socket that closes immediately must preserve backoff');

    const third = FakeBybitSocket.instances[2];
    third.onopen?.();
    assert.equal(intervals.size, 1);
    now += 31_000;
    third.close();
    const recoveredDelay = nextRetry();
    assert.ok(recoveredDelay >= 1_000 && recoveredDelay <= 2_000,
      'after a stable 30-second connection the retry budget is reset');

    const fourth = FakeBybitSocket.instances[3];
    fourth.onopen?.();
    assert.equal(intervals.size, 1);
    unsubscribe();
    unsubscribe = undefined;
    // A last subscriber intentionally leaves the transport alive for 1.5s
    // to avoid a reconnect storm when fullscreen/Terminal swaps charts.
    assert.equal(intervals.size, 1, 'the idle grace window retains one heartbeat');
    // The idle-release manager captures the native scheduler at module import,
    // before this test installs fake WebSocket reconnect timers.
    await new Promise(resolve => saved.setTimeout(resolve, 1_600));
    assert.equal(intervals.size, 0, 'idle release clears all Bybit heartbeat timers');
    assert.equal(fourth.readyState, 3, 'idle release closes the active socket');
  } finally {
    unsubscribe?.();
    globalThis.fetch = saved.fetch;
    globalThis.WebSocket = saved.WebSocket;
    globalThis.setTimeout = saved.setTimeout;
    globalThis.clearTimeout = saved.clearTimeout;
    globalThis.setInterval = saved.setInterval;
    globalThis.clearInterval = saved.clearInterval;
    Date.now = saved.now;
  }
});
