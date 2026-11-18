import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldPublishDepthView, shouldPublishLiquidationView } from '../src/components/hookchart/feedPublishPolicy';

test('empty depth state never dispatches repeated React updates without a valid snapshot', () => {
  assert.equal(shouldPublishDepthView(false, false), false);
  assert.equal(shouldPublishDepthView(true, false), true,
    'a valid first snapshot must publish immediately');
  assert.equal(shouldPublishDepthView(true, true), true,
    'active levels still receive regular hold-time updates');
  assert.equal(shouldPublishDepthView(false, true), true,
    'a stale active book must be cleared once, never left visible');
});

test('idle liquidation charts avoid empty rerenders but still emit final removal', () => {
  assert.equal(shouldPublishLiquidationView(0, false), false,
    'no event since mount or after full expiry: no React update');
  assert.equal(shouldPublishLiquidationView(1, false), true,
    'first liquidation must appear');
  assert.equal(shouldPublishLiquidationView(300, true), true,
    'live cumulative fill and cascade expiry are still refreshed');
  assert.equal(shouldPublishLiquidationView(0, true), true,
    'final expiration clears old visible markers exactly once');
  assert.equal(shouldPublishLiquidationView(0, false), false);
});

test('real-time HookChart applies the guards without disabling live depth or Replay isolation', () => {
  const feed = readFileSync(new URL('../src/components/hookchart/useOriginalHookChartLiveFeed.ts', import.meta.url), 'utf8');
  const replay = readFileSync(new URL('../src/components/replay/ReplayChart.tsx', import.meta.url), 'utf8');
  const shared = readFileSync(new URL('../src/components/hookchart/sharedLiquidationView.ts', import.meta.url), 'utf8');
  assert.match(feed, /shouldPublishDepthView\(next\.depthReady, wasReady\)/);
  assert.match(shared, /const rows = entry\.buffered\.snapshot\(now\)/);
  assert.match(feed, /if \(next\.depthReady\) \{\s*if \(stopDepthHoldClockSubscription === null\) \{\s*stopDepthHoldClockSubscription = sharedChartClock\.subscribe\(/,
    'holding-time updates run only while an actual book is live');
  assert.match(feed, /const clearDepth = \(\) => \{\s*stopDepthHoldClock\(\)/,
    'depth clock stops when the exchange book disappears');
  assert.match(shared, /current\.timer = setInterval\(\(\) => publish\(current\), 2000\)/);
  assert.match(feed, /const stopDepth = connectSharedHookChartDepth/);
  assert.match(feed, /return sharedLiquidationViews\.subscribe\(/);
  assert.match(feed, /if \(replay \|\| lightweight \|\| !exchangeSymbol\)/);
  assert.match(replay, /markers=\{hookMarkers\} replay/);
});
