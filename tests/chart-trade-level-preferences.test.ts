import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHART_TRADE_LEVELS_EVENT,
  chartTradeLevelStorageKey,
  DEFAULT_CHART_TRADE_LEVELS,
  normalizeChartTradeLevelVisibility,
  readChartTradeLevels,
  saveChartTradeLevels,
} from '../src/utils/chartTradeLevelPreferences';

test('TP/SL visibility starts hidden for unconfigured accounts and is scoped per user', () => {
  assert.deepEqual(readChartTradeLevels('new-user', null), DEFAULT_CHART_TRADE_LEVELS);
  assert.notEqual(chartTradeLevelStorageKey('user-a'), chartTradeLevelStorageKey('user-b'));
  assert.notEqual(chartTradeLevelStorageKey('user-a'), chartTradeLevelStorageKey(null));
  assert.equal(CHART_TRADE_LEVELS_EVENT, 'h00k:chart-trade-levels');
});

test('existing account choices persist and take precedence over browser defaults', () => {
  const accountLevels = { entry: true, target: true, stop: true };
  assert.deepEqual(readChartTradeLevels('account', accountLevels), accountLevels);
  assert.deepEqual(readChartTradeLevels('account', { entry: true, target: false, stop: true }),
    { entry: true, target: false, stop: true });
});

test('only complete boolean TP/SL settings are accepted', () => {
  assert.equal(normalizeChartTradeLevelVisibility({ entry: true, target: true }), null);
  assert.equal(normalizeChartTradeLevelVisibility({ entry: 1, target: true, stop: true }), null);
  assert.equal(normalizeChartTradeLevelVisibility(null), null);
  assert.deepEqual(normalizeChartTradeLevelVisibility({ entry: true, target: false, stop: false, other: 'ignored' }),
    { entry: true, target: false, stop: false });
});

test('TP/SL preference can be saved and restored without mixing accounts', () => {
  const storage = new Map<string,string>();
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    },
  });
  try {
    const levels = { entry: true, target: true, stop: true };
    saveChartTradeLevels('account-a', levels);
    assert.deepEqual(readChartTradeLevels('account-a'), levels);
    assert.deepEqual(readChartTradeLevels('account-b'), DEFAULT_CHART_TRADE_LEVELS);
    saveChartTradeLevels('account-a', DEFAULT_CHART_TRADE_LEVELS);
    assert.deepEqual(readChartTradeLevels('account-a'), DEFAULT_CHART_TRADE_LEVELS);
  } finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, 'localStorage');
    else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
  }
});
