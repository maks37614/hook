import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketTickerFeed } from '../server/marketTickerFeed';

test('a BTC ticker update cannot revive stale 24h turnover for a different coin', async () => {
  let now = 1_000_000;
  let calls = 0;
  const feed = new MarketTickerFeed(async () => {
    calls++;
    return Response.json(['BTCUSDT','ETHUSDT'].map(symbol => ({
      symbol, lastPrice:'100', priceChangePercent:'1',
      quoteVolume: symbol === 'BTCUSDT' ? '1000000' : '2000000',
      highPrice:'110', lowPrice:'90',
    })));
  }, () => now);
  await feed.get('binance','spot');
  assert.equal(feed.getCached24hVolumeUsd('binance','spot','ETHUSDT'),2_000_000);
  now += 130_000;
  assert.equal(feed.applyBinanceMiniTickers('spot',[{
    s:'BTCUSDT', E:now, o:'100', c:'101', h:'111', l:'90', q:'3000000',
  }]),1);
  assert.equal(feed.getCached24hVolumeUsd('binance','spot','BTCUSDT'),3_000_000);
  assert.equal(feed.getCached24hVolumeUsd('binance','spot','ETHUSDT'),null,
    'an unrelated fresh ticker must not make stale ETH liquidity appear current');
  assert.equal(calls,1,'reading cached turnover never fetches the exchange');
});

test('fresh REST snapshots alone provide valid cached 24h turnover',async()=>{
 let now=2_000_000;
 const feed=new MarketTickerFeed(async()=>Response.json([{symbol:'BTCUSDT',lastPrice:'100',
  priceChangePercent:'1',quoteVolume:'500000',highPrice:'110',lowPrice:'90'}]),()=>now);
 await feed.get('binance','futures');
 assert.equal(feed.getCached24hVolumeUsd('binance','futures','BTCUSDT'),500_000);
 now+=119_000;
 assert.equal(feed.getCached24hVolumeUsd('binance','futures','BTCUSDT'),500_000);
 now+=1001;
 assert.equal(feed.getCached24hVolumeUsd('binance','futures','BTCUSDT'),null);
});
