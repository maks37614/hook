import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';

type Range = { from: number; to: number };
type TestSeries = { data: unknown[]; lines: unknown[]; options: { priceFormat?: { precision: number; minMove: number } } };
type TestChart = { container: HTMLElement; removed: boolean; range: Range; series: TestSeries[]; crosshair: (event: unknown) => void };
const fixture = { charts: [] as TestChart[], provider: 'tradingview' };

// Render the real component and its DOM/portal lifecycle. Replace only the
// external canvas renderer and account/provider dependencies with fixtures.
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/replay/ReplayChart.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{ name: 'replay-fixtures', setup(builder) {
    builder.onResolve({ filter: /^(\.\.\/HookChart|\.\.\/\.\.\/utils\/useChartProvider|lightweight-charts)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
      if (args.path.includes('useChartProvider')) return { contents: 'export const useChartProvider = () => globalThis.__replayFixture.provider;' };
      if (args.path.includes('HookChart')) return { contents: 'export const HookChart = () => null;' };
      return { contents: `
        export const LineStyle={Solid:0,Dotted:1,Dashed:2},CrosshairMode={Normal:1},CandlestickSeries={},HistogramSeries={};
        export function createChart(container) {
          const canvas=document.createElement('canvas');container.append(canvas);
          const entry={container,removed:false,range:{from:0,to:80},series:[],crosshair(){}};
          globalThis.__replayFixture.charts.push(entry);
          const scale={setVisibleLogicalRange(r){entry.range={...r}},fitContent(){},getVisibleLogicalRange(){return entry.range}};
          return {addSeries(_type,options){
            const s={data:[],lines:[],options};entry.series.push(s);
            return {setData(data){s.data=data},applyOptions(patch){s.options={...s.options,...patch}},createPriceLine(line){s.lines.push(line);return line},removePriceLine(line){s.lines=s.lines.filter(x=>x!==line)}};
          },priceScale(){return {applyOptions(){}}},timeScale(){return scale},subscribeCrosshairMove(fn){entry.crosshair=fn},
          resize(){},remove(){entry.removed=true;canvas.remove()},takeScreenshot(){return canvas}};
        }
      ` };
    });
  } }],
});
const compiled = { exports: {} as { ReplayChart: React.ComponentType<any> } };
new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
const ReplayChart = compiled.exports.ReplayChart;

async function mount(t: test.TestContext, native = false) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dom = new JSDOM('<!doctype html><body><main id="fixture-root"></main></body>', { url: 'http://localhost' });
  const globals = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    ResizeObserver: class { observe() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true, __replayFixture: fixture };
  const original = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  fixture.charts = []; fixture.provider = 'tradingview';
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  if (native) {
    let fullscreen: HTMLElement | null = null;
    Object.defineProperty(dom.window.document, 'fullscreenElement', { get: () => fullscreen });
    Object.defineProperty(dom.window.HTMLElement.prototype, 'requestFullscreen', { value: async function () { fullscreen = this; } });
    Object.defineProperty(dom.window.document, 'exitFullscreen', { value: async () => { fullscreen = null; } });
  }
  const root = createRoot(dom.window.document.getElementById('fixture-root')!);
  const props = {
    visibleCandles: [{ time: 1794264600, open: 1, high: 2, low: 1, close: 2, volume: 10 }],
    symbol: 'BTCUSDT', timeframe: '5m', onTimeframeChange() {}, playbackSpeed: 1, onSpeedChange() {},
    isPlaying: false, canAdvance: true, onTogglePlay() {}, onStepForward() {}, onRandomHistoricalDate() {},
    exchange: 'binance', marketType: 'futures', position: { side: 'long', entryPrice: 2, slPrice: 1, tpPrice: 3 },
    pendingOrders: [{ id: 'pending', price: 1.5, orderType: 'limit', side: 'long' }], isReplaying: true,
  };
  t.after(async () => {
    try {
      await act(async () => root.unmount());
      assert.ok(fixture.charts.every(chart => chart.removed));
    } finally {
      dom.window.close();
      for (const [key, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
  const render = async (changes = {}) => { await act(async () => root.render(React.createElement(ReplayChart, { ...props, ...changes }))); };
  const click = async (label: string) => { await act(async () => { (dom.window.document.querySelector(`[aria-label="${label}"]`) as HTMLElement).click(); }); };
  await render();
  // Complete the intentional initial auto-focus before simulating user zoom.
  await act(async () => t.mock.timers.tick(80));
  return { document: dom.window.document, render, click, props };
}

test('Replay recreates its canvas, data and trade lines when a fullscreen portal replaces the container', async t => {
  const page = await mount(t);
  const visibleCanvas = () => page.document.querySelector('[data-chart-provider="tradingview"] canvas');
  assert.ok(visibleCanvas());
  fixture.charts[0].range = { from: -30, to: 20 };
  for (const label of ['Розгорнути графік на весь екран', 'Вийти з повного екрана']) {
    const previous = fixture.charts.at(-1)!;
    await page.click(label);
    const current = fixture.charts.at(-1)!;
    assert.notEqual(current.container, previous.container);
    assert.equal(previous.removed, true);
    assert.ok(current.container.isConnected && visibleCanvas());
    assert.equal(current.series[0].data.length, 1);
    assert.equal(current.series[0].lines.length, 4, 'Entry, SL, TP and pending order survive remount');
    assert.deepEqual(current.range, { from: -30, to: 20 });
  }
});

test('Replay crosshair leave restores the latest candle after playback or date changes', async t => {
  const page = await mount(t);
  await page.render({ visibleCandles: [{ time: 1794264900, open: 20, high: 30, low: 20, close: 30, volume: 10 }] });
  await act(async () => fixture.charts.at(-1)!.crosshair({}));
  const header = page.document.querySelector('[aria-label="Ціни відкриття, максимуму, мінімуму й закриття свічки"]')!.textContent!;
  assert.match(header, /O: 20\.00/);
  assert.match(header, /C: 30\.00/);
});

test('native fullscreen keeps the existing Replay renderer and canvas', async t => {
  const page = await mount(t, true);
  const initial = fixture.charts.at(-1)!;
  await page.click('Розгорнути графік на весь екран');
  await page.click('Вийти з повного екрана');
  assert.equal(fixture.charts.length, 1);
  assert.equal(initial.removed, false);
  assert.ok(initial.container.isConnected && initial.container.querySelector('canvas'));
});

test('history arriving after an instrument change applies the new price precision', async t => {
  const page = await mount(t);
  await page.render({ symbol: 'MICROUSDT', visibleCandles: [], position: null, pendingOrders: [] });
  await page.render({ symbol: 'MICROUSDT', position: null, pendingOrders: [],
    visibleCandles: [{ time: 1794264900, open: 0.0000001, high: 0.00000012, low: 0.0000001, close: 0.00000012, volume: 10 }],
  });
  const current = fixture.charts.at(-1)!;
  assert.equal(fixture.charts.length, 2);
  assert.equal(current.series[0].data.length, 1);
  assert.ok(current.series[0].options.priceFormat!.precision >= 8);
  assert.ok(current.series[0].options.priceFormat!.minMove < 0.0000001);
});
