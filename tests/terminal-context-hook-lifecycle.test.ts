import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import type { TerminalChartBlock } from '../src/types';
import { useTerminalLiveAlerts } from '../src/utils/useTerminalLiveAlerts';
import { terminalNoticeChart } from '../src/utils/terminalAnalysis/model';

const block = (symbol: string, id: string, timeframe: TerminalChartBlock['timeframe']): TerminalChartBlock => ({
  id, symbol, timeframe, exchange: 'binance', marketType: 'futures', baseAsset: symbol.slice(0, -4), quoteAsset: 'USDT',
});

test('the mounted React hook retains live feeds across chart edits and releases them on account change or disable', async t => {
  const dom = new JSDOM('<main id="root"></main>', { pretendToBeVisual: true });
  const workers: Array<{ terminated: boolean }> = [];
  const sockets: Array<{ url: string; closed: boolean }> = [];
  const history: string[] = [];
  const globals = {
    document: dom.window.document, window: dom.window, IS_REACT_ACT_ENVIRONMENT: true,
    Worker: class {
      terminated = false;
      constructor() { workers.push(this); }
      postMessage() {}
      terminate() { this.terminated = true; }
    },
    WebSocket: class {
      closed = false;
      constructor(readonly url: string) { sockets.push(this); }
      close() { this.closed = true; }
    },
    fetch: async (url: string) => {
      const params = new URL(url, 'https://terminal.example').searchParams;
      const tf = params.get('timeframe')!;
      history.push(params.get('symbol') + ':' + tf);
      const seconds = tf === '1m' ? 60 : 300;
      const last = Math.floor(Date.now() / 1000 / seconds) * seconds;
      const data = Array.from({ length: 40 }, (_, i) => ({
        time: last - (39 - i) * seconds, open: 100, high: 102, low: 99, close: 101, volume: 100,
      }));
      return Response.json({ success: true, data });
    },
  };
  const restore = Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const root = createRoot(dom.window.document.querySelector('main')!);
  t.after(async () => {
    try { await act(async () => root.unmount()); } finally {
      dom.window.close();
      for (const [key, descriptor] of restore) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
  function Terminal({ blocks, owner, limit }: { blocks: TerminalChartBlock[]; owner: string; limit: number }) {
    useTerminalLiveAlerts(true, blocks, () => {}, {
      configuredLimit: limit, owner, onError: () => assert.fail('unexpected monitor failure'), onHide() {},
    });
    return null;
  }
  const render = (blocks: TerminalChartBlock[], owner = 'one', limit = 10) =>
    act(async () => root.render(React.createElement(Terminal, { blocks, owner, limit })));
  const btc = block('BTCUSDT', 'b', '5m'), eth = block('ETHUSDT', 'e', '5m');
  await render([btc, eth]);
  assert.deepEqual(history, ['BTCUSDT:5m', 'ETHUSDT:5m']);
  const btcSocket = sockets.find(s => s.url.includes('btcusdt'))!;
  const sol = block('SOLUSDT', 's', '5m');
  await render([sol, { ...btc, timeframe: '15m' }], 'one', 6);
  assert.equal(workers.length, 1);
  assert.deepEqual(history, ['BTCUSDT:5m', 'ETHUSDT:5m', 'SOLUSDT:5m']);
  assert.equal(btcSocket.closed, false);
  assert.equal(sockets.filter(s => !s.closed).length, 2);
  await render([{ ...btc, timeframe: '1m' }, sol]);
  assert.equal(history.at(-1), 'BTCUSDT:1m');
  assert.equal(sockets.filter(s => !s.closed).length, 3);
  await render([btc, sol], 'two');
  assert.equal(workers.length, 2);
  assert.equal(workers[0].terminated, true);
  assert.equal(btcSocket.closed, true);
  assert.equal(sockets.filter(s => !s.closed).length, 2);
  await render([btc], 'two', 12);
  assert.ok(workers.every(w => w.terminated));
  assert.ok(sockets.every(s => s.closed));
});

test('a notice opens a chart for its exchange, market and trigger timeframe even after its old panel is reused', () => {
  const btc = block('BTCUSDT', 'original', '15m');
  const five = block('BTCUSDT', 'structure', '5m'), one = block('BTCUSDT', 'trigger', '1m');
  const bybit = { ...one, id: 'bybit', exchange: 'bybit' as const };
  const spot = { ...one, id: 'spot', marketType: 'spot' as const };
  const scope = 'binance:futures:BTCUSDT';
  const notice = { triggerTf: '1m', structureTf: '5m', blockId: btc.id } as const;
  assert.equal(terminalNoticeChart([btc, bybit, spot, five, one], scope, notice)?.id, one.id);
  assert.equal(terminalNoticeChart([bybit, spot, five, { ...btc, symbol: 'ETHUSDT' }], scope, notice)?.id, five.id);
  assert.equal(terminalNoticeChart([spot, bybit], scope, notice), undefined);
});


test('analysis OFF and ON keep Terminal mounted even if a browser WebSocket throws while closing', async t => {
  const dom = new JSDOM('<main id="root"></main>', {
    url: 'https://h00k.top/', pretendToBeVisual: true,
  });
  const sockets: Array<{ closed: boolean }> = [];
  const workers: Array<{ terminated: boolean }> = [];
  const globals = {
    document: dom.window.document, window: dom.window, IS_REACT_ACT_ENVIRONMENT: true,
    Worker: class {
      terminated = false;
      constructor() { workers.push(this); }
      postMessage() {}
      terminate() { this.terminated = true; }
    },
    WebSocket: class {
      closed = false;
      constructor(_url: string) { sockets.push(this); }
      close() {
        this.closed = true;
        throw new Error('simulated native WebSocket.close failure');
      }
    },
    fetch: async () => Response.json({ success: true, data: [] }),
  };
  const restore = Object.keys(globals).map(key =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const root = createRoot(dom.window.document.querySelector('main')!);
  t.after(async () => {
    try { await act(async () => root.unmount()); } finally {
      dom.window.close();
      for (const [key, descriptor] of restore) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
  const charts = [block('BTCUSDT', 'btc-chart', '5m'), block('ETHUSDT', 'eth-chart', '5m')];
  function Terminal({ enabled }: { enabled: boolean }) {
    useTerminalLiveAlerts(enabled, charts, () => {}, {
      configuredLimit: 10, owner: 'current-user',
      onError: () => assert.fail('analysis cleanup must not report an active analysis error'),
      onHide() {},
    });
    return React.createElement('div', { 'data-terminal-alive': true }, enabled ? 'ON' : 'OFF');
  }
  const render = (enabled: boolean) =>
    act(async () => root.render(React.createElement(Terminal, { enabled })));
  await render(true);
  assert.equal(workers.length, 1);
  assert.equal(sockets.length, 2);
  await render(false);
  assert.equal(dom.window.document.querySelector('[data-terminal-alive]')?.textContent, 'OFF');
  assert.ok(sockets.every(socket => socket.closed), 'all analysis streams attempted to close');
  assert.ok(workers.every(worker => worker.terminated), 'analysis Worker is terminated');
  await render(true);
  assert.equal(workers.length, 2, 're-enable starts one fresh Worker');
  assert.equal(sockets.length, 4, 're-enable restores both public candle subscriptions');
  await render(false);
  assert.equal(dom.window.document.querySelector('[data-terminal-alive]')?.textContent, 'OFF');
  assert.ok(workers.every(worker => worker.terminated));
  assert.ok(sockets.every(socket => socket.closed));
});
