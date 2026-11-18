import test from 'node:test';
import assert from 'node:assert/strict';
import { ExchangeStreamClient, type RawDepthDelta } from '../server/surveillance/exchangeStream';
import { acquireExchangeStream, getSharedExchangeStreamStats } from '../server/surveillance/sharedExchangeStream';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';

test('one validated public WS packet feeds 150 isolated personal books without reparsing', async t => {
  t.mock.method(ExchangeStreamClient.prototype, 'connect', () => {});
  const owners: Array<{handle: ReturnType<typeof acquireExchangeStream>; book: OrderBookEngine}> = [];
  const count = 150;
  const sourceHandle = acquireExchangeStream('FANOUTUSDT', 'bybit', 'futures');
  try {
    const source = (sourceHandle as any).entry.source as ExchangeStreamClient;
    for (let i = 0; i < count; i++) {
      const handle = acquireExchangeStream('FANOUTUSDT', 'bybit', 'futures');
      const book = new OrderBookEngine('FANOUTUSDT','bybit','futures',{
        mode:'MANUAL', manualThresholdUsd:i % 2 ? 10_000 : 1_000,
        minPersistenceSeconds:15, minDistancePct:0.1,
      });
      handle.on('depth', delta => book.applyDepth(delta, handle.validatedDepth(delta)));
      owners.push({handle,book});
    }
    const now=Date.now();
    // Exchange wire tuples may be numeric strings, even though the legacy
    // TypeScript RawDepthDelta annotation expects numeric pairs.
    const first={isSnapshot:true,sequence:10,eventTime:now,
      bids:[['100','20'],['99','2']],asks:[['101','5']]} as unknown as RawDepthDelta;
    source.emit('depth',first);
    assert.equal(owners.every(({book})=>book.getState().status==='LIVE'),true);
    assert.equal(owners.every(({book})=>book.thresholdStats().depthParseFallbacks===0),true,
      'one public parse should be reused by every synchronous personal callback');
    assert.deepEqual(owners[0].book.getDensities().map(x=>x.notionalUsd),[2000]);
    assert.deepEqual(owners[1].book.getDensities(),[],
      'different personal thresholds cannot leak across subscribers');

    source.emit('depth',{sequence:11,eventTime:now,
      bids:[['100','25']],asks:[['101','6']]});
    assert.equal(owners.every(({book})=>book.thresholdStats().depthParseFallbacks===0),true);
    assert.equal(owners[0].book.bestBid,100);
    assert.equal(owners[1].book.bestAsk,101);
    assert.equal(owners[0].book.getDensities()[0].notionalUsd,2500);

    // Never trust an old event after the synchronous fanout ends.
    await new Promise<void>(resolve => queueMicrotask(resolve));
    assert.equal(sourceHandle.validatedDepth(first),null);
    assert.equal(getSharedExchangeStreamStats().find(x=>
      x.scope==='bybit:futures:FANOUTUSDT:full')?.subscribers,count+1);
  } finally {
    owners.forEach(({handle})=>handle.destroy());
    sourceHandle.destroy();
  }
  assert.equal(getSharedExchangeStreamStats().some(x=>x.scope==='bybit:futures:FANOUTUSDT:full'),false);
});

test('invalid packets still fail closed and reparse; a new snapshot recovers all subscribers', t => {
  t.mock.method(ExchangeStreamClient.prototype, 'connect', () => {});
  const handle=acquireExchangeStream('INVALIDFANOUTUSDT','binance','futures');
  const source=(handle as any).entry.source as ExchangeStreamClient;
  const book=new OrderBookEngine('INVALIDFANOUTUSDT','binance','futures');
  handle.on('depth',delta=>book.applyDepth(delta,handle.validatedDepth(delta)));
  try {
    const at=Date.now();
    source.emit('depth',{isSnapshot:true,sequence:10,eventTime:at,
      bids:[['100','50']],asks:[['101','25']]});
    assert.equal(book.getState().status,'LIVE');
    assert.equal(book.thresholdStats().depthParseFallbacks,0);
    source.emit('depth',{sequence:11,eventTime:at,
      bids:[['100','NaN']],asks:[]});
    assert.notEqual(book.getState().status,'LIVE');
    assert.deepEqual(book.getDensities(),[]);
    assert.equal(book.thresholdStats().depthParseFallbacks,1,
      'failed public validation must not publish a trusted packet');
    source.emit('depth',{sequence:12,eventTime:at,
      bids:[['100','99']],asks:[]});
    assert.notEqual(book.getState().status,'LIVE',
      'a new delta cannot recover a sequence that lost continuity');
    source.emit('depth',{isSnapshot:true,sequence:13,eventTime:at,
      bids:[['90','4']],asks:[['91','8']]});
    assert.equal(book.getState().status,'LIVE');
    assert.deepEqual(book.getState().bids.map(x=>x.price),[90]);
  } finally {
    handle.destroy();
  }
});

test('new owners replay the stored full book through the normal safe validation path', async t => {
  t.mock.method(ExchangeStreamClient.prototype,'connect',()=>{});
  const early=acquireExchangeStream('LATEPARSEUSDT','bybit','futures');
  let late:ReturnType<typeof acquireExchangeStream>|null=null;
  try {
    const source=(early as any).entry.source as ExchangeStreamClient;
    source.emit('depth',{isSnapshot:true,sequence:100,eventTime:Date.now(),
      bids:[['100','7']],asks:[['101','2']]});
    late=acquireExchangeStream('LATEPARSEUSDT','bybit','futures');
    const book=new OrderBookEngine('LATEPARSEUSDT','bybit','futures');
    late.on('depth',delta=>book.applyDepth(delta,late!.validatedDepth(delta)));
    await new Promise<void>(resolve=>queueMicrotask(resolve));
    assert.equal(book.getState().status,'LIVE');
    assert.equal(book.bestBid,100);
    assert.equal(book.thresholdStats().depthParseFallbacks,1,
      'synthetic late-join replay still uses ordinary validation');
  } finally {
    late?.destroy();
    early.destroy();
  }
});
