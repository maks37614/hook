import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  OriginalHookChartSettings, normalizeOriginalHookChartPreferences,
} from '../src/components/hookchart/OriginalHookChartSettings';
import { translateHookChartPhrase } from '../src/locales/hookchartLanguage';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('manual horizontal and trend widths default to 0.4 CSS px; all Scalper lines default to 0.4', () => {
  const defaults = normalizeOriginalHookChartPreferences();
  assert.equal(defaults.horizontalDrawingLineWidth, 0.4);
  assert.equal(defaults.trendDrawingLineWidth, 0.4);
  assert.equal(defaults.scalperLineWidth, 0.4);
  const custom = normalizeOriginalHookChartPreferences({
    horizontalDrawingLineWidth: 1.8, trendDrawingLineWidth: 2.1, scalperLineWidth: 0.6,
  });
  assert.equal(custom.horizontalDrawingLineWidth, 1.8);
  assert.equal(custom.trendDrawingLineWidth, 2.1);
  assert.equal(custom.scalperLineWidth, 0.6);
  const bounds = normalizeOriginalHookChartPreferences({
    horizontalDrawingLineWidth: -1, trendDrawingLineWidth: -1, scalperLineWidth: 9,
  });
  assert.equal(bounds.horizontalDrawingLineWidth, 0.2);
  assert.equal(bounds.trendDrawingLineWidth, 0.2);
  assert.equal(bounds.scalperLineWidth, 5);
  assert.equal(normalizeOriginalHookChartPreferences({horizontalDrawingLineWidth: Number.NaN}).horizontalDrawingLineWidth, 0.4);
  assert.equal(normalizeOriginalHookChartPreferences({scalperLineWidth: Number.NaN}).scalperLineWidth, 0.4);
  // Do not retain the old 0.9px default on existing users' stored profiles.
  assert.equal(normalizeOriginalHookChartPreferences({scalperTrendLineWidth: 0.9}).scalperLineWidth, 0.4);
  assert.equal(normalizeOriginalHookChartPreferences({scalperTrendLineWidth: 0.6}).scalperLineWidth, 0.6);
  assert.equal(normalizeOriginalHookChartPreferences({scalperLineWidth: 1.1, scalperTrendLineWidth: 0.6}).scalperLineWidth, 1.1);
  assert.equal(normalizeOriginalHookChartPreferences({scalperTrendLineWidth: 0.9}).scalperTrendLineWidth, undefined);
});

test('both manual width settings reach renderer without changing automatic levels or subscriptions', () => {
  const settings = read('../src/components/hookchart/OriginalHookChartSettings.tsx');
  const canvas = read('../src/components/hookchart/HookChartCanvas.tsx');
  const engine = read('../src/components/hookchart/engine.tsx');
  assert.match(settings, /set\('horizontalDrawingLineWidth', value\)/);
  assert.match(settings, /set\('trendDrawingLineWidth', value\)/);
  assert.match(canvas, /horizontalDrawingLineWidth=\{runtimeSettings\.horizontalDrawingLineWidth \?\? 0\.4\}/);
  assert.match(canvas, /trendDrawingLineWidth=\{runtimeSettings\.trendDrawingLineWidth \?\? 0\.4\}/);
  assert.match(engine, /q\.lineWidth=d\.type==='trend'\?trendStrokeWidth:d\.type==='level'\?horizontalStrokeWidth:/);
  assert.match(engine, /horizontalDrawingLineWidth,trendDrawingLineWidth,scalperLineWidth,symbol/);
  assert.match(engine, /q\.lineWidth = scalperStrokeWidth;/);
  assert.doesNotMatch(engine, /setup\.kind === 'cascade' \? scalperCascadeLineWidth/);
  assert.match(engine, /levelLineWidth=\.3/);
  assert.doesNotMatch(settings, /fetch\(|setInterval\(/);
});

test('manual-line and Scalper labels are translated to all four languages', () => {
  for (const language of ['uk','en','pl','ru'] as const) {
    const prefs = normalizeOriginalHookChartPreferences({language, siteLanguageAtSelection: 'uk'});
    const markup = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
      open: true, embedded: true, prefs, onChange: () => {}, onApplyStrategy: () => {}, onClose: () => {},
    }));
    const horizontal = translateHookChartPhrase(language, 'Товщина горизонтальної лінії');
    const manual = translateHookChartPhrase(language, 'Товщина лінії тренду');
    const automatic = translateHookChartPhrase(language, 'Товщина ліній');
    assert.ok(markup.includes(horizontal), language + ' horizontal label');
    assert.ok(markup.includes(manual), language + ' trend label');
    assert.ok(markup.includes(automatic), language + ' Scalper label');
    if (language === 'en' || language === 'pl') assert.doesNotMatch(horizontal, /[А-Яа-яІіЇїЄєҐґ]/);
  }
});
