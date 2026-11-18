import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NotificationCooldownCache } from '../server/notificationCooldownCache';

test('in-process Telegram cooldown identity cache eventually reclaims old keys',()=>{
  const hour=60*60_000;
  const start=2_000_000_000_000;
  const guard=new NotificationCooldownCache(24*hour,60_000);
  for(let i=0;i<5_000;i++) guard.record('owner-a:event-'+i,start,15*60_000);
  assert.equal(guard.stats().entries,5_000);
  assert.equal(guard.last('owner-a:event-5',start+hour),start);
  guard.record('owner-b:recent',start+25*hour,15*60_000);
  assert.equal(guard.stats().entries,1,'old user and market identities should be cleaned up');
  assert.equal(guard.last('owner-a:event-5',start+25*hour),0);
  assert.equal(guard.last('owner-b:recent',start+25*hour),start+25*hour);
});

test('extended per-user cooldown is never evicted before its delivery deadline',()=>{
  const hour=60*60_000;
  const start=2_000_000_000_000;
  const guard=new NotificationCooldownCache(24*hour,60_000);
  guard.record('owner-a:long-setup',start,72*hour);
  guard.record('owner-b:default',start,0);
  assert.equal(guard.last('owner-a:long-setup',start+48*hour),start);
  assert.equal(guard.last('owner-b:default',start+48*hour),0);
  guard.record('owner-a:long-setup',start-500,100*hour);
  assert.equal(guard.last('owner-a:long-setup',start+48*hour),start,
    'out-of-order completion must not override a newer notification');
  assert.equal(guard.last('owner-a:long-setup',start+72*hour),0);
});

test('the cache exposes aggregate counts only and handles invalid timestamps safely',()=>{
  const guard=new NotificationCooldownCache();
  const at=2_000_000_000_000;
  guard.record('private-user-123',at,600_000);
  guard.record('empty-time',Number.NaN,10);
  guard.record('invalid-time',-1,10);
  assert.equal(guard.last('private-user-123',at+500),at);
  assert.equal(guard.stats().entries,1);
  assert.ok(!JSON.stringify(guard.stats()).includes('private-user-123'));
  guard.clear();
  assert.equal(guard.stats().entries,0);
});

test('Telegram routing applies current persisted coin cooldown and uses bounded hints',()=>{
  const source=readFileSync(new URL('../server/notificationRouter.ts',import.meta.url),'utf8');
  assert.match(source,/new NotificationCooldownCache\(\)/);
  assert.match(source,/effectiveCoin = coin/);
  assert.match(source,/configuredMinutes = effectiveCoin\?\.config\?\.cooldownMinutes/);
  assert.match(source,/this\.scopedAlertTimestamps\.last\(scopedKey, now\)/);
  assert.match(source,/this\.scopedAlertTimestamps\.record\(gateResult\.scopedKey, now, gateResult\.cooldownMs\)/);
  assert.match(source,/res\.success \? '✅ Delivered' : '⏳ Queued'/);
  assert.doesNotMatch(source,/this\.scopedAlertTimestamps = new Map/);
});
