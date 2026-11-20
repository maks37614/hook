import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createScalperAnalyzer, scalperLabel, type ScalperCandle } from '../src/components/hookchart/scalperMode';
import { OriginalHookChartSettings, normalizeOriginalHookChartPreferences } from '../src/components/hookchart/OriginalHookChartSettings';
import { translateHookChartPhrase } from '../src/locales/hookchartLanguage';

const scope = 'binance:futures:BTCUSDT:1m';
function cascadeFixture(): ScalperCandle[] {
  return Array.from({ length: 75 }, (_, i) => ({
    t: 1_700_000_000_000 + i * 60_000,
    o: 10, c: 10,
    h: [30, 39, 48, 57].includes(i) ? 10.13 + [30, 39, 48, 57].indexOf(i) * .001 : 10.03,
    l: 9.97,
  }));
}
const cascade = (scene: ReturnType<ReturnType<typeof createScalperAnalyzer>['evaluate']>) =>
  scene.setups.find(s => s.kind === 'cascade');

test('cascade detection is an independent explicit opt-in and remains scoped to existing candles', () => {
  assert.equal(normalizeOriginalHookChartPreferences().scalperCascadeLevels, false);
  assert.equal(normalizeOriginalHookChartPreferences({ scalperCascadeLevels: 'true' as unknown as boolean }).scalperCascadeLevels, false);
  assert.equal(normalizeOriginalHookChartPreferences({ scalperCascadeLevels: true }).scalperCascadeLevels, true);
  const analyzer = createScalperAnalyzer();
  const rows = cascadeFixture();
  const regular = analyzer.evaluate(rows, scope);
  assert.equal(cascade(regular), undefined, 'legacy behavior unchanged');
  const enabled = analyzer.evaluate(rows, scope, false, true);
  const detected = cascade(enabled);
  assert.ok(detected, '3–5 independent wick peaks must show a cascade');
  assert.equal(detected.status, 'forming');
  assert.ok(detected.touches.length >= 3 && detected.touches.length <= 5);
  assert.ok(detected.lines.filter(line => line.role === 'cascade-step').length >= 3);
  assert.ok(enabled.setups.length <= 3, 'cascade does not displace the existing two formations');
  assert.strictEqual(analyzer.evaluate(rows.map(x => ({ ...x })), scope, false, true), enabled,
    'unchanged republished OHLC must keep a stable scene');
  assert.equal(cascade(analyzer.evaluate(rows, scope, false, false)), undefined,
    'turning it off must immediately hide the independent overlay');
});

test('only a completed crossing confirms a cascade breakout', () => {
  const analyzer = createScalperAnalyzer();
  const rows = cascadeFixture();
  const live = rows.map(x => ({ ...x }));
  live[live.length - 1] = { ...live[live.length - 1], c: 10.3, h: 10.33 };
  assert.equal(cascade(analyzer.evaluate(live, scope, false, true))?.status, 'possible');
  const closed = rows.map(x => ({ ...x }));
  closed[closed.length - 2] = { ...closed[closed.length - 2], c: 10.3, h: 10.33 };
  assert.equal(cascade(analyzer.evaluate(closed, scope, false, true))?.status, 'confirmed');
  const oldBreak = rows.map(x => ({ ...x }));
  oldBreak[65] = { ...oldBreak[65], c: 10.3, h: 10.33 };
  assert.equal(cascade(analyzer.evaluate(oldBreak, scope, false, true)), undefined,
    'an already-broken boundary must not be resurrected');
});

test('cascade marks respect invalid bars and do not cross a recent candle gap', () => {
  const analyzer = createScalperAnalyzer();
  const rows = cascadeFixture();
  rows[60].h = NaN;
  assert.equal(cascade(analyzer.evaluate(rows, scope, false, true)), undefined);
  const gapped = cascadeFixture().map((bar, i) => i > 60 ? { ...bar, t: bar.t + 60_000 } : bar);
  assert.equal(cascade(analyzer.evaluate(gapped, scope, false, true)), undefined);
});

test('cascade switch and captions are available in all four HookChart languages', () => {
  const label = 'Авто позначення каскадних рівнів';
  for (const language of ['uk', 'en', 'pl', 'ru'] as const) {
    assert.notEqual(translateHookChartPhrase(language, label), '');
    assert.notEqual(scalperLabel('cascade', language), '');
    const prefs = normalizeOriginalHookChartPreferences({ language, siteLanguageAtSelection: 'uk', scalperMode: true, scalperCascadeLevels: true });
    const html = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
      open: true, embedded: true, prefs, selectedLanguage: language,
      onChange: () => {}, onApplyStrategy: () => {}, onClose: () => {},
    }));
    assert.ok(html.includes('aria-label="' + translateHookChartPhrase(language, label) + '"'));
  }
  const canvas = readFileSync('src/components/hookchart/HookChartCanvas.tsx', 'utf8');
  assert.match(canvas, /runtimeSettings.scalperCascadeLevels === true/);
  assert.match(canvas, /runtimeSettings.scalperMode === true && !archiveMode && !replay && !externalData && !ecoActive/);
});
