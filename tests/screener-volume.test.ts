import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketCoin } from '../src/types';
import { compareScreenerSearchCoins } from '../src/utils/screenerSearchSettings';
import { SCREENER_VOLUME_CAPS, isVolumeWithinCap, preferredVolumeSortOrder } from '../src/utils/screenerVolume';

test('screener volume options include intermediate tiers and stop at 50B', () => {
  const caps = SCREENER_VOLUME_CAPS.map(option => option.value);
  assert.equal(caps[0], 50_000);
  assert.equal(caps[1], 100_000);
  assert.ok(caps.includes(250_000));
  assert.ok(caps.includes(1_000_000));
  assert.ok(caps.includes(10_000_000_000));
  assert.equal(caps.at(-1), 50_000_000_000);
  assert.equal(SCREENER_VOLUME_CAPS.at(-1)?.label, 'До $50B');
  assert.equal(new Set(caps).size, caps.length);
  assert.ok(caps.every((cap, i) => i === 0 || cap > caps[i - 1]));
});

test('upper cap is inclusive, only excluding amounts above the selected threshold', () => {
  assert.equal(isVolumeWithinCap(49_999.99, 50_000), true);
  assert.equal(isVolumeWithinCap(50_000, 50_000), true);
  assert.equal(isVolumeWithinCap(50_000.01, 50_000), false);
  assert.equal(isVolumeWithinCap(99_999, 100_000), true);
  assert.equal(isVolumeWithinCap(100_001, 100_000), false);
});

test('unlimited is separate from the highest selectable 50B limit', () => {
  assert.equal(isVolumeWithinCap(0, 0), true);
  assert.equal(isVolumeWithinCap(15_000_000_000, 0), true);
  assert.equal(isVolumeWithinCap(2_000_000_000_000, 0), true);
  assert.equal(isVolumeWithinCap(50_000_000_000, 50_000_000_000), true);
  assert.equal(isVolumeWithinCap(50_000_000_001, 50_000_000_000), false);
  assert.equal(isVolumeWithinCap(2_000_000_000_000, 50_000_000_000), false);
});

test('From 24h-volume mode includes the minimum and rejects smaller values', () => {
  assert.equal(isVolumeWithinCap(49_999.99, 50_000, 'from'), false);
  assert.equal(isVolumeWithinCap(50_000, 50_000, 'from'), true);
  assert.equal(isVolumeWithinCap(50_000.01, 50_000, 'from'), true);
  assert.equal(isVolumeWithinCap(100_000, 1_000_000, 'from'), false);
  assert.equal(isVolumeWithinCap(1_000_000, 1_000_000, 'from'), true);
  assert.equal(isVolumeWithinCap(1_000_001, 1_000_000, 'from'), true);
});

test('zero means unlimited in both modes and the legacy two-argument call stays Up-to', () => {
  assert.equal(isVolumeWithinCap(999_999_999_999, 0, 'from'), true);
  assert.equal(isVolumeWithinCap(0, 0, 'from'), true);
  assert.equal(isVolumeWithinCap(50_001, 50_000), false);
  assert.equal(isVolumeWithinCap(50_001, 50_000, 'to'), false);
});

test('changing the direction applies from/to to the same selected amount without a new lookup', () => {
  const sample = [0, 49_999, 50_000, 50_001, 100_000, 1_000_000, 10_000_000];
  const from = sample.filter(volume => isVolumeWithinCap(volume, 50_000, 'from'));
  const to = sample.filter(volume => isVolumeWithinCap(volume, 50_000, 'to'));
  assert.deepEqual(from, [50_000, 50_001, 100_000, 1_000_000, 10_000_000]);
  assert.deepEqual(to, [0, 49_999, 50_000]);
  assert.equal(isVolumeWithinCap(10_000_000, 50_000, 'from'), true);
  assert.equal(isVolumeWithinCap(10_000_000, 50_000, 'to'), false);
  assert.equal(isVolumeWithinCap(50_000, 50_000, 'from'), true);
  assert.equal(isVolumeWithinCap(50_000, 50_000, 'to'), true);
});

test('from-filter shows the closest qualifying volumes on the first screen, not the same high-volume coins', () => {
  const volumes = [15_000, 40_000, 50_000, 55_000, 70_000, 120_000, 1_000_000, 4_000_000];
  const coins = volumes.map((volumeUsd, index) => ({
    volumeUsd, symbol: 'PAIR' + index + 'USDT', exchange: 'binance', marketType: 'futures',
  } as MarketCoin));
  const visible = (mode: 'from' | 'to') => coins
    .filter(coin => isVolumeWithinCap(coin.volumeUsd, 50_000, mode))
    .sort((a, b) => compareScreenerSearchCoins(a, b, {
      sortBy: 'volume', sortOrder: preferredVolumeSortOrder(mode),
      secondarySortBy: 'none', secondarySortOrder: 'desc',
    }))
    .slice(0, 3).map(coin => coin.volumeUsd);

  assert.equal(preferredVolumeSortOrder('from'), 'asc');
  assert.equal(preferredVolumeSortOrder('to'), 'desc');
  assert.deepEqual(visible('to'), [50_000, 40_000, 15_000]);
  assert.deepEqual(visible('from'), [50_000, 55_000, 70_000]);
  // Both modes include the exact selected boundary, but show different results.
});
