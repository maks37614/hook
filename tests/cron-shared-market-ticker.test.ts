import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('public ticker/trade observations are handled once per instrument, not per owner', () => {
  const shared=readFileSync(new URL('../server/surveillance/sharedExchangeStream.ts',import.meta.url),'utf8');
  const worker=readFileSync(new URL('../server/surveillance/coinWorker.ts',import.meta.url),'utf8');
  assert.match(shared,/source\.on\('price',/);
  assert.match(shared,/source\.on\('trade',/);
  assert.match(shared,/get marketTicker\(\)/);
  assert.doesNotMatch(worker,/this\.streamClient\.on\('price',/);
  assert.doesNotMatch(worker,/this\.streamClient\.on\('trade',/);
  assert.match(worker,/get currentPrice\(\).*marketTicker\.price/);
  assert.match(worker,/get volume24hUsd\(\).*marketTicker\.volume24hUsd/);
  assert.match(worker,/this\.orderBookEngine\.setVolume24hUsd\(this\.volume24hUsd\)/);
  assert.match(worker,/this\.setupEngine\.evaluateSetups/,
    'personal setup rules must remain in each owner worker');
});

test('cron HTTP endpoint cannot report partial manual scans as success', () => {
  const source=readFileSync(new URL('../server.ts',import.meta.url),'utf8');
  const route=source.slice(source.indexOf("app.post('/api/cron/run'"),
    source.indexOf("app.post('/api/cron/test-alert'"));
  assert.match(route,/Promise\.allSettled\(checks\)/);
  assert.match(route,/failedTasks: failures\.length/);
  assert.match(route,/status\(retryable \? 503 : 500\)/);
});
