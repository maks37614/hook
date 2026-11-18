import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import type WebSocket from 'ws';
import { SharedLiquidationUpstreamPool } from '../server/liquidationUpstreamPool';

class FakeSocket extends EventEmitter {
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = 0;
  sent: string[] = [];
  terminated = false;
  constructor(readonly url: string) { super(); }
  open() { this.readyState = 1; this.emit('open'); }
  send(payload: string) {
    assert.equal(this.readyState, 1);
    this.sent.push(String(payload));
  }
  feed(payload: unknown) { this.emit('message', Buffer.from(JSON.stringify(payload))); }
  terminate() {
    this.terminated = true;
    this.readyState = 3;
    this.emit('close');
  }
}

function harness(maxTopics = 64) {
  const sockets: FakeSocket[] = [];
  const pool = new SharedLiquidationUpstreamPool(url => {
    const ws = new FakeSocket(url);
    sockets.push(ws);
    return ws as unknown as WebSocket;
  }, maxTopics);
  return { pool, sockets };
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const frame = (socket: FakeSocket) => {
  const first = JSON.parse(socket.sent[0]);
  return first;
};

test('256 separate markets use only four pooled exchange sockets, not 256', () => {
  const { pool, sockets } = harness();
  const release = Array.from({length: 256}, (_, i) =>
    pool.subscribe(i < 128 ? 'binance' : 'bybit', 'ALT' + i + 'USDT',
      {onPacket() {}, onStatus() {}}));
  assert.equal(sockets.length, 4);
  assert.equal(pool.stats().subscribedTopics, 256);
  assert.equal(pool.stats().shards, 4);
  for (const dispose of release) dispose();
  assert.equal(pool.stats().upstreamSockets, 0);
  assert.equal(pool.stats().shards, 0);
  assert.ok(sockets.every(socket => socket.terminated));
});

test('Binance combined stream routes only matching symbol and only after subscription ACK', async () => {
  const {pool,sockets} = harness();
  const seen: Record<string, unknown[]> = {BTCUSDT:[], ETHUSDT:[]};
  const status: boolean[] = [];
  const disposeBtc = pool.subscribe('binance', 'BTCUSDT', {
    onPacket:p => seen.BTCUSDT.push(p), onStatus:s => status.push(s),
  });
  const disposeEth = pool.subscribe('binance', 'ETHUSDT', {
    onPacket:p => seen.ETHUSDT.push(p), onStatus() {},
  });
  assert.equal(sockets.length, 1);
  sockets[0].open();
  await sleep(260);
  const cmd = frame(sockets[0]);
  assert.equal(cmd.method,'SUBSCRIBE');
  assert.deepEqual(cmd.params,['btcusdt@forceOrder','ethusdt@forceOrder']);
  assert.deepEqual(status,[false]);
  sockets[0].feed({id:cmd.id,result:null});
  assert.deepEqual(status,[false,true]);
  const raw = {e:'forceOrder',o:{s:'BTCUSDT',T:Date.now(),p:'70000',q:'1',S:'SELL'}};
  sockets[0].feed({stream:'btcusdt@forceOrder',data:raw});
  sockets[0].feed({stream:'invalid@forceOrder',data:{...raw,o:{...raw.o,s:'DOGEUSDT'}}});
  assert.equal(seen.BTCUSDT.length,1);
  assert.equal(seen.ETHUSDT.length,0);
  disposeBtc();
  await sleep(260);
  assert.equal(JSON.parse(sockets[0].sent.at(-1)!).method,'UNSUBSCRIBE');
  assert.equal(sockets[0].terminated,false,'socket survives removal of one symbol');
  disposeEth();
  assert.equal(sockets[0].terminated,true,'last removal closes and releases timers');
});

test('Bybit multiplex demultiplexes topics, reports bad subscriptions and respects ping', async () => {
  const {pool,sockets} = harness();
  const events: string[]=[];
  const statuses: string[]=[];
  const closeA=pool.subscribe('bybit','BTCUSDT',{
    onPacket:p=>events.push(JSON.stringify(p)),onStatus:s=>statuses.push('BTC='+s),
  });
  const closeB=pool.subscribe('bybit','ETHUSDT',{
    onPacket:p=>events.push(JSON.stringify(p)),onStatus:s=>statuses.push('ETH='+s),
  });
  assert.equal(sockets.length,1);
  sockets[0].open();
  await sleep(260);
  const command=frame(sockets[0]);
  assert.equal(command.op,'subscribe');
  assert.deepEqual(command.args,['allLiquidation.BTCUSDT','allLiquidation.ETHUSDT']);
  sockets[0].feed({op:'subscribe',req_id:command.req_id,success:true});
  assert.ok(statuses.includes('BTC=true'));
  assert.ok(statuses.includes('ETH=true'));
  const packet={topic:'allLiquidation.ETHUSDT',data:[{
    s:'ETHUSDT',T:Date.now(),S:'Buy',p:'2500',v:'3',
  }]};
  sockets[0].feed(packet);
  sockets[0].feed({...packet,topic:'allLiquidation.XRPUSDT'});
  assert.equal(events.length,1);
  assert.equal(JSON.parse(events[0]).topic,'allLiquidation.ETHUSDT');
  closeA();closeB();pool.close();
});

test('upstream disconnect propagates status and cleans up retries after unsubscribe', async () => {
  const {pool,sockets} = harness();
  const statuses: boolean[] = [];
  const dispose=pool.subscribe('binance','BTCUSDT',{
    onPacket() {},onStatus:x=>statuses.push(x),
  });
  sockets[0].open();
  await sleep(260);
  const command=frame(sockets[0]);
  sockets[0].feed({id:command.id,result:null});
  assert.deepEqual(statuses,[false,true]);
  sockets[0].terminate();
  assert.deepEqual(statuses,[false,true,false]);
  dispose();
  assert.equal(pool.stats().shards,0);
  await sleep(1700);
  assert.equal(sockets.length,1,'no background socket reconnect after viewer leaves');
});

test('malformed packets cannot mark liquidation topics live without provider ACK', () => {
  const bin = harness();
  const binStatuses: boolean[] = [];
  const binPackets: unknown[] = [];
  const stopBin = bin.pool.subscribe('binance', 'BTCUSDT', {
    onStatus: state => binStatuses.push(state),
    onPacket: data => binPackets.push(data),
  });
  bin.sockets[0].open();
  bin.sockets[0].feed({ stream: 'btcusdt@forceOrder',
    data: { e: 'aggTrade', o: { s: 'BTCUSDT', S: 'SELL' } } });
  assert.deepEqual(binStatuses, [false]);
  assert.equal(binPackets.length, 0);
  bin.sockets[0].feed({ stream: 'btcusdt@forceOrder',
    data: { e: 'forceOrder',
      o: { s: 'BTCUSDT', S: 'SELL', T: Date.now(), ap: '70000', z: '1' } } });
  assert.deepEqual(binStatuses, [false, true],
    'real forced order confirms Binance subscription when the ACK is absent');
  assert.equal(binPackets.length, 1);
  stopBin();

  const byb = harness();
  const bybStatuses: boolean[] = [];
  const bybPackets: unknown[] = [];
  const stopByb = byb.pool.subscribe('bybit', 'ETHUSDT', {
    onStatus: state => bybStatuses.push(state),
    onPacket: data => bybPackets.push(data),
  });
  byb.sockets[0].open();
  byb.sockets[0].feed({ topic: 'allLiquidation.ETHUSDT', data: 'not-an-array' });
  assert.deepEqual(bybStatuses, [false]);
  assert.equal(bybPackets.length, 0);
  byb.sockets[0].feed({ topic: 'allLiquidation.ETHUSDT', data: [] });
  assert.deepEqual(bybStatuses, [false, true],
    'an empty valid batch is still evidence that the Bybit topic is live');
  assert.equal(bybPackets.length, 1);
  stopByb();
});
