import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isDesktopSurveillanceView, shouldConnectSurveillanceSSE,
} from '../src/utils/desktopSurveillanceVisibility';

test('only opt-in h00k Desktop windows use visibility-based surveillance SSE', () => {
  assert.equal(isDesktopSurveillanceView('?h00kDesktop=1&desktopPanel=terminal'), true);
  assert.equal(isDesktopSurveillanceView(''), false);
  assert.equal(isDesktopSurveillanceView('?desktopPanel=terminal'), false);
  assert.equal(isDesktopSurveillanceView('?h00kDesktop=0'), false);
});

test('hidden Desktop panes stop personal SSE while normal website behavior stays unchanged', () => {
  for (const visible of [false, true]) {
    assert.equal(shouldConnectSurveillanceSSE(true, true, false, visible), true,
      "ordinary browser SSE behavior is not modified");
    assert.equal(shouldConnectSurveillanceSSE(true, false, true, visible), false);
    assert.equal(shouldConnectSurveillanceSSE(false, true, true, visible), false);
  }
  assert.equal(shouldConnectSurveillanceSSE(true, true, true, false), false);
  assert.equal(shouldConnectSurveillanceSSE(true, true, true, true), true);
});

test('Surveillance provider tears down and resumes Desktop UI stream on visibility changes', () => {
  const source = readFileSync(new URL('../src/context/SurveillanceContext.tsx', import.meta.url), 'utf8');
  assert.match(source, /isDesktopSurveillanceView\(window\.location\.search\)/);
  assert.match(source, /document\.addEventListener\('visibilitychange', onVisibilityChange\)/);
  assert.match(source, /document\.removeEventListener\('visibilitychange', onVisibilityChange\)/);
  assert.match(source, /if \(visible && user\) void fetchCoins\(\)/);
  assert.match(source, /if \(!keepSurveillanceSSE \|\| !user\?\.uid\)/);
  assert.match(source, /const unsubscribe = subscribeUserSignalStream\(user\.uid/);
  assert.match(source, /unsubscribe\(\)/);
  assert.match(source, /streamEpochRef\.current !== epoch/);
  assert.match(source, /if \(streamEpochRef\.current === epoch\) streamConnected\.current = false/);
  assert.match(source, /\[user\?\.uid, fetchCoins, keepSurveillanceSSE\]/);
  // 24/7 monitoring must remain server-owned, with this provider only receiving
  // invalidations; do not add any foreground scan or exchange polling.
  const shared=readFileSync(new URL('../src/utils/userSignalStream.ts',import.meta.url),'utf8');
  assert.match(shared, /'\/api\/surveillance\/stream'/);
  assert.match(shared, /state\.controller\?\.abort\(\)/);
  assert.doesNotMatch(source, /runDirectClientScan/);
});
