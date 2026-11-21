import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverBinanceTradeGap } from '../src/components/hookchart/binanceTradeGapRecovery';
import { createSharedBinanceTradeTransport, isValidBinanceTradePacket } from '../src/components/hookchart/binanceSharedTradeTransport';
import { createVerifiedBinanceTrades } from '../src/components/hookchart/verifiedBinanceTrades';
import { openSharedBinanceTradeSocket } from '../src/components/hookchart/binanceSharedTradeSocket';

const trade = (id: number) => ({ id: String(id), t: Date.now(), p: 100, q: 2, side: 'BUY' as const });
const raw = (id: number) => ({ a: id, T: Date.now(), p: '100', q: '2', m: false });

test('Cross-tab trade decoder rejects malformed and stale payloads', () => {
  assert.ok(isValidBinanceTradePacket(trade(1)));
  assert.equal(isValidBinanceTradePacket({ ...trade(1), id: 'bad' }), false);
  assert.equal(isValidBinanceTradePacket({ ...trade(1), q: 0 }), false);
  assert.equal(isValidBinanceTradePacket({ ...trade(1), t: 1 }), false);
});

test('Binance gap recovery fetches each missing aggregate ID exactly once', async () => {
  const requests: Array<{ from: number; limit: number }> = [];
  const result = await recoverBinanceTradeGap({
    previousId: 10, currentId: 1015,
    load: async (from, limit) => {
      requests.push({ from, limit });
      return Array.from({ length: limit }, (_, index) => raw(from + index));
    },
  });
  assert.equal(result.status, 'complete');
  if (result.status === 'complete') {
    assert.equal(result.rows.length, 1004);
    assert.equal(result.rows[0].id, '11');
    assert.equal(result.rows.at(-1)?.id, '1014');
  }
  assert.deepEqual(requests, [{ from: 11, limit: 1000 }, { from: 1011, limit: 4 }]);
});

test('No missing aggregates are silently accepted when the REST gap is incomplete', async () => {
  const result = await recoverBinanceTradeGap({
    previousId: 10, currentId: 14,
    load: async () => [raw(11), raw(13)],
  });
  assert.deepEqual(result, { status: 'incomplete', reason: 'missing-id' });
  const excessive = await recoverBinanceTradeGap({
    previousId: 10, currentId: 5000,
    load: async () => { throw new Error('Should not request huge gaps'); },
  });
  assert.deepEqual(excessive, { status: 'incomplete', reason: 'too-many' });
});

test('Verified trade feed fills gaps before calculating execution volume', async () => {
  const accepted: string[] = [];
  const states: string[] = [];
  const feed = createVerifiedBinanceTrades({
    accept: row => accepted.push(row.id),
    onIntegrity: state => states.push(state),
    load: async (from, limit) => Array.from({ length: limit }, (_, index) => raw(from + index)),
  });
  feed.push(trade(100));
  feed.push(trade(104));
  feed.push(trade(105));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(accepted, ['100', '101', '102', '103', '104', '105']);
  assert.deepEqual(states, ['recovering', 'verified']);
  feed.close();
});

test('Verified trade feed freezes inaccurate delta after unrecoverable missing IDs', async () => {
  const accepted: string[] = [];
  const feed = createVerifiedBinanceTrades({
    accept: row => accepted.push(row.id),
    load: async () => [raw(101), raw(103)],
  });
  feed.push(trade(100));
  feed.push(trade(104));
  feed.push(trade(105));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(feed.getIntegrity(), 'incomplete');
  assert.deepEqual(accepted, ['100']);
  feed.push(trade(106));
  assert.deepEqual(accepted, ['100']);
  feed.close();
});

test('Late REST recovery cannot resume analytics after an oversized trade buffer', async () => {
  const accepted: string[] = [];
  let release: (rows: unknown[]) => void = () => {};
  const pending = new Promise<unknown[]>(resolve => { release = resolve; });
  const feed = createVerifiedBinanceTrades({
    accept: row => accepted.push(row.id),
    maxBuffered: 100,
    load: async () => pending,
  });
  feed.push(trade(100));
  feed.push(trade(104));
  for (let id = 105; id < 255; id++) feed.push(trade(id));
  assert.equal(feed.getIntegrity(), 'incomplete');
  release([raw(101), raw(102), raw(103)]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(accepted, ['100']);
  feed.close();
});

test('Repeated Binance aggregate gaps are rate-limited before an unsafe API loop', async () => {
  const accepted: string[] = [];
  let requests = 0;
  const feed = createVerifiedBinanceTrades({
    accept: row => accepted.push(row.id),
    load: async (from, limit) => {
      requests++;
      return Array.from({ length: limit }, (_, index) => raw(from + index));
    },
  });
  feed.push(trade(100));
  feed.push(trade(104));
  await new Promise(resolve => setImmediate(resolve));
  feed.push(trade(107));
  await new Promise(resolve => setImmediate(resolve));
  feed.push(trade(110));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 2);
  assert.equal(feed.getIntegrity(), 'incomplete');
  assert.deepEqual(accepted.map(Number), [100, 101, 102, 103, 104, 105, 106, 107]);
  feed.close();
});

test('Two same-origin tabs share one Binance socket and hand leadership over', async () => {
  const networks = new Map<string, Set<any>>();
  const channel = (name: string) => {
    const peers = networks.get(name) || new Set<any>();
    networks.set(name, peers);
    const instance = {
      listeners: new Set<(event: any) => void>(),
      postMessage(packet: any) {
        for (const peer of [...peers]) {
          if (peer !== instance) queueMicrotask(() => {
            for (const callback of [...peer.listeners] as Array<(event: any) => void>) callback({ data: packet });
          });
        }
      },
      addEventListener(_type: string, callback: (event: any) => void) { this.listeners.add(callback); },
      removeEventListener(_type: string, callback: (event: any) => void) { this.listeners.delete(callback); },
      close() { peers.delete(instance); },
    };
    peers.add(instance);
    return instance;
  };
  const locked = new Set<string>();
  const waiting = new Map<string, Array<() => void>>();
  const lock = async (name: string, signal: AbortSignal, task: () => Promise<void>) => {
    if (locked.has(name)) await new Promise<void>((resolve, reject) => {
      const enter = () => { signal.removeEventListener('abort', cancel); resolve(); };
      const cancel = () => {
        waiting.set(name, (waiting.get(name) || []).filter(item => item !== enter));
        reject(new Error('aborted'));
      };
      signal.addEventListener('abort', cancel, { once: true });
      waiting.set(name, [...(waiting.get(name) || []), enter]);
    });
    if (signal.aborted) throw new Error('aborted');
    locked.add(name);
    try { await task(); } finally { locked.delete(name); waiting.get(name)?.shift()?.(); }
  };
  const sockets: Array<{ emit: (row: ReturnType<typeof trade>) => void; close: () => void }> = [];
  let closed = 0;
  const socket = (_scope: any, onTrade: (row: ReturnType<typeof trade>) => void,
    onConnected: (value: boolean) => void) => {
    onConnected(true);
    const source = { emit: onTrade, close() { closed++; } };
    sockets.push(source);
    return source;
  };
  const first = createSharedBinanceTradeTransport({ channel, lock, socket });
  const second = createSharedBinanceTradeTransport({ channel, lock, socket });
  const scope = { marketType: 'futures' as const, symbol: 'BTCUSDT' };
  const receivedA: string[] = [], receivedB: string[] = [];
  const statusA: boolean[] = [], statusB: boolean[] = [];
  const offA = first.subscribe(scope, row => receivedA.push(row.id), connected => statusA.push(connected));
  await new Promise(resolve => setImmediate(resolve));
  const offB = second.subscribe(scope, row => receivedB.push(row.id), connected => statusB.push(connected));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sockets.length, 1);
  assert.deepEqual(statusA, [true], 'Owner reports its active Binance socket');
  assert.deepEqual(statusB, [true], 'Follower reports the live owner rather than staying disconnected');
  sockets[0].emit(trade(1));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(receivedA, ['1']);
  assert.deepEqual(receivedB, ['1']);
  offA();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(statusA.at(-1), false, 'Unsubscribed owner reports disconnect');
  assert.equal(statusB.at(-1), true, 'Follower reports its new live owner');
  assert.equal(closed, 1);
  assert.equal(sockets.length, 2, 'The follower becomes the new owner without opening two fallback sockets');
  sockets[1].emit(trade(2));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(receivedB, ['1', '2']);
  offB();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(statusB.at(-1), false, 'Final tab shutdown reports disconnect');
  assert.equal(closed, 2);
});

test('Shared Binance socket does not accept symbol mismatch or negative volume', () => {
  const originalSocket = globalThis.WebSocket;
  const sockets: Array<{ onopen?: () => void; onmessage?: (event: { data: string }) => void }> = [];
  class FakeSocket {
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    constructor(readonly url: string) {
      sockets.push(this);
      queueMicrotask(() => this.onopen?.());
    }
    close() {}
  }
  (globalThis as any).WebSocket = FakeSocket;
  const received: string[] = [];
  try {
    const stop = openSharedBinanceTradeSocket(
      { marketType: 'futures', symbol: 'BTCUSDT' }, row => received.push(row.id), () => {});
    const emit = (s: string, id: number, q: string) => {
      sockets[0].onmessage?.({ data: JSON.stringify({
        e: 'aggTrade', s, a: id, T: Date.now(), p: '100', q, m: false,
      }) });
    };
    emit('ETHUSDT', 1, '2');
    emit('BTCUSDT', 2, '-1');
    emit('BTCUSDT', 3, '2');
    assert.deepEqual(received, ['3']);
    stop.close();
  } finally {
    globalThis.WebSocket = originalSocket;
  }
});

test('opt-in verifier restarts after cooldown and verifies only a new continuous window',async()=>{
  let now=Date.now();
  const accepted:string[]=[]; const states:string[]=[];
  const feed=createVerifiedBinanceTrades({accept:t=>accepted.push(t.id),onIntegrity:s=>states.push(s),
    load:async()=>[],restartAfterMs:60_000,warmupMs:300_000,now:()=>now});
  const send=(id:number)=>feed.push({...trade(id),t:now});
  send(100);send(105);await new Promise(r=>setImmediate(r));
  assert.equal(feed.getIntegrity(),'incomplete');
  send(106);assert.deepEqual(accepted,['100']);
  now+=60_000;send(107);assert.equal(feed.getIntegrity(),'recovering');
  now+=299_999;send(108);assert.equal(feed.getIntegrity(),'recovering');
  now+=1;send(109);assert.equal(feed.getIntegrity(),'verified');
  assert.deepEqual(accepted,['100','107','108','109']);
  assert.deepEqual(states,['recovering','incomplete','recovering','verified']);
  feed.close();
});
