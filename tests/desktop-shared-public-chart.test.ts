import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createDesktopChartBridge, DESKTOP_CHART_TTL_MS,
  isShareableDesktopChartURL,
  type DesktopChartChannel, type DesktopChartLock,
} from '../src/utils/desktopSharedPublicChart';

const url = '/api/derivatives/oi/history?exchange=binance&symbol=BTCUSDT';
const trades = '/api/chart/trades24h?exchange=binance&symbol=BTCUSDT';
const result = {success:true,data:[{time:1_000_000,openInterest:123.25}]};
const abort = () => new AbortController().signal;
const sleep = (ms: number) => new Promise(resolve=>setTimeout(resolve,ms));

class Bus {
  private clients = new Set<{ listeners: Set<(event: MessageEvent<unknown>) => void> }>();
  channel(): DesktopChartChannel {
    const client = { listeners:new Set<(event:MessageEvent<unknown>)=>void>() };
    this.clients.add(client);
    return {
      postMessage: data => {
        for(const peer of this.clients) {
          if(peer === client) continue;
          queueMicrotask(()=>{for(const f of peer.listeners)f({data} as MessageEvent<unknown>);});
        }
      },
      addEventListener: (_type,f) => {client.listeners.add(f);},
      removeEventListener: (_type,f) => {client.listeners.delete(f);},
    };
  }
}
class Locks {
  private tail = new Map<string,Promise<void>>();
  readonly run:DesktopChartLock = async (key,task,signal) => {
    const previous = this.tail.get(key) || Promise.resolve();
    let release!:()=>void;
    const done = new Promise<void>(resolve => {release=resolve;});
    this.tail.set(key,previous.then(()=>done));
    await previous;
    try {signal.throwIfAborted();return await task();}
    finally {release();}
  };
}
test('only public, symbol-specific support URLs may be shared between Desktop panes',()=>{
  assert.equal(isShareableDesktopChartURL(url),true);
  assert.equal(isShareableDesktopChartURL(trades),true);
  assert.equal(isShareableDesktopChartURL('/api/market/av1m/coin?exchange=binance&market=futures&symbol=BTCUSDT'),true);
  for(const endpoint of [
    '/api/klines?symbol=BTCUSDT',
    '/api/market/av1m/top?symbol=BTCUSDT',
    '/api/market/av1m/coin?symbol=BTCUSDT&uid=abc',
    '/api/screener/scan?symbol=BTCUSDT',
    '/api/user/profile?symbol=BTCUSDT',
    '/api/chart/trades24h?symbol=BTCUSDT&token=secret',
    '/api/derivatives/oi/history?symbol=BTCUSDT&uid=abc',
    '/api/chart/trades24h',
    'https://h00k.top/api/chart/trades24h?symbol=BTCUSDT',
    '//example.com/api/chart/trades24h?symbol=BTCUSDT',
  ]) assert.equal(isShareableDesktopChartURL(endpoint),false,endpoint);
});

test('two simultaneous windows perform one public OI reference request',async()=>{
  const bus=new Bus(), locks=new Locks();
  const a=createDesktopChartBridge({channel:bus.channel(),lock:locks.run,now:()=>10_000,peerWaitMs:3});
  const b=createDesktopChartBridge({channel:bus.channel(),lock:locks.run,now:()=>10_000,peerWaitMs:3});
  let calls=0;
  const get=async()=>{calls++;await sleep(5);return result;};
  try {
    const [v1,v2]=await Promise.all([a.read(url,get,abort()),b.read(url,get,abort())]);
    assert.deepEqual(v1,result);
    assert.deepEqual(v2,result);
    assert.equal(calls,1);
  } finally {a.close();b.close();}
});

test('late joining Desktop pane reuses fresh reference data but not a different symbol',async()=>{
  const bus=new Bus();
  const a=createDesktopChartBridge({channel:bus.channel(),now:()=>20_000,peerWaitMs:3});
  let fetched=0;
  const get=async()=>{fetched++;return result;};
  await a.read(trades,get,abort());
  const b=createDesktopChartBridge({channel:bus.channel(),now:()=>20_000,peerWaitMs:3});
  try {
    assert.deepEqual(await b.read(trades,get,abort()),result);
    assert.equal(fetched,1);
    await b.read('/api/chart/trades24h?exchange=binance&symbol=ETHUSDT',get,abort());
    assert.equal(fetched,2);
  } finally {a.close();b.close();}
});

test('TTL expires and prevents reusing stale OI values even if another window is open',async()=>{
  const bus=new Bus();
  let time=100_000, count=0;
  const a=createDesktopChartBridge({channel:bus.channel(),now:()=>time,peerWaitMs:0});
  const get=async()=>{count++;return result;};
  try {
    await a.read(url,get,abort());
    await a.read(url,get,abort());
    assert.equal(count,1);
    time+=DESKTOP_CHART_TTL_MS+1;
    await a.read(url,get,abort());
    assert.equal(count,2);
  } finally {a.close();}
});

test('unavailable BroadcastChannel skips the Web Lock and fetches normally',async()=>{
  let usedLock=false, fetched=0;
  const a=createDesktopChartBridge({channel:null,lock:async (_k,job)=>{usedLock=true;return job();}});
  try {
    await a.read(url,async()=>{fetched++;return result;},abort());
    assert.equal(fetched,1);
    assert.equal(usedLock,false);
  } finally {a.close();}
});

test('malformed, stale or over-sized peer messages do not poison public data',async()=>{
  const bus=new Bus();
  let time=10_000, fetched=0;
  const a=createDesktopChartBridge({channel:bus.channel(),now:()=>time,peerWaitMs:0});
  const attacker=bus.channel();
  attacker.postMessage({type:'result',key:url,receivedAt:time, result:{success:false,error:'bad'}});
  attacker.postMessage({type:'result',key:trades,receivedAt:time-60_000,result});
  attacker.postMessage({type:'result',key:url,receivedAt:time, result:{success:true,data:['x'.repeat(70_000)]}});
  await Promise.resolve();
  const get=async()=>{fetched++;return result;};
  try {
    await a.read(url,get,abort());
    await a.read(trades,get,abort());
    assert.equal(fetched,2);
    time+=60_000;
    await a.read(url,get,abort());
    assert.equal(fetched,3);
  } finally {a.close();}
});

test('aborted waiting request never proceeds to remote fetch',async()=>{
  const bus=new Bus();
  const a=createDesktopChartBridge({channel:bus.channel(),peerWaitMs:500});
  const ctrl=new AbortController();
  let fetched=false;
  try {
    const pending=a.read(url,async()=>{fetched=true;return result;},ctrl.signal);
    ctrl.abort(new Error('cancelled'));
    await assert.rejects(pending,/cancelled/);
    assert.equal(fetched,false);
  } finally {a.close();}
});

test('integration is only enabled for Desktop and stays within existing HTTP deadline',()=>{
  const source=readFileSync(new URL('../src/utils/sharedChartRequests.ts',import.meta.url),'utf8');
  assert.match(source,/get\('h00kDesktop'\) === '1'/);
  assert.match(source,/isShareableDesktopChartURL\(url\)/);
  assert.match(source,/AbortSignal\.timeout\(Math\.max\(1, deadlineMs\)\)/);
  assert.match(source,/fetchChartJsonWithDeadline\(url, deadlineMs\)/);
});
