import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  OriginalHookChartSettings, normalizeOriginalHookChartPreferences,
} from '../src/components/hookchart/OriginalHookChartSettings';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('every chart settings tab uses Hotkeys-size typography', () => {
  const markup = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
    open: true, embedded: true, prefs: normalizeOriginalHookChartPreferences(),
    onChange: () => {}, onApplyStrategy: () => {}, onClose: () => {},
  }));
  assert.match(markup, /class="settingsBody uniformSettingsReadable"/);
  assert.match(markup, /Застосунок/);
  const source = read('../src/components/hookchart/OriginalHookChartSettings.tsx');
  assert.match(source, /className="settingsBody uniformSettingsReadable"/);
  assert.match(source, /<HotkeySettings/);
  assert.match(source, /tab === 'chart'/);
});

test('section titles, settings labels, controls, and category tabs have consistent sizes', () => {
  const css = read('../src/components/hookchart/integration.css');
  const shared = css.slice(css.indexOf('/* HookChart → Основні:'), css.indexOf('/* HookChart → Hotkeys:'));
  assert.ok(shared.length > 1000);
  assert.match(css, /\.hotkeySettings \.settingsSection>h3\s*\{[^}]*font-size:15px/s);
  assert.match(css, /\.hotkeySettings \.hotkeyRow\s*\{[^}]*font-size:14px/s);
  assert.match(css, /\.hotkeySettings \.hotkeyRow>button\s*\{[^}]*font:600 13px/s);
  assert.match(shared, /\.settingsBody\.uniformSettingsReadable \.settingsSection>h3\s*\{[^}]*font-size:15px/s);
  assert.match(shared, /\.settingsBody\.uniformSettingsReadable \.settingText>b\s*\{[^}]*font-size:14px/s);
  assert.match(shared, /\.settingsBody\.uniformSettingsReadable \.numInput,[\s\S]*?\.settingControl select\s*\{[^}]*font-size:13px/s);
  assert.match(shared, /\.settingsBody\.uniformSettingsReadable \.settingText>small\s*\{[^}]*font-size:12px/s);
  assert.match(shared, /\.settingsBody\.uniformSettingsReadable \.settingsChips button,[\s\S]*?font-size:12px/s);
  assert.match(shared, /\.originalSettingsPanel \.settingsTabs button\s*\{[^}]*font-size:14px!important/s);
  assert.doesNotMatch(shared, /\.hookchart-root \.settingText>b\s*\{/);
  assert.match(css, /\.settingsBody\.uniformSettingsReadable \.visualProfileCompact \.visualProfileControls \.settingText>b\s*\{[^}]*font-size:14px/s);
  assert.match(css, /\.settingsBody\.uniformSettingsReadable \.visualProfileCompact \.visualProfileActions \.visualProfileActionButton\s*\{[^}]*font-size:13px/s);
});

test('mobile labels and tab titles match Hotkeys compact size while inputs avoid zoom', () => {
  const css = read('../src/components/hookchart/integration.css');
  const shared = css.slice(css.indexOf('/* HookChart → Основні:'), css.indexOf('/* HookChart → Hotkeys:'));
  assert.match(shared, /@container \(max-width:620px\)/);
  assert.match(shared, /\.settingsBody\.uniformSettingsReadable \.settingText>b\s*\{[^}]*font-size:13px!important/s);
  assert.match(shared, /\.settingsBody\.uniformSettingsReadable \.settingText>small\s*\{[^}]*font-size:12px!important/s);
  assert.match(shared, /\.originalSettingsPanel \.settingsTabs button\s*\{[^}]*font-size:13px!important/s);
  assert.match(shared, /white-space:normal/);
  assert.match(css, /\.originalSettingsPanel \.numInput,[\s\S]*?font-size:16px !important/);
});
