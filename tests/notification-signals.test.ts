import test from 'node:test';
import assert from 'node:assert/strict';
import type { ScannedCoin, SurveillanceEvent } from '../src/types';
import { DEFAULT_SITE_NOTIFICATIONS, normalizeSiteNotificationSettings, notificationEnabled,
  NOTIFICATION_CATEGORIES, matchesNotificationScope } from '../src/utils/siteNotifications';
import { scanNotificationSignals, marketSurveillanceSignal, liquidationNotificationSignal,
  surveillanceNotificationKind, LiquidationCascadeTracker, QualityScoreTracker, ProximityAlertTracker } from '../src/utils/notificationSignals';

const settings = normalizeSiteNotificationSettings({
  optedIn: true, enabled: true, formations: true, levels: true, breakouts: true,
  round: true, density: true, openInterest: true, flow: true, volume: true,
  early: true, quality: true, composite: true, favorites: true, system: true,
  surveillance: true, liquidations: true, impulses: true,
  levelDistancePct: 1, roundDistancePct: 1, oiThresholdPct: 2,
  flowThresholdPct: 4, minBreakoutRvol: 2, minConfirmations: 3,
  minQualityScore: 88, cooldownMinutes: 15,
});
const coin = (updatedAt = Date.now()): ScannedCoin => ({ 
  symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
  exchange: 'binance', marketType: 'futures', timeframe: '15m',
  currentPrice: 100, priceChange24h: 1.3, highPrice24h: 108,
  lowPrice24h: 90, volume24hUsd: 2_000_000, lastUpdated: updatedAt,
  exchangeUrl: '',
  regularIndicators: { atrPct: 1, rsi14: 60, oiChangePct: 4.1, oiAvailability: 'available', oiUpdatedAt: updatedAt, deltaPct: 7, cvd20Pct: 5 },
  formations: [{
    id: 'f1', patternKey: 'test', name: 'Пробій опору', confidence: 92, bias: 'bullish',
    levels: { entryPrice: 100.3, stopLossPrice: 96, targetPrice: 108, supportPrice: 99.5 },
    roundNumberContext: { detected: true, level: 100, step: 10, distancePct: .1,
      strength: 87, densityConfirmed: true, densityUsd: 250_000, side: 'BID' },
    validation: { passed: true, closedCandleOnly: true, breakoutConfirmed: true, volumeRatio: 3.5 },
  }],
  earlyFormations: [{ id: 'early1', name: 'Можлива W', stage: 'forming', observedAt: 200_000 }],
} as unknown as ScannedCoin);

test('no site notification can fire until master switch and explicit user opt-in', () => {
  assert.equal(DEFAULT_SITE_NOTIFICATIONS.enabled, false);
  assert.equal(DEFAULT_SITE_NOTIFICATIONS.optedIn, false);
  assert.deepEqual(scanNotificationSignals([coin()], DEFAULT_SITE_NOTIFICATIONS, ['binance:futures:BTCUSDT']), []);
  const legacy = normalizeSiteNotificationSettings({ enabled: true, formations: true, system: true });
  assert.equal(legacy.enabled, false);
  assert.equal(notificationEnabled(legacy, 'system'), false);
  assert.deepEqual(scanNotificationSignals([coin()], legacy), []);
  assert.equal(NOTIFICATION_CATEGORIES.length, 17);
  assert.equal(NOTIFICATION_CATEGORIES.filter(c => c.group === 'Стакан та потік').length, 6);
});

test('real scanner evidence creates categorized events with bounded IDs and no fabricated metrics', () => {
  const events = scanNotificationSignals([coin(890_000)], settings, ['binance:futures:BTCUSDT'], 900_000);
  const kinds = new Set(events.map(e => e.kind));
  for (const kind of ['formation','levels','breakouts','round','density','openInterest',
    'flow','volume','early','quality','composite','favorites']) assert.ok(kinds.has(kind as any), kind);
  assert.ok(events.find(e => e.kind === 'composite')?.description.includes('факторів'));
  assert.ok(events.find(e => e.kind === 'density')?.description.includes('250,000'));
  assert.ok(events.every(e => e.symbol === 'BTCUSDT' && e.exchange === 'binance'));
  const repeated = scanNotificationSignals([coin(890_000)], settings, ['binance:futures:BTCUSDT'], 900_000);
  assert.deepEqual(events, repeated, 'stable event identifiers allow center deduplication');
  const withoutRealData = coin(890_000);
  withoutRealData.regularIndicators = { atrPct: null, rsi14: null };
  withoutRealData.formations[0].roundNumberContext!.densityConfirmed = false;
  delete withoutRealData.formations[0].roundNumberContext!.densityUsd;
  withoutRealData.formations[0].validation!.volumeRatio = 1;
  const reduced = scanNotificationSignals([withoutRealData], settings, [], 900_000);
  assert.ok(!reduced.some(e => ['openInterest','flow','density','volume','favorites'].includes(e.kind)));
});

test('global exchange, market, timeframe, symbol and favorites scope filters events', () => {
  for (const patch of [
    { scopeExchange: 'bybit' }, { scopeMarket: 'spot' }, { scopeTimeframe: '4h' },
    { scopeSymbols: 'ETHUSDT' }, { onlyFavorites: true },
  ] as const) {
    const scoped = normalizeSiteNotificationSettings({ ...settings, ...patch });
    assert.deepEqual(scanNotificationSignals([coin()], scoped), [], JSON.stringify(patch));
  }
  const favoriteSetting = normalizeSiteNotificationSettings({ ...settings, onlyFavorites: true });
  assert.ok(scanNotificationSignals([coin()], favoriteSetting, ['binance:futures:BTCUSDT']).length > 0);
  assert.equal(matchesNotificationScope(favoriteSetting, coin(), ['bybit:spot:BTCUSDT']), false);
});

test('a rejected plan cannot generate composite confirmation even with enough qualifying observations', () => {
  const data = coin(890_000);
  data.formations[0].validation!.passed = false;
  const events = scanNotificationSignals([data], settings, [], 900_000);
  assert.equal(events.some(event => event.kind === 'composite'), false);
  assert.equal(events.some(event => event.kind === 'breakouts'), true);
});

test('strict scope rejects missing metadata and symbol substring collisions', () => {
  const strict = normalizeSiteNotificationSettings({ ...settings,
    onlyFavorites: true, scopeExchange: 'binance', scopeMarket: 'futures', scopeTimeframe: '15m' });
  assert.equal(matchesNotificationScope(strict, { symbol: 'BTCUSDT', marketType: 'futures', timeframe: '15m' },
    ['binance:futures:BTCUSDT']), false);
  assert.equal(matchesNotificationScope(strict, { symbol: 'BTCUSDT', exchange: 'binance', timeframe: '15m' },
    ['binance:futures:BTCUSDT']), false);
  assert.equal(matchesNotificationScope(strict, { symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures' },
    ['binance:futures:BTCUSDT']), false);
  assert.equal(matchesNotificationScope(strict, coin(), ['binance:futures:XBTCUSDT']), false);
  assert.equal(matchesNotificationScope(strict, coin(), ['bybit:futures:BTCUSDT']), false);
  assert.equal(matchesNotificationScope(strict, coin(), ['binance:spot:BTCUSDT']), false);
  assert.equal(matchesNotificationScope(strict, coin(), ['binance:futures:BTCUSDT']), true);
});

test('known stale market snapshots never produce actionable trading notifications', () => {
  const stale = coin(1_000);
  const signal = scanNotificationSignals([stale], settings, [], Date.now());
  assert.deepEqual(signal.map(v => v.kind), ['system']);
});

function verifiedScan(closedAt: number, collectedAt = closedAt + 1_000): ScannedCoin {
  const snapshot = coin(collectedAt);
  snapshot.timeframe = '1m';
  snapshot.formationData = { lastClosedAt: closedAt, collectedAt, contiguous: true };
  Object.assign(snapshot.regularIndicators!, {
    candleContext: { closedAt, close: 100, previousClose: 99 },
    tradeFlowSource: 'binance-klines',
  });
  return snapshot;
}

test('formation notifications recheck the age of the candle independently of the quote timestamp', () => {
  const closedAt = 900_000;
  const snapshot = verifiedScan(closedAt);
  const output = (now: number) => scanNotificationSignals([snapshot], settings, [], now).map(e => e.kind);
  assert.ok(output(closedAt + 150_000).includes('breakouts'));
  snapshot.lastUpdated = closedAt + 151_000;
  assert.deepEqual(output(closedAt + 151_000), ['early']);
  assert.deepEqual(output(closedAt - 1), ['early']);
  snapshot.formationData!.contiguous = false as never;
  assert.deepEqual(output(closedAt + 1_000), ['early']);
});

test('flow notifications and Quant use only in-range, correctly sourced flow for the scan candle', () => {
  const closedAt = 900_000;
  const snapshot = verifiedScan(closedAt);
  const s = { ...settings, minConfirmations: 3 };
  snapshot.formations[0].roundNumberContext = undefined;
  const output = () => scanNotificationSignals([snapshot], s, [], closedAt + 2_000);
  assert.ok(output().some(e => e.kind === 'composite' && e.description.includes('Delta')));
  for (const invalid of [
    { deltaPct: 120, cvd20Pct: -115 },
    { tradeFlowSource: 'bybit-trades' },
    { candleContext: { closedAt: closedAt - 60_000, close: 100, previousClose: 99 } },
  ]) {
    const original = snapshot.regularIndicators;
    snapshot.regularIndicators = { ...original!, ...invalid } as ScannedCoin['regularIndicators'];
    assert.ok(!output().some(e => e.kind === 'flow' || e.kind === 'composite'));
    snapshot.regularIndicators = original;
  }
});

test('a delivered flow alert does not repeat for the same closed candle after cooldown', () => {
  const closedAt = 900_000;
  const first = verifiedScan(closedAt);
  const s = { ...settings, cooldownMinutes: 1 };
  const delivered = new Set<string>();
  const output = (snapshot: ScannedCoin, now: number) => scanNotificationSignals([snapshot], s, [], now,
    undefined, undefined, id => delivered.has(id)).filter(e => e.kind === 'flow');
  const alerts = output(first, closedAt + 2_000);
  assert.equal(alerts.length, 1);
  delivered.add(alerts[0].id);
  assert.deepEqual(output(first, closedAt + 70_000), []);
  assert.equal(output(verifiedScan(closedAt + 60_000), closedAt + 70_000).length, 1);
});

test('quality messages mean real measured improvements, never re-notify a flat or falling score', () => {
  const tracker = new QualityScoreTracker();
  const initial = coin(900_000);
  initial.formations[0].confidence = 90;
  const first = scanNotificationSignals([initial], settings, [], 905_000, tracker);
  assert.equal(first.filter(e => e.kind === 'quality').length, 1);
  assert.match(first.find(e => e.kind === 'quality')!.title, /Досягнуто/);
  const again = scanNotificationSignals([initial], settings, [], 905_100, tracker);
  assert.equal(again.filter(e => e.kind === 'quality').length, 0);
  const decrease = coin(900_000);
  decrease.formations[0].confidence = 89;
  assert.equal(scanNotificationSignals([decrease], settings, [], 905_200, tracker).filter(e=>e.kind==='quality').length, 0);
  const increase = coin(900_000);
  increase.formations[0].confidence = 100;
  const improved = scanNotificationSignals([increase], settings, [], 905_300, tracker).find(e => e.kind === 'quality');
  assert.ok(improved);
  assert.match(improved!.title, /Покращилася/);
  assert.match(improved!.description, /90 → 100/);
  const restored = new QualityScoreTracker(tracker.snapshot());
  assert.equal(scanNotificationSignals([increase], settings, [], 905_400, restored).filter(e=>e.kind==='quality').length, 0);
});

test('ROUND requires current price near the actual number, not an old badge', () => {
  const outdated = coin(900_000);
  outdated.currentPrice = 107;
  assert.ok(!scanNotificationSignals([outdated], settings, [], 905_000)
    .some(e => e.kind === 'round'), 'price moved 7% away from tagged round level');
  const close = coin(900_000);
  assert.ok(scanNotificationSignals([close], settings, [], 905_000).some(e => e.kind === 'round'));
});

test('only verified OI and confirmed retests can trigger corresponding alerts', () => {
  const unavailable = coin(900_000);
  unavailable.regularIndicators!.oiAvailability = 'network-error';
  const events = scanNotificationSignals([unavailable], settings, [], 905_000);
  assert.ok(!events.some(e => e.kind === 'openInterest'));
  assert.ok(!events.some(e => e.kind === 'composite' && e.description.includes('OI')));
  const stale = coin(1_000_000);
  stale.lastUpdated = 10_000_000; // quote fresh, OI period more than two intervals old
  const staleEvents = scanNotificationSignals([stale], settings, [], 10_005_000);
  assert.ok(!staleEvents.some(e => e.kind === 'openInterest'));
  assert.ok(!staleEvents.some(e => e.kind === 'composite' && e.description.includes('OI')));
  const confirmed = coin(900_000);
  confirmed.formations[0].status = 'retest';
  confirmed.formations[0].validation!.entryMode = 'RETEST';
  const retests = scanNotificationSignals([confirmed], settings, [], 905_000)
    .filter(e => e.kind === 'breakouts');
  assert.ok(retests.some(e => e.title.includes('ретест')));
  const unconfirmed = coin(900_000);
  unconfirmed.formations[0].status = 'retest';
  unconfirmed.formations[0].validation!.closedCandleOnly = false;
  assert.equal(scanNotificationSignals([unconfirmed], settings, [], 905_000)
    .filter(e => e.title.includes('ретест')).length, 0);
});

test('level and ROUND signals fire on entry, remain silent nearby, then rearm after an exit', () => {
  const tracker = new ProximityAlertTracker();
  const quality = new QualityScoreTracker();
  const start = 1_000_000;
  const near = coin(start);
  const first = scanNotificationSignals([near], settings, [], start, quality, tracker);
  assert.ok(first.some(e => e.kind === 'levels'));
  assert.ok(first.some(e => e.kind === 'round'));
  const unchanged = scanNotificationSignals([near], settings, [], start + 200, quality, tracker);
  assert.ok(!unchanged.some(e => e.kind === 'levels' || e.kind === 'round'));
  const far = coin(start + 300);
  far.currentPrice = 111;
  const outside = scanNotificationSignals([far], settings, [], start + 300, quality, tracker);
  assert.ok(!outside.some(e => e.kind === 'levels' || e.kind === 'round'));
  const back = coin(start + 901_000);
  const rearmed = scanNotificationSignals([back], settings, [], start + 901_000, quality, tracker);
  assert.ok(rearmed.some(e => e.kind === 'levels'));
  assert.ok(rearmed.some(e => e.kind === 'round'));
  const saved = new ProximityAlertTracker(tracker.snapshot());
  assert.equal(scanNotificationSignals([back], settings, [], start + 901_100, quality, saved)
    .filter(e => e.kind === 'levels' || e.kind === 'round').length, 0);
});

test('price and live liquidation events have no chart-timeframe and must not be filtered out', () => {
  const filtered = normalizeSiteNotificationSettings({ ...settings, scopeTimeframe: '4h' });
  const source = { symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures' };
  assert.equal(matchesNotificationScope(filtered, source), false);
  assert.equal(matchesNotificationScope(filtered, source, [], { timeframeIndependent: true }), true);
  assert.equal(matchesNotificationScope(filtered, { ...source, exchange: 'bybit' }, [],
    { timeframeIndependent: true }), true, 'TF exemption does not override exchange preferences');
  const exchangeOnly = normalizeSiteNotificationSettings({ ...filtered, scopeExchange: 'binance' });
  assert.equal(matchesNotificationScope(exchangeOnly, { ...source, exchange: 'bybit' }, [],
    { timeframeIndependent: true }), false);
});

test('new formations are not starved by the first three previously delivered coins', () => {
  const now = 1_000_000;
  const chosen = normalizeSiteNotificationSettings({
    optedIn: true, enabled: true, formations: true, minQualityScore: 88,
  });
  const coins = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'].map(symbol => {
    const snapshot = coin(now);
    snapshot.symbol = symbol;
    return snapshot;
  });
  const delivered = new Set<string>();
  const first = scanNotificationSignals(coins, chosen, [], now, undefined, undefined,
    id => delivered.has(id)).filter(e => e.kind === 'formation');
  assert.equal(first.length, 3);
  first.forEach(e => delivered.add(e.id));
  const later = scanNotificationSignals(coins, chosen, [], now + 1000, undefined, undefined,
    id => delivered.has(id)).filter(e => e.kind === 'formation');
  assert.deepEqual(later.map(e => e.symbol), ['XRPUSDT']);
});

test('quota does not consume unreleased proximity and quality state on fourth coin', () => {
  const now = 2_000_000;
  const chosen = normalizeSiteNotificationSettings({
    optedIn: true, enabled: true, levels: true, round: true, quality: true,
    minQualityScore: 88, levelDistancePct: 1, roundDistancePct: 1,
  });
  const coins = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'].map(symbol => {
    const snapshot = coin(now);
    snapshot.symbol = symbol;
    delete snapshot.formations[0].levels.supportPrice;
    return snapshot;
  });
  const delivered = new Set<string>();
  const quality = new QualityScoreTracker();
  const proximity = new ProximityAlertTracker();
  const call = (time: number) => scanNotificationSignals(coins, chosen, [], time,
    quality, proximity, id => delivered.has(id));
  const first = call(now);
  for (const kind of ['levels', 'round', 'quality']) {
    assert.equal(first.filter(e => e.kind === kind).length, 3, kind);
  }
  first.forEach(e => delivered.add(e.id));
  const second = call(now + 1000);
  for (const kind of ['levels', 'round', 'quality']) {
    assert.ok(second.some(e => e.kind === kind && e.symbol === 'XRPUSDT'), kind);
  }
});
test('a formation taking the final global slot does not consume its quality transition', () => {
  const now = 2_000_000;
  const chosen = normalizeSiteNotificationSettings({
    optedIn: true, enabled: true, formations: true, quality: true, levels: true,
    round: true, breakouts: true, density: true, flow: true, openInterest: true,
    volume: true, early: true, minQualityScore: 88,
  });
  const tracker = new QualityScoreTracker();
  const fillers = ['ETHUSDT', 'SOLUSDT', 'XRPUSDT'].map(symbol => {
    const snapshot = { ...coin(now), symbol };
    snapshot.formations[0].confidence = 80;
    return snapshot;
  });
  const tracked = coin(now);
  const first = scanNotificationSignals([...fillers, tracked], chosen, [], now, tracker);
  assert.equal(first.length, 25);
  assert.equal(first.at(-1)?.kind, 'formation');
  assert.ok(!first.some(e => e.kind === 'quality'));
  const second = scanNotificationSignals([tracked], chosen, [], now + 1_000, tracker);
  assert.ok(second.some(e => e.kind === 'quality'));
});

test('a fourth level on the same formation remains eligible on the next scan', () => {
  const now = 2_000_000;
  const chosen = normalizeSiteNotificationSettings({ optedIn: true, enabled: true, levels: true, levelDistancePct: 1 });
  const snapshot = coin(now);
  Object.assign(snapshot.formations[0].levels, { stopLossPrice: 99.8, targetPrice: 100.5 });
  const tracker = new ProximityAlertTracker();
  const scan = (at: number) => scanNotificationSignals([snapshot], chosen, [], at, undefined, tracker);
  assert.equal(scan(now).filter(e => e.kind === 'levels').length, 3);
  const next = scan(now + 1_000).filter(e => e.kind === 'levels');
  assert.equal(next.length, 1);
  assert.match(next[0].title, /Підтримка/);
});

test('level exits and quality drops still rearm alerts while other coins fill the quota', () => {
  const now = 2_000_000;
  const chosen = normalizeSiteNotificationSettings({
    optedIn: true, enabled: true, levels: true, round: true, quality: true,
    cooldownMinutes: 1, minQualityScore: 88, qualityImprovement: 10, levelDistancePct: 1, roundDistancePct: 1,
  });
  const proximity = new ProximityAlertTracker();
  const quality = new QualityScoreTracker();
  const scan = (coins: ScannedCoin[], at: number) => scanNotificationSignals(coins, chosen, [], at, quality, proximity);
  const tracked = coin(now);
  assert.ok(scan([tracked], now).some(e => e.kind === 'quality'));
  const busy = ['ETHUSDT', 'SOLUSDT', 'XRPUSDT'].map(symbol => ({ ...coin(now + 61_000), symbol }));
  tracked.currentPrice = 120;
  tracked.formations[0].confidence = 80;
  const queues = scan([...busy, tracked], now + 61_000);
  for (const kind of ['levels', 'round', 'quality']) assert.equal(queues.filter(e => e.kind === kind).length, 3);
  tracked.currentPrice = 100;
  tracked.formations[0].confidence = 95;
  const reentered = scan([tracked], now + 62_000);
  for (const kind of ['levels', 'round', 'quality']) assert.ok(reentered.some(e => e.kind === kind), kind);
});

test('surveillance event classification is grounded in server notificationType', () => {
  const row = { id: 'ev1', type: 'level', title: 'Пробій 4H', description: 'Закрита свічка',
    price: 100, timestamp: 500_000, severity: 'warning',
    coinId: 'c1', symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures',
    details: { timeframe: '15m', notificationType: 'LEVEL_CROSS_15M' },
  } as const;
  assert.equal(surveillanceNotificationKind(row as unknown as SurveillanceEvent), 'breakouts');
  assert.equal(marketSurveillanceSignal(row as any, settings)?.kind, 'breakouts');
  assert.equal(marketSurveillanceSignal(row as any,
    normalizeSiteNotificationSettings({ ...settings, breakouts: false })), null);
  assert.equal(surveillanceNotificationKind({ details: { notificationType: 'OI_ANOMALY' } } as any), 'openInterest');
  assert.equal(surveillanceNotificationKind({ details: { notificationType: 'DENSITY_APPEARED' } } as any), 'density');
  assert.equal(surveillanceNotificationKind({ details: { notificationType: 'CHANNEL_BREAKOUT' } } as any), 'breakouts');
});

test('liquidation rules reject historical junk, tiny positions and unauthorized defaults', () => {
  const source = { symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures' };
  const row = { id: 'liq1', side: 'LONG' as const, usd: 200_000, t: 100_000 };
  assert.equal(liquidationNotificationSignal(row, DEFAULT_SITE_NOTIFICATIONS, source), null);
  assert.equal(liquidationNotificationSignal({ ...row, usd: 500 }, settings, source), null);
  assert.equal(liquidationNotificationSignal(row, settings, source)?.kind, 'liquidations');
});

test('5-minute liquidation cascade requires three unique live events and respects side cooldown', () => {
  const tracker = new LiquidationCascadeTracker();
  const now = 1_000_000;
  const row = { id: 'A', side: 'LONG' as const, usd: 120_000, t: now };
  assert.equal(tracker.push(row, 100_000, now), null);
  assert.equal(tracker.push(row, 100_000, now), null, 'same order is not counted twice');
  assert.equal(tracker.push({ ...row, id: 'B', usd: 110_000 }, 100_000, now), null);
  const cascade = tracker.push({ ...row, id: 'C', usd: 140_000 }, 100_000, now);
  assert.deepEqual(cascade, { side: 'LONG', usd: 370_000, count: 3 });
  assert.equal(tracker.push({ ...row, id: 'D' }, 100_000, now + 1000), null, 'cascade cooldown');
  assert.equal(tracker.push({ ...row, id: 'S', side: 'SHORT' }, 100_000, now + 2000), null, 'sides separated');
  assert.equal(tracker.push({ ...row, id: 'future', t: now + 30_000 }, 100_000, now), null, 'future data rejected');
  assert.equal(tracker.push({ ...row, id: 'stale', t: now - 6 * 60_000 }, 100_000, now), null);
});
