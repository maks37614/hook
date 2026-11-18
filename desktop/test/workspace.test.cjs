'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeFloatingBounds, normalizeFloatingBoundsMap, restoreFloatingBounds,
  intersectionArea, floatingLayoutKey } = require('../workspace.cjs');
const { normalizeSettings } = require('../profiles.cjs');
const { floatingRects } = require('../layout.cjs');

const displays = [
  { workArea:{ x:-1920,y:0,width:1920,height:1080 } },
  { workArea:{ x:0,y:0,width:1920,height:1040 } },
];
test('floating bounds validation rejects NaN, invalid widths, prototype input, and offscreen magnitude', () => {
  assert.deepEqual(normalizeFloatingBounds({x:-1600,y:100,width:430,height:320}),
    {x:-1600,y:100,width:430,height:320});
  assert.equal(normalizeFloatingBounds({x:NaN,y:20,width:400,height:300}),null);
  assert.equal(normalizeFloatingBounds({x:Infinity,y:0,width:400,height:300}),null);
  assert.equal(normalizeFloatingBounds({x:0,y:0,width:50,height:300}),null);
  assert.equal(normalizeFloatingBounds({x:9999999,y:0,width:400,height:300}),null);
  assert.equal(normalizeFloatingBounds(null),null);
  assert.deepEqual(normalizeFloatingBoundsMap({
    screener:{x:50,y:50,width:500,height:300},
    unknown:{x:12,y:20,width:300,height:200},
    terminal:{x:30,y:20,width:NaN,height:300},
  },['screener','terminal']),{screener:{x:50,y:50,width:500,height:300}});
});
test('per-provider saved positions survive profile normalization and stay isolated', () => {
  const s=normalizeSettings({profiles:{
    tiger:{enabled:true,mode:'floating',follow:false,floatingBounds:{
      screener:{x:-1700,y:100,width:370,height:400},
      terminal:{x:-100,y:80,width:700,height:420},
    }},
    vataga:{enabled:true,mode:'floating',follow:false,floatingBounds:{
      screener:{x:88,y:88,width:500,height:400},
    }},
  }});
  assert.equal(s.profiles.tiger.floatingBounds.screener.x,-1700);
  assert.equal(s.profiles.vataga.floatingBounds.screener.x,88);
  assert.deepEqual(s.profiles.metascalp.floatingBounds,{});
  assert.equal(normalizeSettings({profiles:s.profiles}).profiles.tiger.floatingBounds.terminal.width,700);
});
test('restore saved positions on the corresponding monitor, clamp oversized pane, fall back when unplugged', () => {
  const fallback={x:10,y:30,width:440,height:360};
  const rect={x:-1800,y:900,width:500,height:300};
  assert.deepEqual(restoreFloatingBounds(rect,displays,fallback),
    {x:-1800,y:780,width:500,height:300});
  assert.deepEqual(restoreFloatingBounds({x:10000,y:20000,width:440,height:360}, displays, fallback), fallback);
  assert.equal(intersectionArea({x:0,y:0,width:100,height:100},{x:100,y:0,width:100,height:100}),0);
});
test('floating windows without a terminal honor all four initial sides', () => {
  const work={x:-1920,y:0,width:1920,height:1080};
  const right=floatingRects(null,work,400,300,1,'right')[0];
  const left=floatingRects(null,work,400,300,1,'left')[0];
  const top=floatingRects(null,work,400,300,1,'top')[0];
  const bottom=floatingRects(null,work,400,300,1,'bottom')[0];
  assert.ok(left.x<right.x);
  assert.ok(top.y<bottom.y);
  for(const rect of [left,right,top,bottom]){
    assert.ok(rect.x>=work.x && rect.x+rect.width<=work.x+work.width);
    assert.ok(rect.y>=work.y && rect.y+rect.height<=work.y+work.height);
  }
});
test('side and mode always invalidate a floating layout signature',()=>{
  const base={mode:'floating',side:'left',width:400,height:300,widgets:['screener'],follow:false};
  assert.notEqual(floatingLayoutKey(base),floatingLayoutKey({...base,side:'right'}));
  assert.notEqual(floatingLayoutKey(base),floatingLayoutKey({...base,mode:'blocks'}));
  assert.equal(floatingLayoutKey(base),floatingLayoutKey({...base}));
});
test('desktop defers loading invisible webviews and frees hidden ones after a grace period',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const main=fs.readFileSync(path.join(__dirname,'..','main.cjs'),'utf8');
  assert.match(main,/win\.__h00kLoaded = false/);
  assert.match(main,/if \(!win\.__h00kLoaded && Date\.now\(\) >= win\.__nextLoadAt\)/);
  assert.match(main,/HIDDEN_RECLAIM_MS = 30_000/);
  assert.match(main,/hiddenProviders\.delete\(provider\)/);
  assert.match(main,/const layoutChanged = previousLayoutKey !== undefined && previousLayoutKey !== resolvedKey/);
  assert.match(main,/win\.on\('moved', persistManualBounds\)/);
  assert.match(main,/win\.on\('resized', persistManualBounds\)/);
});

test('failed panel loads back off; external browser action accepts no renderer-supplied URL',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const main=fs.readFileSync(path.join(__dirname,'..','main.cjs'),'utf8');
  const preload=fs.readFileSync(path.join(__dirname,'..','preload.cjs'),'utf8');
  const settings=fs.readFileSync(path.join(__dirname,'..','settings.html'),'utf8');
  assert.match(main,/win\.__nextLoadAt = Date\.now\(\) \+ 15_000/);
  assert.match(main,/ipcMain\.handle\('desktop:open-browser',event => \{/);
  assert.match(main,/return shell\.openExternal\(WEBSITE\)/);
  assert.match(preload,/openBrowser: \(\) => ipcRenderer\.invoke\('desktop:open-browser'\)/);
  assert.match(settings,/byId\('browser'\)\.onclick/);
  assert.match(settings,/api\.pick\(active,e\.target\.value\)/);
});
