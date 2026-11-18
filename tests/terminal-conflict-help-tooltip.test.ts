import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { supportedLanguages, translateKey } from '../src/locales';
import { terminalSettingsDrawerRows } from '../src/locales/terminalSettingsDrawer20261115';
import { TerminalSettingsDrawer } from '../src/components/terminal/TerminalSettingsDrawer';

const props = {
  isOpen: true,
  syncConflict: true,
  onClose: () => {},
  onDownloadLocalBackup: () => {},
  onRestoreCloudWorkspace: () => {},
  config: {
    layoutPreset: 'custom' as const, columns: 2 as const,
    autoFitScreen: true, blocks: [], showFormations: true, blockHeight: 'medium' as const,
  },
  coinSelection: { exchange: 'binance' as const, marketType: 'futures' as const },
  coinLimit: 12,
  totalBlocks: 12,
  onUpdateConfig: () => {},
  onApplyGlobalTimeframe: () => {},
  onApplyPreset: () => {},
  onResetWorkspace: () => {},
};

test('The conflict alert has an accessible question-mark help button in its upper-right corner', () => {
  const html = renderToStaticMarkup(React.createElement(TerminalSettingsDrawer, props));
  const alertStart = html.indexOf('role="alert"');
  const buttonStart = html.indexOf('aria-label="Пояснення конфлікту синхронізації"', alertStart);
  const actionsStart = html.indexOf('Завантажити JSON-копію', buttonStart);
  assert.ok(alertStart >= 0 && buttonStart > alertStart && actionsStart > buttonStart);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="terminal-workspace-conflict-help"/);
  const helpButton = html.slice(buttonStart, html.indexOf('</button>', buttonStart));
  assert.match(helpButton, /<svg[^>]*aria-hidden="true"/,
    'the help icon must remain inside the accessible help button regardless of Lucide CSS alias');
  assert.doesNotMatch(html, /id="terminal-workspace-conflict-help"/,
    'full explanation is initially collapsed');
  assert.match(html, /Завантажити JSON-копію/);
  assert.match(html, /Повернути хмарну версію/);
});

test('Conflict explanation is fully translated, including safety guidance', () => {
  assert.deepEqual(supportedLanguages, ['uk', 'en', 'ru', 'pl']);
  const keys = [
    'conflictHelpButton', 'conflictHelpTitle', 'conflictHelpReason', 'conflictHelpStepsTitle',
    'conflictHelpBackup', 'conflictHelpCloud', 'conflictHelpLocal', 'conflictHelpSafety',
  ];
  const lookup = new Map<string, readonly string[]>();
  for (const row of terminalSettingsDrawerRows) lookup.set(row[0], row);
  for (const key of keys) {
    const row = lookup.get(key);
    assert.ok(row && row.length === 5, 'four-language help entry: ' + key);
    for (const [index, language] of supportedLanguages.entries()) {
      assert.equal(translateKey(language, 'terminal.drawer.' + key), row[index + 1]);
    }
  }
  assert.match(translateKey('uk', 'terminal.drawer.conflictHelpLocal'), /Імпорт JSON/);
  assert.match(translateKey('en', 'terminal.drawer.conflictHelpSafety'), /not merged automatically/);
  assert.match(translateKey('ru', 'terminal.drawer.conflictHelpReason'), /другой вкладке/);
  assert.match(translateKey('pl', 'terminal.drawer.conflictHelpLocal'), /Import JSON/);
});

test('The help panel opens by tapping and closes on Escape or tapping outside', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="outside"></div></body></html>', {
    url: 'https://h00k.top/terminal',
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    IS_REACT_ACT_ENVIRONMENT: (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT,
  };
  // jsdom does not implement matchMedia by default: simulate touch-only input.
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = dom.window.document.getElementById('root')!;
  const root = createRoot(container);
  try {
    await act(async () => { root.render(React.createElement(TerminalSettingsDrawer, props)); });
    const button = dom.window.document.querySelector<HTMLButtonElement>(
      'button[aria-controls="terminal-workspace-conflict-help"]',
    );
    assert.ok(button);
    const panel = () => dom.window.document.getElementById('terminal-workspace-conflict-help');
    assert.equal(panel(), null);
    await act(async () => { button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.ok(panel()?.textContent?.includes('Як безпечно вирішити'));
    assert.ok(panel()?.textContent?.includes('JSON-копію'));
    await act(async () => {
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: 'Escape', bubbles: true,
      }));
    });
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(panel(), null);
    await act(async () => { button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    await act(async () => {
      dom.window.document.getElementById('outside')!.dispatchEvent(
        new dom.window.Event('pointerdown', { bubbles: true }),
      );
    });
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(panel(), null);
  } finally {
    await act(async () => root.unmount());
    Object.defineProperty(globalThis, 'window', { configurable: true, value: previous.window });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: previous.document });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previous.navigator });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      previous.IS_REACT_ACT_ENVIRONMENT;
    dom.window.close();
  }
});

test('Help behavior does not alter workspace syncing, backup, or restore handlers', () => {
  const src = readFileSync(new URL('../src/components/terminal/TerminalSettingsDrawer.tsx', import.meta.url), 'utf8');
  assert.match(src, /onMouseEnter=\{\(\) => \{/);
  assert.match(src, /onMouseLeave=\{\(\) => \{/);
  assert.match(src, /document\.addEventListener\('pointerdown', closeOutside\)/);
  assert.match(src, /document\.addEventListener\('keydown', closeOnEscape\)/);
  assert.match(src, /if \(!isOpen \|\| !syncConflict\) setConflictHelpOpen\(false\)/);
  assert.match(src, /onClick=\{onDownloadLocalBackup\}/);
  assert.match(src, /onClick=\{onRestoreCloudWorkspace\}/);
  assert.doesNotMatch(src, /onClick=\{\(\) => onRestoreCloudWorkspace/);
});
