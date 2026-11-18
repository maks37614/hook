import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  TERMINAL_MARKET_REFRESH_MS, nextTerminalMarketRefreshDelay,
} from '../src/utils/desktopTerminalRefresh';

test('Desktop windows converge to the same wall-clock refresh without stale market lists', () => {
  const boundary = 1_800_000_000_000;
  const openedAt = [0, 900, 5_000, 9_000, 18_000, 29_990]
    .map(offset => boundary + offset);
  assert.equal(TERMINAL_MARKET_REFRESH_MS, 30_000);
  for (const opened of openedAt) {
    let now = opened;
    let aligned = false;
    for (let step = 0; step < 8; step++) {
      const delay = nextTerminalMarketRefreshDelay(now, true);
      assert.ok(delay >= 25_000 && delay <= 30_000,
        'visible quotes must still refresh every 25–30 seconds');
      now += delay;
      if (now % TERMINAL_MARKET_REFRESH_MS === 0) {
        aligned = true;
        assert.equal(nextTerminalMarketRefreshDelay(now, true), 30_000);
        break;
      }
    }
    assert.equal(aligned, true, 'every pane should eventually share one refresh boundary');
  }
});

test('alignment never loops at boundaries or delays a request beyond 30 seconds', () => {
  for (const at of [0, 30_000, 60_000, 90_000, -30_000]) {
    assert.equal(nextTerminalMarketRefreshDelay(at, true), 30_000);
  }
  assert.equal(nextTerminalMarketRefreshDelay(29_999, true), 25_000);
  assert.equal(nextTerminalMarketRefreshDelay(30_001, true), 29_999);
  assert.equal(nextTerminalMarketRefreshDelay(12_000, true), 25_000);
});

test('ordinary website Terminal keeps its exact old 30-second interval', () => {
  for (const at of [100, 3_000, 23_500, 59_999, Number.NaN]) {
    assert.equal(nextTerminalMarketRefreshDelay(at, false), 30_000);
  }
  assert.equal(nextTerminalMarketRefreshDelay(Number.NaN, true), 30_000);
});

test('Terminal UI aligns only public market snapshots and retains hidden-tab throttling', () => {
  const source = readFileSync(new URL('../src/components/TerminalPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /new URLSearchParams\(window\.location\.search\)\.get\('h00kDesktop'\) === '1'/);
  assert.match(source, /setTimeout\(tick, nextTerminalMarketRefreshDelay\(Date\.now\(\), true\)\)/);
  assert.match(source, /ordinaryTimer = setInterval\(\(\) => \{ void load\(\); \}, 30_000\)/);
  assert.match(source, /document\.visibilityState === 'hidden'/);
  assert.match(source, /const minGap = force \? 10_000 : marketRefreshDemandRef\.current \? 25_000 : 55_000/);
  assert.match(source, /now - lastRequestAt < minGap/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /clearTimeout\(timer\)/);
  assert.match(source, /clearInterval\(ordinaryTimer\)/);
});
