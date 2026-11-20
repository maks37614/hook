import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const header = readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8');
const nav = header.slice(header.indexOf('{/* Navigation Category Tabs */}'), header.indexOf('</nav>'));

test('phone navigation shows Screener, Terminal, Formations, Replay in a two-column grid', () => {
  assert.match(nav, /grid w-full min-w-0 grid-cols-2/);
  const orders = [
    ['screener', 1],
    ['patterns', 3],
    ['replay', 4],
    ['terminal', 2],
  ] as const;

  for (const [name, order] of orders) {
    const start = nav.indexOf(`id="nav-category-${name}-btn"`);
    assert.ok(start !== -1, `missing ${name} button`);
    const button = nav.slice(start, nav.indexOf('</button>', start));
    // The PC shortcut stays positioned against the Terminal wrapper.
    const wrapperStart = nav.lastIndexOf('<div className="relative order-2 sm:order-none', start);
    const parent = wrapperStart >= 0 ? nav.slice(wrapperStart, start) : '';
    // The Terminal may wrap its button with the PC shortcut. In that layout
    // the shared container, not the child button, owns the mobile grid order.
    const wrapperOwnsTerminalOrder = name === 'terminal' &&
      /<div className="relative order-2 sm:order-none/.test(parent);
    assert.ok(button.includes(`order-${order} sm:order-none`) || wrapperOwnsTerminalOrder,
      `${name} must have the mobile order and restore DOM order at sm and larger`);
  }

  // At 640px+ the original DOM order remains untouched.
  const ids = Array.from(nav.matchAll(/id="nav-category-([a-z]+)-btn"/g), match => match[1]);
  assert.deepEqual(ids.filter(id => id !== 'pc'), ['screener', 'patterns', 'replay', 'terminal']);
  if (ids.includes('pc')) assert.ok(ids.indexOf('pc') < ids.indexOf('terminal'),
    'the PC shortcut must remain in the Terminal wrapper for desktop layout');
  assert.match(nav, /sm:flex sm:w-auto sm:flex-wrap/);
  assert.match(nav, /xl:flex-nowrap/);
});

test('mobile reorder keeps each tab navigation, counters and badges intact', () => {
  for (const page of ['screener', 'patterns', 'replay', 'terminal'])
    assert.ok(nav.includes(`onClick={() => onPageChange('${page}')}`));

  assert.match(nav, /\{formationsCount\}/);
  assert.match(nav, /<History className=/);
  assert.match(nav, /SIM/);
});


test('PC remains anchored above Terminal on phones and desktop', () => {
  const wrapperStart = nav.indexOf('<div className="relative order-2 sm:order-none');
  const pcStart = nav.indexOf('id="nav-category-pc-btn"');
  const pcEnd = nav.indexOf('</button>', pcStart);
  const terminalStart = nav.indexOf('id="nav-category-terminal-btn"');
  assert.ok(wrapperStart >= 0 && wrapperStart < pcStart && pcStart < terminalStart);
  const pc = nav.slice(pcStart, pcEnd);
  assert.match(pc, /absolute -top-1\.5 z-10 rounded-md/);
  assert.match(pc, /right-0 sm:right-1/);
  assert.match(pc, /right-4 sm:right-5/);
  assert.match(pc, /onClick=\{\(\) => onPageChange\('pc'\)\}/);
  assert.doesNotMatch(pc, /bottom-1\.5 left-1\/2/);
});

test('mobile question-mark guide is right of the centered logo at the same height as fullscreen', () => {
  const brand = header.slice(header.indexOf('<div data-header-brand-row'), header.indexOf('{/* Navigation Category Tabs */}'));
  const fullscreenAt = brand.indexOf('data-screener-guide="fullscreen"');
  const guideAt = brand.indexOf('id="screener-help-btn"');
  const logoAt = brand.indexOf('src="/h00k-robot-logo.svg"');
  assert.ok(logoAt > 0 && logoAt < guideAt && guideAt < fullscreenAt,
    'guide must be right of the centered logo, fullscreen remains to the right');
  const fullscreen = brand.slice(fullscreenAt, brand.indexOf('</button>', fullscreenAt));
  const guide = brand.slice(guideAt, brand.indexOf('</button>', guideAt));
  for (const button of [fullscreen, guide]) {
    // Both controls keep identical 32px hit targets on phones and desktop.
    assert.match(button, /inline-flex h-8 w-8/);
    assert.match(button, /shrink-0 items-center justify-center/);
  }
  assert.match(fullscreen, /<Maximize2 className="h-4 w-4"/);
  assert.match(guide, /<CircleHelp className="h-4 w-4"/);
  assert.match(guide, /aria-label=\{pageGuideCopy\.open\}/);
  assert.doesNotMatch(guide, /justify-self-end/);
  assert.match(brand, /justify-self-center/, 'logo must keep its own symmetric grid column');
  assert.match(guide, /onClick=\{\(\) => setScreenerGuideOpen\(true\)\}/);
  // The icon itself correctly has aria-hidden=true. Only CSS classes that
  // hide the button are forbidden; do not mistake accessibility attributes
  // of its decorative child for hidden button visibility.
  assert.doesNotMatch(guide, /className="[^"]*\b(?:hidden|sm:inline-flex)\b/);
  assert.doesNotMatch(header, /id="mobile-page-help-btn"/);
  assert.doesNotMatch(nav, /<CircleHelp/);
});

test('page-guide entry labels exist in all four languages', () => {
  for (const label of [
    'Відкрити гайд по сторінках сайту',
    'Open site pages guide',
    'Otwórz przewodnik po stronach serwisu',
    'Открыть гид по страницам сайта',
  ]) {
    assert.ok(header.includes(label), 'missing localized page guide label: ' + label);
  }
  assert.match(header, /navigationOnly=\{activePage !== 'screener'\}/);
});
