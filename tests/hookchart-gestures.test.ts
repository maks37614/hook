import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createChartTouchHold, isChartControlTarget } from '../src/components/hookchart/touchHold';
import { measurementHit } from '../src/components/hookchart/measurementTool';
import { rulerDragThresholdMet, rulerHasRange, isRangeDrawingTool, isPointDrawingTool } from '../src/components/hookchart/rulerGestures';
import { freeDrawingPoint, translateDrawingPoints } from '../src/components/hookchart/drawingManipulation';
import { hookChartHorizontalRange, resizeHookChartViewport } from '../src/utils/hookchartData';

// Execute the real handlers without a browser so transitions between gestures
// are covered together, rather than testing only the individual timer/helper.
const source = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('engine.tsx', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const chart = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Chart')!;
const declarations = new Map<string, string>();
function collect(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)
    declarations.set(node.name.text, node.initializer.getText(ast));
  ts.forEachChild(node, collect);
}
collect(chart);

function setup(overrides: Record<string, unknown> = {}) {
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const hold = createChartTouchHold({
    schedule(callback) { timers.set(++nextTimer, callback); return nextTimer; },
    cancel(id) { timers.delete(Number(id)); },
  });
  const captured = new Set<number>(), viewportUpdates: unknown[] = [];
  const owner = {
    setPointerCapture(id: number) { captured.add(id); },
    hasPointerCapture(id: number) { return captured.has(id); },
    releasePointerCapture(id: number) { captured.delete(id); },
  };
  const g = {r:{left:0,top:0,width:350,height:700},plotW:300,priceX:300,plotH:700,
    step:9,virtualStart:0,hi:110,lo:90,timeAtX:(x:number)=>x*1000,p:(y:number)=>110-y/35};
  const env: Record<string, any> = {
    ref:{current:{getBoundingClientRect:()=>g.r}},box:{current:owner},geom:{current:g},geometry:()=>g,
    isChartControlTarget,terminalMode:false,terminalNavigation:{current:false},transientRuler:true,
    fitAllScopeRef:{current:null},fitAllScopeKey:'live:binance:futures:BTCUSDT:1h',
    viewportAdjustedByUserRef:{current:false},manualPriceAxisOverride:{current:false},
    transient:{current:null},touchHold:{current:hold},cancelTouchHold:()=>hold.cancel(),
    touchCursorVisible:{current:false},suppressTouchClick:{current:false},magnifierPointer:{current:null},
    magnifierZoom:{current:2},magnifierPriceDrag:{current:null},
    TOUCH_MAGNIFIER_DEFAULT_ZOOM:2,
    magnifierZoomFromPriceDrag:(zoom:number,delta:number)=>Math.max(1.25,Math.min(6,zoom*Math.exp(-delta/150))),
    mouseRef:{current:null},hoveredMeasurement:{current:null},pointers:{current:new Map()},drag:{current:null},lastTap:{current:0},
    scheduleDraw:()=>{},editingDrawingId:null,drawings:[],draft:null,tool:'cursor',levelLabelMode:'always',autoLevels:[],timeMarkers:[],
    uid:()=> 'testing', drawingActionsPosition:(x:number,y:number)=>({x,y}),
    snap:(x:number,y:number)=>({t:x*1000,p:110-y/35}),
    setDraft:()=>{},setDrawingActions:()=>{},setAlertActions:()=>{},
    measurementHit,freeDrawingPoint,translateDrawingPoints,resizeHookChartViewport,
    rulerDragThresholdMet,rulerHasRange,isRangeDrawingTool,isPointDrawingTool,
    intervalMs:60000,symbol:'BTCUSDT',setSelectedDrawingId:()=>{},setEditingDrawingId:()=>{},setDrawings:()=>{},
    setAlerts:()=>{},onCreatePriceAlert:undefined,onSelectPriceAlert:undefined,hitAlertAt:()=>null,
    vp:{barWidth:9,rightOffset:0,autoY:true,manualCenter:null,manualRange:null},candles:[{t:0}],rightPaddingBars:0,rightPadding:0,
    setVp:(update:any)=>viewportUpdates.push(update(env.vp)),
    setGestureVp:(update:any,_kind:string)=>viewportUpdates.push(update(env.vp)),
    interactionRef:{current:{width:1,height:1}},interactionDrawRef:{current:()=>{}},
    lastCrosshair:{current:null},onCrosshairChange:()=>{},
    lastSentCrosshairPrice:{current:null},onCrosshairPriceChange:undefined,
    backgroundColor:'#131722',
    ...overrides,
  };
  const names=['point','zone','handlePointerDown','handlePointerMove','handlePointerUp','placeDrawingPoint','handleTouchEnd','drawInteraction','draw','fitAllHistory','panXWheel'];
  if (declarations.has('resetInteraction')) names.push('resetInteraction');
  const factory = `exports.build = (env) => {const {${Object.keys(env).join(',')}} = env;
    ${names.map(name=>`const ${name} = ${declarations.get(name)};`).join('\n')}
    return {${names.join(',')}};};`;
  const compiled = ts.transpileModule(factory,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports:Record<string,any>={};new Function('exports',compiled)(exports);
  const handlers=exports.build(env);
  env.interactionDrawRef.current=handlers.drawInteraction;
  const event=(x:number,y:number,id=1,type='pointermove')=>({clientX:x,clientY:y,pointerId:id,pointerType:'touch',button:0,type,
    target:{closest:()=>null},currentTarget:owner,preventDefault(){}});
  const fireHold=()=>{const callbacks=[...timers.values()];timers.clear();callbacks.forEach(callback=>callback());};
  return {env,handlers,event,fireHold,captured,viewportUpdates,timers};
}

test('a second finger pinches the chart even after the longer touch hold has opened the lens', () => {
  const t=setup();
  t.handlers.handlePointerDown(t.event(100,200));t.fireHold();t.fireHold();
  assert.ok(t.env.transient.current);
  assert.equal(t.env.magnifierPointer.current,1);
  t.handlers.handlePointerDown(t.event(200,200,2));
  t.handlers.handlePointerMove(t.event(240,200,2));
  assert.equal(t.viewportUpdates.length,1,'the previous ruler must not consume pinch movement');
  assert.equal(t.env.transient.current,null);
  assert.equal(t.env.magnifierPointer.current,null);
  t.handlers.handlePointerUp(t.event(240,200,2,'pointerup'));
  t.handlers.handlePointerMove(t.event(130,220));
  assert.equal(t.viewportUpdates.length,2,'the remaining finger must resume panning');
  t.handlers.handlePointerUp(t.event(130,220,1,'pointerup'));
  assert.equal(t.captured.size,0);
});

test('a chart waiting for candles cannot inspect cached data from the previous coin', () => {
  const t=setup({candles:[]});
  t.handlers.handlePointerDown(t.event(100,200));t.fireHold();
  assert.equal(t.captured.size,0);
  assert.equal(t.env.magnifierPointer.current,null);
  assert.equal(t.env.mouseRef.current,null);
  assert.equal(t.timers.size,0);
});

test('losing candle data clears the old chart, held lens and selected date immediately', () => {
  const fills:unknown[][]=[],positions:unknown[]=[];
  const main={width:700,height:1400,getContext:()=>({setTransform(){},fillRect(...args:unknown[]){fills.push(args);}})};
  const layer={width:700,height:1400};
  const t=setup({candles:[],geometry:()=>null,ref:{current:main},interactionRef:{current:layer},
    lastCrosshair:{current:{x:100,time:1234}},onCrosshairChange:(position:unknown)=>positions.push(position)});
  t.env.mouseRef.current={x:100,y:200};t.env.transient.current={t:1,p:100};
  t.env.magnifierPointer.current=1;t.env.pointers.current.set(1,{x:100,y:200});t.captured.add(1);
  t.env.touchHold.current.start(1,{x:100,y:200},()=>assert.fail('stale hold activated'));
  t.handlers.draw();t.fireHold();
  assert.deepEqual(fills,[[0,0,700,1400]]);
  assert.equal(t.env.geom.current,null);
  assert.equal(t.env.mouseRef.current,null);
  assert.equal(t.env.magnifierPointer.current,null);
  assert.equal(t.env.transient.current,null);
  assert.equal(t.captured.size,0);
  assert.deepEqual(layer,{width:1,height:1});
  assert.deepEqual(positions,[null]);
});

test('changing chart identity cancels pending or active inspection and accepts a fresh hold', () => {
  for(const activate of [false,true]) {
    const t=setup();
    t.handlers.handlePointerDown(t.event(100,200));
    if(activate){t.fireHold();t.fireHold();}
    t.handlers.resetInteraction();t.fireHold();
    assert.equal(t.env.magnifierPointer.current,null);
    assert.equal(t.env.transient.current,null);
    assert.equal(t.env.mouseRef.current,null);
    assert.equal(t.env.drag.current,null);
    assert.equal(t.env.touchCursorVisible.current,false);
    assert.equal(t.env.suppressTouchClick.current,false);
    assert.equal(t.env.geom.current,null);
    assert.equal(t.env.pointers.current.size,0);
    assert.equal(t.captured.size,0);
    assert.equal(t.timers.size,0);
    t.handlers.handlePointerDown(t.event(180,300,2));
    assert.equal(t.env.magnifierPointer.current,null);
    t.fireHold();t.fireHold();assert.equal(t.env.magnifierPointer.current,2);
  }
});

test('short hold exposes a freely movable cursor without a lens or viewport pan', () => {
  const t=setup();
  t.handlers.handlePointerDown(t.event(100,200));
  t.fireHold(); // early cursor
  assert.equal(t.env.drag.current.inspecting,true);
  assert.equal(t.env.magnifierPointer.current,null);
  assert.equal(t.env.touchCursorVisible.current,true);
  t.handlers.handlePointerMove(t.event(160,250));
  assert.deepEqual(t.env.mouseRef.current,{x:160,y:250});
  assert.equal(t.viewportUpdates.length,0,'inspection never pans the candles');
  t.fireHold(); // delayed lens should have been cancelled by cursor movement
  assert.equal(t.env.magnifierPointer.current,null);
  t.handlers.handlePointerUp(t.event(160,250,1,'pointerup'));
  assert.equal(t.env.touchCursorVisible.current,false);
  assert.equal(t.env.mouseRef.current,null);
  assert.equal(t.captured.size,0);
});

test('holding still longer switches the selected touch cursor to a magnifier', () => {
  const t=setup();
  t.handlers.handlePointerDown(t.event(180,220));
  t.fireHold();
  assert.equal(t.env.magnifierPointer.current,null);
  t.fireHold();
  assert.equal(t.env.magnifierPointer.current,1);
  assert.equal(t.env.drag.current.inspecting,true);
  t.handlers.handlePointerUp(t.event(180,220,1,'pointerup'));
  assert.equal(t.env.magnifierPointer.current,null);
});

test('middle mouse button opens the lens while held and releases without panning', () => {
  const t=setup();
  const middle=(type:string,x:number,y:number)=>({...t.event(x,y,11,type),pointerType:'mouse',button:1});
  const down=middle('pointerdown',130,225);
  let prevented=false; down.preventDefault=()=>{prevented=true};
  t.handlers.handlePointerDown(down);
  assert.equal(prevented,true);
  assert.equal(t.env.magnifierPointer.current,11);
  assert.equal(t.env.drag.current.inspecting,true);
  t.handlers.handlePointerMove(middle('pointermove',175,260));
  assert.deepEqual(t.env.mouseRef.current,{x:175,y:260});
  assert.equal(t.viewportUpdates.length,0);
  t.handlers.handlePointerUp(middle('pointerup',175,260));
  assert.equal(t.env.magnifierPointer.current,null);
  assert.equal(t.captured.size,0);
});

test('a second finger after the cursor-only stage starts ordinary pinch, not the magnifier', () => {
  const t=setup();
  t.handlers.handlePointerDown(t.event(80,200));t.fireHold();
  t.handlers.handlePointerDown(t.event(200,200,2));
  assert.equal(t.env.drag.current.kind,'pinch');
  t.handlers.handlePointerMove(t.event(240,200,2));
  assert.equal(t.viewportUpdates.length,1);
  assert.equal(t.env.magnifierPointer.current,null);
  t.fireHold();
  assert.equal(t.env.magnifierPointer.current,null);
});


test('a measurement endpoint can be resized directly while the ruler tool is active', () => {
  const g = { r: {left:0,top:0,width:400,height:700}, plotW:350, priceX:350, plotH:650,
    step:10, virtualStart:0, x:(t:number)=>100+t/1000, timeAtX:(x:number)=>(x-100)*1000, y:(p:number)=>1200-p*10,
    p:(y:number)=>120-y/10 };
  const state = { drawings: [{id:'BTCUSDT:1',type:'ruler',pts:[{t:0,p:100},{t:120000,p:90}]}] };
  const t = setup({
    tool:'ruler',drawings:state.drawings,geom:{current:g},geometry:()=>g,
    ref:{current:{getBoundingClientRect:()=>g.r}},
    snap:()=>{throw Error('Ruler endpoint resize must not snap to a candle');},
    setDrawings:(updater:(items:typeof state.drawings)=>typeof state.drawings)=>{state.drawings=updater(state.drawings);}
  });
  t.handlers.handlePointerDown(t.event(100,200));
  t.handlers.handlePointerMove(t.event(122,230));
  t.handlers.handlePointerUp(t.event(122,230,1,'pointerup'));
  assert.deepEqual(state.drawings[0].pts[0], {t:22000,p:97},'endpoint follows exact finger position without OHLC magnetism');
  assert.deepEqual(state.drawings[0].pts[1], {t:120000,p:90});
  assert.equal(t.env.suppressTouchClick.current,true);
  assert.equal(t.viewportUpdates.length,0,'resizing a ruler should not pan or zoom candles');
});

test('dragging the shaded measurement moves both endpoints without changing its dimensions', () => {
  const g = { r: {left:0,top:0,width:400,height:700}, plotW:350, priceX:350, plotH:650,
    step:10, virtualStart:0, x:(t:number)=>100+t/1000, timeAtX:(x:number)=>(x-100)*1000, y:(p:number)=>1200-p*10,
    p:(y:number)=>120-y/10 };
  const state = { drawings: [{id:'BTCUSDT:1',type:'ruler',pts:[{t:0,p:100},{t:120000,p:90}]}] };
  const t = setup({
    tool:'cursor',drawings:state.drawings,geom:{current:g},geometry:()=>g,
    ref:{current:{getBoundingClientRect:()=>g.r}},
    setDrawings:(updater:(items:typeof state.drawings)=>typeof state.drawings)=>{state.drawings=updater(state.drawings);}
  });
  t.handlers.handlePointerDown(t.event(160,250));
  t.handlers.handlePointerMove(t.event(181,290));
  t.handlers.handlePointerUp(t.event(181,290,1,'pointerup'));
  const [a,b] = state.drawings[0].pts;
  assert.equal(b.t-a.t,120000);
  assert.equal(b.p-a.p,-10);
  assert.equal(a.t,21000,'both points translate by the exact horizontal drag');
  assert.equal(a.p,96,'price displacement follows free pointer movement');
  assert.equal(t.viewportUpdates.length,0);
});

test('trend creates both endpoints with a single press-drag-release', () => {
  let drawings:any[]=[];
  let drafts:any[]=[];
  const t=setup({tool:'trend',
    setDraft:(point:any)=>{drafts.push(point)},
    setDrawings:(updater:(rows:any[])=>any[])=>{drawings=updater(drawings)}});
  t.handlers.handlePointerDown(t.event(100,200));
  assert.equal(t.env.drag.current?.kind,'drawingRangePlacement');
  assert.equal(t.env.magnifierPointer.current,null);
  assert.equal(t.timers.size,0);
  assert.equal(drawings.length,0);
  t.handlers.handlePointerMove(t.event(150,250));
  assert.deepEqual(t.env.mouseRef.current,{x:150,y:250});
  assert.equal(t.viewportUpdates.length,0);
  t.handlers.handleTouchEnd(t.event(150,250,1,'pointerup'));
  assert.equal(drawings.length,1);
  assert.equal(drawings[0].type,'trend');
  assert.deepEqual(drawings[0].pts,[{t:100_000,p:110-200/35},{t:150_000,p:110-250/35}]);
  assert.deepEqual(drafts,[null]);
  assert.equal(t.env.drag.current,null);
  assert.equal(t.captured.size,0);
  assert.equal(t.env.suppressTouchClick.current,true);
});

test('second endpoint of a trend uses the final finger location and saves the full line', () => {
  const first={t:100_000,p:101};
  let drawings: any[]=[];
  const drafts: any[]=[];
  let selectedId: string|null=null;
  const t=setup({tool:'trend',draft:first,
    setDraft:(point:any)=>drafts.push(point),
    setDrawings:(updater:(items:any[])=>any[])=>{drawings=updater(drawings);},
    setSelectedDrawingId:(id:string|null)=>{selectedId=id},
  });
  t.handlers.handlePointerDown(t.event(140,220));
  t.handlers.handlePointerMove(t.event(190,270));
  t.handlers.handleTouchEnd(t.event(190,270,1,'pointerup'));
  assert.equal(drawings.length,1);
  assert.equal(drawings[0].type,'trend');
  assert.deepEqual(drawings[0].pts,[first,{t:190_000,p:110-270/35}]);
  assert.deepEqual(drafts,[null]);
  assert.equal(selectedId,drawings[0].id);
  assert.equal(t.env.magnifierPointer.current,null);
  assert.equal(t.viewportUpdates.length,0);
});

test('drawing cancel and pinch never commit an accidental shape', () => {
  let writes=0;
  const canceled=setup({tool:'trend',setDrawings:()=>{writes++}});
  canceled.handlers.handlePointerDown(canceled.event(120,200));
  assert.equal(canceled.env.magnifierPointer.current,null);
  canceled.handlers.handlePointerUp(canceled.event(155,240,1,'pointercancel'));
  assert.equal(writes,0);

  let cleared=0;
  const pinched=setup({tool:'trend',setDraft:()=>{cleared++},setDrawings:()=>{writes++}});
  pinched.handlers.handlePointerDown(pinched.event(100,240));
  pinched.handlers.handlePointerDown(pinched.event(180,240,2));
  assert.equal(pinched.env.drag.current.kind,'pinch');
  pinched.handlers.handleTouchEnd(pinched.event(180,240,2,'pointerup'));
  pinched.handlers.handleTouchEnd(pinched.event(100,240,1,'pointerup'));
  assert.equal(cleared,1);
  assert.equal(writes,0,'pinch must not add a drawing');
});

test('press-drag-release works for all other two-anchor drawing tools', () => {
  for (const tool of ['ray','rect','fib','profile','ruler']) {
    let drawings:any[]=[];
    const t=setup({tool,setDrawings:(update:(rows:any[])=>any[])=>{drawings=update(drawings)}});
    t.handlers.handlePointerDown(t.event(115,210));
    assert.equal(t.env.drag.current.kind,'drawingRangePlacement',tool);
    assert.equal(t.env.magnifierPointer.current,null,tool);
    t.handlers.handlePointerMove(t.event(185,280));
    t.handlers.handleTouchEnd(t.event(185,280,1,'pointerup'));
    assert.equal(drawings.length,1,tool);
    assert.equal(drawings[0].type,tool);
    assert.equal(drawings[0].pts.length,2,tool);
  }
  const cursor=setup({tool:'cursor'});
  cursor.handlers.handlePointerDown(cursor.event(115,210));
  assert.equal(cursor.env.magnifierPointer.current,null);
  assert.equal(cursor.env.drag.current.kind,'touchCursor');
});

test('single-anchor level and text commit at the release position without a lens', () => {
  for(const tool of ['level','text']){
    let drawings: any[]=[];
    let selected: string|null=null;
    let draftCalls=0;
    const t=setup({tool,textLabel:'Precision note',
      setDrawings:(update:(items:any[])=>any[])=>{drawings=update(drawings);},
      setSelectedDrawingId:(id:string|null)=>{selected=id;},
      setDraft:()=>{draftCalls++},
    });
    t.handlers.handlePointerDown(t.event(100,200));
    assert.equal(t.env.drag.current?.kind,'drawingPointPlacement',tool);
    assert.equal(t.env.magnifierPointer.current,null,tool);
    assert.equal(drawings.length,0,'press does not commit the '+tool);
    t.handlers.handlePointerMove(t.event(175,250));
    assert.equal(t.viewportUpdates.length,0,'placing a '+tool+' does not pan candles');
    t.handlers.handleTouchEnd(t.event(175,250,1,'pointerup'));
    assert.equal(drawings.length,1,tool);
    assert.equal(drawings[0].type,tool);
    assert.deepEqual(drawings[0].pts,[{t:175_000,p:110-250/35}]);
    if(tool==='text')assert.equal(drawings[0].text,'Precision note');
    assert.equal(selected,drawings[0].id);
    assert.equal(draftCalls,0,'single-point tool must not arm a second endpoint');
    assert.equal(t.env.magnifierPointer.current,null);
    assert.equal(t.env.suppressTouchClick.current,true,'no duplicate synthetic click');
    assert.equal(t.captured.size,0);
  }
});

test('canceling single-anchor placement does not create an accidental mark', () => {
  for(const tool of ['level','text']){
    let writes=0;
    const t=setup({tool,setDrawings:()=>{writes++}});
    t.handlers.handlePointerDown(t.event(120,200));
    t.handlers.handlePointerMove(t.event(180,260));
    t.handlers.handlePointerUp(t.event(180,260,1,'pointercancel'));
    assert.equal(writes,0);
    assert.equal(t.env.magnifierPointer.current,null);
    assert.equal(t.captured.size,0);
  }
});

test('mouse and pen share the same press-drag-release geometry as touch', () => {
  for (const pointerType of ['mouse','pen'] as const) {
    let drawings:any[]=[];
    const t=setup({tool:'rect',setDrawings:(updater:(items:any[])=>any[])=>{drawings=updater(drawings)}});
    const event=(x:number,y:number,type:string)=>({...t.event(x,y,1,type),pointerType});
    t.handlers.handlePointerDown(event(100,200,'pointerdown'));
    t.handlers.handlePointerMove(event(175,245,'pointermove'));
    t.handlers.handleTouchEnd(event(175,245,'pointerup'));
    assert.equal(drawings.length,1,pointerType);
    assert.equal(drawings[0].type,'rect');
    assert.deepEqual(drawings[0].pts,[{t:100000,p:110-200/35},{t:175000,p:110-245/35}]);
  }
});

test('an unmoved tap arms the first anchor and a later tap completes the drawing', () => {
  let first:any=null;
  const one=setup({tool:'fib',setDraft:(value:any)=>{first=value}});
  one.handlers.handlePointerDown(one.event(80,200));
  one.handlers.handleTouchEnd(one.event(80,200,1,'pointerup'));
  assert.deepEqual(first,{t:80000,p:110-200/35});
  let drawings:any[]=[];
  const two=setup({tool:'fib',draft:first,
    setDrawings:(u:(items:any[])=>any[])=>{drawings=u(drawings)},
    setDraft:()=>{}});
  two.handlers.handlePointerDown(two.event(190,280));
  two.handlers.handleTouchEnd(two.event(190,280,1,'pointerup'));
  assert.equal(drawings.length,1);
  assert.deepEqual(drawings[0].pts,[first,{t:190000,p:110-280/35}]);
});

test('price alert only commits on release and existing marker keeps delete confirmation', () => {
  let created:number[]=[];
  let selected:string[]=[];
  const tap=setup({tool:'alert',onCreatePriceAlert:(price:number)=>created.push(price),
    onSelectPriceAlert:(id:string,action:string)=>selected.push(id+':'+action),
    hitAlertAt:()=>({id:'BTCUSDT:existing'})});
  tap.handlers.handlePointerDown(tap.event(150,245));
  assert.equal(created.length,0);
  tap.handlers.handleTouchEnd(tap.event(150,245,1,'pointerup'));
  assert.deepEqual(selected,['BTCUSDT:existing:delete']);
  assert.equal(created.length,0);
  const move=setup({tool:'alert',onCreatePriceAlert:(price:number)=>created.push(price),
    onSelectPriceAlert:(id:string,action:string)=>selected.push(id+':'+action),
    hitAlertAt:()=>({id:'BTCUSDT:existing'})});
  move.handlers.handlePointerDown(move.event(150,245));
  move.handlers.handlePointerMove(move.event(150,320));
  move.handlers.handleTouchEnd(move.event(150,320,1,'pointerup'));
  assert.deepEqual(created,[110-320/35]);
  assert.deepEqual(selected,['BTCUSDT:existing:delete']);
});

test('no drawing is saved on canceled gestures; two-finger pinch wins over point tools', () => {
  let saved=0;
  for(const tool of ['level','text','alert']){
    const t=setup({tool,setDrawings:()=>{saved++},setAlerts:()=>{saved++},
      onCreatePriceAlert:()=>{saved++}});
    t.handlers.handlePointerDown(t.event(100,200));
    t.handlers.handlePointerMove(t.event(170,280));
    t.handlers.handlePointerUp(t.event(170,280,1,'pointercancel'));
    assert.equal(saved,0,tool);
    const pinch=setup({tool,setDrawings:()=>{saved++},setAlerts:()=>{saved++},
      onCreatePriceAlert:()=>{saved++}});
    pinch.handlers.handlePointerDown(pinch.event(100,200));
    pinch.handlers.handlePointerDown(pinch.event(200,200,2));
    assert.equal(pinch.env.drag.current.kind,'pinch',tool);
    pinch.handlers.handlePointerMove(pinch.event(235,200,2));
    pinch.handlers.handleTouchEnd(pinch.event(235,200,2,'pointerup'));
    pinch.handlers.handleTouchEnd(pinch.event(100,200,1,'pointerup'));
    assert.equal(saved,0,tool);
  }
});

test('fit-all button resets stale vertical zoom and belongs to the active coin/timeframe', () => {
  for(const tf of ['30s','1m','5m','15m','1h','4h','1d']){
    const key=`live:binance:futures:BTCUSDT:${tf}`;
    const old={barWidth:5,rightOffset:42,autoY:false,manualCenter:120,manualRange:15,fitAll:false,yZoom:2.5};
    const t=setup({fitAllScopeKey:key,vp:old});
    t.handlers.fitAllHistory();
    assert.deepEqual(t.viewportUpdates,[{...old,rightOffset:0,autoY:true,
      manualCenter:null,manualRange:null,yZoom:1,fitAll:true}],tf);
    assert.equal(t.env.fitAllScopeRef.current,key);
    assert.equal(t.env.terminalNavigation.current,true);
  }
});

test('auto-follow leaves deliberate fit-all untouched on the next candle and visual resize', () => {
  assert.match(source,/previous\.fitAll&&fitAllScopeRef\.current===fitAllScopeKey/);
  assert.match(source,/oldSignature\.startsWith\(`\$\{profilePrefix\}:`\)/);
  assert.match(source,/\[symbol,tf,interactionScope\]/);
  assert.match(source,/\[symbol,tf,interactionScope,visualProfileKey/);
});

test('first touch pan or wheel pan after fit-all preserves the on-screen candle width', () => {
  const fitted={barWidth:3,rightOffset:0,autoY:true,manualCenter:null,manualRange:null,fitAll:true,yZoom:1};
  const touch=setup({vp:fitted});
  touch.handlers.handlePointerDown(touch.event(100,200));
  touch.handlers.handlePointerMove(touch.event(145,240));
  const moved=touch.viewportUpdates.at(-1) as Record<string, any>;
  assert.equal(moved.fitAll,false);
  assert.equal(moved.barWidth,9,'must use the fitted on-screen step instead of stale 3px');
  assert.ok(moved.rightOffset>0);

  const candles=Array.from({length:32},(_,i)=>({t:i*60_000}));
  const wheel=setup({vp:fitted,candles});
  wheel.handlers.panXWheel(27,300);
  const wheelView=wheel.viewportUpdates.at(-1) as typeof fitted;
  const original=hookChartHorizontalRange(candles.length,300,fitted);
  const next=hookChartHorizontalRange(candles.length,300,wheelView);
  assert.equal(wheelView.fitAll,false);
  assert.equal(next.step,original.step);
  assert.ok(Math.abs(next.virtualStart-original.virtualStart+27/original.step)<1e-9);
});

test('hover labels reuse the interaction layer when no levels are visible', () => {
  const renderFlags: boolean[] = [];
  const t = setup({ levelLabelMode: 'hover', scheduleDraw: (scene: boolean) => renderFlags.push(scene) });
  t.handlers.handlePointerMove(t.event(100, 200));
  assert.deepEqual(renderFlags, [false]);
  const withLevels = setup({
    levelLabelMode: 'hover',
    autoLevels: [{ p: 105 }],
    scheduleDraw: (scene: boolean) => renderFlags.push(scene),
  });
  withLevels.handlers.handlePointerMove(withLevels.event(100, 200));
  assert.deepEqual(renderFlags, [false, true]);
});


test('mobile Terminal price-axis swipes zoom only the candle price scale, not candle width', () => {
  for (const [start, end, expectedDirection] of [
    [280, 160, 'in'], [160, 280, 'out'],
  ] as const) {
    const t = setup({terminalMode:true,terminalAutoScale:true});
    let prevented = 0;
    const down = t.event(330, start);
    down.preventDefault = () => { prevented++; };
    t.handlers.handlePointerDown(down);
    assert.equal(t.env.drag.current?.kind, 'price');
    assert.equal(t.timers.size, 0, 'no hold timer or magnifier on the price scale');
    const move = t.event(330, end);
    move.preventDefault = () => { prevented++; };
    t.handlers.handlePointerMove(move);
    assert.ok(prevented >= 2, 'price gesture must not scroll the page');
    assert.equal(t.viewportUpdates.length, 1);
    const result = t.viewportUpdates[0] as Record<string, number | boolean | null>;
    assert.equal(result.autoY, false, 'the gesture starts a manual Y viewport');
    assert.ok(typeof result.manualRange === 'number' && result.manualRange > 0);
    assert.ok(expectedDirection === 'in' ? result.manualRange < 20 : result.manualRange > 20);
    assert.equal(result.barWidth, 9, 'the timeframe/candle width is unchanged');
    assert.equal(result.rightOffset, 0);
    assert.equal(t.env.suppressTouchClick.current, true);
    t.handlers.handleTouchEnd(t.event(330, end, 1, 'pointerup'));
    assert.equal(t.env.drag.current, null);
    assert.equal(t.env.lastTap.current, 0, 'a zoom drag must not count as a double-tap reset');
    assert.equal(t.captured.size, 0);
  }
});

test('price axis still zooms while a drawing tool is selected; plot drawing gestures are unchanged', () => {
  const t = setup({terminalMode:true,tool:'trend'});
  t.handlers.handlePointerDown(t.event(330,210));
  assert.equal(t.env.drag.current?.kind,'price');
  t.handlers.handlePointerMove(t.event(330,170));
  assert.equal(t.viewportUpdates.length,1);
  assert.equal((t.viewportUpdates[0] as Record<string,unknown>).autoY,false);
  assert.equal(t.env.magnifierPointer.current,null);
  t.handlers.handleTouchEnd(t.event(330,170,1,'pointerup'));
  const plot = setup({terminalMode:true,tool:'trend'});
  plot.handlers.handlePointerDown(plot.event(130,210));
  assert.equal(plot.env.drag.current?.kind,'drawingRangePlacement');
});

test('price drag starts from the visible auto-fit range rather than a stale saved zoom',()=>{
  const t=setup({terminalMode:true,terminalAutoScale:true,vp:{
    barWidth:9,rightOffset:0,autoY:false,manualCenter:500,manualRange:1000,
  }});
  t.handlers.handlePointerDown(t.event(330,280));
  t.handlers.handlePointerMove(t.event(330,160));
  const result=t.viewportUpdates.at(-1) as Record<string,number>;
  assert.ok(result.manualRange<20&&result.manualRange>0, 'do not jump to the saved 1000-unit range');
  assert.ok(Math.abs(result.manualCenter-100)<15, 'keep the visible price roughly under the finger');
});

test('tiny price pairs retain precise zoom rather than clamping the range to 1e-9',()=>{
  const g = {r:{left:0,top:0,width:350,height:700},plotW:300,priceX:300,plotH:700,
    step:9,virtualStart:0,hi:2e-12,lo:1e-12,
    timeAtX:(x:number)=>x*1000,p:(y:number)=>2e-12 - y/700*1e-12};
  const t=setup({terminalMode:true,geom:{current:g},geometry:()=>g,
    ref:{current:{getBoundingClientRect:()=>g.r}}});
  t.handlers.handlePointerDown(t.event(330,280));
  t.handlers.handlePointerMove(t.event(330,190));
  const result=t.viewportUpdates.at(-1) as Record<string,number>;
  assert.ok(result.manualRange>0&&result.manualRange<1e-9,'sub-nanodollar prices remain zoomable');
  assert.ok(Number.isFinite(result.manualCenter));
});

test('Terminal price gestures temporarily override auto-fit; reset and re-enable restore it',()=>{
  assert.match(source,/if\(kind==='price'\)manualPriceAxisOverride\.current=true/);
  assert.match(source,/terminalAutoScale&&!manualPriceAxisOverride\.current/);
  assert.match(source,/const keepManualPrice=manualPriceAxisOverride\.current&&!previous\.autoY/);
  assert.match(source,/if\(terminalAutoScale&&!wasTerminalAutoScaleEnabled\.current\)/);
  assert.match(source,/manualPriceAxisOverride\.current=false;fitAllScopeRef\.current=fitAllScopeKey/);
  const t=setup();
  t.env.manualPriceAxisOverride.current=true;
  t.handlers.fitAllHistory();
  assert.equal(t.env.manualPriceAxisOverride.current,false, 'Show all history restores automatic scaling');
});

test('price-axis touch reset and explicit date jump protect user scale during late history',()=>{
  // These commands update the viewport directly, unlike the pan/zoom gestures.
  // They must still mark a user change before the asynchronous history resolves.
  assert.match(source,/const focusAtTime=\(target:number,fitDay=false\)=>\{[\s\S]*?viewportAdjustedByUserRef\.current=true/);
  assert.match(source,/const handleDoubleClick=[^\n]*viewportAdjustedByUserRef\.current=true/);
  const t=setup();
  t.env.lastTap.current=Date.now()-50;
  t.handlers.handleTouchEnd(t.event(320,200,1,'pointerup'));
  assert.equal(t.env.viewportAdjustedByUserRef.current,true);
});
