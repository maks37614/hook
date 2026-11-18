import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderBookEngine } from '../server/surveillance/orderBookEngine';

test('repeated snapshots and density reads reuse the same book median',()=>{
 const book=new OrderBookEngine('BTCUSDT','binance','futures');
 book.applyDepth({sequence:1,isSnapshot:true,bids:[[100,100],[99,10]],
    asks:[[101,20],[102,1]],eventTime:Date.now()});
 const computed=book.thresholdStats().medianComputations;
 assert.equal(computed,1,'first depth evaluation calculates a median');
 for(let i=0;i<30;i++){
   book.getDensities(); book.calculateAdaptiveThreshold();
 }
 assert.equal(book.thresholdStats().medianComputations,computed);
 book.applyDepth({sequence:2,bids:[[98,25]],asks:[],eventTime:Date.now()});
 assert.equal(book.thresholdStats().medianComputations,computed+1);
});
test('manual and HYBRID settings, 24h turnover changes and resync invalidate cache correctly',()=>{
 const book=new OrderBookEngine('BTCUSDT','bybit','futures');
 book.applyDepth({sequence:1,isSnapshot:true,bids:[[100,50],[99,1]],
    asks:[[101,2]],eventTime:Date.now()});
 const prev=book.calculateAdaptiveThreshold();
 book.updateConfig({mode:'MANUAL',manualThresholdUsd:2000});
 assert.equal(book.calculateAdaptiveThreshold(),2000);
 book.updateConfig({mode:'AUTO'});
 assert.equal(book.calculateAdaptiveThreshold(),prev);
 book.setVolume24hUsd(900_000_000);
 assert.ok(Math.abs(book.calculateAdaptiveThreshold() - (30_000 * Math.pow(90,.55))) < .01,
  'market-size floor scales sublinearly rather than missing BTC/ETH or accepting tiny orders');
 book.updateConfig({mode:'HYBRID',manualThresholdUsd:110_000});
 assert.ok(book.calculateAdaptiveThreshold() >= 350_000, 'HYBRID keeps the stricter AUTO floor');
 book.setStatus('RESYNCING');
 book.applyDepth({sequence:2,isSnapshot:true,bids:[[100,50]],asks:[[101,2]],eventTime:Date.now()});
 assert.equal(book.getState().status,'LIVE');
 assert.ok(book.calculateAdaptiveThreshold() >= 350_000, 'HYBRID keeps the stricter AUTO floor');
});

test('top-of-book and imbalance share sorting until next depth revision',()=>{
 const book=new OrderBookEngine('BTCUSDT','binance','futures');
 book.applyDepth({sequence:1,isSnapshot:true,bids:[[99,2],[100,5],[98,3]],
   asks:[[103,1],[101,2],[102,2]],eventTime:Date.now()});
 const initial=book.thresholdStats().sortedPriceComputations;
 assert.equal(initial,0,'density evaluation does not request sorted price arrays');
 const state=book.getState();
 assert.deepEqual(state.bids.map(x=>x.price),[100,99,98]);
 assert.deepEqual(state.asks.map(x=>x.price),[101,102,103]);
 assert.equal(book.thresholdStats().sortedPriceComputations,initial+2);
 const expectedImbalance=book.getOrderBookImbalance(2);
 for(let i=0;i<30;i++){
   assert.equal(book.getOrderBookImbalance(2),expectedImbalance);
   assert.equal(book.getState().bids[0].price,100);
   book.getSortedAsks(1);
 }
 assert.equal(book.thresholdStats().sortedPriceComputations,initial+2,
   'repeated snapshots and imbalance reads must reuse both sorted-price lists');
 state.bids[0].price=1;
 state.bids[0].quantity=999999;
 assert.deepEqual(book.getSortedBids(1).map(x=>[x.price,x.quantity]),[[100,5]],
   'snapshots are copies; mutating one cannot poison the sorted cache');
 book.applyDepth({sequence:2,bids:[[99,0],[97,10]],asks:[],eventTime:Date.now()});
 assert.deepEqual(book.getSortedBids(3).map(x=>x.price),[100,98,97]);
 assert.equal(book.thresholdStats().sortedPriceComputations,initial+3);
 assert.deepEqual(book.getSortedAsks(2).map(x=>x.price),[101,102]);
 assert.equal(book.thresholdStats().sortedPriceComputations,initial+4);
 book.clear();
 assert.deepEqual(book.getSortedBids(),[]);
 assert.deepEqual(book.getSortedAsks(),[]);
 assert.equal(book.thresholdStats().sortedPriceComputations,initial+6,
   'clearing a book releases the cached ordering and invalidates both sides');
});


test('best bid and ask update from deltas without full scans unless current top is removed',()=>{
 const book=new OrderBookEngine('BTCUSDT','bybit','futures', {
   mode:'MANUAL',manualThresholdUsd:1000,minPersistenceSeconds:15,minDistancePct:0.1,
 });
 const apply=(sequence:number,bids:[number,number][],asks:[number,number][],isSnapshot=false)=>
   book.applyDepth({sequence,bids,asks,isSnapshot,eventTime:Date.now()});
 apply(1,[[100,20],[99,12],[98,7]],[[101,10],[102,15],[103,10]],true);
 assert.deepEqual([book.bestBid,book.bestAsk],[100,101]);
 assert.equal(book.thresholdStats().bestPriceFullScans,0);
 apply(2,[[99,19],[97,12]],[[103,18],[104,11]]);
 assert.deepEqual([book.bestBid,book.bestAsk],[100,101]);
 assert.equal(book.thresholdStats().bestPriceFullScans,0,
   'non-best price and quantity updates never rescan the full book');
 apply(3,[[100.5,17]],[]);
 assert.deepEqual([book.bestBid,book.bestAsk],[100.5,101]);
 assert.equal(book.thresholdStats().bestPriceFullScans,0,
   'a new best can be discovered from the delta alone');
 apply(4,[[100.5,0]],[]);
 assert.deepEqual([book.bestBid,book.bestAsk],[100,101]);
 assert.equal(book.thresholdStats().bestPriceFullScans,1,
   'removing best bid requires one full bid-only scan');
 apply(5,[],[[101,0]]);
 assert.deepEqual([book.bestBid,book.bestAsk],[100,102]);
 assert.equal(book.thresholdStats().bestPriceFullScans,2,
   'removing best ask requires one full ask-only scan');
 apply(6,[[97,0],[96,2]],[[104,0]]);
 assert.deepEqual([book.bestBid,book.bestAsk],[100,102]);
 assert.equal(book.thresholdStats().bestPriceFullScans,2,
   'removing non-best prices does not cause another scan');
 assert.equal(book.getState().status,'LIVE');
 assert.ok(book.getOrderBookImbalance(3)<1);
 apply(7,[[50,12]],[[150,3]],true);
 assert.deepEqual([book.bestBid,book.bestAsk],[50,150]);
 assert.equal(book.thresholdStats().bestPriceFullScans,2,
   'a full snapshot starts a fresh book and calculates best from its own levels');
 book.clear();
 assert.deepEqual([book.bestBid,book.bestAsk],[0,0]);
 assert.deepEqual(book.getDensities(),[]);
});

test('deleting a best price and adding a replacement in the same packet gives the correct book',()=>{
 const book=new OrderBookEngine('BTCUSDT','binance','futures', {
   mode:'MANUAL',manualThresholdUsd:1000,minPersistenceSeconds:15,minDistancePct:0.1,
 });
 book.applyDepth({sequence:1,isSnapshot:true,
   bids:[[100,10],[99,10]],asks:[[103,10],[104,10]],eventTime:Date.now()});
 book.applyDepth({sequence:2,bids:[[100,0],[102,10]],
   asks:[[103,0],[101,10]],eventTime:Date.now()});
 assert.equal(book.bestBid,102);
 assert.equal(book.bestAsk,101);
 assert.equal(book.getState().status,'RESYNCING',
   'a crossed book remains invalid even when incremental top updates look plausible');
 book.applyDepth({sequence:3,isSnapshot:true,
   bids:[[100,10],[99,10]],asks:[[101,10]],eventTime:Date.now()});
 assert.equal(book.getState().status,'LIVE');
 assert.deepEqual([book.bestBid,book.bestAsk],[100,101]);
});
