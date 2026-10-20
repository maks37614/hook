import test from 'node:test';
import assert from 'node:assert/strict';
import { HOOKCHART_PRICE_LABEL_HEIGHT, layoutPriceScaleLabels } from '../src/components/hookchart/priceScale';

test('nearby price badges stay readable while the current price keeps its Y position', () => {
  const labels = [{ y: 200 }, { y: 203 }, { y: 200, current: true }];
  const tops = layoutPriceScaleLabels(labels, 400);
  const ordered = [...tops].sort((a, b) => a - b);
  assert.equal(tops[2] + HOOKCHART_PRICE_LABEL_HEIGHT / 2, 200);
  for (let index = 1; index < ordered.length; index++) {
    assert.ok(ordered[index] >= ordered[index - 1] + HOOKCHART_PRICE_LABEL_HEIGHT + 1);
  }
  assert.ok(tops[0] < tops[2] && tops[2] < tops[1], 'higher, current and lower prices keep their order');
});

test('packed badges fit inside both edges of a short price column', () => {
  for (const labels of [
    [{ y: 0 }, { y: 1, current: true }, { y: 3 }],
    [{ y: 97 }, { y: 99, current: true }, { y: 100 }],
    [{ y: 14 }, { y: 31 }, { y: 48 }, { y: 64 }, { y: 81 }],
  ]) {
    const ordered = layoutPriceScaleLabels(labels, 100).sort((a, b) => a - b);
    assert.ok(ordered[0] >= 1);
    assert.ok(ordered.at(-1)! + HOOKCHART_PRICE_LABEL_HEIGHT <= 99);
    for (let index = 1; index < ordered.length; index++) {
      assert.ok(ordered[index] >= ordered[index - 1] + HOOKCHART_PRICE_LABEL_HEIGHT + 1);
    }
  }
});

test('separate labels retain their price positions and output follows input order', () => {
  const labels = [{ y: 300 }, { y: 50, current: true }, { y: 200 }];
  const original = structuredClone(labels);
  assert.deepEqual(layoutPriceScaleLabels(labels, 400), [291, 41, 191]);
  assert.deepEqual(labels, original, 'layout must not mutate marker data');
  assert.deepEqual(layoutPriceScaleLabels([], 400), []);
});
