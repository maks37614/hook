import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('a corrupt Telegram settings or delivery queue fails closed without rejecting unawaited worker calls', async()=>{
  const before=process.cwd();
  const oldBot=process.env.TELEGRAM_BOT_TOKEN;
  const originalError=console.error;
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'h00k-router-gate-'));
  const dir=path.join(temp,'server','data');
  const userFile=path.join(dir,'user_telegram.json');
  const queueFile=path.join(dir,'telegram_messages.json');
  fs.mkdirSync(dir,{recursive:true});
  process.chdir(temp);
  process.env.TELEGRAM_BOT_TOKEN='999:router-gate-fixture';
  let reported=0;
  console.error=((...args:unknown[])=>{
    if (String(args[0]).includes('Telegram delivery gate unavailable')) reported++;
  }) as typeof console.error;
  try {
    fs.writeFileSync(userFile,'{not valid JSON');
    const { NotificationRouter }=await import('../server/notificationRouter');
    const router=new NotificationRouter();
    const payload={
      source:'SURVEILLANCE' as const, userId:'owner', symbol:'BTCUSDT',
      exchange:'binance', marketType:'futures', eventType:'OI_ANOMALY',
      eventIdentity:'outage-1', triggerMode:'realtime' as const,
      htmlMessage:'This must never be dispatched',
    };
    const rejected=await Promise.all(Array.from({length:50},()=>router.dispatch(payload)));
    assert.ok(rejected.every(value=>value===false));
    assert.equal(reported,1,'repeated corrupt-state failures are logged once per window');

    // Repairing the Telegram settings must permit a new gate evaluation,
    // while corruption of the independent delivery outbox still fails closed.
    fs.writeFileSync(userFile,'{}');
    const { connectUserTelegram }=await import('../server/userTelegram');
    connectUserTelegram('owner','999','31415');
    fs.writeFileSync(queueFile,'{bad queue JSON');
    assert.equal(await router.dispatch({...payload,eventIdentity:'outage-2'}),false);
    assert.equal(reported,1,'a shared disk outage must not flood market logs');
    assert.equal(fs.readFileSync(queueFile,'utf8'),'{bad queue JSON',
      'corrupt outbox must never be overwritten with an empty queue');
  } finally {
    console.error=originalError;
    if(oldBot===undefined)delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN=oldBot;
    process.chdir(before);
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
