import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { TerminalSettingsDrawer } from '../src/components/terminal/TerminalSettingsDrawer';

const props = {
  isOpen: true,
  onClose: () => {},
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

test('Terminal settings are cloud-only with no local/cloud comparison alert', () => {
  const html = renderToStaticMarkup(React.createElement(TerminalSettingsDrawer, props));
  assert.match(html, /Налаштування термінала/);
  assert.match(html, /Графіки: 12/);
  assert.doesNotMatch(html, /Локальна робоча область відрізняється/);
  assert.doesNotMatch(html, /Повернути хмарну версію/);
  assert.doesNotMatch(html, /terminal-workspace-conflict-help/);
  assert.doesNotMatch(html, /Завантажити JSON-копію/);
});

test('Obsolete conflict controls are not mounted anywhere in the Terminal UI', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const drawer = read('../src/components/terminal/TerminalSettingsDrawer.tsx');
  const page = read('../src/components/TerminalPage.tsx');
  const presets = read('../src/components/terminal/TerminalPresetPanel.tsx');
  const hook = read('../src/utils/useTerminalWorkspace.ts');
  for (const text of [drawer, page, presets]) {
    assert.doesNotMatch(text, /syncConflict|onRestoreCloudWorkspace|conflictHelpOpen/);
  }
  assert.doesNotMatch(hook, /readConflictBackup|CONFLICT_KEY|restoreCloudWorkspace/);
  assert.match(hook, /rebaseTerminalWorkspace/);
  assert.match(presets, /terminal\.drawer\.syncPresetFailed/);
  assert.match(presets, /onRetrySync/);
});
