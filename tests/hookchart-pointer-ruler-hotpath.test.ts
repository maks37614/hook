import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { measurementHit } from '../src/components/hookchart/measurementTool';

const engine=readFileSync(new URL('../src/components/hookchart/engine.tsx',import.meta.url),'utf8');

type Ruler={id:string;type:'ruler'|'trend';pts:{t:number;p:number}[]};
const view={plotW:400,plotH:300,x:(t:number)=>t,y:(p:number)=>p};

function findRulerOriginal(drawings:Ruler[],symbol:string,x:number,y:number){
  const item=[...drawings].reverse().find(d=>d.type==='ruler'&&d.id.startsWith(symbol+':')&&d.pts[1]&&measurementHit(view,d.pts[0],d.pts[1],x,y));
  return {id:item?.id??null,action:item?measurementHit(view,item.pts[0],item.pts[1],x,y):null};
}
function findRulerFast(drawings:Ruler[],symbol:string,x:number,y:number){
  for(let i=drawings.length-1;i>=0;i--){
    const item=drawings[i];
    if(item.type!=='ruler'||!item.id.startsWith(symbol+':')||!item.pts[1])continue;
    const action=measurementHit(view,item.pts[0],item.pts[1],x,y);
    if(action)return {id:item.id,action};
  }
  return {id:null,action:null};
}

test('ruler hover and dragging keep original topmost hit ordering and endpoint selection',()=>{
  const drawings:Ruler[]=[
    {type:'ruler',id:'BTCUSDT:older',pts:[{t:70,p:70},{t:140,p:140}]},
    {type:'ruler',id:'ETHUSDT:wrong-market',pts:[{t:70,p:70},{t:140,p:140}]},
    {type:'trend',id:'BTCUSDT:trend',pts:[{t:70,p:70},{t:140,p:140}]},
    {type:'ruler',id:'BTCUSDT:top',pts:[{t:70,p:70},{t:140,p:140}]},
  ];
  for(const [x,y] of [[70,70],[140,140],[95,95],[350,250],[0,0]]){
    assert.deepEqual(findRulerFast(drawings,'BTCUSDT',x,y),findRulerOriginal(drawings,'BTCUSDT',x,y));
  }
});

test('pointer hover does not allocate reversed drawings or compute the winning ruler hit twice',()=>{
  const startDown=engine.indexOf('const handlePointerDown='),startMove=engine.indexOf('const handlePointerMove='),startUp=engine.indexOf('const handlePointerUp=');
  assert.ok(startDown>=0&&startMove>startDown&&startUp>startMove);
  const down=engine.slice(startDown,startMove),move=engine.slice(startMove,startUp);
  for(const handler of [down,move]){
    assert.doesNotMatch(handler,/\[\.\.\.drawings\]\.reverse\(\)\.find/);
    assert.match(handler,/for\(let i=drawings\.length-1;i>=0;i--\)/);
  }
  assert.match(move,/if\(candidate\)\{hit=item;action=candidate;break\}/);
  assert.match(down,/if\(candidate\)\{found=item;hit=candidate;break\}/);
});
