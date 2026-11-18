import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { OriginalHookChartSettings, normalizeOriginalHookChartPreferences } from '../src/components/hookchart/OriginalHookChartSettings';
import { translateHookChartPhrase } from '../src/locales/hookchartLanguage';

const source = readFileSync(new URL('../src/components/hookchart/OriginalHookChartSettings.tsx', import.meta.url), 'utf8');

test('HookChart settings render translated sections, labels and options in all four languages', () => {
  for (const language of ['uk', 'en', 'pl', 'ru'] as const) {
    const title = translateHookChartPhrase(language, 'Налаштування графіка');
    assert.ok(title.trim(), language + ': missing chart settings title');
    if (language !== 'uk') assert.notEqual(title, 'Налаштування графіка');
    const html = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
      open: true, embedded: true, language, prefs: normalizeOriginalHookChartPreferences(),
      onChange: () => {}, onApplyStrategy: () => {}, onClose: () => {},
    }));
    for (const key of ['Інтерфейс', 'Максимальна історія свічок',
      'Панель інструментів на графіку', 'Об’єми на графіку', 'Застосунок']) {
      const expected = translateHookChartPhrase(language, key);
      assert.ok(html.includes('>' + expected), language + ': missing rendered text ' + key);
      if (language === 'en' || language === 'pl') {
        assert.notEqual(expected, key, language + ': untranslated label ' + key);
        assert.ok(!html.includes('>' + key + '<'), language + ': Ukrainian UI text ' + key);
      }
    }
    assert.ok(html.includes('data-hookchart-language="' + language + '"'),
      language + ': chart settings must scope global translations to the chosen chart language');
    const toggle = translateHookChartPhrase(language, 'Панель інструментів на графіку');
    assert.ok(html.includes('aria-label="' + toggle + '"'), language + ': untranslated switch accessible name');
    assert.ok(html.includes('data-hookchart-guide-setting="Максимальна історія свічок"'),
      'guide selectors must keep their stable source keys');
    assert.ok(html.includes('data-hookchart-guide-section="Інтерфейс"'),
      'contextual help lookups must retain original section keys');
    assert.ok(html.includes('>Українська<') && html.includes('>Polski<')
      && html.includes('>Русский<') && html.includes('>English<'),
      'language names remain recognizable endonyms');
  }
});

test('chart status, retry and visual-profile feedback have explicit four-language translations', () => {
  const keys = [
    'Налаштування', 'Закрити', 'Повторити',
    'Підвантаження старіших свічок…', 'API не повернув старіших свічок.',
    'Не вдалося завантажити всю історію.',
    ' Зберігаємо…', ' Збережено.', ' Помилка збереження: перевірте підключення.',
  ];
  for (const key of keys) {
    for (const language of ['en', 'pl', 'ru'] as const) {
      const actual = translateHookChartPhrase(language, key);
      assert.ok(actual.trim(), language + ': missing ' + key);
      assert.notEqual(actual, key, language + ': still in Ukrainian ' + key);
      if (language !== 'ru') assert.doesNotMatch(actual, /[А-Яа-яІіЇїЄєҐґ]/, language + ': untranslated ' + key);
    }
  }
});

test('strategy and visual chart-type content use the current chart language without changing keys', () => {
  assert.match(source, /const t = \(source: string\) => translateHookChartPhrase\(language, source\)/);
  assert.match(source, /<b>\{t\(preset\.name\)\}<\/b>/);
  assert.match(source, /<p>\{t\(preset\.description\)\}<\/p>/);
  assert.match(source, /\{t\(STRATEGY_FUTURES_NOTE\)\}/);
  assert.match(source, /\{t\(bullet\)\}/);
  assert.match(source, /translateHookChartPhrase\(language, chosen\.label\)/);
  assert.match(source, /translateHookChartPhrase\(language, context\.label\)/);
  assert.match(source, /translateHookChartPhrase\(chartLanguage, 'Налаштування hookchart'\)/);
});

test('candle-history loading and retry status are rendered in each chart language', () => {
  for (const language of ['en', 'pl', 'ru'] as const) {
    const html = renderToStaticMarkup(React.createElement(OriginalHookChartSettings, {
      open: true, language, prefs: normalizeOriginalHookChartPreferences(),
      loadedCandles: 400, historyStatus: 'limited', onRetryHistory: () => {},
      onChange: () => {}, onApplyStrategy: () => {}, onClose: () => {},
    }));
    const status = translateHookChartPhrase(language, '· API не повернув старіших свічок.');
    assert.notEqual(status, '· API не повернув старіших свічок.', language);
    assert.ok(html.includes(status), language + ': missing translated limited-history status');
    const retry = translateHookChartPhrase(language, 'Повторити');
    assert.ok(html.includes('>' + retry + '</button>'), language + ': missing localized retry action');
  }
});
