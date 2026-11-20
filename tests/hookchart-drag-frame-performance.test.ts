import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');

test('captured HookChart drags reuse bounds rather than forcing layout for every pointermove', () => {
  assert.match(engine, /const activePointerRect=useRef<DOMRect\|null>\(null\)/);
  assert.match(engine, /pointers\.current\.has\(e\.pointerId\)\?activePointerRect\.current:null/);
  assert.match(engine, /activePointerRect\.current=z\.rect/);
  assert.match(engine, /if\(!pointers\.current\.size\)\{\s*activePointerRect\.current=null/);
  assert.match(engine, /pointers\.current\.clear\(\);activePointerRect\.current=null/);
});

test('scroll and resize invalidate the captured bounds without changing chart pointer ownership', () => {
  assert.match(engine, /const ro=new ResizeObserver\(\(\)=>\{invalidatePointerRect\(\);scheduleDraw\(\)\}\)/);
  assert.match(engine, /const onResize=\(\)=>\{invalidatePointerRect\(\);scheduleDraw\(\)\}/);
  assert.match(engine, /window\.addEventListener\('scroll',invalidatePointerRect,true\)/);
  assert.match(engine, /window\.removeEventListener\('scroll',invalidatePointerRect,true\)/);
  assert.match(engine, /ref\.current\?\.getBoundingClientRect\(\)/);
});

test('opaque DPR canvas background avoids a redundant full-surface clear', () => {
  const start = engine.indexOf('const mouse=mouseRef.current,dpr=effectiveCanvasDpr');
  const end = engine.indexOf('// Clip all candles, drawings, volume', start);
  assert.ok(start >= 0 && end > start, 'paint path exists');
  const paint = engine.slice(start, end);
  assert.match(paint, /q\.globalAlpha=1/);
  assert.match(paint, /if\(!\/\^#\(\?:\[0-9a-f\]\{3\}\|\[0-9a-f\]\{6\}\)\$\/i\.test\(backgroundColor\)\)q\.clearRect/);
  assert.match(paint, /q\.fillStyle=backgroundColor;q\.fillRect\(0,0,w,h\)/);
  assert.match(paint, /q\.setTransform\(scaleX,0,0,scaleY,0,0\)/);
});

test('candle quality remains physical-pixel DPR painting with the original width and colors', () => {
  assert.match(engine, /const centerPx=Math\.round\(rawX\*scaleX\)/);
  assert.match(engine, /const col=up\?candleLongColor:candleShortColor/);
  assert.match(engine, /q\.fillRect\(wickLeftPx,wickTopPx,wickPx,wickHPx\)/);
  assert.match(engine, /q\.fillRect\(bodyLeftPx,bodyTopPx,bodyPx,bodyHPx\)/);
});
