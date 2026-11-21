import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateDensity24hQuoteVolume } from '../src/components/hookchart/densityAutoVolume';
const now=Date.now();
const candles=(n:number,period=300_000)=>Array.from({length:n},(_,i)=>({
 t:now-(n-i)*period, o:100,h:101,l:99,c:100,v:10,n:1,
}));
test('fallback requires near-full 24h history and no additional data',()=>{
 const full=estimateDensity24hQuoteVolume(candles(300),now);
 assert.ok(full!==null && full>280_000 && full<290_000);
 assert.equal(estimateDensity24hQuoteVolume(candles(100),now),null);
 assert.equal(estimateDensity24hQuoteVolume(candles(24,4*3_600_000),now),null);
 assert.equal(estimateDensity24hQuoteVolume(candles(300).map(c=>({...c,t:c.t-86_400_000})),now),null);
});
test('fallback fails closed if a candle is corrupted',()=>{
 const data=candles(300);
 data[50].v=NaN;
 assert.equal(estimateDensity24hQuoteVolume(data,now),null);
});

test('fallback rejects sparse 24h history even with enough timestamp span',()=>{
 const sparse=candles(300).filter((_,i)=>i%3!==0);
 assert.equal(estimateDensity24hQuoteVolume(sparse,now),null);
});
