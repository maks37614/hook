import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialActivePage, shouldRunStandardScan, shouldRunEarlyScan }
  from '../src/utils/foregroundScanPolicy';
import type { ActivePageType } from '../src/types';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a deep-linked Desktop pane begins on its actual page, not the Screener', () => {
  assert.equal(initialActivePage('#terminal'), 'terminal');
  assert.equal(initialActivePage('#replay'), 'replay');
  assert.equal(initialActivePage('#surveillance'), 'surveillance');
  assert.equal(initialActivePage('#patterns'), 'patterns');
  assert.equal(initialActivePage('#screener'), 'screener');
  assert.equal(initialActivePage(''), 'screener');
  assert.equal(initialActivePage('#chart/binance/futures/BTCUSDT'), 'screener');
});

test('normal formation scanner never runs from Terminal, Replay or Surveillance', () => {
  const pages: ActivePageType[] = ['screener', 'patterns', 'terminal', 'replay', 'surveillance'];
  for (const page of pages) {
    for (const early of [false, true]) {
      const wanted = page === 'screener' || (page === 'patterns' && !early);
      assert.equal(shouldRunStandardScan(page, early, false), wanted, page + ':' + early);
      assert.equal(shouldRunStandardScan(page, early, true), false, 'chart route never scans');
    }
  }
});

test('early W/M full-market scan only runs in early Formations', () => {
  const pages: ActivePageType[] = ['screener', 'patterns', 'terminal', 'replay', 'surveillance'];
  for (const page of pages) {
    for (const early of [false, true]) {
      assert.equal(shouldRunEarlyScan(page, early, false), page === 'patterns' && early);
      assert.equal(shouldRunEarlyScan(page, early, true), false);
    }
  }
});

test('React effects apply route-aware policy before starting API scans', () => {
  const app = read('../src/App.tsx');
  assert.match(app, /initialActivePage\(window\.location\.hash\)/);
  assert.match(app, /useState\(desktopPanel === 'early'\)/, 'early Desktop view must not first scan regular formations');
  assert.match(app, /if \(!shouldRunEarlyScan\(activePage, earlyMode, chartPageActive\)\) return;/);
  assert.match(app, /if \(!shouldRunStandardScan\(activePage, earlyMode, chartPageActive\)\) return;/);
  assert.match(app, /if \(document\.hidden \|\| \(!initial && Date\.now\(\) - lastRequestedAt < 50_000\)\) return;/);
  assert.match(app, /document\.addEventListener\('visibilitychange', onVisibilityChange\)/);
  assert.doesNotMatch(app, /chartPageActive \|\| \(earlyMode && activePage === 'screener'\)/);
  // The 24/7 surveillance logic remains independently mounted, not tied
  // to the foreground scanner's visibility or selected page.
  assert.match(app, /useSurveillance\(\)/);
});

test('Screener market quote polling pauses in hidden windows and resumes on focus', () => {
  const screener = read('../src/components/CoinScreenerPage.tsx');
  assert.match(screener, /if \(document\.hidden\) return;/);
  assert.match(screener, /lastQuotePollRef/);
  assert.match(screener, /document\.addEventListener\('visibilitychange', onVisibilityChange\)/);
  assert.match(screener, /document\.removeEventListener\('visibilitychange', onVisibilityChange\)/);
  assert.match(screener, /currentRequest\.current\?\.controller\.abort\(\)/);
});
