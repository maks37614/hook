import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createScalperAnalyzer, type ScalperCandle, type ScalperKind, type ScalperLine } from '../src/components/hookchart/scalperMode';
import { normalizeScalperLineWidth, scalperRenderedLineEndX, scalperRasterStrokeWidth, scalperPixelCenteredHorizontalY, cascadeLineIsActive, cascadeFutureRayStartX } from '../src/components/hookchart/scalperLineProjection';

const horizontal = (role:ScalperLine['role'],price=277.46):ScalperLine=>({
  role,
  from:{t:1_700_000_000_000,p:price},
  to:{t:1_700_000_060_000,p:price},
});

test('every surviving horizontal cascade shelf and breakout boundary reaches the price-scale edge',()=>{
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
  assert.match(layer,/q\.moveTo\(cascadeRay \? cascadeRayStartX! : x0, y0\)/);
  assert.match(layer,/q\.lineTo\(renderedEndX, y1\)/);
  assert.match(layer,/if \(cascadeRay && y1 >= 0 && y1 <= g\.plotH\)/);
  assert.match(layer,/q\.moveTo\(Math\.max\(0, g\.plotW - 2\), y1\)/);
  assert.match(layer,/q\.lineTo\(g\.plotW, y1\)/);
  assert.match(layer,/q\.lineWidth = scalperStrokeWidth;/);
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
  assert.match(overlay,/activeCascadeLines\.has\(boundary\)/);
  assert.match(overlay,/priceTag\(boundary\.from\.p, '', color/);
});

test('every automatic Scalper line uses the same CSS width and the cascade projection remains intact',()=>{
  assert.equal(normalizeScalperLineWidth(undefined),0.4);
  assert.equal(normalizeScalperLineWidth(Number.NaN),0.4);
  assert.equal(normalizeScalperLineWidth(0.1),0.2);
  assert.equal(normalizeScalperLineWidth(0.7),0.7);
  assert.equal(normalizeScalperLineWidth(8),5);
  const engine=readFileSync(new URL('../src/components/hookchart/engine.tsx',import.meta.url),'utf8');
  const start=engine.indexOf('if (scalperResult?.setups.length) {');
  const end=engine.indexOf('drawHookTimeMarkers(q,g,timeMarkers,mouse);',start);
  const layer=engine.slice(start,end);
  assert.match(layer,/for \(const setup of scalperResult\.setups\)/);
  assert.match(layer,/for \(const line of setup\.lines\)/);
  assert.match(layer,/q\.lineWidth = scalperStrokeWidth;/);
  assert.doesNotMatch(layer,/scalperCascadeLineWidth|scalperTrendStrokeWidth|setup\.kind === 'trend' \?/);
  assert.equal(scalperRenderedLineEndX('cascade',horizontal('upper'),100,400),400);
});

test('Scalper thin-line raster width stays uniform across its full length and DPRs', () => {
  assert.equal(scalperRasterStrokeWidth(0.4, 1, 1), 1, 'at least one physical pixel on DPR1');
  assert.equal(scalperRasterStrokeWidth(0.4, 2, 2), 0.5, 'one physical pixel on DPR2');
  assert.equal(scalperRasterStrokeWidth(0.4, 4, 4), 0.5, 'two physical pixels on DPR4');
  assert.equal(scalperRasterStrokeWidth(0.2, 4, 4), 0.25, '0.2 CSS px remains visible');
  assert.equal(scalperRasterStrokeWidth(1, 4, 4), 1, 'larger configured widths stay intact');
  assert.equal(scalperRasterStrokeWidth(0.4, 2, 4), 0.5, 'uneven bitmap axes use safe minimum scale');
  assert.ok(Number.isFinite(scalperRasterStrokeWidth(Number.NaN, 0, Infinity)));
});

test('horizontal Scalper strokes align their center without moving diagonal wick pivots', () => {
  assert.equal(scalperPixelCenteredHorizontalY(7.2, 0.5, 2), 7.25);
  assert.equal(scalperPixelCenteredHorizontalY(7.2, 0.5, 4), 7.25);
  assert.equal(scalperPixelCenteredHorizontalY(7.2, 1, 2), 7);
  assert.equal(scalperPixelCenteredHorizontalY(Number.NaN, 0.5, 2), Number.NaN);
  const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  const from = engine.indexOf('if (scalperResult?.setups.length) {');
  const to = engine.indexOf('drawHookTimeMarkers(q,g,timeMarkers,mouse);', from);
  const layer = engine.slice(from, to);
  assert.ok(from >= 0 && to > from);
  assert.match(engine, /scalperRasterStrokeWidth\(normalizeScalperLineWidth\(scalperLineWidth\), scaleX, scaleY\)/);
  assert.match(layer, /const horizontalLine = line\.from\.p === line\.to\.p/);
  assert.match(layer, /const y0 = horizontalLine \? scalperPixelCenteredHorizontalY\(rawY0, scalperStrokeWidth, scaleY\) : rawY0/);
  assert.match(layer, /const y1 = horizontalLine \? y0 : rawY1/);
  assert.match(layer, /q\.lineWidth = scalperStrokeWidth/);
  assert.match(layer, /q\.moveTo\(cascadeRay \? cascadeRayStartX! : x0, y0\)/);
  assert.match(layer, /q\.lineTo\(renderedEndX, y1\)/);
});

test('cascade tiers disappear after the first later wick reaches the price', () => {
  const base = 1_700_000_000_000;
  const make = (i:number,h:number,l:number):ScalperCandle => ({
    t:base+i*60_000,o:100,c:100,h,l,
  });
  const upper:ScalperLine = {role:'cascade-step',
    from:{t:base,p:101},to:{t:base+3*60_000,p:101}};
  const lower:ScalperLine = {role:'cascade-step',
    from:{t:base,p:99},to:{t:base+3*60_000,p:99}};
  const safe = [make(0,101,99),make(1,100.5,99.5),make(2,100.4,99.6)];
  assert.equal(cascadeLineIsActive(upper,[],safe,'upper'),true,
    'the creating pivot candle cannot invalidate its own level');
  assert.equal(cascadeLineIsActive(lower,[],safe,'lower'),true);
  assert.equal(cascadeLineIsActive(upper,[],[...safe,make(3,101,99.5)],'upper'),false,
    'a later wick touching upper tier immediately hides it');
  assert.equal(cascadeLineIsActive(lower,[],[...safe,make(3,100.4,98.99)],'lower'),false,
    'a later wick piercing lower tier immediately hides it');
  assert.equal(cascadeLineIsActive(upper,[],[...safe,make(3,101.5,101.2)],'upper'),false,
    'even a gap across the tier cannot leave a stale ray');
});

test('outer cascade boundary activates at its last matching wick pivot, not its first', () => {
  const base = 1_700_000_000_000;
  const boundary:ScalperLine={role:'upper',
    from:{t:base,p:101.3},to:{t:base+4*60_000,p:101.3}};
  const touches=[{t:base,p:101.1},{t:base+60_000,p:101.2},{t:base+2*60_000,p:101.3}];
  const candle=(i:number,h:number):ScalperCandle=>({
    t:base+i*60_000,o:100,c:100,h,l:99.5,
  });
  const initial=[candle(0,101.1),candle(1,101.2),candle(2,101.3),candle(3,100.8)];
  assert.equal(cascadeLineIsActive(boundary,touches,initial,'upper'),true,
    'the defining confirmed pivot is not falsely counted as a post-creation crossing');
  assert.equal(cascadeLineIsActive(boundary,touches,[...initial,candle(4,101.31)],'upper'),false);
  const inner:ScalperLine={role:'cascade-step',
    from:{t:base,p:101.1},to:{t:base+60_000,p:101.1}};
  assert.equal(cascadeLineIsActive(inner,touches,initial,'upper'),false,
    'an old inner tier crossed by later pivots must not be projected');
});

test('cascade rays begin only after the last candle, leaving past candle geometry clear',()=>{
  assert.equal(cascadeFutureRayStartX(100,10,2,200),105.5);
  assert.equal(cascadeFutureRayStartX(100,10,1,200),106);
  assert.equal(cascadeFutureRayStartX(198,10,2,200),null,
    'nothing projects when no future chart space remains');
  assert.equal(cascadeFutureRayStartX(-100,10,2,200),0,
    'a chart panned into empty future space may start at the plot edge');
  assert.equal(cascadeFutureRayStartX(100,10,0,200),null);
  const engine=readFileSync(new URL('../src/components/hookchart/engine.tsx',import.meta.url),'utf8');
  assert.match(engine,/const activeCascadeLines = useMemo\(/);
  assert.match(engine,/cascadeLineIsActive\(line, setup\.touches, candles, side\)/);
  assert.match(engine,/\[scalperResult, candles\]/,
    'pan and zoom must not recheck all recent price levels');
  assert.match(engine,/if \(setup\.kind === 'cascade' && !activeCascadeLines\.has\(line\)\) continue/);
  assert.match(engine,/cascadeFutureRayStartX\(g\.x\(candles\[candles\.length - 1\]\.t\), g\.step, scaleX, g\.plotW\)/);
});
