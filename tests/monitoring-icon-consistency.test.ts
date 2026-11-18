import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MonitoringMenuIcon } from '../src/components/MonitoringIcon';

const read = (name: string) =>
  readFileSync(new URL('../src/components/' + name, import.meta.url), 'utf8');

test('every coin monitoring emblem uses the same vector as the site header', () => {
  const locations: Array<[string, number]> = [
    ['Header.tsx', 1],
    ['CoinScreenerPage.tsx', 3], // desktop list, coin cards and feedback toast
    ['FormationCard.tsx', 1],
    ['EarlyFormationCard.tsx', 1],
    ['SurveillancePage.tsx', 2], // page title and empty monitoring state
  ];
  for (const [path, expected] of locations) {
    const source = read(path);
    assert.match(source, /import \{ MonitoringMenuIcon \} from '\.\/MonitoringIcon';/,
      path + ': import the canonical header icon, do not copy its SVG');
    assert.equal((source.match(/<MonitoringMenuIcon\b/g) ?? []).length, expected,
      path + ': coin monitoring icon count changed');
    assert.doesNotMatch(source, /<Radar\b|<MonitoringIcon\b/,
      path + ': no legacy monitoring emblems should remain');
  }
});

test('all tracking actions preserve semantics, status and per-market selection', () => {
  const screener = read('CoinScreenerPage.tsx');
  const formation = read('FormationCard.tsx');
  const early = read('EarlyFormationCard.tsx');
  const page = read('SurveillancePage.tsx');
  assert.equal((screener.match(/onClick=\{\(e\) => handleSurveillanceToggle\(e, coin\)\}/g) ?? []).length, 2,
    'list and card still toggle exactly the clicked coin');
  assert.equal((screener.match(/const monitoringActive = onSurveillance && isCoinMonitored\(/g) ?? []).length, 2,
    'render each coin status once per layout instead of repeated scans');
  assert.match(screener, /title=\{[\s\S]*?screener\.main\.surveillancePaused/);
  assert.match(formation, /removeCoinFromSurveillance\(monitoredEntry\.id\)/);
  assert.match(formation, /addCoinToSurveillance\(coin\.symbol, coin\.exchange, coin\.marketType\)/);
  assert.match(formation, /item\.exchange === coin\.exchange && item\.marketType === coin\.marketType/);
  assert.match(early, /aria-pressed=\{isMonitored\}/);
  assert.match(page, /onClick=\{\(\) => handleToggleActive\(coin\.id, coin\.symbol, coin\.isActive\)\}/);
  assert.match(page, /<Pause className="w-3 h-3" \/> : <Play className="w-3 h-3" \/>/,
    'pause and resume remain distinct actions, not generic monitoring glyphs');
});

test('header monitoring SVG is accessible, scalable and highlights active state', () => {
  const inactive = renderToStaticMarkup(React.createElement(MonitoringMenuIcon, {
    className: 'w-3.5 h-3.5', active: false,
  }));
  const active = renderToStaticMarkup(React.createElement(MonitoringMenuIcon, {
    className: 'w-8 h-8', active: true,
  }));
  for (const markup of [inactive, active]) {
    assert.match(markup, /viewBox="0 0 24 24"/);
    assert.match(markup, /aria-hidden="true"/);
    assert.match(markup, /linearGradient/);
    assert.match(markup, /stroke-width="2\.25"/);
  }
  assert.match(inactive, /#CCB7F9/);
  assert.match(active, /#E9D8FF/);
});

test('header monitoring glyph grows visually without altering toolbar button or neighboring SVGs', () => {
  const header = read('Header.tsx');
  const monitoringStart = header.indexOf('id="open-surveillance-btn"');
  const archiveStart = header.indexOf('id="open-archive-btn"', monitoringStart);
  assert.ok(monitoringStart >= 0 && archiveStart > monitoringStart);
  const monitoringButton = header.slice(monitoringStart, archiveStart);
  assert.match(monitoringButton, /<MonitoringMenuIcon[\s\S]*?className="w-3\.5 h-3\.5 scale-\[1\.5\] origin-center text-sky-300"/);
  assert.match(monitoringButton, /onClick=\{\(\) => onPageChange\('surveillance'\)\}/);
  // The monitoring-count badge is a sibling of the SVG and legitimately
  // uses min-w-[16px]. Restrict the geometry guard to the button and SVG.
  const iconTag = monitoringButton.match(/<MonitoringMenuIcon[\s\S]*?\/>/)?.[0];
  assert.ok(iconTag, 'monitoring SVG tag is present');
  assert.doesNotMatch(iconTag, /px-\[|min-w-\[|max-w-\[/);
  const buttonHeader = monitoringButton.slice(0, monitoringButton.indexOf('<MonitoringMenuIcon'));
  assert.match(buttonHeader, /className=\{`flex items-center gap-1\.5 px-2 sm:px-2\.5 py-1\.5/);
  assert.doesNotMatch(buttonHeader, /px-\[|min-w-\[|max-w-\[/);
  const telegramButton = header.slice(header.indexOf('id="open-telegram-btn"'), monitoringStart);
  assert.match(telegramButton, /<Send className="w-3\.5 h-3\.5 text-sky-400"/);
  const archiveButton = header.slice(archiveStart, header.indexOf('id="open-guide-btn"', archiveStart));
  assert.match(archiveButton, /<FormationArchiveIcon className="w-3\.5 h-3\.5 text-purple-400"/);
});
