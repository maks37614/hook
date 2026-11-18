import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import type { TerminalWorkspaceConfig } from '../src/types';
import { TerminalSettingsDrawer } from '../src/components/terminal/TerminalSettingsDrawer';
import { parseTerminalWorkspaceBackup } from '../src/utils/useTerminalWorkspace';

const terminal = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/utils/useTerminalWorkspace.ts', import.meta.url), 'utf8');
const drawerSource = readFileSync(new URL('../src/components/terminal/TerminalSettingsDrawer.tsx', import.meta.url), 'utf8');
const baseConfig: TerminalWorkspaceConfig = {
  layoutPreset: 'custom',
  columns: 2,
  autoFitScreen: true,
  blocks: [],
  showFormations: true,
  blockHeight: 'medium',
};

const renderSettings = (showClock?: boolean) => renderToStaticMarkup(
  React.createElement(TerminalSettingsDrawer, {
    isOpen: true,
    onClose: () => {},
    config: { ...baseConfig, showClock },
    coinSelection: { exchange: 'all', marketType: 'all' },
    coinLimit: 12,
    onUpdateConfig: () => {},
    onApplyGlobalTimeframe: () => {},
    onApplyPreset: () => {},
    onResetWorkspace: () => {},
    totalBlocks: 1,
  }),
);

test('Terminal settings show an accessible clock visibility switch with correct on/off states', () => {
  const visible = renderSettings(true);
  const hidden = renderSettings(false);
  assert.match(visible, /Показувати годинник/);
  assert.match(visible, /aria-label="Показувати годинник у Терміналі" aria-checked="true"/);
  assert.match(hidden, /aria-label="Показувати годинник у Терміналі" aria-checked="false"/);
  assert.match(drawerSource, /onClick=\{\(\) => onUpdateConfig\(\{ showClock: config\.showClock === false \}\)\}/);
  assert.match(renderSettings(), /aria-label="Показувати годинник у Терміналі" aria-checked="true"/);
});

test('Terminal unmounts its clock when disabled without hiding other header actions', () => {
  const header = terminal.slice(terminal.indexOf('{/* Under 720px controls'), terminal.indexOf('</header>'));
  assert.match(header, /config\.showClock !== false && \(/);
  assert.match(header, /<TerminalClock timeZone=\{profile\?\.timeZone\}/);
  assert.match(header, /<SlidersHorizontal/);
  assert.match(header, /<Maximize2/);
  assert.match(terminal, /if \(updated\.showClock === false\) setShowTradingSessions\(false\)/);
});

test('Terminal clock preference survives backup restore and safely defaults to visible', () => {
  const backup = (config: Record<string, unknown>) => JSON.stringify({
    blocks: [], presets: [], config: { ...baseConfig, ...config },
  });
  assert.equal(parseTerminalWorkspaceBackup(backup({ showClock: false })).config.showClock, false);
  assert.equal(parseTerminalWorkspaceBackup(backup({ showClock: true })).config.showClock, true);
  assert.equal(parseTerminalWorkspaceBackup(backup({})).config.showClock, true);
  assert.equal(parseTerminalWorkspaceBackup(backup({ showClock: 'false' })).config.showClock, true);
  assert.match(storage, /showClock: true/);
  assert.match(storage, /typeof source\.showClock === 'boolean'/);
  assert.match(storage, /localStorage\.setItem\(terminalStorageKey\(CONFIG_KEY, uid\), JSON\.stringify\(workspace\.config\)\)/);
});
