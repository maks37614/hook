import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/components/CoinScreenerPage.tsx', import.meta.url), 'utf8');
const controls = source.slice(
  source.indexOf('{/* Quick navigation and watchlist controls */}'),
  source.indexOf('{/* Main Filter & Search Toolbar */}'),
);

test('Screener floating navigation icons have transparent backgrounds and no borders or shadows', () => {
  const buttons = controls.match(/<button\b[\s\S]*?<\/button>/g) ?? [];
  assert.equal(buttons.length, 3, 'top, bottom and watchlist buttons stay present');
  for (const button of buttons) {
    assert.match(button, /border-0 bg-transparent p-0/);
    assert.match(button, /shadow-none hover:bg-transparent/);
    assert.doesNotMatch(button, /bg-slate-900\/95|border-slate-700|hover:bg-slate-800|shadow-lg/);
    assert.match(button, /focus-visible:ring-2/, 'keyboard focus remains visible');
    assert.match(button, /h-9 w-9/, 'tap targets retain their previous size');
  }
});

test('floating navigation functions and guest watchlist indicator stay intact', () => {
  assert.match(controls, /onClick=\{\(\) => scrollScreenerTo\('top'\)\}/);
  assert.match(controls, /onClick=\{\(\) => scrollScreenerTo\('bottom'\)\}/);
  assert.match(controls, /onClick=\{onOpenWatchlist\}/);
  assert.match(controls, /<ArrowUpToLine/);
  assert.match(controls, /<ArrowDownToLine/);
  assert.match(controls, /<Bookmark/);
  assert.match(controls, /className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-0 bg-transparent/);
  assert.match(controls, /<Lock/);
});
