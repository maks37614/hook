'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const mainPath = path.join(__dirname, '..', 'main.cjs');

function simulateDesktop({destroyToolbarBeforeClosed = false, useLegacyBrowserView = false} = {}) {
  const created = [], files = [];
  let cursorY = 0;
  let nextWebId = 10;
  let clockOffsetMs = 0;
  let screenCalls = 0;
  const SimulatedDate = class extends Date {
    static now(){return Date.now()+clockOffsetMs;}
  };
  class FakeWebContents {
    constructor() { this.id = ++nextWebId; this.urls = []; this.callbacks = new Map(); this.closed = false; }
    setWindowOpenHandler() {}
    on(name, listener) { this.callbacks.set(name, listener); }
    loadFile() { return Promise.resolve(); }
    loadURL(url) { this.urls.push(url); return Promise.resolve(); }
    send(channel, payload) { this.lastMessage = {channel,payload}; }
    isDestroyed() { return this.closed; }
    isLoading() { return false; }
    close() { this.closed = true; }
  }
  class FakeWindow {
    constructor(options) {
      this.options = options; this.visible = !!options.show; this.dead = false;
      this.bounds = {x: options.x||0, y:options.y||0, width:options.width||480, height:options.height||470};
      this.events = new Map(); this.webContents = new FakeWebContents();
      this.childViews = [];
      this.contentView = { addChildView: view => this.childViews.push(view) }; this.top = false;
      created.push(this);
    }
    on(name, listener) { const list=this.events.get(name)||[];list.push(listener);this.events.set(name,list); }
    setBrowserView(view) { this.childViews.push(view); this.browserView=view; }
    loadURL(url){return this.webContents.loadURL(url);}
    emit(name) { for(const callback of this.events.get(name)||[]) callback(); }
    isDestroyed(){return this.dead;}
    getBounds(){return {...this.bounds};}
    getContentBounds(){return {...this.bounds};}
    setBounds(bounds){this.bounds={...bounds};this.emit('moved');this.emit('resized');}
    isVisible(){return this.visible;}
    hide(){this.visible=false;}
    showInactive(){this.visible=true;}
    destroy(){
      this.dead=true;
      if (destroyToolbarBeforeClosed) {
        for (const view of this.childViews) {
          view.destroyed=true;
          view.contents.closed=true;
        }
      }
      this.emit('closed');
    }
    isAlwaysOnTop(){return this.top;}
    setAlwaysOnTop(value){this.top=value;}
  }
  class FakeView {
    constructor(){this.contents=new FakeWebContents();this.destroyed=false;}
    get webContents(){
      if (this.destroyed) throw new Error('Object has been destroyed');
      return this.contents;
    }
    setBackgroundColor(){}
    setBounds(bounds){this.bounds={...bounds};}
  }
  const electron={
    app:{requestSingleInstanceLock(){return false;},quit(){},setAppUserModelId(){}},
    BrowserWindow:FakeWindow,WebContentsView:useLegacyBrowserView ? undefined : FakeView,
    BrowserView:FakeView,Menu:{buildFromTemplate(){return {popup(){}};}},
    ipcMain:{},shell:{openExternal(){return Promise.resolve();}},
    screen:{
      screenToDipPoint:point=>point,
      getCursorScreenPoint:()=>({x:100,y:cursorY}),
      getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1080}}),
      getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1920,height:1080}}),
      getAllDisplays:()=>{screenCalls++;return [{workArea:{x:0,y:0,width:1920,height:1080}}];},
    },
  };
  const source=fs.readFileSync(mainPath,'utf8')+String.raw`
    globalThis.__audit={
      setSettings(value){settings=normalizeSettings(value)},
      getSettings(){return settings},
      acceptWindows, syncWindows, closeProvider, patchQuickProfile, findMultiTargets,
      snapshot, setManualTarget(provider,id){manualTargets.set(provider,id)},
      webURL,
      getWindows(){return windows},
      getToolbarOwners(){return toolbarOwners},
      getResizeOwners(){return resizeOwners},
      setEcoMode, toolbarLabels,
      startDockHeightResize,moveDockHeightResize,finishDockHeightResize,
    };
  `;
  const actualRequire=createRequire(mainPath);
  const sandbox={
    require:(id)=>{
      if(id==='electron')return electron;
      if(id==='node:fs')return {mkdirSync(){},writeFileSync(...args){files.push(args);},renameSync(){},readFileSync(){return '{}';}};
      return actualRequire(id);
    },
    __dirname:path.dirname(mainPath),__filename:mainPath,
    console, setTimeout, clearTimeout, URL, process, Date:SimulatedDate,
  };
  vm.runInNewContext(source,sandbox,{filename:mainPath});
  return {engine:sandbox.__audit,created,files,
    setCursorY(y){cursorY=y;},
    advanceTime(ms){clockOffsetMs+=ms;}, screenCalls(){return screenCalls;}};
}
const tick=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const meta={id:'100',pid:432,exe:'MetaScalp',title:'MetaScalp Trading',
  left:250,top:160,width:800,height:610,minimized:false};
test('ECO closes extra block webviews, keeps the live first pane and restores the saved configuration',()=>{
  const {engine,created,files}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{
    enabled:true,side:'right',mode:'blocks',widgets:['screener','formations','early'],
  }}});
  engine.acceptWindows([meta]);
  const original=engine.getWindows().get('metascalp');
  assert.equal(original.size,3);
  const first=original.get('screener');
  const before=first.webContents.urls.length;
  engine.setEcoMode(true);
  assert.equal(engine.getSettings().ecoMode,true);
  assert.equal(engine.getWindows().get('metascalp').size,1);
  assert.equal(engine.getWindows().get('metascalp').get('screener'),first);
  assert.equal(first.webContents.urls.length,before,'retained chart must not reconnect');
  assert.deepEqual(Array.from(engine.getSettings().profiles.metascalp.widgets),
    ['screener','formations','early'],'stored user selection remains intact');
  assert.equal(engine.toolbarLabels().ecoMode,true);
  assert.ok(files.length>0,'user choice is persisted');
  engine.setEcoMode(false);
  assert.equal(engine.getSettings().ecoMode,false);
  assert.equal(engine.getWindows().get('metascalp').size,3);
  assert.equal(engine.getWindows().get('metascalp').get('screener'),first);
  assert.equal(first.webContents.urls.length,before);
  assert.equal(created.filter(w=>!w.dead).length,3);
});

test('ECO collapses multi-window views to one target and restores others on exit',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{tiger:{enabled:true,mode:'multi',side:'auto'}}});
  const targets=[1,2,3].map((x)=>({...meta,id:'t'+x,exe:'Tiger.Trade',title:'Tiger '+x,
    left:150+(x-1)*580,width:420,top:190,height:460}));
  engine.acceptWindows(targets);
  const collection=engine.getWindows().get('tiger');
  assert.equal(collection.size,3);
  engine.setEcoMode(true);
  assert.equal(collection.size,1);
  assert.equal(engine.getSettings().profiles.tiger.mode,'multi');
  engine.setEcoMode(false);
  assert.equal(collection.size,3);
});

test('ECO toolbar state descriptions remain localized and off by default',()=>{
  const {engine}=simulateDesktop();
  assert.equal(engine.getSettings().ecoMode,false);
  assert.equal(engine.toolbarLabels().ecoMode,false);
  assert.match(engine.toolbarLabels().ecoEnable,/ECO/);
  engine.setEcoMode(true);
  assert.equal(engine.toolbarLabels().ecoMode,true);
  engine.setEcoMode(false);
  assert.equal(engine.toolbarLabels().ecoMode,false);
});

test('hidden/no-space terminal never loads a scanner page',()=>{
  const {engine,created}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'full',side:'right'}}});
  engine.acceptWindows([]);
  assert.equal(created.length,0);
  engine.acceptWindows([{...meta,left:0,top:0,width:1920,height:1080}]);
  assert.equal(created.length,0,'no h00k BrowserWindow allocated when screen has no space');
});
test('changing side with follow off repositions already visible docked pane',()=>{
  const {engine,created}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'full',follow:false,side:'right'}}});
  engine.acceptWindows([meta]);
  const win=engine.getWindows().get('metascalp').get('full');
  assert.ok(win && win.isVisible());
  assert.equal(win.getBounds().x,1050);
  assert.equal(win.webContents.urls.length,1);
  engine.acceptWindows([meta]);
  assert.equal(win.webContents.urls.length,1,'polling does not reload h00k');
  engine.patchQuickProfile('metascalp',{side:'left'});
  assert.equal(win.getBounds().x+win.getBounds().width,250);
  assert.equal(win.webContents.urls.length,1);
  assert.equal(created.filter(x=>!x.dead).length,1);
});
test('dragged floating pane is saved and restored after it is recreated',async()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{
    enabled:true,mode:'floating',side:'right',follow:false,widgets:['screener'],
  }}});
  engine.acceptWindows([meta]);
  const win=engine.getWindows().get('metascalp').get('screener');
  assert.ok(win && win.isVisible());
  await tick(370); // auto-layout move events must not count as user drag
  win.bounds={x:310,y:90,width:475,height:370};
  win.emit('moved');
  await tick(530); // user drag is persisted with a short debounce
  assert.equal(engine.getSettings().profiles.metascalp.floatingBounds.screener.x,310);
  engine.closeProvider('metascalp');
  engine.syncWindows();
  const restored=engine.getWindows().get('metascalp').get('screener');
  assert.notEqual(restored,win);
  assert.equal(restored.getBounds().x,310);
  assert.equal(restored.getBounds().width,475);
  engine.patchQuickProfile('metascalp',{side:'left'});
  assert.notEqual(restored.getBounds().x,310,'explicit side change overrides old position');
});

test('Tiger.Trade above docking retains a visible seam even for a short chart',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{tiger:{
    enabled:true,mode:'full',side:'top',height:200,width:850,alwaysOnTop:false,
  }}});
  const tiger={...meta,exe:'Tiger.Trade',id:'tiger-window',left:250,top:176,width:940,height:650};
  engine.acceptWindows([tiger]);
  const pane=engine.getWindows().get('tiger')?.get('full');
  assert.ok(pane?.isVisible());
  const {TOP_DOCK_CLEARANCE}=require('../layout.cjs');
  assert.equal(pane.getBounds().y+pane.getBounds().height,tiger.top-TOP_DOCK_CLEARANCE);
  assert.equal(pane.getBounds().y,0);
  assert.equal(pane.webContents.urls.length,1);
  engine.acceptWindows([{...tiger,top:260}]);
  assert.equal(pane.getBounds().y+pane.getBounds().height,260-TOP_DOCK_CLEARANCE);
  assert.equal(pane.webContents.urls.length,1,'moving a terminal must not reload the screener');
  assert.equal(pane.isAlwaysOnTop(),false,'do not force panels above unrelated apps');
});

test('top-docked chart height can be dragged while preserving the 2 DIP terminal seam',()=>{
  const {engine,created,files,setCursorY,advanceTime}=simulateDesktop();
  engine.setSettings({profiles:{tiger:{enabled:true,mode:'full',side:'top',height:200,follow:true}}});
  const terminal={...meta,exe:'Tiger.Trade',id:'tiger-resize',top:330};
  engine.acceptWindows([terminal]);
  const pane=engine.getWindows().get('tiger')?.get('full');
  const view=pane?.childViews[1];
  assert.ok(pane?.isVisible()&&view?.bounds?.height===10,'top-edge hit target should be visible');
  const original=pane.getBounds();
  assert.equal(original.y+original.height,terminal.top-2);
  const evt={sender:view.contents};
  const count=created.length;
  setCursorY(original.y);
  engine.startDockHeightResize(evt);
  advanceTime(30);
  setCursorY(original.y-50);
  engine.moveDockHeightResize(evt);
  assert.equal(pane.getBounds().height,250);
  assert.equal(pane.getBounds().y+pane.getBounds().height,terminal.top-2,
    'the bottom stays attached while the top border is dragged');
  assert.equal(pane.webContents.urls.length,1,'height change must not reload h00k.top');
  assert.equal(created.length,count,'height change must reuse existing panel');
  engine.finishDockHeightResize(evt);
  assert.equal(engine.getSettings().profiles.tiger.height,250);
  assert.ok(files.length>0,'resize completion should persist settings');
  engine.acceptWindows([terminal]);
  assert.equal(pane.getBounds().height,250);
  assert.equal(engine.getResizeOwners().size,1);
  engine.closeProvider('tiger');
  assert.equal(engine.getResizeOwners().size,0);
});

test('top-edge resize clamps to available screen and rejects untrusted or non-top panes',()=>{
  const {engine,setCursorY,advanceTime}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'full',side:'top',height:200}}});
  const terminal={...meta,top:290};
  engine.acceptWindows([terminal]);
  const pane=engine.getWindows().get('metascalp').get('full');
  const view=pane.childViews[1];
  const evt={sender:view.contents};
  const invalid={sender:{id:view.contents.id}};
  setCursorY(100);
  engine.startDockHeightResize(invalid);
  setCursorY(0);
  engine.moveDockHeightResize(invalid);
  assert.equal(pane.getBounds().height,200);
  setCursorY(100); // Start the real gesture at a fresh position.
  engine.startDockHeightResize(evt);
  advanceTime(30);
  setCursorY(0); // Drag upward, towards the monitor edge.
  engine.moveDockHeightResize(evt);
  assert.equal(pane.getBounds().height,288,'height must stop before terminal and screen edge');
  advanceTime(30);
  setCursorY(300);
  engine.moveDockHeightResize(evt);
  assert.equal(pane.getBounds().height,140,'compact window must not become unusably small');
  engine.finishDockHeightResize(evt);
  engine.patchQuickProfile('metascalp',{side:'right'});
  assert.equal(view.bounds.height,0,'top-only handle must not cover chart UI on other edges');
  setCursorY(100);
  engine.startDockHeightResize(evt);
  engine.moveDockHeightResize(evt);
  assert.equal(engine.getSettings().profiles.metascalp.height,140);
});

test('always-on-top can be toggled for an independent floating pane without a running terminal',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{
    enabled:true,mode:'floating',follow:false,widgets:['screener'],
  }}});
  engine.acceptWindows([]);
  const win=engine.getWindows().get('metascalp').get('screener');
  assert.equal(win.isAlwaysOnTop(),false);
  engine.patchQuickProfile('metascalp',{alwaysOnTop:true});
  assert.equal(win.isAlwaysOnTop(),true);
});

test('auto side follows terminal movement without reloading h00k',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'full',side:'auto',follow:true}}});
  engine.acceptWindows([{...meta,left:100,width:700}]);
  const win=engine.getWindows().get('metascalp').get('full');
  assert.equal(win.getBounds().x,800);
  const loads=win.webContents.urls.length;
  engine.acceptWindows([{...meta,left:1150,width:700}]);
  assert.equal(win.getBounds().x+win.getBounds().width,1150);
  assert.equal(win.webContents.urls.length,loads);
});
test('auto attach never starts a web page with no monitor space',()=>{
  const {engine,created}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,side:'auto'}}});
  engine.acceptWindows([{...meta,left:0,top:0,width:1920,height:1080}]);
  assert.equal(created.length,0);
});
test('manual side keeps its choice instead of silently falling back',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,side:'right'}}});
  engine.acceptWindows([{...meta,left:1150,width:700}]);
  assert.equal(engine.getWindows().get('metascalp'),undefined);
});

test('a visible browser window redirects auto docking without refreshing h00k',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'full',side:'auto'}}});
  const target={...meta,left:350,top:260,width:700,height:560};
  engine.acceptWindows([target]);
  const win=engine.getWindows().get('metascalp').get('full');
  const before=win.webContents.urls.length;
  const blocker={id:'browser-1',pid:934,exe:'chrome',title:'Browser window',
    left:1050,top:160,width:870,height:800,minimized:false};
  engine.acceptWindows([target,blocker]);
  assert.ok(win.isVisible());
  assert.ok(win.getBounds().x+win.getBounds().width<=blocker.left ||
    win.getBounds().y+win.getBounds().height<=blocker.top ||
    win.getBounds().y>=blocker.top+blocker.height);
  assert.equal(win.webContents.urls.length,before);
});
test('minimized windows do not block docking and free space is restored',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'full',side:'auto'}}});
  const terminal={...meta,left:350,top:260,width:700,height:560};
  const browser={id:'browser-1',pid:934,exe:'chrome',title:'Browser window',
    left:1050,top:160,width:870,height:800,minimized:true};
  engine.acceptWindows([terminal,browser]);
  const pane=engine.getWindows().get('metascalp').get('full');
  assert.ok(pane.isVisible());
  assert.equal(pane.getBounds().x,1050);
});
test('occupied manual side is rejected without switching to another side',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'full',side:'right'}}});
  engine.acceptWindows([{...meta,left:350,top:260,width:700,height:560},
    {id:'browser-1',pid:934,exe:'chrome',title:'Browser',
      left:1050,top:150,width:600,height:650,minimized:false}]);
  assert.equal(engine.getWindows().get('metascalp'),undefined);
});
test('new overlapping window relocates auto dock even when follow is disabled',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'full',side:'auto',follow:false}}});
  const terminal={...meta,left:350,top:260,width:700,height:560};
  engine.acceptWindows([terminal]);
  const pane=engine.getWindows().get('metascalp').get('full');
  const oldX=pane.getBounds().x;
  engine.acceptWindows([terminal,{id:'browser-1',pid:934,exe:'chrome',title:'Browser',
    left:oldX,top:260,width:600,height:560,minimized:false}]);
  assert.ok(pane.isVisible());
  assert.notEqual(pane.getBounds().x,oldX);
});

test('closing pane never reads a destroyed WebContentsView on Windows',()=>{
  const {engine}=simulateDesktop({destroyToolbarBeforeClosed:true});
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'full',side:'right'}}});
  engine.acceptWindows([meta]);
  const pane=engine.getWindows().get('metascalp').get('full');
  const toolbar=pane.childViews[0];
  assert.ok(toolbar && !toolbar.destroyed);
  assert.doesNotThrow(()=>engine.closeProvider('metascalp'));
  assert.ok(toolbar.destroyed);
  assert.equal(engine.getToolbarOwners().size,0);
  assert.doesNotThrow(()=>engine.closeProvider('metascalp')); // already closed
});
test('closing pane explicitly releases surviving toolbar WebContents',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'full',side:'right'}}});
  engine.acceptWindows([meta]);
  const pane=engine.getWindows().get('metascalp').get('full');
  const toolbar=pane.childViews[0];
  assert.equal(toolbar.contents.closed,false);
  assert.doesNotThrow(()=>engine.closeProvider('metascalp'));
  assert.equal(toolbar.contents.closed,true);
  assert.equal(engine.getToolbarOwners().size,0);
});

test('Electron 22 BrowserView fallback uses one local toolbar and cleans up',()=>{
  const {engine}=simulateDesktop({useLegacyBrowserView:true});
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'full',side:'auto',follow:true}}});
  engine.acceptWindows([meta]);
  const pane=engine.getWindows().get('metascalp').get('full');
  assert.ok(pane && pane.isVisible());
  assert.equal(pane.browserView,pane.childViews[0]);
  engine.closeProvider('metascalp');
  assert.equal(pane.browserView.contents.closed,true);
  assert.equal(engine.getToolbarOwners().size,0);
});


test('auto detection prefers a visible trading terminal over a larger minimized instance',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,side:'auto',mode:'full'}}});
  const minimized={...meta,id:'minimized',left:0,top:0,width:1500,height:950,minimized:true};
  const visible={...meta,id:'visible',left:350,top:250,width:700,height:510,minimized:false};
  engine.acceptWindows([minimized,visible]);
  const pane=engine.getWindows().get('metascalp')?.get('full');
  assert.ok(pane?.isVisible(),'should dock to the running visible terminal');
  assert.equal(engine.snapshot().terminals.find(x=>x.id==='metascalp').target.id,'visible');
});

test('separate h00k workspaces do not overlap in the shared gap between terminals',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{
    metascalp:{enabled:true,side:'auto',mode:'full',follow:true},
    tiger:{enabled:true,side:'auto',mode:'full',follow:true},
  }});
  const first={...meta,id:'left',exe:'MetaScalp',left:300,top:250,width:400,height:500};
  const second={...meta,id:'right',exe:'Tiger.Trade',title:'Tiger.Trade',
    left:1120,top:250,width:400,height:500};
  engine.acceptWindows([first,second]);
  const leftPane=engine.getWindows().get('metascalp')?.get('full');
  const rightPane=engine.getWindows().get('tiger')?.get('full');
  assert.ok(leftPane?.isVisible() && rightPane?.isVisible(),'both terminals should attach');
  const {intersectsRect}=require('../layout.cjs');
  assert.ok(!intersectsRect(leftPane.getBounds(),rightPane.getBounds()),
    'a later profile must avoid an earlier h00k pane');
  // Repeated native snapshots must not make the two panes swap sides.
  const a=leftPane.getBounds(),b=rightPane.getBounds();
  engine.acceptWindows([first,second]);
  assert.deepEqual(leftPane.getBounds(),a);
  assert.deepEqual(rightPane.getBounds(),b);
});

test('manual selection can attach to an arbitrary visible application window',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,side:'auto',mode:'full'}}});
  engine.setManualTarget('metascalp','editor');
  engine.acceptWindows([{...meta,id:'editor',exe:'Code',title:'Visual Studio Code'}]);
  const pane=engine.getWindows().get('metascalp')?.get('full');
  assert.ok(pane?.isVisible(),'manually selected non-terminal window should be allowed');
  assert.equal(engine.snapshot().terminals.find(x=>x.id==='metascalp').selectedWindowId,'editor');
});

test('native agent loss invalidates stale native-window snapshot before reconnect',()=>{
  const source=fs.readFileSync(mainPath,'utf8');
  assert.match(source,/child\.on\('close',\(\) => \{[\s\S]*?acceptWindows\(\[\]\);[\s\S]*?setTimeout\(runAgent,3000\)/);
  const settings=fs.readFileSync(path.join(__dirname,'..','settings.html'),'utf8');
  assert.match(settings,/snap\.windows\.find\(w=>w\.id===terminal\?\.selectedWindowId/);
});


test('recycled native window handles cannot select an unrelated application',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{
    enabled:true,side:'auto',mode:'full',
    targetHint:{exe:'Code',title:'Code editor'},
  }}});
  engine.setManualTarget('metascalp','reused');
  engine.acceptWindows([
    {...meta,id:'reused',exe:'chrome',title:'An unrelated browser'},
    {...meta,id:'real',exe:'MetaScalp',title:'A real trading terminal',
      left:350,top:250,width:700,height:510},
  ]);
  assert.equal(engine.snapshot().terminals.find(x=>x.id==='metascalp').target.id,'real');
});


test('Multi-window mode docks separate h00k pages beside two MetaScalp instances',()=>{
  const {engine,created,advanceTime}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,autoAttach:true,mode:'multi',side:'auto',follow:true}}});
  const left={...meta,id:'left',left:250,top:200,width:580,height:480};
  const right={...meta,id:'right',left:1100,top:200,width:580,height:480};
  engine.acceptWindows([left,right]);
  const group=engine.getWindows().get('metascalp');
  assert.equal(group.size,2);
  const a=group.get('multi:left'),b=group.get('multi:right');
  assert.ok(a.isVisible() && b.isVisible());
  assert.equal(a.webContents.urls[0],b.webContents.urls[0]);
  assert.equal(a.webContents.urls[0],'https://h00k.top/?h00kDesktop=1');
  const {intersectsRect}=require('../layout.cjs');
  assert.equal(intersectsRect(a.getBounds(),b.getBounds()),false);
  assert.match(engine.snapshot().terminals[0].status,/Мультивікна: 2\/2/);
  const loaded=created.length;
  engine.acceptWindows([left,right]);
  assert.equal(created.length,loaded,'tracker ticks must reuse live webviews');
  assert.equal(a.webContents.urls.length,1);
  assert.equal(b.webContents.urls.length,1);
  // A single missed native frame must not reload the whole screener. The
  // orphan is hidden and reclaimed on the next periodic geometry check.
  engine.acceptWindows([left]);
  assert.equal(group.size,2);
  assert.equal(group.get('multi:left'),a);
  assert.equal(b.isVisible(),false);
  assert.equal(b.dead,false);
  advanceTime(2500);
  engine.acceptWindows([left]);
  assert.equal(group.size,1);
  assert.equal(b.dead,true);
});

test('Multi-window mode respects the four-window cap and cleans up on mode switch',()=>{
  const {engine,created}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'multi',side:'auto'}}});
  const targets=Array.from({length:6},(_,i)=>({
    ...meta,id:String(1000+i),title:'MetaScalp '+i,
    left:150+i*280,top:150,width:250,height:400,
  }));
  engine.acceptWindows(targets);
  const group=engine.getWindows().get('metascalp');
  assert.ok(group.size<=4,'do not start more than four full h00k pages');
  const alive=[...group.values()];
  engine.patchQuickProfile('metascalp',{mode:'full'});
  assert.deepEqual([...engine.getWindows().get('metascalp').keys()],['full']);
  for(const pane of alive)assert.equal(pane.dead,true,'multi panel should be destroyed');
});

test('Multi-window mode adds an explicitly selected nonterminal without attaching to every open app',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'multi',side:'auto',
    targetHint:{exe:'Code',title:'Visual Studio Code'}}}});
  engine.setManualTarget('metascalp','editor');
  const terminal={...meta,id:'terminal',left:200,top:180,width:500,height:450};
  const editor={...meta,id:'editor',exe:'Code',title:'Visual Studio Code',
    left:1150,top:200,width:450,height:470};
  const browser={...meta,id:'browser',exe:'chrome',title:'Unselected browser',
    left:850,top:860,width:500,height:180};
  engine.acceptWindows([terminal,editor,browser]);
  const group=engine.getWindows().get('metascalp');
  assert.ok(group.has('multi:editor'),'selected external app should receive h00k');
  assert.ok(group.has('multi:terminal'),'recognized MetaScalp should also receive h00k');
  assert.ok(!group.has('multi:browser'),'unselected apps must remain untouched');
});

test('Multi-window mode does not load a hidden h00k page when no safe space exists',()=>{
  const {engine,created}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'multi',side:'auto'}}});
  engine.acceptWindows([{...meta,id:'fullscreen',left:0,top:0,width:1920,height:1080}]);
  assert.equal(created.length,0);
  assert.equal(engine.snapshot().terminals[0].status,'Мультивікна: 0/1');
});

test('Multi-window mode follows external terminal movement without reloading its page',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'multi',side:'auto',follow:true}}});
  const target={...meta,id:'first',left:100,top:220,width:700,height:460};
  engine.acceptWindows([target]);
  const pane=engine.getWindows().get('metascalp').get('multi:first');
  const initial=pane.getBounds();
  engine.acceptWindows([{...target,left:1100}]);
  assert.notDeepEqual(pane.getBounds(),initial);
  assert.equal(pane.webContents.urls.length,1);
});


test('switching away from Multi-window mode immediately closes hidden webviews even if no terminal is available',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'multi',side:'auto'}}});
  engine.acceptWindows([{...meta,id:'first',left:240,top:200,width:650,height:500}]);
  const old=engine.getWindows().get('metascalp').get('multi:first');
  assert.ok(old.isVisible());
  // Race: an old multi pane exists while the selected mode changes and the
  // native window snapshot goes empty before a new full pane can be created.
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'full',side:'auto'}}});
  engine.acceptWindows([]);
  assert.equal(old.dead,true);
  assert.equal(engine.getWindows().get('metascalp'),undefined);
});


test('Multi-window prioritizes four visible targets over a selected minimized target',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'multi',side:'auto',
    targetHint:{exe:'MetaScalp',title:'Minimized MetaScalp'}}}});
  const minimized={...meta,id:'min',title:'Minimized MetaScalp',minimized:true,
    width:1700,height:900};
  const open=Array.from({length:4},(_,i)=>({...meta,
    id:'visible-'+i,title:'MetaScalp '+i,minimized:false,width:700-i*50,
  }));
  engine.acceptWindows([minimized,...open]);
  const selected=engine.findMultiTargets('metascalp');
  assert.equal(selected.length,4);
  assert.ok(selected.every(item=>!item.minimized),
    'minimized window cannot use a scarce webview slot ahead of a usable window');
});

test('Multi-window without Follow evacuates a pane if its terminal moves across it',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'multi',side:'auto',follow:false}}});
  const target={...meta,id:'first',left:100,top:220,width:700,height:460};
  engine.acceptWindows([target]);
  const pane=engine.getWindows().get('metascalp').get('multi:first');
  const old=pane.getBounds();
  // The layout planner may choose a bottom/top strip rather than right/left.
  // Move the terminal onto the actual panel rectangle, regardless of side.
  const moved={...target,left:old.x,top:old.y};
  const {intersectsRect}=require('../layout.cjs');
  assert.equal(intersectsRect(old,{x:moved.left,y:moved.top,
    width:moved.width,height:moved.height}),true,
    'scenario must cross the actual old h00k panel');
  engine.acceptWindows([moved]);
  const targetRect={x:moved.left,y:moved.top,width:moved.width,height:moved.height};
  assert.equal(intersectsRect(pane.getBounds(),targetRect),false);
  assert.equal(pane.webContents.urls.length,1,'resizing must not reload site content');
});

test('ordinary dock without Follow also evacuates when terminal moves across its panel',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'full',side:'auto',follow:false}}});
  const target={...meta,id:'first',left:100,top:220,width:700,height:460};
  engine.acceptWindows([target]);
  const pane=engine.getWindows().get('metascalp').get('full');
  const old=pane.getBounds();
  const moved={...target,left:old.x,top:old.y};
  const {intersectsRect}=require('../layout.cjs');
  assert.equal(intersectsRect(old,{x:moved.left,y:moved.top,width:moved.width,height:moved.height}),true);
  engine.acceptWindows([moved]);
  assert.equal(intersectsRect(pane.getBounds(),{x:moved.left,y:moved.top,
    width:moved.width,height:moved.height}),false);
});

test('Multi-window closed callback releases the target-specific map key',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'multi',side:'auto'}}});
  const target={...meta,id:'target-42',left:100,top:180,width:760,height:470};
  engine.acceptWindows([target]);
  const group=engine.getWindows().get('metascalp');
  const pane=group.get('multi:target-42');
  assert.ok(pane?.isVisible());
  pane.destroy();
  assert.equal(group.has('multi:target-42'),false,'destroyed webview must be removed under HWND key');
  engine.acceptWindows([target]);
  const recovered=group.get('multi:target-42');
  assert.ok(recovered?.isVisible());
  assert.notEqual(recovered,pane);
});


test('static trading window coordinates do not trigger 160/250ms repeated layout calculations',()=>{
  const {engine,screenCalls,advanceTime}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,side:'auto',mode:'multi'}}});
  const target={...meta,id:'x',left:200,top:200,width:720,height:520};
  engine.acceptWindows([target]);
  const first=screenCalls();
  assert.ok(first>0);
  for(let i=0;i<20;i++)engine.acceptWindows([{...target,title:'Price '+i}]);
  assert.equal(screenCalls(),first,'PnL/title ticks must never invoke the layout planner');
  advanceTime(2300);
  engine.acceptWindows([{...target,title:'Price changed again'}]);
  assert.ok(screenCalls()>first,'periodic layout recovery must still occur');
  const beforeMove=screenCalls();
  engine.acceptWindows([{...target,left:930,title:'Moved'}]);
  assert.ok(screenCalls()>beforeMove,'real geometry changes must recalculate immediately');
});

test('Multi-window temporary disappearance reuses its old page on reappearance',()=>{
  const {engine,created}=simulateDesktop();
  engine.setSettings({profiles:{metascalp:{enabled:true,mode:'multi',side:'auto'}}});
  const target={...meta,id:'stable',left:240,top:190,width:660,height:460};
  engine.acceptWindows([target]);
  const pane=engine.getWindows().get('metascalp').get('multi:stable');
  engine.acceptWindows([]);
  assert.equal(pane.isVisible(),false);
  engine.acceptWindows([target]);
  assert.equal(engine.getWindows().get('metascalp').get('multi:stable'),pane);
  assert.equal(pane.isVisible(),true);
  assert.equal(pane.webContents.urls.length,1);
  assert.equal(created.filter(x=>!x.dead).length,1);
});

test('global Multi-window budget limits full-site webviews across all three providers',()=>{
  const {engine}=simulateDesktop();
  engine.setSettings({profiles:{
    metascalp:{enabled:true,mode:'multi',side:'auto',width:290,height:250},
    tiger:{enabled:true,mode:'multi',side:'auto',width:290,height:250},
    vataga:{enabled:true,mode:'multi',side:'auto',width:290,height:250},
  }});
  const sample=(exe,prefix)=>Array.from({length:4},(_,i)=>({
    ...meta,id:prefix+i,exe,title:exe+' '+i,
    left:210+i*380,top:80,width:340,height:370,
  }));
  engine.acceptWindows([
    ...sample('MetaScalp','m'),
    ...sample('Tiger.Trade','t').map(v=>({...v,top:530})),
    ...sample('Vataga','v').map(v=>({...v,top:910})),
  ]);
  const collections=[...engine.getWindows().values()];
  const visible=collections.flatMap(group=>[...group.values()]).filter(p=>p.isVisible());
  assert.ok(visible.length<=6,'cannot load twelve independent full screener tabs');
});

test('native URLs opt in to public quote reuse without privileged renderer access', () => {
  const { engine } = simulateDesktop();
  const full = new URL(engine.webURL('full'));
  assert.equal(full.origin, 'https://h00k.top');
  assert.equal(full.searchParams.get('h00kDesktop'), '1');
  assert.equal(full.searchParams.has('desktopPanel'), false);
  const terminal = new URL(engine.webURL('terminal'));
  assert.equal(terminal.searchParams.get('h00kDesktop'), '1');
  assert.equal(terminal.searchParams.get('desktopPanel'), 'terminal');
  assert.equal(terminal.hash, '#terminal');
});
