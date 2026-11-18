import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const regular = read('../src/components/FormationCard.tsx');
const early = read('../src/components/EarlyFormationCard.tsx');
const table = read('../src/components/ScreenerTable.tsx');
const copy = read('../src/components/FormationCoinCopyButton.tsx');

test('regular formation card copies the full symbol when coin name is tapped in both card and quick chart', () => {
  assert.equal((regular.match(/<FormationCoinCopyButton\s+symbol=\{coin\.symbol\}/g) ?? []).length, 2);
  assert.match(regular, /<FormationCoinCopyButton symbol=\{coin\.symbol\} className="flex min-w-0 max-w-full items-center gap-1\.5 text-left"/);
  assert.match(regular, /formation-chart-symbol font-mono font-extrabold/);
  assert.match(regular, /onSelect\(coin, formation\)/);
});

test('early W/M detection card copies the full symbol in both card and quick chart without changing detection logic', () => {
  assert.equal((early.match(/<FormationCoinCopyButton\s+symbol=\{coin\.symbol\}/g) ?? []).length, 2);
  assert.match(early, /<FormationCoinCopyButton symbol=\{coin\.symbol\} className="flex min-w-0 items-center/);
  assert.match(early, /formation-chart-symbol font-mono font-extrabold/);
  assert.match(early, /earlyFormationChartMarkers\(candidate\)/);
});

test('formations table symbol copies without triggering row click', () => {
  assert.match(table, /<FormationCoinCopyButton symbol=\{coin\.symbol\}/);
  assert.match(table, /onClick=\{\(\) => onSelect\(coin, formation\)\}/);
  assert.match(copy, /event\.stopPropagation\(\)/);
});

test('name button has exact symbol clipboard payload and accessible success feedback', () => {
  assert.match(copy, /const fullSymbol = symbol\.trim\(\)\.toUpperCase\(\)/);
  assert.match(copy, /copyTextToClipboard\(fullSymbol\)/);
  assert.match(copy, /aria-label=\{t\('ui\.copy\.symbol', \{ symbol: fullSymbol \}\)\}/);
  assert.match(copy, /<Copy aria-hidden="true"/);
  assert.match(copy, /<Check aria-hidden="true"/);
  assert.match(copy, /type="button"/);
  assert.doesNotMatch(copy, /onSelect\(|onOpen\(|window\.location/);
});
