import assert from 'node:assert/strict';
import test from 'node:test';
import { createTerminalCoinPickerStore } from '../src/utils/terminalCoinPickerStore';

test('closed Terminal coin pickers never receive market list updates', () => {
  const store = createTerminalCoinPickerStore([{ symbol: 'BTCUSDT', price: 1 }]);
  const next = [{ symbol: 'BTCUSDT', price: 2 }, { symbol: 'ETHUSDT', price: 5 }];
  store.set(next);
  assert.equal(store.listeners(), 0);
  assert.equal(store.get(), next);
});

test('only open coin pickers get the latest catalog while subscriptions are active', () => {
  const store = createTerminalCoinPickerStore([{ symbol: 'BTCUSDT', price: 1 }]);
  let first = 0;
  let second = 0;
  const closeFirst = store.subscribe(() => { first++; });
  const closeSecond = store.subscribe(() => { second++; });
  const next = [{ symbol: 'BTCUSDT', price: 2 }, { symbol: 'ETHUSDT', price: 5 }];
  store.set(next);
  assert.equal(store.get(), next);
  assert.equal(first, 1);
  assert.equal(second, 1);
  store.set(next);
  assert.equal(first, 1);
  closeFirst();
  store.set([{ symbol: 'BTCUSDT', price: 3 }]);
  assert.equal(first, 1);
  assert.equal(second, 2);
  closeSecond();
  assert.equal(store.listeners(), 0);
});

test('an erroneous picker listener does not block other coin searches', () => {
  const store = createTerminalCoinPickerStore<string>([]);
  const closeBroken = store.subscribe(() => { throw new Error('unmounted picker'); });
  let last: string[] = [];
  const closeHealthy = store.subscribe(() => { last = store.get(); });
  store.set(['龙虾USDT', 'BTCUSDT']);
  assert.deepEqual(last, ['龙虾USDT', 'BTCUSDT']);
  closeBroken();
  closeHealthy();
});
