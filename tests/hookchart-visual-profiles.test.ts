import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hookChartHorizontalRange } from '../src/utils/hookchartData';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OriginalHookChartSettings, VisualContextPicker, normalizeOriginalHookChartPreferences } from '../src/components/hookchart/OriginalHookChartSettings';
import {
  VISUAL_CONTEXTS, applyVisualDefaultsForDevice, captureVisualProfile, getVisualProfile, makeVisualProfileKey,
  normalizeVisualProfile, normalizedVisualProfiles, patchVisualProfile, selectableVisualContexts, visualContextForTerminalWidth,
  canonicalVisualContext, visibleScaleContext, visualDeviceForWidth,
} from '../src/components/hookchart/visualProfiles';

const src = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');

test('Screener and Formations share two scale profiles, while devices and Terminal stay separate', () => {
  assert.deepEqual(VISUAL_CONTEXTS.map(item => item.id), [
    'screenerQuick','screenerFull','formationsQuick','formationsFull',
    'terminalLarge','terminalMedium','terminalCompact',
  ]);
  assert.notEqual(makeVisualProfileKey('screenerQuick','mobile'),makeVisualProfileKey('screenerFull','mobile'));
  assert.equal(makeVisualProfileKey('formationsQuick','desktop'),makeVisualProfileKey('screenerQuick','desktop'));
  assert.equal(makeVisualProfileKey('formationsFull','mobile'),makeVisualProfileKey('screenerFull','mobile'));
  assert.notEqual(makeVisualProfileKey('formationsQuick','desktop'),makeVisualProfileKey('formationsQuick','mobile'));
  assert.equal(canonicalVisualContext('formationsQuick'), 'screenerQuick');
  assert.equal(canonicalVisualContext('terminalMedium'), 'terminalMedium');
  assert.equal(visibleScaleContext('formationsFull'), 'screenerFull');
  assert.equal(visualDeviceForWidth(390),'mobile');
  assert.equal(visualDeviceForWidth(767),'mobile');
  assert.equal(visualDeviceForWidth(768),'desktop');
  assert.equal(visualContextForTerminalWidth(330),'terminalCompact');
  assert.equal(visualContextForTerminalWidth(550),'terminalMedium');
  assert.equal(visualContextForTerminalWidth(1024),'terminalLarge');
});

test('visual chart profiles sanitize invalid JSON while preserving other contexts', () => {
  const key = makeVisualProfileKey('screenerQuick','mobile');
  const another = makeVisualProfileKey('terminalCompact','desktop');
  const prefs = patchVisualProfile(undefined,key,{visibleBars:80,verticalZoom:1.5,autoPriceScale:false,rightGapBars:7});
  const both = patchVisualProfile(prefs,another,{visibleBars:30});
  assert.equal(getVisualProfile({ visualProfiles: both },'screenerQuick','mobile').visibleBars,80);
  assert.equal(getVisualProfile({ visualProfiles: both },'terminalCompact','desktop').visibleBars,30);
  assert.equal(getVisualProfile({ visualProfiles: both },'screenerQuick','mobile').verticalZoom,1.5);
  const reset = patchVisualProfile(both,key,null);
  assert.equal(reset[key],undefined);
  assert.equal(reset[another]?.visibleBars,30);
  const normalized = normalizedVisualProfiles({
    [key]:{visibleBars:NaN,verticalZoom:Infinity,autoPriceScale:'false',rightGapBars:-700},
    'unexpected:danger':{visibleBars:100},
  });
  assert.ok(!('unexpected:danger' in normalized));
  assert.equal(normalized[key]?.rightGapBars,0);
  assert.equal(normalized[key]?.autoPriceScale,true);
  assert.equal(normalized[key]?.visibleBars,65);
  assert.equal(normalized[key]?.verticalZoom,1);
});

test('legacy page-specific presets migrate to one scale, with Screener priority and Formation fallback', () => {
  const old = {
    'screenerQuick:desktop': { visibleBars: 101, rightGapBars: 17 },
    'formationsQuick:desktop': { visibleBars: 202, rightGapBars: 27 },
    'formationsFull:mobile': { visibleBars: 138, rightGapBars: 33 },
    'terminalMedium:desktop': { visibleBars: 74, rightGapBars: 19 },
  };
  const migrated = normalizedVisualProfiles(old);
  assert.equal(migrated['screenerQuick:desktop']?.visibleBars, 101);
  assert.equal(migrated['screenerFull:mobile']?.visibleBars, 138);
  assert.ok(!('formationsQuick:desktop' in migrated));
  assert.ok(!('formationsFull:mobile' in migrated));
  assert.equal(migrated['terminalMedium:desktop']?.visibleBars, 74);
  const settings = { visualProfiles: migrated };
  assert.deepEqual(getVisualProfile(settings, 'formationsQuick', 'desktop'),
    getVisualProfile(settings, 'screenerQuick', 'desktop'));
  assert.deepEqual(getVisualProfile(settings, 'formationsFull', 'mobile'),
    getVisualProfile(settings, 'screenerFull', 'mobile'));

  const edited = patchVisualProfile(migrated, 'formationsQuick:desktop', { visibleBars: 117 });
  assert.equal(getVisualProfile({ visualProfiles: edited }, 'screenerQuick', 'desktop').visibleBars, 117);
  assert.equal(getVisualProfile({ visualProfiles: edited }, 'formationsQuick', 'desktop').visibleBars, 117);
  assert.equal(getVisualProfile({ visualProfiles: edited }, 'screenerFull', 'mobile').visibleBars, 138);
  assert.equal(getVisualProfile({ visualProfiles: edited }, 'terminalMedium', 'desktop').visibleBars, 74);
  const reset = patchVisualProfile(edited, 'formationsQuick:desktop', null);
  assert.ok(!('screenerQuick:desktop' in reset));
  assert.equal(getVisualProfile({ visualProfiles: reset }, 'screenerQuick', 'desktop').visibleBars,
    getVisualProfile(undefined, 'formationsQuick', 'desktop').visibleBars);
  assert.equal(getVisualProfile({ visualProfiles: reset }, 'terminalMedium', 'desktop').visibleBars, 74);
  const rawLegacy = { visualProfiles: { 'formationsQuick:mobile': { visibleBars: 191 } } } as any;
  assert.equal(getVisualProfile(rawLegacy, 'screenerQuick', 'mobile').visibleBars, 191);
});

test('capture records relative viewport properties, not fixed prices or ticker', () => {
  const base = getVisualProfile(undefined,'formationsQuick','desktop');
  const captured = captureVisualProfile(base,800,{
    barWidth:8,rightOffset:12,autoY:false,manualRange:50,
  },100);
  assert.deepEqual(captured,{
    visibleBars:90,verticalZoom:2,autoPriceScale:false,rightGapBars:10,
  });
  const auto = captureVisualProfile(base,800,{
    barWidth:10,rightOffset:15,autoY:true,manualRange:null,yZoom:1.3,
  });
  assert.equal(auto.verticalZoom,1.3);
  assert.equal(auto.visibleBars,70);
  assert.ok(!('manualCenter' in captured));
  assert.ok(!('price' in captured));
  const withGap = { ...base, rightGapBars: 26 };
  assert.equal(captureVisualProfile(withGap, 800, { barWidth: 6, rightOffset: 0, autoY: true, manualRange: null }).rightGapBars, 26,
    'saving a zoom/pan does not modify the independent right-gap slider');
  const combined = { ...base, visibleBars: 144, verticalZoom: .4, rightGapBars: 81 };
  const availableWidth = 290, slotWidth = availableWidth / (combined.visibleBars + combined.rightGapBars);
  const capturedWithGap = captureVisualProfile(combined, availableWidth,
    { barWidth: slotWidth, rightOffset: 0, autoY: true, manualRange: null, yZoom: .4 });
  assert.equal(capturedWithGap.visibleBars, 144,
    'a large right-side gap must not inflate the saved candle count');
  assert.equal(capturedWithGap.rightGapBars, 81);
  assert.equal(capturedWithGap.verticalZoom, .4);
});

test('Масштаб tab uses existing personal settings persistence and preview without market fetch', () => {
  const prefs = normalizeOriginalHookChartPreferences({
    visualProfiles:patchVisualProfile(undefined,'formationsFull:mobile',{visibleBars:140}),
  });
  assert.equal(prefs.visualProfiles?.['screenerFull:mobile']?.visibleBars,140);
  const html = renderToStaticMarkup(React.createElement(OriginalHookChartSettings,{
    open:true,embedded:true,prefs,onChange:()=>{},onApplyStrategy:()=>{},onClose:()=>{},
  }));
  assert.match(html, />Масштаб<\/button>/);
  const settings = src('../src/components/hookchart/OriginalHookChartSettings.tsx');
  assert.match(settings,/Компактний перегляд масштабу/);
  assert.match(settings,/Зберегти поточний вигляд графіка/);
  assert.match(settings,/Скинути цей профіль/);
  assert.match(settings,/Вертикальний зум/);
  assert.match(settings,/Кількість видимих свічок/);
  assert.match(settings,/Автоматичний масштаб ціни/);
  assert.match(settings,/Відступ праворуч/);
  assert.equal((settings.match(/<Setting label="Відступ праворуч"/g) || []).length,1);
  assert.doesNotMatch(settings,/<SwitchRow label="Відступ праворуч"/);
  assert.doesNotMatch(settings,/prefs\.rightPadding \?\? 10/);
  assert.doesNotMatch(settings.slice(settings.indexOf('function VisualProfileEditor'),settings.indexOf('export function OriginalHookChartSettings')),/fetch\(|WebSocket|setInterval/);
});

test('Screener, Formations, Terminal carry visual contexts, Replay passes none', () => {
  const canvas = src('../src/components/hookchart/HookChartCanvas.tsx');
  const engine = src('../src/components/hookchart/engine.tsx');
  const trading = src('../src/components/TradingViewChart.tsx');
  const fullscreen = src('../src/components/FullscreenChartModal.tsx');
  const formation = src('../src/components/FormationCard.tsx');
  const early = src('../src/components/EarlyFormationCard.tsx');
  const terminal = src('../src/components/terminal/TerminalChartWidget.tsx');
  const terminalPage = src('../src/components/TerminalPage.tsx');
  const replay = src('../src/components/replay/ReplayChart.tsx');
  assert.match(canvas,/const activeVisualProfile = replay \? undefined/);
  assert.match(canvas,/terminalInitialViewTarget && selectedTerminalInitialView/);
  assert.match(canvas,/const rightPaddingBars = replay \? 10 : activeVisualProfile\?\.rightGapBars/);
  assert.doesNotMatch(canvas,/settings\.rightPaddingEnabled|settings\.rightPadding \?\?/);
  assert.match(canvas,/onResetVisual=\{key =>/);
  assert.match(canvas,/visualProfileKey=\{replay \? undefined : terminalInitialViewTarget/);
  assert.match(canvas,/visualContextForTerminalWidth/);
  assert.match(engine,/if\(!profile\|\|!visualProfileKey\|\|!latestCandles\.length\)return/);
  assert.match(engine,/if\(hasVisualProfile\|\|rangeRestored\.current\|\|!candles\.length\|\|!initialLogicalRange\)return/);
  assert.match(engine,/visualAppliedRef\.current===signature/);
  assert.match(engine,/if\(!terminalMode\|\|hasVisualProfile\|\|!hasHistoryCandles/);
  assert.match(formation,/visualContext="formationsQuick"/);
  assert.match(early,/visualContext="formationsQuick"/);
  // A favorite from another market must not inherit the prior setup's visual context.
  assert.match(fullscreen,/visualContext=\{visualContext \?\? \(activeFormation \|\| \(earlyCandidate && samePropMarket\) \? 'formationsFull' : 'screenerFull'\)\}/);
  assert.match(trading,/visualContext=\{visualContext\}/);
  assert.match(terminal,/terminalMode=\{useIntegratedHookChartToolbar\}/);
  assert.match(terminalPage, /<TerminalGridItem/);
  assert.match(terminal, /symbol=\{block\.symbol\}/);
  assert.match(canvas, /visualContextForTerminalWidth\(root\.getBoundingClientRect\(\)\.width\)/);
  assert.match(src('../src/components/ExchangeCandlestickChart.tsx'),/visualContext=\{visualContext\}/);
  assert.match(src('../src/components/TradingViewChart.tsx'),/visualContext=\{visualContext\}/);
  assert.doesNotMatch(replay,/visualContext=|visualProfiles/);
});

test('visual zoom and right-side padding accept expanded finite ranges', () => {
  const base = getVisualProfile(undefined, 'terminalCompact', 'mobile');
  const small = normalizeVisualProfile({ ...base, verticalZoom: 0.02, rightGapBars: 900 }, 'terminalCompact');
  assert.equal(small.verticalZoom, 0.02);
  assert.equal(small.rightGapBars, 900);
  const large = normalizeVisualProfile({ ...base, verticalZoom: 75, rightGapBars: 1800 }, 'terminalCompact');
  assert.equal(large.verticalZoom, 75);
  assert.equal(large.rightGapBars, 1800);
  const invalid = normalizeVisualProfile({ ...base, verticalZoom: Number.POSITIVE_INFINITY, rightGapBars: Number.NaN }, 'terminalCompact');
  assert.equal(invalid.verticalZoom, base.verticalZoom);
  assert.equal(invalid.rightGapBars, base.rightGapBars);
  assert.equal(normalizeVisualProfile({ ...base, verticalZoom: 100000, rightGapBars: 999999 }, 'terminalCompact').verticalZoom, 100);
  assert.equal(normalizeVisualProfile({ ...base, verticalZoom: 100000, rightGapBars: 999999 }, 'terminalCompact').rightGapBars, 2000);
});


test('making the selected visual scale default applies to seven chart types on just one device', () => {
  const desktop = makeVisualProfileKey('formationsFull', 'desktop');
  const original = patchVisualProfile(undefined, desktop,
    { visibleBars: 123, rightGapBars: 88, verticalZoom: 3 });
  const chosen = { visibleBars: 44, verticalZoom: 1.75, autoPriceScale: false, rightGapBars: 35 };
  const defaults = applyVisualDefaultsForDevice(original, 'mobile', chosen);
  for (const context of VISUAL_CONTEXTS) {
    assert.deepEqual(defaults[makeVisualProfileKey(context.id, 'mobile')], chosen);
  }
  assert.equal(defaults[desktop]?.visibleBars, 123, 'desktop preferences must remain unchanged');
  assert.equal(defaults[desktop]?.rightGapBars, 88);
  const code = src('../src/components/hookchart/OriginalHookChartSettings.tsx');
  assert.match(code, /applyVisualDefaultsForDevice\(prefs\.visualProfiles, visualDevice, selected\)/);
  assert.match(code, /Зробити типовими для всіх графіків/);
  assert.match(code, /onApplyToAll=\{\(\) => \{/);
  assert.match(code, /applyVisualDefaultsForDevice\(prefs\.visualProfiles, visualDevice, selected\)/);
  assert.match(code, /role="group" aria-label=\{t\('Збереження та скидання вигляду графіка'\)\}/);
});


test('Scale picker offers only two options and keeps Terminal presets in saved settings', () => {
  const options = selectableVisualContexts();
  assert.deepEqual(options.map(item => item.label), ['Швидкий перегляд', 'Повний графік']);
  assert.deepEqual(options.map(item => item.id), ['screenerQuick', 'screenerFull']);
  assert.deepEqual(selectableVisualContexts(true), options);
  const prefs = patchVisualProfile(undefined, 'terminalCompact:desktop', { visibleBars: 54 });
  assert.equal(getVisualProfile({ visualProfiles: prefs }, 'terminalCompact', 'desktop').visibleBars, 54);
  assert.equal(VISUAL_CONTEXTS.length, 7, 'the internal Terminal profiles are still available');

  const chart = src('../src/components/hookchart/OriginalHookChartSettings.tsx');
  assert.match(chart, /const contexts = selectableVisualContexts\(\)/);
  assert.match(chart, /contexts\.map\(context =>/);
  assert.doesNotMatch(chart, /includeTerminalContexts/);
  assert.match(src('../src/components/hookchart/HookChartCanvas.tsx'), /activeVisualContext=\{activeVisualContext\}/);
});

test('iOS scale picker replaces the native bright select and shows only shared scales', () => {
  const markup = renderToStaticMarkup(React.createElement(VisualContextPicker, {
    value: 'formationsQuick', onChange: () => {},
  }));
  assert.match(markup, /aria-label="Тип графіка для візуальних налаштувань"/);
  assert.match(markup, /aria-haspopup="listbox"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /Швидкий перегляд/);
  assert.match(markup, /class="visualContextTrigger"/);
  assert.doesNotMatch(markup, /<select|<option/);

  const editor = src('../src/components/hookchart/OriginalHookChartSettings.tsx');
  const styles = src('../src/components/hookchart/integration.css');
  const chartEditor = editor.slice(editor.indexOf('function VisualProfileEditor'), editor.indexOf('export function OriginalHookChartSettings'));
  assert.match(chartEditor, /<VisualContextPicker value=\{visualContext\} onChange=\{onContextChange\}/);
  assert.doesNotMatch(chartEditor, /<select/);
  assert.match(editor, /createPortal\(/);
  assert.match(editor, /role="listbox"/);
  assert.match(editor, /role="option" aria-selected=\{active\}/);
  assert.match(editor, /contexts\.map\(context =>/);
  assert.doesNotMatch(editor, /const group = index === 0/);
  assert.match(editor, /onChange\(context\.id\)/);
  assert.match(editor, /document\.addEventListener\('pointerdown', dismiss\)/);
  assert.match(editor, /window\.addEventListener\('keydown', keydown, true\)/);
  assert.match(editor, /event\.key === 'Escape'/);
  assert.match(editor, /'ArrowUp', 'ArrowDown', 'Home', 'End'/);
  assert.match(editor, /document\.querySelector\('\.hookchart-visual-context-menu'\)/);
  assert.match(styles, /\.hookchart-visual-context-menu/);
  assert.match(styles, /z-index:2147483500/);
  assert.match(styles, /background:#0d1726/);
  assert.match(styles, /min-height:48px/);
  assert.match(styles, /\.visualProfileCompact \.visualProfileSelection \{/);
  assert.match(styles, /max-width:240px/);
  assert.match(styles, /min-height:36px/);
  assert.match(styles, /min-height:30px/);
  assert.doesNotMatch(styles, /\.settingControl select\.visualProfileSelect/);
  assert.equal(VISUAL_CONTEXTS.length, 7);
});

test('fit-to-history centers every candle count and timeframe on compact and wide screens', () => {
  const timeframes=['30s','1m','5m','15m','1h','4h','1d'];
  for(const tf of timeframes){
    for(const width of [220,390,960]){
      for(const candles of [1,2,7,40,180,1000,5000]){
        for(const rightGap of [0,10,80]){
          for(const rightPixels of [0,12]){
            const range=hookChartHorizontalRange(candles,width,{barWidth:9,rightOffset:0,fitAll:true},rightGap,rightPixels);
            const first=(0.5-range.virtualStart)*range.step;
            const last=(candles-0.5-range.virtualStart)*range.step;
            const expectedCenter=(width-rightPixels)/2;
            assert.ok(first>0 && last<width-rightPixels,
              `${tf}/${candles}/${width}: candles must stay within the plot`);
            assert.ok(Math.abs((first+last)/2-expectedCenter)<0.6,
              `${tf}/${candles}/${width}: candles should be centered even with a large saved right gap`);
            assert.ok(Number.isFinite(range.step)&&range.step>0);
          }
        }
      }
    }
  }
  // Ordinary chart navigation retains its original spacing and pan semantics.
  const ordinary=hookChartHorizontalRange(180,390,{barWidth:9,rightOffset:6,fitAll:false},12);
  assert.equal(ordinary.step,9);
  assert.equal(ordinary.virtualEnd,186);
});
