import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translateHookChartPhrase } from '../src/locales/hookchartLanguage';
import {
  drawingTextHitDistance, rayEndPoint, translateDrawingPoints,
  type DrawingGeometry,
} from '../src/components/hookchart/drawingManipulation';

const g: DrawingGeometry = {
  plotH: 200,
  x: t => t / 1000,
  y: price => 200 - price,
  p: y => 200 - y,
  timeAtX: x => x * 1000,
};

test('rays extend from first point in the direction of second, including left and vertical', () => {
  assert.deepEqual(rayEndPoint(20, 100, 30, 110, 200, 160), { x: 200, y: 280 });
  assert.deepEqual(rayEndPoint(80, 100, 60, 110, 200, 160), { x: 0, y: 140 });
  assert.deepEqual(rayEndPoint(30, 45, 30, 60, 200, 160), { x: 30, y: 160 });
  assert.deepEqual(rayEndPoint(30, 60, 30, 45, 200, 160), { x: 30, y: 0 });
});

test('text selection covers the actual label area rather than only its anchor', () => {
  assert.equal(drawingTextHitDistance(45, 93, 20, 100, 'BTC breakout'), 0);
  assert.equal(drawingTextHitDistance(20, 100, 20, 100, 'BTC breakout'), 0);
  assert.ok(drawingTextHitDistance(180, 100, 20, 100, 'BTC breakout') > 9);
  assert.ok(drawingTextHitDistance(45, 65, 20, 100, 'BTC breakout') > 9);
});

test('translating a shape across the viewport preserves dimensions even off-screen', () => {
  const anchors = [{ t: 10_000, p: 180 }, { t: 50_000, p: 155 }];
  const translated = translateDrawingPoints(anchors, { x: 10, y: 50 }, { x: 30, y: -30 }, g);
  assert.equal(translated[0].t - anchors[0].t, 20_000);
  assert.equal(translated[1].t - anchors[1].t, 20_000);
  assert.equal(translated[0].p - translated[1].p, anchors[0].p - anchors[1].p);
  assert.equal(translated[0].p, 260, 'an anchor may move above the canvas without flattening the shape');
});

test('chart scope changes clear an unfinished two-click drawing', () => {
  const src = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  assert.match(src, /useLayoutEffect\(\(\)=>\{resetInteraction\(\);setDraft\(null\);[\s\S]*?\},\[symbol,tf,tool,interactionScope\]\)/);
});

test('rectangles and rays have proper scene and draft-preview branches', () => {
  const src = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  assert.match(src, /if\(d\.type==='rect'\)\{[\s\S]*?q\.strokeRect\(x1,y1,x2-x1,y2-y1\);[\s\S]*?\}else\{\s*const end=d\.type==='ray'\?rayEndPoint/);
  assert.match(src, /tool==='ray'\|\|tool==='rect'\)\&\&draft\&\&mouse/);
  assert.match(src, /if\(tool==='rect'\)q\.strokeRect\(x1,y1,x2-x1,y2-y1\)/);
});

test('switching between Binance, Bybit, futures and spot resets editing state', () => {
  const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  const parent = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  assert.match(parent, /interactionScope=\{scope\}/);
  assert.match(engine, /const key=\x60\$\{interactionScope\|\|symbol\}:\$\{tf\}:\$\{oldestTime\}\x60/);
  assert.match(engine, /useLayoutEffect\(\(\)=>\{resetInteraction\(\);setDraft\(null\);/);
});

test('pending jump-to-date requests cannot focus a different exchange or coin', () => {
  const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  assert.match(engine, /useLayoutEffect\(\(\)=>\{jumpVersion\.current\+\+;setPendingJump\(null\);setJumpBusy\(false\)/);
  assert.match(engine, /\[symbol,tf,interactionScope\]\)/);
  assert.match(engine, /const requestJump=async\([\s\S]*?const version=\+\+jumpVersion\.current/);
  assert.match(engine, /if\(version!==jumpVersion\.current\)return/);
});

test('drawing actions render localized labels for all four UI languages', () => {
  const label = 'Видалити сигнальний рівень';
  assert.equal(translateHookChartPhrase('uk', label), label);
  assert.equal(translateHookChartPhrase('en', label), 'Delete price alert');
  assert.equal(translateHookChartPhrase('ru', label), 'Удалить сигнальный уровень');
  assert.equal(translateHookChartPhrase('pl', label), 'Usuń poziom alertu');
  const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  assert.match(engine, /aria-label=\{translateHookChartPhrase\(language,'Редагувати інструмент'\)\}/);
  assert.match(engine, /aria-label=\{translateHookChartPhrase\(language,'Дії з сигнальним рівнем'\)\}/);
});
