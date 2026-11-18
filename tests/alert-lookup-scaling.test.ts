import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../server/alertService.ts',import.meta.url),'utf8');
const cycle=source.slice(source.indexOf('async function checkAlertsInternal('),source.indexOf('// Start background monitor loop'));

test('six-second alert monitor does not linearly rescan every alert and history for each candidate',()=>{
  assert.match(cycle,/let alertByIdentity = new Map<string, PriceAlert>\(\)/);
  assert.match(cycle,/let processedByIdentity = new Map<string, AlertHistoryItem>\(\)/);
  assert.match(cycle,/let alert = currentAlert\(candidate\);/);
  assert.match(cycle,/const prior = processedAlert\(alert\);/);
  assert.doesNotMatch(cycle,/loadAlerts\(\)\.find\(/);
  assert.doesNotMatch(cycle,/const prior = findProcessedAlertHistory\(alert\)/);
});

test('indexes refresh when another action replaces cached alerts or history',()=>{
  assert.match(cycle,/if \(list !== alertList\) \{/);
  assert.match(cycle,/if \(history !== recordedHistory\) \{/);
  assert.match(cycle,/JSON\.stringify\(\[candidate\.userId, candidate\.id\]\)/);
  assert.match(cycle,/JSON\.stringify\(\[alert\.userId, alert\.id, alert\.deliveryEpoch \?\? 0\]\)/);
  assert.match(cycle,/if \(!processedByIdentity\.has\(key\)\) processedByIdentity\.set\(key, record\)/);
});

test('durable claim is still committed before any Telegram dispatch',()=>{
  const mark=cycle.indexOf('const fired = { ...alert, triggered: true');
  const persist=cycle.indexOf('if (!saveAlerts(loadAlerts().map(entry => entry === alert ? fired : entry)))',mark);
  const telegram=cycle.indexOf('sendUserTelegramMessage(',mark);
  assert.ok(mark>=0 && persist>mark && telegram>persist);
  assert.match(cycle.slice(mark, persist), /triggeredAt: Date\.now\(\), triggeredPrice: currentPrice/);
  assert.doesNotMatch(cycle.slice(mark, persist), /alert\.triggered\s*=/);
});
