import test from 'node:test';
import assert from 'node:assert/strict';
import type { Kline } from '../src/types';
import { MacroAndNewsEngine } from '../server/surveillance/macroAndNewsEngine';

const bars = [{ time: 1000, open: 100, high: 101, low: 99,
  close: 100, volume: 100 }] as Kline[];

test('a thousand 24/7 watchers use one BTC macro refresh (four timeframe fetches)', async () => {
  let now = 1_000_000;
  let calls = 0;
  const pending: Array<(rows: Kline[]) => void> = [];
  const loader = () => {
    calls++;
    return new Promise<Kline[]>(resolve => pending.push(resolve));
  };
  const engine = new MacroAndNewsEngine(loader, () => now);
  const requests = Array.from({ length: 1000 }, () => engine.updateBTCContext());
  assert.equal(calls, 4, 'only one fetch per BTC timeframe while in-flight');
  assert.equal(engine.btcCacheStats().inFlight, true);
  pending.splice(0).forEach(resolve => resolve(bars));
  const results = await Promise.all(requests);
  assert.ok(results.every(value => value === results[0]));
  assert.equal(engine.btcCacheStats().inFlight, false);
  await engine.updateBTCContext();
  assert.equal(calls, 4, 'successful snapshot reused for 60 seconds');
  now += 60_001;
  const next = engine.updateBTCContext();
  assert.equal(calls, 8);
  pending.splice(0).forEach(resolve => resolve(bars));
  await next;
});

test('failed BTC loads do not cause per-user request storms and retry after backoff', async () => {
  let now = 2_000_000;
  let calls = 0;
  const engine = new MacroAndNewsEngine(async () => {
    calls++;
    throw new Error('exchange unavailable');
  }, () => now);
  await engine.updateBTCContext();
  assert.equal(calls, 4);
  assert.equal(engine.btcCacheStats().cacheAgeMs, null,
    'empty exchange response is not recorded as successful market data');
  now += 1_000;
  await Promise.all(Array.from({ length: 200 }, () => engine.updateBTCContext()));
  assert.equal(calls, 4, 'repeated clients cannot bypass the 15s retry budget');
  now += 14_000;
  await engine.updateBTCContext();
  assert.equal(calls, 8, 'one bounded retry after backoff');
});
