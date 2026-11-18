import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_MAX_CANVAS_DPR, effectiveCanvasDpr, normalizeMaxCanvasDpr, readGuestMaxCanvasDpr } from '../src/components/hookchart/canvasDpr';
import { normalizeOriginalHookChartPreferences, OriginalHookChartSettings } from '../src/components/hookchart/OriginalHookChartSettings';
import { MAIN_SETTINGS_HELP } from '../src/components/hookchart/mainSettingsHelp';
import { translateHookChartPhrase } from '../src/locales/hookchartLanguage';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Canvas DPR cap is bounded and retains the previous default', () => {
  assert.equal(DEFAULT_MAX_CANVAS_DPR, 4);
  assert.equal(normalizeMaxCanvasDpr(undefined), 4);
  assert.equal(normalizeMaxCanvasDpr(Number.NaN), 4);
  assert.equal(normalizeMaxCanvasDpr(0), 1);
  assert.equal(normalizeMaxCanvasDpr(99), 4);
  assert.equal(effectiveCanvasDpr(3, 4), 3);
  assert.equal(effectiveCanvasDpr(3, 2), 2);
  assert.equal(effectiveCanvasDpr(2, 1.5), 1.5);
  assert.equal(effectiveCanvasDpr(1, 4), 1);
  assert.equal(readGuestMaxCanvasDpr(), 4);
  assert.equal(normalizeOriginalHookChartPreferences().maxCanvasDpr, 4);
  assert.equal(normalizeOriginalHookChartPreferences({ maxCanvasDpr: 2 }).maxCanvasDpr, 2);
  assert.equal(normalizeOriginalHookChartPreferences({ maxCanvasDpr: 100 }).maxCanvasDpr, 4);
});

test('Optimization section exposes the control and effective DPR to all four languages', () => {
  const markup = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
    open: true, embedded: true, prefs: normalizeOriginalHookChartPreferences(),
    onChange: () => {}, onApplyStrategy: () => {}, onClose: () => {},
  }));
  assert.match(markup, /Оптимізація/);
  assert.match(markup, /Максимальний DPR полотна/);
  assert.match(markup, /Фактичний DPR полотна/);
  assert.match(markup, /1.5×/);
  const help = MAIN_SETTINGS_HELP['Оптимізація']['Максимальний DPR полотна'];
  for (const locale of ['uk', 'en', 'ru', 'pl'] as const) {
    assert.ok(translateHookChartPhrase(locale, 'Оптимізація'));
    assert.ok(translateHookChartPhrase(locale, 'Максимальний DPR полотна'));
    assert.ok(translateHookChartPhrase(locale, help));
    if (locale !== 'uk') assert.notEqual(translateHookChartPhrase(locale, help), help);
  }
});

test('main and cursor canvases share DPR cap; Replay always keeps original resolution', () => {
  const engine = source('../src/components/hookchart/engine.tsx');
  const canvas = source('../src/components/hookchart/HookChartCanvas.tsx');
  const profile = source('../src/components/profile/ProfileHookChartSettings.tsx');
  assert.equal((engine.match(/effectiveCanvasDpr\(window\.devicePixelRatio,maxCanvasDpr\)/g) || []).length, 2);
  assert.match(engine, /crosshairLineWidth,maxCanvasDpr,horizontalDrawingLineWidth/);
  assert.match(canvas, /maxCanvasDpr=\{replay \? 4 : runtimeSettings\.maxCanvasDpr\}/);
  assert.match(canvas, /HOOKCHART_CANVAS_DPR_EVENT/);
  assert.match(canvas, /readGuestMaxCanvasDpr\(\)/);
  assert.match(canvas, /publishMaxCanvasDpr\(delta\.maxCanvasDpr/);
  assert.match(profile, /publishMaxCanvasDpr\(update\.maxCanvasDpr/);
});
