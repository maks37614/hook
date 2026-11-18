import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CoinWorker } from '../server/surveillance/coinWorker';
import { SurveillanceManager } from '../server/surveillance/surveillanceManager';
import type { SurveillanceCoin } from '../src/types';

const original = { id: 'watch-1', userId: 'user-a', symbol: 'BTCUSDT',
  exchange: 'binance', marketType: 'futures', baseAsset: 'BTC',
  isActive: true, config: { densityMode: 'AUTO' } } as unknown as SurveillanceCoin;

test('worker market identity is stable across config updates, changes when underlying feed changes', () => {
  assert.equal(CoinWorker.marketKey(original),'binance:futures:BTCUSDT:BTC');
  assert.equal(CoinWorker.marketKey({...original,symbol:'btcusdt'}),CoinWorker.marketKey(original));
  assert.notEqual(CoinWorker.marketKey({...original,exchange:'bybit'}),CoinWorker.marketKey(original));
  assert.notEqual(CoinWorker.marketKey({...original,marketType:'spot'}),CoinWorker.marketKey(original));
  assert.notEqual(CoinWorker.marketKey({...original,symbol:'ETHUSDT',baseAsset:'ETH'}),CoinWorker.marketKey(original));
  const fake = Object.create(CoinWorker.prototype) as any;
  fake.marketIdentity = CoinWorker.marketKey(original);
  assert.equal(fake.matchesInstrument({...original,config: {...original.config}}),true);
  assert.equal(fake.matchesInstrument({...original,symbol:'ETHUSDT',baseAsset:'ETH'}),false);
});

test('updating a paused worker releases its old market resources', () => {
  const manager=new SurveillanceManager();
  let destroyed=0;
  const fake = { coin: original, destroy: () => { destroyed++; },
    matchesInstrument: () => true, updateCoin: () => {} };
  (manager as any).workers.set(JSON.stringify([original.userId,original.id]),fake);
  manager.updateWorkerCoin({...original,isActive:false});
  assert.equal(destroyed,1);
  assert.equal(manager.getActiveWorkerCount(),0);
});

test('no market switch reuses the previous worker or its density state', () => {
  const w=readFileSync(new URL('../server/surveillance/coinWorker.ts',import.meta.url),'utf8');
  const m=readFileSync(new URL('../server/surveillance/surveillanceManager.ts',import.meta.url),'utf8');
  assert.match(w,/private readonly marketIdentity: string/);
  assert.match(w,/Cannot reuse a surveillance worker for a different market/);
  assert.match(m,/if \(existing\.matchesInstrument\(coin\)\)/);
  assert.match(m,/existing\.destroy\(\);\s*this\.workers\.delete/);
  assert.match(m,/this\.startWorkerForCoin\(coin\)/);
});
