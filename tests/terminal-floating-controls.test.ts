import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
const controls = source.slice(
  source.indexOf('{/* Transparent navigation is over the chart area'),
  source.indexOf('{/* Workspace Display: If 1 block or maximized block'),
);

test('Terminal has three floating borderless controls with isolated chart gestures', () => {
  assert.match(controls, /aria-label="Навігація термінала"/);
  assert.match(controls, /pointer-events-none absolute bottom-4 right-4 z-20/);
  const buttons = controls.match(/<button type="button"[\s\S]*?<\/button>/g) ?? [];
  assert.equal(buttons.length, 3, 'top, bottom and favorites controls');
  for (const button of buttons) {
    assert.match(button, /pointer-events-auto/);
    assert.match(button, /h-9 w-9/);
    assert.match(button, /border-0 bg-transparent p-0/);
    assert.match(button, /shadow-none/);
    assert.match(button, /hover:bg-transparent/);
    assert.match(button, /focus-visible:ring-2/);
    assert.doesNotMatch(button, /bg-slate-900\/95|border-slate-700|shadow-lg/);
  }
});

test('Terminal scroll buttons control the chart grid rather than the body and disable on a single chart', () => {
  assert.match(source, /const scrollTerminalChartsTo = \(edge: 'top' \| 'bottom'\) =>/);
  assert.match(source, /const grid = chartListRef\.current/);
  assert.match(source, /grid\.scrollTo\(\{/);
  assert.match(source, /edge === 'top' \? 0 : grid\.scrollHeight/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(controls, /onClick=\{\(\) => scrollTerminalChartsTo\('top'\)\}/);
  assert.match(controls, /onClick=\{\(\) => scrollTerminalChartsTo\('bottom'\)\}/);
  assert.equal((controls.match(/disabled=\{blocks\.length <= 1\}/g) ?? []).length, 2);
  assert.match(controls, /<ArrowUpToLine/);
  assert.match(controls, /<ArrowDownToLine/);
});

test('Terminal favorites icon opens the existing drawer without duplicating or resetting saved coins', () => {
  assert.match(controls, /onClick=\{\(\) => setIsFavoritesDrawerOpen\(true\)\}/);
  assert.match(controls, /aria-label="Відкрити обрані монети"/);
  assert.match(controls, /aria-expanded=\{isFavoritesDrawerOpen\}/);
  assert.match(controls, /<Bookmark/);
  assert.match(controls, /!user && <Lock/);
  assert.match(source, /isFavoritesDrawerOpen \? 'translate-x-0' : '-translate-x-full pointer-events-none'/);
  assert.match(source, /setLocalWatchlist\(\[\.\.\.new Set\(watchlist\)\]\)/);
});
