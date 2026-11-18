import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { TerminalRenderBoundary } from '../src/components/terminal/TerminalRenderBoundary';

const source = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('single chart, multi-chart widget, and full Terminal route isolate React render failures', () => {
  const page = source('src/components/TerminalPage.tsx');
  const widget = source('src/components/terminal/TerminalChartWidget.tsx');
  const app = source('src/App.tsx');
  const boundary = source('src/components/terminal/TerminalRenderBoundary.tsx');

  assert.match(page, /<TerminalRenderBoundary variant="chart" resetKey=/);
  assert.match(widget, /<TerminalRenderBoundary variant="chart" resetKey=/);
  assert.match(app, /<TerminalRenderBoundary variant="workspace"/);
  assert.match(widget, /resetKey=\{\x60\$\{block\.exchange\}:\$\{block\.marketType\}:\$\{block\.symbol\}:\$\{block\.timeframe\}\x60\}/);
  assert.match(boundary, /static getDerivedStateFromError/);
  assert.match(boundary, /componentDidCatch/);
  assert.match(boundary, /componentWillUnmount/);
  assert.match(boundary, /setTimeout\(\(\) =>/);
  assert.doesNotMatch(boundary, /WebSocket|fetch\(|localStorage|updateProfileData|window\.location\.reload/);
});

test('a crashing Terminal chart stays inside its own recovery UI and a retry can restore it', async () => {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'https://h00k.top/' });
  const previous = {
    window: (globalThis as any).window,
    document: (globalThis as any).document,
    flag: (globalThis as any).IS_REACT_ACT_ENVIRONMENT,
  };
  const oldError = console.error;
  (globalThis as any).window = dom.window;
  (globalThis as any).document = dom.window.document;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  console.error = () => {}; // An intentional throw must not pollute CI logs.
  const root = createRoot(dom.window.document.querySelector('#root')!);

  const Crash = ({ fail }: { fail: boolean }) => {
    if (fail) throw new Error('simulated HookChart render failure');
    return React.createElement('div', { 'data-restored-chart': true }, 'Live chart');
  };
  const view = (fail: boolean) => React.createElement(TerminalRenderBoundary,
    { variant: 'chart' as const, resetKey: 'binance:futures:BTCUSDT:5m',
      children: React.createElement(Crash, { fail }) });
  try {
    await act(async () => { root.render(view(true)); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 120)); });
    assert.ok(dom.window.document.querySelector('[data-terminal-chart-recovery]'));
    assert.equal(dom.window.document.querySelector('[data-terminal-workspace-recovery]'), null);
    const restore = dom.window.document.querySelector('[data-terminal-chart-recovery] button') as HTMLButtonElement;
    await act(async () => { root.render(view(false)); });
    await act(async () => {
      restore.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    assert.equal(dom.window.document.querySelector('[data-terminal-chart-recovery]'), null);
    assert.ok(dom.window.document.querySelector('[data-restored-chart]'));
  } finally {
    await act(async () => { root.unmount(); });
    console.error = oldError;
    (globalThis as any).window = previous.window;
    (globalThis as any).document = previous.document;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = previous.flag;
    dom.window.close();
  }
});
