import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const icon = read('../src/components/MarketDataFreshnessIcon.tsx');
const screener = read('../src/components/CoinScreenerPage.tsx');
const terminal = read('../src/components/terminal/TerminalPresetPanel.tsx');
const sentiment = read('../src/components/MarketSentimentWidget.tsx');
const formations = read('../src/App.tsx');
const early = read('../src/components/EarlyFormationsResults.tsx');

test('one compact, accessible source status icon is reused across partial market views', () => {
  assert.match(icon, /role="img" aria-label=\{label\} title=\{label\}/);
  assert.match(icon, /data-market-freshness=\{kind\}/);
  assert.doesNotMatch(icon, /setInterval|fetch\(|setTimeout|WebSocket/);
  for (const source of [screener, terminal, sentiment, formations, early]) {
    assert.match(source, /MarketDataFreshnessIcon/, 'missing shared indicator');
  }
});

test('Screener keeps genuine network errors but does not promote partial exchange status to red banner', () => {
  assert.match(screener, /setHasPartialMarketData\(Boolean\(snapshot\.warning\)\)/);
  assert.doesNotMatch(screener, /setError\(snapshot\.warning\)/);
  assert.match(screener, /\{error && \(/);
  assert.match(screener, /onClick=\{\(\) => fetchCoins\(\)\}/);
});

test('Terminal preset safety gate is unchanged and raw source diagnostics are not printed', () => {
  assert.match(terminal, /activePreset && autoUpdate && !pendingFormationPreset && readyCoins\[activePreset\]\.length/);
  assert.match(terminal, /activePreset === 'formations' \|\| \(!error && !snapshot\.warning\)/,
    'cached Formations can update while stale external market snapshots stay gated');
  assert.doesNotMatch(terminal, /localizeTerminalMarketWarning/);
  assert.match(terminal, /snapshot\.warning \|\| \(error && snapshot\.coins\.length > 0\)/);
  assert.match(terminal, /error && snapshot\.coins\.length === 0/);
});

test('Market Sentiment remains transparent when no index exists; partial data is quiet', () => {
  assert.match(sentiment, /sentimentPartial/);
  assert.match(sentiment, /kind=\{error \? 'refresh-failed' : 'partial'\}/);
  assert.doesNotMatch(sentiment, /border-b border-amber-500\/20 px-3 py-2/);
  assert.match(sentiment, /if \(!data\) \{/);
  assert.match(sentiment, /\{error && <p className="mt-2 text-xs text-amber-300"/);
  assert.match(sentiment, /setInterval\(refreshVisible, 30000\)/);
  assert.match(sentiment, /document\.visibilityState === 'hidden'/);
  assert.match(sentiment, /document\.addEventListener\('visibilitychange', refreshVisible\)/);
});

test('formation busy state with cached results is compact; no-data and true failures still retry', () => {
  assert.match(formations, /scanBusy && lastUpdated !== null/);
  assert.match(formations, /error \|\| \(scanBusy && lastUpdated === null\)/);
  assert.match(formations, /onClick=\{\(\) => fetchScreenerData\(\)\}/);
  assert.match(early, /scanProgress\.message \|\| issues > 0/);
  assert.doesNotMatch(early, /\{trError\(scanProgress\.message\)\}/);
  assert.match(early, /scanProgress\?\.status === 'failed' && !entries\.length/);
});
