import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createScalperAnalyzer, type ScalperCandle, type ScalperKind, type ScalperLine } from '../src/components/hookchart/scalperMode';
import { scalperRenderedLineEndX } from '../src/components/hookchart/scalperLineProjection';

const horizontal = (role:ScalperLine['role'],price=277.46):ScalperLine=>({
  role,
  from:{t:1_700_000_000_000,p:price},
  to:{t:1_700_000_060_000,p:price},
});

test('every horizontal cascade shelf and breakout boundary reaches the price-scale edge',()=>{
  for(const role of ['cascade-step','upper','lower'] as const){
    const line=horizontal(role);
    for(const plotW of [80,180,400,900]){
      assert.equal(scalperRenderedLineEndX('cascade',line,145,plotW),plotW,
        `cascade ${role} must touch the right edge of a ${plotW}px chart`);
    }
  }
});

test('other formations and diagonal lines keep their original endpoints',()=>{
  for(const kind of ['range','triangle','wedge','trend','double-top','double-bottom'] as ScalperKind[]){
    for(const role of ['upper','lower','neckline','cascade-step'] as const)
      assert.equal(scalperRenderedLineEndX(kind,horizontal(role),145,400),145,
        kind+' '+role+' must not be extended');
  }
  assert.equal(scalperRenderedLineEndX('cascade',horizontal('neckline'),145,400),145);
  const diagonal={...horizontal('upper'),to:{t:1_700_000_060_000,p:277.5}};
  assert.equal(scalperRenderedLineEndX('cascade',diagonal,145,400),145);
  assert.equal(scalperRenderedLineEndX('cascade',horizontal('cascade-step'),145,Infinity),145);
});

test('the cascade detector keeps original pivot timestamps and price values',()=>{
  const rows:ScalperCandle[]=Array.from({length:75},(_,i)=>({
    t:1_700_000_000_000+i*60_000,o:10,c:10,
    h:[30,39,48,57].includes(i)?10.09+[30,39,48,57].indexOf(i)*.02:10.03,
    l:9.97,
  }));
  const scene=createScalperAnalyzer().evaluate(rows,'binance:futures:BTCUSDT:1m',false,true);
  const setup=scene.setups.find(x=>x.kind==='cascade');
  assert.ok(setup,'fixture must detect a genuine cascade');
  const shelf=setup.lines.find(line=>line.role==='cascade-step');
  assert.ok(shelf);
  assert.ok(shelf.to.t> shelf.from.t,'source tier keeps original bounded time span');
  assert.equal(shelf.to.p,shelf.from.p,'tier stays at the pivot price');
  assert.equal(scalperRenderedLineEndX(setup.kind,shelf,180,420),420);
  assert.ok(setup.lines.some(line=>line.role==='upper'));
});

test('Scalper draw uses the plot boundary, without changing stroke, labels or candle renderer',()=>{
  const engine=readFileSync(new URL('../src/components/hookchart/engine.tsx',import.meta.url),'utf8');
  const start=engine.indexOf('if (scalperResult?.setups.length) {');
  const end=engine.indexOf('drawHookTimeMarkers(q,g,timeMarkers,mouse);',start);
  assert.ok(start>=0&&end>start);
  const layer=engine.slice(start,end);
  assert.match(layer,/scalperRenderedLineEndX\(setup\.kind, line, x1, g\.plotW\)/);
  assert.match(layer,/if \(cascadeRay && x0 > g\.plotW\) continue/);
  assert.match(layer,/q\.moveTo\(cascadeRay \? Math\.max\(0, x0\) : x0, y0\)/);
  assert.match(layer,/q\.lineTo\(renderedEndX, y1\)/);
  assert.match(layer,/if \(cascadeRay && y1 >= 0 && y1 <= g\.plotH\)/);
  assert.match(layer,/q\.moveTo\(Math\.max\(0, g\.plotW - 2\), y1\)/);
  assert.match(layer,/q\.lineTo\(g\.plotW, y1\)/);
  assert.match(layer,/q\.lineWidth = line\.role === 'cascade-step' \? 0\.7/);
  assert.match(layer,/q\.setLineDash\(scalperLineDash\(scalperLineStyle, setup\.status\)\)/);
  assert.match(layer,/q\.strokeStyle = color/);
  assert.match(layer,/if \(anchor && showScalperLabels\)/);
  assert.match(engine,/q\.fillRect\(wickLeftPx,wickTopPx,wickPx,wickHPx\)/);
  assert.match(engine,/q\.fillRect\(bodyLeftPx,bodyTopPx,bodyPx,bodyHPx\)/);
});

test('cascade outer boundary has a real scale price badge but tiers do not flood the scale',()=>{
  const engine=readFileSync(new URL('../src/components/hookchart/engine.tsx',import.meta.url),'utf8');
  const start=engine.indexOf('// Mark the actionable outer tier');
  const end=engine.indexOf('for(const marker of paintedMarkers)',start);
  assert.ok(start>=0 && end>start);
  const overlay=engine.slice(start,end);
  assert.match(overlay,/setup\.kind !== 'cascade'/);
  assert.match(overlay,/setup\.lines\.find\(line => line\.role === 'upper' \|\| line\.role === 'lower'\)/);
  assert.match(overlay,/g\.x\(boundary\.from\.t\) > g\.plotW/);
  assert.match(overlay,/priceTag\(boundary\.from\.p, '', color/);
});
