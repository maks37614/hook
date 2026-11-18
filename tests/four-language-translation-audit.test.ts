import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { MarketSentimentData } from '../src/types';
import { supportedLanguages, translateKey, translatePhrase } from '../src/locales';
import { auditedPhraseRows } from '../src/locales/audit20261114';
import { auditedStringRows } from '../src/locales/auditDynamic20261114';
import {
  localizeBybitDerivativesLabel,
  localizeSentimentSummary,
  localizeSentimentVolatility,
  localizeTakerDeltaLabel,
} from '../src/utils/marketSentimentLocalization';

const LANGUAGES = ['uk', 'en', 'ru', 'pl'] as const;
const sample = {
  compositeScore: 7,
  sentimentState: 'extreme_fear',
  sentimentLabel: 'Екстремальний страх / Сильний тиск продавців',
  summary: 'Настрій ринку: український текст зі старого API',
  priceTrendDynamics: {
    advancingCount: 136,
    decliningCount: 2409,
    unchangedCount: 144,
    advancingPct: 5.1,
    trendBias: 'bearish',
    avgChange24h: -8.39,
  },
  tradingVolume: { total24hUsd: 6e10, volumeVelocity: null, volumeChangePct: null },
  marketVolatility: { index: 100, label: 'Висока добова волатильність', avgDailyRangePct: 14.58 },
  marketBreadth: {
    aboveEma20Pct: null,
    nearHighsPct: null,
    nearLowsPct: null,
    breadthScore: 12,
    verdict: 'Переважає падіння',
  },
  capitalFlow: {
    netInflow24hUsd: null,
    direction: null,
    label: 'Дельта тейкерів Binance Spot · 8/8 пар · UTC сьогодні',
    sampledPairs: 8,
    sampleCoverage: '8/8',
    takerDeltaUsd: -1e9,
  },
  derivativesOverview: {
    aggregatedOIUsd: 10_230_000_000,
    oiChange24hPct: null,
    avgFundingRate: -0.0013,
    fundingBias: 'balanced',
    instrumentCount: 829,
    fundingInstrumentCount: 829,
    sourceLabel: 'Bybit USDT Linear · OI 829 / Funding 829 контрактів',
  },
  dataQuality: {
    analyzedPairs: 2689,
    locationCoveragePct: 4,
    locationPairs: 110,
    locationReliable: false,
    freshSources: 3,
    availableSources: 3,
    totalSources: 4,
  },
  lastUpdated: 0,
} satisfies MarketSentimentData;

test('new UI phrases and parameterized messages cover four languages without missing placeholders', () => {
  assert.deepEqual(supportedLanguages, LANGUAGES);
  for (const row of auditedPhraseRows) {
    assert.equal(row.length, 4);
    assert.ok(row.every(value => value.length > 0), 'missing translation: ' + row[0]);
  }
  for (const row of auditedStringRows) {
    assert.equal(row.length, 5);
    assert.ok(row.every(value => value.length > 0), 'missing translation: ' + row[0]);
    const placeholders = row.slice(1).map(value =>
      [...value.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)].map(match => match[1]).sort().join(','));
    assert.equal(new Set(placeholders).size, 1, 'placeholder mismatch: ' + row[0]);
    for (const language of LANGUAGES) {
      assert.notEqual(translateKey(language, row[0]), row[0], 'unregistered key: ' + row[0]);
    }
  }
  assert.equal(translatePhrase('en', 'Тренд & Динаміка'), 'Trend & Dynamics');
  assert.equal(translatePhrase('pl', 'Тестування на реальному ринку'), 'Trening na rynku historycznym');
});

test('market sentiment uses observed values and not the Ukrainian API summary', () => {
  for (const language of LANGUAGES) {
    const result = localizeSentimentSummary(sample, language);
    for (const metric of ['136', '2689', '2409', '-8.39', '14.58', '110']) {
      assert.ok(result.includes(metric), 'market metric ' + metric + ' missing for ' + language);
    }
    assert.ok(!result.includes('український текст зі старого API'));
    if (language === 'en' || language === 'pl') {
      assert.doesNotMatch(result, /[А-Яа-яІіЇїЄєҐґ]/, language + ' summary contains Cyrillic text');
    }
  }
});

test('sentiment source descriptions are localized without inventing source metrics', () => {
  assert.match(localizeTakerDeltaLabel(sample, 'en'), /Binance Spot taker delta · 8\/8 pairs/);
  assert.match(localizeTakerDeltaLabel(sample, 'pl'), /8\/8 par/);
  assert.match(localizeBybitDerivativesLabel(sample, 'en'), /OI 829 \/ Funding 829 contracts/);
  assert.equal(localizeSentimentVolatility(sample, 'en'), 'High daily volatility');
  assert.equal(localizeSentimentVolatility(sample, 'pl'), 'Wysoka zmienność dzienna');
  const unknownSource = {
    ...sample, capitalFlow: { ...sample.capitalFlow, label: 'Unidentified source' },
  };
  assert.match(localizeTakerDeltaLabel(unknownSource, 'en'), /unavailable/);
});

test('live widgets and Replay use localized UI values, not server-provided Ukrainian labels', () => {
  const widget = readFileSync(new URL('../src/components/MarketSentimentWidget.tsx', import.meta.url), 'utf8');
  const scale = readFileSync(new URL('../src/components/MarketSentimentScale.tsx', import.meta.url), 'utf8');
  const volume = readFileSync(new URL('../src/components/ScreenerVolumeDropdown.tsx', import.meta.url), 'utf8');
  const replay = readFileSync(new URL('../src/components/ReplayPage.tsx', import.meta.url), 'utf8');
  assert.match(widget, /localizeSentimentSummary\(data, language\)/);
  assert.doesNotMatch(widget, /\{data\.summary\}/);
  assert.doesNotMatch(widget, /\{data\.capitalFlow\.label\}/);
  assert.match(scale, /t\('sentiment\.meterValue'/);
  assert.match(volume, /t\('screener\.volume\.fromTooltip'\)/);
  assert.match(volume, /t\('screener\.volume\.toTooltip'\)/);
  assert.match(replay, /t\('replay\.order\.marginDescription'/);
  assert.match(replay, /t\('replay\.order\.tpDescription'/);
  assert.match(replay, /t\('replay\.history\.readyDescription'/);
});
