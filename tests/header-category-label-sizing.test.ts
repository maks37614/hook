import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const header = readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8');
const nav = header.slice(header.indexOf('{/* Navigation Category Tabs */}'), header.indexOf('</nav>'));

test('only the four primary page labels have a modest responsive font increase', () => {
  for (const key of ['screener', 'patterns', 'terminal', 'replay']) {
    assert.ok(nav.includes('<span className="text-[13px] sm:text-sm">{t(\'' + key + '\')}</span>'), key);
  }
  assert.equal((nav.match(/text-\[13px\] sm:text-sm/g) ?? []).length, 4);
  assert.match(nav, /className=\{\`px-1\.5 py-0\.2 rounded-full text-\[10px\] font-mono/);
  assert.match(nav, /px-1 py-0\.2 rounded text-\[9px\] font-mono font-extrabold/);
  assert.match(nav, /px-1 py-0\.5 text-\[8px\] font-extrabold/);
});

test('existing category click handlers, desktop/mobile order and active colors stay intact', () => {
  assert.match(nav, /grid-cols-2/);
  assert.match(nav, /sm:flex sm:w-auto sm:flex-wrap/);
  for (const key of ['screener', 'patterns', 'terminal', 'replay']) {
    assert.ok(nav.includes("onPageChange('" + key + "')"), key);
  }
  assert.match(nav, /from-indigo-600 to-cyan-600/);
  assert.match(nav, /from-cyan-600 to-cyan-500/);
  assert.match(nav, /from-emerald-600 to-teal-500/);
  assert.match(nav, /from-amber-500 to-orange-500/);
});
