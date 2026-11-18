import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';
import { Num, LiquidationMinimum } from '../src/components/hookchart/OriginalHookChartSettings';

const styles = readFileSync(new URL('../src/components/hookchart/integration.css', import.meta.url), 'utf8');

test('HookChart number inputs have no native spinner arrows, on desktop or mobile', () => {
  const source = readFileSync(new URL('../src/components/hookchart/OriginalHookChartSettings.tsx', import.meta.url), 'utf8');
  const num = source.slice(source.indexOf('export function LiquidationMinimum('), source.indexOf('function Choice('));
  assert.match(num, /type="text" inputMode="decimal"/);
  assert.doesNotMatch(num, /type="number"/);
  assert.match(styles, /input\.numInput\[type="number"\]::-webkit-inner-spin-button/);
  assert.match(styles, /input\.numInput\[type="number"\]::-webkit-outer-spin-button/);
  assert.match(styles, /-moz-appearance:textfield/);
});

test('editing zero, decimal fractions, and automatic empty thresholds works in real React inputs', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  const previous = {
    window: (globalThis as any).window,
    document: (globalThis as any).document,
    HTMLElement: (globalThis as any).HTMLElement,
    Node: (globalThis as any).Node,
    Event: (globalThis as any).Event,
    IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const input = () => dom.window.document.querySelector('input.numInput') as HTMLInputElement;
  const nativeSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
  const type = async (value: string) => {
    await act(async () => {
      nativeSetter.call(input(), value);
      input().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };
  const focus = async () => { await act(async () => { input().focus(); }); };
  const blur = async () => { await act(async () => { input().blur(); }); };
  try {
    const updates: number[] = [];
    function ZeroInput() {
      const [value, setValue] = useState(0);
      return React.createElement(Num, {
        value, min: 0, max: 100,
        set: (next: number) => { updates.push(next); setValue(next); },
      });
    }
    await act(async () => { root.render(React.createElement(ZeroInput)); });
    assert.equal(input().type, 'text');
    assert.equal(input().inputMode, 'decimal');
    assert.equal(input().value, '0');
    await focus();
    await type('');
    assert.equal(input().value, '', 'zero can be fully erased before entering a new value');
    assert.deepEqual(updates, [], 'an intermediate empty draft must not save zero');
    await type('25');
    assert.equal(input().value, '25');
    await blur();
    assert.equal(input().value, '25');
    assert.deepEqual(updates, [25]);
    await focus();
    await type('');
    await blur();
    assert.equal(input().value, '25', 'empty required input cancels edit instead of corrupting saved value');

    const decimalUpdates: number[] = [];
    function DecimalInput() {
      const [value, setValue] = useState(0.18);
      return React.createElement(Num, {
        value, min: 0.01, max: 3, step: 0.01,
        set: (next: number) => { decimalUpdates.push(next); setValue(next); },
      });
    }
    await act(async () => { root.render(React.createElement(DecimalInput)); });
    await focus();
    await type('');
    await type('0,35');
    assert.equal(input().value, '0,35', 'decimal comma stays intact while editing');
    await blur();
    assert.equal(input().value, '0.35');
    assert.deepEqual(decimalUpdates, [0.35]);
    await focus();
    await type('5');
    await blur();
    assert.equal(input().value, '3', 'range maximum is applied only on commit');

    const thresholdUpdates: Array<number | null> = [];
    function ThresholdInput() {
      const [value, setValue] = useState<number | null>(0);
      return React.createElement(LiquidationMinimum, {
        value, onChange: (next: number | null) => { thresholdUpdates.push(next); setValue(next); },
      });
    }
    await act(async () => { root.render(React.createElement(ThresholdInput)); });
    assert.equal(input().value, '0');
    await focus();
    await type('');
    assert.equal(input().value, '', 'liquidation zero can be erased without auto-restoring');
    await blur();
    assert.equal(input().value, '', 'empty liquidation threshold remains Auto');
    assert.deepEqual(thresholdUpdates, [null]);
    await focus();
    await type('2500');
    await blur();
    assert.equal(input().value, '2500');
    assert.deepEqual(thresholdUpdates, [null, 2500]);
  } finally {
    await act(async () => { root.unmount(); });
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});
