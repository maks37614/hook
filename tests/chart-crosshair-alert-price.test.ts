import test from 'node:test';
import assert from 'node:assert/strict';
import { chartCrosshairAlertPrice } from '../src/utils/chartAlertPrice';

test('crosshair price is a plain numeric value suitable for <input type=number>', () => {
  for (const price of [73517.3072, 1234.5, 61.18321, 0.582456, 0.00001234567]) {
    const value = chartCrosshairAlertPrice(price);
    assert.ok(value !== null);
    assert.match(value, /^\d+\.\d+$/);
    assert.ok(!value.includes(',') && !value.includes('$'));
    assert.ok(Math.abs(Number(value) - price) <= Math.max(1e-2, price * 1e-4));
  }
});

test('microcoin crosshair values retain usable precision', () => {
  assert.equal(chartCrosshairAlertPrice(0.00000001234), '0.00000001234');
  assert.equal(chartCrosshairAlertPrice(0), null);
  assert.equal(chartCrosshairAlertPrice(-1), null);
  assert.equal(chartCrosshairAlertPrice(NaN), null);
  assert.equal(chartCrosshairAlertPrice(Infinity), null);
});
