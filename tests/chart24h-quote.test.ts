import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chart24hPercent } from '../src/utils/chart24hQuote';
import { translatePhrase } from '../src/locales';

const now = 1_800_000_000_000;
const coin = {
  symbol:'SOLUSDT', exchange:'binance' as const, marketType:'futures' as const,
  priceChange24h: 4.45, lastUpdated: now - 30_000,
};
const streamed = { key:'binance:futures:SOLUSDT', change24h:-2.75, receivedAt:now-500 };

test('public WS 24h change wins over older scanner snapshot on matching market',()=>{
  assert.equal(chart24hPercent(coin,streamed,now),-2.75);
  assert.equal(chart24hPercent({...coin,symbol:'SOL/USDT'},streamed,now),-2.75);
});

test('other exchange, spot or instrument cannot update selected chart percent',()=>{
  for(const changed of [
    {...coin,exchange:'bybit' as const},
    {...coin,marketType:'spot' as const},
    {...coin,symbol:'BTCUSDT'},
  ]) assert.equal(chart24hPercent(changed,streamed,now),coin.priceChange24h);
});

test('stale and future timestamps do not masquerade as live 24h changes',()=>{
  assert.equal(chart24hPercent({...coin,lastUpdated:now-180_000},null,now),null);
  assert.equal(chart24hPercent({...coin,lastUpdated:now+120_000},null,now),null);
  assert.equal(chart24hPercent({...coin,lastUpdated:now-200_000},{...streamed,receivedAt:now-90_000},now),null);
  assert.equal(chart24hPercent({...coin,lastUpdated:now-200_000},{...streamed,receivedAt:now+10_000},now),null);
  assert.equal(chart24hPercent({...coin,lastUpdated:undefined},null,now),null);
  assert.equal(chart24hPercent({...coin,priceChange24h:0,lastUpdated:now},null,now),0);
});

test('formations and fullscreen share one-symbol public quote source and hide unavailable zero estimates',()=>{
  const formation=readFileSync(new URL('../src/components/FormationDetailsModal.tsx',import.meta.url),'utf8');
  const fullscreen=readFileSync(new URL('../src/components/FullscreenChartModal.tsx',import.meta.url),'utf8');
  const hook=readFileSync(new URL('../src/utils/chart24hQuote.ts',import.meta.url),'utf8');
  assert.match(formation,/useChartLive24hQuote\(\{[\s\S]*?symbol: coin.symbol,[\s\S]*?\}, !isFullscreenChartOpen && !showArchivedStatic\)/);
  assert.match(fullscreen,/useChartLive24hQuote\(\{[\s\S]*?symbol: activeCoin.symbol,[\s\S]*?\}, isOpen\)/);
  assert.match(hook,/createScreenerQuoteSocket\(/);
  assert.match(hook,/socket.updateScopes\(\[\{ exchange:/);
  assert.match(formation,/change24h === null \? '\(—\)'/);
  // Fullscreen now supports selecting one of several chart slots. The displayed
  // quote must belong to the selected slot, not the old primary chart.
  assert.match(fullscreen,/const headerChange24h = selectedHeaderSlot/);
  assert.match(fullscreen,/headerChange24h === null \? '\(—\)'/);
});
test('unavailable 24h data label is translated in all 4 languages',()=>{
 const text='Немає актуальних даних за 24 години';
 for(const lang of ['uk','en','ru','pl'] as const){
   const output=translatePhrase(lang,text);
   assert.ok(output);
   if(lang!=='uk')assert.notEqual(output,text);
 }
});
