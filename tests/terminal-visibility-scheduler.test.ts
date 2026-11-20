import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { subscribeTerminalWidgetVisibility } from '../src/utils/terminalVisibilityScheduler';

test('Terminal scroll checks all cards with one RAF, one root rect and shared listeners',()=>{
  const saved = {
    window: Object.getOwnPropertyDescriptor(globalThis,'window'),
    document: Object.getOwnPropertyDescriptor(globalThis,'document'),
    intersection: Object.getOwnPropertyDescriptor(globalThis,'IntersectionObserver'),
    resize: Object.getOwnPropertyDescriptor(globalThis,'ResizeObserver'),
  };
  type Callback = () => void;
  const events = () => {
    const listeners = new Map<string,Set<Callback>>();
    return {
      addEventListener(name:string, cb:Callback) {
        if (!listeners.has(name)) listeners.set(name,new Set());
        listeners.get(name)!.add(cb);
      },
      removeEventListener(name:string,cb:Callback){listeners.get(name)?.delete(cb);},
      emit(name:string){for(const cb of listeners.get(name) || []) cb();},
      count(name:string){return listeners.get(name)?.size || 0;},
    };
  };
  const windowEvents=events(), rootEvents=events(), documentEvents=events();
  let nextFrame=1,rootRects=0,cardRects=0,ioCount=0,roCount=0,ioDisconnected=0,roDisconnected=0;
  const pending=new Map<number,Callback>();
  const root={
    ...rootEvents,
    getBoundingClientRect(){rootRects++;return {top:0,left:0,bottom:600,right:900}},
  };
  const screen={
    ...windowEvents,innerHeight:600,innerWidth:900,
    requestAnimationFrame(cb:Callback){const id=nextFrame++;pending.set(id,cb);return id;},
    cancelAnimationFrame(id:number){pending.delete(id);},
  };
  class FakeIntersectionObserver {
    constructor(_callback:Callback,_options:unknown){ioCount++}
    observe(_node:unknown){}
    unobserve(_node:unknown){}
    disconnect(){ioDisconnected++}
  }
  class FakeResizeObserver {
    constructor(_callback:Callback){roCount++}
    observe(_node:unknown){}
    unobserve(_node:unknown){}
    disconnect(){roDisconnected++}
  }
  const assign=(name:string,value:unknown)=>
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  const restore=(name:string,desc:PropertyDescriptor|undefined)=>{
    if(desc)Object.defineProperty(globalThis,name,desc);
    else Reflect.deleteProperty(globalThis,name);
  };
  const cleanups:Array<() => void>=[];
  try {
    assign('window',screen);
    assign('document',{...documentEvents,documentElement:root});
    assign('IntersectionObserver',FakeIntersectionObserver);
    assign('ResizeObserver',FakeResizeObserver);
    let changed=0;
    for(let i=0;i<24;i++){
      const node={
        closest(){return root},
        getBoundingClientRect(){cardRects++;return {top:20+i*22,left:20,bottom:40+i*22,right:440}},
      };
      cleanups.push(subscribeTerminalWidgetVisibility(
        node as unknown as HTMLElement,()=>{changed++}));
    }
    assert.equal(ioCount,1,'one IntersectionObserver per scroll viewport');
    assert.equal(roCount,1,'one ResizeObserver per scroll viewport');
    assert.equal(rootEvents.count('scroll'),1,'one scroll listener for 24 charts');
    assert.equal(windowEvents.count('scroll'),1);
    assert.equal(windowEvents.count('resize'),1);
    assert.equal(documentEvents.count('visibilitychange'),1);
    assert.equal(pending.size,1,'subscribe to 24 cards schedules only one RAF');
    for(const cb of [...pending.values()])cb();
    pending.clear();
    assert.equal(changed,24);
    assert.equal(rootRects,1,'root layout measured just once for every card');
    assert.equal(cardRects,24);
    rootEvents.emit('scroll');
    rootEvents.emit('scroll');
    windowEvents.emit('resize');
    assert.equal(pending.size,1,'scroll and resize events collapse to one RAF');
    for(const cb of [...pending.values()])cb();
    pending.clear();
    assert.equal(rootRects,2);
    assert.equal(cardRects,48);
    assert.equal(changed,48);
  } finally {
    for(const cleanup of cleanups)cleanup();
    assert.equal(rootEvents.count('scroll'),0);
    assert.equal(windowEvents.count('scroll'),0);
    assert.equal(ioDisconnected,1);
    assert.equal(roDisconnected,1);
    restore('window',saved.window);
    restore('document',saved.document);
    restore('IntersectionObserver',saved.intersection);
    restore('ResizeObserver',saved.resize);
  }
});

test('each Terminal card subscribes to a shared visibility tracker without replacing lazy unloading',()=>{
  const widget=readFileSync(new URL('../src/components/terminal/TerminalChartWidget.tsx',import.meta.url),'utf8');
  assert.match(widget,/subscribeTerminalWidgetVisibility\(node,/);
  assert.match(widget,/setIsNearViewport\(current => current === near \? current : near\)/);
  assert.match(widget,/const shouldLoadWidgets = !isSuspended/);
  assert.doesNotMatch(widget,/scrollRoot\?\.addEventListener\('scroll'/);
});
