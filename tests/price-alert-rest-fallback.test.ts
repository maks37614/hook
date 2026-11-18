import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forEachBounded, selectRoundRobinBatch } from '../server/priceAlertFallback';

test('REST price fallback checks all small watchlists and rotates fairly over large ones', () => {
  const symbols = Array.from({ length: 55 }, (_, i) => 'S' + i);
  let cursor = 0;
  const visited: string[] = [];
  for (let i=0; i<4; i++) {
    const batch = selectRoundRobinBatch(symbols, cursor, 16);
    cursor = batch.nextCursor;
    assert.ok(batch.selected.length <= 16);
    visited.push(...batch.selected);
  }
  assert.equal(new Set(visited).size, symbols.length);
  assert.deepEqual(selectRoundRobinBatch(symbols.slice(0,3),0,16).selected,symbols.slice(0,3));
  assert.deepEqual(selectRoundRobinBatch([],5,16).selected,[]);
});

test('fallback REST requests never exceed configured parallelism', async () => {
  let active=0, maximum=0, completed=0;
  await forEachBounded(Array.from({length:33},(_,i)=>i), 8, async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise<void>(r => setImmediate(r));
    active--;
    completed++;
  });
  assert.equal(completed,33);
  assert.ok(maximum <= 8 && maximum > 1);
  assert.equal(active,0);
});

test('price alert monitoring reads live WebSocket first and uses round-robin bounded REST', () => {
  const server = readFileSync(new URL('../server/alertService.ts',import.meta.url),'utf8');
  const ops = readFileSync(new URL('../server/opsMetrics.ts',import.meta.url),'utf8');
  assert.match(server,/publicPriceFeed\.current\(/);
  assert.match(server,/selectRoundRobinBatch\(missing, fallbackCursor, PRICE_REST_FALLBACK_MAX_PER_CYCLE\)/);
  assert.match(server,/forEachBounded\(batch\.selected, PRICE_REST_FALLBACK_PARALLEL/);
  assert.match(server,/if \(price !== null && Number\.isFinite\(price\) && price > 0\)/);
  assert.match(ops,/priceAlertFallback: priceAlertFallbackStats\(\)/);
});
