import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_HOOKCHART_HOTKEYS, HOTKEY_GROUPS } from '../src/components/hookchart/OriginalHookChartSettings';
import { hotkeyActionLabel, hotkeyGroupLabel } from '../src/locales/hookchartHotkeys';
import {
  DEFAULT_TERMINAL_HOTKEYS, normalizeTerminalHotkeys,
  terminalShortcutAction,
} from '../src/utils/terminalHotkeys';

const chart = readFileSync('src/components/hookchart/HookChartCanvas.tsx', 'utf8');
const engine = readFileSync('src/components/hookchart/engine.tsx', 'utf8');
const page = readFileSync('src/components/TerminalPage.tsx', 'utf8');
const item = readFileSync('src/components/terminal/TerminalChartWidget.tsx', 'utf8');
const menu = readFileSync('src/components/terminal/TerminalHotkeysDialog.tsx', 'utf8');

test('the five chart data/inspection shortcuts are real, remappable and localized', () => {
  const entries = [
    'toggleDensity', 'toggleLiquidations', 'toggleLiqCandleSums',
    'toggleMarketPrintSums', 'toggleMagnifier',
  ] as const;
  const ids = HOTKEY_GROUPS.flatMap(group => group.rows).map(row => row.id);
  for (const action of entries) {
    assert.ok(ids.includes(action), action);
    assert.ok(DEFAULT_HOOKCHART_HOTKEYS[action].startsWith('Alt+Shift+'));
    assert.ok(chart.includes(`use('${action}')`), action + ' must have a live chart handler');
    for (const locale of ['uk', 'en', 'pl', 'ru'] as const) {
      assert.ok(hotkeyActionLabel(locale, action, action).length > 3, locale + ':' + action);
    }
  }
  assert.ok(hotkeyGroupLabel('en', 'Відображення даних').includes('Display'));
  assert.match(chart, /changeSettings\(\{ showMarketPrintSums:/);
  assert.match(chart, /changeSettings\(\{ showLiquidations:/);
  assert.match(chart, /changeSettings\(\{ showLiquidationCandleSums:/);
  assert.match(chart, /showDensityLines: !visible/);
  assert.match(chart, /densityAnalysis: true/);
});

test('middle mouse magnifier still works; keyboard toggle paints only over hovered chart', () => {
  assert.match(engine, /e\.pointerType==='mouse'&&e\.button===1&&tool==='cursor'/);
  assert.match(engine, /keyboardMagnifierActive&&tool==='cursor'&&cursorVisible/);
  assert.match(chart, /keyboardMagnifierActive=\{keyboardMagnifierActive && !replay\}/);
  assert.match(chart, /setKeyboardMagnifierActive\(current => !current\)/);
  assert.match(chart, /setKeyboardMagnifierActive\(false\)/);
});

test('Terminal Escape and link toggle can be rebound independently of chart shortcuts', () => {
  assert.equal(DEFAULT_TERMINAL_HOTKEYS.exitTerminal, 'Escape');
  assert.equal(DEFAULT_TERMINAL_HOTKEYS.linking, 'Alt+Shift+KeyL');
  const overrides = normalizeTerminalHotkeys({ exitTerminal: 'Ctrl+Escape', linking: 'Ctrl+Shift+KeyL' });
  const evt = (code: string, ctrl = false, alt = false, shift = false) =>
    ({ code, key: code, ctrlKey: ctrl, altKey: alt, shiftKey: shift, metaKey: false, repeat: false });
  assert.equal(terminalShortcutAction(evt('Escape', true), overrides), 'exitTerminal');
  assert.equal(terminalShortcutAction(evt('KeyL', true, false, true), overrides), 'linking');
  assert.equal(terminalShortcutAction(evt('Escape'), overrides), null);
  assert.match(page, /getUserTerminalLinkSettings\(user\?\.uid, profile\)/);
  assert.match(page, /settings\.provider !== 'none'/);
  assert.match(page, /terminalLinkSettings: \{ \.\.\.settings, enabled: !settings\.enabled \}/);
  assert.match(page, /loadTerminalHotkeys\(user\?\.uid\)/);
  assert.match(page, /saveTerminalHotkeys\(user\?\.uid, next\)/);
  assert.match(menu, /onSavePageHotkeys\(\{ \.\.\.pageHotkeys/);
});

test('legacy HookChart hotkey actions in Terminal target focused exact block', () => {
  assert.match(page, /window\.addEventListener\('signalhook:hookchart-hotkey', onChartHotkey\)/);
  assert.match(page, /document\.activeElement\.closest\('\[data-terminal-block-id\]'\)/);
  assert.match(page, /block\.symbol !== detail\.symbol/);
  assert.match(page, /block\.exchange !== detail\.exchange/);
  assert.match(page, /block\.marketType !== detail\.marketType/);
  assert.match(item, /data-terminal-block-id=\{block\.id\}/);
  for (const action of ['toggleFavorites','openMetaScalp','deleteCoin','prevChart','nextChart','prevTfAll','nextTfAll','prevCoin','nextCoin']) {
    assert.ok(page.includes(`detail.action === '${action}'`), action);
  }
});


test('Escape closes an active dialog before navigating away from Terminal', () => {
  const esc = page.indexOf('const handleKeyDown = (e: KeyboardEvent) =>');
  const exit = page.indexOf("terminalShortcutAction(e, terminalHotkeys) === 'exitTerminal'", esc);
  const guard = page.indexOf('if (isSettingsOpen || isAddModalOpen || modalTarget) return;', esc);
  assert.ok(esc !== -1 && guard > esc && exit > guard, 'page exit must be below dialog guard');
  assert.match(page, /e\.target\.closest\('\[role="dialog"\], \[aria-modal="true"\]'\)/);
  assert.match(page, /if \(e\.defaultPrevented\) return;/);
  // Chart Escape cancels an active drawing before the page can handle it.
  assert.match(chart, /if \(use\('cancel'\)\)/);
  assert.match(chart, /event\.preventDefault\(\);[\s\S]*?setTool\('cursor'\)/);
});
