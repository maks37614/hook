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
    h: [30, 39, 48, 57].includes(i) ? 10.09 + [30, 39, 48, 57].indexOf(i) * .02 : 10.03,
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
  assert.ok(enabled.setups.length <= 4, 'up to two independent cascades do not displace the existing two formations');
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
  const oldInvalid = cascadeFixture();
  oldInvalid[20].h = NaN;
  assert.equal(cascade(analyzer.evaluate(oldInvalid, scope, false, true)), undefined,
    'an invalid historical candle outside the ATR window must reject all cascade geometry');
  const gapped = cascadeFixture().map((bar, i) => i > 60 ? { ...bar, t: bar.t + 60_000 } : bar);
  assert.equal(cascade(analyzer.evaluate(gapped, scope, false, true)), undefined);
});

test('equal-price retests and insignificant microsteps are NOT mislabeled as separate cascade levels', () => {
  const base = cascadeFixture();
  for (const [name, peaks] of [
    ['flat repeated resistance', [10.13, 10.13, 10.13, 10.13]],
    ['tiny noise around one level', [10.13, 10.131, 10.132, 10.133]],
    ['only two distinct levels despite four touches', [10.11, 10.13, 10.11, 10.13]],
  ] as const) {
    const rows = base.map((bar, i) => {
      const index = [30, 39, 48, 57].indexOf(i);
      return index < 0 ? { ...bar } : { ...bar, h: peaks[index] };
    });
    assert.equal(cascade(createScalperAnalyzer().evaluate(rows, scope, false, true)), undefined, name);
  }
});

test('genuine lower-price cascade draws independent LOW tiers and confirms only after a close', () => {
  const lows = [9.91, 9.89, 9.87, 9.85];
  const rows = cascadeFixture().map((bar, i) => {
    const index = [30, 39, 48, 57].indexOf(i);
    return { ...bar, h: 10.03, l: index < 0 ? 9.97 : lows[index] };
  });
  const candidate = cascade(createScalperAnalyzer().evaluate(rows, scope, false, true));
  assert.ok(candidate, 'four distinct trough tiers must form a lower cascade');
  assert.equal(candidate.lines.find(line => line.role === 'lower')?.to.p, 9.85);
  assert.equal(candidate.status, 'forming');
  const live = rows.map(bar => ({ ...bar }));
  live[live.length - 1] = { ...live.at(-1)!, c: 9.7, l: 9.68 };
  const possible = cascade(createScalperAnalyzer().evaluate(live, scope, false, true));
  assert.equal(possible?.status, 'possible');
  assert.equal(possible?.breakout?.side, 'down');
  const confirmed = rows.map(bar => ({ ...bar }));
  confirmed[confirmed.length - 2] = { ...confirmed.at(-2)!, c: 9.7, l: 9.68 };
  assert.equal(cascade(createScalperAnalyzer().evaluate(confirmed, scope, false, true))?.status, 'confirmed');
});

test('two simultaneous distinct High/Low cascades are both visible, with bounded overlays', () => {
  const highs = [10.09, 10.11, 10.13, 10.15];
  const lows = [9.91, 9.89, 9.87, 9.85];
  const rows = cascadeFixture().map((bar, i) => {
    const topIndex = [30, 39, 48, 57].indexOf(i);
    const bottomIndex = [34, 43, 52, 61].indexOf(i);
    return {
      ...bar,
      h: topIndex < 0 ? 10.03 : highs[topIndex],
      l: bottomIndex < 0 ? 9.97 : lows[bottomIndex],
    };
  });
  const scene = createScalperAnalyzer().evaluate(rows, scope, false, true);
  const cascades = scene.setups.filter(setup => setup.kind === 'cascade');
  assert.equal(cascades.length, 2, 'a valid lower stack must not hide a valid upper stack');
  assert.ok(cascades.some(setup => setup.lines.some(line => line.role === 'upper')));
  assert.ok(cascades.some(setup => setup.lines.some(line => line.role === 'lower')));
  assert.ok(scene.setups.length <= 4);
});

test('distinct but non-monotonic price tiers still form a stack; a far outlier must not', () => {
  const peaks = [10.09, 10.13, 10.11, 10.15];
  const rows = cascadeFixture().map((bar, i) => {
    const index = [30, 39, 48, 57].indexOf(i);
    return { ...bar, h: index < 0 ? 10.03 : peaks[index] };
  });
  assert.equal(cascade(createScalperAnalyzer().evaluate(rows, scope, false, true))?.touches.length, 4);
  rows[57].h = 11.5;
  assert.equal(cascade(createScalperAnalyzer().evaluate(rows, scope, false, true)), undefined,
    'a large distant extreme makes the recent swing sequence not a compact cascade');
});

test('cascade switch and captions are available in all four HookChart languages', () => {
  const label = 'Авто позначення каскадних рівнів';
  for (const language of ['uk', 'en', 'pl', 'ru'] as const) {
    assert.notEqual(translateHookChartPhrase(language, label), '');
    assert.notEqual(scalperLabel('cascade', language), '');
    const prefs = normalizeOriginalHookChartPreferences({ language, siteLanguageAtSelection: 'uk', scalperMode: true, scalperCascadeLevels: true });
    const html = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
      open: true, embedded: true, prefs, language,
      onChange: () => {}, onApplyStrategy: () => {}, onClose: () => {},
    }));
    assert.ok(html.includes('aria-label="' + translateHookChartPhrase(language, label) + '"'));
  }
  const canvas = readFileSync('src/components/hookchart/HookChartCanvas.tsx', 'utf8');
  assert.match(canvas, /runtimeSettings.scalperCascadeLevels === true/);
  assert.match(canvas, /runtimeSettings.scalperMode === true && !archiveMode && !replay && !externalData && !ecoActive/);
});
