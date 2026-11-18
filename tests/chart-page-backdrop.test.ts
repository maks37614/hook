import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { captureChartPageBackdrop, CHART_BACKDROP_NODE_LIMIT, CHART_BACKDROP_VISIT_LIMIT } from '../src/utils/chartPageBackdrop';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('chart background is an inert detached DOM snapshot, not a mounted copy of the Screener', () => {
  const dom = new JSDOM(`<!doctype html><div id="root"><div class="min-h-screen">
    <header class="app-header"><button id="tab">Скрінер</button></header>
    <main class="screener-content"><section id="coins">
      <button id="btc">BTCUSDT</button><span>Об’єм</span>
      <input type="password" value="sensitive" />
      <input type="text" value="secret search" />
      <iframe src="https://example.com/embed"></iframe>
      <video autoplay src="https://example.com/video"></video>
      <canvas width="500"></canvas>
    </section></main><footer>© h00k</footer>
  </div></div>`, {url: 'http://localhost/#screener'});
  const original = {
    window: (globalThis as any).window,
    HTMLElement: (globalThis as any).HTMLElement,
    HTMLInputElement: (globalThis as any).HTMLInputElement,
    HTMLTextAreaElement: (globalThis as any).HTMLTextAreaElement,
  };
  Object.assign(globalThis, {
    window: dom.window,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  });
  const proto = dom.window.HTMLElement.prototype;
  const oldRect = proto.getBoundingClientRect;
  proto.getBoundingClientRect = () => ({
    x:0, y:0, left:0, top:0, width:600, height:750, right:600, bottom:750,
    toJSON(){return {}},
  });
  try {
    const root = dom.window.document.querySelector('#root > div') as HTMLElement;
    let clicked = 0;
    root.querySelector('#btc')!.addEventListener('click', () => clicked++);
    const snapshot = captureChartPageBackdrop(root)!;
    assert.ok(snapshot);
    assert.notEqual(snapshot, root);
    assert.equal(snapshot.isConnected, false, 'snapshot remains detached until routed chart renders');
    assert.equal(snapshot.inert, true);
    assert.match(snapshot.textContent || '', /BTCUSDT/);
    assert.match(snapshot.textContent || '', /Скрінер/);
    assert.equal(snapshot.querySelector('iframe,video,canvas,script,object,embed,img,svg,input,textarea,select'), null,
      'background contains no browser media or input controls at all');
    assert.equal(snapshot.querySelector('[id],[src],[srcset],[href],[poster],[data-src],[onclick]'), null,
      'no cloned URLs, private form properties or event attributes');
    assert.ok(snapshot.querySelectorAll('*').length <= CHART_BACKDROP_NODE_LIMIT + 3,
      'frozen DOM must be bounded even for complex pages');
    snapshot.querySelector('main button')!.dispatchEvent(new dom.window.Event('click', {bubbles: true}));
    assert.equal(clicked,0,'native event listener from live Screener must not be copied');
    root.querySelector('#btc')!.dispatchEvent(new dom.window.Event('click', {bubbles:true}));
    assert.equal(clicked,1,'original clickable Screener and its handlers remain fully functional');
    dom.window.document.body.appendChild(snapshot);
    assert.equal(snapshot.isConnected, true);
    assert.equal(root.isConnected,true,'capturing must not mutate or unmount the original page');
    assert.equal(root.querySelector('iframe')?.getAttribute('src'), 'https://example.com/embed');
    assert.equal(root.querySelector('input[type=password]')?.getAttribute('value'), 'sensitive');
  } finally {
    proto.getBoundingClientRect = oldRect;
    Object.assign(globalThis, original);
    dom.window.close();
  }
});

test('large DOM captures at most a small fixed number of nodes instead of duplicating entire Screener', () => {
  const dom = new JSDOM('<!doctype html><div id="root"><div><main></main></div></div>', {url:'http://localhost/'});
  const previousWindow=(globalThis as any).window;
  const previousHTMLElement=(globalThis as any).HTMLElement;
  (globalThis as any).window=dom.window;
  (globalThis as any).HTMLElement=dom.window.HTMLElement;
  const proto=dom.window.HTMLElement.prototype;
  const oldRect=proto.getBoundingClientRect;
  proto.getBoundingClientRect=()=>({left:0,right:640,top:0,bottom:800,width:640,height:800} as DOMRect);
  try {
    const root=dom.window.document.querySelector('#root > div') as HTMLElement;
    assert.ok(captureChartPageBackdrop(root));
    const fragment=dom.window.document.createDocumentFragment();
    for(let i=0;i<9100;i++) fragment.appendChild(dom.window.document.createElement('span'));
    root.querySelector('main')!.appendChild(fragment);
    const preview=captureChartPageBackdrop(root)!;
    assert.ok(preview, 'a very large page may still display a bounded visual preview');
    assert.ok(preview.querySelectorAll('*').length <= CHART_BACKDROP_NODE_LIMIT + 3,
      'rendering 9,100 source nodes must never create more than 220 background copies');
    assert.equal(preview.querySelector('img,video,canvas,iframe,script'), null);
    assert.ok(CHART_BACKDROP_VISIT_LIMIT <= 720, 'DOM traversal is budgeted as well');
  } finally {
    proto.getBoundingClientRect=oldRect;
    (globalThis as any).window=previousWindow;
    (globalThis as any).HTMLElement=previousHTMLElement;
    dom.window.close();
  }
});

test('routed chart shows backdrop behind a readable opaque HookChart and unmounts the original page', () => {
  const app=source('../src/App.tsx');
  const details=source('../src/components/FormationDetailsModal.tsx');
  const full=source('../src/components/FullscreenChartModal.tsx');
  const css=source('../src/index.css');
  assert.match(app, /captureChartPageBackdrop\(/);
  assert.match(app, /chartPageActive && <div ref=\{attachChartBackdrop\}/);
  assert.match(app, /data-chart-page-backdrop="static"/);
  assert.match(app, /relative z-10 w-full min-w-0 flex-1/);
  assert.match(app, /chartBackdropSnapshotRef\.current = null/);
  assert.match(app, /\{chartPageActive \? \(/, 'previous page must remain unmounted while chart route is active');
  assert.match(details, /pageMode\s*\? 'relative w-full min-h-0 bg-transparent/);
  assert.match(full, /pageMode\s*\? 'relative flex w-full min-h-\[100dvh\] flex-col bg-transparent/);
  assert.match(full, /overflow-hidden bg-\[#090d16\]/,'the actual chart area remains opaque for legibility');
  assert.match(css, /\.chart-page-backdrop__frozen\s*\{/);
  assert.match(css, /\.chart-page-backdrop__frozen \*,/);
  assert.match(css, /animation:none!important/);
  assert.match(css, /pointer-events:none!important/);
  assert.match(css, /\.chart-page-backdrop::after/);
});

test('frozen background omits URL/image classes and preserved form content while retaining visual text', () => {
  const dom = new JSDOM('<!doctype html><div id="root"><div><header><nav><button>Формації</button></nav></header><main><article class="rounded-2xl bg-[url(https://example.com/a.png)] animate-pulse"><h3>BTCUSDT</h3><img src="https://example.com/coin.png"><a href="https://example.com/private" onclick="alert(1)">Монета</a><div style="background-image:url(https://example.com/bg.png);color:rgb(255,0,0)">Дані</div><input value="password"></article></main></div></div>', {url:'https://h00k.top/'});
  const previous = {window:(globalThis as any).window,HTMLElement:(globalThis as any).HTMLElement};
  (globalThis as any).window = dom.window;
  (globalThis as any).HTMLElement = dom.window.HTMLElement;
  try {
    const snapshot = captureChartPageBackdrop(dom.window.document.querySelector('#root > div') as HTMLElement)!;
    assert.ok(snapshot);
    assert.match(snapshot.textContent || '', /BTCUSDT/);
    assert.match(snapshot.textContent || '', /Формації/);
    assert.equal(snapshot.querySelector('img,input'), null);
    assert.equal(snapshot.querySelector('[href],[onclick],[src]'), null);
    assert.ok(!snapshot.outerHTML.includes('example.com'), 'no URL can survive into the chart backdrop');
    assert.ok(!snapshot.outerHTML.includes('password'), 'old input value is never copied');
    assert.doesNotMatch(snapshot.outerHTML, /animate-pulse/);
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});

test('the chart route closes back into real pages with the original navigation and scanning guards', () => {
  const app = source('../src/App.tsx');
  assert.match(app, /if \(chartPageActive\) return;/,'regular scan must be paused behind routed chart');
  assert.match(app, /if \(!shouldRunEarlyScan\(activePage, earlyMode, chartPageActive\)\) return;/,'early scan must be paused outside its page and behind charts');
  assert.match(app, /if \(chartNavigation\.current\.enteredFromApp\) \{\s*window\.history\.back\(\)/);
  assert.match(app, /requestAnimationFrame\(\(\) => window\.scrollTo\(\{ top: savedScroll, behavior: 'auto' \}\)\)/);
  assert.match(app, /chartBackdropSnapshotRef\.current\?\.remove\(\)/,'account change clears snapshot');
  assert.match(app, /chartBackdropSnapshotRef\.current = null/,'closing clears snapshot');
  assert.match(app, /!chartPageActive && !desktopPanel && <Header/,'real navigation reappears after chart close');
  assert.match(app, /<CoinScreenerPage/);
  assert.match(app, /<FormationCard/);
  assert.match(app, /<TerminalPage/);
});

test('mobile background has a smaller resource budget and never performs a live update', () => {
  const dom = new JSDOM('<!doctype html><div id="root"><div><header>Скрінер</header><main></main></div></div>', {url:'https://h00k.top/#screener'});
  const previous={window:(globalThis as any).window,HTMLElement:(globalThis as any).HTMLElement};
  (globalThis as any).window=dom.window;
  (globalThis as any).HTMLElement=dom.window.HTMLElement;
  Object.defineProperty(dom.window,'innerWidth',{value:390, configurable:true});
  try {
    const main=dom.window.document.querySelector('main')!;
    for(let i=0;i<400;i++){
      const node=dom.window.document.createElement('span');
      node.textContent='BTCUSDT';
      main.appendChild(node);
    }
    const screenshot=captureChartPageBackdrop(dom.window.document.querySelector('#root > div') as HTMLElement)!;
    assert.ok(screenshot);
    assert.ok(screenshot.querySelectorAll('*').length <= 143, 'mobile captures at most 140 visible elements');
    assert.equal(screenshot.querySelector('script,img,canvas,video,iframe'),null);
    assert.equal(typeof (screenshot as any).update,'undefined','the snapshot has no updater or live subscriptions');
  } finally {
    Object.assign(globalThis,previous);
    dom.window.close();
  }
});

test('the original Screener tears down periodic network refresh and restores personal filters on return', () => {
  const screener=source('../src/components/CoinScreenerPage.tsx');
  assert.match(screener,/const screenerUiSession = new Map/);
  assert.match(screener,/const previousUiSession = screenerUiSession\.get\(user\?\.uid \|\| 'guest'\)/);
  assert.match(screener,/const cachedUi = previousUiSession\?\.savedConfigKey === savedConfigKey \? previousUiSession : undefined/,
    'stale in-session filters must not override changed profile defaults');
  for(const field of ['searchQuery','exchange','marketType','sortBy','sortOrder','secondarySortBy','secondarySortOrder','viewMode','displayLimit']){
    assert.match(screener,new RegExp('cachedUi\\?\\.'+field), 'screen must restore '+field);
  }
  assert.match(screener,/screenerUiSession\.set\(user\?\.uid \|\| 'guest'/);
  assert.match(screener,/const interval = setInterval\(\(\) => refresh\(\), SCREENER_FULL_REFRESH_MS\)/);
  assert.match(screener,/SCREENER_FULL_REFRESH_MS,/);
  assert.match(screener,/if \(document\.hidden\) return;/,'hidden panes cannot poll quotes');
  assert.match(screener,/document\.addEventListener\('visibilitychange', onVisibilityChange\)/,'returning panes refresh quotes');
  assert.match(screener,/clearInterval\(interval\)/, 'old Screener must stop polling while chart is open');
  assert.match(screener,/currentRequest\.current\?\.controller\.abort\(\)/,
    'in-flight Screener requests must be aborted on unmount');
});
