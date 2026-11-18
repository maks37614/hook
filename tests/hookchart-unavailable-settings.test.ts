import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { OriginalHookChartSettings, normalizeOriginalHookChartPreferences } from '../src/components/hookchart/OriginalHookChartSettings';

test('unfinished HookChart settings are hidden without changing stored preferences or working controls', () => {
  const prefs = normalizeOriginalHookChartPreferences({
    rBtcTf: '4h', rBtcCandles: 250, duplicateCrosshair: true,
  });
  const html = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
    open: true, embedded: true, prefs, onChange() {}, onApplyStrategy() {}, onClose() {},
  }));
  const dom = new JSDOM(html);
  const document = dom.window.document;
  assert.equal(document.querySelectorAll('.settingUnavailable, .settingUnavailableNote, .settingUnavailableControl').length, 0);
  assert.doesNotMatch(document.body.textContent ?? '', /Ще не реалізовано/);
  assert.equal(document.querySelectorAll('fieldset[disabled]').length, 0);

  const editor = readFileSync(new URL('../src/components/hookchart/OriginalHookChartSettings.tsx', import.meta.url), 'utf8');
  for (const label of [
    'Зі сповіщень відкривати графіки в новому вікні',
    'Показувати діалог сповіщень у режимі сітки та однієї монети',
    'Розмір вікна в режимі однієї монети',
    'Кнопки гортання в режимі «Усі графіки»',
    'Дублювати перехрестя на графіку',
    'Таблиця ТОП ордерів',
    'Показувати об’єм у базовій монеті',
    'Розраховувати зміну за базовою монетою',
    'Показувати відстань до найближчого круглого числа',
    'Показувати у списку найближчі рівні',
  ]) {
    assert.ok(!editor.includes(`label="${label}"`), `${label} must not appear in the settings UI`);
  }
  assert.doesNotMatch(editor, /<Section title="Кореляція з Біткоїном \(колонка rBTC\)">/);
  assert.doesNotMatch(editor, /\bunavailable\b/);

  for (const label of ['Long (L)', 'Short (S)', 'Ліквідації на графіку']) {
    const control = document.querySelector(`input[aria-label="${label}"]`);
    assert.ok(control, `${label} remains visible`);
    assert.equal(control.matches(':disabled'), false);
  }
  assert.equal(prefs.rBtcTf, '4h', 'hidden values are retained for existing profiles');
  assert.equal(prefs.rBtcCandles, 250);
  assert.equal(prefs.duplicateCrosshair, true);
  dom.window.close();
});
