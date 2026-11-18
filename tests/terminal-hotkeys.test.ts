import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TERMINAL_SHORTCUTS, DEFAULT_TERMINAL_HOTKEYS, terminalShortcutAction, displayTerminalShortcut, normalizeTerminalHotkeys, terminalHotkeyStorageKey } from '../src/utils/terminalHotkeys';
import { DEFAULT_HOOKCHART_HOTKEYS, HOTKEY_GROUPS } from '../src/components/hookchart/OriginalHookChartSettings';
import { translateKey } from '../src/locales';

const page = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
const dialog = readFileSync(new URL('../src/components/terminal/TerminalHotkeysDialog.tsx', import.meta.url), 'utf8');

function key(code: string, overrides: Partial<KeyboardEvent> = {}) {
  return { code, altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, repeat: false, ...overrides };
}

test('Terminal page actions are unique, mapped to real Alt+Shift chords, and avoid chart defaults', () => {
  assert.equal(new Set(TERMINAL_SHORTCUTS.map(row => row.id)).size, TERMINAL_SHORTCUTS.length);
  assert.equal(new Set(TERMINAL_SHORTCUTS.map(row => row.code)).size, TERMINAL_SHORTCUTS.length);
  const chartShortcuts = Object.values(DEFAULT_HOOKCHART_HOTKEYS).flatMap(value => value.split('|'));
  for (const row of TERMINAL_SHORTCUTS) {
    const input = row.id === 'exitTerminal' ? key('Escape', { altKey: false, shiftKey: false }) : key(row.code);
    assert.equal(terminalShortcutAction(input), row.id);
    const binding = DEFAULT_TERMINAL_HOTKEYS[row.id];
    assert.equal(chartShortcuts.includes(binding) && binding !== 'Escape', false, row.id);
    assert.ok(displayTerminalShortcut(binding).length > 0);
  }
  for (const invalid of [
    key('KeyH', { altKey: false }), key('KeyH', { shiftKey: false }),
    key('KeyH', { ctrlKey: true }), key('KeyH', { metaKey: true }),
    key('KeyH', { repeat: true }), key('KeyZ'),
  ]) assert.equal(terminalShortcutAction(invalid), null);
});

test('terminal shortcuts are editable per account, correctly normalized, and preserve Escape', () => {
  const userA = terminalHotkeyStorageKey('alice');
  const userB = terminalHotkeyStorageKey('bob');
  assert.notEqual(userA, userB);
  assert.equal(DEFAULT_TERMINAL_HOTKEYS.exitTerminal, 'Escape');
  const custom = normalizeTerminalHotkeys({ help: 'Ctrl+KeyH', favorites: '', exitTerminal: 'Ctrl+Escape' });
  assert.equal(terminalShortcutAction(key('KeyH', { ctrlKey: true, altKey: false, shiftKey: false }), custom), 'help');
  assert.equal(terminalShortcutAction(key('KeyH'), custom), null);
  assert.equal(terminalShortcutAction(key('Escape', { ctrlKey: true, altKey: false, shiftKey: false }), custom), 'exitTerminal');
  assert.equal(terminalShortcutAction(key('KeyF'), custom), null);
  assert.equal(normalizeTerminalHotkeys().exitTerminal, 'Escape');
});

test('hotkeys icon sits immediately before autoscale in both responsive header groups', () => {
  assert.match(page, /const renderHotkeysButton = \(\) =>/);
  assert.match(page, /data-terminal-hotkeys-trigger="true"/);
  const pattern = /\{renderHotkeysButton\(\)\}\s*\{renderAutoScaleButton\(\)\}/g;
  assert.equal([...page.matchAll(pattern)].length, 2);
  assert.match(page, /<Keyboard className="h-4 w-4"/);
  assert.match(page, /if \(showHotkeys\) \{/);
});

test('all general shortcut actions are wired to the Terminal itself', () => {
  for (const row of TERMINAL_SHORTCUTS) {
    assert.match(page, new RegExp(`case '${row.id}':`), 'Missing working shortcut: ' + row.id);
  }
  assert.match(page, /if \(target\?\.closest\('input, textarea, select, \[contenteditable\], \[role="dialog"\]'\)\) return;/);
  assert.match(page, /if \(event\.defaultPrevented \|\| event\.isComposing/);
  assert.match(page, /!canGoBack/);
  assert.match(page, /!canGoForward/);
  assert.match(page, /blocks\.length >= MAX_TERMINAL_CHARTS/);
});

test('chart hotkey menu uses the same actual chart actions and saves into profile', () => {
  assert.ok(HOTKEY_GROUPS.flatMap(group => group.rows).length >= 20);
  assert.match(dialog, /HOTKEY_GROUPS\.map\(group =>/);
  assert.match(dialog, /DEFAULT_HOOKCHART_HOTKEYS/);
  assert.match(dialog, /hotkeyFromEvent\(event\)/);
  assert.match(dialog, /onSaveChartHotkeys\(next\)/);
  assert.match(dialog, /onSavePageHotkeys/);
  assert.match(dialog, /editingPage/);
  assert.match(dialog, /reserved\(value, 'page', editingPage\)/);
  assert.match(dialog, /role="dialog" aria-modal="true"/);
  assert.match(page, /updateProfileData\(\{\s*hookChartPreferences: \{ hotkeys \}/);
  assert.match(page, /terminalLinkSettings: \{ \.\.\.settings, enabled: !settings.enabled \}/);
  assert.match(page, /terminalShortcutAction\(event, terminalHotkeys\)/);
});

test('hotkeys button and visible dialog labels are translated in four site languages', () => {
  const expected: Record<'uk'|'en'|'pl'|'ru', string> = {
    uk: 'Гарячі клавіші', en: 'Keyboard shortcuts',
    pl: 'Skróty klawiszowe', ru: 'Горячие клавиши',
  };
  for (const language of ['uk','en','pl','ru'] as const) {
    assert.equal(translateKey(language, 'terminal.hotkeys.title'), expected[language]);
  }
  for (const property of ['uk:', 'en:', 'pl:', 'ru:']) {
    assert.ok(dialog.includes(property), property);
  }
});
