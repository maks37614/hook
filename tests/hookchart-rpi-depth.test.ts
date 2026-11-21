import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBybitInclusiveRpiLevels, BybitOrderBookSync } from '../server/surveillance/bybitOrderBook';
import { chartDepthScope, supportsChartRpi } from '../src/utils/hookChartDepthProtocol';
import { formatDensityUsdCompact, formatDensityUsdExact } from '../src/utils/densityNotional';
test('RPI scopes are isolated and Binance spot unsupported',()=>{
  assert.notEqual(chartDepthScope('bybit','spot','BTCUSDT'),chartDepthScope('bybit','spot','BTCUSDT',true));
  assert.equal(supportsChartRpi('binance','spot'),false);
  assert.equal(supportsChartRpi('binance','futures'),true);
});
test('Bybit combines distinct fields once, preserves zeros and rejects malformed data',()=>{
  assert.deepEqual(parseBybitInclusiveRpiLevels([['100','2','3'],['99','0','0']]),[[100,5],[99,0]]);
  assert.equal(parseBybitInclusiveRpiLevels([['100','2']]),null);
  assert.equal(parseBybitInclusiveRpiLevels([['100','2','-1']]),null);
  const updates:any[]=[]; const sync=new BybitOrderBookSync('BTCUSDT',u=>updates.push(u),()=>{},true);
  const msg={topic:'orderbook.rpi.BTCUSDT',type:'snapshot',ts:Date.now(),data:{s:'BTCUSDT',u:1,seq:2,b:[['100','2','3']],a:[['101','4','5']]}};
  sync.push({...msg,topic:'orderbook.1000.BTCUSDT'});
  assert.equal(updates.length,0); sync.push(msg);
  assert.deepEqual(updates[0].bids,[[100,5]]); assert.deepEqual(updates[0].asks,[[101,9]]);
});
test('density labels preserve precision',()=>{
  assert.equal(formatDensityUsdCompact(109650,'en'),'109.65k$');
  assert.equal(formatDensityUsdExact(109650.23,'en'),'109,650.23$');
});
