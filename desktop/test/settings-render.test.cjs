'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname,'..');
const html = fs.readFileSync(path.join(root,'settings.html'),'utf8');
const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const translations = fs.readFileSync(path.join(root,'settings-i18n.js'),'utf8');

function setupRenderer(fixture, apiOverrides = {}) {
  assert.ok(inline,'settings renderer inline script exists');
  const controls = new Map();
  class MockElement {
    constructor(tag='div'){
      this.tagName=tag;this.children=[];this.hidden=false;this.value='';
      this.checked=false;this.className='';this.textContent='';
      this.attributes={};this.parentElement=null;this.classList={toggle(){}};
    }
    setAttribute(k,v){this.attributes[k]=v;}
    append(...nodes){
      for(const node of nodes){node.parentElement=this;this.children.push(node);}
    }
    replaceChildren(...nodes){
      this.children=[];this.append(...nodes);
    }
    get lastChild(){return this.children[this.children.length-1]||null;}
    closest(selector){return selector==='label' && this.parentElement?.tagName==='label'?this.parentElement:null;}
    querySelector(selector){
      if(selector==='input')return this.children.find(x=>x.tagName==='input')||null;
      return null;
    }
    querySelectorAll(selector){
      if(selector==='label')return this.children.filter(x=>x.tagName==='label');
      if(selector==='input'||selector==='input:checked'){
        const inputs=this.children.flatMap(x=>x.tagName==='input'?[x]:x.children.filter(y=>y.tagName==='input'));
        return selector==='input:checked'?inputs.filter(x=>x.checked):inputs;
      }
      return [];
    }
  }
  function el(id){
    if(!controls.has(id)) controls.set(id,new MockElement());
    return controls.get(id);
  }
  const document={
    body:{},
    documentElement:{lang:'uk'},
    title:'',
    getElementById:el,
    createTreeWalker:()=>({nextNode:()=>false}),
    querySelectorAll:()=>[],
    createElement:tag=>new MockElement(tag),
    createTextNode:text=>({nodeType:3,nodeValue:text,parentElement:null}),
    querySelector(selector){
      const group=selector.match(/^input\[name="(mode|side)"\]:checked$/)?.[1];
      return group?el(group==='mode'?'modes':'sides').querySelectorAll('input').find(x=>x.checked)||null:null;
    },
  };
  const subscribers={};
  const api={
    onSnapshot(cb){subscribers.snapshot=cb;},
    onSelectProvider(cb){subscribers.provider=cb;},
    snapshot(){return new Promise(()=>{});},
    ...apiOverrides,
  };
  const localStorage={saved:new Map([['h00k-desktop-settings-language','uk']]),
    getItem(k){return this.saved.get(k)||null;},
    setItem(k,v){this.saved.set(k,v);}};
  const context=vm.createContext({
    window:{h00kDesktop:api},
    document,localStorage,Node:{TEXT_NODE:3},NodeFilter:{SHOW_TEXT:4},
    Option:class{constructor(text,value){this.text=text;this.value=value;}},
  });
  vm.runInContext(translations,context);
  vm.runInContext(inline,context,{filename:'settings.html'});
  context.fixture=fixture;
  vm.runInContext('snap=fixture; render();',context);
  return {controls:el,context,document,subscribers,localStorage,api};
}

const fixture=()=>{
  const profile={mode:'full',enabled:true,autoAttach:true,follow:true,
    alwaysOnTop:false,width:440,height:360,side:'auto',widgets:['screener'],
    targetHint:null};
  return {
    settings:{setupComplete:true,profiles:{metascalp:profile,tiger:profile,vataga:profile}},
    terminals:[{id:'metascalp',target:{title:'MetaScalp BTC',exe:'MetaScalp'},status:'Мультивікна: 2/2',
      selectedWindowId:'101'},{id:'tiger',target:null,status:'Очікування',selectedWindowId:null},
      {id:'vataga',target:null,status:'Очікування',selectedWindowId:null}],
    windows:[{id:'101',exe:'MetaScalp',title:'MetaScalp BTC'},
      {id:'102',exe:'MetaScalp',title:'MetaScalp ETH'}],
  };
};

test('settings renderer populates native window options without crashing on translator shadowing',()=>{
  const {controls}=setupRenderer(fixture());
  assert.equal(controls('target').children.length,3);
  assert.equal(controls('target').children[0].text,'Автоматично знайти');
  assert.equal(controls('target').children[1].value,'101');
  assert.equal(controls('target').value,'101');
  assert.match(controls('status').textContent,/Мультивікна: 2\/2/);
});

test('language toggle localizes dynamic status and preserves unsaved Multi-window controls',()=>{
  const {controls,document,localStorage}=setupRenderer(fixture());
  const modes=controls('modes').querySelectorAll('input');
  for(const choice of modes)choice.checked=choice.value==='multi';
  modes.find(x=>x.value==='multi').onchange();
  assert.equal(controls('widgetArea').hidden,true);
  assert.equal(controls('multiHelp').hidden,false);
  assert.equal(modes.find(x=>x.value==='multi').checked,true);

  controls('language').onchange({target:{value:'en'}});
  assert.equal(document.documentElement.lang,'en');
  assert.equal(controls('target').children[0].text,'Find automatically');
  assert.equal(controls('status').textContent.includes('Multi-window: 2/2'),true);
  assert.equal(controls('modes').querySelectorAll('input').find(x=>x.value==='multi').checked,true);
  assert.equal(localStorage.getItem('h00k-desktop-settings-language'),'en');
  controls('language').onchange({target:{value:'pl'}});
  assert.match(controls('status').textContent,/Wiele okien: 2\/2/);
});

test('changing the active provider refreshes the target list without retaining another selection',()=>{
  const {controls,subscribers}=setupRenderer(fixture());
  subscribers.provider('tiger');
  assert.match(controls('status').textContent,/Термінал не знайдено/);
  assert.equal(controls('target').value,'');
  subscribers.provider('metascalp');
  assert.equal(controls('target').value,'101');
});


test('saving Multi-window sends all integration controls to the Desktop IPC bridge',async()=>{
  const calls=[],response=fixture();
  const {controls}=setupRenderer(fixture(),{
    save:async (provider,patch)=>{calls.push({provider,patch});return response;}
  });
  for(const input of controls('modes').querySelectorAll('input'))input.checked=input.value==='multi';
  controls('enabled').checked=true;
  controls('autoAttach').checked=false;
  controls('follow').checked=false;
  controls('alwaysOnTop').checked=true;
  controls('width').value='620';
  controls('height').value='410';
  for(const input of controls('sides').querySelectorAll('input'))input.checked=input.value==='left';
  await controls('save').onclick();
  assert.equal(calls.length,1);
  assert.equal(calls[0].provider,'metascalp');
  assert.equal(calls[0].patch.mode,'multi');
  assert.equal(calls[0].patch.side,'left');
  assert.equal(calls[0].patch.width,620);
  assert.equal(calls[0].patch.height,410);
  assert.equal(calls[0].patch.enabled,true);
  assert.equal(calls[0].patch.autoAttach,false);
  assert.equal(calls[0].patch.follow,false);
  assert.equal(calls[0].patch.alwaysOnTop,true);
  assert.match(controls('feedback').textContent,/Збережено/);
});

test('Attach now enables the profile and finds a safe side; Detach turns it off',async()=>{
  const calls=[];
  const response=fixture();
  const {controls}=setupRenderer(fixture(),{
    save:async (provider,patch)=>{calls.push(['save',provider,patch]);return response;},
    attach:async provider=>{calls.push(['attach',provider]);return response;},
    detach:async provider=>{calls.push(['detach',provider]);return response;},
  });
  for(const input of controls('modes').querySelectorAll('input'))input.checked=input.value==='multi';
  for(const input of controls('sides').querySelectorAll('input'))input.checked=input.value==='right';
  await controls('attach').onclick();
  assert.equal(calls[0][0],'save');
  assert.equal(calls[0][2].mode,'multi');
  assert.equal(calls[0][2].side,'auto');
  assert.equal(calls[0][2].enabled,true);
  assert.equal(calls[1][0],'attach');
  assert.match(controls('feedback').textContent,/Мультивікна: 2\/2/);
  await controls('detach').onclick();
  assert.deepEqual(calls[2],['detach','metascalp']);
  assert.match(controls('feedback').textContent,/Відкріплено/);
});

test('manual window choice updates the selected target and does not reset unsaved controls',async()=>{
  const response=fixture();
  response.settings.profiles.metascalp={...response.settings.profiles.metascalp,
    targetHint:{exe:'MetaScalp',title:'MetaScalp ETH'}};
  response.terminals[0]={...response.terminals[0],selectedWindowId:'102'};
  const calls=[];
  const {controls}=setupRenderer(fixture(),{
    pick:async (provider,id)=>{calls.push([provider,id]);return response;}
  });
  for(const input of controls('modes').querySelectorAll('input'))input.checked=input.value==='multi';
  controls('width').value='595';
  await controls('target').onchange({target:{value:'102'}});
  assert.deepEqual(calls,[['metascalp','102']]);
  assert.equal(controls('target').value,'102');
  assert.equal(controls('width').value,'595');
  assert.ok(controls('modes').querySelectorAll('input').find(x=>x.value==='multi').checked);
});


test('live quick-toolbar changes update a pristine integration form',()=>{
  const {controls,subscribers}=setupRenderer(fixture());
  const update=fixture();
  update.settings.profiles.metascalp={...update.settings.profiles.metascalp,
    enabled:false,mode:'multi',side:'left'};
  subscribers.snapshot(update);
  assert.equal(controls('enabled').checked,false);
  assert.equal(controls('modes').querySelectorAll('input').find(x=>x.value==='multi').checked,true);
  assert.equal(controls('sides').querySelectorAll('input').find(x=>x.value==='left').checked,true);
  assert.equal(controls('multiHelp').hidden,false);
});

test('live quick-toolbar changes do not overwrite unsaved integration settings',()=>{
  const {controls,subscribers}=setupRenderer(fixture());
  controls('width').value='725';
  const update=fixture();
  update.settings.profiles.metascalp={...update.settings.profiles.metascalp,
    enabled:false,mode:'multi',side:'left'};
  subscribers.snapshot(update);
  assert.equal(controls('width').value,'725');
  assert.equal(controls('enabled').checked,true,'unsaved inputs must stay intact');
  assert.equal(controls('modes').querySelectorAll('input').find(x=>x.value==='full').checked,true);
  assert.match(controls('status').textContent,/Мультивікна: 2\/2/);
});
