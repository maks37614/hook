import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createDesktopLiquidationBridge, type DesktopLiqChannel,
  type DesktopLiqLock, type DesktopLiqScope,
} from '../src/components/hookchart/desktopLiquidationBridge';
import type { Liquidation } from '../src/components/hookchart/engine';

const clock = 1_800_000_000_000;
const scope = { exchange: 'binance' as const, symbol: 'BTCUSDT' };
const event = (id: string, usd: number): Liquidation => ({
  id, t: clock - 1000, p: 100, q: usd / 100, usd, side: 'LONG',
});
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

function transport() {
  let time = clock;
  type Receiver = (packet: MessageEvent<unknown>) => void;
  const channels = new Map<string, Set<{ listeners: Set<Receiver>; closed: boolean }>>();
  const queues = new Map<string, {busy: boolean; queue: Array<{
    signal: AbortSignal; job: () => Promise<void>;
    resolve: () => void; reject: (reason: unknown) => void;
  }> }>();
  const ticks = new Set<() => void>();
  let dropNextEvent = false;
  const sources: Array<{ options: DesktopLiqScope; closed: boolean }> = [];

  const createChannel = (name: string): DesktopLiqChannel => {
    const peers = channels.get(name) ?? new Set();
    channels.set(name, peers);
    const self = { listeners: new Set<Receiver>(), closed: false };
    peers.add(self);
    return {
      postMessage(packet) {
        if (dropNextEvent && (packet as {type?: string})?.type === 'event') {
          dropNextEvent = false;
          return; // Simulate one lost Chromium IPC liquidation broadcast.
        }
        for (const other of peers) {
          if (other === self || other.closed) continue;
          for (const listener of [...other.listeners]) listener({data:packet} as MessageEvent<unknown>);
        }
      },
      addEventListener(_type, callback) { self.listeners.add(callback); },
      removeEventListener(_type, callback) { self.listeners.delete(callback); },
      close() { self.closed = true; peers.delete(self); },
    };
  };
  const lock: DesktopLiqLock = (name, signal, job) => {
    const group = queues.get(name) ?? {busy:false,queue:[]};
    queues.set(name,group);
    return new Promise<void>((resolve,reject)=>{
      const item = { signal, job, resolve, reject };
      group.queue.push(item);
      const next = () => {
        if (group.busy) return;
        while(group.queue.length) {
          const head = group.queue.shift()!;
          if(head.signal.aborted){head.reject(new Error('aborted'));continue;}
          group.busy=true;
          void head.job().then(head.resolve,head.reject).finally(()=>{group.busy=false;next();});
          break;
        }
      };
      signal.addEventListener('abort',()=> {
        const index=group.queue.indexOf(item);
        if(index>=0) {group.queue.splice(index,1); reject(new Error('aborted'));}
      },{once:true});
      next();
    });
  };
  const opts = {
    createChannel, lock, now: () => time,
    every(callback: () => void, _ms: number) {
      ticks.add(callback);
      return callback as unknown as ReturnType<typeof setInterval>;
    },
    cancelEvery(timer: ReturnType<typeof setInterval>) {
      ticks.delete(timer as unknown as () => void);
    },
    source(options: DesktopLiqScope) {
      const item = {options,closed:false};
      sources.push(item);
      return () => {item.closed=true;};
    },
  };
  return {
    opts, sources,
    loseNextEvent() {dropNextEvent = true;},
    tick(ms: number) {time+=ms;for(const callback of [...ticks])callback();},
    now:()=>time,
  };
}

test('two Desktop panes share one source and fan out real snapshots and cumulative events',async()=>{
  const t=transport();
  const a=createDesktopLiquidationBridge(t.opts), b=createDesktopLiquidationBridge(t.opts);
  const receivedA:Liquidation[]=[], receivedB:Liquidation[]=[];
  const snapsB:Liquidation[][]=[];
  const offA=a.subscribe({...scope,
    onSnapshot:()=>{}, onLiquidation:row=>receivedA.push(row),onStatus:()=>{}});
  const offB=b.subscribe({...scope,
    onSnapshot:rows=>snapsB.push(rows),onLiquidation:row=>receivedB.push(row),onStatus:()=>{}});
  await flush();
  assert.equal(t.sources.length,1);
  t.sources[0].options.onSnapshot([event('li-1',1000)],true);
  assert.deepEqual(snapsB.at(-1),[event('li-1',1000)]);
  t.sources[0].options.onLiquidation(event('li-1',2500));
  t.sources[0].options.onLiquidation(event('li-1',2500));
  t.sources[0].options.onLiquidation(event('li-2',500));
  assert.equal(receivedA.length,2);
  assert.equal(receivedB.length,2);
  assert.equal(receivedB[0].usd,2500);
  offA();
  assert.equal(t.sources[0].closed,true);
  await flush();
  assert.equal(t.sources.length,2);
  offB();await flush();
  assert.equal(t.sources[1].closed,true);
});

test('quiet Desktop liquidation market expires old rows before a new chart joins',async()=>{
  const t=transport();
  const bridge=createDesktopLiquidationBridge(t.opts);
  const source={...scope,onSnapshot:()=>{},onLiquidation:()=>{},onStatus:()=>{}};
  const stopA=bridge.subscribe(source);
  await flush();
  t.sources[0].options.onSnapshot([event('expired-before-join',1000)],true);
  // No new events arrive for 31 minutes, yet the socket remains connected.
  t.tick(31*60_000);
  const rows: Liquidation[][]=[];
  const stopB=bridge.subscribe({...scope,
    ...source,
    onSnapshot:values=>rows.push(values),
  });
  assert.equal(t.sources.length,1,'new chart still reuses one upstream WS');
  assert.deepEqual(rows.at(-1),[],'expired Liq must not reappear in new graph');
  assert.equal(bridge.activeScopes(),1);
  stopA();stopB();await flush();
});

test('the first new liquidation after a long idle period prunes stale cached Liq',async()=>{
  const t=transport();
  const leader=createDesktopLiquidationBridge(t.opts);
  const stopA=leader.subscribe({...scope,
    onSnapshot:()=>{},onLiquidation:()=>{},onStatus:()=>{}});
  await flush();
  t.sources[0].options.onSnapshot([event('stale-1',1000)],true);
  t.tick(31*60_000);
  const fresh={...event('fresh-2',2000),t:t.now()-500};
  t.sources[0].options.onLiquidation(fresh);
  const rows:Liquidation[][]=[];
  const stopB=leader.subscribe({...scope,
    onSnapshot:values=>rows.push(values),onLiquidation:()=>{},onStatus:()=>{}});
  assert.deepEqual(rows.at(-1)?.map(value=>value.id),['fresh-2']);
  stopA();stopB();await flush();
});

test('late Desktop pane receives a real previously delivered snapshot, not fabricated live events',async()=>{
  const t=transport();
  const a=createDesktopLiquidationBridge(t.opts);
  const offA=a.subscribe({...scope,onSnapshot:()=>{},onLiquidation:()=>{},onStatus:()=>{}});
  await flush();
  t.sources[0].options.onSnapshot([event('li-1',1000)],true);
  t.sources[0].options.onLiquidation(event('li-1',3000));
  const b=createDesktopLiquidationBridge(t.opts);
  const snapshots:Liquidation[][]=[];
  const offB=b.subscribe({...scope,onSnapshot:rows=>snapshots.push(rows),
    onLiquidation:()=>{},onStatus:()=>{}});
  await flush();
  assert.equal(t.sources.length,1);
  assert.equal(snapshots.length,1);
  assert.equal(snapshots[0][0].usd,3000);
  offA();offB();await flush();
});

test('a missed IPC liquidation event triggers targeted snapshot recovery and preserves Liq amounts',async()=>{
  const t=transport();
  const a=createDesktopLiquidationBridge(t.opts), b=createDesktopLiquidationBridge(t.opts);
  const snapshotsA:Liquidation[][]=[],snapshotsB:Liquidation[][]=[];
  const eventsB:Liquidation[]=[];
  const offA=a.subscribe({...scope,onSnapshot:rows=>snapshotsA.push(rows),
    onLiquidation:()=>{},onStatus:()=>{}});
  const offB=b.subscribe({...scope,onSnapshot:rows=>snapshotsB.push(rows),
    onLiquidation:row=>eventsB.push(row),onStatus:()=>{}});
  await flush();
  assert.equal(t.sources.length,1);
  t.sources[0].options.onSnapshot([],true);
  assert.equal(snapshotsB.length,1);
  t.loseNextEvent();
  t.sources[0].options.onLiquidation(event('missed-1',1500));
  assert.equal(eventsB.length,0,'lost event must not silently be counted');
  t.sources[0].options.onLiquidation(event('visible-2',2500));
  assert.equal(t.sources.length,1,'repair must not create a second WebSocket');
  assert.equal(eventsB.length,0,'resync must not count the same event twice');
  assert.equal(snapshotsB.length,2,'only the affected pane receives repair snapshot');
  assert.equal(snapshotsA.length,1,'the owner must not resnapshot its healthy chart');
  assert.deepEqual(snapshotsB.at(-1)?.map(row=>[row.id,row.usd]),
    [['missed-1',1500],['visible-2',2500]]);
  t.sources[0].options.onLiquidation(event('next-3',800));
  assert.deepEqual(eventsB.map(row=>row.id),['next-3']);
  offA();offB();await flush();
});

test('joining a third Desktop pane does not replay old snapshots into existing panes',async()=>{
  const t=transport();
  const a=createDesktopLiquidationBridge(t.opts), b=createDesktopLiquidationBridge(t.opts);
  let receivedB=0;
  const offA=a.subscribe({...scope,onSnapshot:()=>{},onLiquidation:()=>{},onStatus:()=>{}});
  const offB=b.subscribe({...scope,onSnapshot:()=>{receivedB++;},onLiquidation:()=>{},onStatus:()=>{}});
  await flush();
  t.sources[0].options.onSnapshot([event('li-1',1000)],true);
  assert.equal(receivedB,1);
  const c=createDesktopLiquidationBridge(t.opts);
  const receivedC:Liquidation[][]=[];
  const offC=c.subscribe({...scope,onSnapshot:rows=>receivedC.push(rows),
    onLiquidation:()=>{},onStatus:()=>{}});
  await flush();
  assert.equal(receivedB,1,'only the new pane should replay a full snapshot');
  assert.equal(receivedC.length,1);
  assert.equal(receivedC[0][0].id,'li-1');
  assert.equal(t.sources.length,1);
  offA();offB();offC();await flush();
});

test('no snapshot or missing owner triggers real network fallback, then verified recovery',async()=>{
  const t=transport();
  const a=createDesktopLiquidationBridge(t.opts), b=createDesktopLiquidationBridge(t.opts);
  const snapshots:Liquidation[][]=[];
  const offA=a.subscribe({...scope,onSnapshot:()=>{},onLiquidation:()=>{},onStatus:()=>{}});
  const offB=b.subscribe({...scope,
    onSnapshot:rows=>snapshots.push(rows),onLiquidation:()=>{},onStatus:()=>{}});
  await flush();
  assert.equal(t.sources.length,1);
  for(let i=0;i<9;i++)t.tick(2_000);
  assert.equal(t.sources.length,2,'leader heartbeat without initial snapshot cannot suppress fallback');
  t.sources[1].options.onSnapshot([event('li-1',2500)],true);
  assert.equal(snapshots.at(-1)?.[0]?.usd,2500);
  t.sources[0].options.onSnapshot([event('li-1',1000),event('li-2',500)],true);
  assert.equal(t.sources[1].closed,true,'healthy owner snapshot restores shared connection');
  assert.equal(snapshots.at(-1)?.find(x=>x.id==='li-1')?.usd,2500,
    'older owner snapshot never rolls cumulative order value backward');
  offA();offB();await flush();
});

test('live heartbeat never conceals an offline liquidation relay forever',async()=>{
  const t=transport();
  const a=createDesktopLiquidationBridge(t.opts), b=createDesktopLiquidationBridge(t.opts);
  const blank={onSnapshot:()=>{},onLiquidation:()=>{},onStatus:()=>{}};
  const stopA=a.subscribe({...scope,...blank});
  const stopB=b.subscribe({...scope,...blank});
  await flush();
  t.sources[0].options.onSnapshot([],true);
  t.sources[0].options.onStatus(false);
  for(let i=0;i<9;i++)t.tick(2_000);
  assert.equal(t.sources.length,2,
    'silent / disconnected relay must not block a follower from opening its own network recovery');
  stopA();stopB();await flush();
});

test('offline owner snapshot never downgrades a genuine live recovery feed',async()=>{
  const t=transport();
  const a=createDesktopLiquidationBridge(t.opts), b=createDesktopLiquidationBridge(t.opts);
  const blank={onSnapshot:()=>{},onLiquidation:()=>{},onStatus:()=>{}};
  const statuses:boolean[]=[];
  const stopA=a.subscribe({...scope,...blank});
  const stopB=b.subscribe({...scope,...blank,
    onSnapshot:(_rows,live)=>statuses.push(live), onStatus:live=>statuses.push(live)});
  await flush();
  for(let i=0;i<9;i++)t.tick(2_000);
  assert.equal(t.sources.length,2);
  t.sources[1].options.onSnapshot([event('li-1',2500)],true);
  assert.equal(statuses.at(-1),true);
  t.sources[0].options.onSnapshot([event('li-1',1000)],false);
  assert.equal(statuses.at(-1),true,
    'offline owner snapshot is not allowed to suppress the verified native backup');
  assert.equal(t.sources[1].closed,false);
  t.sources[0].options.onSnapshot([event('li-1',3000)],true);
  assert.equal(t.sources[1].closed,true);
  stopA();stopB();await flush();
});

test('Unicode exchange pair shares market while malformed scope uses original connector',async()=>{
  const t=transport();
  const a=createDesktopLiquidationBridge(t.opts), b=createDesktopLiquidationBridge(t.opts);
  const symbol='龙虾USDT';
  const none={onSnapshot:()=>{},onLiquidation:()=>{},onStatus:()=>{}};
  const x=a.subscribe({...scope,symbol,...none});
  const y=b.subscribe({...scope,symbol,...none});
  await flush();
  assert.equal(t.sources.length,1);
  x();y();await flush();
  const v=a.subscribe({...scope,symbol:'BTC/USDT',...none});
  const w=b.subscribe({...scope,symbol:'BTC/USDT',...none});
  await flush();
  assert.equal(t.sources.length,3);
  v();w();await flush();
});

test('events never become authoritative before receiving an actual snapshot',async()=>{
  const t=transport();
  const a=createDesktopLiquidationBridge(t.opts), b=createDesktopLiquidationBridge(t.opts);
  const got:Liquidation[]=[];
  const none={onSnapshot:()=>{},onLiquidation:()=>{},onStatus:()=>{}};
  const x=a.subscribe({...scope,...none});
  const y=b.subscribe({...scope,...none,onLiquidation:row=>got.push(row)});
  await flush();
  t.sources[0].options.onLiquidation(event('li-1',1000));
  assert.equal(got.length,0);
  t.sources[0].options.onSnapshot([event('li-1',1000)],true);
  t.sources[0].options.onLiquidation(event('li-2',2000));
  assert.equal(got.length,1);
  t.sources[0].options.onStatus(false);
  t.sources[0].options.onLiquidation(event('disconnected-3',3000));
  assert.equal(got.length,1,'a disconnected relay cannot publish Liq as live');
  t.sources[0].options.onSnapshot([event('li-1',1000),event('li-2',2000)],true);
  t.sources[0].options.onLiquidation(event('reconnected-4',4000));
  assert.equal(got.length,2,'a verified new snapshot restores streaming');
  assert.equal(got.at(-1)?.id,'reconnected-4');
  x();y();await flush();
});

test('skewed Windows clock does not discard a valid live exchange liquidation',async()=>{
  const t=transport();
  const a=createDesktopLiquidationBridge(t.opts), b=createDesktopLiquidationBridge(t.opts);
  const got:Liquidation[]=[];
  const none={onSnapshot:()=>{},onLiquidation:()=>{},onStatus:()=>{}};
  const offA=a.subscribe({...scope,...none});
  const offB=b.subscribe({...scope,...none,onLiquidation:r=>got.push(r)});
  await flush();
  t.sources[0].options.onSnapshot([],true);
  const actual={...event('ahead-1',777),t:clock+3*60_000};
  t.sources[0].options.onLiquidation(actual);
  assert.deepEqual(got,[actual]);
  offA();offB();await flush();
});

test('regular browser and unsupported Web Locks keep the previous site transport',()=>{
  const source=readFileSync(new URL('../src/components/hookchart/sharedLiquidationStream.ts',import.meta.url),'utf8');
  assert.match(source,/get\('h00kDesktop'\) === '1'/);
  assert.match(source,/!navigator\.locks\?\.request/);
  assert.match(source,/browserLiquidationSubscriptions\.subscribe\(options\)/);
  assert.match(source,/new BroadcastChannel\(name\)/);
});


for (const panes of [1, 2, 4, 6]) {
  test(panes + ' simultaneous Desktop Liq panes share one source and never duplicate cumulative orders', async () => {
    const market = transport();
    const clients = Array.from({ length: panes },
      () => createDesktopLiquidationBridge(market.opts));
    const received: Liquidation[][] = Array.from({ length: panes }, () => []);
    const snapshots: Liquidation[][][] = Array.from({ length: panes }, () => []);
    const stops = clients.map((client, i) => client.subscribe({
      ...scope,
      onSnapshot: rows => snapshots[i].push(rows),
      onLiquidation: row => received[i].push(row),
      onStatus: () => {},
    }));
    await flush();
    assert.equal(market.sources.length, 1, 'one upstream liquidation source for all panes');
    market.sources[0].options.onSnapshot([event('order-1', 1000)], true);
    market.sources[0].options.onLiquidation(event('order-1', 2500));
    market.sources[0].options.onLiquidation(event('order-1', 2500)); // repeated fill
    market.sources[0].options.onLiquidation(event('order-2', 500));
    for (let i = 0; i < panes; i++) {
      assert.equal(snapshots[i].some(rows => rows.some(row => row.id === 'order-1')), true);
      assert.deepEqual(received[i].map(row => row.usd), [2500, 500],
        'cumulative liquidation must never count twice per pane');
    }
    if (panes > 1) {
      stops[0](); await flush(); await flush();
      assert.equal(market.sources[0].closed, true);
      assert.equal(market.sources.length, 2, 'one replacement owner opens after lock handover');
      market.sources[1].options.onSnapshot(
        [event('order-1', 2500), event('order-2', 500)], true);
      market.sources[1].options.onLiquidation(event('order-3', 700));
      for (let i = 1; i < panes; i++) {
        assert.deepEqual(received[i].map(row => row.id),
          ['order-1', 'order-2', 'order-3'],
          'failover restores all panes without duplicate liquidation rows');
      }
    }
    for (const stop of stops.slice(panes > 1 ? 1 : 0)) stop();
    await flush();
    assert.equal(clients.reduce((sum, client) => sum + client.activeScopes(), 0), 0);
    assert.equal(market.sources.every(item => item.closed), true,
      'closing last pane releases the shared Liq upstream');
  });
}
