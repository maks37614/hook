import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mergeHookPreferences } from '../src/utils/hookchartData';
import { OriginalHookChartSettings, normalizeOriginalHookChartPreferences } from '../src/components/hookchart/OriginalHookChartSettings';
import { STRATEGY_PRESETS, strategyPreferencePatch, strategyOiDelta, evaluateStrategy } from '../src/components/hookchart/strategyEngine';
import type { HookChartPreferences } from '../src/types';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('one shared chart editor can render inside the profile without a nested dialog', () => {
  const html = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
    open: true,
    embedded: true,
    prefs: normalizeOriginalHookChartPreferences(),
    onChange: () => {},
    onApplyStrategy: () => {},
    onClose: () => {},
  }));
  assert.match(html, /embeddedSettingsBackdrop/);
  assert.match(html, /role="region"/);
  assert.doesNotMatch(html, /aria-modal="true"/);
  assert.match(html, /<b>Налаштування<\/b>/);
  assert.doesNotMatch(html, /<b>Налаштування графіка<\/b>/);
  assert.match(html, /aria-label="Про налаштування графіка"/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /Параметри зберігаються автоматично/);
  assert.doesNotMatch(html, /Усі налаштування зберігаються автоматично/);
  assert.match(html, /Стратегії/);
  assert.match(html, /Гарячі клавіші/);
  assert.match(html, /Максимальна історія свічок/);
  assert.match(html, /aria-label="Пояснення: Максимальна історія свічок"/);
  assert.doesNotMatch(html, /Фактична кількість свічок залежить від біржі/,
    'inline duplicate descriptions were replaced with contextual ? help');
  assert.doesNotMatch(html, /Завантажено:.*0/);
});

test('profile Graph tab mounts the same settings editor and saves profile deltas', () => {
  const modal = source('../src/components/UserProfileModal.tsx');
  const shared = source('../src/components/profile/ProfileHookChartSettings.tsx');
  assert.match(modal, /Графік/);
  assert.match(modal, /activeProfileSection === 'chart'/);
  assert.match(modal, /<ProfileHookChartSettings/);
  assert.match(shared, /<OriginalHookChartSettings/);
  assert.match(shared, /embedded/);
  assert.match(shared, /hookChartPreferences: delta/);
  assert.match(shared, /setTimeout\(flush, 500\)/);
  assert.match(shared, /siteLanguageAtSelection/);
});

test('chart help text lives in a touch-friendly profile-only popup', () => {
  const editor = source('../src/components/hookchart/OriginalHookChartSettings.tsx');
  const profile = source('../src/components/profile/ProfileHookChartSettings.tsx');
  const css = source('../src/components/hookchart/integration.css');
  assert.match(editor, /className="profileSettingsHelpButton"/);
  assert.match(editor, /role="tooltip" className="profileSettingsHelpPopover"/);
  assert.match(editor, /Налаштування HookChart для Скрінера, Формацій і Термінала/);
  assert.match(editor, /Усі налаштування зберігаються автоматично/);
  assert.match(editor, /onClick=\{\(\) => setHeaderHelpOpen\(value => !value\)\}/);
  assert.match(editor, /document\.addEventListener\('pointerdown', onPointerDown\)/);
  assert.match(editor, /event\.key === 'Escape'/);
  assert.doesNotMatch(profile, /<p>Налаштування HookChart для Скрінера/);
  assert.match(css, /\.hookchart-root\.profile-hookchart-settings \.profileSettingsHelpPopover/);
  assert.match(css, /width:min\(350px,calc\(100% - 20px\)\)/);
});

test('strategy selection sends exactly the same settings patch from profile and chart', () => {
  const ids = STRATEGY_PRESETS.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'strategy identifiers must be unique');
  assert.ok(ids.length >= 10, 'strategies are available');
  assert.deepEqual(strategyPreferencePatch(''), { strategyId: '' });
  assert.equal(strategyPreferencePatch('not-a-strategy'), null);
  for (const preset of STRATEGY_PRESETS) {
    const patch = strategyPreferencePatch(preset.id)!;
    assert.equal(patch.strategyId, preset.id);
    for (const [key, value] of Object.entries(preset.settings)) {
      assert.deepEqual((patch as unknown as Record<string, unknown>)[key], value, `${preset.id}: ${key}`);
    }
    assert.ok(preset.requiredTfs.length > 0, `${preset.id} has timeframe prerequisites`);
  }
  const profile = source('../src/components/profile/ProfileHookChartSettings.tsx');
  const canvas = source('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(profile, /strategyPreferencePatch\(id\)/);
  assert.match(canvas, /strategyPreferencePatch\(id\)/);
});

test('parallel profile writes merge independent chart preferences without deleting drawings', () => {
  const old: HookChartPreferences = { strategyId: 'impulse_15m', maxChartCandles: 500, drawings: { 'shared:BTCUSDT': [{ id:'a', type:'trend', pts:[] }] } };
  const withProfile = mergeHookPreferences(old, { maxChartCandles: 2000 });
  assert.equal(withProfile.strategyId, 'impulse_15m');
  assert.equal(withProfile.maxChartCandles, 2000);
  assert.equal(withProfile.drawings?.['shared:BTCUSDT']?.[0].id, 'a');
  const withChart = mergeHookPreferences(withProfile, { strategyId: 'breakout_early' });
  assert.equal(withChart.maxChartCandles, 2000);
  assert.equal(withChart.strategyId, 'breakout_early');
});

test('OI comparison requires actual 1h/12h history; missing samples cannot fake a full window', () => {
  const hour = 60*60*1000;
  const rows = [{t:hour, v:100},{t:2*hour, v:110},{t:3*hour, v:120}];
  assert.equal(strategyOiDelta(rows, hour), (120/110-1)*100);
  assert.ok(Math.abs(strategyOiDelta(rows, 2*hour) - 20) < 1e-10,
    'two-hour OI comparison is approximately 20%, within floating-point precision');
  assert.ok(Number.isNaN(strategyOiDelta(rows, 12*hour)));
  assert.ok(Number.isNaN(strategyOiDelta(rows.slice(0,1), hour)));
});

test('all preset evaluators tolerate missing market data without emitting imaginary events', () => {
  for (const preset of STRATEGY_PRESETS) {
    const result = evaluateStrategy(preset, {
      series:{}, chartCandles:[], levels:[], densities:[],
      book:{ a:[], b:[] }, oiHistory:[], fundingHistory:[],
      fundingRate:NaN, currentPrice:100, cascadeRisk:0,
    });
    assert.equal(result.presetId,preset.id);
    assert.deepEqual(result.events,[]);
  }
});

test('profile chart tab stays in flow on mobile and fills a taller desktop panel', () => {
  const modal = source('../src/components/UserProfileModal.tsx');
  const styles = source('../src/components/hookchart/integration.css');

  assert.match(modal, /activeProfileSection === 'chart'/);
  assert.match(modal, /h-\[min\(92dvh,1000px\)\]/);
  assert.match(modal, /max-h-\[calc\(100dvh-32px\)\]/);
  assert.match(modal, /'min-h-0 flex-1 overflow-hidden p-0'/);
  assert.ok(!modal.includes("activeProfileSection === 'chart' ? 'flex-1'"));

  const begin = styles.lastIndexOf('/* Profile-only embedded chart settings.');
  const end = styles.indexOf('/* Help beside the Long / Short controls;', begin);
  assert.ok(begin > 0 && end > begin, 'only profile editor styles are overridden');
  const profileStyles = styles.slice(begin, end);
  assert.match(profileStyles, /\.hookchart-root\.profile-hookchart-settings \.originalSettingsBackdrop\.embeddedSettingsBackdrop/);
  assert.match(profileStyles, /position:relative!important/);
  assert.match(profileStyles, /inset:auto!important/);
  assert.match(profileStyles, /display:flex!important/);
  assert.match(profileStyles, /background:transparent!important/);
  assert.match(profileStyles, /height:100%!important/);
  assert.match(profileStyles, /max-height:100%!important/);
  assert.match(profileStyles, /border:0!important/);
  assert.match(profileStyles, /border-radius:0!important/);
  assert.match(profileStyles, /background:transparent!important/);
  assert.ok(profileStyles.includes('.hookchart-root.profile-hookchart-settings .originalSettingsPanel .settingsHeader'));
  assert.match(profileStyles, /-webkit-overflow-scrolling:touch/);
  assert.doesNotMatch(profileStyles, /height:min\(65dvh,620px\)/);
});

test('HookChart Hotkeys use Strategies-sized readable typography in chart popup and stay responsive', () => {
  const styles = source('../src/components/hookchart/integration.css');
  const begin = styles.indexOf('/* HookChart → Hotkeys: match the legibility of the Strategies tab.');
  const end = styles.indexOf('/* Profile-only embedded chart settings.', begin);
  assert.ok(begin > 0 && end > begin, 'Hotkeys styles must stay isolated from other settings');
  const rules = styles.slice(begin, end);
  assert.match(rules, /\.hotkeySettings \.settingsHint \{/);
  assert.match(rules, /font-size:12px/);
  assert.match(rules, /\.hotkeySettings \.settingsSection>h3 \{/);
  assert.match(rules, /font-size:15px/);
  assert.match(rules, /\.hotkeySettings \.hotkeyRow \{/);
  assert.match(rules, /font-size:14px/);
  assert.match(rules, /font:600 13px\/1\.3 system-ui/);
  assert.match(rules, /min-height:48px/);
  assert.match(rules, /min-height:36px/);
  assert.match(rules, /@container \(max-width:620px\)/);
  assert.match(rules, /grid-template-areas:"label label label" "shortcut clear reset"/);
  assert.match(rules, /\.hotkeySettings \.resetHotkeys:focus-visible/);
  const ruleLines = rules.split('\n').filter(line => line.trim().startsWith('.hookchart-root'));
  assert.ok(ruleLines.every(line => line.includes('.hotkeySettings')), 'never change Strategies or other chart tabs');
  const editor = source('../src/components/hookchart/OriginalHookChartSettings.tsx');
  assert.match(editor, /<HotkeySettings/);
  assert.match(editor, /hotkeyDisplay\(hotkeys\[row.id\]\)/);
  assert.match(editor, /hotkeyFromEvent\(event\)/);
});

test('profile hotkeys use desktop-only readable fonts and buttons without changing charts or mobile', () => {
  const styles = source('../src/components/hookchart/integration.css');
  const begin = styles.indexOf('/* Larger, readable keyboard shortcut editor only inside Profile > Chart,');
  const end = styles.indexOf('/* Help beside the Long / Short controls;', begin);
  assert.ok(begin > 0 && end > begin, 'profile hotkey overrides are isolated');
  const rules = styles.slice(begin, end);
  assert.ok(rules.includes('@media (min-width:1024px)'));
  assert.ok(rules.includes('.hookchart-root.profile-hookchart-settings .hotkeySettings .hotkeyRow'));
  assert.ok(rules.includes('font-size:14px'));
  assert.ok(rules.includes('font:600 13px/1.2 system-ui'));
  assert.ok(rules.includes('min-height:48px'));
  assert.ok(rules.includes('height:34px'));
  assert.ok(!rules.includes('.hookchart-root .hotkeyRow{'));
});

test('desktop profile Graph editor enlarges all settings tabs, controls and strategy cards', () => {
  const styles = source('../src/components/hookchart/integration.css');
  const start = styles.indexOf('/* Desktop readability for the entire embedded Profile > Chart editor.');
  const end = styles.indexOf('/* Larger, readable keyboard shortcut editor only inside Profile > Chart,', start);
  assert.ok(start >= 0 && end > start, 'desktop profile-only styles exist');
  const desktop = styles.slice(start, end);
  assert.ok(desktop.includes('@media (min-width:1024px)'));
  assert.ok(desktop.includes('.hookchart-root.profile-hookchart-settings .settingsTabs button'));
  assert.ok(desktop.includes('font-size:14px!important'));
  assert.ok(desktop.includes('.hookchart-root.profile-hookchart-settings .settingText>b'));
  assert.ok(desktop.includes('.hookchart-root.profile-hookchart-settings .settingText>small'));
  assert.ok(desktop.includes('.hookchart-root.profile-hookchart-settings .settingsSwitch'));
  assert.ok(desktop.includes('.hookchart-root.profile-hookchart-settings .settingsChips button'));
  assert.ok(desktop.includes('.hookchart-root.profile-hookchart-settings .numInput'));
  assert.ok(desktop.includes('.hookchart-root.profile-hookchart-settings .strategySettings .strategyCard'));
  assert.ok(desktop.includes('font-size:16px'));
  // Every selector is scoped to the profile editor, never global HookChart.
  const selectorLines = desktop.split('\n').filter(line => line.trim().startsWith('.hookchart-root'));
  assert.ok(selectorLines.length >= 20);
  assert.ok(selectorLines.every(line => line.includes('.profile-hookchart-settings')));
});

test('manually drawn trend and horizontal widths default to 0.4 px and remain adjustable independently', () => {
  const defaults = normalizeOriginalHookChartPreferences();
  assert.equal(defaults.horizontalDrawingLineWidth, 0.4);
  assert.equal(defaults.trendDrawingLineWidth, 0.4);
  assert.equal(normalizeOriginalHookChartPreferences({ trendDrawingLineWidth: 0.35 }).trendDrawingLineWidth, 0.35);
  assert.equal(normalizeOriginalHookChartPreferences({ trendDrawingLineWidth: 0 }).trendDrawingLineWidth, 0.2);
  assert.equal(normalizeOriginalHookChartPreferences({ trendDrawingLineWidth: 25 }).trendDrawingLineWidth, 5);
  assert.equal(normalizeOriginalHookChartPreferences({ trendDrawingLineWidth: NaN }).trendDrawingLineWidth, 0.4);

  const editor = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
    open: true, embedded: true, prefs: defaults, onChange: () => {}, onApplyStrategy: () => {}, onClose: () => {},
  }));
  assert.match(editor, /Товщина горизонтальної лінії/);
  assert.match(editor, /Товщина лінії тренду/);
  assert.match(editor, /Інструменти малювання/);

  const canvas = source('../src/components/hookchart/HookChartCanvas.tsx');
  const engine = source('../src/components/hookchart/engine.tsx');
  assert.match(canvas, /horizontalDrawingLineWidth=\{runtimeSettings\.horizontalDrawingLineWidth \?\? 0\.4\}/);
  assert.match(canvas, /trendDrawingLineWidth=\{runtimeSettings\.trendDrawingLineWidth \?\? 0\.4\}/);
  assert.match(engine, /q\.lineWidth=d\.type==='trend'\?trendStrokeWidth:/);
  assert.match(engine, /q\.lineWidth=tool==='trend'\?trendStrokeWidth:1\.25/);
  assert.match(engine, /crosshairLineWidth,maxCanvasDpr,horizontalDrawingLineWidth,trendDrawingLineWidth,scalperLineWidth,symbol,tf,draft/);
});
