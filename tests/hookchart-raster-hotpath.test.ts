import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const engine=readFileSync(new URL('../src/components/hookchart/engine.tsx',import.meta.url),'utf8');

test('normal HookChart zoom paints directly from visible candles without allocating one row per candle',()=>{
  assert.match(engine,/if\(denseBars\)\{let bucketPx=/,'compressed history must still be aggregated');
  assert.doesNotMatch(engine,/if\(!denseBars\)\{for\(let i=0;i<g\.data\.length;i\+\+\)candleRows\.push/);
  assert.match(engine,/const rowCount=denseBars\?candleRows\.length:g\.data\.length/);
  assert.match(engine,/const k=denseBars\?candleRows\[i\]\.k:g\.data\[i\]/);
  assert.match(engine,/const rawX=denseBars\?candleRows\[i\]\.rawX:g\.candleX\(i\)/);
});

const rowGeometry=(step:number,scaleX:number,scaleY:number,denseBars:boolean)=>{
  const stepPx=denseBars?1:Math.max(2,Math.round(step*scaleX));
  const oneCssPx=Math.max(1,Math.round(scaleX));
  const gapPx=denseBars?0:Math.max(1,oneCssPx);
  const desiredBodyPx=denseBars?1:Math.max(1,Math.round(step*.78*scaleX));
  const bodyPx=denseBars?1:Math.max(1,Math.min(stepPx-gapPx,desiredBodyPx));
  const wickPx=denseBars?1:Math.max(1,Math.round(scaleX*.85));
  const minimumBodyHPx=denseBars?1:Math.max(1,Math.round(scaleY*.75));
  return {stepPx,bodyPx,wickPx,minimumBodyHPx};
};

test('per-frame candle width math preserves legacy physical-pixel widths at DPR 1–4 and subpixel zoom',()=>{
  for(const dpr of [1,1.25,1.5,2,2.5,3,4]){
    for(const step of [.12,.2,.5,1,1.8,2,4,9,16,24,34]){
      const denseBars=step*dpr<1.15;
      const old=rowGeometry(step,dpr,dpr,denseBars);
      // Geometry is now hoisted once per canvas frame, not per individual row.
      const perFrame=rowGeometry(step,dpr,dpr,denseBars);
      assert.deepEqual(perFrame,old,`step ${step} dpr ${dpr}`);
      assert.ok(perFrame.bodyPx>=1&&perFrame.wickPx>=1);
    }
  }
  assert.match(engine,/const stepPx=denseBars\?1:Math\.max\(2,Math\.round\(g\.step\*scaleX\)\)/);
  assert.match(engine,/const bodyPx=denseBars\?1:Math\.max\(1,Math\.min\(stepPx-gapPx,desiredBodyPx\)\)/);
  assert.match(engine,/const wickPx=denseBars\?1:Math\.max\(1,Math\.round\(scaleX\*\.85\)\)/);
  assert.match(engine,/const minimumBodyHPx=denseBars\?1:Math\.max\(1,Math\.round\(scaleY\*\.75\)\)/);
});

test('volume width and base remain fixed for all candles in each rendered frame',()=>{
  assert.match(engine,/const volumeStepPx=Math\.max\(2,Math\.round\(g\.step\*scaleX\)\)/);
  assert.match(engine,/const volumeBarPx=Math\.max\(1,Math\.min\(volumeStepPx-1,Math\.round\(g\.step\*\.72\*scaleX\)\)\)/);
  assert.match(engine,/const volumeBasePx=Math\.round\(volumeBaseY\*scaleY\)/);
  assert.match(engine,/const hhPx=Math\.max\(2,Math\.round\(\(\(k\.v\/maxV\)\*\(volumeBandH-5\)\)\*scaleY\)\)/);
  assert.match(engine,/q\.fillRect\(wickLeftPx,wickTopPx,wickPx,wickHPx\)/);
  assert.match(engine,/q\.fillRect\(bodyLeftPx,bodyTopPx,bodyPx,bodyHPx\)/);
  assert.match(engine,/q\.setTransform\(1,0,0,1,0,0\)/);
});
