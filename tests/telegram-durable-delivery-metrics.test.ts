import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('VPS delivery metrics expose only aggregate retry backlog and acknowledgment age',async()=>{
  const prior=process.cwd();
  const dir=mkdtempSync(path.join(os.tmpdir(),'h00k-telegram-metrics-'));
  process.chdir(dir);
  try {
    const file=path.join(dir,'server/data/telegram_messages.json');
    mkdirSync(path.dirname(file),{recursive:true});
    const fixture=(id:string,status:'sent'|'pending'|'failed',createdAt:number,
      overrides:Record<string,unknown>={})=>({
      id,userId:'secret-user-'+id,eventKey:'private-event-'+id,text:'private text',
      botId:'secret-bot',chatId:'secret-chat',messageIds:[],
      status,createdAt,attempts:1,nextAttemptAt:0,...overrides,
    });
    writeFileSync(file,JSON.stringify([
      fixture('one','pending',90_000,{nextAttemptAt:95_000}),
      fixture('two','pending',97_000,{nextAttemptAt:101_000}),
      fixture('three','failed',80_000),
      fixture('four','sent',95_000,{sentAt:97_500,messageIds:[123]}),
      fixture('five','sent',70_000,{sentAt:90_000,messageIds:[124]}),
    ]));
    const delivery=await import('../server/telegramDelivery');
    const result=delivery.telegramDeliveryStats(100_000);
    assert.equal(result.healthy,true);
    assert.equal(result.pending,2);
    assert.equal(result.failed,1);
    assert.equal(result.sent,2);
    assert.equal(result.dueForRetry,1);
    assert.equal(result.inFlight,0);
    assert.equal(result.oldestPendingAgeMs,10_000);
    assert.deepEqual(result.acknowledgedByTelegramMs.bucketUpperBoundsMs,
      [1000,3000,10_000,30_000,60_000,300_000]);
    assert.deepEqual(result.acknowledgedByTelegramMs.counts,[0,1,0,1,0,0,0]);
    assert.equal(result.acknowledgedByTelegramMs.maxMs,20_000);
    const json=JSON.stringify(result);
    for(const secret of ['secret-user','private','secret-bot','secret-chat','123','124'])
      assert.equal(json.includes(secret),false,'operator metrics must not expose private data');
  } finally {
    process.chdir(prior);
    rmSync(dir,{recursive:true,force:true});
  }
});

test('Telegram durable delivery metrics remain behind strong operator token and fail closed',()=>{
  const ops=readFileSync(new URL('../server/opsMetrics.ts',import.meta.url),'utf8');
  assert.match(ops,/if \(!authorized\(req\)\) \{ res\.status\(404\)\.end\(\); return; \}/);
  assert.match(ops,/telegramDurableDelivery:/);
  assert.match(ops,/catch \{ return \{ healthy: false \}; \}/);
  assert.match(ops,/Buffer\.byteLength\(secret\) < 32/);
});
