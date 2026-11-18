import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mainSettingHelpText } from '../src/components/hookchart/mainSettingsHelp';
import { OriginalHookChartSettings, normalizeOriginalHookChartPreferences } from '../src/components/hookchart/OriginalHookChartSettings';

const code = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('every Basic HookChart control has its own contextual explanation', () => {
  const source = code('../src/components/hookchart/OriginalHookChartSettings.tsx');
  const start = source.indexOf("{tab === 'main' ? <MainSettingsHelpContext.Provider");
  const levels = source.indexOf("tab === 'levels' ? <MainSettingsHelpContext.Provider");
  const end = source.indexOf("</MainSettingsHelpContext.Provider> : tab === 'chart'");
  assert.ok(start !== -1 && levels > start && end > levels, 'Basic and Levels controls must have help context');
  const lines = source.slice(start, end).split('\n');
  let section = '';
  let controls = 0;
  for (const line of lines) {
    const heading = line.match(/<Section title="([^"]+)"/);
    if (heading) section = heading[1];
    const item = line.match(/<(Setting|SwitchRow|Choice|MultiChoice)\s+label="([^"]+)"/);
    if (!item) continue;
    controls += 1;
    const explanation = mainSettingHelpText(section, item[2]) || line.match(/desc="([^"]+)"/)?.[1];
    assert.ok(explanation && explanation.length >= 35, `Missing explanation: ${section} / ${item[2]}`);
  }
  assert.equal(controls, 88, 'all Basic and Levels settings, including Optimization, must have explanatory help');
  assert.notEqual(mainSettingHelpText('Відносний об’єм (колонка VR)', 'Кількість свічок'),
    mainSettingHelpText('Кількість угод (лише Binance)', 'Кількість свічок'),
    'the same label must explain a different function depending on its section');
});

test('each visible Basic setting renders a contextual question-mark trigger', () => {
  const html = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
    open: true, embedded: true, prefs: normalizeOriginalHookChartPreferences(),
    onChange: () => {}, onApplyStrategy: () => {}, onClose: () => {},
  }));
  // Every visible Basic control, including the three independent large-trade
  // arrow/text controls, has exactly one contextual help trigger.
  assert.equal((html.match(/aria-label="Пояснення: /g) || []).length, 74);
  assert.equal((html.match(/class="visualSettingHelp mainSettingHelp"/g) || []).length, 74);
  assert.match(html, /Пояснення: Максимальний DPR полотна/);
  assert.match(html, /Пояснення: Прогнозні зони Liq · модель за історією/);
  assert.match(html, /Пояснення: Товщина горизонтальної лінії/);
  assert.match(html, /Пояснення: Товщина лінії тренду/);
  assert.match(html, /Пояснення: Товщина трендової лінії \(Скальпер\)/);
  assert.match(html, /Пояснення: Режим Скальпера/);
  assert.match(html, /Пояснення: Показувати підписи Режиму Скальпера/);
  assert.match(html, /Пояснення: Усереднена регресійна лінія/);
  assert.doesNotMatch(html, /Ще не реалізовано/);
  assert.match(html, /Пояснення: Показувати колонку OI/);
  assert.match(html, /Пояснення: Кількість свічок Pavg/);
});

test('tooltips respond to hover, focus and tap without disturbing other HookChart tabs', () => {
  const source = code('../src/components/hookchart/OriginalHookChartSettings.tsx');
  const css = code('../src/components/hookchart/integration.css');
  assert.match(source, /onPointerEnter=\{event =>/);
  assert.match(source, /onPointerLeave=\{event =>/);
  assert.match(source, /onFocus=\{\(\) => setOpen\(true\)\}/);
  assert.match(source, /onClick=\{\(\) => setOpen\(true\)\}/);
  assert.match(source, /aria-describedby=\{open \? tooltipId : undefined\}/);
  assert.match(source, /if \(event\.key === 'Escape' && document\.querySelector\('\.hookchartVisualHelpPopover'\)\) return/);
  assert.match(css, /\.visualSettingHelp\.mainSettingHelp \.visualSettingHelpButton/);
  assert.match(css, /@media \(hover:none\) and \(pointer:coarse\)/);
  assert.match(css, /width:16px/);
  assert.match(css, /min-width:21px/);
  assert.doesNotMatch(source.slice(source.indexOf("tab === 'chart' ? ("), source.indexOf("tab === 'strategies' ? (")), /<MainSettingsHelpContext.Provider/);
});

test('automatic price-level line width and caption font are separate with safe defaults', () => {
  const defaults = normalizeOriginalHookChartPreferences();
  assert.equal(defaults.levelLineWidth, 0.3, 'automatic level lines are 0.3px by default');
  assert.equal(defaults.levelLabelSize, 9, 'level caption text is 9px by default');
  const legacy = normalizeOriginalHookChartPreferences({ levelLabelSize: 16 });
  assert.equal(legacy.levelLineWidth, 0.3, 'old 16px text size must not turn into a 16px line');
  assert.equal(legacy.levelLabelSize, 16);
  const chosen = normalizeOriginalHookChartPreferences({ levelLineWidth: 2.5, levelLabelSize: 14 });
  assert.equal(chosen.levelLineWidth, 2.5);
  assert.equal(chosen.levelLabelSize, 14);
  assert.equal(normalizeOriginalHookChartPreferences({ levelLineWidth: -5 }).levelLineWidth, 0.2);
  assert.equal(normalizeOriginalHookChartPreferences({ levelLineWidth: 100 }).levelLineWidth, 5);
});

test('level-line and caption controls appear next to each other and reach real canvas rendering', () => {
  const settings = code('../src/components/hookchart/OriginalHookChartSettings.tsx');
  const canvas = code('../src/components/hookchart/HookChartCanvas.tsx');
  const engine = code('../src/components/hookchart/engine.tsx');
  const a = settings.indexOf('<Setting label="Розмір міток рівнів">');
  const b = settings.indexOf('<Setting label="Розмір тексту міток рівнів">');
  assert.ok(a >= 0 && b > a && b - a < 350);
  assert.match(settings.slice(a, b), /set\('levelLineWidth', value\)/);
  assert.match(settings.slice(b, b + 275), /set\('levelLabelSize', value\)/);
  assert.match(canvas, /levelLineWidth=\{runtimeSettings\.levelLineWidth \?\? 0\.3\}/);
  assert.match(canvas, /levelLabelSize=\{runtimeSettings\.levelLabelSize \?\? 9\}/);
  assert.match(engine, /q\.lineWidth=autoLevelLineWidth/);
  assert.match(engine, /levelFontSize=Math\.max\(8,Math\.min\(24/);
  assert.match(engine, /levelLabelSize,levelLineWidth,levelLabelStyle/);
  assert.match(engine, /\$\{levelFontSize\}px system-ui/);
  assert.match(mainSettingHelpText('Автоматичні рівні', 'Розмір міток рівнів') ?? '', /товщину ліній/);
  assert.match(mainSettingHelpText('Автоматичні рівні', 'Розмір тексту міток рівнів') ?? '', /текстових підписів/);
});

test('dedicated Levels tab owns the auto levels, S/R and round-number settings without duplicates', () => {
  const settings = code('../src/components/hookchart/OriginalHookChartSettings.tsx');
  assert.match(settings, /onClick=\{\(\) => setTab\('levels'\)\}>\{translateHookChartPhrase\(chartLanguage, 'Рівні'\)\}<\/button>/);
  const main = settings.slice(settings.indexOf("{tab === 'main' ? <MainSettingsHelpContext.Provider"),
    settings.indexOf("tab === 'levels' ? <MainSettingsHelpContext.Provider"));
  const levels = settings.slice(settings.indexOf("tab === 'levels' ? <MainSettingsHelpContext.Provider"),
    settings.indexOf("</MainSettingsHelpContext.Provider> : tab === 'chart'"));
  for (const heading of ['Круглі числа (колонка RN)', 'Підтримка та опір', 'Автоматичні рівні']) {
    const markup = '<Section title="' + heading + '">';
    assert.ok(levels.includes(markup), heading + ' must be under Levels');
    assert.ok(!main.includes(markup), heading + ' must not remain under Basic');
    assert.equal(settings.split(markup).length - 1, 1, heading + ' should not be duplicated');
  }
  for (const label of ['Таймфрейми автовизначення рівнів', 'Колір міток рівнів',
    'Розмір міток рівнів', 'Розмір тексту міток рівнів', 'Підписи рівнів',
    'Пробій', 'Показувати підтримку та опір']) {
    assert.ok(levels.includes('label="' + label + '"'), label + ' must remain configurable');
  }
  assert.match(levels, /value=\{prefs\.levelLineWidth \?\? 0\.3\}/);
  assert.match(levels, /value=\{prefs\.levelLabelSize \?\? 9\} min=\{8\}/);
  const saved = normalizeOriginalHookChartPreferences({ levelLineWidth: 1, levelLabelSize: 11 });
  assert.equal(saved.levelLineWidth, 1);
  assert.equal(saved.levelLabelSize, 11, 'saved preferences survive the new defaults');
});

test('deprecated HookChart Data and Sorting controls are absent from the editor', () => {
  const source = code('../src/components/hookchart/OriginalHookChartSettings.tsx');
  assert.doesNotMatch(source, /Дані та сортування|Типи та порядок сортування|Інтервали аналізу/);
  assert.doesNotMatch(source, /sortEnabled|sortDisabled|analyzedIntervals/);
});
