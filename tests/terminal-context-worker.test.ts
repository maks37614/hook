import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

test('the bundled worker entry runs off-thread and delivers a current result through its real protocol', async () => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/utils/terminalAnalysis/terminalContext.worker.ts', import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'neutral' });
  const moduleUrl = 'data:text/javascript,' + encodeURIComponent(bundle.outputFiles[0].text);
  const wrapper = `import { parentPort } from 'node:worker_threads';
    globalThis.self = { postMessage: value => parentPort.postMessage(value) };
    await import(${JSON.stringify(moduleUrl)});
    parentPort.on('message', data => self.onmessage({ data }));`;
  const worker = new Worker(new URL('data:text/javascript,' + encodeURIComponent(wrapper)), { execArgv: [] });
  const base = 1_800_000_000;
  const bar = (i: number, close = 105 + Math.sin(i * Math.PI / 5) * 2) => ({ time: base + i * 300,
    open: close, close, high: close + .5, low: close - .5, volume: 100 });
  const rows = Array.from({ length: 69 }, (_, i) => bar(i));
  rows[8].high = 120; rows[50] = { ...bar(50, 102), low: 100 };
  const live = { ...bar(69, 100.15), high: 100.6, low: 100 }, at = (live.time + 5) * 1000;
  try {
    const received = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker did not reply')), 5000);
      worker.once('error', error => { clearTimeout(timeout); reject(error); });
      worker.once('message', value => { clearTimeout(timeout); resolve(value); });
    });
    worker.postMessage({ type: 'seed', scope: 'binance:futures:BTCUSDT', tf: '5m', rows, at: at - 1 });
    worker.postMessage({ type: 'update', requestId: 42, scope: 'binance:futures:BTCUSDT', candles: { '5m': live },
      evidence: { manualLevels: [], densityEnabled: false, densities: [], oi: [] }, at });
    const result = await received;
    assert.equal(result.scope, 'binance:futures:BTCUSDT');
    assert.equal(result.requestId, 42);
    assert.equal(result.notices[0]?.scenario, 'z5_level');
    assert.equal(result.notices[0]?.returnMinutes, 95);
    assert.equal(result.notices[0]?.stage, 'watch');
  } finally { await worker.terminate(); }
});
