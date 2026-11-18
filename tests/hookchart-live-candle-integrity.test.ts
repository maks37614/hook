import assert from 'node:assert/strict';
import test from 'node:test';
import type { Kline } from '../src/types';
import { createLiveCandlePublisher } from '../src/components/hookchart/liveCandlePublisher';
import { mergeLiveCandle, mergeLiveChartHistory, withNewerTradePrice } from '../src/utils/hookchartData';

const start = 1_762_000_020;
function bar(time = start, volume = 10, close = 104): Kline {
  return {
    time, open: 100, high: Math.max(105, close), low: 99, close, volume,
    tradeCount: 4 * volume, buyVolume: volume / 2,
    quoteVolume: volume * 100, buyQuoteVolume: volume * 52,
  };
}

for (const cadence of [80, 110, 200, 5000]) {
  test(`live candles respect the ${cadence} ms paint budget and publish rollover immediately`, t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let clock = 0;
    const advance = (ms: number) => {
      clock += ms;
      t.mock.timers.tick(ms);
    };
    let displayed = [bar(start - 60)];
    let paints = 0;
    const publisher = createLiveCandlePublisher((latest, completed) => {
      if (completed) displayed = mergeLiveCandle(displayed, completed);
      displayed = mergeLiveCandle(displayed, latest);
      paints++;
    }, () => clock);
    const initial = bar();
    const final = { ...bar(start, 21, 111), high: 112, low: 96 };
    const next = bar(start + 60, 1, 101);
    publisher.push(initial, cadence, false);
    assert.strictEqual(displayed.at(-1), initial, 'first active tick is sent to React immediately');
    advance(1);
    publisher.push(bar(start, 12), cadence, false);
    publisher.push(final, cadence, false);
    assert.equal(paints, 1);
    advance(1);
    publisher.push(next, cadence, true);
    assert.deepEqual(displayed.slice(-2), [final, next],
      'exact cumulative OHLCV and trade fields survive the candle boundary');
    assert.equal(paints, 2, 'rollover needs only one state commit');
    advance(cadence + 1);
    assert.equal(paints, 2, 'no obsolete timer fires after rollover');

    const updateAfterIdle = bar(start + 60, 3, 109);
    publisher.push(updateAfterIdle, cadence, false);
    assert.strictEqual(displayed.at(-1), updateAfterIdle);
    advance(cadence - 1);
    const trailing = bar(start + 60, 10, 110);
    publisher.push(trailing, cadence, false);
    assert.strictEqual(displayed.at(-1), updateAfterIdle);
    advance(1);
    assert.strictEqual(displayed.at(-1), trailing, 'wait only the remaining portion of the window');

    publisher.push(bar(start + 60, 12), cadence, false);
    publisher.clear();
    advance(cadence);
    assert.strictEqual(displayed.at(-1), trailing, 'scope teardown cancels pending transport data');
  });
}

test('late REST history adds older bars without rolling back a forming or just-completed WS candle', () => {
  const first = bar(start - 120);
  const correctedHistory = bar(start - 60, 89);
  const final = bar(start, 80, 117);
  const forming = bar(start + 60, 2, 108);
  const displayed = [bar(start - 60), final, forming];
  const late = [first, correctedHistory, bar(start, 16, 99)];
  assert.deepEqual(mergeLiveChartHistory(late, displayed), [first, correctedHistory, final, forming]);
  assert.deepEqual(mergeLiveChartHistory([...late.slice(0, -1), final, bar(start + 60, 1)], displayed),
    [first, correctedHistory, final, forming]);
  const freshHttp = [first, correctedHistory, final, bar(start + 60, 9, 109)];
  assert.strictEqual(mergeLiveChartHistory(freshHttp, displayed), freshHttp);
  assert.strictEqual(mergeLiveCandle(freshHttp, forming), freshHttp,
    'a socket recovering after REST must never decrease cumulative volume');
});

test('a newer trade changes price without losing the authoritative bar and taker-volume fields', () => {
  const rest = bar(start, 90, 106);
  const newer = { ...bar(start, 83, 117), low: 91 };
  const corrected = withNewerTradePrice(rest, newer);
  assert.deepEqual(corrected, { ...rest, high: 117, low: 91, close: 117 });
});
