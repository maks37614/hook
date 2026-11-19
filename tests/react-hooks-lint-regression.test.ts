import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('formation details skip all hooks by unmounting an inner component on missing selection', () => {
  const details = source('../src/components/FormationDetailsModal.tsx');
  assert.match(details, /export const FormationDetailsModal: React\.FC<FormationDetailsModalProps> = \(props\) => \{/);
  assert.match(details, /if \(!props\.coin \|\| !props\.formation\) return null;/);
  assert.match(details, /return <FormationDetailsContent \{\.\.\.props\} coin=\{props\.coin\} formation=\{props\.formation\} \/>;/);
  assert.match(details, /const FormationDetailsContent: React\.FC<ActiveFormationDetailsProps> = \(\{/);
  assert.doesNotMatch(details, /if \(!coin \|\| !formation\) return null;/);
});

test('chart hotkey matcher and market transport predicate are not mislabeled as React hooks', () => {
  const chart = source('../src/components/hookchart/HookChartCanvas.tsx');
  assert.match(chart, /const matchesShortcut = \(action: keyof typeof hotkeys\)/);
  assert.doesNotMatch(chart, /const use = \(action: keyof typeof hotkeys\)/);
  const trades = source('../src/components/hookchart/marketTradeStream.ts');
  assert.match(trades, /const shouldUseBinanceTradeRelay = \(scope: FeedScope\)/);
  assert.doesNotMatch(trades, /\buseBinanceTradeRelay\b/);
});

test('hook-order violations fail CI while legacy effect-dependency warnings stay visible', () => {
  const config = source('../eslint.config.mjs');
  assert.match(config, /'react-hooks\/rules-of-hooks': 'error'/);
  assert.match(config, /'react-hooks\/exhaustive-deps': 'warn'/);
});
