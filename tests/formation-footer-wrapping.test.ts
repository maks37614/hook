import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name: string) => readFileSync(new URL('../src/components/' + name, import.meta.url), 'utf8');
const regular = read('FormationCard.tsx');
const early = read('EarlyFormationCard.tsx');

function footer(source: string, marker: string) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, marker + ' exists');
  return source.slice(start);
}

test('confirmed Formation footer keeps all actions on one row without resizing cards', () => {
  const actions = footer(regular, '{/* Footer Actions */}');
  assert.ok(actions.includes('flex flex-nowrap items-center justify-between gap-1 pt-2'));
  assert.ok(actions.includes('flex min-w-0 items-center gap-1'));
  assert.ok(actions.includes('ml-auto flex min-w-0 items-center gap-1'));
  for (const token of ['setIsChartExpanded(true)', 'onSelect(coin, formation)', 'onSendMetaScalp(coin)',
    'onOpenAlert(coin, formation)', 'removeCoinFromSurveillance(', 'addCoinToSurveillance(', 'onToggleWatchlist(coin)']) {
    assert.ok(actions.includes(token), 'existing action missing: ' + token);
  }
  assert.ok(regular.includes('h-[350px]'));
  assert.ok(regular.includes('h-[390px]'));
  assert.ok(regular.includes('min-h-0 overflow-y-auto touch-scroll'));
});

test('early W/M footer keeps the six actions in one row without resizing cards', () => {
  const actions = footer(early, '{/* Identical six-action footer layout');
  assert.ok(actions.includes('flex flex-nowrap items-center justify-between gap-1 pt-2'));
  assert.ok(actions.includes('flex min-w-0 items-center gap-1'));
  assert.ok(actions.includes('ml-auto flex min-w-0 items-center gap-1'));
  for (const token of ['setIsChartExpanded(true)', 'openDetail', 'onSendMetaScalp(coin)',
    'onOpenPriceAlert(coin)', 'toggleSurveillance()', 'onToggleWatchlist(coin.symbol)']) {
    assert.ok(actions.includes(token), 'existing early action missing: ' + token);
  }
  assert.ok(early.includes('h-[350px]'));
  assert.ok(early.includes('h-[390px]'));
  assert.ok(early.includes('min-h-0 overflow-y-auto touch-scroll'));
});


test('compact footer buttons fit narrow formation columns without touching quick charts', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const start = css.indexOf('/* Both confirmed and early formation information cards:');
  const end = css.indexOf('/* Formations quick-chart header', start);
  assert.ok(start >= 0 && end > start, 'footer styling section exists');
  const style = css.slice(start, end);
  assert.match(style, /#root \[data-ui-a11y="formation-info"\] \{\s*container: formation-info \/ inline-size;/);
  assert.match(style, /#root \.formation-card-footer \{\s*min-width: 0;\s*flex-wrap: nowrap;/);
  assert.match(style, /#root \.formation-card-footer button \{/);
  assert.match(style, /width: 30px;\s*height: 30px;\s*min-width: 30px;\s*min-height: 30px;/);
  assert.match(style, /#root \.formation-card-footer button > svg \{\s*width: 13px;\s*height: 13px;/);
  assert.match(style, /@container formation-info \(max-width: 260px\)/);
  assert.match(style, /@container formation-info \(max-width: 210px\)/);
  assert.doesNotMatch(style, /\.hookchart-root|\.chartCanvas|overflow-x:\s*hidden/);
});
