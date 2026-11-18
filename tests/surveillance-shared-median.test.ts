import test from 'node:test';
import assert from 'node:assert/strict';
import { ExchangeStreamClient, type RawDepthDelta } from '../server/surveillance/exchangeStream';
import { acquireExchangeStream } from '../server/surveillance/sharedExchangeStream';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';
import { SharedPublicDepthMedianCache, sharedPublicDepthMedian } from '../server/surveillance/sharedDepthMedian';

test('median memo expires only when the shared public book revision changes', () => {
  const cache=new SharedPublicDepthMedianCache();
  const bids=new Map([[100,100],[99,50]]),asks=new Map([[101,50],[102,50]]);
  assert.equal(cache.get(bids,asks,1),5050);
  assert.equal(cache.get(bids,asks,1),5050);
  assert.deepEqual(cache.stats(),{calculations:1,hits:1});
  bids.set(100,200);
  assert.equal(cache.get(bids,asks,2),5050);
  assert.equal(cache.stats().calculations,2);
  asks.set(101,200);
  assert.equal(cache.get(bids,asks,3),5100);
  assert.equal(cache.stats().calculations,3);
});

test('120 surveillance owners share one public median, not private threshold policies', t => {
  t.mock.method(ExchangeStreamClient.prototype, 'connect', ()=>{});
  const owners: Array<{handle: ReturnType<typeof acquireExchangeStream>;book:OrderBookEngine}>=[];
  const before=sharedPublicDepthMedian.stats();
  try {
    for(let i=0;i<120;i++){
      const handle=acquireExchangeStream('SHAREDMEDIANUSDT','bybit','futures');
      const book=new OrderBookEngine('SHAREDMEDIANUSDT','bybit','futures',{
        mode:i%3===2?'HYBRID':'AUTO',manualThresholdUsd:200000,
        minPersistenceSeconds:15,minDistancePct:0.1,
      });
      book.setVolume24hUsd(i%3===1 ? 1_000_000_000 : 5_000_000);
      handle.on('depth',(delta:RawDepthDelta)=>book.applyDepth(
        delta,handle.validatedDepth(delta),handle.sharedBook(delta)));
      owners.push({handle,book});
    }
    const source=(owners[0].handle as any).entry.source as ExchangeStreamClient;
    const now=Date.now();
    source.emit('depth',{isSnapshot:true,sequence:1,eventTime:now,
      bids:[[100,100],[99,50]],asks:[[101,50],[102,50]]});
    assert.equal(sharedPublicDepthMedian.stats().calculations-before.calculations,1,
      'one public median for 120 private density engines');
    assert.equal(owners[0].book.calculateAdaptiveThreshold(),25000);
    assert.ok(Math.abs(owners[1].book.calculateAdaptiveThreshold() - (30_000 * Math.pow(100, .55))) < .01);
    assert.equal(owners[2].book.calculateAdaptiveThreshold(),200000);
    assert.ok(owners.every(({book})=>book.thresholdStats().medianComputations===0));
    source.emit('depth',{sequence:2,eventTime:now,bids:[[100,100]],asks:[[101,50]]});
    assert.equal(sharedPublicDepthMedian.stats().calculations-before.calculations,1,
      'identical non-empty deltas preserve revision memo');
    source.emit('depth',{sequence:3,eventTime:now,bids:[[100,100]],asks:[[101,200]]});
    assert.equal(sharedPublicDepthMedian.stats().calculations-before.calculations,2);
    assert.equal(owners[0].book.calculateAdaptiveThreshold(),25000);
    assert.ok(Math.abs(owners[1].book.calculateAdaptiveThreshold() - (30_000 * Math.pow(100, .55))) < .01);
    assert.equal(owners[2].book.calculateAdaptiveThreshold(),200000);
    owners[0].book.updateConfig({manualThresholdUsd:300000,mode:'HYBRID'});
    assert.equal(owners[0].book.calculateAdaptiveThreshold(),300000);
    assert.equal(sharedPublicDepthMedian.stats().calculations-before.calculations,2,
      'private config changes cannot force public median to rescan');
  } finally {
    owners.forEach(({handle})=>handle.destroy());
  }
});

test('direct/private order books still calculate median locally and empty books use manual fallback', () => {
  const manual=new OrderBookEngine('DIRECTMEDIANUSDT','binance','futures');
  assert.equal(manual.calculateAdaptiveThreshold(),1000000);
  const now=Date.now();
  manual.applyDepth({isSnapshot:true,sequence:1,eventTime:now,
    bids:[[100,100],[99,50]],asks:[[101,50],[102,50]]});
  assert.equal(manual.calculateAdaptiveThreshold(),1000000,
    'without verified 24h turnover the AUTO default must not treat tiny DOM levels as walls');
  manual.setVolume24hUsd(5_000_000);
  assert.equal(manual.calculateAdaptiveThreshold(),25000);
  assert.equal(manual.thresholdStats().medianComputations,1);
  manual.clear();
  assert.equal(manual.calculateAdaptiveThreshold(),1000000);
});
