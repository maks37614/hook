import test from 'node:test';
import assert from 'node:assert/strict';
import { ExchangeStreamClient } from '../server/surveillance/exchangeStream';

test('Bybit Futures ticker rejects stale or cross-market frames and never recycles old OI', t => {
  t.mock.method(ExchangeStreamClient.prototype,'connect',()=>{});
  let now=Date.now();
  t.mock.method(Date,'now',()=>now);
  const client=new ExchangeStreamClient('BTCUSDT','bybit','futures');
  const prices:number[]=[];
  const oi:Array<{amountCoins:number;valueUsd:number;time:number}>=[];
  client.on('price',value=>prices.push(value.price));
  client.on('open-interest',value=>oi.push(value));
  const send=(data:unknown,type='delta',topic='tickers.BTCUSDT',ts=now)=>
    (client as any).handleIncomingMessage({topic,type,ts,data});
  try {
    send({symbol:'ETHUSDT',lastPrice:'100',openInterest:'10',openInterestValue:'1000'},
      'snapshot','tickers.ETHUSDT');
    send({symbol:'ETHUSDT',lastPrice:'100',openInterest:'10',openInterestValue:'1000'},'snapshot');
    send({lastPrice:'100',openInterest:'10',openInterestValue:'1000'},'snapshot','tickers.BTCUSDT',now-60_000);
    assert.deepEqual(prices,[]);
    assert.deepEqual(oi,[]);
    send({symbol:'BTCUSDT',lastPrice:'100',openInterest:'10',openInterestValue:'1000'},'snapshot');
    assert.deepEqual(prices,[100]);
    assert.deepEqual(oi.map(x=>x.valueUsd),[1000]);
    now+=100;
    send({lastPrice:'101'});
    send({openInterest:'11'});
    send({openInterestValue:'1100'});
    assert.deepEqual(prices,[100,101],
      'OI-only and funding-only deltas must not refresh an old price as new');
    assert.deepEqual(oi.map(x=>x.valueUsd),[1000],
      'price-only and partial-OI deltas must not turn cached fields into fresh samples');
    now+=100;
    send({openInterest:'12',openInterestValue:'1200'});
    send({fundingRate:'0.003'});
    assert.deepEqual(prices,[100,101]);
    assert.deepEqual(oi.map(x=>x.valueUsd),[1000,1200]);
    assert.ok(oi.every(x=>x.time>=now-200));
  } finally { client.destroy(); }
});

test('Bybit trade stream rejects wrong-symbol, stale, future and invalid-side prints', t => {
  t.mock.method(ExchangeStreamClient.prototype,'connect',()=>{});
  let now=Date.now();
  t.mock.method(Date,'now',()=>now);
  const client=new ExchangeStreamClient('BTCUSDT','bybit','futures');
  const trades:Array<{price:number;side:string;time:number}>=[];
  client.on('trade',sample=>trades.push(sample));
  const send=(topic:string,ts:number,data:unknown)=>
    (client as any).handleIncomingMessage({topic,ts,data});
  try {
    send('publicTrade.ETHUSDT',now,[{s:'ETHUSDT',T:now,S:'Buy',p:'110',v:'1'}]);
    send('publicTrade.BTCUSDT',now-70_000,[{s:'BTCUSDT',T:now-70_000,S:'Buy',p:'110',v:'1'}]);
    send('publicTrade.BTCUSDT',now,[{s:'ETHUSDT',T:now,S:'Buy',p:'110',v:'1'},
      {s:'BTCUSDT',T:now-70_000,S:'Buy',p:'110',v:'1'},
      {s:'BTCUSDT',T:now+70_000,S:'Buy',p:'110',v:'1'},
      {s:'BTCUSDT',T:now,S:'Other',p:'110',v:'1'},
      {s:'BTCUSDT',T:now,S:'Sell',p:'109',v:'2.5'},
      {s:'BTCUSDT',T:now,S:'Buy',p:'108',v:'1.2'}]);
    assert.deepEqual(trades.map(x=>[x.price,x.side]),[[109,'SELL'],[108,'BUY']]);
    assert.ok(trades.every(x=>x.time===now));
  } finally { client.destroy(); }
});

test('a delayed but individually fresh Bybit ticker cannot rewind price or OI', t => {
  t.mock.method(ExchangeStreamClient.prototype,'connect',()=>{});
  const now=Date.now();
  t.mock.method(Date,'now',()=>now);
  const client=new ExchangeStreamClient('BTCUSDT','bybit','futures');
  const quotes:Array<{price:number;time:number}>=[];
  const oi:Array<{amountCoins:number;valueUsd:number;time:number}>=[];
  client.on('price',data=>quotes.push({price:data.price,time:data.time}));
  client.on('open-interest',data=>oi.push(data));
  const send=(time:number,price:string,amount:string,value:string,type='delta')=>
    (client as any).handleIncomingMessage({
      topic:'tickers.BTCUSDT',ts:time,type,
      data:{symbol:'BTCUSDT',lastPrice:price,
        openInterest:amount,openInterestValue:value},
    });
  try {
    send(now-3000,'100','10','1000','snapshot');
    send(now-1000,'110','12','1200');
    // This old frame is not expired by the general 5s clock, but is older
    // than the last accepted ticker update. It must not reset the snapshot.
    send(now-2000,'99','9','900','snapshot');
    assert.deepEqual(quotes.map(q=>q.price),[100,110]);
    assert.deepEqual(oi.map(x=>x.valueUsd),[1000,1200]);
    assert.equal((client as any).bybitTicker.lastPrice,'110');
    assert.equal((client as any).lastBybitTickerEventTime,now-1000);
    send(now,'115','14','1400');
    assert.deepEqual(quotes.map(q=>q.price),[100,110,115]);
    assert.deepEqual(oi.map(x=>x.amountCoins),[10,12,14]);
  } finally { client.destroy(); }
});
