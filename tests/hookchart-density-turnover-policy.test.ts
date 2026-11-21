import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldSubscribeDensityTurnover} from '../src/components/hookchart/densityTurnoverPolicy';
import {readFileSync} from 'node:fs';
test('AUTO ticker input is independent of the statistics footer',()=>{
 const base={replay:false,archiveMode:false,externalData:false,lightweight:false,densityAnalysis:true,densityMode:'auto'};
 assert.equal(shouldSubscribeDensityTurnover(base),true);
 assert.equal(shouldSubscribeDensityTurnover({...base,densityMode:'manual'}),false);
 for(const key of ['replay','archiveMode','externalData','lightweight'] as const)
   assert.equal(shouldSubscribeDensityTurnover({...base,[key]:true}),false,key);
 assert.equal(shouldSubscribeDensityTurnover({...base,densityAnalysis:false}),false);
 const ui=readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url),'utf8');
 assert.match(ui,/\(showMarketStats \|\| autoTurnoverEnabled\) && tradeCount24h\?\.scope/);
 assert.match(ui,/if \(!showMarketStats && !autoTurnoverEnabled\) return/);
 assert.match(ui,/if \(showMarketStats && benchmark/);
 assert.match(ui,/\['trades24h', exchange, marketType, cleanedSymbol\]/);
});
