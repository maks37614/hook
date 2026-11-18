import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  validateHeatmapSnapshot,
  visibleHeatmapRects,
  paintObservedLiquidationHeatmap,
  type LiquidationHeatmapBin,
} from '../src/components/hookchart/liquidationHeatmap';

const base=Date.UTC(2026,10,14,12,0,0);
const raw=(symbol='BTCUSDT')=>({
  source:'observed_liquidations',
  exchange:'binance',
  symbol, hours:24, complete:false, truncated:false,
  caveat:'Observed-only, not predictive',
  bins:[{
    time:base,price:100,side:'LONG',usd:20_000,count:2,
  }],
});

test('chart and Liq heatmap use EXACT shared X/Y candle transforms', () => {
  const g={
    plotW:500,plotH:400,step:120,
    // a 1h candle has its center at x=60 and left edge at x=0
    x:(t:number)=>60+(t-base)/3_600_000*120,
    y:(p:number)=>400-(p-90)/20*400,
    timeAtX:(x:number)=>base+(x-60)/120*3_600_000,
  };
  const bin:LiquidationHeatmapBin={time:base,price:100,side:'LONG',usd:50_000,count:1};
  const r=visibleHeatmapRects([bin],'24h',g,50_000);
  assert.equal(r.length,1);
  // Left of the 1h candle and 10 CSS px wide (5m / 1h * 120px).
  assert.ok(Math.abs(r[0].left-0)<1e-8);
  assert.ok(Math.abs(r[0].width-10)<1e-8);
  assert.ok(r[0].top<200&&r[0].top>195);
  assert.ok(r[0].height>9&&r[0].height<12);
  assert.equal(r[0].side,'LONG');
  const zoom={...g,step:240,x:(t:number)=>120+(t-base)/3_600_000*240,
    timeAtX:(x:number)=>base+(x-120)/240*3_600_000};
  const rz=visibleHeatmapRects([bin],'24h',zoom,50_000);
  assert.equal(rz.length,1);
  assert.ok(Math.abs(rz[0].left-0)<1e-8);
  assert.ok(Math.abs(rz[0].width-20)<1e-8);
  const priceZoom={...g,y:(p:number)=>400-(p-95)/10*400};
  const ry=visibleHeatmapRects([bin],'24h',priceZoom,50_000);
  assert.ok(Math.abs(ry[0].height-r[0].height*2)<1e-7);
});

test('7d bins use 15-minute time interval; unused or offscreen bins are culled', () => {
  const g={
    plotW:1000,plotH:500,step:60,
    x:(t:number)=>30+(t-base)/3_600_000*60,
    y:(p:number)=>500-(p-90)/20*500,
    timeAtX:(x:number)=>base+(x-30)/60*3_600_000,
  };
  const far=Array.from({length:6000},(_,i)=>({
    time:base-6001*900_000+i*900_000,
    price:100,side:'SHORT' as const,usd:1000,count:1,
  }));
  const bins=[...far,{time:base,price:100,side:'SHORT' as const,usd:2000,count:1}];
  const rects=visibleHeatmapRects(bins,'7d',g,2000);
  assert.equal(rects.length,1,'old time buckets do not paint into current viewport');
  assert.ok(Math.abs(rects[0].width-15)<1e-8);
});

test('exact scope/source, untrusted numeric data and truncation are checked', () => {
  const good=validateHeatmapSnapshot(raw(),'binance','BTCUSDT','24h');
  assert.equal(good?.bins.length,1);
  assert.equal(good?.bins[0].count,2);
  assert.equal(good?.complete,false);
  assert.equal(validateHeatmapSnapshot(raw('BTCUSDT'),'binance','ETHUSDT','24h'),null);
  assert.equal(validateHeatmapSnapshot(raw('BTCUSDT'),'binance','BTCUSDT','7d'),null);
  const malformed={...raw(),bins:[...raw().bins,{
    time:base,price:NaN,side:'LONG',usd:123,count:1,
  },{
    time:base+1,price:100,side:'LONG',usd:2,count:1,
  },{
    time:base,price:100,side:'LONG',usd:-100,count:1,
  }]};
  assert.equal(validateHeatmapSnapshot(malformed,'binance','BTCUSDT','24h')?.bins.length,1);
});

test('empty/off heatmap does not use canvas at all', () => {
  let draws=0, saves=0;
  const fake={
    save:()=>saves++,restore:()=>{},fillRect:()=>draws++,
    set globalAlpha(_x:number){},set fillStyle(_v:string){},
  } as unknown as CanvasRenderingContext2D;
  const g={plotW:300,plotH:200,step:12,x:(t:number)=>t,y:(p:number)=>p,timeAtX:(x:number)=>x};
  paintObservedLiquidationHeatmap(fake,[],'24h',g,1);
  assert.equal(saves,0);
  assert.equal(draws,0);
  paintObservedLiquidationHeatmap(fake,[{
    time:base,price:100,side:'LONG',usd:50,count:1,
  }],'24h',g,100);
  assert.equal(draws,0,'offscreen liquidation does not draw');
});

test('map switch is under expanded tools, disabled by default, absent on replay/spot', () => {
  const ui=readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx',import.meta.url),'utf8');
  const engine=readFileSync(new URL('../src/components/hookchart/engine.tsx',import.meta.url),'utf8');
  assert.match(ui,/useState\(false\);\s*const \[liquidationMapPeriod/);
  assert.match(ui,/liquidationMapSupported = !replay && !externalData && marketType === 'futures'/);
  assert.match(ui,/LazyLiquidationHeatmapLoader = React\.lazy/);
  assert.match(ui,/liquidationMapOn && liquidationMapSupported/);
  assert.match(ui,/aria-pressed=\{liquidationMapOn\}/);
  // Map remains immediately left of the fixed settings gear, including
  // the 24h/7d active state; it is no longer buried in scrollable tools.
  const right = ui.indexOf('className={liquidationMapSupported ? "toolbarRight hasLiqMap" : "toolbarRight"}');
  const mapGroup = ui.indexOf('className="liqHeatmapTools"', right);
  const period = ui.indexOf("(['24h','7d'] as const).map", mapGroup);
  const mapIcon = ui.indexOf('<MapIcon size={15}', mapGroup);
  const settings = ui.indexOf('aria-label="Налаштування hookchart"', mapIcon);
  assert.ok(right > 0 && right < mapGroup && mapGroup < period &&
    period < mapIcon && mapIcon < settings);
  assert.equal(ui.indexOf('className="liqHeatmapTools"'), mapGroup,
    'Liq map switch is rendered in one place only');
  const posAfter = ui.slice(mapIcon, settings);
  assert.doesNotMatch(posAfter, /className=\{'liqHeatmapPeriod'/);
  const anchoredCss = readFileSync(new URL('../src/components/hookchart/integration.css',import.meta.url),'utf8');
  assert.match(anchoredCss,/\.hookchart-terminal \.hookchart-terminal-toolbar \.toolbarRight\.hasLiqMap/);

  // Compact map glyph, never the old flame-and-text pill. Accessible
  // label/pressed state remain available for mobile assistive technology.
  assert.match(ui,/Map as MapIcon/);
  assert.match(ui,/<MapIcon size=\{15\} strokeWidth=\{1\.9\} aria-hidden="true" \/>/);
  assert.doesNotMatch(ui,/<Flame size=\{14\}\/><span>Карта Liq<\/span>/);
  assert.match(ui,/aria-label=\{liquidationMapOn \? 'Вимкнути карту ліквідацій' : 'Увімкнути карту ліквідацій'\}/);
  const css=readFileSync(new URL('../src/components/hookchart/integration.css',import.meta.url),'utf8');
  assert.match(css,/\.liqHeatmapTools button\.liqHeatmapSwitch \{[\s\S]*?width:30px;/);
  assert.match(css,/\.liqHeatmapTools button\.liqHeatmapSwitch\.active/);
  assert.match(ui,/liquidationHeatmap=\{mapChartData\}/);
  assert.match(engine,/if \(liquidationHeatmap\?\.bins\.length\) \{/);
  assert.match(engine,/paintObservedLiquidationHeatmap\(q,liquidationHeatmap\.bins/);
  assert.match(engine,/showVolumes,showLiquidations,showLiquidationCandleSums,(?:[A-Za-z][A-Za-z0-9_]*,)*liquidationHeatmap/);
  const source=readFileSync(new URL('../src/components/hookchart/LiquidationHeatmapLoader.tsx',import.meta.url),'utf8');
  assert.match(source,/setInterval\(\(\)=>void refresh\(\),60_000\)/);
  assert.match(source,/document\.visibilityState==='hidden'/);
});

test('one chart-tab fetch for concurrent same-symbol heatmap requests; no market websocket', async () => {
  const previous=globalThis.fetch;
  let calls=0;
  globalThis.fetch=(async()=>{
    calls++;
    return new Response(JSON.stringify({success:true,data:raw('DUMMYUSDT')}),{
      status:200,headers:{'Content-Type':'application/json'},
    });
  }) as typeof fetch;
  try {
    const {fetchSharedObservedHeatmap}=await import('../src/components/hookchart/LiquidationHeatmapLoader');
    const results=await Promise.all(Array.from({length:12},()=>
      fetchSharedObservedHeatmap('binance','DUMMYUSDT','24h')));
    assert.equal(calls,1,'same-market Terminal cards share one in-flight request');
    assert.ok(results.every(r=>r.status==='available'&&r.data?.bins.length===1));
    await fetchSharedObservedHeatmap('binance','DUMMYUSDT','24h');
    assert.equal(calls,1,'repeat request hits short-lived memory cache');
  }finally {globalThis.fetch=previous;}
});

test('disabled PostgreSQL Liq archive is acknowledged only after user opts in', async () => {
  const prev=globalThis.fetch;
  let calls=0;
  globalThis.fetch=(async()=>{
    calls++;
    return new Response('Not Found',{status:404});
  }) as typeof fetch;
  try {
    const {fetchSharedObservedHeatmap}=await import('../src/components/hookchart/LiquidationHeatmapLoader');
    const result=await fetchSharedObservedHeatmap('bybit','NOTARCHIVEDUSDT','7d');
    assert.equal(calls,1);
    assert.equal(result.status,'disabled');
    assert.equal(result.data,null);
  }finally {globalThis.fetch=prev;}
});


test('Liq heatmap still supports 24h/7d without an attribution block over candles', () => {
  const chart=readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx',import.meta.url),'utf8');
  const styles=readFileSync(new URL('../src/components/hookchart/integration.css',import.meta.url),'utf8');
  assert.doesNotMatch(chart,/liqHeatmapAttribution/);
  assert.equal(chart.includes('Liq ${liquidationMapPeriod}: отримані події'),false);
  assert.doesNotMatch(styles,/liqHeatmapAttribution/);
  assert.match(chart,/\['24h','7d'\] as const/);
  assert.match(chart,/period=\{liquidationMapPeriod\}/);
  assert.match(chart,/modeledLiquidationBands=\{modeledLiquidationBands\}/);
});
