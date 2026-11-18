import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { ActivePageType } from '../src/types';
import { foregroundScanKind, shouldRunEarlyScan, shouldRunStandardScan } from '../src/utils/foregroundScanPolicy';
import { supportedLanguages, translatePhrase } from '../src/locales';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('manual refresh can only run the scanner belonging to the visible page', () => {
  for (const page of ['screener','patterns','terminal','replay','surveillance'] as ActivePageType[]) {
    for (const early of [true, false]) {
      for (const chart of [true, false]) {
        const target = foregroundScanKind(page, early, chart);
        const expected = !chart
          ? (page === 'patterns' && early ? 'early' :
            page === 'screener' || (page === 'patterns' && !early) ? 'regular' : null)
          : null;
        assert.equal(target, expected, page + ':' + early + ':' + chart);
        assert.equal(target === 'regular', shouldRunStandardScan(page, early, chart));
        assert.equal(target === 'early', shouldRunEarlyScan(page, early, chart));
      }
    }
  }
  const app = read('../src/App.tsx');
  assert.match(app, /const target = foregroundScanKind\(activePage, earlyMode, chartPageActive\)/);
  assert.match(app, /if \(target === 'early'\) refreshFullEarlyScan\(\)/);
  assert.match(app, /else if \(target === 'regular'\) void fetchScreenerData\(\)/);
  assert.doesNotMatch(app, /earlyMode && activePage === 'screener' \? refreshFullEarlyScan/);
});

test('503 busy with Retry-After never triggers a browser-wide 60-coin fallback', () => {
  const app = read('../src/App.tsx');
  const start = app.indexOf('const fetchScreenerData = useCallback');
  const end = app.indexOf('// Abort an in-flight browser scan on route transition', start);
  assert.ok(start > 0 && end > start);
  const handler = app.slice(start, end);
  const busy = handler.indexOf("res.status === 503 && res.headers.has('Retry-After')");
  const fallback = handler.indexOf('runDirectClientScan({');
  assert.ok(busy > 0 && busy < fallback);
  assert.match(handler.slice(busy, fallback), /setScanBusy\(true\)/);
  assert.match(handler.slice(busy, fallback), /\breturn;\s+\}/);
  assert.match(handler, /setScanBusy\(false\)/);
  assert.match(handler, /setIsLoading\(false\)/);
  assert.match(handler, /allowStaticFallback: false/);
  assert.match(handler, /if \(controller.signal.aborted \|\| requestId !== scanRequestRef.current\) return/);
  assert.match(handler, /if \(!dataLoaded && !controller.signal.aborted && requestId === scanRequestRef.current\)/);
  assert.doesNotMatch(handler, /setCoins\(getFallbackScannedCoins\(/);
});

test('real browser fallback remains available, static placeholders can be excluded', () => {
  const direct = read('../src/utils/directExchangeClient.ts');
  assert.match(direct, /allowStaticFallback\?: boolean;/);
  assert.match(direct, /return options\.allowStaticFallback === false \? \[\] : getFallbackScannedCoins\(params\.timeframe\)/);
  assert.match(direct, /return scanned\.length > 0 \? scanned/);
  assert.match(direct, /options\.completeEarly \? allCoins\.length : 60/);
  assert.match(direct, /if \(options\.completeEarly\) throw err/);
  const app = read('../src/App.tsx');
  assert.match(app, /setCoins\(directCoins\)/);
  assert.match(app, /reportStrongFormations\(directCoins\)/);
  assert.match(app, /if \(!dataLoaded\) \{/);
});

test('changing minimum-volume filter does not restart the heavyweight scan', () => {
  const app = read('../src/App.tsx');
  assert.match(app, /\}, \[chartPageActive, filters\.timeframe, filters\.exchange, filters\.marketType, reportStrongFormations\]\);/);
  assert.doesNotMatch(app, /\}, \[chartPageActive, filters\.timeframe, filters\.exchange, filters\.marketType, filters\.minVolumeUsd/);
  assert.match(app, /minVolume: '0'/);
  const list = read('../src/utils/formationList.ts');
  assert.match(list, /coin\.volume24hUsd < filters\.minVolumeUsd/);
});

test('busy and unavailable scanner states are localized into all four languages', () => {
  const busy = 'Сканер тимчасово зайнятий. Попередні результати збережено; повторіть спробу трохи пізніше.';
  const unavailable = 'Не вдалося отримати актуальні результати сканування. Попередні дані збережено; перевірте з’єднання та повторіть спробу.';
  for (const language of supportedLanguages) {
    assert.ok(translatePhrase(language, busy));
    assert.ok(translatePhrase(language, unavailable));
    if (language === 'en' || language === 'pl') {
      assert.doesNotMatch(translatePhrase(language, busy), /[А-Яа-яІіЇїЄєҐґ]/);
      assert.doesNotMatch(translatePhrase(language, unavailable), /[А-Яа-яІіЇїЄєҐґ]/);
    }
  }
  const app = read('../src/App.tsx');
  assert.match(app, /\{!earlyMode && \(error \|\| \(scanBusy && lastUpdated === null\)\) && \(/,
    'the banner is reserved for missing cached data or actual failures');
  assert.match(app, /!earlyMode && scanBusy && lastUpdated !== null/,
    'cached results stay visible with a small warning icon');
  assert.match(app, /MarketDataFreshnessIcon/);
  assert.match(app, /scanBusy \? tr\('Сканер тимчасово зайнятий/);
  assert.match(app, /tr\(error \?\? ''\)/);
  assert.match(app, /tr\('Повторити'\)/);
});
