import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { terminalViewportHistoryPhase } from '../src/components/hookchart/terminalAutoScale';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('all Terminal timeframes depend on actual history completion',()=>{
  for(const tf of ['1m','5m','15m','1h','4h','1d']){
    for(const count of [0,1,2,11,12,180,181,1000]){
      assert.equal(terminalViewportHistoryPhase(tf,count,true,false),'seed',tf+' '+count);
      assert.equal(terminalViewportHistoryPhase(tf,count,true,true),'ready',tf+' '+count);
    }
  }
  // 30s trade-derived candles have no REST history.
  for(const count of [0,1,2,12,180])
    assert.equal(terminalViewportHistoryPhase('30s',count,true,false),'ready');
  for(const tf of ['1m','5m','15m','1h','4h','1d'])
    assert.equal(terminalViewportHistoryPhase(tf,1,false,false),'ready');
});

test('Terminal viewport responds to seed-to-history transition, not live candle ticks',()=>{
  const engine=read('src/components/hookchart/engine.tsx');
  const page=read('src/components/TerminalPage.tsx');
  const widget=read('src/components/terminal/TerminalChartWidget.tsx');
  const wrapper=read('src/components/ExchangeCandlestickChart.tsx');
  const live=read('src/components/TradingViewChart.tsx');
  const canvas=read('src/components/hookchart/HookChartCanvas.tsx');
  assert.match(engine,/const terminalHistoryPhase=terminalViewportHistoryPhase\(tf,candles\.length,/);
  assert.match(engine,/const signature=`\$\{profilePrefix\}:\$\{historyPhase\}:\$\{Math\.round\(width\)\}`/);
  assert.match(engine,/hasHistoryCandles,terminalHistoryPhase,initialLogicalRange/);
  assert.match(engine,/terminalHistoryReady\)/);
  assert.match(live,/setInitialHistoryLoaded\(true\)/);
  assert.match(live,/terminalHistoryReady=\{terminalTradeCandles \|\| initialHistoryLoaded \|\| klines\.length > 1\}/);
  assert.match(canvas,/terminalHistoryReady=\{terminalHistoryReady\}/);
  assert.match(engine,/viewportAdjustedByUserRef\.current=true/);
  assert.match(engine,/oldSignature\?\.startsWith\(\`\$\{profilePrefix\}:seed:\`\)\&\&historyPhase==='ready'/);
  assert.match(engine,/fitAllScopeRef\.current===fitAllScopeKey/);
  assert.match(page,/updateBlocks\(previous => applyTerminalTimeframe\(previous, tf\)\)/);
  assert.match(page,/\['5s', '30s', '1m', '5m', '15m', '1h', '4h', '1d'\]/);
  assert.match(widget,/terminalInitialView=\{useIntegratedHookChartToolbar \? terminalInitialView : undefined\}/);
  assert.match(wrapper,/key=\{\`\$\{exchange\}:\$\{marketType\}:\$\{symbol\}:\$\{timeframe\}\`\}/);
  // This fix must not change exchange subscriptions or 1-minute live ticks.
  const helper=read('src/components/hookchart/terminalAutoScale.ts');
  const phase=helper.slice(helper.indexOf('export function terminalViewportHistoryPhase('));
  assert.doesNotMatch(phase,/fetch\(|WebSocket|setInterval|setTimeout/);
});
