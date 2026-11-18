import test from 'node:test';
import assert from 'node:assert/strict';
import { touchMagnifierLayout, drawTouchMagnifier, magnifierZoomFromPriceDrag } from '../src/components/hookchart/touchMagnifier';

test('touch magnifier samples the chart under its visible lens on every screen size', () => {
  for (const [width, height] of [[240, 160], [390, 700], [768, 500], [1366, 800]]) {
    for (const point of [{x:0,y:0}, {x:width,y:height}, {x:width/2,y:height/2}, {x:-30,y:height+40}]) {
      const lens = touchMagnifierLayout(width, height, point)!;
      assert.ok(lens.radius > 0 && lens.radius <= 58);
      assert.ok(lens.x - lens.radius >= 0 && lens.x + lens.radius <= width);
      assert.ok(lens.y - lens.radius >= 0 && lens.y + lens.radius <= height);
      assert.equal(lens.sourceX + lens.sourceSize / 2, lens.x);
      assert.equal(lens.sourceY + lens.sourceSize / 2, lens.y);
      assert.equal(lens.size / lens.sourceSize, 2);
    }
  }
});

test('lens clears the finger above the crosshair, and moves sideways near the upper edge', () => {
  for (const point of [{x:180,y:400}, {x:180,y:690}, {x:12,y:400}, {x:380,y:400}]) {
    const lens = touchMagnifierLayout(390, 700, point)!;
    assert.ok(lens.y + lens.radius <= point.y - 36, JSON.stringify({point,lens}));
  }
  const nearTop = touchMagnifierLayout(390, 700, {x:180,y:10})!;
  assert.ok(nearTop.y - nearTop.radius >= 0);
  assert.ok(Math.abs(nearTop.x - 180) >= nearTop.radius + 36);
  // The source follows the relocated lens, NOT the finger/crosshair.
  assert.equal(nearTop.sourceX + nearTop.sourceSize / 2, nearTop.x);
  assert.equal(nearTop.sourceY + nearTop.sourceSize / 2, nearTop.y);
  assert.notEqual(nearTop.sourceX + nearTop.sourceSize / 2, 180);
  assert.notEqual(nearTop.sourceY + nearTop.sourceSize / 2, 10);
  assert.equal(touchMagnifierLayout(40, 40, {x:180,y:400}), null);
  assert.equal(touchMagnifierLayout(390, 700, {x:NaN,y:10}), null);
});

test('retina magnifier samples before drawing its overlay, with no recursive screenshot', () => {
  const calls: {kind:string;args:unknown[]}[] = [];
  const sampleContext = {
    clearRect(){},
    drawImage(...args:unknown[]){calls.push({kind:'sample',args});},
  };
  const chart = {width:780,height:1400} as HTMLCanvasElement;
  const sample = {width:0,height:0,getContext:()=>sampleContext} as unknown as HTMLCanvasElement;
  const context = {
    save(){},restore(){},setLineDash(){},beginPath(){},arc(){},fill(){calls.push({kind:'fill',args:[]});},
    clip(){},stroke(){},
    drawImage(...args:unknown[]){calls.push({kind:'lens',args});},
  } as unknown as CanvasRenderingContext2D;
  drawTouchMagnifier(chart, context, sample, 390, 700, {x:180,y:400});
  assert.deepEqual(calls.map(c=>c.kind), ['sample','fill','lens']);
  assert.equal(calls[0].args[0], chart);
  assert.equal(calls[2].args[0], sample);
  assert.equal(sample.width, 232);
  assert.equal(sample.height, 232);
  assert.equal(calls[0].args[3], 116);
  assert.equal(calls[0].args[4], 116);
});

test('4x phone screens keep a bounded scratch bitmap for the 2x lens', () => {
  const sampleContext = { clearRect(){}, drawImage(){} };
  const chart = {width:1560,height:2800} as HTMLCanvasElement;
  const sample = {width:0,height:0,getContext:()=>sampleContext} as unknown as HTMLCanvasElement;
  const context = {
    save(){},restore(){},setLineDash(){},beginPath(){},arc(){},fill(){},clip(){},stroke(){},drawImage(){},
  } as unknown as CanvasRenderingContext2D;
  drawTouchMagnifier(chart, context, sample, 390, 700, {x:180,y:400});
  assert.equal(sample.width, 232);
  assert.equal(sample.height, 232);
});

test('every sampled region is centred under the lens, including retina chart corners', () => {
  for (const dpr of [1,2,3,4]) {
    for (const point of [{x:0,y:0}, {x:389,y:0}, {x:389,y:699}, {x:0,y:699}, {x:15,y:350}, {x:370,y:250}, {x:180,y:650}]) {
      let copy: number[] = [];
      const sampleContext = { clearRect(){}, drawImage(_chart: unknown, ...args: number[]) { copy = args; } };
      const chart = {width:390*dpr,height:700*dpr} as HTMLCanvasElement;
      const sample = {width:0,height:0,getContext:()=>sampleContext} as unknown as HTMLCanvasElement;
      const context = {
        save(){},restore(){},setLineDash(){},beginPath(){},arc(){},fill(){},clip(){},stroke(){},drawImage(){},
      } as unknown as CanvasRenderingContext2D;
      drawTouchMagnifier(chart, context, sample, 390, 700, point);
      const [sx,sy,sw,sh,dx,dy,dw,dh] = copy;
      assert.ok(sx >= 0 && sy >= 0 && sw > 0 && sh > 0);
      assert.ok(sx+sw <= chart.width + 1e-8 && sy+sh <= chart.height + 1e-8);
      const lens = touchMagnifierLayout(390, 700, point)!;
      const sampledLensX=dx+(lens.x*dpr-sx)/sw*dw;
      const sampledLensY=dy+(lens.y*dpr-sy)/sh*dh;
      assert.ok(Math.abs(sampledLensX-sample.width/2)<1e-8, JSON.stringify({dpr,point,copy,sampledLensX}));
      assert.ok(Math.abs(sampledLensY-sample.height/2)<1e-8, JSON.stringify({dpr,point,copy,sampledLensY}));
    }
  }
});

test('an optional source overlay uses the lens coordinates at every chart edge', () => {
  for (const point of [{x:0,y:0},{x:389,y:0},{x:0,y:699},{x:389,y:699},{x:180,y:400}]) {
    const calls: string[] = [], transforms: number[][] = [];
    const sampleContext = {
      clearRect(){},drawImage(){calls.push('scene');},save(){},restore(){},
      setTransform(...matrix:number[]){transforms.push(matrix);},
    } as unknown as CanvasRenderingContext2D;
    const chart={width:1170,height:2100} as HTMLCanvasElement;
    const sample={width:0,height:0,getContext:()=>sampleContext} as unknown as HTMLCanvasElement;
    const context={save(){},restore(){},setLineDash(){},beginPath(){},arc(){},fill(){},clip(){},stroke(){},drawImage(){calls.push('lens');}} as unknown as CanvasRenderingContext2D;
    drawTouchMagnifier(chart,context,sample,390,700,point,'#131722',target=>{
      assert.equal(target,sampleContext);
      calls.push('cursor');
    });
    assert.deepEqual(calls,['scene','cursor','lens']);
    const [a,, ,d,tx,ty]=transforms[0];
    const lens=touchMagnifierLayout(390,700,point)!;
    assert.ok(Math.abs(lens.x*a+tx-sample.width/2)<1e-8);
    assert.ok(Math.abs(lens.y*d+ty-sample.height/2)<1e-8);
  }
});

test('the second finger on the price scale controls lens zoom smoothly and within safe limits', () => {
  assert.equal(magnifierZoomFromPriceDrag(2, 0), 2);
  assert.ok(magnifierZoomFromPriceDrag(2, -100) > 2, 'upward drag zooms the lens in');
  assert.ok(magnifierZoomFromPriceDrag(2, 100) < 2, 'downward drag zooms the lens out');
  assert.equal(magnifierZoomFromPriceDrag(2, -10_000), 6);
  assert.equal(magnifierZoomFromPriceDrag(2, 10_000), 1.25);
  assert.equal(magnifierZoomFromPriceDrag(3.5, 0), 3.5, 'a new second-finger drag keeps its previous zoom');
  assert.ok(Number.isFinite(magnifierZoomFromPriceDrag(2, NaN)));
});

test('changing lens zoom keeps the sampled region under the lens while keeping its position', () => {
  const point = {x:180, y:420};
  const defaultLens = touchMagnifierLayout(390, 700, point)!;
  const zoomedLens = touchMagnifierLayout(390, 700, point, 4)!;
  assert.equal(zoomedLens.x, defaultLens.x);
  assert.equal(zoomedLens.y, defaultLens.y);
  assert.equal(zoomedLens.sourceSize, defaultLens.sourceSize / 2);
  assert.equal(zoomedLens.sourceX + zoomedLens.sourceSize / 2, zoomedLens.x);
  assert.equal(zoomedLens.sourceY + zoomedLens.sourceSize / 2, zoomedLens.y);
  assert.notEqual(zoomedLens.y, point.y);
  const zoomedOut = touchMagnifierLayout(390, 700, point, 1.25)!;
  assert.ok(zoomedOut.sourceSize > defaultLens.sourceSize);
});

test('drawTouchMagnifier zoom argument changes captured chart area without moving the cursor', () => {
  const calls: number[][] = [];
  const buffer = {clearRect(){},drawImage(_chart: unknown,...args:number[]){calls.push(args);}};
  const chart={width:780,height:1400} as HTMLCanvasElement;
  const sample={width:0,height:0,getContext:()=>buffer} as unknown as HTMLCanvasElement;
  const context={save(){},restore(){},setLineDash(){},beginPath(){},arc(){},fill(){},clip(){},stroke(){},drawImage(){}} as unknown as CanvasRenderingContext2D;
  drawTouchMagnifier(chart,context,sample,390,700,{x:180,y:420},'#131722',undefined,2);
  drawTouchMagnifier(chart,context,sample,390,700,{x:180,y:420},'#131722',undefined,4);
  assert.equal(calls.length,2);
  assert.equal(calls[1][2],calls[0][2]/2);
  assert.equal(calls[1][3],calls[0][3]/2);
});

test('drawing placement focuses the zoomed scene on the covered fingertip, not the floating lens', () => {
  for (const point of [{x:150,y:420},{x:180,y:15},{x:10,y:680},{x:385,y:430}]) {
    const layout=touchMagnifierLayout(390,700,point,2,true)!;
    assert.equal(layout.sourceX+layout.sourceSize/2,Math.max(0,Math.min(390,point.x)));
    assert.equal(layout.sourceY+layout.sourceSize/2,Math.max(0,Math.min(700,point.y)));
    assert.ok(layout.y+layout.radius<=point.y-36||point.y<=layout.radius+36,
      'the enlarged view floats clear of the pointing finger when space allows');
  }
  const inspecting=touchMagnifierLayout(390,700,{x:150,y:420})!;
  const placing=touchMagnifierLayout(390,700,{x:150,y:420},2,true)!;
  assert.equal(inspecting.x,placing.x);
  assert.equal(inspecting.y,placing.y);
  assert.notEqual(inspecting.sourceY,placing.sourceY);
});

test('drawing precision lens samples the real touched candle and paints its target only inside the lens', () => {
  const sampled: number[][]=[],strokes: string[]=[];
  const sampleContext={clearRect(){},drawImage(_chart:unknown,...coords:number[]){sampled.push(coords);}};
  const chart={width:780,height:1400} as HTMLCanvasElement;
  const sample={width:0,height:0,getContext:()=>sampleContext} as unknown as HTMLCanvasElement;
  const target={
    save(){},restore(){},setLineDash(){},beginPath(){},arc(){},fill(){},clip(){},
    moveTo(){},lineTo(){},stroke(){strokes.push('target')},drawImage(){},
  } as unknown as CanvasRenderingContext2D;
  drawTouchMagnifier(chart,target,sample,390,700,{x:170,y:400},'#131722',undefined,2,true);
  const layout=touchMagnifierLayout(390,700,{x:170,y:400},2,true)!;
  assert.equal(sampled.length,1);
  assert.equal(sampled[0][0],layout.sourceX*2);
  assert.equal(sampled[0][1],layout.sourceY*2);
  assert.equal(strokes.length,3,'dark and light target lines plus outer ring');
});
