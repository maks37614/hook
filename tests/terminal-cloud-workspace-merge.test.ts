import test from 'node:test';
import assert from 'node:assert/strict';
import type { TerminalChartBlock, TerminalWorkspaceConfig, TerminalSavedPreset } from '../src/types';
import { rebaseTerminalWorkspace } from '../src/utils/useTerminalWorkspace';

const block = (id: string): TerminalChartBlock => ({
  id, symbol: id.toUpperCase() + 'USDT', baseAsset: id.toUpperCase(),
  quoteAsset: 'USDT', exchange: 'binance', marketType: 'futures',
  timeframe: '5m', colSpan: 1,
});
const config = (overrides: Partial<TerminalWorkspaceConfig> = {}): TerminalWorkspaceConfig => ({
  layoutPreset: 'custom', columns: 2, autoFitScreen: true, blocks: [],
  showFormations: true, blockHeight: 'medium', ...overrides,
});
const snapshot = (blocks: TerminalChartBlock[], conf = config(), presets: TerminalSavedPreset[] = []) =>
  ({ blocks, config: conf, presets });

test('Concurrent devices retain each other\'s newly added Terminal charts', () => {
  const base = snapshot([block('btc')]);
  const local = snapshot([block('btc'), block('sol')], config({ showClock: false }));
  const remote = snapshot([block('btc'), block('eth')], config({ columns: 3, showClock: true }));
  const merged = rebaseTerminalWorkspace(base, local, remote);
  assert.deepEqual(merged.blocks.map(b => b.id), ['btc', 'eth', 'sol']);
  assert.equal(merged.config.columns, 3);
  assert.equal(merged.config.showClock, false);
});

test('Cloud deletions are not undone by unrelated edits on an older device', () => {
  const base = snapshot([block('btc'), block('eth')]);
  const local = snapshot([block('btc'), block('eth')], config({ columns: 4 }));
  const cloud = snapshot([block('btc')]);
  assert.deepEqual(rebaseTerminalWorkspace(base, local, cloud).blocks.map(b => b.id), ['btc']);
});

test('Intentional local chart deletion wins while unrelated remote additions survive', () => {
  const base = snapshot([block('btc'), block('eth')]);
  const local = snapshot([block('eth')]);
  const cloud = snapshot([block('btc'), block('eth'), block('sol')]);
  assert.deepEqual(rebaseTerminalWorkspace(base, local, cloud).blocks.map(b => b.id), ['eth', 'sol']);
});

test('Concurrent preset creation preserves both new IDs', () => {
  const preset = (id: string): TerminalSavedPreset => ({
    id, name: id, blocks: [block('btc')], columns: 2, blockHeight: 'medium', createdAt: 1,
  });
  const base = snapshot([block('btc')]);
  const local = snapshot([block('btc')], config(), [preset('phone')]);
  const cloud = snapshot([block('btc')], config(), [preset('desktop')]);
  assert.deepEqual(rebaseTerminalWorkspace(base, local, cloud).presets.map(p => p.id), ['desktop', 'phone']);
});
