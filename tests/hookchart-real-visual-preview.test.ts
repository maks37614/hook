import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HookChartVisualPreview } from '../src/components/hookchart/HookChartVisualPreview';
import { createSyntheticPreviewCandles } from '../src/components/hookchart/syntheticPreviewCandles';
import { getVisualProfile, patchVisualProfile, VISUAL_GAP_MAX } from '../src/components/hookchart/visualProfiles';
import { hookChartHorizontalRange } from '../src/utils/hookchartData';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const previewSource = source('../src/components/hookchart/HookChartVisualPreview.tsx');
const settingsSource = source('../src/components/hookchart/OriginalHookChartSettings.tsx');

const base = getVisualProfile(undefined, 'screenerQuick', 'mobile');

test('profile editor shows small read-only SVG preview, not an interactive canvas', () => {
  const html = renderToStaticMarkup(React.createElement(HookChartVisualPreview, {
    profile: base,
  }));
  assert.match(html, /data-synthetic-hookchart="true"/);
  assert.match(html, /class="hookchart-mini-preview"/);
  assert.match(html, /<svg/);
  assert.match(html, /aria-label="Маленький штучний графік/);
  assert.match(html, /Без підключень до бірж|без підключень до бірж/);
  assert.doesNotMatch(html, /<canvas|chartWrap|type="range"|BTCUSDT|Binance|Bybit/);
  assert.doesNotMatch(previewSource, /maxWidth: '420px'/);
  assert.match(previewSource, /style=\{\{ display: 'block', width: '100%', height: 'auto' \}\}/);
  const css = source('../src/components/hookchart/integration.css');
  assert.match(css, /hookchart-mini-preview/);
  assert.match(css, /pointer-events:none/);
});

test('mini preview never runs trading engine, market polling or gesture editing', () => {
  assert.match(previewSource, /createSyntheticPreviewCandles\(560\)/);
  assert.doesNotMatch(previewSource,
    /from '\.\/engine'|TradingViewChart|ChartTimeAxis|fetchDirectKlines|directExchangeClient|new WebSocket|ResizeObserver|setInterval|setTimeout|fetch\s*\(|onGesture|onPointerDown|onWheel|onChange=/);
  assert.match(settingsSource, /<HookChartVisualPreview/);
  assert.match(settingsSource, /profile=\{selectedProfile\}/);
  assert.match(settingsSource, /Компактний перегляд масштабу/);
  assert.doesNotMatch(settingsSource, /onViewportGesture=\{onGesture\}/);
});

test('profile can only be edited with sliders below the fixed mini preview', () => {
  const editor = settingsSource.slice(settingsSource.indexOf('function VisualProfileEditor'),
    settingsSource.indexOf('export function OriginalHookChartSettings'));
  const index = editor.indexOf('<HookChartVisualPreview');
  assert.ok(index > 0);
  const rest = editor.slice(index);
  assert.match(rest, /aria-label=\{t\('Кількість видимих свічок'\)\}/);
  assert.match(rest, /aria-label=\{t\('Вертикальний зум'\)\}/);
  assert.match(rest, /aria-label=\{t\('Відступ праворуч у барах'\)\}/);
  assert.match(rest, /Автоматичний масштаб ціни/);
  assert.ok(rest.indexOf('Кількість видимих свічок') > rest.indexOf('<HookChartVisualPreview'));
  assert.doesNotMatch(rest.slice(0, rest.indexOf('/>', rest.indexOf('<HookChartVisualPreview'))), /onChange=/);
});

test('Graph settings center the preview and put full-width controls below it on every breakpoint', () => {
  const editor = settingsSource.slice(settingsSource.indexOf('function VisualProfileEditor'),
    settingsSource.indexOf('export function OriginalHookChartSettings'));
  assert.ok(editor.indexOf('className="visualProfileSelection"') < editor.indexOf('className="visualProfilePreviewStage"'));
  assert.ok(editor.indexOf('className="visualProfilePreviewStage"') < editor.indexOf('className="visualProfileControls"'));
  assert.ok(editor.indexOf('className="visualProfileControls"') < editor.indexOf('className="visualProfileActions"'));

  const css = source('../src/components/hookchart/integration.css');
  assert.match(css, /\.visualProfilePreviewStage\s*\{[^}]*justify-content:center/s);
  assert.match(css, /\.visualProfilePreviewStage \.hookchart-mini-preview\s*\{[^}]*width:min\(100%, 760px\)/s);
  assert.match(css, /\.visualProfileControls\s*\{[^}]*grid-template-columns:minmax\(0, 1fr\)/s);
  assert.match(css, /\.visualProfileControls \.settingRow\s*\{[^}]*flex-direction:column/s);
  assert.match(css, /\.visualProfileControls \.visualProfileRange\s*\{[^}]*width:100%/s);
  assert.match(css, /@media \(max-width:620px\)\s*\{[\s\S]*?\.visualProfileActions button\s*\{\s*width:100%/);
  assert.doesNotMatch(previewSource, /maxWidth: '420px'/);
});

test('right-gap slider sits directly above automatic price scaling', () => {
  const editor = settingsSource.slice(settingsSource.indexOf('function VisualProfileEditor'),
    settingsSource.indexOf('export function OriginalHookChartSettings'));
  const zoom = editor.indexOf('label="Вертикальний зум"');
  const gap = editor.indexOf('label="Відступ праворуч"');
  const auto = editor.indexOf('label="Автоматичний масштаб ціни"');
  assert.ok(zoom > 0 && gap > zoom && auto > gap);
  assert.match(editor, /onChange=\{event => onProfileChange\(\{ rightGapBars: Number\(event.target.value\) \}\)\}/);
  assert.match(editor, /onChange=\{value => onProfileChange\(\{ autoPriceScale: value \}\)\}/);
});

test('right-gap preview changes visibly over the entire saved 0–2000 bar range', () => {
  const renderGap = (bars: number) => renderToStaticMarkup(React.createElement(HookChartVisualPreview, {
    profile: { ...base, rightGapBars: bars },
  }));
  const a = renderGap(0), b = renderGap(80), c = renderGap(250), d = renderGap(VISUAL_GAP_MAX);
  assert.match(a, /data-right-gap-bars="0"/);
  assert.match(b, /data-right-gap-bars="80"/);
  assert.match(c, /data-right-gap-bars="250"/);
  assert.match(d, /data-right-gap-bars="2000"/);
  assert.match(b, /Вільний простір праворуч/);
  assert.match(d, /2000 барів/);
  assert.doesNotMatch(a, /fill="#22d3ee"/);
  assert.match(b, /fill="#22d3ee"/);
  assert.notEqual(b, c, 'preview must not freeze past 200 bars');
  assert.notEqual(c, d, 'preview must continue to move up to the full slider maximum');
  assert.match(previewSource, /VISUAL_GAP_MAX/);
  assert.doesNotMatch(previewSource, /Math\.min\(200,/);
});

test('real HookChart geometry responds to gap changes even when all other controls stay fixed', () => {
  const plot = 600, candleCount = 300;
  const vp = { barWidth: 6, rightOffset: 0 };
  const lastX = (gap: number) => {
    const geom = hookChartHorizontalRange(candleCount, plot, vp, gap);
    return (candleCount - .5 - geom.virtualStart) * geom.step;
  };
  assert.ok(lastX(0) > lastX(10));
  assert.ok(lastX(10) > lastX(30));
  assert.equal(Math.round(lastX(0) - lastX(30)), 180);

  const original = getVisualProfile(undefined, 'screenerFull', 'desktop');
  const saved = patchVisualProfile(undefined, 'screenerFull:desktop', {
    visibleBars: 85, verticalZoom: 1.7, autoPriceScale: false, rightGapBars: 120,
  });
  assert.equal(getVisualProfile({ visualProfiles: saved }, 'screenerFull', 'desktop').rightGapBars, 120);
  assert.equal(original.rightGapBars, 12);
  const chart = source('../src/components/hookchart/HookChartCanvas.tsx');
  const engine = source('../src/components/hookchart/engine.tsx');
  assert.match(chart, /rightPaddingBars=\{rightPaddingBars\}/);
  assert.match(engine, /visualProfile\?\.rightGapBars/);
  assert.match(engine, /hookChartHorizontalRange\(candles.length,plotW,vp,rightPaddingBars,rightPadding\)/);
});

test('all four visual settings update the read-only preview without extra market requests', () => {
  const renderProfile = (changes: Partial<typeof base>) => renderToStaticMarkup(
    React.createElement(HookChartVisualPreview, { profile: { ...base, ...changes } }),
  );
  const initial = renderProfile({});
  assert.notEqual(renderProfile({ visibleBars: 180 }), initial);
  assert.notEqual(renderProfile({ verticalZoom: 2, autoPriceScale: false }), initial);
  assert.notEqual(renderProfile({ autoPriceScale: false }), initial);
  assert.notEqual(renderProfile({ rightGapBars: 35 }), initial);
  assert.match(renderProfile({ autoPriceScale: true }), />AUTO</);
  assert.match(renderProfile({ autoPriceScale: false }), />×1</);
});

test('visual chart editor moves descriptions into accessible question-mark help controls', () => {
  const editor = settingsSource.slice(settingsSource.indexOf('function VisualProfileEditor'),
    settingsSource.indexOf('export function OriginalHookChartSettings'));
  const help = settingsSource.slice(settingsSource.indexOf('function VisualSettingHelp'),
    settingsSource.indexOf('function LiquidationHelp'));
  for (const label of [
    'Тип графіка', 'Пристрій', 'Кількість видимих свічок',
    'Вертикальний зум', 'Відступ праворуч', 'Автоматичний масштаб ціни',
  ]) {
    assert.match(editor, new RegExp('label="' + label + '"'));
  }
  // Descriptions can be selected dynamically per chart context (help={...})
  // instead of being a static string, while every control still has help.
  assert.equal((editor.match(/\bhelp=(?:"|\{)/g) || []).length, 7,
    'six controls and one general help, including context-aware help');
  assert.doesNotMatch(editor, /desc="/, 'long descriptions should no longer occupy the settings screen');
  assert.match(help, /const translatedLabel = translateHookChartPhrase\(language, label\)/);
  assert.match(help, /aria-label=\{\`\$\{translateHookChartPhrase\(language, 'Пояснення:'\)\} \$\{translatedLabel\}\`\}/);
  assert.match(help, /\{translatedText\}/, 'portaled help text should be translated');
  assert.match(help, /aria-expanded=\{open\}/);
  assert.match(help, /createPortal\(/);
  assert.match(help, /role="tooltip"/);
  assert.match(help, /onClick=\{\(\) => setOpen\(true\)\}/);
  assert.match(help, /onPointerEnter=\{event =>/);
  assert.match(help, /onPointerLeave=\{event =>/);
  assert.match(help, /onFocus=\{\(\) => setOpen\(true\)\}/);
  assert.match(help, /event\.key === 'Escape'/);
  const css = source('../src/components/hookchart/integration.css');
  assert.match(css, /\.hookchartVisualHelpPopover\s*\{/);
  assert.match(css, /z-index:2147483000/);
});

test('preview and sliders are compact enough for usual laptop and mobile viewport sizes', () => {
  const editor = settingsSource.slice(settingsSource.indexOf('function VisualProfileEditor'),
    settingsSource.indexOf('export function OriginalHookChartSettings'));
  const css = source('../src/components/hookchart/integration.css');
  assert.match(editor, /className="visualProfileEditor visualProfileCompact"/);
  assert.match(css, /\.visualProfileCompact \.visualProfilePreviewStage\s*\{[^}]*width:min\(100%, 840px\)/s);
  assert.match(css, /\.visualProfileCompact \.visualProfilePreviewStage \.hookchart-mini-preview\s*\{[^}]*width:100%/s);
  assert.doesNotMatch(css, /width:min\(100%, (?:600px, 58dvh|56dvh|51dvh|43dvh)\)/);
  assert.match(css, /\.visualProfileCompact \.hookchart-mini-note\s*\{[^}]*display:none/s);
  assert.match(css, /\.visualProfileCompact \.visualProfileControls\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/s);
  assert.match(css, /@media \(max-width:680px\)/);
  assert.match(css, /@media \(max-height:710px\) and \(min-width:681px\)/);
  assert.match(css, /@media \(max-height:600px\) and \(max-width:680px\)/);
  assert.match(css, /@media \(max-height:650px\) and \(min-width:490px\) and \(max-width:680px\)/);
  assert.match(css, /\.visualProfileCompact \.visualProfileSelection\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s);
  assert.ok(editor.indexOf('visualProfilePreviewStage') < editor.indexOf('visualProfileControls'));
});

test('capture, make-default, and reset actions are buttons wired to live visual-profile handlers', () => {
  const editor = settingsSource.slice(settingsSource.indexOf('function VisualProfileEditor'),
    settingsSource.indexOf('export function OriginalHookChartSettings'));
  assert.match(editor, /className="visualProfileActionButton visualProfileActionPrimary"/);
  assert.match(editor, /disabled=\{!onCapture\} onClick=\{capture\}/);
  assert.match(editor, /onClick=\{applyToAll\}/);
  assert.match(editor, /onClick=\{reset\}/);
  assert.match(editor, /const capture = \(\) => \{ if \(!onCapture\) return; onCapture\(\);/);
  assert.match(editor, /const applyToAll = \(\) => \{ onApplyToAll\(\);/);
  assert.match(editor, /const reset = \(\) => \{ onReset\(\);/);
  assert.match(editor, /role="status" aria-live="polite"/);
  assert.match(settingsSource, /onApplyToAll=\{\(\) => \{[\s\S]*?applyVisualDefaultsForDevice\(prefs\.visualProfiles, visualDevice, selected\)/);
  assert.match(settingsSource, /onReset=\{\(\) => \{[\s\S]*?patchVisualProfile\(prefs\.visualProfiles, key, null\)/);
  assert.match(settingsSource, /onCaptureVisual\(makeVisualProfileKey\(visualContext, visualDevice\)\)/);
  const canvas = source('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(canvas, /const captureCurrentVisual = \(key: VisualProfileKey\) => \{/);
  assert.match(canvas, /changeSettings\(\{ visualProfiles: patchVisualProfile\(settings\.visualProfiles,key,profile\) \}\)/);
  const css = source('../src/components/hookchart/integration.css');
  assert.match(css, /\.visualProfileActionButton\s*\{/);
  assert.match(css, /\.visualProfileActionButton:disabled\s*\{/);
  assert.match(css, /\.visualProfileActionButton:focus-visible\s*\{/);
});

test('synthetic candles are deterministic, valid and do not depend on real prices', () => {
  const a = createSyntheticPreviewCandles(560);
  const b = createSyntheticPreviewCandles(560);
  assert.deepEqual(a, b);
  assert.equal(a.length, 560);
  assert.ok(a.every(c => Number.isFinite(c.o) && Number.isFinite(c.c)
    && c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c) && c.v >= 0));
  assert.ok(a.every((c, i) => i === 0 || c.t - a[i - 1].t === 900000));
});

test('sliders visibly alter candle count and right-gap description without fetching', () => {
  const small = renderToStaticMarkup(React.createElement(HookChartVisualPreview, {
    profile: { ...base, visibleBars: 40, rightGapBars: 8 },
  }));
  const big = renderToStaticMarkup(React.createElement(HookChartVisualPreview, {
    profile: { ...base, visibleBars: 210, rightGapBars: 30 },
  }));
  assert.match(small, /40 видимих барів/);
  assert.match(big, /210 видимих барів/);
  assert.match(small, /8 бар\./);
  assert.match(big, /30 бар\./);
  assert.notEqual(small, big);
});

test('Replay and real HookChart remain independent of the lightweight settings preview', () => {
  const replay = source('../src/components/replay/ReplayChart.tsx');
  const engine = source('../src/components/hookchart/engine.tsx');
  assert.doesNotMatch(replay, /HookChartVisualPreview|syntheticPreviewCandles/);
  assert.doesNotMatch(engine, /syntheticPreviewCandles/);
  assert.match(engine, /visualProfileKey/);
});

test('default live chart scale uses the same saved-or-default visual profile as the settings tab', () => {
  const chart = source('../src/components/hookchart/HookChartCanvas.tsx');
  const snippet = chart.slice(chart.indexOf('const activeVisualProfile ='), chart.indexOf('const toolbarRef ='));
  assert.match(snippet, /getVisualProfile\(settings, activeVisualContext, visualDevice\)/);
  assert.doesNotMatch(snippet, /!settings\.visualProfiles\?\.\[activeVisualKey\]/);
  assert.match(snippet, /terminalInitialViewTarget && selectedTerminalInitialView/);
  assert.match(snippet, /replay \? undefined/, 'Replay keeps its original time-navigation model');
  const preset = getVisualProfile(undefined, 'screenerFull', 'desktop');
  assert.ok(preset.visibleBars > 0 && preset.rightGapBars >= 0);
  const custom = patchVisualProfile(undefined, 'screenerFull:desktop', { visibleBars: 155, rightGapBars: 37 });
  assert.equal(getVisualProfile({ visualProfiles: custom }, 'screenerFull', 'desktop').visibleBars, 155);
  assert.equal(getVisualProfile({ visualProfiles: custom }, 'screenerFull', 'desktop').rightGapBars, 37);
});

test('chart scale preview has no DEMO watermark and uses its available control-column width', () => {
  const html = renderToStaticMarkup(React.createElement(HookChartVisualPreview, { profile: base }));
  assert.doesNotMatch(html, /DEMO|DEMO · 15m/);
  assert.match(html, /Штучні свічки · без підключень до бірж/);
  const css = source('../src/components/hookchart/integration.css');
  assert.match(css, /\.visualProfileCompact \.visualProfileControls\s*\{[^}]*width:min\(100%, 840px\)/s);
  assert.match(css, /\.visualProfileCompact \.visualProfilePreviewStage\s*\{[^}]*width:min\(100%, 840px\)/s);
  assert.match(css, /\.visualProfileCompact \.visualProfilePreviewStage \.hookchart-mini-preview\s*\{[^}]*width:100%/s);
});
