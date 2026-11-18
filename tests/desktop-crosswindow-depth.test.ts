import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createDesktopDepthBridge } from '../src/utils/desktopDepthBridge';
import { createSharedDepthSubscriptions } from '../src/components/hookchart/sharedDepthStream';
import type { DesktopKlineChannel, DesktopKlineLock } from '../src/utils/desktopKlineBridge';
import type { BookUpdate } from '../src/utils/binanceOrderBook';
import type { ChartDepthStatus } from '../src/utils/hookChartDepthProtocol';

const scope = { exchange:'binance' as const, marketType:'futures' as const, symbol:'BTCUSDT' };
const book=(sequence=100):BookUpdate=>({
  isSnapshot:true,sequence,eventTime:Date.now(),
  bids:[[99,4],[98,3]],asks:[[101,5],[102,3]],
});
const delta=(sequence=101):BookUpdate=>({
  isSnapshot:false,sequence,eventTime:Date.now(),
  bids:[[99,7]],asks:[[101,3]],
});
type Callbacks = (event:MessageEvent<unknown>)=>void;

function fakeWindows() {
  let offset=0;
  const windows=new Map<string,Set<{closed:boolean;events:Set<Callbacks>;deliver:(value:unknown)=>void}>>();
  const timers=new Set<()=>void>();
  const locks=new Map<string,{busy:boolean;queue:Array<{signal:AbortSignal;task:()=>Promise<void>;resolve:()=>void;reject:(e:unknown)=>void}>}>();
  const connected:Array<{options:{
    onBook:(value:BookUpdate)=>boolean;onStatus:(s:ChartDepthStatus)=>void
  };stopped:boolean}>=[];

  const createChannel=(name:string):DesktopKlineChannel=>{
    const peers=windows.get(name)||new Set();
    windows.set(name,peers);
    const item={closed:false,events:new Set<Callbacks>(),deliver(value:unknown){
      if (!item.closed)for(const cb of item.events)cb({data:value} as MessageEvent<unknown>);
    }};
    peers.add(item);
    return {
      postMessage(value){for(const peer of peers)if(peer!==item)peer.deliver(value);},
      addEventListener(_type,fn){item.events.add(fn);},
      removeEventListener(_type,fn){item.events.delete(fn);},
      close(){item.closed=true;peers.delete(item);},
    };
  };
  const lock:DesktopKlineLock=(name,signal,task)=>{
    const state=locks.get(name)||{busy:false,queue:[]};
    locks.set(name,state);
    return new Promise<void>((resolve,reject)=>{
      const entry={signal,task,resolve,reject};state.queue.push(entry);
      const advance=()=>{
        if(state.busy)return;
        while(state.queue.length){
          const current=state.queue.shift()!;
          if(current.signal.aborted){current.reject(new Error('aborted'));continue;}
          state.busy=true;
          void current.task().then(current.resolve,current.reject).finally(()=>{
            state.busy=false;advance();
          });
          return;
        }
      };
      signal.addEventListener('abort',()=>{
        const index=state.queue.indexOf(entry);
        if(index>=0){state.queue.splice(index,1);reject(new Error('aborted'));}
      },{once:true});
      advance();
    });
  };
  const newClient=()=>{
    const upstream=createSharedDepthSubscriptions(opts=>{
      const c={options:opts,stopped:false};
      connected.push(c);
      opts.onStatus('connecting');
      return ()=>{c.stopped=true;};
    });
    const bridge=createDesktopDepthBridge({
      createChannel,lock,source:upstream.subscribe,now:()=>Date.now()+offset,
      every(fn){timers.add(fn);return fn as unknown as ReturnType<typeof setInterval>;},
      cancelEvery(timer){timers.delete(timer as unknown as ()=>void);},
    });
    const manager=createSharedDepthSubscriptions(bridge.subscribe);
    return {subscribe:manager.subscribe,bridge};
  };
  const tick=(ms:number)=>{offset+=ms;for(const fn of [...timers])fn();};
  return {newClient,connected,tick,channels:windows};
}
async function flush(){await new Promise<void>(resolve=>setImmediate(resolve));}

test('two Desktop windows use only one depth WS and both accept the same complete book',async()=>{
  const t=fakeWindows(),a=t.newClient(),b=t.newClient();
  const booksA:BookUpdate[]=[],booksB:BookUpdate[]=[];
  const statusesA:ChartDepthStatus[]=[],statusesB:ChartDepthStatus[]=[];
  const offA=a.subscribe({...scope,onBook:x=>{booksA.push(x);return true;},onStatus:x=>statusesA.push(x)});
  const offB=b.subscribe({...scope,onBook:x=>{booksB.push(x);return true;},onStatus:x=>statusesB.push(x)});
  await flush();
  assert.equal(t.connected.length,1,'one upstream for one public scope across both windows');
  assert.equal(t.connected[0].options.onBook(book()),true);
  t.connected[0].options.onStatus('live');
  assert.equal(statusesA.at(-1),'live');
  assert.equal(statusesB.at(-1),'live');
  assert.equal(booksA.at(-1)?.isSnapshot,true);
  assert.equal(booksB.at(-1)?.isSnapshot,true);
  assert.equal(booksA.at(-1)?.sequence,100);
  assert.equal(booksB.at(-1)?.sequence,100);
  assert.deepEqual(booksA.at(-1)?.bids,[[99,4],[98,3]]);
  assert.deepEqual(booksB.at(-1)?.asks,[[101,5],[102,3]]);
  assert.equal(t.connected[0].options.onBook(delta()),true);
  assert.equal(booksA.at(-1)?.sequence,101);
  assert.equal(booksB.at(-1)?.sequence,101);
  offA();offB();await flush();
  assert.equal(t.connected[0].stopped,true);
  assert.equal(a.bridge.activeScopes()+b.bridge.activeScopes(),0);
});

test('late joining Desktop pane receives a fresh snapshot before LIVE, not an orphan delta',async()=>{
  const t=fakeWindows(),a=t.newClient(),b=t.newClient();
  const offA=a.subscribe({...scope,onBook:()=>true,onStatus:()=>{}});
  await flush();
  t.connected[0].options.onBook(book());
  t.connected[0].options.onStatus('live');
  const received:BookUpdate[]=[],statuses:ChartDepthStatus[]=[];
  const offB=b.subscribe({...scope,
    onBook:update=>{received.push(update);return true;},
    onStatus:status=>statuses.push(status)});
  await flush();
  assert.equal(t.connected.length,1);
  assert.equal(received[0]?.isSnapshot,true);
  assert.equal(received[0]?.sequence,100);
  assert.equal(statuses.at(-1),'live');
  offA();offB();
});

test('a third window joining does not reset the already-live second window density book',async()=>{
  const t=fakeWindows(),a=t.newClient(),b=t.newClient(),c=t.newClient();
  const booksB:BookUpdate[]=[],statusesB:ChartDepthStatus[]=[];
  const offA=a.subscribe({...scope,onBook:()=>true,onStatus:()=>{}});
  const offB=b.subscribe({...scope,
    onBook:x=>{booksB.push(x);return true;},
    onStatus:x=>statusesB.push(x)});
  await flush();
  t.connected[0].options.onBook(book());
  t.connected[0].options.onStatus('live');
  assert.equal(booksB.length,1);
  const bookBefore=booksB.length, statusBefore=statusesB.length;
  const booksC:BookUpdate[]=[];
  const offC=c.subscribe({...scope,
    onBook:x=>{booksC.push(x);return true;},onStatus:()=>{}});
  await flush();
  assert.equal(booksC.length,1);
  assert.equal(booksC[0].isSnapshot,true);
  assert.equal(booksB.length,bookBefore,'joining a new tab must not replay a snapshot into an existing tab');
  assert.equal(statusesB.length,statusBefore,'a healthy tab must remain LIVE during another tab join');
  offA();offB();offC();await flush();
});

test('missed IPC delta triggers a complete fresh book repair before LIVE',async()=>{
  const t=fakeWindows(),a=t.newClient(),b=t.newClient();
  const received:BookUpdate[]=[],statuses:ChartDepthStatus[]=[];
  const offA=a.subscribe({...scope,onBook:()=>true,onStatus:()=>{}});
  const offB=b.subscribe({...scope,onBook:x=>{received.push(x);return true;},
    onStatus:x=>statuses.push(x)});
  await flush();
  t.connected[0].options.onBook(book(100));
  t.connected[0].options.onStatus('live');
  assert.equal(received.at(-1)?.sequence,100);
  const peers=t.channels.get('h00k-desktop-public-depth-v1:|binance:futures:BTCUSDT');
  assert.ok(peers && peers.size===2);
  const follower=[...peers][1];
  const original=follower.deliver;
  follower.deliver=()=>{}; // Simulate an IPC broadcast lost while tab is frozen.
  t.connected[0].options.onBook(delta(101));
  follower.deliver=original;
  const statesBefore=statuses.length;
  t.connected[0].options.onBook({isSnapshot:false,sequence:102,eventTime:Date.now(),
    bids:[],asks:[[101,1]]});
  assert.ok(statuses.slice(statesBefore).includes('reconnecting'),
    'a gap must explicitly withdraw the old LIVE book');
  assert.equal(received.at(-1)?.isSnapshot,true,'repair must be a full snapshot, never an orphan delta');
  assert.equal(received.at(-1)?.sequence,102);
  assert.deepEqual(received.at(-1)?.bids,[[99,7],[98,3]]);
  assert.deepEqual(received.at(-1)?.asks,[[101,1],[102,3]]);
  assert.equal(statuses.at(-1),'live');
  offA();offB();await flush();
});

test('leader exit transfers lock and requires a fresh book before new LIVE status',async()=>{
  const t=fakeWindows(),a=t.newClient(),b=t.newClient(),c=t.newClient();
  const statuses:ChartDepthStatus[]=[];
  const cBooks:BookUpdate[]=[];
  const offA=a.subscribe({...scope,onBook:()=>true,onStatus:()=>{}});
  const offB=b.subscribe({...scope,onBook:()=>true,onStatus:()=>{}});
  const offC=c.subscribe({...scope,
    onBook:update=>{cBooks.push(update);return true;},
    onStatus:status=>statuses.push(status)});
  await flush();
  t.connected[0].options.onBook(book());
  t.connected[0].options.onStatus('live');
  assert.equal(statuses.at(-1),'live');
  offA();await flush();await flush();
  assert.equal(t.connected[0].stopped,true);
  assert.equal(t.connected.length,2);
  assert.notEqual(statuses.at(-1),'live','closing previous owner withdraws its book');
  t.connected[1].options.onBook(book(300));
  t.connected[1].options.onStatus('live');
  assert.equal(cBooks.at(-1)?.sequence,300);
  assert.equal(statuses.at(-1),'live');
  offB();offC();await flush();
});

test('silent leader never leaves a stuck LIVE book: follower falls back',async()=>{
  const t=fakeWindows(),a=t.newClient(),b=t.newClient();
  const statuses:ChartDepthStatus[]=[];
  const offA=a.subscribe({...scope,onBook:()=>true,onStatus:()=>{}});
  const offB=b.subscribe({...scope,onBook:()=>true,onStatus:s=>statuses.push(s)});
  await flush();
  t.connected[0].options.onBook(book());
  t.connected[0].options.onStatus('live');
  assert.equal(statuses.at(-1),'live');
  t.tick(8_000);
  assert.notEqual(statuses.at(-1),'live','stale depth must not remain LIVE');
  assert.equal(t.connected.length,2,'follower must open its own WS on stale leader');
  offA();offB();await flush();
});

test('a healthy fail-open depth connection ignores errors from the obsolete shared owner',async()=>{
  const t=fakeWindows(),a=t.newClient(),b=t.newClient();
  const statuses:ChartDepthStatus[]=[],books:BookUpdate[]=[];
  const offA=a.subscribe({...scope,onBook:()=>true,onStatus:()=>{}});
  const offB=b.subscribe({...scope,onBook:x=>{books.push(x);return true;},
    onStatus:s=>statuses.push(s)});
  await flush();
  t.connected[0].options.onBook(book(100));
  t.connected[0].options.onStatus('live');
  t.tick(8_000);
  assert.equal(t.connected.length,2,'follower must have entered fail-open mode');
  t.connected[1].options.onBook(book(200));
  t.connected[1].options.onStatus('live');
  assert.equal(statuses.at(-1),'live');
  assert.equal(books.at(-1)?.sequence,200);
  t.connected[0].options.onStatus('reconnecting');
  assert.equal(statuses.at(-1),'live',
    "the obsolete owner\'s offline status cannot clear a healthy local book");
  assert.equal(books.at(-1)?.sequence,200);
  offA();offB();await flush();
});

test('scope isolates coin, market and exchange; normal site retains its own transport',async()=>{
  const t=fakeWindows(),scopes=[
    scope,{...scope,symbol:'ETHUSDT'},
    {...scope,marketType:'spot' as const},
    {...scope,exchange:'bybit' as const},
  ];
  const clients=scopes.map(()=>t.newClient());
  const stops=scopes.map((s,i)=>clients[i].subscribe({...s,onBook:()=>true,onStatus:()=>{}}));
  await flush();
  assert.equal(t.connected.length,4);
  stops.forEach(stop=>stop());
  const src=readFileSync(new URL('../src/components/hookchart/sharedDepthStream.ts',import.meta.url),'utf8');
  // Public depth may be shared by Desktop windows or by supported HTTP(S)
  // browser tabs. Unsupported environments must retain the local fallback.
  assert.ok(src.includes("get('h00kDesktop') === '1'") ||
    src.includes("/^https?:$/.test(window.location.protocol)"));
  assert.match(src,/navigator\.locks\?\.request/);
  assert.match(src,/return defaultDepthManager\.subscribe\(options\)/);
  assert.match(src,/createSharedDepthSubscriptions\(bridge\.subscribe\)/);
});


for (const panes of [1, 2, 4, 6]) {
  test(panes + ' simultaneous Desktop order books share one source and resync after owner exit', async () => {
    const transport = fakeWindows();
    const clients = Array.from({ length: panes }, () => transport.newClient());
    const books: BookUpdate[][] = Array.from({ length: panes }, () => []);
    const statuses: ChartDepthStatus[][] = Array.from({ length: panes }, () => []);
    const stops = clients.map((client, i) => client.subscribe({
      ...scope,
      onBook: update => { books[i].push(update); return true; },
      onStatus: status => statuses[i].push(status),
    }));
    await flush();
    assert.equal(transport.connected.length, 1, 'one canonical upstream depth stream');
    transport.connected[0].options.onBook(book(100));
    transport.connected[0].options.onStatus('live');
    transport.connected[0].options.onBook(delta(101));
    for (let i = 0; i < panes; i++) {
      assert.deepEqual(books[i].map(row => row.sequence), [100, 101]);
      assert.equal(statuses[i].at(-1), 'live');
    }
    if (panes > 1) {
      stops[0](); await flush(); await flush();
      assert.equal(transport.connected[0].stopped, true);
      assert.equal(transport.connected.length, 2,
        'one surviving renderer acquires the new depth Web Lock');
      transport.connected[1].options.onBook(book(300));
      transport.connected[1].options.onStatus('live');
      for (let i = 1; i < panes; i++) {
        assert.equal(books[i].at(-1)?.sequence, 300,
          'all remaining panes require a fresh canonical snapshot');
        assert.equal(books[i].at(-1)?.isSnapshot, true);
        assert.equal(statuses[i].at(-1), 'live');
      }
    }
    for (const stop of stops.slice(panes > 1 ? 1 : 0)) stop();
    await flush();
    assert.equal(clients.reduce((sum, client) => sum + client.bridge.activeScopes(), 0), 0);
    assert.equal(transport.connected.every(item => item.stopped), true,
      'no depth WS remains active after closing all renderer panes');
  });
}
