import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translatePhrase } from '../src/locales';

const detail = readFileSync(new URL('../src/components/FormationDetailsModal.tsx', import.meta.url), 'utf8');
const analysis = readFileSync(new URL('../src/components/ChartTopAnalysisText.tsx', import.meta.url), 'utf8');

test('formation detail never passes old timeframe or instrument candles to chart and analysis', () => {
  assert.match(detail, /const historyKey = \[coin.exchange, coin.marketType, normalizeExchangeSymbol\(coin.symbol\), timeframe, historyLimit\]\.join\(':'\)/);
  assert.match(detail, /const visibleKlines = loadedHistoryKey === historyKey \? klines : \[\]/);
  assert.match(detail, /const chartHistoryLoading = \(!archivedVisualAvailable \|\| showLiveArchivedChart\) && \(loadingKlines \|\| loadedHistoryKey !== historyKey\)/);
  assert.match(detail, /<ChartTopAnalysisText[\s\S]*?klines=\{visibleKlines\}/);
  assert.match(detail, /<TradingViewChart[\s\S]*?klines=\{visibleKlines\}/);
  assert.match(detail, /<FullscreenChartModal[\s\S]*?klines=\{visibleKlines\}/);
});

test('candle history requests are cancelled on navigation and bounded by meaningful identifiers', () => {
  assert.match(detail, /const controller = new AbortController\(\)/);
  assert.match(detail, /signal: AbortSignal\.any\(\[controller\.signal, AbortSignal\.timeout\(12_000\)\]\)/);
  assert.match(detail, /<TradingViewChart[\s\S]*?historyManagedByParent/);
  assert.match(detail, /if \(cancelled \|\| controller.signal.aborted\) return/);
  assert.match(detail, /return \(\) => \{ cancelled = true; controller.abort\(\); \}/);
  assert.doesNotMatch(detail, /\[coin, timeframe, historyLimit\]/);
  assert.match(detail, /\[coin.exchange, coin.marketType, coin.symbol, timeframe, historyLimit, historyRetry, archivedVisualAvailable, showLiveArchivedChart\]/);
});

test('frozen archived chart remains available without a live candle request until opt-in', () => {
  assert.match(detail, /if\(archivedVisualAvailable&&!showLiveArchivedChart\) \{/);
  assert.match(detail, /setLoadingKlines\(false\)/);
  assert.match(detail, /setHistoryFailed\(false\)/);
  assert.match(detail, /setKlines\(\[\]\)/);
  assert.match(detail, /setShowLiveArchivedChart\(true\)/);
  assert.match(detail, /archivedVisualAvailable && !showLiveArchivedChart \? \(/);
  assert.match(detail, /\}, !isFullscreenChartOpen && !showArchivedStatic\)/);
  assert.match(detail, /\{!showArchivedStatic && <ChartTopAnalysisText/);
  assert.match(detail, /\{!showArchivedStatic && <SmartAnalysisBlock/);
  assert.match(detail, /apiFetch\('\/api\/account\/archive\/'\+encodeURIComponent\(archivedItem\.id\)\+'\/chart-image'/);
});

test('failed relay and direct exchange requests show a real error and retry, not an empty chart', () => {
  assert.match(detail, /historyFailed \? \(/);
  assert.match(detail, /setHistoryRetry\(n => n \+ 1\)/);
  assert.match(detail, /setHistoryFailed\(received.length === 0\)/);
  for (const key of ['Не вдалося завантажити свічки з біржі', 'Спробувати ще раз']) {
    for (const language of ['uk','en','ru','pl'] as const) {
      assert.ok(translatePhrase(language,key).trim());
      if(language !== 'uk') assert.notEqual(translatePhrase(language,key),key);
    }
  }
});

test('OI polling retains 10 second freshness without overlap or cross-coin updates', () => {
  assert.match(analysis, /const oiRequestGeneration = useRef\(0\)/);
  assert.match(analysis, /generation !== oiRequestGeneration.current/);
  assert.match(analysis, /if \(inFlight\) return/);
  assert.match(analysis, /document.visibilityState !== 'hidden'/);
  assert.match(analysis, /\}, 10_000\)/);
  assert.match(analysis, /\[coin.symbol, coin.baseAsset\]/);
  assert.doesNotMatch(analysis, /\[coin.symbol, coin.baseAsset, coin.currentPrice\]/);
});
