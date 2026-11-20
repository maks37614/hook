import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rulerDragThresholdMet, rulerHasRange, RULER_DRAG_THRESHOLD_PX } from '../src/components/hookchart/rulerGestures';
const source = () => readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');

test('one press and drag draws a ruler without needing two taps', () => {
  assert.equal(RULER_DRAG_THRESHOLD_PX, 6);
  assert.equal(rulerDragThresholdMet({x:0,y:0},{x:3,y:3}),false);
  assert.equal(rulerDragThresholdMet({x:0,y:0},{x:6,y:0}),true);
  assert.equal(rulerHasRange({t:100,p:200},{t:100,p:200}),false);
  assert.equal(rulerHasRange({t:100,p:200},{t:100,p:201}),true);
  assert.equal(rulerHasRange({t:100,p:200},{t:200,p:200}),true);
  assert.equal(rulerHasRange({t:100,p:200},{t:Infinity,p:200}),false);
});

test('ruler drag, mouse click and mobile pointer end use one commit path', () => {
  const code=source();
  assert.match(code, /kind:'drawingRangePlacement',tool,pointerId:e.pointerId/);
  assert.match(code, /d\.moved=d\.moved\|\|rulerDragThresholdMet\(d,\{x,y\}\)/);
  assert.match(code, /if\(\(d\.moved\|\|d\.hadDraft\)\&\&rulerHasRange\(d\.first,last\)\)/);
  assert.match(code, /setDrawings\(list=>\[\.\.\.list,\{id,type:d\.tool,pts:\[d\.first,last\]\}\]\)/);
  assert.match(code, /else if\(!d\.hadDraft\)\{\s*setDraft\(d\.first\)/);
  assert.match(code, /if\(isRangeDrawingTool\(tool\)\|\|isPointDrawingTool\(tool\)\)return;const g=geometry/);
});

test('repositioning handles and two-finger pinch are preserved', () => {
  const code=source();
  assert.match(code, /kind:'measurementDrag'/);
  assert.match(code, /pointIndex:hit==='start'\?0:hit==='end'\?1:null/);
  assert.match(code, /if\(isRangeDrawingTool\(tool\)\)setDraft\(null\)/);
  assert.match(code, /d\.kind==='pinch'&&pointers\.current\.size>=2&&\(tool==='cursor'\|\|isRangeDrawingTool\(tool\)\|\|isPointDrawingTool\(tool\)\)/);
  assert.match(code, /const end=tool==='ruler'\?freeDrawingPoint/);
  assert.match(code, /if\(tool==='ruler'&&draft&&!mouse\)/);
  assert.match(code, /const rulerActionPosition=actionDrawing\?\.type==='ruler'/);
});
