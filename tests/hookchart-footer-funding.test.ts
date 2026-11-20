import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { translatePhrase } from '../src/locales';
import { HookChartFooterFunding, formatFooterFundingRate } from '../src/components/hookchart/HookChartFooterFunding';

const canvas = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
const aboveChart = readFileSync(new URL('../src/components/ChartTopAnalysisText.tsx', import.meta.url), 'utf8');
const footer = readFileSync(new URL('../src/components/hookchart/HookChartFooterFunding.tsx', import.meta.url), 'utf8');

test('funding is after Trades 24h in shared HookChart footer, not above the chart', () => {
  const index = canvas.indexOf('Trades 24h:');
  const fundingIndex = canvas.indexOf('<HookChartFooterFunding', index);
  const footerEnd = canvas.indexOf('</div>}', fundingIndex);
  assert.ok(index >= 0 && fundingIndex > index && footerEnd > fundingIndex);
  assert.ok(canvas.includes('import { HookChartFooterFunding }'));
  assert.ok(canvas.includes('key={`${exchange}:${marketType}:${normalizeExchangeSymbol(symbol)}`}'));
  assert.ok(canvas.includes('exchange={exchange}'));
  assert.ok(canvas.includes('marketType={marketType}'));
  assert.ok(canvas.includes('symbol={symbol}'));
  assert.ok(canvas.includes('language={chartLanguage}'));
  assert.doesNotMatch(aboveChart, /subscribeSharedHookChartFunding|chart-top-funding|Фандинг Binance:|Фандинг Bybit:/);
});

test('one selected exchange per futures chart, no spot funding subscriptions, no stale value on scope switch', () => {
  assert.match(footer, /subscribeSharedHookChartFunding\(exchange, normalizedSymbol, snapshot =>/);
  assert.match(footer, /marketType !== 'futures'/);
  assert.match(footer, /reading\?\.scope === scope/);
  assert.match(footer, /\[exchange, marketType, normalizedSymbol, scope\]/);
  assert.doesNotMatch(footer, /Promise\.all|setInterval|fapi\/|v5\/market/);
  assert.match(footer, /memo\(function HookChartFooterFunding/);
});

test('spot displays unavailable funding on both exchanges, with contextual explanation', () => {
  for (const exchange of ['binance', 'bybit'] as const) {
    const html = renderToStaticMarkup(React.createElement(HookChartFooterFunding, {
      exchange, marketType: 'spot', symbol: 'BTCUSDT', language: 'uk',
    }));
    assert.match(html, /data-testid="hookchart-footer-funding"/);
    assert.match(html, /На спотовому ринку фандинг відсутній/);
    assert.ok(html.includes(`Фандинг ${exchange === 'binance' ? 'Binance' : 'Bybit'}:`));
    assert.match(html, /<b>—<\/b>/);
  }
});

test('funding percentages are rate ×100 with four decimals and a sign', () => {
  assert.equal(formatFooterFundingRate(0.0001), '+0.0100%');
  assert.equal(formatFooterFundingRate(-0.00005), '-0.0050%');
  assert.equal(formatFooterFundingRate(0), '0.0000%');
  assert.equal(formatFooterFundingRate(Number.NaN), '—');
  assert.equal(formatFooterFundingRate(Number.POSITIVE_INFINITY), '—');
});

test('exchange-specific label and spot/perpetual explanation are translated into four languages', () => {
  for (const language of ['uk', 'en', 'pl', 'ru'] as const) {
    for (const label of ['Фандинг Binance:', 'Фандинг Bybit:',
      'На спотовому ринку фандинг відсутній.',
      'Ставка фандингу вибраної біржі для безстрокових ф’ючерсів.']) {
      assert.ok(translatePhrase(language, label));
      if (language !== 'uk') assert.notEqual(translatePhrase(language, label), label);
    }
  }
});
