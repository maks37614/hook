import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');

test('captured HookChart drags reuse bounds rather than forcing layout for every pointermove', () => {
  assert.match(engine, /const activePointerRect=useRef<DOMRect\|null>\(null\)/);
  assert.match(engine, /const captured=pointers\.current\.has\(e\.pointerId\)/);
  assert.match(engine, /captured\?activePointerRect\.current:null/);
  assert.match(engine, /if\(captured&&!activePointerRect\.current\)activePointerRect\.current=r/);
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

test('Terminal pan and pinch coalesce pointer-driven viewport commits to one display frame',()=>{
  assert.match(engine,/const pendingTerminalPointerGesture=useRef/);
  assert.match(engine,/const terminalPointerGestureFrame=useRef/);
  assert.match(engine,/pendingTerminalPointerGesture\.current=\{update,kind\}/);
  assert.match(engine,/if\(terminalPointerGestureFrame\.current!==null\)return/);
  assert.match(engine,/terminalPointerGestureFrame\.current=window\.requestAnimationFrame\(/);
  assert.match(engine,/if\(pending\)setGestureVp\(pending\.update,pending\.kind\)/);
  assert.match(engine,/const gestureUpdate=\(update:React\.SetStateAction<Viewport>\)=>schedulePointerGestureVp\(/);
  assert.match(engine,/const handlePointerUp=\(e:React\.PointerEvent<HTMLElement>\)=>\{[\s\S]{0,150}flushTerminalPointerGesture\(\)/);
  assert.match(engine,/const handleWheel=\(e:WheelEvent\)=>\{\s*flushTerminalPointerGesture\(\)/);
  assert.match(engine,/if\(!terminalMode\)\{setGestureVp\(update,kind\);return\}/,
    'standalone HookChart, Replay and fullscreen must retain their original gestures');
  assert.match(engine,/\[fitAllScopeKey\]\);/,
    'a replaced coin must cancel any pending gesture');
});
