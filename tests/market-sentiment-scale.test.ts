import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { clampSentimentScore, MarketSentimentScale } from '../src/components/MarketSentimentScale';
import { translateKey } from '../src/locales';

test('market sentiment score stays within the real 0–100 range', () => {
  assert.equal(clampSentimentScore(-15), 0);
  assert.equal(clampSentimentScore(23), 23);
  assert.equal(clampSentimentScore(100), 100);
  assert.equal(clampSentimentScore(124), 100);
  assert.equal(clampSentimentScore(Number.NaN), 0);
});

test('animated sentiment scale is accessible and mobile responsive', () => {
  const html = renderToStaticMarkup(React.createElement(MarketSentimentScale, {
    score: 23,
    sentimentLabel: 'Страх',
  }));
  assert.match(html, /data-market-sentiment-scale/);
  assert.match(html, /role="meter"/);
  assert.match(html, /aria-valuemin="0"/);
  assert.match(html, /aria-valuemax="100"/);
  assert.match(html, /aria-valuenow="23"/);
  assert.match(html, /23 зі 100/);
  assert.match(html, /data-market-sentiment-marker/);
  assert.match(html, /motion-safe:duration-1000/);
  assert.match(html, /Страх/);
  assert.match(html, /Нейтрально/);
  assert.match(html, /Жадібність/);
});

test('scale remains visible before expanding the market mood details', () => {
  const src = readFileSync(new URL('../src/components/MarketSentimentWidget.tsx', import.meta.url), 'utf8');
  const meter = src.indexOf('<MarketSentimentScale score={data.compositeScore}');
  const details = src.indexOf('{expanded && (');
  assert.ok(meter > 0 && details > meter, 'gauge is always visible above the optional detail panel');
  assert.doesNotMatch(src, /\{data\.compositeScore\} \/ 100 • \{data\.sentimentLabel\}/, 'duplicate score and sentiment badge is removed');
  assert.match(src, /t\('sentiment\.title'\)/, 'translated mood heading remains visible');
  assert.equal(translateKey('uk', 'sentiment.title'), 'Настрій Ринку');
  assert.equal(translateKey('en', 'sentiment.title'), 'Market Sentiment');
});

test('large desktop screener sentiment is compact while the outer card stays full width', () => {
  const widget = readFileSync(new URL('../src/components/MarketSentimentWidget.tsx', import.meta.url), 'utf8');
  const scale = readFileSync(new URL('../src/components/MarketSentimentScale.tsx', import.meta.url), 'utf8');
  assert.match(widget, /className="w-full min-w-0 rounded-2xl bg-gradient-to-r/);
  // Desktop layout uses symmetric rails so the bar's center coincides with
  // the entire Screener page, not the gap between unequal title/buttons.
  assert.match(widget, /data-market-sentiment-header/);
  assert.match(widget, /md:grid-cols-\[minmax\(200px,1fr\)_minmax\(0,900px\)_minmax\(200px,1fr\)\]/);
  assert.match(widget, /data-market-sentiment-center/);
  assert.match(widget, /md:col-span-1 md:col-start-2 md:row-start-1/);
  assert.match(widget, /md:col-start-3/);
  assert.match(widget, /col-start-1 row-start-1/);
  // Phones/tablets too narrow for the three controls keep the centered meter
  // on row two to prevent collisions; the indicator itself remains unchanged.
  assert.match(widget, /col-span-2 row-start-2 min-w-0 w-full/);
  assert.match(widget, /col-start-2 row-start-1 flex shrink-0 items-center justify-self-end/);
  assert.match(scale, /className="mx-auto box-border w-full min-w-0 max-w-\[900px\] px-3/);
  assert.doesNotMatch(widget, /className="w-full min-w-0 max-w-\[900px\]"/,
    'the bar and its labels must share one centered width instead of nested centering');
  assert.doesNotMatch(widget, /md:w-auto|xl:flex-\[0_1_900px\]/);
  // Do not narrow the Screener card itself, only the visual meter.
  assert.doesNotMatch(widget, /(?:sm|md|lg|xl|2xl):max-w-/);
  assert.match(scale, /xl:h-\[12px\]/);
  assert.match(scale, /xl:h-\[24px\] xl:min-w-\[64px\]/);
  assert.match(scale, /xl:h-\[19px\]/);
  assert.match(scale, /xl:mt-0\.5 xl:text-\[10px\]/);
  // No compact overrides before xl: phone and tablet appearances are unchanged.
  assert.match(scale, /h-\[19px\].*xl:h-\[12px\]/);
  assert.match(scale, /h-\[29px\].*xl:h-\[24px\]/);
  assert.match(scale, /aria-valuenow=\{actualScore\}/);
});

test('complete sentiment bar and three labels share one centered responsive width while score stays proportional', () => {
  const meter = readFileSync(new URL('../src/components/MarketSentimentScale.tsx', import.meta.url), 'utf8');
  for (const score of [0, 42, 100]) {
    const html = renderToStaticMarkup(React.createElement(MarketSentimentScale, {
      score, sentimentLabel: 'Нейтрально', language: 'uk',
    }));
    assert.match(html, /data-market-sentiment-scale/);
    assert.match(html, /mx-auto box-border w-full min-w-0 max-w-\[900px\]/);
    assert.match(html, /data-market-sentiment-track/);
    assert.match(html, /data-market-sentiment-labels/);
    assert.match(html, /grid-cols-3/);
    assert.match(html, /text-left text-red-400/);
    assert.match(html, /text-center/);
    assert.match(html, /text-right text-emerald-400/);
    assert.match(html, new RegExp('left:' + score + '%'), 'pointer retains its true market score coordinate');
  }
  assert.match(meter, /left: `clamp\(36px, \$\{markerPosition\}%, calc\(100% - 36px\)\)`/,
    'number bubble is clamped only to prevent clipping at extremes');
  assert.doesNotMatch(meter, /left-1\/2 top-1\/2 z-10/,
    'number bubble must not be forced to the middle of the sentiment range');
});

test('market sentiment header preserves live score, actions and translations in centered position', () => {
  const widget = readFileSync(new URL('../src/components/MarketSentimentWidget.tsx', import.meta.url), 'utf8');
  const scale = readFileSync(new URL('../src/components/MarketSentimentScale.tsx', import.meta.url), 'utf8');
  const title = widget.indexOf("{t('sentiment.title')}");
  const meter = widget.indexOf('<MarketSentimentScale score={data.compositeScore}');
  const refresh = widget.indexOf('onClick={fetchSentiment}', widget.indexOf('data-market-sentiment-header'));
  const collapse = widget.indexOf('onClick={toggleExpanded}');
  assert.ok(title >= 0 && meter > title && refresh > meter && collapse > refresh,
    'heading, centered meter and existing controls remain in logical order');
  assert.equal(widget.split('<MarketSentimentScale score={data.compositeScore}').length - 1, 1,
    'the meter must mount only once at any breakpoint');
  assert.match(widget, /fetch\('\/api\/market\/sentiment'\)/);
  assert.match(widget, /setInterval\(refreshVisible, 30000\)/);
  assert.match(widget, /document\.visibilityState === 'hidden'/);
  assert.match(widget, /title=\{tr\('Оновити дані'\)\}/);
  assert.match(widget, /title=\{tr\(expanded \? 'Згорнути' : 'Розгорнути'\)\}/);
  assert.match(scale, /left: `\$\{markerPosition\}%`/);
  assert.match(scale, /grid-cols-3/, 'localized Fear / Neutral / Greed remain under the bar');
});

test('sentiment meter shifts slightly right on laptops and larger screens, with all its labels and live score', () => {
  const widget = readFileSync(new URL('../src/components/MarketSentimentWidget.tsx', import.meta.url), 'utf8');
  const scale = readFileSync(new URL('../src/components/MarketSentimentScale.tsx', import.meta.url), 'utf8');
  assert.match(widget, /data-market-sentiment-center className="[^"]*md:col-start-2 md:row-start-1 lg:translate-x-3"/);
  assert.equal((widget.match(/lg:translate-x-3/g) ?? []).length, 1,
    'only the entire meter moves from 1024px up; smaller screens remain unchanged');
  assert.equal((widget.match(/<MarketSentimentScale score=\{data\.compositeScore\}/g) ?? []).length, 1,
    'the complete meter is still mounted as one component');
  assert.match(scale, /left: `\$\{markerPosition\}%`/,
    'the pointer continues to track the actual API score');
  assert.match(scale, /data-market-sentiment-labels/,
    'the translated labels stay attached to the shifted meter');
});
