import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChartViewportNotifier } from '../src/components/hookchart/viewportNotifier';

function frameClock(){
  let next=0;
  const jobs=new Map<number,()=>void>();
  return {
    request(callback:()=>void){const id=++next;jobs.set(id,callback);return id},
    cancel(id:number){jobs.delete(id)},
    tick(){const callbacks=[...jobs.values()];jobs.clear();callbacks.forEach(callback=>callback())},
    get count(){return jobs.size},
    jobs,
  };
}

test('high-frequency pointer viewport commits notify the parent once with the newest viewport',()=>{
  const clock=frameClock();
  const notifier=createChartViewportNotifier<{rightOffset:number},'pan'|'zoom'|'price'|'focus'>(clock);
  const parent:number[]=[],kinds:string[]=[];
  for(let i=0;i<500;i++){
    notifier.request({viewport:{rightOffset:i},kind:'pan',
      onChange:viewport=>parent.push(viewport.rightOffset),
      onGesture:(viewport,kind)=>kinds.push(kind+':'+viewport.rightOffset)});
  }
  assert.equal(clock.count,1);
  assert.deepEqual(parent,[]);
  clock.tick();
  assert.deepEqual(parent,[499]);
  assert.deepEqual(kinds,['pan:499']);
  assert.equal(clock.count,0);
});

test('the last zoom or price gesture is delivered with the same final viewport as the chart',()=>{
  const clock=frameClock();
  const notifier=createChartViewportNotifier<{barWidth:number},'pan'|'zoom'|'price'>(clock);
  const events:string[]=[];
  const send=(width:number,kind:'pan'|'zoom'|'price')=>notifier.request({
    viewport:{barWidth:width},kind,
    onChange:v=>events.push('axis:'+v.barWidth),
    onGesture:(v,k)=>events.push(k+':'+v.barWidth),
  });
  send(9,'pan');
  send(11,'zoom');
  send(12,'price');
  clock.tick();
  assert.deepEqual(events,['axis:12','price:12']);
  send(13,'zoom');
  clock.tick();
  assert.deepEqual(events.slice(-2),['axis:13','zoom:13']);
});

test('explicit reset and saved-profile viewport updates remain immediate',()=>{
  const clock=frameClock();
  const notifier=createChartViewportNotifier<{rightOffset:number},'pan'|'focus'>(clock);
  const seen:number[]=[];
  const notify=(rightOffset:number,kind:'pan'|'focus'|null)=>({
    viewport:{rightOffset},kind,onChange:(v:{rightOffset:number})=>seen.push(v.rightOffset),
  });
  notifier.request(notify(42,'pan'));
  notifier.flush(notify(0,'focus'));
  assert.deepEqual(seen,[0]);
  assert.equal(clock.count,0);
  clock.tick();
  assert.deepEqual(seen,[0]);
  notifier.flush(notify(9,null));
  assert.deepEqual(seen,[0,9]);
});

test('cancellation makes even an already captured RAF callback harmless',()=>{
  const clock=frameClock();
  const notifier=createChartViewportNotifier<{rightOffset:number},'pan'>(clock);
  let count=0;
  notifier.request({viewport:{rightOffset:1},kind:'pan',onChange:()=>count++});
  const stale=[...clock.jobs.values()][0];
  notifier.cancel();
  stale();
  clock.tick();
  assert.equal(count,0);
  assert.equal(clock.count,0);
});

test('HookChart keeps its local viewport and original raster, throttling only parent callbacks',()=>{
  const engine=readFileSync(new URL('../src/components/hookchart/engine.tsx',import.meta.url),'utf8');
  assert.match(engine,/const \[vp,setVp\]=useState<Viewport>/);
  assert.match(engine,/const viewportNotifier=useMemo\(\(\)=>createChartViewportNotifier<Viewport,ViewportGesture>\(\),\[\]\)/);
  assert.match(engine,/if\(kind&&kind!=='focus'\)viewportNotifier\.request\(notification\)/);
  assert.match(engine,/else viewportNotifier\.flush\(notification\)/);
  assert.match(engine,/useEffect\(\(\)=>\(\)=>viewportNotifier\.cancel\(\),\[viewportNotifier\]\)/);
  assert.match(engine,/frames\.current\?\.request\(true\)/);
  assert.match(engine,/q\.fillRect\(wickLeftPx,wickTopPx,wickPx,wickHPx\)/);
  assert.match(engine,/q\.fillRect\(bodyLeftPx,bodyTopPx,bodyPx,bodyHPx\)/);
});
