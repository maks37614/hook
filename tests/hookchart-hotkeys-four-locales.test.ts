import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_HOOKCHART_HOTKEYS, HOTKEY_GROUPS, HotkeySettings } from '../src/components/hookchart/OriginalHookChartSettings';
import {
  HOOKCHART_HOTKEY_ACTION_LABELS, HOOKCHART_HOTKEY_GROUP_LABELS, HOOKCHART_HOTKEY_UI,
  hotkeyActionLabel, hotkeyGroupLabel,
} from '../src/locales/hookchartHotkeys';

const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const languages = ['uk', 'en', 'pl', 'ru'] as const;
const cyrillic = /[А-Яа-яІіЇїЄєҐґ]/;

test('all 24 HookChart hotkey actions and four groups have four-language labels', () => {
  const ids = HOTKEY_GROUPS.flatMap(group => group.rows.map(row => row.id));
  assert.equal(ids.length, Object.keys(DEFAULT_HOOKCHART_HOTKEYS).length);
  assert.equal(new Set(ids).size, ids.length);
  for (const language of languages) {
    const copy = HOOKCHART_HOTKEY_UI[language];
    for (const value of Object.values(copy)) assert.ok(value?.trim(), language);
    for (const group of HOTKEY_GROUPS) {
      const label = hotkeyGroupLabel(language, group.title);
      assert.equal(label, HOOKCHART_HOTKEY_GROUP_LABELS[language][group.title]);
      assert.ok(label.trim());
      if (language === 'en' || language === 'pl') assert.doesNotMatch(label, cyrillic);
      for (const row of group.rows) {
        const value = hotkeyActionLabel(language, row.id, row.label);
        assert.ok(value.trim(), language + ': ' + row.id);
        if (language === 'uk') assert.equal(value, row.label);
        else assert.equal(value, HOOKCHART_HOTKEY_ACTION_LABELS[language][row.id]);
        if (language === 'en' || language === 'pl') assert.doesNotMatch(value, cyrillic, language + ': ' + row.id);
      }
    }
  }
});

test('Hotkeys settings render labels, hints, reset and accessible buttons in each language', () => {
  for (const language of languages) {
    const html = renderToStaticMarkup(React.createElement(HotkeySettings, {
      language, hotkeys: { ...DEFAULT_HOOKCHART_HOTKEYS, cancel: '' }, setHotkeys: () => {},
    }));
    const copy = HOOKCHART_HOTKEY_UI[language];
    assert.ok(html.includes(copy.instructions), language + ': instructions');
    assert.ok(html.includes(copy.reset), language + ': reset');
    assert.ok(html.includes(copy.record) === false, 'press-keys prompt only appears while recording');
    assert.ok(html.includes(copy.unassigned), language + ': empty shortcut');
    for (const group of HOTKEY_GROUPS) {
      assert.ok(html.includes(hotkeyGroupLabel(language, group.title)), language + ': group ' + group.title);
      for (const row of group.rows) {
        const label = hotkeyActionLabel(language, row.id, row.label);
        assert.ok(html.includes(label), language + ': action ' + row.id);
        assert.ok(html.includes(`aria-label="${copy.clear}: ${label}"`), language + ': clear ' + row.id);
        assert.ok(html.includes(`aria-label="${copy.reset}: ${label}"`), language + ': reset ' + row.id);
      }
    }
    if (language === 'en' || language === 'pl') {
      // Original Ukrainian section IDs are intentionally retained for the
      // HookChart guide; they are not visible or announced to the user.
      const visibleAndAccessible = html.replace(/ data-hookchart-guide-section="[^"]*"/g, '');
      assert.doesNotMatch(visibleAndAccessible, cyrillic, language + ': untranslated Cyrillic text in Hotkeys UI');
    }
  }
});

test('chart settings and Terminal share exactly one hotkey translation source', () => {
  const settings = source('../src/components/hookchart/OriginalHookChartSettings.tsx');
  const terminal = source('../src/components/terminal/TerminalHotkeysDialog.tsx');
  assert.match(settings, /language=\{chartLanguage\}/);
  assert.match(settings, /HOOKCHART_HOTKEY_UI\[chartLanguage\]\.title/);
  assert.match(settings, /hotkeyActionLabel\(language, row\.id, row\.label\)/);
  assert.match(terminal, /hotkeyActionLabel\(language, row\.id, row\.label\)/);
  assert.match(terminal, /hotkeyGroupLabel\(language, group\.title\)/);
  assert.doesNotMatch(terminal, /const CHART_LABELS:/);
  assert.doesNotMatch(settings, />Натисніть на комбінацію та введіть нову\./);
  assert.doesNotMatch(terminal, /\$\{row\.label\}: /);
});
