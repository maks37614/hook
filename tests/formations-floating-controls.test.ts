import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const controls = source.slice(
  source.indexOf('{/* The Formations view uses the same transparent floating navigation'),
  source.indexOf('{!chartPageActive && !desktopPanel && <SiteFooter />'),
);

test('Formations includes three matching transparent floating buttons only on its list page', () => {
  assert.match(controls, /activePage === 'patterns' && !chartPageActive/);
  assert.match(controls, /aria-label="Навігація формацій"/);
  const buttons = controls.match(/<button[\s\S]*?<\/button>/g) ?? [];
  assert.equal(buttons.length, 3);
  for (const button of buttons) {
    assert.match(button, /h-9 w-9/);
    assert.match(button, /border-0 bg-transparent p-0/);
    assert.match(button, /shadow-none hover:bg-transparent/);
    assert.match(button, /focus-visible:ring-2/);
    assert.doesNotMatch(button, /bg-slate-900\/95|border-slate-700|shadow-lg/);
  }
});

test('Formations top/bottom controls scroll and favorites opens watchlist or login', () => {
  assert.match(controls, /aria-label="На початок списку формацій"/);
  assert.match(controls, /<ArrowUpToLine/);
  assert.match(controls, /window\.scrollTo\(\{ top: 0/);
  assert.match(controls, /aria-label="У кінець списку формацій"/);
  assert.match(controls, /<ArrowDownToLine/);
  assert.match(controls, /top: page\.scrollHeight/);
  assert.match(controls, /prefers-reduced-motion: reduce/);
  assert.match(controls, /aria-label="Відкрити обрані монети"/);
  assert.match(controls, /<Bookmark/);
  assert.match(controls, /handleOpenAuthModal\('signin', 'general'\)/);
  assert.match(controls, /setIsWatchlistOpen\(true\)/);
  assert.match(controls, /border-0 bg-transparent text-amber-400/);
});
