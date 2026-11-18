import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('HookChart keeps the candle body and wick rasterization from h00k-main archive', () => {
  const source = readSource('src/components/hookchart/engine.tsx');
  // Reference: user-supplied h00k-main(2).zip, engine.tsx.
  // This region is deliberately limited to candle rasterization, not the full renderer.
  const first = source.indexOf('const denseBars=');
  const marker = 'q.restore();';
  const last = source.indexOf(marker, first);
  assert.ok(first >= 0 && last > first, 'candle drawing region must exist');
  const actual = source.slice(first, last + marker.length);
  assert.equal(
    createHash('sha256').update(actual, 'utf8').digest('hex'),
    '65e30dd533494ca6c8ea70a713f5f77d9f60d20f931280dca6392c62061b7dbe',
    'body width, wick width, per-pixel rounding and dense-bar rendering must match the archive',
  );
});

test('HookChart keeps the original archive palette and allows users to restore it', () => {
  const engine = readSource('src/components/hookchart/engine.tsx');
  const settings = readSource('src/components/hookchart/OriginalHookChartSettings.tsx');
  const canvas = readSource('src/components/hookchart/HookChartCanvas.tsx');
  assert.ok(engine.includes("candleLongColor='#0ECB81',candleShortColor='#F6465D'"));
  assert.ok(settings.includes("candleLongColor: '#0ECB81',"));
  assert.ok(settings.includes("candleShortColor: '#F6465D',"));
  assert.ok(settings.includes("candleLongColor: '#0ECB81', candleShortColor: '#F6465D'"));
  assert.ok(settings.includes('>h00k Classic</button>'));
  assert.ok(canvas.includes("runtimeSettings.candleLongColor || '#0ECB81'"));
  assert.ok(canvas.includes("runtimeSettings.candleShortColor || '#F6465D'"));
});

test('main and interaction Canvas honor configured DPR cap, defaulting to the original DPR4 quality', () => {
  const engine = readSource('src/components/hookchart/engine.tsx');
  const dpr = readSource('src/components/hookchart/canvasDpr.ts');
  assert.ok(dpr.includes('DEFAULT_MAX_CANVAS_DPR = 4'));
  assert.equal((engine.match(/effectiveCanvasDpr\(window\.devicePixelRatio,maxCanvasDpr\)/g) || []).length, 2);
  assert.ok(engine.includes('maxCanvasDpr=DEFAULT_MAX_CANVAS_DPR'));
  assert.equal(engine.includes('TERMINAL_CANVAS_DPR_CAP'), false);
  assert.equal(engine.includes("get('terminalDpr')"), false);
  assert.ok(engine.includes('q.imageSmoothingEnabled=false'));
});

test('Canvas CSS preserves sharp pixels and unfiltered saturated candle colors', () => {
  const css = readSource('src/components/hookchart/hookchart.css');
  assert.match(css, /image-rendering:crisp-edges/);
  assert.match(css, /filter:none!important;opacity:1!important;transform:none!important/);
});
