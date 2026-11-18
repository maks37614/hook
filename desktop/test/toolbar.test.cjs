'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('compact standalone actions and attached pane gear stay inside a local HTML view', () => {
  const html = read('toolbar.html');
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'inline handler exists');
  assert.doesNotThrow(() => new vm.Script(script[1], { filename: 'desktop/toolbar.html' }));
  assert.match(html, /id="dock"/);
  for (const id of ['attachment','metascalp','tiger','vataga','browser','eco']) {
    assert.match(html, new RegExp('id="'+id+'"'));
  }
  assert.match(html, /\.drag-space\{[^}]*-webkit-app-region:drag/);
  assert.match(html, /body\.standalone #dock\{display:none\}/);
  assert.match(html, /id="minimize"/);
  assert.match(html, /id="fullscreen"/);
  assert.match(html, /id="close"/);
  assert.match(html, /window\.h00kDockButton\.windowControl\('minimize'\)/);
  assert.match(html, /window\.h00kDockButton\.windowControl\('fullscreen'\)/);
  assert.match(html, /window\.h00kDockButton\.windowControl\('close'\)/);
  assert.match(html, /Налаштування прикріплення/);
  const preload = read('toolbar-preload.cjs');
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
  assert.match(preload, /ipcRenderer\.send\('desktop:toolbar-menu'\)/);
  assert.match(preload, /desktop:toolbar-control/);
  assert.match(preload, /desktop:toolbar-action/);
  assert.match(preload, /desktop:toolbar-eco-toggle/);
  assert.match(html, /id="eco" aria-pressed="false"/);
  const main=read('main.cjs');
  assert.match(main, /owner\.contents !== event\.sender/);
  assert.doesNotMatch(preload, /desktop:save|desktop:pick|desktop:attach/);
});

test('standalone toolbar buttons dispatch real local actions and reflect fullscreen state',async()=>{
  const html=read('toolbar.html');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const controls={};
  function button(){
    return { handlers:new Map(), attrs:{},
      addEventListener(event,fn){this.handlers.set(event,fn);},
      setAttribute(name,value){this.attrs[name]=value;},
      click(){this.handlers.get('click')?.();} };
  }
  for(const key of ['dock','attachment','metascalp','tiger','vataga','browser','eco','minimize','fullscreen','close'])controls[key]=button();
  for(const element of Object.values(controls)) element.querySelector=()=>({textContent:''});
  let changeLanguage,changeState,menus=0;
  const commands=[], actions=[];
  let ecoToggles=0;
  const dockAPI={
    toggleEco(){ecoToggles++;},
    openAction(action){actions.push(action);},
    showMenu(){menus++;},
    windowControl(action){commands.push(action);},
    onLanguage(callback){changeLanguage=callback;},
    onWindowState(callback){changeState=callback;},
    async language(){return {title:'Налаштування прикріплення',aria:'Налаштування',
      minimize:'Згорнути вікно', fullscreen:'На весь екран',exitFullscreen:'Вийти з повного екрана',
      close:'Закрити вікно h00k'};},
  };
  let styled=false;
  const context={
    window:{location:{search:'?controls=1'},h00kDockButton:dockAPI},
    document:{getElementById:id=>controls[id],
      body:{classList:{add:name=>{if(name==='standalone')styled=true;}}}},
    URLSearchParams,Promise,
  };
  new vm.Script(script,{filename:'desktop/toolbar.html'}).runInNewContext(context);
  await Promise.resolve();
  assert.equal(styled,true);
  controls.dock.click();
  for(const id of ['attachment','metascalp','tiger','vataga','browser'])controls[id].click();
  assert.deepEqual(actions,['docking','metascalp','tiger','vataga','browser']);
  controls.eco.click();
  assert.equal(ecoToggles,1);
  changeLanguage({title:'Dock settings',aria:'Dock settings',ecoMode:true,
    ecoEnable:'Enable ECO',ecoDisable:'Disable ECO'});
  assert.equal(controls.eco.attrs['aria-pressed'],'true');
  assert.equal(controls.eco.attrs['aria-label'],'Disable ECO');
  controls.minimize.click();
  controls.fullscreen.click();
  changeState({fullscreen:true});
  assert.equal(controls.fullscreen.attrs['aria-pressed'],'true');
  assert.equal(controls.fullscreen.attrs['aria-label'],'Вийти з повного екрана');
  controls.fullscreen.click();
  changeState({fullscreen:false});
  controls.close.click();
  assert.deepEqual(commands,['minimize','fullscreen','fullscreen','close']);
  assert.equal(menus,1);
});

test('attached pane height grip stays in isolated local view and has no site IPC',()=>{
  const html=read('resize-handle.html');
  const script=html.split('<script>')[1]?.split('</script>')[0];
  assert.ok(script);
  assert.doesNotThrow(()=>new vm.Script(script,{filename:'desktop/resize-handle.html'}));
  for(const term of ['cursor:ns-resize','setPointerCapture','lostpointercapture'])
    assert.ok(html.includes(term),'missing resize UI: '+term);
  const preload=read('resize-preload.cjs');
  assert.ok(preload.includes('contextBridge.exposeInMainWorld'));
  for(const action of ['start','move','end'])
    assert.ok(preload.includes('desktop:dock-resize-'+action));
  const main=read('main.cjs');
  assert.ok(main.includes("ipcMain.on('desktop:dock-resize-start', startDockHeightResize)"));
  assert.ok(main.includes('owner.contents !== event.sender'));
  assert.ok(main.includes("win.__h00kDockSide !== 'top'"));
  const pkg=JSON.parse(read('package.json'));
  assert.ok(pkg.build.files.includes('resize-handle.html'));
  assert.ok(pkg.build.files.includes('resize-preload.cjs'));
});

test('remote h00k site is sandboxed and cannot access the toolbar IPC', () => {
  const main = read('main.cjs');
  const start = main.indexOf('function makeContentWindow(');
  const end = main.indexOf('function createSettingsWindow(');
  const contentWindow = main.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(contentWindow, /nodeIntegration: false, contextIsolation: true, sandbox: true/);
  assert.doesNotMatch(contentWindow, /preload:/);
  assert.match(main, /const owner = toolbarOwners\.get\(event\.sender\.id\)/);
  assert.match(main, /ipcMain\.on\('desktop:toolbar-menu', openToolbarMenu\)/);
});

test('all dock layout options are available from local native menu', () => {
  const main = read('main.cjs');
  const {nativeT}=require('../native-i18n.cjs');
  for (const [key,text] of [['right','Праворуч'], ['left','Ліворуч'],
    ['top','Зверху'], ['bottom','Знизу'],['full','Увесь h00k'],
    ['blocks','Вибрані блоки'], ['floating','Плаваючі вікна'],
    ['detach','Відкріпити від ']]) {
    assert.equal(nativeT(key,'uk'),text,'Missing Ukrainian quick action: '+key);
    assert.ok(main.includes("tr('"+key+"')"),'Menu does not use localized '+key);
  }
  assert.match(main, /frame: mode === 'floating'/); // no native frame on the dock seam
  assert.match(main, /hasShadow: mode === 'floating'/);
  assert.match(main, /toolbarOwners\.delete\(toolbarId\)/);
  assert.match(main, /openSettingsWindow\(provider\)/);
});

test('Win32 agent uses visible DWM bounds and bounded tracking snapshots', () => {
  const agent = read('win-agent.ps1');
  assert.match(agent, /DwmGetWindowAttribute\(hwnd, 9/);
  assert.match(agent, /GetWindowRect\(hwnd/);
  assert.match(agent, /Start-Sleep -Milliseconds \$pollIntervalMs/);
  assert.match(agent, /\$pollIntervalMs = 250/);
});

test('standalone window has trusted direct settings and browser actions, while attached panes keep quick menus', () => {
  const main = read('main.cjs');
  assert.match(main, /attachDockToolbar\(standalone, null\)/);
  assert.match(main, /ipcMain\.on\('desktop:toolbar-action'/);
  assert.match(main, /if \(action==='docking'\) openSettingsWindow\(\)/);
  assert.match(main, /else if \(PROVIDERS\.includes\(action\)\) openSettingsWindow\(action\)/);
  assert.match(main, /else if \(action==='browser'\) void shell\.openExternal\(WEBSITE\)/);
  assert.match(main, /if \(!provider\) return;/);
  assert.match(main, /settings\.setupComplete && profile\.enabled/);
});

test('Windows Desktop chrome never covers site navigation or Terminal timeframe actions', () => {
  const chrome = require('../standalone-chrome.cjs');
  const win = chrome.standaloneWindowChrome('win32');
  assert.equal(win.frame, false);
  assert.equal(win.thickFrame, true);
  assert.equal(win.titleBarOverlay, undefined);
  assert.deepEqual(chrome.standaloneWindowChrome('linux'), {});
  assert.equal(chrome.standaloneToolbarInset('win32'), chrome.WINDOW_BUTTONS_WIDTH);
  assert.equal(chrome.standaloneToolbarInset('darwin'), 0);
  assert.equal(chrome.CHROME_HEIGHT, 20);

  const css = chrome.standaloneHeaderCSS({ draggable: true });
  const dockCSS = chrome.standaloneHeaderCSS();
  assert.match(css, /body\s*\{\s*padding-top: var\(--h00k-desktop-chrome-height\)/);
  assert.match(css, /\.app-header \{ top: var\(--h00k-desktop-chrome-height\)/);
  // Terminal and fullscreen chart dialogs use position:fixed inset-0 and
  // ignore body padding unless explicitly moved under the reserved chrome.
  assert.match(css, /\[role="region"\]\.fixed\.inset-0/);
  assert.match(css, /\[role="dialog"\]\.fixed\.inset-0/);
  assert.match(css, /-webkit-app-region: no-drag !important/);
  assert.doesNotMatch(css, /body::before/); // Website content never owns window dragging.
  const html = read('toolbar.html');
  assert.match(html, /body\.standalone\{[^}]*-webkit-app-region:drag/);
  assert.match(html, /body\.standalone button\{height:18px/);
  assert.match(html, /-webkit-app-region:no-drag/);
  assert.doesNotMatch(dockCSS, /body::before/);
  const main = read('main.cjs');
  assert.match(main, /guardWebsite\(win, process\.platform === 'win32'/);
  assert.match(main, /guardWebsite\(standalone, process\.platform === 'win32'/);
  assert.match(main, /Promise\.all\(styleTasks\)/);
  assert.match(main, /toolbar\.setBounds\(\{ x: 0, y: 0, width, height: CHROME_HEIGHT \}\)/);
  // Attached/floating pane settings must be inside the reserved Desktop row,
  // not in the chart's upper-right Back/Close hit area.
  assert.match(main, /else toolbar\.setBounds\(\{ x: Math\.max\(0, width - 24\), y: 0, width: 24, height: CHROME_HEIGHT \}\)/);
  assert.match(html, /body:not\(\.standalone\) #dock\{width:18px;height:18px/);
  assert.match(html, /body:not\(\.standalone\) #dock svg\{width:12px;height:12px/);
  assert.match(main, /owner\.win\.minimize\(\)/);
  assert.match(main, /owner\.win\.setFullScreen\(!owner\.win\.isFullScreen\(\)\)/);
  assert.match(main, /owner\.win\.close\(\)/);
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.build.files.includes('standalone-chrome.cjs'));
  const site = main.slice(main.indexOf("ipcMain.handle('desktop:standalone'"));
  assert.doesNotMatch(site, /preload:/); // Remote site never gets Desktop IPC.

  const terminal = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'TerminalPage.tsx'), 'utf8');
  assert.match(terminal, /className="fixed inset-0/);
  assert.match(terminal, /onClick=\{\(\) => handleApplyGlobalTimeframe\(tf\)\}/);
  const chart = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'FullscreenChartModal.tsx'), 'utf8');
  assert.match(chart, /role=\{pageMode \? 'region' : 'dialog'\}/);
  assert.match(chart, /onClick=\{onClose\}/);
});

test('frameless docked panels draw a pointer-transparent bottom boundary, separate from the website',()=>{
  const chrome=require('../standalone-chrome.cjs');
  const css=chrome.dockedWindowEdgeCSS();
  assert.match(css,/border-bottom: 2px solid/);
  assert.match(css,/pointer-events: none !important/);
  assert.match(css,/position: fixed/);
  const main=read('main.cjs');
  assert.match(main,/standaloneHeaderCSS\(\) \+ \(mode === 'floating' \? '' : dockedWindowEdgeCSS\(\)\)/);
});

test('Windows window agent inspects visible titleless windows but ignores cloaked and shell windows',()=>{
  const agent=read('win-agent.ps1');
  assert.match(agent,/DwmGetWindowAttributeInt\(hwnd, 14,/);
  assert.match(agent,/GetClassNameW/);
  assert.match(agent,/windowClass == "WorkerW"/);
  assert.match(agent,/if \(len > 512\) return true/);
  assert.match(agent,/if \(len > 0\) GetWindowTextW/);
});
