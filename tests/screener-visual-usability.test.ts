import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const screener = read('src/components/CoinScreenerPage.tsx');
const css = read('src/index.css');

test('Screener-only table scrollbar is visible without globally changing the chart or site scrollbars', () => {
  assert.match(screener, /data-screener-guide="results" className="screener-data-scroll overflow-x-auto touch-scroll/);
  assert.match(css, /#root \.screener-data-scroll \{[\s\S]*?scrollbar-width: thin !important;/);
  assert.match(css, /#root \.screener-data-scroll::-webkit-scrollbar \{[\s\S]*?display: block !important;/);
  assert.match(screener, /<table className="w-full min-w-\[760px\] text-left text-xs border-collapse">/);
  assert.ok(!css.includes('.hookchart-root .screener-data-scroll'));
});

test('Screener view switch and refresh retain handlers with larger accessible controls', () => {
  const block = screener.slice(screener.indexOf('data-screener-guide="views"'), screener.indexOf('{/* Keep the paired mobile filters;'));
  assert.match(block, /aria-label=\{t\('viewTable'\)\}/);
  assert.match(block, /aria-pressed=\{viewMode === 'table'\}/);
  assert.match(block, /aria-label=\{t\('viewCards'\)\}/);
  assert.match(block, /aria-pressed=\{viewMode === 'cards'\}/);
  assert.match(block, /aria-label=\{t\('screener.main.refreshQuotes'\)\}/);
  assert.equal((block.match(/flex h-8 w-8 items-center justify-center/g) ?? []).length, 3);
  assert.match(block, /setActiveCardChart\(null\)/);
  assert.match(block, /onClick=\{\(\) => fetchCoins\(\)\}/);
});

test('Card chart size, exchange badge geometry and real-time data stay unmodified', () => {
  assert.match(screener, /style=\{isChartOpen && activeCardChart \? \{ height: activeCardChart.height \} : undefined\}/);
  assert.match(screener, /site-exchange-badge--compact text-\[9px\] px-1\.5 py-0\.2 rounded/);
  assert.match(screener, /<LazyScreenerCardChart/);
  assert.match(screener, /data-screener-card-actions/);
});

const header = read('src/components/Header.tsx');

test('Header shortcuts have consistent hit areas and accessible descriptions', () => {
  const shortcutIds = [
    'open-metascalp-btn', 'open-watchlist-btn', 'open-telegram-btn',
    'open-surveillance-btn', 'open-archive-btn', 'open-guide-btn',
  ];
  for (const id of shortcutIds) {
    assert.ok(header.includes('id="' + id + '"'), 'Missing header shortcut ' + id);
    assert.ok(css.includes('#' + id), 'Missing sized header control ' + id);
  }
  for (const id of shortcutIds.slice(1, 5)) {
    const block = header.slice(header.indexOf('id="' + id + '"'), header.indexOf('</button>', header.indexOf('id="' + id + '"')));
    assert.match(block, /aria-label=/, 'Missing aria-label for ' + id);
  }
  assert.match(css, /#root \.app-header :is\([\s\S]*?min-height: 32px;/);
  assert.match(css, /#root \.app-header #open-surveillance-btn > span:first-child/);
  assert.match(header, /<SiteNotificationBell/);
});
