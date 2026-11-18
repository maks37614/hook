import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedMarketTradeWindow } from '../server/surveillance/sharedMarketTradeWindow';
import { VolumeAndOIEngine } from '../server/surveillance/volumeAndOIEngine';
import type { RawTradeEvent } from '../server/surveillance/exchangeStream';

const trade=(time:number, price:number, quantity:number, side:'BUY'|'SELL'):RawTradeEvent =>
  ({time,price,quantity,side,isBuyerMaker:side==='SELL'});

test('one market accumulator is reused by different user engines without duplicating trades',()=>{
  let now=61_000;
  const market=new SharedMarketTradeWindow(()=>now);
  const alice=new VolumeAndOIEngine(market);
  const bob=new VolumeAndOIEngine(market);
  market.addTrade(trade(now-1_000,100,800,'BUY'));
  market.addTrade(trade(now-500,100,200,'SELL'));
  const one=alice.getTradeFlowSnapshot();
  const two=bob.getTradeFlowSnapshot();
  assert.equal(one.aggressiveBuyUsd,80_000);
  assert.equal(one.aggressiveSellUsd,20_000);
  assert.equal(one.totalTradeCount,2);
  assert.equal(one.largeTradeCount,1);
  assert.equal(two.aggressiveBuyUsd,one.aggressiveBuyUsd);
  assert.equal(two.aggressiveSellUsd,one.aggressiveSellUsd);
  assert.equal(market.size(),2,'there are only two market trades, not two per account');
  now+=61_000;
  assert.equal(market.snapshot().totalTradeCount,0,'closed window cannot keep stale trades');
  assert.equal(alice.getTradeFlowSnapshot().totalTradeCount,0);
  assert.equal(bob.getTradeFlowSnapshot().totalTradeCount,0);
});

test('market totals isolate Binance, Bybit and spot instruments',()=>{
  const a=new SharedMarketTradeWindow(()=>20_000), b=new SharedMarketTradeWindow(()=>20_000);
  a.addTrade(trade(20_000,100,500,'BUY'));
  b.addTrade(trade(20_000,100,250,'SELL'));
  assert.equal(a.snapshot().aggressiveSellUsd,0);
  assert.equal(b.snapshot().aggressiveBuyUsd,0);
  assert.equal(a.snapshot().largeTradeCount,1);
  assert.equal(b.snapshot().largeTradeCount,0);
});

test('out-of-window and malformed trades cannot pollute totals',()=>{
  const now=90_000, market=new SharedMarketTradeWindow(()=>now);
  market.addTrade(trade(now-70_000,100,100,'BUY'));
  market.addTrade(trade(now+3_000,100,100,'BUY'));
  market.addTrade(trade(now,Number.NaN,100,'BUY'));
  market.addTrade(trade(now,100,100,'SELL'));
  assert.deepEqual(market.snapshot(),{
    aggressiveBuyUsd:0, aggressiveSellUsd:10_000,totalTradeCount:1,largeTradeCount:0,
  });
});

test('market totals and personal Delta baselines are independent',()=>{
  const market=new SharedMarketTradeWindow(()=>100_000);
  const a=new VolumeAndOIEngine(market), b=new VolumeAndOIEngine(market);
  market.addTrade(trade(100_000,100,1000,'BUY'));
  a.getTradeFlowSnapshot();
  a.getTradeFlowSnapshot();
  const firstBob=b.getTradeFlowSnapshot();
  assert.equal(firstBob.deltaZScore,100_000,'new subscriber has no personal Delta baseline');
  const laterAlice=a.getTradeFlowSnapshot();
  assert.equal(laterAlice.deltaZScore,0,'Alice tracks her own previous Delta samples');
  assert.equal(laterAlice.deltaUsd,firstBob.deltaUsd);
});
