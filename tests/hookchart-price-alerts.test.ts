import test from 'node:test';
import assert from 'node:assert/strict';
import { chartTelegramAlerts, telegramIdFromChartMarker, alertConditionForPrice } from '../src/utils/hookChartPriceAlerts';
import type { PriceAlert } from '../src/types';

function alert(id: string, patch: Partial<PriceAlert> = {}): PriceAlert {
  return {
    id, symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures',
    targetPrice: 100, condition: 'gte', createdAt: 1,
    triggered: false, isActive: true, ...patch,
  };
}

test('charts display only active, untriggered Telegram prices for the exact exchange and market', () => {
  const saved = [
    alert('good'),
    alert('paused', { isActive: false }),
    alert('triggered', { triggered: true }),
    alert('different-market', { marketType: 'spot' }),
    alert('different-exchange', { exchange: 'bybit' }),
    alert('different-coin', { symbol: 'ETHUSDT' }),
  ];
  const marks = chartTelegramAlerts(saved, 'BTCUSDT', 'binance', 'futures');
  assert.deepEqual(marks.map(x => x.id), ['BTCUSDT:telegram:good']);
  assert.equal(marks[0].p, 100);
  assert.equal(marks[0].kind, 'level');
});

test('a chart marker always resolves to exactly its Telegram alert ID', () => {
  assert.equal(telegramIdFromChartMarker('BTCUSDT:telegram:alert_42', 'BTCUSDT'), 'alert_42');
  assert.equal(telegramIdFromChartMarker('ETHUSDT:telegram:alert_42', 'BTCUSDT'), null);
  assert.equal(telegramIdFromChartMarker('BTCUSDT:local123', 'BTCUSDT'), null);
  assert.equal(telegramIdFromChartMarker('BTC/USDT:telegram:abc', 'BTC/USDT'), 'abc');
  assert.equal(chartTelegramAlerts([alert('abc')], 'BTC/USDT', 'binance', 'futures')[0].id, 'BTC/USDT:telegram:abc');
});

test('the target direction is chosen relative to the live chart price', () => {
  assert.equal(alertConditionForPrice(101, 100), 'gte');
  assert.equal(alertConditionForPrice(99, 100), 'lte');
  assert.equal(alertConditionForPrice(100, 100), 'gte');
});

test('invalid target prices are not shown as chart alert markers', () => {
  assert.deepEqual(chartTelegramAlerts([
    alert('empty', { targetPrice: 0 }),
    alert('invalid', { targetPrice: Number.NaN }),
  ], 'BTCUSDT', 'binance', 'futures'), []);
});

test('creating a Telegram chart alert does not cover candles with a success notice', async () => {
  const { readFileSync } = await import('node:fs');
  const chart = readFileSync(new URL('../src/components/hookchart/HookChartCanvas.tsx', import.meta.url), 'utf8');
  const creation = chart.slice(chart.indexOf('const createTelegramPriceAlert ='), chart.indexOf('const confirmEditPriceMarker ='));
  assert.match(creation, /await addAlert\(\{/);
  assert.match(creation, /setTool\('cursor'\)/);
  assert.doesNotMatch(creation, /Telegram-сповіщення створено:/);
  assert.doesNotMatch(creation, /setAlertNotice\(\{[^}]*error: false/);
  assert.match(creation, /catch \(error\)/);
  assert.match(creation, /setAlertNotice\(\{ text: error instanceof Error \? error.message : 'Не вдалося зберегти сповіщення\.', error: true \}\)/);
  assert.match(chart, /chartTelegramAlerts\(priceAlerts, symbol, exchange, marketType\)/);
  assert.match(chart, /alertNotice\.error \? 'error' : 'success'/);
});
