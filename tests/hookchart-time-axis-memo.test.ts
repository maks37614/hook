import test from 'node:test';
import assert from 'node:assert/strict';
import { sameTimeAxisInputs } from '../src/components/hookchart/timeAxisMemo';

const candles = [{t:1},{t:2}];
const base = {
  candles, tf:'1m', timezone:'Europe/Warsaw', language:'uk',
  viewport:{barWidth:9,rightOffset:7,fitAll:false,autoY:true,manualCenter:null,manualRange:null},
  rightPadding:10,rightPaddingBars:2,
  countdownRef:undefined,crosshair:undefined,
};

test('vertical price scaling and candle-fit toggles do not recompute the time axis', () => {
  assert.equal(sameTimeAxisInputs(base,{...base,viewport:{
    ...base.viewport,autoY:false,manualCenter:312.4,manualRange:18,yZoom:2,candleFit:true,
  }}),true);
});

test('panning and zooming horizontally still update time labels', () => {
  assert.equal(sameTimeAxisInputs(base,{...base,viewport:{...base.viewport,rightOffset:8}}),false);
  assert.equal(sameTimeAxisInputs(base,{...base,viewport:{...base.viewport,barWidth:10}}),false);
  assert.equal(sameTimeAxisInputs(base,{...base,viewport:{...base.viewport,fitAll:true}}),false);
});

test('new candle data, market timeframe and timezone must refresh axis', () => {
  assert.equal(sameTimeAxisInputs(base,{...base,candles:[...candles]}),false);
  assert.equal(sameTimeAxisInputs(base,{...base,tf:'5m'}),false);
  assert.equal(sameTimeAxisInputs(base,{...base,timezone:'UTC'}),false);
  assert.equal(sameTimeAxisInputs(base,{...base,language:'pl'}),false);
});

test('layout padding and crosshair ownership keep correct time-axis updates', () => {
  assert.equal(sameTimeAxisInputs(base,{...base,rightPadding:0}),false);
  assert.equal(sameTimeAxisInputs(base,{...base,rightPaddingBars:3}),false);
  assert.equal(sameTimeAxisInputs(base,{...base,countdownRef:{current:null}}),false);
  assert.equal(sameTimeAxisInputs(base,{...base,crosshair:{}}),false);
});
