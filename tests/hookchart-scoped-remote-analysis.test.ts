import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleScopedRemoteSeries } from '../src/components/hookchart/scopedRemoteSeries';

test('asynchronous MTF results are not used by a different exchange, coin or timeframe', () => {
  const eth15 = { id: 'ETH15' };
  const previous = {
    scope: 'binance:futures:ETHUSDT:5m',
    series: { '15m': [eth15], '1h': [{ id: 'ETH1H' }] },
  };
  const same = visibleScopedRemoteSeries(previous, 'binance:futures:ETHUSDT:5m');
  assert.strictEqual(same, previous.series);
  assert.strictEqual(same['15m'][0], eth15);
  assert.equal(Object.keys(visibleScopedRemoteSeries(previous, 'binance:futures:BTCUSDT:5m')).length, 0);
  assert.equal(Object.keys(visibleScopedRemoteSeries(previous, 'bybit:futures:ETHUSDT:5m')).length, 0);
  assert.equal(Object.keys(visibleScopedRemoteSeries(previous, 'binance:futures:ETHUSDT:15m')).length, 0);
  assert.equal(Object.keys(visibleScopedRemoteSeries(previous, previous.scope, false)).length, 0);
  assert.strictEqual(visibleScopedRemoteSeries(null, previous.scope), visibleScopedRemoteSeries(previous, 'other'));
});

test('a completed request becomes visible only when scoped to the current chart', () => {
  const old = { scope: 'binance:futures:BTCUSDT:5m', series: { '15m': [{ t: 1 }] } };
  const newScope = 'bybit:spot:SOLUSDT:1m';
  assert.equal(visibleScopedRemoteSeries(old, newScope)['15m'], undefined);
  const updated = { scope: newScope, series: { '15m': [{ t: 2 }] } };
  assert.deepEqual(visibleScopedRemoteSeries(updated, newScope)['15m'], [{ t: 2 }]);
});
