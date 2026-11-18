import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { estimateHistoricalLiqRecurrence, paintHistoricalLiqRecurrence } from '../src/components/hookchart/historicalLiqRecurrence';
import type { LiquidationHeatmapBin } from '../src/components/hookchart/liquidationHeatmap';

const NOW = Date.UTC(2026, 10, 14, 17, 0, 0);
const INTERVAL = 300_000;
const point = (time: number, price: number, usd = 10_000, count = 2,
  side: 'LONG' | 'SHORT' = 'LONG'): LiquidationHeatmapBin =>
  ({time,price,usd,count,side});

test('forecast off and empty history yield NO modeled bands', () => {
  assert.deepEqual(estimateHistoricalLiqRecurrence([], '24h', 65000, NOW), []);
  assert.deepEqual(estimateHistoricalLiqRecurrence([point(NOW - INTERVAL,65000,1_000_000,50)],
    '24h', 65000, NOW), [],
    'one huge liquidation event does not justify a future stripe');
});

test('only repeated distinct historical time/price ranges yield bands', () => {
  const historical = [
    point(NOW - 15 * INTERVAL, 65000, 100_000),
    point(NOW - 10 * INTERVAL, 65000, 200_000),
    point(NOW - 5 * INTERVAL, 65000, 350_000),
    point(NOW - 2 * INTERVAL, 68000, 10_000_000, 1),
  ];
  const bands = estimateHistoricalLiqRecurrence(historical, '24h', 65_100, NOW);
  assert.equal(bands.length, 1);
  assert.equal(bands[0].distinctTimeBuckets, 3);
  assert.equal(bands[0].observedEvents, 6);
  assert.equal(bands[0].dominantSide, 'LONG');
  assert.equal(bands[0].relativeIntensity, 100);
  assert.ok(bands[0].priceLow <= 65000 && 65000 <= bands[0].priceHigh,
    'modeled band never invents a new price center');
});

test('price far from current chart or stale >24h data is excluded', () => {
  const stale = [point(NOW - 2 * 86_400_000, 65_000),
    point(NOW - 2 * 86_400_000 + INTERVAL, 65_000),
    point(NOW - 2 * 86_400_000 + 2 * INTERVAL, 65_000)];
  assert.deepEqual(estimateHistoricalLiqRecurrence(stale, '24h', 65_000, NOW), []);
  const far = [point(NOW - INTERVAL * 3,100_000),
    point(NOW - INTERVAL * 2,100_000),point(NOW - INTERVAL,100_000)];
  assert.deepEqual(estimateHistoricalLiqRecurrence(far, '24h', 65_000, NOW), []);
  assert.deepEqual(estimateHistoricalLiqRecurrence(far,'24h',NaN,NOW), []);
  assert.deepEqual(estimateHistoricalLiqRecurrence(far,'24h',0,NOW), []);
});

test('relative model intensity is never a USD amount or a calibrated probability', () => {
  const bins=[
    point(NOW - INTERVAL * 3,65_000,10_000),point(NOW - INTERVAL * 2,65_000,10_000),
    point(NOW - INTERVAL,65_000,10_000),
    point(NOW - INTERVAL * 3,66_000,5000,3,'SHORT'),
    point(NOW - INTERVAL * 2,66_000,5000,3,'SHORT'),
    point(NOW - INTERVAL,66_000,5000,3,'SHORT'),
  ];
  const bands=estimateHistoricalLiqRecurrence(bins,'24h',65_500,NOW);
  assert.equal(bands.length,2);
  assert.ok(bands.every(b=>b.relativeIntensity>=1 && b.relativeIntensity<=100));
  assert.ok(bands.every(b=>!('futureUsd' in b) && !('probability' in b)));
  assert.ok(bands.some(b=>b.dominantSide==='SHORT'));
  assert.ok(bands.some(b=>b.dominantSide==='LONG'));
});

test('model paint is behind price candles, clipped and uses native chart price Y', () => {
  let saved=0, restored=0, rects=0, gradients=0;
  const gradient={addColorStop:(_offset:number,_color:string)=>{}};
  const ctx={
    save:()=>{saved++;},
    restore:()=>{restored++;},
    createLinearGradient:()=>{gradients++;return gradient;},
    fillRect:(x:number,y:number,w:number,h:number)=>{
      rects++;
      assert.equal(x,0);
      assert.equal(w,400);
      assert.ok(y>=0&&y<250);
      assert.ok(h>0);
    },
    set fillStyle(_value:CanvasGradient){},
  } as unknown as CanvasRenderingContext2D;
  const bands=estimateHistoricalLiqRecurrence([
    point(NOW - INTERVAL * 4,65_000),point(NOW - INTERVAL * 3,65_000),
    point(NOW - INTERVAL,65_000),
  ],'24h',65_000,NOW);
  paintHistoricalLiqRecurrence(ctx,[],{plotW:400,plotH:250,y:p=>250-(p-63_000)*.08});
  assert.equal(rects,0);
  paintHistoricalLiqRecurrence(ctx,bands,{plotW:400,plotH:250,y:p=>250-(p-63_000)*.08});
  assert.equal(rects,1);
  assert.equal(gradients,1);
  assert.equal(saved,1);
  assert.equal(restored,1);
});

test('opt-in flag is persisted, normalized OFF for old accounts, and map OFF skips model computations', () => {
  const types=readFileSync(new URL('../src/types.ts',import.meta.url),'utf8');
  const settings=readFileSync(new URL('../src/components/hookchart/OriginalHookChartSettings.tsx',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx',import.meta.url),'utf8');
  const engine=readFileSync(new URL('../src/components/hookchart/engine.tsx',import.meta.url),'utf8');
  assert.match(types,/showModeledLiquidationZones\?: boolean/);
  assert.match(settings,/showModeledLiquidationZones: false/);
  assert.match(settings,/showModeledLiquidationZones = source\?\.showModeledLiquidationZones === true/);
  assert.match(settings,/Прогнозні зони Liq · модель за історією/);
  assert.match(ui,/recurrenceEnabled = liquidationMapOn && liquidationMapSupported/);
  assert.match(ui,/!recurrenceEnabled \|\| !mapChartData/);
  assert.match(ui,/!visibleMap\?\.truncated/);
  assert.match(ui,/modeledLiquidationBands=\{modeledLiquidationBands\}/);
  assert.match(engine,/if \(modeledLiquidationBands\?\.length\)/);
  assert.match(engine,/paintHistoricalLiqRecurrence/);
  const model=readFileSync(new URL('../src/components/hookchart/historicalLiqRecurrence.ts',import.meta.url),'utf8');
  assert.doesNotMatch(model,/fetch\(|WebSocket|setInterval\(/);
});
