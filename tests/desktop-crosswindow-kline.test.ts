import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createDesktopKlineBridge, type DesktopKlineChannel, type DesktopKlineListener, type DesktopKlineScope } from '../src/utils/desktopKlineBridge';
import type { LiveKline } from '../src/components/hookchart/sharedKlineStream';

const scope = { exchange: 'binance' as const, marketType: 'futures' as const,
  symbol: 'BTCUSDT', timeframe: '1m' };
type Callback = (event: MessageEvent<unknown>) => void;
function fakeTransport() {
  let time = 100_000;
  const channels = new Map<string, Set<{
    listeners: Set<Callback>;
    closed: boolean;
    deliver: (packet: unknown) => void;
  }>>();
  const callbacks = new Set<() => void>();
  const queues = new Map<string, {
    active: boolean;
    entries: Array<{
      signal: AbortSignal; task: () => Promise<void>;
      resolve: () => void; reject: (error: unknown) => void;
    }>;
  }>();
  const created: Array<{ listener: DesktopKlineListener; stopped: boolean; key: string }> = [];
  const createChannel = (name: string): DesktopKlineChannel => {
    const peers = channels.get(name) || new Set();
    channels.set(name, peers);
    const item = {
      listeners: new Set<Callback>(), closed: false,
      deliver(packet: unknown) {
        if (item.closed) return;
        for (const cb of item.listeners) cb({ data: packet } as MessageEvent<unknown>);
      },
    };
    peers.add(item);
    return {
      postMessage(packet) {
        for (const peer of peers) if (peer !== item) peer.deliver(packet);
      },
      addEventListener(_type, cb) { item.listeners.add(cb); },
      removeEventListener(_type, cb) { item.listeners.delete(cb); },
      close() { item.closed = true; peers.delete(item); },
    };
  };
  const requestLock = (_key: string, signal: AbortSignal, task: () => Promise<void>) => {
    const key = _key;
    const entry = queues.get(key) || { active: false, entries: [] };
    queues.set(key, entry);
    return new Promise<void>((resolve, reject) => {
      const item = { signal, task, resolve, reject };
      entry.entries.push(item);
      const next = () => {
        if (entry.active) return;
        while (entry.entries.length) {
          const current = entry.entries.shift()!;
          if (current.signal.aborted) { current.reject(new Error('aborted')); continue; }
          entry.active = true;
          void current.task().then(current.resolve, current.reject).finally(() => {
            entry.active = false; next();
          });
          return;
        }
      };
      signal.addEventListener('abort', () => {
        const index = entry.entries.indexOf(item);
        if (index !== -1) {
          entry.entries.splice(index, 1);
          reject(new Error('aborted'));
        }
      }, { once: true });
      next();
    });
  };
  const opts = {
    createChannel, lock: requestLock, now: () => time,
    every(fn: () => void, _ms: number) {
      callbacks.add(fn);
      return fn as unknown as ReturnType<typeof setInterval>;
    },
    cancelEvery(timer: ReturnType<typeof setInterval>) {
      callbacks.delete(timer as unknown as () => void);
    },
    source(used: DesktopKlineScope, listener: DesktopKlineListener) {
      const entry = { listener, stopped: false, key:
        [used.exchange,used.marketType,used.symbol,used.timeframe].join(':') };
      created.push(entry);
      return () => { entry.stopped = true; };
    },
  };
  const tick = (ms: number) => {
    time += ms;
    for (const cb of [...callbacks]) cb();
  };
  // A frozen leader's callback cannot send its heartbeat while follower
  // watchdogs keep running; simulate that independently of a quiet market.
  const tickFrozenLeader = (ms: number) => {
    time += ms;
    for (const cb of [...callbacks].slice(1)) cb();
  };
  const external = (name: string, packet: unknown) => {
    for (const peer of channels.get(name) || [])peer.deliver(packet);
  };
  return { opts, created, tick, tickFrozenLeader, external, now: () => time };
}
const candle = (eventTime = 100_100, volume = 10): LiveKline => ({
  time: 100_080, open: 100, high: 101, low: 99, close: 100.5, volume, eventTime,
});
async function flush() {
  await new Promise<void>(resolve => setImmediate(resolve));
}

test('two Desktop renderers subscribe to one real kline socket and receive identical public candles', async () => {
  const transport = fakeTransport();
  const a = createDesktopKlineBridge(transport.opts);
  const b = createDesktopKlineBridge(transport.opts);
  const first: LiveKline[] = [], second: LiveKline[] = [];
  const statusA: boolean[] = [], statusB: boolean[] = [];
  const offA = a.subscribe(scope,{onCandle:c=>first.push(c),onStatus:x=>statusA.push(x)});
  const offB = b.subscribe(scope,{onCandle:c=>second.push(c),onStatus:x=>statusB.push(x)});
  await flush();
  assert.equal(transport.created.length,1,'exactly one WS for two renderer processes');
  transport.created[0].listener.onStatus?.(true);
  transport.created[0].listener.onCandle(candle());
  assert.deepEqual(first, [candle()]);
  assert.deepEqual(second, [candle()]);
  assert.equal(statusA.at(-1),true);
  assert.equal(statusB.at(-1),true);
  offA(); offB();
  await flush();
  assert.equal(transport.created[0].stopped,true);
  assert.equal(a.activeScopes()+b.activeScopes(),0);
});

test('new renderer inherits recent candle and exact scope, never private data', async () => {
  const transport = fakeTransport();
  const a=createDesktopKlineBridge(transport.opts);
  const b=createDesktopKlineBridge(transport.opts);
  const offA=a.subscribe(scope,{onCandle:()=>{}});
  await flush();
  transport.created[0].listener.onCandle(candle());
  const got: LiveKline[]=[];
  const offB=b.subscribe(scope,{onCandle:c=>got.push(c)});
  await flush();
  assert.equal(transport.created.length,1);
  assert.deepEqual(got,[candle()]);
  offA();offB();
});

test('closing leader transfers upstream ownership and keeps live data flowing', async () => {
  const transport=fakeTransport();
  const a=createDesktopKlineBridge(transport.opts);
  const b=createDesktopKlineBridge(transport.opts);
  const got: LiveKline[]=[];
  const offA=a.subscribe(scope,{onCandle:()=>{}});
  const offB=b.subscribe(scope,{onCandle:c=>got.push(c)});
  await flush();
  assert.equal(transport.created.length,1);
  offA();
  await flush();
  await flush();
  assert.equal(transport.created[0].stopped,true);
  assert.equal(transport.created.length,2,'waiting renderer acquires the released Web Lock');
  transport.created[1].listener.onCandle(candle(100_300,20));
  assert.equal(got.at(-1)?.volume,20);
  offB();
});

test('clean owner exit informs every remaining renderer immediately, without a seven-second blackout', async () => {
  const transport=fakeTransport();
  const a=createDesktopKlineBridge(transport.opts);
  const b=createDesktopKlineBridge(transport.opts);
  const c=createDesktopKlineBridge(transport.opts);
  const valuesB:LiveKline[]=[];
  const valuesC:LiveKline[]=[];
  const offA=a.subscribe(scope,{onCandle:()=>{}});
  const offB=b.subscribe(scope,{onCandle:k=>valuesB.push(k)});
  const offC=c.subscribe(scope,{onCandle:k=>valuesC.push(k)});
  await flush();
  transport.created[0].listener.onCandle(candle());
  assert.equal(valuesB.length,1);
  assert.equal(valuesC.length,1);
  offA();
  await flush();await flush();
  assert.equal(transport.created.length,2);
  transport.created[1].listener.onCandle(candle(100_200,30));
  assert.equal(valuesB.at(-1)?.volume,30);
  assert.equal(valuesC.at(-1)?.volume,30,
    'third window must not reject the new lock owner while old heartbeat was fresh');
  offB();offC();await flush();
});

test('different exchange/market/symbol/timeframes never share a subscription', async () => {
  const transport=fakeTransport();
  const bridges=Array.from({length:4},()=>createDesktopKlineBridge(transport.opts));
  const scopes=[
    scope,
    {...scope,symbol:'ETHUSDT'},
    {...scope,exchange:'bybit' as const},
    {...scope,timeframe:'5m'},
  ];
  const stops=scopes.map((key,i)=>bridges[i].subscribe(key,{onCandle:()=>{}}));
  await flush();
  assert.equal(transport.created.length,4);
  assert.equal(new Set(transport.created.map(x=>x.key)).size,4);
  stops.forEach(fn=>fn());
});

test('a crashed/frozen cross-window leader fails open to its own WS and rejects stale replay', async () => {
  const transport=fakeTransport();
  const a=createDesktopKlineBridge(transport.opts);
  const b=createDesktopKlineBridge(transport.opts);
  const candles: LiveKline[] = [];
  const statuses:boolean[]=[];
  const offA=a.subscribe(scope,{onCandle:()=>{}});
  const offB=b.subscribe(scope,{onCandle:c=>candles.push(c),onStatus:c=>statuses.push(c)});
  await flush();
  assert.equal(transport.created.length,1);
  transport.created[0].listener.onCandle(candle());
  assert.equal(statuses.at(-1),true);
  transport.tickFrozenLeader(8_000);
  assert.equal(statuses.at(-1),false,'stale leader never leaves a LIVE status');
  assert.equal(transport.created.length,2,'follower opens fail-open native WS');
  transport.created[1].listener.onCandle(candle(108_050,50));
  assert.equal(candles.at(-1)?.volume,50);
  const name='h00k-desktop-public-kline-v1:binance:futures:BTCUSDT:1m';
  transport.external(name,{type:'candle',scope:'binance:futures:BTCUSDT:1m',
    sender:'forged-stale',sentAt:transport.now()-21_000,candle:candle(100_110,60)});
  transport.external(name,{type:'candle',scope:'binance:futures:ETHUSDT:1m',
    sender:'forged-wrong-scope',sentAt:transport.now(),candle:candle(108_100,60)});
  assert.equal(candles.at(-1)?.volume,50,'no wrong-symbol or expired candle is broadcast');
  offA();offB();await flush();
});

test('valid Unicode exchange pairs share the same Desktop kline transport across windows', async () => {
  const transport = fakeTransport();
  const first = createDesktopKlineBridge(transport.opts);
  const second = createDesktopKlineBridge(transport.opts);
  // The website supports these symbols through the exchange's actual UTF-8
  // instrument identity; charts for them must not create one WS per pane.
  const international = { ...scope, symbol: '龙虾USDT' };
  const receivedA: LiveKline[] = [], receivedB: LiveKline[] = [];
  const offA = first.subscribe(international, { onCandle: candle => receivedA.push(candle) });
  const offB = second.subscribe(international, { onCandle: candle => receivedB.push(candle) });
  await flush();
  assert.equal(transport.created.length, 1);
  assert.equal(transport.created[0].key, 'binance:futures:龙虾USDT:1m');
  transport.created[0].listener.onCandle(candle());
  assert.deepEqual(receivedA, [candle()]);
  assert.deepEqual(receivedB, [candle()]);
  offA(); offB(); await flush();
  assert.equal(transport.created[0].stopped, true);
});

test('distinct Chinese-symbol instruments stay on independent Desktop kline sources', async () => {
  const transport = fakeTransport();
  const a = createDesktopKlineBridge(transport.opts);
  const b = createDesktopKlineBridge(transport.opts);
  const offA = a.subscribe({ ...scope, symbol: '龙虾USDT' }, { onCandle: () => {} });
  const offB = b.subscribe({ ...scope, symbol: '币安人生USDT' }, { onCandle: () => {} });
  await flush();
  assert.equal(transport.created.length, 2);
  assert.equal(new Set(transport.created.map(item => item.key)).size, 2);
  offA(); offB(); await flush();
});

test('malformed pair spellings do not join someone else’s Desktop kline channel', async () => {
  const transport = fakeTransport();
  const first = createDesktopKlineBridge(transport.opts);
  const second = createDesktopKlineBridge(transport.opts);
  const malformed = { ...scope, symbol: 'BTC/USDT' };
  const offA = first.subscribe(malformed, { onCandle: () => {} });
  const offB = second.subscribe(malformed, { onCandle: () => {} });
  await flush();
  assert.equal(transport.created.length, 2,
    'malformed symbols bypass shared channel and reach HookChart source validation');
  offA(); offB(); await flush();
});

test('a healthy quiet leader sends heartbeats so followers avoid duplicate kline sockets', async () => {
  const transport = fakeTransport();
  const leader = createDesktopKlineBridge(transport.opts);
  const follower = createDesktopKlineBridge(transport.opts);
  const offA = leader.subscribe(scope, { onCandle: () => {} });
  const offB = follower.subscribe(scope, { onCandle: () => {} });
  await flush();
  assert.equal(transport.created.length, 1);
  // No trades/candles are arriving yet, but the leader is still running.
  // Every 2s owner heartbeat must reset the 7s follower liveness deadline.
  for (let i = 0; i < 4; i++) {
    transport.tick(2_000);
    assert.equal(transport.created.length, 1,
      'a silent but healthy owner cannot trigger the shorter peer timeout');
  }
  offA(); offB(); await flush();
});

test('owner heartbeat alone cannot indefinitely hide a broken initial candle feed', async () => {
  const transport = fakeTransport();
  const leader = createDesktopKlineBridge(transport.opts);
  const follower = createDesktopKlineBridge(transport.opts);
  const statuses: boolean[] = [];
  const offA = leader.subscribe(scope, { onCandle: () => {} });
  const offB = follower.subscribe(scope, {
    onCandle: () => {}, onStatus: live => statuses.push(live),
  });
  await flush();
  for (let i = 0; i < 11; i++) transport.tick(2_000);
  assert.equal(transport.created.length, 2,
    'a leader that never provides an initial candle must fail open');
  transport.created[1].listener.onCandle(candle(122_100, 33));
  assert.equal(statuses.at(-1), true);
  transport.created[0].listener.onCandle(candle(122_200, 40));
  assert.equal(transport.created[1].stopped, true,
    'once the leader provides newer verified candles the duplicate is reclaimed');
  offA(); offB(); await flush();
});

test('Web Lock handover never rolls a follower back behind a newer fallback candle', async () => {
  const transport = fakeTransport();
  const a = createDesktopKlineBridge(transport.opts);
  const b = createDesktopKlineBridge(transport.opts);
  const output: LiveKline[] = [];
  const offA = a.subscribe(scope, { onCandle: () => {} });
  const offB = b.subscribe(scope, { onCandle: row => output.push(row) });
  await flush();
  assert.equal(transport.created.length, 1);
  // The owner is alive but its feed remains silent, so the follower correctly
  // opens an emergency native socket after the bounded first-candle deadline.
  for (let i = 0; i < 11; i++) transport.tick(2_000);
  assert.equal(transport.created.length, 2);
  transport.created[1].listener.onCandle(candle(122_050, 50));
  assert.equal(output.at(-1)?.volume, 50);
  offA();
  await flush(); await flush();
  assert.equal(transport.created.length, 3);
  assert.equal(transport.created[1].stopped, true);
  // A newly elected owner may receive the cached relay snapshot before it
  // catches up to the exchange. Never regress the displayed cumulative bar.
  const length = output.length;
  transport.created[2].listener.onCandle(candle(120_000, 20));
  assert.equal(output.length, length);
  assert.equal(output.at(-1)?.volume, 50);
  transport.created[2].listener.onCandle(candle(122_100, 60));
  assert.equal(output.at(-1)?.volume, 60);
  offB(); await flush();
});

test('same-origin public browser tabs and Desktop panes use guarded cross-window klines', () => {
  const src=readFileSync(new URL('../src/components/hookchart/sharedKlineStream.ts',import.meta.url),'utf8');
  assert.match(src, /const sameOriginWindow = typeof window !== 'undefined'/);
  assert.match(src, /!sameOriginWindow/);
  assert.match(src, /!navigator\.locks\?\.request/);
  assert.match(src, /return browserKlineSubscriptions\.subscribe\(scope, listener\)/);
  assert.match(src, /new BroadcastChannel\(name\)/);
});


for (const panes of [1, 2, 4, 6]) {
  test(panes + ' simultaneous Desktop kline panes fan out from one market source and clean up', async () => {
    const transport = fakeTransport();
    const bridges = Array.from({ length: panes }, () => createDesktopKlineBridge(transport.opts));
    const received: LiveKline[][] = Array.from({ length: panes }, () => []);
    const stops = bridges.map((bridge, i) =>
      bridge.subscribe(scope, { onCandle: row => received[i].push(row) }));
    await flush();
    assert.equal(transport.created.length, 1,
      'Identical charts must create one upstream socket even with ' + panes + ' windows');
    transport.created[0].listener.onStatus?.(true);
    transport.created[0].listener.onCandle(candle(100_100, 10));
    transport.created[0].listener.onCandle(candle(100_200, 20));
    for (const rows of received) assert.deepEqual(rows.map(row => row.volume), [10, 20]);
    if (panes > 1) {
      stops[0](); await flush(); await flush();
      assert.equal(transport.created[0].stopped, true);
      assert.equal(transport.created.length, 2, 'one surviving pane becomes the new owner');
      transport.created[1].listener.onCandle(candle(100_300, 30));
      for (const rows of received.slice(1)) {
        assert.deepEqual(rows.map(row => row.volume), [10, 20, 30],
          'all remaining panes must resume without duplicate or missing candles');
      }
    }
    for (const stop of stops.slice(panes > 1 ? 1 : 0)) stop();
    await flush();
    assert.equal(bridges.reduce((sum, bridge) => sum + bridge.activeScopes(), 0), 0);
    assert.equal(transport.created.every(entry => entry.stopped), true,
      'closing all panels must free all WebSocket resources');
  });
}
