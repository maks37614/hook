import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MonitoringMenuIcon } from '../src/components/MonitoringIcon';

const source = readFileSync(new URL('../src/components/SurveillancePage.tsx', import.meta.url), 'utf8');
const topBar = source.slice(
  source.indexOf('{/* Top Header & 24/7 Engine Status Bar'),
  source.indexOf('{/* SECTION: Останні події нагляду'),
);

test('surveillance header uses the requested short title and status label', () => {
  assert.match(topBar, />\{t\('surveillance\.ui\.heading'\)\}<\/h1>/);
  assert.match(topBar, /\bLive\s*<\/span>/);
  assert.doesNotMatch(topBar, />24\/7 Моніторинг<\/h1>|>Моніторинг<\/h1>|LIVE ENGINE/);
});

test('watched count is immediately after the refresh control in the header action group', () => {
  assert.match(topBar, /className="flex shrink-0 items-center gap-2">\s*<button[\s\S]*?title=\{t\('surveillance\.ui\.refresh'\)\}[\s\S]*?<\/button>\s*<div aria-label=\{t\('surveillance\.ui\.activeCount', \{ count: activeCount \}\)\}/);
  assert.equal((topBar.match(/surveillance\.ui\.coinCount/g) || []).length, 1);
  assert.doesNotMatch(topBar, /pt-3 border-t border-slate-800\/80 font-mono/);
});

test('monitoring question-mark tooltip shows the full description on hover, focus and tap', () => {
  const description = "{t('surveillance.ui.helpText')}";
  assert.equal(topBar.split(description).length - 1, 1, 'description must live only in the tooltip');
  assert.match(topBar, /<HelpCircle className="h-4 w-4" aria-hidden="true" \/>/);
  assert.match(topBar, /aria-label=\{t\('surveillance\.ui\.helpLabel'\)\}/);
  assert.match(topBar, /onMouseEnter=\{\(\) => setIsMonitoringHelpOpen\(true\)\}/);
  assert.match(topBar, /onFocus=\{\(\) => setIsMonitoringHelpOpen\(true\)\}/);
  assert.match(topBar, /onClick=\{\(\) => setIsMonitoringHelpOpen\(true\)\}/);
  assert.match(topBar, /onBlur=\{\(\) => setIsMonitoringHelpOpen\(false\)\}/);
  assert.match(topBar, /role="tooltip"/);
  assert.match(topBar, /aria-describedby=\{isMonitoringHelpOpen \? 'surveillance-monitoring-help' : undefined\}/);
  assert.doesNotMatch(topBar, /<p className="text-xs text-slate-400">\s*Комплексний моніторинг/);
});

test('monitoring page header matches the shared site-header SVG emblem', () => {
  assert.match(topBar, /<MonitoringMenuIcon className="w-14 h-14" active \/>/);
  const markup = renderToStaticMarkup(React.createElement(MonitoringMenuIcon, {
    className: 'w-14 h-14', active: true,
  }));
  assert.match(markup, /<svg[^>]+viewBox="0 0 24 24"/);
  assert.match(markup, /<linearGradient/);
  assert.match(markup, /#E9D8FF/);
  assert.match(markup, /#A6E8FF/);
  assert.match(markup, /#8AF4E4/);
  assert.match(markup, /<circle/);
  assert.match(markup, /<path/);
  assert.doesNotMatch(markup, /monitoring-24-7\.png|mask-image|maskImage/);
  assert.match(markup, /aria-hidden="true"/);
});

test('monitoring menu icon renders independently with its softer gradient', () => {
  const markup = renderToStaticMarkup(React.createElement(MonitoringMenuIcon));
  assert.match(markup, /viewBox="0 0 24 24"/);
  assert.match(markup, /<svg/);
  assert.match(markup, /#CCB7F9/);
  assert.match(markup, /#8DD9F8/);
  assert.match(markup, /#6CDBD5/);
  const activeMarkup = renderToStaticMarkup(React.createElement(MonitoringMenuIcon, { active: true }));
  assert.match(activeMarkup, /#E9D8FF/);
  assert.match(activeMarkup, /#A6E8FF/);
  assert.match(activeMarkup, /#8AF4E4/);
});

test('SignalHook preserves its compact layout box but scales its glyph visually', () => {
  const header = readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8');
  const monitoring = header.slice(header.indexOf('id="open-surveillance-btn"'), header.indexOf('id="open-archive-btn"'));
  assert.match(monitoring, /<MonitoringMenuIcon\s+className="w-3\.5 h-3\.5 scale-\[1\.5\] origin-center text-sky-300"/);
  assert.match(header, /<FormationArchiveIcon className="w-3\.5 h-3\.5 text-purple-400"/);
  assert.match(monitoring, /bg-sky-500\/10 hover:bg-sky-500\/20 border-sky-400\/40/);
  assert.match(monitoring, /from-sky-600 to-teal-600 border-cyan-400\/60/);
  assert.match(monitoring, /onClick=\{\(\) => onPageChange\('surveillance'\)\}/);
  assert.match(monitoring, /bg-cyan-500 text-slate-950/);
  assert.match(header, /id="open-archive-btn"/);
});


const eventsHeader = source.slice(
  source.indexOf('{/* Unified events header:'),
  source.indexOf('{/* Panel Content (Expandable) */}'),
);

test('coin watching heading is emphasized without changing monitoring controls', () => {
  assert.doesNotMatch(topBar, /border-b border-cyan-400\/60/);
  assert.match(topBar, /bg-gradient-to-r from-white via-cyan-100 to-sky-300/);
  assert.match(topBar, /<MonitoringMenuIcon className="w-14 h-14" active \/>/);
  assert.match(topBar, /title=\{t\('surveillance\.ui\.refresh'\)\}/);
});

test('event feed combines title, count, description and collapse into one header', () => {
  assert.ok(eventsHeader.length > 0);
  assert.match(eventsHeader, /grid grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
  assert.match(eventsHeader, /surveillance\.ui\.recentEvents/);
  assert.match(eventsHeader, /surveillance\.ui\.eventCount/);
  assert.match(eventsHeader, /surveillance\.ui\.feedDescription/);
  assert.match(eventsHeader, /aria-expanded=\{isEventsExpanded\}/);
  assert.match(eventsHeader, /aria-controls="surveillance-events-panel"/);
  assert.match(eventsHeader, /'surveillance\.ui\.collapse' : 'surveillance\.ui\.expand'/);
  assert.doesNotMatch(eventsHeader, /<RefreshCw|title="Оновити події"|onClick=\{\(\) => refresh\(\)\}/);
  assert.match(source, /<div id="surveillance-events-panel" className="p-4 space-y-4">/);
});


test('monitoring tooltip stays within the available title area on narrow phones', () => {
  // The icon's center is not a safe anchor: its centered 22rem popup can
  // extend beyond the viewport. Instead the popup must be bounded by the
  // flex-shrinking header text container on mobile and desktop.
  assert.match(topBar, /className="relative min-w-0 flex-1" onMouseLeave=/);
  assert.match(topBar, /className="absolute left-0 top-full z-50 mt-2 box-border w-full max-w-\[22rem\] min-w-0/);
  assert.doesNotMatch(topBar, /left-1\/2 top-full|w-\[min\(78vw,22rem\)\]|-translate-x-1\/2/);
  assert.equal((topBar.match(/id="surveillance-monitoring-help"/g) || []).length, 1);
  assert.equal((topBar.match(/surveillance\.ui\.helpText/g) || []).length, 1);
});
