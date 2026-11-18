import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSharedFundingSubscriptions, EMPTY_FUNDING,
  type FundingPacket, type FundingSnapshot,
} from '../src/components/hookchart/sharedFundingStream';

type Request = { symbol: string; refreshHistory: boolean };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('one funding ticker/history poll and timer serve multiple same-symbol HookCharts', async () => {
  let now = 2_000_000_000_000;
  let nextId = 0;
  const timers = new Map<number, () => void>();
  const requests: Request[] = [];
  let result: FundingPacket = { rate: .0001, history: [.00008, .00009], nextFundingAt: now + 120_000 };
  const service = createSharedFundingSubscriptions(
    async (_exchange, symbol, refreshHistory) => {
      requests.push({ symbol, refreshHistory });
      return { ...result, history: refreshHistory ? result.history : undefined };
    },
    {
      now: () => now,
      every: fn => { timers.set(++nextId, fn); return nextId; },
      cancel: id => { timers.delete(id as number); },
    },
  );
  const a: FundingSnapshot[] = [], b: FundingSnapshot[] = [];
  const unA = service.subscribe('binance', 'BTCUSDT', snapshot => a.push(snapshot));
  const unB = service.subscribe('binance', 'btcusdt', snapshot => b.push(snapshot));
  await flush();

  assert.equal(service.activeScopes(), 1);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].refreshHistory, true);
  assert.deepEqual(a.at(-1)?.history, [.00008, .00009]);
  assert.strictEqual(a.at(-1), b.at(-1));
  assert.equal(timers.size, 1);

  now += 60_000;
  result = { rate: .0002, nextFundingAt: 2_000_000_120_000 };
  [...timers.values()][0]();
  await flush();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].refreshHistory, false);
  assert.deepEqual(a.at(-1)?.history, [.00008, .00009]);
  assert.equal(a.at(-1)?.rate, .0002);
  assert.strictEqual(a.at(-1), b.at(-1));

  // Same numeric funding values and unchanged history must not re-render
  // every subscriber merely because the poll interval elapsed.
  const count = a.length;
  now += 60_000;
  result = { rate: .0002, history: [.00008, .00009], nextFundingAt: now + 120_000 };
  [...timers.values()][0]();
  await flush();
  assert.equal(requests[2].refreshHistory, true);
  assert.equal(a.length, count);

  unA();
  assert.equal(service.activeScopes(), 1);
  assert.equal(timers.size, 1);
  unB();
  assert.equal(service.activeScopes(), 0);
  assert.equal(timers.size, 0);
});

test('funding scopes remain isolated and discard in-flight response after final unsubscribe', async () => {
  let finish!: (packet: FundingPacket) => void;
  const pending = new Promise<FundingPacket>(resolve => { finish = resolve; });
  const delivered: FundingSnapshot[] = [];
  let canceled = 0;
  const service = createSharedFundingSubscriptions(
    (_exchange, symbol) => symbol === 'BTCUSDT' ? pending : Promise.resolve({ rate: .002, history: [.001] }),
    { now: () => 2_000_000_000_000, every: () => 10, cancel: () => { canceled++; } },
  );
  const unBtc = service.subscribe('bybit', 'BTCUSDT', snapshot => delivered.push(snapshot));
  const eth: FundingSnapshot[] = [];
  const unEth = service.subscribe('bybit', 'ETHUSDT', snapshot => eth.push(snapshot));
  await flush();
  assert.equal(service.activeScopes(), 2);
  assert.equal(eth.at(-1)?.rate, .002);
  unBtc();
  finish({ rate: .05, history: [.01] });
  await flush();
  assert.equal(delivered.length, 1);
  assert.strictEqual(delivered[0], EMPTY_FUNDING);
  assert.equal(service.activeScopes(), 1);
  unEth();
  assert.equal(canceled, 2);
});

test('funding refresh failure clears stale values and later valid polls recover', async () => {
  let fail = false;
  const states: FundingSnapshot[] = [];
  let tick: () => void = () => {};
  const service = createSharedFundingSubscriptions(
    async () => {
      if (fail) throw new Error('temporary rate limit');
      return { rate: .00005, history: [.0001] };
    },
    {
      now: () => Date.now(),
      every: fn => { tick = fn; return 1; },
      cancel: () => {},
    },
  );
  const stop = service.subscribe('binance', 'SOLUSDT', snapshot => states.push(snapshot));
  await flush();
  assert.equal(states.at(-1)?.rate, .00005);
  fail = true; tick(); await flush();
  assert.strictEqual(states.at(-1), EMPTY_FUNDING);
  fail = false; tick(); await flush();
  assert.equal(states.at(-1)?.rate, .00005);
  stop();
});
