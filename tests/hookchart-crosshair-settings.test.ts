import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OriginalHookChartSettings, normalizeOriginalHookChartPreferences } from '../src/components/hookchart/OriginalHookChartSettings';

test('old preferences gain a thin crosshair and saved thickness survives normalization', () => {
  assert.equal(normalizeOriginalHookChartPreferences().crosshairLineWidth,1);
  const prefs=normalizeOriginalHookChartPreferences({crosshairLineWidth:.5});
  assert.equal(normalizeOriginalHookChartPreferences(prefs).crosshairLineWidth,.5);
  assert.equal(normalizeOriginalHookChartPreferences({crosshairLineWidth:NaN}).crosshairLineWidth,1);
  assert.equal(normalizeOriginalHookChartPreferences({crosshairLineWidth:0}).crosshairLineWidth,.5);
  assert.equal(normalizeOriginalHookChartPreferences({crosshairLineWidth:99}).crosshairLineWidth,2);
});

test('main chart settings expose a Crosshair section with the saved thin option selected', () => {
  const noop=()=>{};
  const html=renderToStaticMarkup(React.createElement(OriginalHookChartSettings,{
    open:true,prefs:normalizeOriginalHookChartPreferences({crosshairLineWidth:.5}),
    onChange:noop,onApplyStrategy:noop,onClose:noop,
  }));
  const start=html.indexOf('Перехрестя'),end=html.indexOf('Сітка графіка',start);
  assert.ok(start>=0&&end>start);
  const section=html.slice(start,end);
  assert.match(section,/Товщина ліній/);
  assert.match(section,/<button(?=[^>]*value="0\.5")(?=[^>]*aria-pressed="true")[^>]*>0\.5 px<\/button>/);
  assert.match(section,/Горизонтальна та вертикальна лінії курсора/);
});
