import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SurveillanceCoin } from '../src/types';
import { hasFreshSurveillanceCheck, wasSurveillanceCheckCommitted, SurveillanceCheckIncompleteError } from '../server/surveillance/checkResult';

const prior = { lastCheckedAt: '2026-11-14T00:00:00.000Z' };
const state = { currentPrice: 100 } as SurveillanceCoin['state'];

test('a manual check requires genuinely fresh calculated market state', () => {
  assert.equal(hasFreshSurveillanceCheck(prior, { ...prior, state }), false,
    'a saved snapshot must not count as a new exchange check');
  assert.equal(hasFreshSurveillanceCheck(prior, { lastCheckedAt: '2026-11-14T00:01:00.000Z' }), false,
    'a timestamp without market state is not a valid analysis');
  assert.equal(hasFreshSurveillanceCheck(prior, { lastCheckedAt: 'invalid', state }), false,
    'invalid timestamps cannot prove freshness');
  assert.equal(hasFreshSurveillanceCheck(prior, {
    lastCheckedAt: '2026-11-14T00:01:00.000Z', state,
  }), true);
  assert.equal(hasFreshSurveillanceCheck({}, {
    lastCheckedAt: '2026-11-14T00:01:00.000Z', state,
  }), true, 'an initial successful check is fresh');
  assert.equal(hasFreshSurveillanceCheck({}, {}), false,
    'no exchange data means no completed first check');
});

test('a deleted coin or a rejected stale check is never reported as committed', () => {
  const checked = { lastCheckedAt: '2026-11-14T00:01:00.000Z' };
  assert.equal(wasSurveillanceCheckCommitted(checked, null), false);
  assert.equal(wasSurveillanceCheckCommitted(checked, prior), false);
  assert.equal(wasSurveillanceCheckCommitted(checked, checked), true);
  assert.equal(wasSurveillanceCheckCommitted({}, {}), false);
});

test('incomplete check errors retain their failed-coin count for retryable 503 responses', () => {
  const error = new SurveillanceCheckIncompleteError(2);
  assert.equal(error.name, 'SurveillanceCheckIncompleteError');
  assert.equal(error.failedChecks, 2);
  assert.match(error.message, /2 монет/);
  assert.match(error.message, /Спробуйте пізніше/);
});

test('surveillance endpoints do not report a successful manual scan without new candles', () => {
  const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../server/surveillanceService.ts', import.meta.url), 'utf8');
  const checkOne = server.slice(server.indexOf("app.post('/api/surveillance/:id/check'"),
    server.indexOf("app.get('/api/surveillance/worker/:id'"));
  const createCoin = server.slice(server.indexOf("app.post('/api/surveillance',"),
    server.indexOf("app.put('/api/surveillance/:id'"));
  const checkAll = service.slice(service.indexOf('export async function checkAllUserCoins'),
    service.indexOf('export function startSurveillanceMonitor'));
  assert.match(checkOne, /if \(!hasFreshSurveillanceCheck\(found\.coin, updated\)\)/);
  assert.match(checkOne, /status\(503\)\.setHeader\('Retry-After', '10'\)/);
  assert.match(checkOne, /if \(!wasSurveillanceCheckCommitted\(updated, committed\)\)/);
  assert.match(createCoin, /return res\.json\(\{ success: true, pending: true/);
  assert.match(checkAll, /if \(!hasFreshSurveillanceCheck\(coin, updated\)\)/);
  assert.match(checkAll, /if \(!wasSurveillanceCheckCommitted\(updated, committed\)\)/);
  assert.match(checkAll, /if \(failedChecks\) throw new SurveillanceCheckIncompleteError/);
  assert.match(server, /err instanceof SurveillanceCheckIncompleteError/);
});
