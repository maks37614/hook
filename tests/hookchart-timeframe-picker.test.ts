import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { HookChartTimeframePicker, timeframeMenuPosition } from '../src/components/hookchart/HookChartTimeframePicker';

test('custom timeframe picker uses buttons, not a native iOS select popup', () => {
  const html = renderToStaticMarkup(React.createElement(HookChartTimeframePicker, {
    timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
    timeframe: '1h',
    onChange: () => {},
  }));
  assert.match(html, /hookchart-timeframes-compact/);
  assert.match(html, /aria-haspopup="listbox"/);
  assert.match(html, /aria-label="Вибрати таймфрейм"/);
  assert.match(html, /aria-pressed="true"/);
  assert.doesNotMatch(html, /<select|<option/);
});

test('collapsed tools show only the primary timeframe buttons and reserve the chevron for tools', () => {
  const html = renderToStaticMarkup(React.createElement(HookChartTimeframePicker, {
    timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
    timeframe: '15m',
    compactAvailable: false,
    onChange: () => {},
  }));
  assert.match(html, /hookchart-timeframes-buttons/);
  assert.match(html, /aria-label="Таймфрейм 15m"/);
  assert.doesNotMatch(html, /hookchart-timeframes-compact/);
  assert.doesNotMatch(html, /aria-label="Вибрати таймфрейм"/);
});

test('expanded tools may reveal their own compact timeframe menu', () => {
  const html = renderToStaticMarkup(React.createElement(HookChartTimeframePicker, {
    timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
    timeframe: '15m',
    compactAvailable: true,
    onChange: () => {},
  }));
  assert.match(html, /hookchart-timeframes-compact/);
  assert.match(html, /aria-label="Вибрати таймфрейм"/);
  assert.match(html, /aria-haspopup="listbox"/);
});

test('timeframe popover stays within a phone viewport at top, middle and bottom', () => {
  const viewport = {left: 0, top: 0, width: 390, height: 700};
  for (const top of [12, 180, 390, 660]) {
    const anchor = {left: 32, top, bottom: top + 25, width: 59};
    const menu = timeframeMenuPosition(anchor, viewport, 6);
    assert.ok(menu.left >= 8, JSON.stringify(menu));
    assert.ok(menu.left + menu.width <= 382, JSON.stringify(menu));
    assert.ok(menu.top >= 8, JSON.stringify(menu));
    assert.ok(menu.top + menu.maxHeight <= 692, JSON.stringify(menu));
    assert.ok(menu.maxHeight > 0, JSON.stringify(menu));
  }
});

test('popover supports narrow visual viewports and near-right-edge timeframes', () => {
  for (const viewport of [
    {left: 0, top: 0, width: 240, height: 350},
    {left: 25, top: 80, width: 300, height: 430},
    {left: 0, top: 0, width: 1024, height: 768},
  ]) {
    const anchor = {left: viewport.left + viewport.width - 50, top: viewport.top + 30,
      bottom: viewport.top + 55, width: 52};
    const menu = timeframeMenuPosition(anchor, viewport, 6);
    assert.ok(menu.width <= viewport.width - 16);
    assert.ok(menu.left >= viewport.left + 8);
    assert.ok(menu.left + menu.width <= viewport.left + viewport.width - 8);
    assert.ok(menu.top >= viewport.top + 8);
    assert.ok(menu.top + menu.maxHeight <= viewport.top + viewport.height - 8);
  }
});

test('HookChart connects the second timeframe icon to actual tools expansion', () => {
  const canvas = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/components/hookchart/integration.css', import.meta.url), 'utf8');
  const defaults = readFileSync(new URL('../src/components/hookchart/OriginalHookChartSettings.tsx', import.meta.url), 'utf8');
  assert.match(canvas, /compactAvailable=\{topToolbarOpen\}/);
  assert.match(canvas, /className="topToolbarToggle"/);
  assert.match(canvas, /aria-expanded=\{topToolbarOpen\}/);
  assert.match(styles, /\[data-extra-tools-open="true"\] \.hookchart-timeframes-compact \{/);
  assert.match(styles, /\.hookchart-toolbar > \.topToolbarToggle \{/);
  assert.match(defaults, /showTopToolbarIcons: false,/);
});
