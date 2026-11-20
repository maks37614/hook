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

test('Terminal settings keep translations but no longer expose local/cloud conflict options', () => {
  const drawer = read('../src/components/terminal/TerminalSettingsDrawer.tsx');
  const presets = read('../src/components/terminal/TerminalPresetPanel.tsx');
  const page = read('../src/components/TerminalPage.tsx');
  const locale = read('../src/locales/index.ts');
  assert.match(locale, /\.\.\.terminalSettingsDrawerStrings\[language\]/);
  assert.match(drawer, /terminal\.drawer\.presetChartsPerPage/);
  assert.match(drawer, /terminal\.drawer\.initialViewHelp/);
  assert.doesNotMatch(drawer, /terminal\.drawer\.conflictDetails|terminal\.drawer\.restoreCloud|syncConflict/);
  assert.match(presets, /terminal\.drawer\.syncPresetFailed/);
  assert.doesNotMatch(presets, /terminal\.drawer\.syncPresetConflict|syncConflict/);
  assert.doesNotMatch(page, /terminal\.drawer\.conflictTooltip|terminal\.drawer\.conflictIndicator/);
  assert.doesNotMatch(drawer, /(?:title|aria-label|placeholder)="[^"]*[А-Яа-яІіЇїЄєҐґ]/);
  assert.doesNotMatch(drawer, />[^<>{}\n]*[А-Яа-яІіЇїЄєҐґ][^<>{}\n]*</);

  const config = { layoutPreset: 'custom' as const, columns: 2 as const,
    autoFitScreen: true, showClock: true, blocks: [], showFormations: true,
    blockHeight: 'medium' as const };
  const html = renderToStaticMarkup(React.createElement(TerminalSettingsDrawer, {
    isOpen: true, onClose: () => {}, config,
    coinSelection: { exchange: 'binance', marketType: 'futures' },
    coinLimit: 12, totalBlocks: 12,
    onUpdateConfig: () => {}, onApplyGlobalTimeframe: () => {},
    onApplyPreset: () => {}, onResetWorkspace: () => {},
  }));
  assert.doesNotMatch(html, /Локальна робоча область відрізняється/);
  assert.doesNotMatch(html, /Завантажити JSON-копію|Повернути хмарну версію/);
  assert.match(html, /Графіки: 12/);
  assert.match(html, /Показувати годинник/);
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
