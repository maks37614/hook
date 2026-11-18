import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('slow Telegram retry for one user cannot block another user with a ready delivery',async()=>{
  const previousCwd=process.cwd();
  const previousBot=process.env.TELEGRAM_BOT_TOKEN;
  const previousFetch=globalThis.fetch;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'h00k-retry-fairness-'));
  process.chdir(dir);
  process.env.TELEGRAM_BOT_TOKEN='999:retry-fairness-fixture';
  const file=path.join(dir,'server/data/telegram_messages.json');
  let releaseSlow!:()=>void;
  const slowReply=new Promise<void>(resolve=>{releaseSlow=resolve;});
  let fastSeen!:()=>void;
  const fastReply=new Promise<void>(resolve=>{fastSeen=resolve;});
  try {
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const pending=(id:string,userId:string,chatId:string)=>({
      id,userId,eventKey:'event-'+id,text:'Signal '+id,
      botId:'999',chatId,messageIds:[],status:'pending',
      createdAt:Date.now()-5000,attempts:0,nextAttemptAt:0,
    });
    fs.writeFileSync(file,JSON.stringify([
      pending('slow','slow-user','111'),pending('fast','fast-user','222'),
    ]));
    const users=await import('../server/userTelegram');
    const delivery=await import('../server/telegramDelivery');
    users.connectUserTelegram('slow-user','999','111');
    users.connectUserTelegram('fast-user','999','222');
    const calls:string[]=[];
    globalThis.fetch=async(_url,init)=>{
      const body=JSON.parse(String(init?.body));
      const chat=String(body.chat_id);
      calls.push(chat);
      if(chat==='111') await slowReply;
      if(chat==='222') fastSeen();
      return Response.json({ok:true,result:{message_id:chat==='111'?10:20,chat:{id:Number(chat)}}});
    };
    const retry=delivery.retryPendingTelegramMessages();
    await Promise.race([
      fastReply,
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('unrelated Telegram retry was blocked by slow user')),1500)),
    ]);
    assert.deepEqual(calls,['111','222']);
    // At this point the first recipient still has no server acknowledgment.
    assert.equal(delivery.getTelegramDelivery('slow-user','slow')?.status,'pending');
    releaseSlow();
    await retry;
    assert.equal(delivery.getTelegramDelivery('slow-user','slow')?.status,'sent');
    assert.equal(delivery.getTelegramDelivery('fast-user','fast')?.status,'sent');
    assert.equal(calls.length,2);
  } finally {
    releaseSlow();
    globalThis.fetch=previousFetch;
    if(previousBot===undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN=previousBot;
    process.chdir(previousCwd);
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
