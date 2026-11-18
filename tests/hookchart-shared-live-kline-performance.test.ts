import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createSharedKlineSubscriptions, parseSharedKlineMessage } from '../src/components/hookchart/sharedKlineStream';
import { toHookCandles } from '../src/utils/hookchartData';

class FakeSocket {
  static OPEN = 1;
  readonly sent: string[] = [];
  readyState = 1;
  closed = 0;
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string) { this.sent.push(data); }
  close() { this.closed++; this.readyState = 3; }
  emit(payload: unknown) { this.onmessage?.({ data: JSON.stringify(payload) }); }
}

const kline = (time: number, price: number, volume: number) => ({
  time, open: price, high: price + 2, low: price - 2, close: price + 1, volume,
});

test('120 live same-market HookCharts share one kline WebSocket', () => {
  const sockets: FakeSocket[] = [];
  const manager = createSharedKlineSubscriptions(url => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket as unknown as WebSocket;
  });
  const scope = { exchange: 'binance' as const, marketType: 'futures' as const,
    symbol: 'BTCUSDT', timeframe: '1m' };
  const received: number[][] = Array.from({ length: 120 }, () => []);
  const stops = received.map(rows => manager.subscribe(scope, {
    onCandle: row => rows.push(row.volume),
    onStatus: () => {},
  }));
  assert.equal(sockets.length, 1);
  assert.match(sockets[0].url, /btcusdt@kline_1m$/);
  sockets[0].onopen?.({});
  sockets[0].emit({ e: 'kline', s: 'BTCUSDT', E: 1710000000100, k: {
    t: 1710000000000, i: '1m', o: '100', h: '102', l: '99', c: '101', v: '42', n: 3,
  } });
  for (const rows of received) assert.deepEqual(rows, [42]);
  stops.slice(0, 119).forEach(stop => stop());
  assert.equal(sockets[0].closed, 0);
  stops[119]();
  assert.equal(sockets[0].closed, 1);
  assert.equal(manager.activeScopes(), 0);
});

test('different timeframes and exchange scopes never share their candles', () => {
  const sockets: FakeSocket[] = [];
  const manager = createSharedKlineSubscriptions(url => {
    const socket = new FakeSocket(url); sockets.push(socket);
    return socket as unknown as WebSocket;
  });
  const scope = { exchange: 'binance' as const, marketType: 'futures' as const,
    symbol: 'BTCUSDT', timeframe: '1m' };
  const listener = { onCandle: () => {}, onStatus: () => {} };
  const stops = [
    manager.subscribe(scope, listener),
    manager.subscribe({ ...scope, timeframe: '5m' }, listener),
    manager.subscribe({ ...scope, symbol: 'ETHUSDT' }, listener),
    manager.subscribe({ ...scope, exchange: 'bybit' }, listener),
  ];
  assert.equal(sockets.length, 4);
  assert.equal(manager.activeScopes(), 4);
  const bybit = sockets[3];
  bybit.onopen?.({});
  assert.match(bybit.sent.join(''), /kline\.1\.BTCUSDT/);
  stops.forEach(stop => stop());
  assert.equal(manager.activeScopes(), 0);
  assert.equal(bybit.closed, 1);
});

test('late subscribers get only latest candle, stale or malformed messages ignored', () => {
  let socket: FakeSocket | undefined;
  const manager = createSharedKlineSubscriptions(url => {
    socket = new FakeSocket(url); return socket as unknown as WebSocket;
  });
  const scope = { exchange: 'binance' as const, marketType: 'spot' as const,
    symbol: 'SOLUSDT', timeframe: '5m' };
  const values: number[] = [], late: number[] = [];
  const stop1 = manager.subscribe(scope, { onCandle: c => values.push(c.time) });
  socket!.emit({ e: 'kline', s: 'SOLUSDT', E: 1720000000000,
    k: { t: 1720000000000, i: '5m', o: '100', h: '102', l: '99', c: '101', v: '10' } });
  socket!.emit({ e: 'kline', s: 'SOLUSDT', E: 1719999999000,
    k: { t: 1719999990000, i: '5m', o: '100', h: '102', l: '99', c: '101', v: '10' } });
  const stop2 = manager.subscribe(scope, { onCandle: c => late.push(c.time) });
  assert.equal(values.length, 1);
  assert.deepEqual(late, values);
  assert.equal(parseSharedKlineMessage('binance', { e: 'aggTrade' }, 'SOLUSDT', '5m'), null);
  assert.equal(parseSharedKlineMessage('binance', { e: 'kline', s: 'OTHERUSDT', k: {} }, 'SOLUSDT', '5m'), null);
  stop1(); stop2();
});

test('shared exchange Kline rejects older same-candle messages and cumulative volume decreases', () => {
  let socket: FakeSocket | undefined;
  const manager = createSharedKlineSubscriptions(url => {
    socket = new FakeSocket(url);
    return socket as unknown as WebSocket;
  });
  const seen: { volume: number; close: number }[] = [];
  const stop = manager.subscribe(
    { exchange: 'binance', marketType: 'futures', symbol: 'ETHUSDT', timeframe: '1m' },
    { onCandle: candle => seen.push({ volume: candle.volume, close: candle.close }) },
  );
  const send = (eventTime: number, volume: number, close: number) => socket!.emit({
    e: 'kline', s: 'ETHUSDT', E: eventTime,
    k: { t: 1710000000000, i: '1m', o: '100',
      h: '110', l: '90', c: String(close), v: String(volume) },
  });
  send(1710000000200, 100, 105);
  send(1710000000100, 105, 108); // older exchange event, despite greater volume
  send(1710000000300, 90, 103); // newer event but lower cumulative volume
  send(1710000000400, 110, 107); // genuine newer update
  assert.deepEqual(seen, [{ volume: 100, close: 105 }, { volume: 110, close: 107 }]);
  stop();
});

test('browser Kline subscribers receive revised taker volumes and trade counts at the same exchange timestamp', () => {
  let socket: FakeSocket | undefined;
  const manager = createSharedKlineSubscriptions(url => {
    socket = new FakeSocket(url);
    return socket as unknown as WebSocket;
  });
  const seen: Array<[number | undefined, number | undefined, number | undefined, number | undefined]> = [];
  const stop = manager.subscribe(
    { exchange: 'binance', marketType: 'futures', symbol: 'BTCUSDT', timeframe: '1m' },
    { onCandle: candle => seen.push([candle.tradeCount, candle.buyVolume, candle.quoteVolume, candle.buyQuoteVolume]) },
  );
  try {
    const packet = { e: 'kline', s: 'BTCUSDT', E: 1710000000200,
      k: { t: 1710000000000, i: '1m', o: '100', h: '110', l: '90', c: '105', v: '10',
        n: 2, V: '4.25', q: '1025.00', Q: '421.50' } };
    socket!.emit(packet);
    socket!.emit(packet);
    socket!.emit({ ...packet, k: { ...packet.k, n: 3, V: '4.75', Q: '469.25' } });
    assert.deepEqual(seen, [[2, 4.25, 1025, 421.5], [3, 4.75, 1025, 469.25]]);
  } finally {
    stop();
  }
});

test('historical Replay does not subscribe to a live-market feed', () => {
  const replay = readFileSync(new URL('../src/components/replay/ReplayChart.tsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../src/components/hookchart/useOriginalHookChartLiveFeed.ts', import.meta.url), 'utf8');
  assert.match(replay, /<HookChart[^>]*klines=\{visibleCandles\}/);
  assert.match(replay, /markers=\{hookMarkers\} replay/);
  assert.doesNotMatch(replay, /subscribeSharedKlines|subscribeMarketTrades|fetchSharedLiveFallback/);
  assert.match(hook, /if \(replay \|\| lightweight \|\| !exchangeSymbol\)/);
  assert.match(hook, /if \(replay \|\| lightweight \|\| !exchangeSymbol \|\| marketType !== 'futures'\)/);
});

test('optimized candle conversion preserves duplicate and out-of-order replay semantics', () => {
  const original = [kline(10, 100, 10), kline(30, 105, 30),
    kline(20, 101, 20), kline(30, 108, 33)];
  const out = toHookCandles(original);
  assert.deepEqual(out.map(x => [x.t, x.v]), [[10000, 10], [20000, 20], [30000, 33]]);
  const ordered = toHookCandles([kline(10, 100, 10), kline(20, 101, 20), kline(20, 103, 29)]);
  assert.deepEqual(ordered.map(x => [x.t, x.v]), [[10000, 10], [20000, 29]]);
});


test('a throwing initial subscriber callback does not leak shared Kline stream listeners', () => {
  const sockets: FakeSocket[] = [];
  const manager = createSharedKlineSubscriptions(url => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket as unknown as WebSocket;
  });
  const scope = { exchange: 'binance' as const, marketType: 'futures' as const,
    symbol: 'BTCUSDT', timeframe: '1m' };
  const broken = manager.subscribe(scope, {
    onStatus: () => { throw new Error('unmounted chart'); },
    onCandle: () => { throw new Error('broken chart paint'); },
  });
  const seen: number[] = [];
  const good = manager.subscribe(scope, { onStatus: () => {}, onCandle: c => seen.push(c.volume) });
  assert.equal(sockets.length, 1);
  const packet = { e: 'kline', s: 'BTCUSDT', E: 1710000000100, k: {
    t: 1710000000000, i: '1m', o: '100', h: '102', l: '99', c: '101', v: '42', n: 3,
  }};
  sockets[0].onopen?.({});
  sockets[0].emit(packet);
  assert.deepEqual(seen, [42], 'a broken view must not stop other chart updates');
  const late = manager.subscribe(scope, {
    onStatus: () => { throw new Error('status failed'); },
    onCandle: () => { throw new Error('cached candle render failed'); },
  });
  sockets[0].emit({ ...packet, E: 1710000000200, k: { ...packet.k, v: '43' } });
  assert.deepEqual(seen, [42, 43], 'a failed cached replay must not interrupt the transport');
  broken(); good(); late();
  assert.equal(manager.activeScopes(), 0);
  assert.equal(sockets[0].closed, 1);
});

test('an invalid Kline scope tolerates a failing status callback', () => {
  const manager = createSharedKlineSubscriptions(() => { throw new Error('should not connect'); });
  const stop = manager.subscribe(
    { exchange: 'binance', marketType: 'futures', symbol: 'BTCUSDT', timeframe: '30s' },
    { onStatus: () => { throw new Error('disposed chart'); }, onCandle: () => {} },
  );
  stop();
  assert.equal(manager.activeScopes(), 0);
});


test('relay watchdog checks each reconnect, not a cached candle from the previous socket', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  type Clock = { callback: () => void; delay: number; cancelled: boolean };
  const clocks: Clock[] = [];
  const runTimer = (predicate: (timer: Clock) => boolean) => {
    const timer = clocks.find(item => !item.cancelled && predicate(item));
    assert.ok(timer, 'the expected watchdog or retry timer must be scheduled');
    timer!.cancelled = true;
    timer!.callback();
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true, value: { location: { protocol: 'https:', href: 'https://h00k.top/' } },
  });
  (globalThis as any).setTimeout = (callback: () => void, delay: number) => {
    const timer = { callback, delay, cancelled: false };
    clocks.push(timer);
    return timer;
  };
  (globalThis as any).clearTimeout = (timer: Clock) => { timer.cancelled = true; };
  const sockets: FakeSocket[] = [];
  const manager = createSharedKlineSubscriptions(url => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket as unknown as WebSocket;
  });
  const scope = { exchange: 'binance' as const, marketType: 'futures' as const,
    symbol: 'BTCUSDT', timeframe: '1m' };
  const got: number[] = [];
  const packet = (eventTime: number, volume: number) => ({
    type: 'kline', candle: {
      time: 1710000000, open: 100, high: 110, low: 90,
      close: 105, volume, eventTime,
    },
  });
  let stop = () => {};
  try {
    stop = manager.subscribe(scope, { onCandle: c => got.push(c.volume) });
    assert.match(sockets[0].url, /\/api\/hookchart\/klines/);
    sockets[0].emit(packet(1710000000100, 42));
    assert.deepEqual(got, [42]);
    sockets[0].onclose?.({});
    runTimer(t => t.delay >= 1000 && t.delay < 3000);
    assert.equal(sockets.length, 2);
    assert.match(sockets[1].url, /\/api\/hookchart\/klines/);

    // Old or byte-identical cached replay data must not mark the new
    // socket healthy: only a newer accepted exchange candle can do that.
    sockets[1].emit(packet(1710000000100, 42));
    sockets[1].emit(packet(1710000000050, 41));
    assert.deepEqual(got, [42]);
    runTimer(t => t.delay === 10_000);
    assert.equal(sockets[1].closed, 1, 'a silent replacement relay is retired');
    sockets[1].onclose?.({});
    runTimer(t => t.delay >= 1000 && t.delay < 3000);
    assert.equal(sockets.length, 3);
    assert.match(sockets[2].url, /fstream\.binance\.com/,
      'only after the bounded watchdog expires should direct exchange fallback start');
    sockets[2].emit({ e: 'kline', s: 'BTCUSDT', E: 1710000000200, k: {
      t: 1710000000000, i: '1m', o: '100', h: '110', l: '90', c: '106',
      v: '44', n: 20,
    }});
    assert.deepEqual(got, [42, 44], 'the chart resumes without replaying stale volume');
  } finally {
    stop();
    (globalThis as any).setTimeout = previousSetTimeout;
    (globalThis as any).clearTimeout = previousClearTimeout;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete (globalThis as any).window;
  }
});

test('fresh relay kline cancels its own watchdog after reconnect', () => {
  const source = readFileSync(new URL('../src/components/hookchart/sharedKlineStream.ts', import.meta.url), 'utf8');
  assert.match(source, /let acceptedOnThisSocket = false/);
  assert.match(source, /if \(!shared\.closed && shared\.socket === ws && !acceptedOnThisSocket\)/);
  assert.match(source, /acceptedOnThisSocket = true;\s*shared\.failures = 0;\s*if \(startupWatch !== null\)/);
});


test('opening and immediately dropping an exchange Kline socket increases retry delay until real candles arrive', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  type Clock = { callback: () => void; delay: number; cancelled: boolean };
  const timers: Clock[] = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: undefined });
  (globalThis as any).setTimeout = (callback: () => void, delay: number) => {
    const task = { callback, delay, cancelled: false };
    timers.push(task);
    return task;
  };
  (globalThis as any).clearTimeout = (task: Clock) => { task.cancelled = true; };
  const sockets: FakeSocket[] = [];
  const manager = createSharedKlineSubscriptions(url => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket as unknown as WebSocket;
  });
  const takeRetry = () => {
    const t = timers.find(timer => !timer.cancelled);
    assert.ok(t, 'retry is scheduled');
    t!.cancelled = true;
    return t!;
  };
  let stop = () => {};
  try {
    stop = manager.subscribe(
      { exchange: 'binance', marketType: 'futures', symbol: 'BTCUSDT', timeframe: '1m' },
      { onCandle: () => {} },
    );
    sockets[0].onopen?.({});
    sockets[0].onclose?.({});
    const first = takeRetry();
    assert.ok(first.delay >= 1_000 && first.delay < 2_000);
    first.callback();
    sockets[1].onopen?.({});
    sockets[1].onclose?.({});
    const second = takeRetry();
    assert.ok(second.delay >= 2_000 && second.delay < 3_000,
      'an open socket without accepted candles must not reset retry backoff');
    second.callback();
    sockets[2].onopen?.({});
    sockets[2].emit({ e: 'kline', s: 'BTCUSDT', E: 1710000000100, k: {
      t: 1710000000000, i: '1m', o: '100', h: '105', l: '99', c: '103',
      v: '15', n: 2,
    }});
    sockets[2].onclose?.({});
    const recovered = takeRetry();
    assert.ok(recovered.delay >= 1_000 && recovered.delay < 2_000,
      'successful accepted data returns the reconnection backoff to its baseline');
  } finally {
    stop();
    (globalThis as any).setTimeout = previousSetTimeout;
    (globalThis as any).clearTimeout = previousClearTimeout;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete (globalThis as any).window;
  }
});


test('brief shared-relay closure retries VPS before opening direct exchange sockets', () => {
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldSet = globalThis.setTimeout;
  const oldClear = globalThis.clearTimeout;
  type Timer = { callback: () => void; delay: number; cancelled: boolean };
  const timers: Timer[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true, value: { location: { protocol: 'https:', href: 'https://h00k.top/' } },
  });
  (globalThis as any).setTimeout = (callback: () => void, delay: number) => {
    const slot = { callback, delay, cancelled: false };
    timers.push(slot);
    return slot;
  };
  (globalThis as any).clearTimeout = (slot: Timer) => { slot.cancelled = true; };
  const sockets: FakeSocket[] = [];
  const manager = createSharedKlineSubscriptions(url => {
    const socket = new FakeSocket(url); sockets.push(socket);
    return socket as unknown as WebSocket;
  });
  const retry = () => {
    const item = timers.find(t => !t.cancelled && t.delay < 10_000);
    assert.ok(item, 'reconnect retry must be scheduled');
    item!.cancelled = true;
    item!.callback();
  };
  let stop = () => {};
  try {
    stop = manager.subscribe(
      { exchange: 'binance', marketType: 'futures', symbol: 'BTCUSDT', timeframe: '1m' },
      { onCandle: () => {} },
    );
    assert.match(sockets[0].url, /\/api\/hookchart\/klines/);
    sockets[0].onclose?.({});
    retry();
    assert.match(sockets[1].url, /\/api\/hookchart\/klines/,
      'a single brief VPS relay closure should not create direct exchange sockets');
    sockets[1].onclose?.({});
    retry();
    assert.match(sockets[2].url, /fstream\.binance\.com/,
      'repeated relay startups without any accepted candle must fail open');
  } finally {
    stop();
    (globalThis as any).setTimeout = oldSet;
    (globalThis as any).clearTimeout = oldClear;
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else delete (globalThis as any).window;
  }
});
