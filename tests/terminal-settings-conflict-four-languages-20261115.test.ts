import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { translateKey, supportedLanguages } from '../src/locales';
import { terminalSettingsDrawerRows } from '../src/locales/terminalSettingsDrawer20261115';
import { TerminalSettingsDrawer } from '../src/components/terminal/TerminalSettingsDrawer';
import { parseTerminalWorkspaceBackup } from '../src/utils/useTerminalWorkspace';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Terminal settings and conflict recovery strings exist for all four languages', () => {
  assert.deepEqual(supportedLanguages, ['uk', 'en', 'ru', 'pl']);
  const seen = new Set<string>();
  assert.ok(terminalSettingsDrawerRows.length >= 80);
  for (const [name, ...values] of terminalSettingsDrawerRows) {
    assert.ok(!seen.has(name), 'duplicate settings key: ' + name);
    seen.add(name);
    assert.equal(values.length, 4);
    const parameters = values.map(value => [...value.matchAll(/\{\{([^}]+)\}\}/g)].map(x => x[1]).sort().join(','));
    assert.equal(new Set(parameters).size, 1, 'placeholder mismatch: ' + name);
    for (const [index, lang] of supportedLanguages.entries()) {
      assert.ok(values[index]?.trim(), lang + ': ' + name);
      assert.equal(translateKey(lang, 'terminal.drawer.' + name), values[index], lang + ': ' + name);
    }
  }
  const en = translateKey('en', 'terminal.drawer.conflictDetails');
  const pl = translateKey('pl', 'terminal.drawer.conflictDetails');
  const ru = translateKey('ru', 'terminal.drawer.conflictDetails');
  assert.match(en, /another tab, browser or device/i);
  assert.match(pl, /karcie, przeglądarce lub na innym urządzeniu/i);
  assert.match(ru, /другой вкладке, браузере или устройстве/i);
  assert.equal(translateKey('en', 'terminal.drawer.downloadBackup'), 'Download JSON backup');
  assert.equal(translateKey('pl', 'terminal.drawer.restoreCloud'), 'Przywróć wersję z chmury');
});

test('Settings and preset panels render localized conflict warnings and controls', () => {
  const drawer = read('../src/components/terminal/TerminalSettingsDrawer.tsx');
  const presets = read('../src/components/terminal/TerminalPresetPanel.tsx');
  const page = read('../src/components/TerminalPage.tsx');
  const locale = read('../src/locales/index.ts');
  assert.match(locale, /\.\.\.terminalSettingsDrawerStrings\[language\]/);
  assert.match(drawer, /backupFailed \? 'terminal\.drawer\.conflictBackupFailed' : 'terminal\.drawer\.conflictDetails'/);
  assert.match(drawer, /terminal\.drawer\.downloadBackup/);
  assert.match(drawer, /terminal\.drawer\.restoreCloud/);
  assert.match(drawer, /terminal\.drawer\.presetChartsPerPage/);
  assert.match(drawer, /terminal\.drawer\.initialViewHelp/);
  assert.match(presets, /terminal\.drawer\.syncPresetConflict/);
  assert.match(presets, /terminal\.drawer\.syncPresetFailed/);
  assert.match(presets, /terminal\.drawer\.syncDownload/);
  assert.match(page, /terminal\.drawer\.conflictTooltip/);
  assert.match(page, /terminal\.drawer\.conflictIndicator/);
  assert.doesNotMatch(drawer, /(?:title|aria-label|placeholder)="[^"]*[А-Яа-яІіЇїЄєҐґ]/);
  assert.doesNotMatch(drawer, />[^<>{}\n]*[А-Яа-яІіЇїЄєҐґ][^<>{}\n]*</);
});

test('Conflict banner is available in Ukrainian without replacing or clearing charts', () => {
  const config = { layoutPreset: 'custom' as const, columns: 2 as const,
    autoFitScreen: true, showClock: true, blocks: [], showFormations: true,
    blockHeight: 'medium' as const };
  const html = renderToStaticMarkup(React.createElement(TerminalSettingsDrawer, {
    isOpen: true, onClose: () => {}, config,
    coinSelection: { exchange: 'binance', marketType: 'futures' },
    coinLimit: 12, totalBlocks: 12, syncConflict: true,
    onUpdateConfig: () => {}, onApplyGlobalTimeframe: () => {},
    onApplyPreset: () => {}, onResetWorkspace: () => {},
    onDownloadLocalBackup: () => {}, onRestoreCloudWorkspace: () => {},
  }));
  assert.match(html, /Локальна робоча область відрізняється/);
  assert.match(html, /Завантажити JSON-копію/);
  assert.match(html, /Повернути хмарну версію/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Графіки: 12/);
  assert.match(html, /Показувати годинник/);
  const backupFailed = renderToStaticMarkup(React.createElement(TerminalSettingsDrawer, {
    isOpen: true, onClose: () => {}, config,
    coinSelection: { exchange: 'binance', marketType: 'futures' },
    coinLimit: 12, totalBlocks: 12, syncConflict: true, backupFailed: true,
    onUpdateConfig: () => {}, onApplyGlobalTimeframe: () => {},
    onApplyPreset: () => {}, onResetWorkspace: () => {},
  }));
  assert.match(backupFailed, /Не вдалося зберегти резервну копію/);
});

test('JSON recovery preserves international pair symbols without accepting separators or malformed data', () => {
  const block = { id: 'intl-coin', symbol: '币安人生USDT', baseAsset: '币安人生',
    quoteAsset: 'USDT', exchange: 'binance', marketType: 'futures', timeframe: '1h' };
  const payload = { config: { layoutPreset: 'custom', columns: 2, blockHeight: 'medium' },
    blocks: [block], presets: [{ id: 'international', name: 'International', blocks: [block],
      columns: 2, blockHeight: 'medium', createdAt: 1 }] };
  const restored = parseTerminalWorkspaceBackup(JSON.stringify(payload));
  assert.equal(restored.blocks[0].symbol, '币安人生USDT');
  assert.equal(restored.presets[0].blocks[0].baseAsset, '币安人生');
  assert.equal(restored.presets[0].blocks[0].quoteAsset, 'USDT');
  for (const symbol of ['BTC/USDT', '../BTCUSDT', 'BTC USDT', 'BTC🧪USDT', 'BTC.USDT']) {
    assert.throws(() => parseTerminalWorkspaceBackup(JSON.stringify({
      ...payload, blocks: [{ ...block, symbol }],
    })), symbol);
  }
});
