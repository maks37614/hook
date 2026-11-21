import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { mainSettingHelpText } from '../src/components/hookchart/mainSettingsHelp';
import { OriginalHookChartSettings, normalizeOriginalHookChartPreferences } from '../src/components/hookchart/OriginalHookChartSettings';

const noop = () => {};
test('full settings display this chart’s calculated AUTO sum instead of a saved manual sum', () => {
  for (const densityCut of [312, 45_678, 1_234_567]) {
    const html = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
      open: true, densityCut,
      prefs: normalizeOriginalHookChartPreferences({ densityMode: 'auto', densityThreshold: 987_654 }),
      onChange: noop, onApplyStrategy: noop, onClose: noop,
    }));
    assert.match(html, new RegExp(`<input(?=[^>]*disabled)(?=[^>]*value="${densityCut}")[^>]*>`));
    assert.ok(!html.includes('value="987654"'));
  }
});

test('full settings retain the user’s exact manual floor when AUTO data changes', () => {
  const html = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
    open: true, densityCut: 312,
    prefs: normalizeOriginalHookChartPreferences({ densityMode: 'manual', densityThreshold: 987_654 }),
    onChange: noop, onApplyStrategy: noop, onClose: noop,
  }));
  assert.match(html, /<input(?=[^>]*value="987654")(?![^>]*disabled)[^>]*>/);
});

test('Basic settings group supported density controls, including line appearance, in Щільності', () => {
  const prefs = normalizeOriginalHookChartPreferences({
    densityLineColor: '#123456', densityLabelColor: '#abcdef',
    densityLineWidth: 2, densityLineStyle: 'dot', densityLabelSize: 12,
    densityMode: 'manual', densityThreshold: 250_000,
  });
  const html = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
    open: true, embedded: true, densityCut: 10, prefs, onChange: noop,
    onApplyStrategy: noop, onClose: noop,
  }));
  const dom = new JSDOM(html);
  try {
    const sections = [...dom.window.document.querySelectorAll('.settingsSection')];
    const findSection = (title: string) => sections.filter(section => section.querySelector(':scope > h3')?.textContent?.trim() === title);
    assert.equal(findSection('Щільності').length, 1, 'only one new density category is shown');
    assert.equal(findSection('Великі лімітні заявки (колонка O)').length, 0, 'old category must be removed');
    const density = findSection('Щільності')[0];
    const appearance = findSection('Оформлення графіка')[0];
    assert.ok(appearance, 'candlestick styling stays in Appearance');
    const labels = [...density.querySelectorAll('.settingRow .settingText > b')]
      .map(node => node.textContent!.replace(/\?/g, '').trim());
    const expected = [
      'Аналіз великих лімітних заявок (щільностей)',
      'Таблиця ТОП ордерів',
      'Показувати об’єм у базовій монеті',
      'Показувати дисбаланс',
      'Щільності на графіку',
      'Колір ліній щільностей',
      'Колір міток щільностей',
      'Товщина лінії',
      'Вигляд лінії',
      'Розмір мітки',
      'Таймаут великих лімітних ордерів',
      'Дистанція від ціни',
      'Пороговий об’єм великих ордерів',
      'Що показувати в AUTO',
      'Множник порогу AUTO',
      'Показувати великі ордери лише поруч із рівнями',
    ];
    // The latest simplified HookChart hides these two unfinished controls.
    // Older releases may still show both; never accept a half-removed pair.
    const optional = ['Таблиця ТОП ордерів', 'Показувати об’єм у базовій монеті'];
    const enabledOptional = optional.filter(label => labels.includes(label));
    assert.ok(enabledOptional.length === 0 || enabledOptional.length === optional.length,
      'unfinished depth-table controls must be shown together or hidden together');
    const visibleExpected = enabledOptional.length ? expected
      : expected.filter(label => !optional.includes(label));
    assert.deepEqual(labels, visibleExpected, 'visible density controls must remain grouped without duplicates');
    for (const label of visibleExpected) {
      assert.ok(mainSettingHelpText('Щільності', label), `missing moved hint: ${label}`);
      assert.equal(sections.reduce((n, section) => n + Number([...section.querySelectorAll('.settingRow .settingText > b')]
        .some(el => el.textContent!.replace(/\?/g, '').trim() === label)), 0), 1,
        `setting ${label} must appear in one section only`);
    }
    const appearanceLabels = [...appearance.querySelectorAll('.settingRow .settingText > b')]
      .map(el => el.textContent!.replace(/\?/g, '').trim());
    assert.deepEqual(appearanceLabels, ['Палітра графіка', 'Свічка Long', 'Свічка Short']);
    const row = (label: string) => [...density.querySelectorAll('.settingRow')].find(el =>
      el.querySelector('.settingText > b')?.textContent?.replace(/\?/g, '').trim() === label)!;
    assert.equal(row('Колір ліній щільностей').querySelector('input[type="color"]')?.getAttribute('value'), '#123456');
    assert.equal(row('Колір міток щільностей').querySelector('input[type="color"]')?.getAttribute('value'), '#abcdef');
    assert.equal((row('Товщина лінії').querySelector('input.numInput') as HTMLInputElement).value, '2');
    assert.equal((row('Розмір мітки').querySelector('input.numInput') as HTMLInputElement).value, '12');
    assert.equal(row('Вигляд лінії').querySelector('button.sel')?.textContent, 'Крапки');
    assert.equal(row('Пороговий об’єм великих ордерів').querySelector('input.numInput')?.getAttribute('value'), '250000');
  } finally {
    dom.window.close();
  }
});

test('moving density settings preserves handlers and global palette behaviour', () => {
  const source = readFileSync(new URL('../src/components/hookchart/OriginalHookChartSettings.tsx', import.meta.url), 'utf8');
  const heading = source.indexOf('<Section title="Щільності">');
  const end = source.indexOf('</Section>', heading);
  const section = source.slice(heading, end);
  const appearance = source.slice(source.indexOf('<Section title="Оформлення графіка">'),
    source.indexOf('</Section>', source.indexOf('<Section title="Оформлення графіка">')));
  assert.ok(heading > 0 && end > heading);
  for (const key of ['densityLineColor', 'densityLabelColor', 'densityLineWidth', 'densityLineStyle', 'densityLabelSize',
    'densityAnalysis', 'densityMode', 'densityThreshold', 'densityAutoMultiplier', 'densityAutoDisplay']) {
    assert.ok(section.includes(key), `density control ${key} remains wired`);
  }
  assert.match(section, /showDensityLines/);
  assert.match(section, /showDensityLabels/);
  assert.match(section, /showDensityAmounts/);
  assert.match(appearance, /densityLineColor/,'full chart palette still sets density line color');
  assert.match(appearance, /densityLabelColor/,'full chart palette still sets density label color');
});

test('density settings explicitly display USDT without changing the saved cutoff', () => {
  const html = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
    open:true, densityCut:100000, densityQuote:'USDT', prefs:normalizeOriginalHookChartPreferences({}),
    onChange:noop,onApplyStrategy:noop,onClose:noop,
  }));
  const dom = new JSDOM(html);
  try { assert.ok(dom.window.document.querySelector('.densityModeRow')?.textContent?.includes('USDT')); }
  finally {dom.window.close();}
});
