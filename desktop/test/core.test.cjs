'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TOP_DOCK_CLEARANCE, dockRects, floatingRects, chooseDockPlacement } = require('../layout.cjs');
const { normalizeSettings, matchesTerminal, availablePanels } = require('../profiles.cjs');

test('ECO is opt-in and persisted without mutating terminal profiles',()=>{
  const {normalizeSettings}=require('../profiles.cjs');
  assert.equal(normalizeSettings().ecoMode,false);
  assert.equal(normalizeSettings({ecoMode:true}).ecoMode,true);
  assert.equal(normalizeSettings({ecoMode:'yes'}).ecoMode,false);
  const configured=normalizeSettings({ecoMode:true,profiles:{tiger:{mode:'multi',side:'top'}}});
  assert.equal(configured.profiles.tiger.mode,'multi');
  assert.equal(configured.profiles.tiger.side,'top');
});
test('one independent workspace per provider and safe persisted values', () => {
  const settings = normalizeSettings({ profiles: {
    metascalp: { mode: 'floating', side: 'top', widgets: ['early', 'early', 'nonsense'], width: 100000 },
    tiger: { enabled: true, mode: 'blocks', side: 'bottom', widgets: ['terminal'] },
  } });
  assert.equal(settings.profiles.metascalp.mode, 'floating');
  assert.deepEqual(availablePanels(settings.profiles.metascalp), ['early']);
  assert.equal(settings.profiles.metascalp.width, 1100);
  assert.equal(settings.profiles.tiger.side, 'bottom');
  assert.deepEqual(availablePanels(settings.profiles.tiger), ['terminal']);
  assert.equal(settings.profiles.vataga.enabled, false);
  assert.deepEqual(availablePanels(normalizeSettings().profiles.metascalp), ['full']);
});
test('multi-window mode remains a separate selectable mode with one full h00k view per target',()=>{
  const profile=normalizeSettings({profiles:{metascalp:{mode:'multi'}}}).profiles.metascalp;
  assert.equal(profile.mode,'multi');
  assert.deepEqual(availablePanels(profile),['full']);
  assert.equal(profile.autoAttach,true);
  assert.equal(normalizeSettings({profiles:{tiger:{mode:'multi'}}}).profiles.tiger.mode,'multi');
});

test('automatic matching requires terminal executable, never title alone', () => {
  assert.equal(matchesTerminal('metascalp', {exe:'MetaScalp', title:'OK'}), true);
  assert.equal(matchesTerminal('tiger', {exe:'Tiger.Trade', title:'Trader'}), true);
  assert.equal(matchesTerminal('vataga', {exe:'Vataga.terminal', title:'Trader'}), true);
  assert.equal(matchesTerminal('vataga', {exe:'chrome', title:'Vataga'}), false);
  assert.equal(matchesTerminal('tiger', {exe:'hook', title:'Tiger.Trade'}), false);
});
test('docking in all four directions keeps terminal rectangle untouched', () => {
  const target = {x:400,y:250,width:700,height:500};
  const work = {x:0,y:0,width:1920,height:1080};
  const cases = {right:{x:1100},left:{x:70},top:{y:50-TOP_DOCK_CLEARANCE},bottom:{y:750}};
  for (const side of Object.keys(cases)) {
    const boxes = dockRects(target,work,side,330,200,1);
    assert.equal(boxes.length,1,side);
    assert.equal(boxes[0][Object.keys(cases[side])[0]],Object.values(cases[side])[0]);
  }
});
test('multiple widgets stack in strip without overlapping', () => {
  const boxes = dockRects({x:100,y:100,width:800,height:700},{x:0,y:0,width:1800,height:1000},'right',300,220,3);
  assert.equal(boxes.length,3);
  for(let i=1;i<boxes.length;i++) assert.ok(boxes[i].y >= boxes[i-1].y + boxes[i-1].height);
});
test('never overlap trading terminal if monitor has no room', () => {
  assert.deepEqual(dockRects({x:0,y:0,width:1920,height:1000},{x:0,y:0,width:1920,height:1080},'right',440,360,1),[]);
  assert.deepEqual(dockRects({x:0,y:0,width:1920,height:1000},{x:0,y:0,width:1920,height:1080},'bottom',440,360,1),[]);
});
test('negative coordinates and floating bounds are valid for secondary monitors', () => {
  const work = {x:-1920,y:0,width:1920,height:1080};
  const target = {x:-1600,y:160,width:1000,height:700};
  assert.equal(dockRects(target,work,'left',300,300,1).length,1);
  assert.notDeepEqual(floatingRects(target,work,300,300,1,'left'), floatingRects(target,work,300,300,1,'right'));
  for(const bounds of floatingRects(target,work,500,300,4)) {
    assert.ok(bounds.x >= work.x && bounds.x+bounds.width <= work.x+work.width);
  }
});

test('all four docking directions touch the visible target boundary without overlap', () => {
  const target = { x: -1240, y: 220, width: 700, height: 650 };
  const work = { x: -1920, y: 0, width: 1920, height: 1080 };
  const right = dockRects(target, work, 'right', 260, 220, 1)[0];
  const left = dockRects(target, work, 'left', 260, 220, 1)[0];
  const top = dockRects(target, work, 'top', 260, 180, 1)[0];
  const bottom = dockRects(target, work, 'bottom', 260, 180, 1)[0];
  assert.equal(right.x, target.x + target.width);
  assert.equal(left.x + left.width, target.x);
  assert.equal(top.y + top.height, target.y - TOP_DOCK_CLEARANCE);
  assert.equal(bottom.y, target.y + target.height);
  for (const pane of [right, left, top, bottom]) {
    assert.ok(pane.width > 0 && pane.height > 0);
    assert.ok(pane.x >= work.x && pane.y >= work.y);
    assert.ok(pane.x + pane.width <= work.x + work.width);
    assert.ok(pane.y + pane.height <= work.y + work.height);
  }
});

test('short h00k panes above a terminal never enter its shadow/caption safety band', () => {
  const work = {x:0,y:0,width:1920,height:1080};
  const target = {x:250,y:172,width:950,height:680};
  assert.equal(TOP_DOCK_CLEARANCE, 2);
  const manual = dockRects(target,work,'top',440,200,1);
  assert.equal(manual.length,1);
  assert.equal(manual[0].y,0,'top attachment should shrink to the available height');
  assert.equal(manual[0].y+manual[0].height,target.y-TOP_DOCK_CLEARANCE);
  // Auto placement gets no side except the narrow space above the terminal.
  const topOnlyWork={x:250,y:0,width:950,height:852};
  const topPlan=chooseDockPlacement(target,[topOnlyWork],440,200,1);
  assert.equal(topPlan?.side,'top');
  assert.equal(topPlan.boxes.length,1);
  assert.equal(topPlan.boxes[0].y,0);
  assert.equal(topPlan.boxes[0].y+topPlan.boxes[0].height,
    target.y-TOP_DOCK_CLEARANCE);
  assert.equal(dockRects({...target,y:141},work,'top',440,200,1).length,0,
    'insufficient height must not squeeze the chart into the terminal');
});

test('onboarding is required only for a new installation; legacy profiles stay active', () => {
  assert.equal(normalizeSettings().setupComplete, false);
  assert.equal(normalizeSettings({}).setupComplete, false);
  assert.equal(normalizeSettings({ profiles: { metascalp: { enabled: true } } }).setupComplete, true);
  assert.equal(normalizeSettings({ setupComplete: false, profiles: {} }).setupComplete, false);
  assert.equal(normalizeSettings({ setupComplete: true }).setupComplete, true);
});

test('auto docking chooses the largest safe strip and does not overlay terminal',()=>{
  const work=[{x:0,y:0,width:1920,height:1080}];
  const left=chooseDockPlacement({x:1150,y:160,width:700,height:600},work,440,360,1);
  assert.equal(left?.side,'left');
  assert.equal(left.boxes[0].x+left.boxes[0].width,1150);
  const right=chooseDockPlacement({x:140,y:160,width:700,height:600},work,440,360,1);
  assert.equal(right?.side,'right');
  assert.equal(right.boxes[0].x,840);
  const top=chooseDockPlacement({x:650,y:830,width:600,height:200},work,440,360,1);
  assert.equal(top?.side,'top');
  assert.equal(chooseDockPlacement({x:0,y:0,width:1920,height:1080},work,440,360,1),null);
});
test('auto docking supports multiple displays, panel strips and stable side choice',()=>{
  const works=[{x:-1920,y:0,width:1920,height:1080},{x:0,y:0,width:1920,height:1040}];
  const target={x:-1150,y:160,width:900,height:600};
  const selection=chooseDockPlacement(target,works,340,260,2);
  assert.equal(selection.workIndex,0);
  assert.equal(selection.boxes.length,2);
  for(const b of selection.boxes) {
    assert.ok(b.x>=-1920&&b.x+b.width<=0);
    assert.ok(b.y>=0&&b.y+b.height<=1080);
    assert.ok(b.x+b.width<=target.x||b.x>=target.x+target.width
      ||b.y+b.height<=target.y||b.y>=target.y+target.height);
  }
  const current=chooseDockPlacement({x:800,y:200,width:500,height:500},[works[1]],400,260,1);
  const stable=chooseDockPlacement({x:807,y:200,width:500,height:500},[works[1]],400,260,1,
    {side:current.side,workIndex:0});
  assert.equal(stable.side,current.side);
  assert.equal(chooseDockPlacement(null,works,340,260,1),null);
});
test('new profiles default to automatic placement; existing manual sides remain',()=>{
  assert.equal(normalizeSettings().profiles.metascalp.side,'auto');
  assert.equal(normalizeSettings({profiles:{metascalp:{side:'left'}}}).profiles.metascalp.side,'left');
});

test('other visible applications block unsafe auto docking',()=>{
  const target={x:350,y:260,width:700,height:560};
  const work=[{x:0,y:0,width:1920,height:1080}];
  const browser={x:1050,y:160,width:870,height:800};
  const found=chooseDockPlacement(target,work,440,360,1,null,[browser]);
  assert.ok(found,'a different side should remain available');
  assert.notEqual(found.side,'right');
  for(const box of found.boxes) {
    assert.ok(box.x+box.width<=browser.x||box.x>=browser.x+browser.width
      ||box.y+box.height<=browser.y||box.y>=browser.y+browser.height);
  }
});
test('auto docking shrinks thickness before overlapping another window',()=>{
  const target={x:300,y:220,width:800,height:600};
  const work=[{x:0,y:0,width:1920,height:1080}];
  const blockers=[
    {x:1330,y:200,width:300,height:650},
    {x:0,y:200,width:300,height:650},
    {x:300,y:0,width:800,height:220},
    {x:300,y:820,width:800,height:260},
  ];
  const found=chooseDockPlacement(target,work,440,360,1,null,blockers);
  assert.equal(found?.side,'right');
  assert.equal(found.boxes[0].x,1100);
  assert.equal(found.boxes[0].width,230);
});
test('auto docking may use an unobstructed portion of a terminal edge',()=>{
  const target={x:300,y:200,width:800,height:600};
  const work=[{x:0,y:0,width:1920,height:1080}];
  const blockers=[
    {x:1100,y:200,width:820,height:250},
    {x:0,y:200,width:300,height:600},
    {x:300,y:0,width:800,height:200},
    {x:300,y:800,width:800,height:280},
  ];
  const found=chooseDockPlacement(target,work,440,360,1,null,blockers);
  assert.equal(found?.side,'right');
  assert.ok(found.boxes[0].y>=450);
  assert.ok(found.boxes[0].height>=140);
});
test('a fully occupied desktop prevents docking instead of covering other apps',()=>{
  const work=[{x:0,y:0,width:1920,height:1080}];
  const target={x:300,y:200,width:800,height:600};
  const blockers=[
    {x:1100,y:0,width:820,height:1080},
    {x:0,y:0,width:300,height:1080},
    {x:300,y:0,width:800,height:200},
    {x:300,y:800,width:800,height:280},
  ];
  assert.equal(chooseDockPlacement(target,work,440,360,1,null,blockers),null);
  assert.ok(chooseDockPlacement(target,work,440,360,1));
});
