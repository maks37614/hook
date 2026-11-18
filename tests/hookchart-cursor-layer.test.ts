import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCrosshairLineWidth, paintChartCrosshair, paintChartRuler } from '../src/components/hookchart/chartCursor';

test('interaction drawing is limited to two guides and one precise price badge', () => {
  const lines: number[][] = [], rects: number[][] = [], text: unknown[][] = [];
  const context = {
    save(){},restore(){},beginPath(){},rect(){},clip(){},setLineDash(){},stroke(){},
    moveTo(x:number,y:number){lines.push([x,y]);},lineTo(x:number,y:number){lines.push([x,y]);},
    fillRect(...args:number[]){rects.push(args);},fillText(...args:unknown[]){text.push(args);},
  } as unknown as CanvasRenderingContext2D;
  paintChartCrosshair(context,{width:390,height:700,plotWidth:340,plotHeight:700},{x:120,y:250},'74,603.39');
  assert.deepEqual(lines,[[120,0],[120,700],[0,250],[340,250]]);
  assert.deepEqual(rects,[[341,241,48,18]]);
  assert.equal(text[0][0],'74,603.39');
});

test('price badges remain inside a phone or short terminal chart at the top and bottom', () => {
  for (const height of [80,350,700]) {
    for (const y of [0,height-1]) {
      const rects: number[][] = [];
      const context = {
        save(){},restore(){},beginPath(){},rect(){},clip(){},setLineDash(){},stroke(){},moveTo(){},lineTo(){},fillText(){},
        fillRect(...args:number[]){rects.push(args);},
      } as unknown as CanvasRenderingContext2D;
      paintChartCrosshair(context,{width:240,height,plotWidth:190,plotHeight:height},{x:10,y},'0.001234');
      assert.ok(rects[0][1]>=0);
      assert.ok(rects[0][1]+rects[0][3]<=height);
      assert.ok(rects[0][0]+rects[0][2]<=240);
    }
  }
});

test('hold measurement clips to the plot and retains its percentage/time readout', () => {
  const clips:number[][]=[],rects:number[][]=[],labels:unknown[][]=[];
  const context={
    save(){},restore(){},beginPath(){},rect(...args:number[]){clips.push(args);},clip(){},setLineDash(){},
    fillRect(...args:number[]){rects.push(args);},strokeRect(){},measureText(){return{width:150};},
    fillText(...args:unknown[]){labels.push(args);},
  } as unknown as CanvasRenderingContext2D;
  paintChartRuler(context,{width:390,height:700,plotWidth:340,plotHeight:700},
    {x:120,y:250},{x:360,y:180},'+1.2500% · 60.0с');
  assert.deepEqual(clips,[[0,0,340,700]]);
  assert.deepEqual(rects,[[120,250,240,-70],[8,7,166,24]]);
  assert.equal(labels[0][0],'+1.2500% · 60.0с');
});

test('both crosshair guides use the selected thin stroke, including fractional widths', () => {
  for(const width of [.5,.75,1,1.5,2]) {
    const strokes:number[]=[];
    const context={
      lineWidth:0,save(){},restore(){},beginPath(){},rect(){},clip(){},setLineDash(){},
      moveTo(){},lineTo(){},fillRect(){},fillText(){},stroke(this: { lineWidth: number }){strokes.push(this.lineWidth);},
    } as unknown as CanvasRenderingContext2D;
    paintChartCrosshair(context,{width:390,height:700,plotWidth:340,plotHeight:700},{x:120,y:250},'74,603.39','#758696',width);
    assert.deepEqual(strokes,[width]);
  }
  assert.equal(normalizeCrosshairLineWidth(undefined),1);
  assert.equal(normalizeCrosshairLineWidth(NaN),1);
  assert.equal(normalizeCrosshairLineWidth(Infinity),1);
  assert.equal(normalizeCrosshairLineWidth(-5),.5);
  assert.equal(normalizeCrosshairLineWidth(5),2);
});
