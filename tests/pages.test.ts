import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AuthProvider } from '../src/context/AuthContext';
import { AlertsProvider } from '../src/context/AlertsContext';
import { ArchiveProvider } from '../src/context/ArchiveContext';
import { SurveillanceProvider } from '../src/context/SurveillanceContext';
import { LanguageProvider } from '../src/context/LanguageContext';
import App from '../src/App';
import { Header } from '../src/components/Header';
import { CoinScreenerPage } from '../src/components/CoinScreenerPage';
import { SCREENER_SORT_OPTIONS } from '../src/components/ScreenerSortDropdown';
import { SurveillancePage } from '../src/components/SurveillancePage';
import { TerminalPage } from '../src/components/TerminalPage';
import { ReplayPage } from '../src/components/ReplayPage';
import { FormationCard } from '../src/components/FormationCard';
import { detectFormations } from '../src/utils/patternRecognition';
import { getFallbackScannedCoins } from '../src/utils/directExchangeClient';

Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, configurable: true });
const noop = () => {};
const wrap = (child: React.ReactNode) =>
  React.createElement(AuthProvider, { children:
    React.createElement(AlertsProvider, { children:
      React.createElement(ArchiveProvider, { children:
        React.createElement(SurveillanceProvider, { children:
          React.createElement(LanguageProvider, { children: child }),
        }),
      }),
    }),
  });

const pages: Array<[string, React.ReactNode]> = [
  ['application shell', React.createElement(App)],
  ['coin screener', React.createElement(CoinScreenerPage, { watchlist: [], onSelectCoin: noop,
    onToggleWatchlist: noop, onOpenTelegramAlerts: noop, onOpenWatchlist: noop })],
  ['surveillance', React.createElement(SurveillancePage)],
  ['terminal', React.createElement(TerminalPage, { coins: [], watchlist: [], onToggleWatchlist: noop })],
  ['replay', React.createElement(ReplayPage, { coins: [] })],
];
for (const [name, page] of pages) {
  test(`${name} renders without crashing with empty or offline data`, () => {
    const html = renderToString(wrap(page));
    assert.ok(html.length > 100);
    assert.ok(!html.includes('NaN'));
  });
}

test('main header centers the original-size h00k robot logo with adjacent fullscreen and language controls', () => {
  const html = renderToString(wrap(React.createElement(Header, {
    isLoading: false, totalCoins: 0, formationsCount: 0, bullishCount: 0,
    bearishCount: 0, watchlistCount: 0, soundEnabled: true,
    onToggleSound: noop, onRefresh: noop, onOpenWatchlist: noop,
    onOpenGuide: noop, onOpenMetaScalp: noop, lastUpdated: null,
    onOpenTelegramAlerts: noop, activePage: 'screener', onPageChange: noop,
  })));
  const start = html.indexOf('data-header-brand-row');
  assert.ok(start >= 0, 'centered brand row is rendered');
  const region = html.slice(start, html.indexOf('aria-label="Основна навігація"', start));
  assert.ok(region.includes('grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'), 'symmetric header columns');
  assert.ok(region.includes('src="/h00k-robot-logo.svg"'), 'original h00k logo is used');
  assert.match(region, /class="block h-7 w-auto max-w-none shrink-0 sm:h-8"/, 'restored previous logo height');
  const logoPos = region.indexOf('src="/h00k-robot-logo.svg"');
  const fullscreenPos = region.indexOf('aria-label="На весь екран"');
  const langPos = region.indexOf('<select');
  assert.ok(logoPos >= 0 && logoPos < langPos && langPos < fullscreenPos, 'language selector and fullscreen follow the centered logo');
});

test('sort and 24h volume controls share styling and sit side by side on mobile', () => {
  const html = renderToString(wrap(React.createElement(CoinScreenerPage, {
    watchlist: [], onSelectCoin: noop, onToggleWatchlist: noop,
    onOpenTelegramAlerts: noop, onOpenWatchlist: noop,
  })));
  const sortShell = html.match(/<div data-screener-filter="sort" class="([^"]+)"/);
  const volumeShell = html.match(/<div data-screener-filter="volume" class="([^"]+)"/);
  assert.ok(sortShell, 'sort shell is rendered');
  assert.ok(volumeShell, 'volume shell is rendered');
  // Sort and volume share visual styling, while their desktop widths may
  // differ to accommodate the longer 24-hour volume label and direction arrow.
  const withoutDesktopWidth = (classes: string) => classes.replace(/\blg:w-\d+\b/g, '').trim();
  assert.equal(withoutDesktopWidth(sortShell[1]), withoutDesktopWidth(volumeShell[1]),
    'both filters retain identical visual styling apart from their desktop width');
  assert.match(sortShell[1], /\blg:w-\d+\b/, 'sort has a bounded desktop width');
  assert.match(volumeShell[1], /\blg:w-\d+\b/, 'volume has a bounded desktop width');
  assert.match(sortShell[1], /rounded-xl/);
  assert.match(sortShell[1], /border-slate-800/);
  assert.match(html, /grid min-w-0 grid-cols-2 gap-2/, 'filters remain side by side on narrow screens');
  assert.match(sortShell[1], /flex-col/);
  assert.match(sortShell[1], /sm:flex-row/);
  assert.ok(html.indexOf('data-screener-filter="sort"') < html.indexOf('data-screener-filter="volume"'), 'volume is to the right of sort');
  assert.match(html, /Без обмежень/, 'volume option remains visible');
  assert.match(html, /aria-haspopup="listbox"/, 'volume dropdown remains accessible');
  assert.match(html, /id="screener-volume-cap"/);
  assert.match(html, /id="screener-sort"/, 'sort uses a custom dropdown button');
  assert.match(html, /id="screener-sort-label"/, 'sort dropdown has an accessible label');
  assert.match(html, /aria-labelledby="screener-sort-label screener-sort-value"/);
  assert.equal((html.match(/aria-haspopup="listbox"/g) ?? []).length, 2, 'both filters use accessible custom listboxes');
  const sortMarkup = html.slice(html.indexOf('data-screener-filter="sort"'), html.indexOf('data-screener-filter="volume"'));
  assert.doesNotMatch(sortMarkup, /<select/, 'sort no longer uses a native light-colored menu');
});

test('sort dropdown preserves all original filter choices and their order', () => {
  assert.deepEqual(SCREENER_SORT_OPTIONS.map(option => option.value), [
    'volume', 'priceChange', 'price', 'volatility', 'distanceToHigh', 'distanceToLow',
  ]);
  assert.ok(SCREENER_SORT_OPTIONS.every(option => option.label.length > 0));
});

test('formation card renders valid measured levels', () => {
  const data = Array.from({ length: 40 }, (_, i) => ({
    time: Math.floor(Date.now() / 1000) - (41 - i) * 3600,
    open: 99, high: 100, low: 98, close: 99, volume: 100,
  }));
  data[39] = { ...data[39], open: 98.5, close: 99.5, high: 99.7, low: 90 };
  const formation = detectFormations(data, 'BTCUSDT').find(f => f.patternKey === 'hammer');
  assert.ok(formation);
  const coin = { ...getFallbackScannedCoins()[0], currentPrice: 99.5, formations: [formation] };
  const html = renderToString(wrap(React.createElement(FormationCard, { coin, formation,
    isWatchlisted: false, onToggleWatchlist: noop, onSelect: noop })));
  assert.ok(!html.includes('NaN'));
  assert.ok(html.includes('BTC'));
});
