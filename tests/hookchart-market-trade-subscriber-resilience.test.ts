import test from 'node:test';
import assert from 'node:assert/strict';
import { getSharedMarketPrints, subscribeMarketTrades } from '../src/components/hookchart/marketTradeStream';

type FakeMessage = { data: string };

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  onmessage: ((event: FakeMessage) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) { FakeWebSocket.instances.push(this); }
  send(_payload: string) {}
  close() { this.readyState = 3; this.onclose?.(); }
  emit(tradeId: number, t = Date.now()) {
    this.onmessage?.({ data: JSON.stringify({ T: t, p: '100', q: '10', m: false, a: tradeId }) });
  }
}

const scope = { exchange: 'binance' as const, marketType: 'futures' as const, symbol: 'BTCUSDT' };
const listener = () => ({ onTrade: () => {}, onPrints: () => {} });
const nextTick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function mockMarketNetwork() {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  FakeWebSocket.instances = [];
  globalThis.fetch = async () => Response.json([]);
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  return () => {
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
  };
}

test('throwing trade/print listeners never interrupt other charts sharing one market stream', async () => {
  const restore = mockMarketNetwork();
  const stop: Array<() => void> = [];
  try {
    stop.push(subscribeMarketTrades(scope, {
      onTrade: () => { throw new Error('bad chart trade handler'); },
      onPrints: () => { throw new Error('bad chart print handler'); },
      wantsPrints: () => true,
    }));
    stop.push(subscribeMarketTrades(scope, {
      onTrade: () => { throw new Error('bad chart trade handler'); },
      onPrints: () => {},
      wantsPrints: () => { throw new Error('bad chart preference handler'); },
    }));
    const trades: string[] = [];
    const prints: number[] = [];
    stop.push(subscribeMarketTrades(scope, {
      onTrade: trade => { trades.push(trade.id); },
      onPrints: rows => { prints.push(rows.length); },
      wantsPrints: () => true,
    }));

    await nextTick();
    assert.equal(FakeWebSocket.instances.length, 1, 'one socket per exchange/market/symbol');
    const ws = FakeWebSocket.instances[0];
    const now = Date.now();
    ws.emit(70001, now);
    ws.emit(70002, now + 10);
    assert.deepEqual(trades, ['70001', '70002']);
    assert.ok(getSharedMarketPrints(scope).length > 0, 'shared trade tracker must still accumulate volume');

    await new Promise(resolve => setTimeout(resolve, 560));
    assert.ok(prints.some(value => value > 0), 'healthy print listeners must receive buffered updates');

    // Joining a busy stream replays existing trades and current prints.
    // A callback failure must not abort subscribe or leak an unremovable listener.
    let newStop: (() => void) | undefined;
    assert.doesNotThrow(() => {
      newStop = subscribeMarketTrades(scope, {
        onTrade: () => { throw new Error('bad history replay'); },
        onPrints: () => { throw new Error('bad snapshot'); },
        wantsPrints: () => true,
      });
    });
    if (newStop) stop.push(newStop);
    ws.emit(70003, now + 20);
    assert.deepEqual(trades, ['70001', '70002', '70003']);
    assert.equal(FakeWebSocket.instances.length, 1);
  } finally {
    for (const unsubscribe of stop.reverse()) unsubscribe();
    // Restore global mocks only after the idle transport closes.
    await new Promise(resolve => setTimeout(resolve, 1_600));
    restore();
  }
});

test('repeating an obsolete disposer never removes a retained stream reused by another chart', async () => {
  const restore = mockMarketNetwork();
  const stop: Array<() => void> = [];
  try {
    const old = subscribeMarketTrades(scope, listener());
    stop.push(old);
    await nextTick();
    assert.equal(FakeWebSocket.instances.length, 1);
    old(); // schedules a short idle release

    const current = subscribeMarketTrades(scope, listener());
    stop.push(current);
    await nextTick();
    assert.equal(FakeWebSocket.instances.length, 1, 'new subscriber cancels idle release and reuses the existing socket');
    old(); // stale cleanup from the earlier mount must be idempotent

    const more = subscribeMarketTrades(scope, listener());
    stop.push(more);
    await nextTick();
    assert.equal(FakeWebSocket.instances.length, 1, 'stale cleanup must not drop the reused market transport');
    assert.equal(FakeWebSocket.instances[0].readyState, 1);
  } finally {
    for (const unsubscribe of stop.reverse()) unsubscribe();
    // Restore global mocks only after the idle transport closes.
    await new Promise(resolve => setTimeout(resolve, 1_600));
    restore();
  }
});

test('a short direct-WS outage invalidates 30s observers without disabling normal trade listeners', async () => {
  const restore = mockMarketNetwork();
  const scope = { exchange: 'binance' as const, marketType: 'futures' as const, symbol: 'ETHUSDT' };
  const stops: Array<() => void> = [];
  try {
    let interrupted = 0;
    const observed: string[] = [];
    stops.push(subscribeMarketTrades(scope, {
      onTrade: trade => { observed.push(trade.id); },
      onPrints: () => {},
      onStreamInterrupted: () => { interrupted++; },
      wantsPrints: () => false,
    }));
    await nextTick();
    const socket = FakeWebSocket.instances[0];
    assert.ok(socket);
    socket.emit(80001, Date.now());
    assert.deepEqual(observed, ['80001']);
    socket.close();
    socket.onerror?.();
    assert.equal(interrupted, 1, 'one interruption for close + late error');

    // Attaching while the exchange transport is recovering must not
    // replay a previously received tick into a new 30s OHLCV bucket.
    let resumedDuringGap = 0;
    let falselyReplayed = 0;
    stops.push(subscribeMarketTrades(scope, {
      onTrade: () => { falselyReplayed++; },
      onPrints: () => {},
      onStreamInterrupted: () => { resumedDuringGap++; },
      wantsPrints: () => false,
    }));
    assert.equal(resumedDuringGap, 1);
    assert.equal(falselyReplayed, 0);

    // The backoff timer can finish long before the replacement socket receives
    // a new execution. A new chart must remain gated during this interval.
    const deadline = Date.now() + 3_000;
    while (FakeWebSocket.instances.length < 2 && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(FakeWebSocket.instances.length, 2, 'a new exchange connection is created');
    let whileReconnecting = 0;
    let staleDuringReconnection = 0;
    let resumes = 0;
    stops.push(subscribeMarketTrades(scope, {
      onTrade: () => { staleDuringReconnection++; },
      onPrints: () => {},
      onStreamInterrupted: () => { whileReconnecting++; },
      onStreamResumed: () => { resumes++; },
      wantsPrints: () => false,
    }));
    assert.equal(whileReconnecting, 1, 'reconnecting state outlives its backoff timer');
    assert.equal(staleDuringReconnection, 0);

    FakeWebSocket.instances[1].emit(80002, Date.now());
    assert.equal(resumes, 1, 'a new live market trade confirms the replacement feed');
    assert.equal(staleDuringReconnection, 1);
    let afterResumeReplayed = 0;
    stops.push(subscribeMarketTrades(scope, {
      onTrade: () => { afterResumeReplayed++; },
      onPrints: () => {},
      onStreamInterrupted: () => {},
      wantsPrints: () => false,
    }));
    assert.equal(afterResumeReplayed, 1, 'only post-gap trades replay into the next 30s card');
  } finally {
    for (const stop of stops.reverse()) stop();
    await new Promise(resolve => setTimeout(resolve, 1_600));
    restore();
  }
});

test('transport status tracks Binance open/close and Bybit subscription acknowledgment', async () => {
  const restore = mockMarketNetwork();
  const stop: Array<() => void> = [];
  try {
    const binance = { ...scope, symbol: 'AVAXUSDT' };
    const binanceStatus: boolean[] = [];
    stop.push(subscribeMarketTrades(binance, {
      onTrade: () => {}, onPrints: () => {}, wantsPrints: () => false,
      onTransportStatus: connected => binanceStatus.push(connected),
    }));
    await nextTick();
    assert.deepEqual(binanceStatus, [false], 'not connected until exchange socket opens');
    const ws1 = FakeWebSocket.instances[0];
    ws1.onopen?.();
    assert.deepEqual(binanceStatus, [false, true]);
    const joined: boolean[] = [];
    stop.push(subscribeMarketTrades(binance, {
      onTrade: () => {}, onPrints: () => {}, wantsPrints: () => false,
      onTransportStatus: connected => joined.push(connected),
    }));
    assert.deepEqual(joined, [true], 'new chart joins existing connected stream');
    ws1.close();
    assert.deepEqual(binanceStatus, [false, true, false]);
    assert.deepEqual(joined, [true, false]);

    const bybit = { exchange: 'bybit' as const, marketType: 'spot' as const, symbol: 'XRPUSDT' };
    const bybitStatus: boolean[] = [];
    stop.push(subscribeMarketTrades(bybit, {
      onTrade: () => {}, onPrints: () => {}, wantsPrints: () => false,
      onTransportStatus: connected => bybitStatus.push(connected),
    }));
    await nextTick();
    assert.deepEqual(bybitStatus, [false]);
    const ws2 = FakeWebSocket.instances[1];
    ws2.onopen?.();
    assert.deepEqual(bybitStatus, [false], 'TCP open alone does not confirm a Bybit subscription');
    ws2.onmessage?.({ data: JSON.stringify({
      op: 'subscribe', success: true, args: ['publicTrade.XRPUSDT'],
    }) });
    assert.deepEqual(bybitStatus, [false, true]);
    ws2.close();
    assert.deepEqual(bybitStatus, [false, true, false]);
  } finally {
    for (const unsubscribe of stop.reverse()) unsubscribe();
    await new Promise(resolve => setTimeout(resolve, 1_600));
    restore();
  }
});
