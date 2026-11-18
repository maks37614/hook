import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8');
const nav = source.slice(source.indexOf('id="nav-category-screener-btn"'), source.indexOf('</nav>'));

function tab(id: string, nextId: string) {
  const start = nav.indexOf('id="nav-category-' + id + '-btn"');
  const end = nav.indexOf('id="nav-category-' + nextId + '-btn"', start);
  assert.ok(start >= 0 && end > start);
  return nav.slice(start, end);
}

test('Screener icon retains its compact geometry and follows current active-tab foreground', () => {
  const screener = tab('screener', 'patterns');
  assert.match(screener, /<ScreenerIcon className="w-3\.5 h-3\.5 shrink-0" \/>/);
  assert.doesNotMatch(screener, /text-cyan-400/);
  assert.match(screener, /text-slate-300 hover:text-white/);
  assert.match(screener, /onClick=\{\(\) => onPageChange\('screener'\)\}/);
  assert.match(screener, /from-indigo-600 to-cyan-600/);
});

test('Replay icon stays gray even with its active-tab background and SIM badge', () => {
  const replay = tab('replay', 'terminal');
  assert.match(replay, /<History className="w-3\.5 h-3\.5 shrink-0 text-slate-400" \/>/);
  assert.doesNotMatch(replay, /text-amber-400/);
  assert.match(replay, /text-slate-300 hover:text-white/);
  assert.match(replay, /from-amber-500 to-orange-500/);
  assert.match(replay, /onClick=\{\(\) => onPageChange\('replay'\)\}/);
  assert.match(replay, /SIM/);
});
