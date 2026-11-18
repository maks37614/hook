import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ExchangeStreamClient } from '../server/surveillance/exchangeStream';
import { acquireExchangeStream } from '../server/surveillance/sharedExchangeStream';
import { CoinWorker } from '../server/surveillance/coinWorker';

test('realtime surveillance accepts only a recent timestamped quote with synchronized market stream', t => {
  let now=Date.now();
  t.mock.method(Date,'now',()=>now);
  t.mock.method(ExchangeStreamClient.prototype,'connect',()=>{});
  const handle=acquireExchangeStream('LIVEQUOTEUSDT','bybit','futures');
  const source=(handle as any).entry.source as ExchangeStreamClient;
  try {
    source.status='LIVE';
    assert.equal(handle.hasFreshMarketQuote(),false,
      'a live depth book without a recent quote cannot validate realtime price');
    source.emit('price',{price:100,time:now,high24h:101,low24h:99,volume24hUsd:1000});
    assert.equal(handle.hasFreshMarketQuote(),true);
    assert.equal(handle.marketTicker.price,100);
    source.emit('price',{price:90,time:now-3000,high24h:100,low24h:88,volume24hUsd:900});
    assert.equal(handle.marketTicker.price,100,
      'an older-but-clock-fresh ticker cannot rewind the market quote');
    now+=16_000;
    assert.equal(handle.hasFreshMarketQuote(),false,
      'a quote older than 15 seconds must not be marked realtime');
    source.emit('price',{price:110,time:now-50_000,high24h:110,low24h:100,volume24hUsd:2000});
    assert.equal(handle.hasFreshMarketQuote(),false);
    source.emit('trade',{price:105,time:now});
    assert.equal(handle.hasFreshMarketQuote(),true);
    assert.equal(handle.marketTicker.price,105);
    source.status='STALE';
    source.emit('status','STALE');
    assert.equal(handle.hasFreshMarketQuote(),false,
      'disconnect invalidates the quote immediately despite cached price');
    source.status='LIVE';
    assert.equal(handle.hasFreshMarketQuote(),false,
      'depth resync alone cannot revalidate an old ticker');
    now+=100;
    source.emit('trade',{price:107,time:now});
    assert.equal(handle.hasFreshMarketQuote(),true);
  } finally { handle.destroy(); }
});

test('24/7 deep analysis never creates a new signal from a stale last known price',async()=>{
  const worker=Object.create(CoinWorker.prototype) as any;
  worker.isDestroyed=false;
  worker.coin={userId:'owner',symbol:'BTCUSDT',isActive:true};
  worker.initialPrice=100;
  worker.streamClient={
    marketTicker:{price:100},
    hasFreshMarketQuote:()=>false,
  };
  worker.analysisInFlight=false;
  worker.lastAnalysisTimestamp=0;
  await worker.runDeepAnalysis();
  assert.equal(worker.lastAnalysisTimestamp,0,
    'stale price must not start market-dependent analysis or Telegram dispatch');
  assert.equal(worker.analysisInFlight,false);
});

test('Binance stale/untimestamped public ticker and trades are not accepted as live observations',t=>{
  t.mock.method(ExchangeStreamClient.prototype,'connect',()=>{});
  let now=Date.now();
  t.mock.method(Date,'now',()=>now);
  const source=new ExchangeStreamClient('BTCUSDT','binance','futures');
  const prices:number[]=[];
  const trades:number[]=[];
  source.on('price',({price})=>prices.push(price));
  source.on('trade',({price})=>trades.push(price));
  try {
    const ticker=(E:unknown,price:string)=>({e:'24hrTicker',s:'BTCUSDT',E,c:price,h:'110',l:'90',q:'1000'});
    const trade=(T:unknown,price:string)=>({e:'trade',s:'BTCUSDT',T,p:price,q:'1',m:false});
    (source as any).handleIncomingMessage(ticker(now-60_000,'80'));
    (source as any).handleIncomingMessage(ticker(undefined,'81'));
    (source as any).handleIncomingMessage(ticker(now,'100'));
    (source as any).handleIncomingMessage(trade(now-60_000,'80'));
    (source as any).handleIncomingMessage(trade(undefined,'81'));
    (source as any).handleIncomingMessage(trade(now,'102'));
    assert.deepEqual(prices,[100]);
    assert.deepEqual(trades,[102]);
  } finally {source.destroy();}
});

test('setup notifications revalidate current market price after asynchronous BTC context',()=>{
  const worker=readFileSync(new URL('../server/surveillance/coinWorker.ts',import.meta.url),'utf8');
  const from=worker.indexOf('const btcContext = await this.macroEngine.updateBTCContext()');
  const to=worker.indexOf('// 8. Setup Detection',from);
  assert.ok(from>0 && to>from);
  const guarded=worker.slice(from,to);
  assert.match(guarded,/!this\.streamClient\.hasFreshMarketQuote\(\)/);
  assert.match(guarded,/this\.currentPrice !== price/);
});
