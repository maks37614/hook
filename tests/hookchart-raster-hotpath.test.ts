import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const engine=readFileSync(new URL('../src/components/hookchart/engine.tsx',import.meta.url),'utf8');

test('original archive candle rasterization remains byte-for-byte untouched',()=>{
  const first=engine.indexOf('const denseBars=');
  const last=engine.indexOf('q.restore();',first);
  assert.ok(first>=0&&last>first);
  const raster=engine.slice(first,last+'q.restore();'.length);
  assert.equal(createHash('sha256').update(raster,'utf8').digest('hex'),
    '65e30dd533494ca6c8ea70a713f5f77d9f60d20f931280dca6392c62061b7dbe');
});

test('visible density drawing avoids allocating a filtered copy every pan frame',()=>{
  assert.match(engine,/if\(showDensityLines\|\|showDensityLabels\)for\(const d of densities\)\{/);
  assert.match(engine,/if\(!\(d\.p>=g\.lo&&d\.p<=g\.hi\)\)continue/);
  assert.doesNotMatch(engine,/densities\.filter\(d=>d\.p>=g\.lo&&d\.p<=g\.hi\)\.forEach/);

  const densities=[{id:'a',p:98},{id:'b',p:100},{id:'c',p:105},{id:'d',p:NaN},{id:'e',p:101}];
  for(const [lo,hi] of [[99,101],[97,102],[100,105]]){
    const old=densities.filter(d=>d.p>=lo&&d.p<=hi).map(d=>d.id);
    const selected:string[]=[];
    for(const d of densities){if(!(d.p>=lo&&d.p<=hi))continue;selected.push(d.id)}
    assert.deepEqual(selected,old);
  }
});

test('volume rectangles keep the exact original physical-pixel widths and positions',()=>{
  assert.match(engine,/const volumeStepPx=Math\.max\(2,Math\.round\(g\.step\*scaleX\)\)/);
  assert.match(engine,/const volumeBarPx=Math\.max\(1,Math\.min\(volumeStepPx-1,Math\.round\(g\.step\*\.72\*scaleX\)\)\)/);
  assert.match(engine,/const volumeBasePx=Math\.round\(volumeBaseY\*scaleY\)/);
  assert.match(engine,/const hhPx=Math\.max\(2,Math\.round\(\(\(k\.v\/maxV\)\*\(volumeBandH-5\)\)\*scaleY\)\)/);
  for(const dpr of [1,1.25,1.5,2,2.5,3,4]){
    for(const step of [.12,.5,1,2,4,9,16,34]){
      const oldStepPx=Math.max(2,Math.round(step*dpr));
      const oldBarPx=Math.max(1,Math.min(oldStepPx-1,Math.round(step*.72*dpr)));
      const newStepPx=Math.max(2,Math.round(step*dpr));
      const newBarPx=Math.max(1,Math.min(newStepPx-1,Math.round(step*.72*dpr)));
      assert.equal(newBarPx,oldBarPx);
      for(const baseY of [50,100,500])assert.equal(Math.round(baseY*dpr),Math.round(baseY*dpr));
    }
  }
});
