import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationCooldownTracker, scanNotificationSignals } from '../src/utils/notificationSignals';
import { normalizeSiteNotificationSettings } from '../src/utils/siteNotifications';
import type { ScannedCoin } from '../src/types';

const config = normalizeSiteNotificationSettings({
  optedIn: true, enabled: true, openInterest: true, flow: true,
  cooldownMinutes: 15,
});
const symbol = (now: number): ScannedCoin => ({
  symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', exchange: 'binance',
  marketType: 'futures', timeframe: '15m', currentPrice: 100, lastUpdated: now,
  formations: [], regularIndicators: {
    oiAvailability: 'available', oiChangePct: 4,
    oiUpdatedAt: now, deltaPct: 6,
  },
} as unknown as ScannedCoin);

test('OI and Delta never fire twice within minimum elapsed cooldown at a bucket boundary', () => {
  const guard = new NotificationCooldownTracker();
  const firstAt = 899_900; // just before 15-minute boundary
  const secondAt = 900_100; // 200ms later but in the next bucket
  const first = scanNotificationSignals([symbol(firstAt)], config, [], firstAt,
    undefined, undefined, undefined, guard);
  assert.deepEqual(first.map(x => x.kind).sort(), ['flow','openInterest']);
  const repeated = scanNotificationSignals([symbol(secondAt)], config, [], secondAt,
    undefined, undefined, undefined, guard);
  assert.deepEqual(repeated, []);
  const after = scanNotificationSignals([symbol(firstAt + 15 * 60_000)], config, [],
    firstAt + 15 * 60_000, undefined, undefined, undefined, guard);
  assert.deepEqual(after.map(x => x.kind).sort(), ['flow','openInterest']);
});

test('cooldown survives a reload and does not mix unrelated coins', () => {
  const now = 1_000_000;
  const tracker = new NotificationCooldownTracker();
  scanNotificationSignals([symbol(now)], config, [], now, undefined, undefined, undefined, tracker);
  const restored = new NotificationCooldownTracker(tracker.snapshot());
  assert.deepEqual(scanNotificationSignals([symbol(now + 50_000)], config, [], now + 50_000,
    undefined, undefined, undefined, restored), []);
  const eth = { ...symbol(now + 50_000), symbol:'ETHUSDT', baseAsset:'ETH' };
  const events = scanNotificationSignals([eth], config, [], now + 50_000,
    undefined, undefined, undefined, restored);
  assert.deepEqual(events.map(e=>e.kind).sort(), ['flow','openInterest']);
});

test('suppressed historical IDs and quota-limited events do not consume cooldown', () => {
  const now = 1_000_000;
  const tracker = new NotificationCooldownTracker();
  const excluded = scanNotificationSignals([symbol(now)], config, [], now,
    undefined, undefined, () => true, tracker);
  assert.deepEqual(excluded, []);
  assert.deepEqual(tracker.snapshot(), {});
  assert.deepEqual(scanNotificationSignals([symbol(now+100)], config, [], now+100,
    undefined, undefined, undefined, tracker).map(e=>e.kind).sort(), ['flow','openInterest']);
});
