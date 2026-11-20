import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Kline } from '../src/types';
import { REPLAY_INTRABAR_PHASES, REPLAY_INTRABAR_TICK_MS, replayIntrabarCandle, replayRemainingCandle } from '../src/utils/replayIntrabar';
import { replayHistoryChange } from '../src/utils/replayHistoryChange';

function bar(close = 110): Kline {
  return { time: 1700000000, open: 100, high: 120, low: 80, close, volume: 240, quoteVolume: 25000,
    buyVolume: 90, buyQuoteVolume: 9300, tradeCount: 230 };
}

test('Replay progressively builds a valid historical candle without leaking high/low or volume before those phases', () => {
  const original = bar();
  assert.equal(REPLAY_INTRABAR_PHASES, 64);
  assert.ok(REPLAY_INTRABAR_TICK_MS >= 30);
  const previews = Array.from({ length: REPLAY_INTRABAR_PHASES + 1 },
    (_, step) => replayIntrabarCandle(original, step / REPLAY_INTRABAR_PHASES));
  assert.equal(previews[0].open, original.open);
  assert.equal(previews[0].close, original.open);
  assert.equal(previews[0].high, original.open);
  assert.equal(previews[0].low, original.open);
  assert.notEqual(previews[1].close, original.close);
  assert.ok(previews[1].low > original.low, 'the full low must not appear in the opening seconds');
  assert.ok(previews[REPLAY_INTRABAR_PHASES / 2].high < original.high,
    'the full high must not appear before the path reaches it');
  assert.equal(previews[REPLAY_INTRABAR_PHASES], original,
    'the end must use the EXACT archived OHLC object');
  for (let i = 0; i <= REPLAY_INTRABAR_PHASES; i++) {
    const row = previews[i];
    assert.ok(row.high >= row.open && row.high >= row.close && row.low <= row.open && row.low <= row.close);
    assert.ok(row.high <= original.high && row.low >= original.low);
    assert.ok(row.volume <= original.volume && row.quoteVolume! <= original.quoteVolume!);
    if (i) {
      assert.ok(row.high >= previews[i - 1].high && row.low <= previews[i - 1].low);
      assert.ok(row.volume >= previews[i - 1].volume);
    }
  }
  assert.equal(original.open, 100, 'the authoritative record must stay immutable');
  assert.equal(original.high, 120);
  assert.deepEqual(replayIntrabarCandle(original, Infinity), previews[0]);
  // The longest 0.1x playback must not increase timer frequency: gradual
  // interpolation is a bounded browser-only visualization.
  assert.equal(600 / 0.1, 6000);
  assert.ok(REPLAY_INTRABAR_TICK_MS >= 40);
  assert.ok(REPLAY_INTRABAR_PHASES * REPLAY_INTRABAR_TICK_MS <= 6000);
  assert.equal(replayIntrabarCandle(original, 1), original);
});

test('Red candles form an upper and lower wick without inventing extremes outside true OHLC', () => {
  const original = bar(90);
  const a = replayIntrabarCandle(original, 0.25);
  const b = replayIntrabarCandle(original, 0.5);
  const c = replayIntrabarCandle(original, 0.875);
  assert.ok(a.high > original.open && a.high < original.high);
  assert.ok(b.high === original.high && b.low >= original.low);
  assert.ok(c.low === original.low && c.close !== original.close);
  assert.equal(replayIntrabarCandle(original, 1), original);
});

test('Orders opened inside an active bar see only later simulated movement, not already visited highs/lows', () => {
  const green = bar(110);
  const afterLow = replayRemainingCandle(green, 0.5);
  assert.equal(afterLow.low, replayIntrabarCandle(green, 0.5).close);
  assert.equal(afterLow.high, 120);
  const afterHigh = replayRemainingCandle(green, 0.875);
  assert.ok(afterHigh.low > green.low);
  assert.ok(afterHigh.high < green.high);
  assert.equal(afterHigh.close, green.close);
  assert.equal(replayRemainingCandle(green, 0), green);
  assert.equal(replayRemainingCandle(green, 1).close, green.close);
});

test('Animating the next historical bar stays compatible with incremental charts and snapshot isolation', () => {
  const first = bar(110);
  const second = { ...bar(90), time: first.time + 300 };
  const partial1 = replayIntrabarCandle(second, 1 / 8);
  const partial2 = replayIntrabarCandle(second, 2 / 8);
  assert.equal(replayHistoryChange([first], [first, partial1]), 'append');
  assert.equal(replayHistoryChange([first, partial1], [first, partial2]), 'replace-last');
  assert.equal(replayHistoryChange([first, partial2], [first, second]), 'replace-last');
  const page = readFileSync('src/components/ReplayPage.tsx', 'utf8');
  const chart = readFileSync('src/components/replay/ReplayChart.tsx', 'utf8');
  assert.match(page, /replayVisibleCandles\(allCandles, currentIndex, historyExpanded, cachedHistoryPrefix\)/);
  assert.match(page, /\[\.\.\.confirmedReplayCandles, partialCandle\]/);
  assert.match(page, /Math\.max\(80, 600 \/ playbackSpeed\)/);
  assert.match(page, /Math\.floor\(playbackFractionRef\.current \* REPLAY_INTRABAR_PHASES\)/);
  assert.match(page, /setInterval\(\(\) => \{/);
  assert.match(page, /if \(document\.visibilityState === 'hidden'\)/);
  assert.match(page, /orderCutoffsRef\.current\.get\(order\.id\)/);
  assert.match(page, /replayRemainingCandle\(nextCandle, currentEntryCutoff\.phase\)/);
  assert.match(page, /resetIntrabar\(\);[\s\S]*?if \(currentIndex >= allCandles\.length - 1\)/);
  assert.match(chart, /isIntrabarPreview/);
  assert.match(chart, /replay\.static\.toolbar\.intrabarDisclaimer/);
  assert.doesNotMatch(page, /subscribeMarketTrades|subscribeSharedKlines|\/api\/trades/);
});

test('All four Replay locale packs disclose that intra-candle prices are approximate', () => {
  const copy = readFileSync('src/locales/replayStatic20261115.ts', 'utf8');
  for (const message of ['OHLC · симуляція', 'OHLC · simulated', 'OHLC · симуляция',
    'OHLC · symulacja', 'not actual exchange ticks', 'а не справжніми тиками', 'а не настоящие тики', 'nie pochodzi z rzeczywistych ticków']) {
    assert.ok(copy.includes(message), 'missing translation: ' + message);
  }
});
