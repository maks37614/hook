import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Formations quick charts use candle-only Terminal range without changing Terminal behavior', () => {
  const card = source('../src/components/FormationCard.tsx');
  const wrapper = source('../src/components/TradingViewChart.tsx');
  const canvas = source('../src/components/hookchart/HookChartCanvas.tsx');
  const engine = source('../src/components/hookchart/engine.tsx');

  assert.match(card, /visualContext="formationsQuick"/);
  assert.match(wrapper, /visualContext=\{visualContext\}/);
  assert.match(canvas, /formationAutoScale=\{visualContext === 'formationsQuick' && !terminalMode && !replay\}/);
  assert.match(canvas, /terminalAutoScale=\{terminalAutoScale\}/);
  assert.match(engine, /const candleAutoScale=\(terminalAutoScale&&!manualPriceAxisOverride\.current\)/);
  assert.match(engine, /\|\|\(formationAutoScale&&vp\.autoY\)\|\|\(vp\.autoY&&vp\.candleFit===true\)/);
  assert.match(engine, /if\(candleAutoScale\)\{/);
  assert.match(engine, /terminalCandlePriceRange\(lo,hi,plotH,showVolumes\)/);
  assert.match(engine, /if\(!candleAutoScale&&vp\.autoY&&candles\.length&&densities\.length\)/);
});

test('Formations scale drawer only changes its own visibility and floats without reflow', () => {
  const engine = source('../src/components/hookchart/engine.tsx');
  const canvas = source('../src/components/hookchart/HookChartCanvas.tsx');
  const css = source('../src/components/hookchart/integration.css');
  assert.match(engine, /onClick=\{\(\)=>setZoomPanelOpen\(v=>!v\)\}/);
  assert.match(canvas, /hookchart-formations-quick/);
  assert.match(css, /hookchart-root\.hookchart-formations-quick \.hookchart-footer-controls\{[\s\S]*?position:absolute/);
  assert.match(css, /hookchart-root\.hookchart-formations-quick \.chartScaleDock \.scaleTools\{[\s\S]*?position:absolute/);
  assert.match(engine, /const reset=\(\)=>\{[\s\S]*?formationAutoScale\?/);
  assert.match(engine, /const fitAllHistory=\(\)=>\{[\s\S]*?fitAll:true/);
});
