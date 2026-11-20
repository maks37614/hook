import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closestActiveDensityPrices, rankAutoLevelsForPrice } from '../src/components/hookchart/chartPanPrecompute';

const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx',import.meta.url),'utf8');

test('nearest depth selections exactly match the prior stable distance sort', () => {
  const levels = [
    {p:110,active:true},{p:99,active:true},{p:100.5,active:false},
    {p:101,active:true},{p:101,active:true},{p:98,active:true},
    {p:103,active:true},{p:97,active:true},{p:100,active:true},
    {p:99.99,active:true},{p:100.01,active:true},
  ];
  for(const cp of [98,99.99,100,101,102,110]){
    const expected=levels.filter(x=>x.active&&Math.abs(x.p-cp)/Math.max(cp,1e-12)<=.03)
      .sort((a,b)=>Math.abs(a.p-cp)-Math.abs(b.p-cp)).slice(0,4).map(x=>x.p);
    assert.deepEqual(closestActiveDensityPrices(levels,cp),expected,'close price '+cp);
  }
});

test('depth preselection respects active state, threshold and tie order', () => {
  const levels=[{p:99,active:true},{p:101,active:true},{p:103,active:true},{p:97,active:true},{p:100,active:false}];
  assert.deepEqual(closestActiveDensityPrices(levels,100),[99,101,103,97]);
  assert.deepEqual(closestActiveDensityPrices(levels.map(x=>({...x,active:false})),100),[]);
  assert.deepEqual(closestActiveDensityPrices([{p:99,active:true},{p:103.01,active:true}],100),[99]);
});

const rank = (l:{p:number;strength:number;tf:string;broken:boolean}, cp:number) => {
  const priority=l.tf==='1d'?3:l.tf==='4h'?2:l.tf==='1h'?1:l.tf==='30m'?.85:l.tf==='15m'?.7:.5;
  return l.strength*.72+priority*6+(l.broken?-18:0)+Math.max(0,12-Math.abs(l.p-cp)/Math.max(cp,1e-12)*220);
};

test('sorted level filtering reproduces original visible-only ranking for different price ranges', () => {
  const rows=[
    {id:'a',p:99,strength:80,tf:'15m',broken:false},
    {id:'b',p:101,strength:80,tf:'15m',broken:false},
    {id:'c',p:107,strength:60,tf:'4h',broken:false},
    {id:'d',p:95,strength:90,tf:'1d',broken:true},
    {id:'e',p:100,strength:80,tf:'15m',broken:false},
    {id:'f',p:103,strength:60,tf:'1h',broken:false},
  ];
  for(const cp of [95,100,105]){
    const ranked=rankAutoLevelsForPrice(rows,cp);
    assert.deepEqual(rows.map(x=>x.id),['a','b','c','d','e','f'],'ranking does not mutate market data');
    for(const [lo,hi] of [[90,110],[98,101],[100,106],[94,99]]){
      const old=rows.filter(x=>x.p>=lo&&x.p<=hi).sort((a,b)=>rank(b,cp)-rank(a,cp));
      const next=ranked.filter(x=>x.p>=lo&&x.p<=hi);
      assert.deepEqual(next.map(x=>x.id),old.map(x=>x.id),`price ${cp} range ${lo}–${hi}`);
    }
  }
});

test('market-derived rankings depend on data and close, not viewport paint', () => {
  assert.match(engine,/const cachedNearDensityPrices=useMemo\(/);
  assert.match(engine,/\[densities,lastCloseForPan\]/);
  assert.match(engine,/const rankedAutoLevelsForPan=useMemo\(/);
  assert.match(engine,/\[autoLevels,lastCloseForPan\]/);
  assert.match(engine,/for\(const price of cachedNearDensityPrices\)/);
  assert.match(engine,/rankedAutoLevelsForPan\?rawLevels:/);
  assert.match(engine,/lastCloseForPan\?rankAutoLevelsForPrice\(autoLevels,lastCloseForPan\):null/);
});
