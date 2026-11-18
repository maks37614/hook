import test from 'node:test';
import assert from 'node:assert/strict';
import { isCronJobHealthy } from '../server/cronHealth';

const started = Date.parse('2026-11-14T10:00:00Z');
const now = started + 120_000;
const good = {enabled:true, intervalMs:15_000,
  lastRunAt:new Date(now - 10_000).toISOString(), lastError:null, isRunning:false};

test('recent successful recovery clears historical cron failure', () => {
  assert.equal(isCronJobHealthy(good, started, now), true);
  assert.equal(isCronJobHealthy({...good,lastError:'recent failure'}, started, now),false);
  assert.equal(isCronJobHealthy({...good,lastError:null},started,now),true);
});
test('stalled/never-run jobs are unhealthy, with startup and running grace', () => {
  assert.equal(isCronJobHealthy({...good,lastRunAt:null},started,now),false);
  assert.equal(isCronJobHealthy({...good,lastRunAt:null},started,started+10_000),true);
  assert.equal(isCronJobHealthy({...good,lastRunAt:new Date(now-65_000).toISOString()},started,now),false);
  assert.equal(isCronJobHealthy({...good,lastRunAt:new Date(now-65_000).toISOString(),isRunning:true},started,now),true);
  assert.equal(isCronJobHealthy({...good,lastRunAt:new Date(now-121_000).toISOString(),isRunning:true},started,now),false);
  assert.equal(isCronJobHealthy({...good,enabled:false,lastError:'disabled'},started,now),true);
});
