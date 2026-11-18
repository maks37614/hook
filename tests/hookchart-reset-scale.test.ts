import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { latestCandleResetViewport } from '../src/components/hookchart/resetViewport';

test('reset follows saved candle count and right gap, never a hardcoded candle width', () => {
  const mobile = latestCandleResetViewport(315, 500, 65, 10);
  const desktop = latestCandleResetViewport(1000, 500, 110, 12);
  assert.ok(Math.abs(mobile.barWidth - 315 / 75) < 1e-9);
  assert.ok(Math.abs(desktop.barWidth - 1000 / 122) < 1e-9);
  assert.equal(mobile.rightOffset, 0);
  assert.equal(mobile.autoY, true);
  assert.equal(mobile.manualCenter, null);
  assert.equal(mobile.manualRange, null);
  assert.equal(mobile.yZoom, 1);
  assert.equal(mobile.candleFit, true);
  assert.equal(mobile.fitAll, false);
});

test('reset fits limited candle history and keeps the same right-side gap', () => {
  const limited = latestCandleResetViewport(420, 18, 110, 12);
  assert.equal(limited.barWidth, 14);
  const empty = latestCandleResetViewport(420, 0, 65, 10);
  assert.equal(empty.barWidth, 5.6);
});

test('reset protects against invalid widths and does not modify draw/feed state', () => {
  const v = latestCandleResetViewport(Number.NaN, 100, NaN, -100);
  assert.ok(v.barWidth >= .12 && Number.isFinite(v.barWidth));
  assert.equal(v.rightOffset, 0);
  assert.deepEqual(Object.keys(v).sort(), ['autoY','barWidth','candleFit','fitAll','manualCenter','manualRange','rightOffset','yZoom'].sort());
});

test('HookChart candle-fit reset excludes distant overlay levels from automatic Y scale', () => {
  const engine = readFileSync(new URL('../src/components/hookchart/engine.tsx', import.meta.url), 'utf8');
  assert.match(engine, /const candleAutoScale=\(terminalAutoScale&&!manualPriceAxisOverride\.current\)\s*\|\|\(formationAutoScale&&vp\.autoY\)\|\|\(vp\.autoY&&vp\.candleFit===true\)/);
  assert.match(engine, /if\(!candleAutoScale&&vp\.autoY&&candles\.length&&densities\.length\)/);
  assert.match(engine, /if\(candleAutoScale\)\{/);
  assert.match(engine, /const reset=\(\)=>\{[\s\S]*?latestCandleResetViewport\(/);
  assert.match(engine, /terminalCandlePriceRange\(lo,hi,plotH,showVolumes\)/);
});
