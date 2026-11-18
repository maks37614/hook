import test from 'node:test';
import assert from 'node:assert/strict';
import { ExchangeStreamClient, type RawDepthDelta } from '../server/surveillance/exchangeStream';
import { acquireExchangeStream, getSharedExchangeStreamStats } from '../server/surveillance/sharedExchangeStream';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';

type Owner = {
  handle: ReturnType<typeof acquireExchangeStream>;
  book: OrderBookEngine;
};

function followMarket(symbol: string, manualThresholdUsd: number): Owner {
  const handle = acquireExchangeStream(symbol, 'bybit', 'futures');
  const book = new OrderBookEngine(symbol, 'bybit', 'futures', {
    mode: 'MANUAL', manualThresholdUsd, minPersistenceSeconds: 15, minDistancePct: 0.1,
  });
  handle.on('depth', (delta: RawDepthDelta) =>
    book.applyDepth(delta, handle.validatedDepth(delta), handle.sharedBook(delta)));
  handle.on('status', status => book.setStatus(status));
  return { handle, book };
}

test('120 owners keep private density thresholds but reference one actual public depth map', t => {
  t.mock.method(ExchangeStreamClient.prototype, 'connect', () => {});
  const symbol = 'SHAREDLEVELUSDT';
  const owners = Array.from({length:120}, (_,i) =>
    followMarket(symbol,i%2===0 ? 1000 : 10_000));
  const source=(owners[0].handle as any).entry.source as ExchangeStreamClient;
  const time=Date.now();
  try {
    source.emit('depth', {isSnapshot:true,sequence:100,eventTime:time,
      bids:[[100,20],[99,4]],asks:[[101,5],[102,2]]});
    assert.equal(owners.every(({book})=>book.getState().status==='LIVE'),true);
    assert.equal(owners.every(({book})=>book.thresholdStats().sharedBookActive),true);
    const canonicalBids=(owners[0].book as any).bids;
    const canonicalAsks=(owners[0].book as any).asks;
    assert.equal(owners.every(({book})=>
      (book as any).bids===canonicalBids && (book as any).asks===canonicalAsks),true,
      'all owners reuse the same public map references without per-owner cloning');
    assert.equal(owners[0].book.getDensities().some(item=>item.notionalUsd===2000),true);
    assert.deepEqual(owners[1].book.getDensities(),[],
      'per-owner MANUAL thresholds remain isolated');
    source.emit('depth',{sequence:101,eventTime:time,bids:[[100,30]],asks:[[101,6]]});
    assert.equal(owners[0].book.getDensities()[0].notionalUsd,3000);
    assert.deepEqual(owners[1].book.getDensities(),[]);
    assert.equal(owners.every(({book})=>book.thresholdStats().privateBookCopies===0),true);
    assert.equal(getSharedExchangeStreamStats().find(x=>
      x.scope===`bybit:futures:${symbol}:full`)?.subscribers,120);
    owners[0].book.clear();
    assert.equal(owners[1].book.bestBid,100);
    assert.equal(owners[1].book.getState().status,'LIVE');
    assert.deepEqual(owners[1].book.getState().bids.map(x=>x.quantity),[30,4],
      'clearing one private worker must never empty the shared exchange book');
  } finally {
    owners.forEach(({handle})=>handle.destroy());
  }
  assert.equal(getSharedExchangeStreamStats().some(x=>x.scope===`bybit:futures:${symbol}:full`),false);
});

test('identical non-empty depth updates skip personal median and density rescans', t => {
  let now=Date.now();
  t.mock.method(Date,'now',()=>now);
  t.mock.method(ExchangeStreamClient.prototype, 'connect', () => {});
  const owner=followMarket('REPEATEDLEVELUSDT',1000);
  const source=(owner.handle as any).entry.source as ExchangeStreamClient;
  try {
    source.emit('depth',{isSnapshot:true,sequence:10,eventTime:now,
      bids:[[100,20],[99,4]],asks:[[101,2]]});
    const initial=owner.book.thresholdStats();
    for(let sequence=11;sequence<=210;sequence++) {
      now+=10;
      source.emit('depth',{sequence,eventTime:now,
        bids:[[100,20]],asks:[[101,2]]});
    }
    const updated=owner.book.thresholdStats();
    assert.equal(updated.bookRevision,initial.bookRevision,
      'unchanged public quantities do not invalidate the personal book revision');
    assert.equal(updated.medianComputations,initial.medianComputations);
    assert.ok(updated.densityEvaluations<8,
      '200 repeated non-empty packets need only time-driven persistence updates');
    assert.equal(owner.book.getState().sequence,210);
    assert.equal(owner.book.getState().status,'LIVE');
    now+=10;
    source.emit('depth',{sequence:211,eventTime:now,bids:[[100,21]],asks:[]});
    assert.equal(owner.book.getDensities()[0].notionalUsd,2100);
    assert.equal(owner.book.thresholdStats().bookRevision,initial.bookRevision+1);
  } finally {
    owner.handle.destroy();
  }
});

test('corrupt packet, disconnected source and fallback packets do not mutate another owner book', t => {
  t.mock.method(ExchangeStreamClient.prototype, 'connect', () => {});
  const a=followMarket('SAFEBOOKUSDT',1000);
  const b=followMarket('SAFEBOOKUSDT',5000);
  const source=(a.handle as any).entry.source as ExchangeStreamClient;
  try {
    const time=Date.now();
    source.emit('depth',{isSnapshot:true,sequence:1,eventTime:time,
      bids:[[100,20]],asks:[[101,10]]});
    const sharedBids=(a.book as any).bids;
    const sharedAsks=(b.book as any).asks;
    source.emit('depth',{sequence:2,eventTime:time,
      bids:[['100','NaN']],asks:[]});
    assert.notEqual(a.book.getState().status,'LIVE');
    assert.notEqual(b.book.getState().status,'LIVE');
    assert.equal(a.book.getDensities().length,0);
    source.emit('depth',{isSnapshot:true,sequence:3,eventTime:time,
      bids:[[90,4]],asks:[[91,2]]});
    assert.equal(a.book.getState().status,'LIVE');
    assert.equal(b.book.getState().status,'LIVE');
    assert.equal((a.book as any).bids,sharedBids,'recovery reuses the canonical map');
    assert.equal((b.book as any).asks,sharedAsks);
    assert.deepEqual(a.book.getState().bids.map(x=>x.price),[90]);

    // A direct/private fallback must detach before modifying common maps.
    const fallback={sequence:4,eventTime:time,bids:[[89,9]],asks:[]} as RawDepthDelta;
    a.book.applyDepth(fallback);
    assert.equal(a.book.thresholdStats().sharedBookActive,false);
    assert.equal(a.book.thresholdStats().privateBookCopies,1);
    assert.deepEqual(a.book.getState().bids.map(x=>x.price),[90,89]);
    assert.deepEqual(b.book.getState().bids.map(x=>x.price),[90]);
    a.book.clear();
    assert.equal(b.book.getState().status,'LIVE');
  } finally {
    a.handle.destroy(); b.handle.destroy();
  }
});
