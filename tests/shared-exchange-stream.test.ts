import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ExchangeStreamClient } from '../server/surveillance/exchangeStream';
import { acquireExchangeStream, getSharedExchangeStreamStats } from '../server/surveillance/sharedExchangeStream';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';

test('multiple users share one public exchange connection but retain isolated event listeners', t => {
  let opened = 0, destroyed = 0;
  const originalDestroy = ExchangeStreamClient.prototype.destroy;
  t.mock.method(ExchangeStreamClient.prototype, 'connect', function () { opened++; });
  t.mock.method(ExchangeStreamClient.prototype, 'destroy', function (this: ExchangeStreamClient) {
    destroyed++; originalDestroy.call(this);
  });

  const userA = acquireExchangeStream('BTCUSDT', 'binance', 'futures');
  const userB = acquireExchangeStream('BTCUSDT', 'binance', 'futures');
  let eventsA = 0, eventsB = 0;
  userA.on('price', () => eventsA++);
  userB.on('price', () => eventsB++);
  assert.equal(opened, 1);
  assert.equal(getSharedExchangeStreamStats().find(x => x.scope === 'binance:futures:BTCUSDT:full')?.subscribers, 2);

  (userA as any).entry.source.emit('price', { price: 100 });
  assert.equal(eventsA, 1); assert.equal(eventsB, 1);
  userA.destroy();
  assert.equal(destroyed, 0);
  (userB as any).entry.source.emit('price', { price: 101 });
  assert.equal(eventsA, 1, 'released user must not receive further events');
  assert.equal(eventsB, 2);
  userB.destroy();
  userB.destroy();
  assert.equal(destroyed, 1, 'underlying stream must close exactly once');
  assert.ok(!getSharedExchangeStreamStats().some(x => x.scope === 'binance:futures:BTCUSDT:full'));
});

test('depth-only and full streams use separate modes and never mix book lifecycle', t => {
  let opened = 0;
  t.mock.method(ExchangeStreamClient.prototype, 'connect', () => { opened++; });
  const full = acquireExchangeStream('ETHUSDT', 'bybit', 'futures');
  const depth = acquireExchangeStream('ETHUSDT', 'bybit', 'futures', true);
  assert.equal(opened, 2);
  full.destroy();
  depth.destroy();
});

test('late subscriber receives full, fresh, correctly merged depth without resetting another user', async t => {
  t.mock.method(ExchangeStreamClient.prototype, 'connect', () => {});
  const first = acquireExchangeStream('SOLUSDT', 'binance', 'futures');
  const source = (first as any).entry.source as ExchangeStreamClient;
  const time = Date.now();
  source.emit('depth', { isSnapshot: true, sequence: 100, eventTime: time,
    bids: [[90, 3], [89, 4]], asks: [[101, 5], [102, 6]] });
  source.emit('depth', { sequence: 101, eventTime: time,
    bids: [[90, 0], [88, 7]], asks: [[101, 4]] });
  const firstStillSubscribed = getSharedExchangeStreamStats().some(row =>
    row.scope === 'binance:futures:SOLUSDT:full');
  assert.equal(firstStillSubscribed, true);

  const second = acquireExchangeStream('SOLUSDT', 'binance', 'futures');
  const replay: any[] = [];
  second.on('depth', delta => replay.push(delta));
  await new Promise<void>(resolve => queueMicrotask(resolve));
  assert.equal(replay.length, 1);
  assert.equal(replay[0].isSnapshot, true);
  assert.equal(replay[0].sequence, 101);
  assert.deepEqual(replay[0].bids.sort((a: number[], b: number[]) => a[0] - b[0]),
    [[88, 7], [89, 4]]);
  assert.deepEqual(replay[0].asks.sort((a: number[], b: number[]) => a[0] - b[0]),
    [[101, 4], [102, 6]]);
  first.destroy();
  second.destroy();
});

test('stale or invalidated shared book is never replayed as live to a late subscriber', async t => {
  t.mock.method(ExchangeStreamClient.prototype, 'connect', () => {});
  const first = acquireExchangeStream('XRPUSDT', 'bybit', 'futures');
  const source = (first as any).entry.source as ExchangeStreamClient;
  source.emit('depth', { isSnapshot: true, sequence: 100, eventTime: Date.now(),
    bids: [[0.9, 3]], asks: [[1.1, 5]] });
  source.emit('status', 'STALE');
  const second = acquireExchangeStream('XRPUSDT', 'bybit', 'futures');
  let count = 0;
  second.on('depth', () => count++);
  await new Promise<void>(resolve => queueMicrotask(resolve));
  assert.equal(count, 0);
  first.destroy();
  second.destroy();
});

test('emergency rollback flag restores independent exchange streams per worker', t => {
  const previous = process.env.H00K_SHARED_STREAMS;
  process.env.H00K_SHARED_STREAMS = '0';
  let opened = 0;
  t.mock.method(ExchangeStreamClient.prototype, 'connect', () => { opened++; });
  let first: ReturnType<typeof acquireExchangeStream> | null = null;
  let second: ReturnType<typeof acquireExchangeStream> | null = null;
  try {
    first = acquireExchangeStream('AVAXUSDT', 'binance', 'futures');
    second = acquireExchangeStream('AVAXUSDT', 'binance', 'futures');
    assert.equal(opened, 2);
  } finally {
    first?.destroy();
    second?.destroy();
    if (previous === undefined) delete process.env.H00K_SHARED_STREAMS;
    else process.env.H00K_SHARED_STREAMS = previous;
  }
});

test('unobserved shared WebSocket error is handled before a worker attaches', t => {
  t.mock.method(ExchangeStreamClient.prototype, 'connect', () => {});
  const warnings: unknown[][] = [];
  t.mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args); });
  const early = acquireExchangeStream('LINKUSDT','bybit','futures');
  const source = (early as any).entry.source as ExchangeStreamClient;
  try {
    assert.equal(source.listenerCount('error'), 1,
      'one fallback listener exists even before a personalized worker listener');
    assert.doesNotThrow(() => source.emit('error', new Error('bootstrap socket failed')),
      'EventEmitter error without a worker must never terminate the server');
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][0]), /SharedExchangeStream/);
    assert.doesNotThrow(() => source.emit('error', new Error('repeated failure')));
    assert.equal(warnings.length, 1, 'unobserved connection errors are rate limited');

    const later = acquireExchangeStream('LINKUSDT','bybit','futures');
    let delivered = 0;
    try {
      later.on('error', () => { delivered++; });
      source.emit('error', new Error('later failure'));
      assert.equal(delivered,1,'attached worker still receives public stream errors');
      assert.equal(warnings.length,1,'fallback does not duplicate a worker error log');
    } finally {
      later.destroy();
    }
  } finally {
    early.destroy();
  }
  assert.ok(!getSharedExchangeStreamStats().some(row =>
    row.scope === 'bybit:futures:LINKUSDT:full'),
    'release drops the shared source and its fallback listener');
});

test('shared cached snapshots use normalized numbers even for string depth tuples', async t => {
  t.mock.method(ExchangeStreamClient.prototype, 'connect', () => {});
  const early = acquireExchangeStream('ATOMUSDT','bybit','futures');
  const source = (early as any).entry.source as ExchangeStreamClient;
  const now = Date.now();
  const late = acquireExchangeStream('ATOMUSDT','bybit','futures');
  try {
    source.emit('depth', {isSnapshot:true,sequence:100,eventTime:now,
      bids:[['100','4'],['99','3']],asks:[['101','2'],['102','1']]});
    source.emit('depth', {sequence:101,eventTime:now,
      bids:[['100','0'],['98','8']],asks:[['101','5']]});
    const replay: any[] = [];
    late.on('depth', packet => replay.push(packet));
    await new Promise<void>(resolve => queueMicrotask(resolve));
    assert.equal(replay.length,1);
    assert.equal(replay[0].sequence,101);
    assert.deepEqual(replay[0].bids.sort((a: number[],b: number[])=>b[0]-a[0]),
      [[99,3],[98,8]]);
    assert.deepEqual(replay[0].asks.sort((a: number[],b: number[])=>a[0]-b[0]),
      [[101,5],[102,1]]);
    for(const [price,quantity] of [...replay[0].bids,...replay[0].asks]) {
      assert.equal(typeof price,'number');
      assert.equal(typeof quantity,'number');
    }
    const book=new OrderBookEngine('ATOMUSDT','bybit','futures');
    book.applyDepth(replay[0]);
    assert.equal(book.getState().status,'LIVE');
    assert.equal(book.bestBid,99);
    assert.equal(book.bestAsk,101);
  } finally {
    late.destroy();
    early.destroy();
  }
});

test('one market error warning is shared across a large number of surveillance owners', t => {
  t.mock.method(ExchangeStreamClient.prototype, 'connect', () => {});
  const warnings: unknown[][] = [];
  t.mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args); });
  const owners = Array.from({length: 200}, () =>
    acquireExchangeStream('MATICUSDT', 'bybit', 'futures'));
  const source = (owners[0] as any).entry.source as ExchangeStreamClient;
  try {
    assert.equal(source.listenerCount('error'), 1,
      'public stream owns one fallback, not one error logger per owner');
    for(let i=0;i<50;i++) {
      assert.doesNotThrow(()=>source.emit('error',new Error('simulated market outage')));
    }
    assert.equal(warnings.length,1,'market outage must not flood VPS logs');
    assert.equal(getSharedExchangeStreamStats().find(row =>
      row.scope === 'bybit:futures:MATICUSDT:full')?.subscribers,200);
  } finally {
    for(const owner of owners) owner.destroy();
  }
  assert.equal(getSharedExchangeStreamStats().some(row =>
    row.scope === 'bybit:futures:MATICUSDT:full'),false);
});

test('CoinWorker does not install an independent public-stream error logger',()=>{
  const worker=readFileSync(new URL('../server/surveillance/coinWorker.ts',import.meta.url),'utf8');
  assert.doesNotMatch(worker,/this\.streamClient\.on\('error',/);
  assert.match(worker,/acquireExchangeStream\(coin\.symbol, coin\.exchange, coin\.marketType\)/);
});
