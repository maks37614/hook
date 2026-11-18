import test from 'node:test';
import assert from 'node:assert/strict';
import { TelegramDispatchQueue } from '../server/telegramQueue';
import { readFileSync } from 'node:fs';

test('Telegram queue serializes parallel sends, limiting bot and per-chat bursts', async () => {
  let clock = 1000;
  const calls: Array<{key:string;at:number}> = [];
  const queue = new TelegramDispatchQueue(
    () => clock, async ms => { clock += ms; }, 120, 1100,
  );
  const send = (key:string) => queue.schedule('same-bot',key,async()=>{
    calls.push({key,at:clock});return true;
  });
  await Promise.all([send('alice'),send('bob'),send('alice')]);
  assert.deepEqual(calls.map(x=>x.key),['alice','bob','alice']);
  assert.ok(calls[1].at - calls[0].at >= 120);
  assert.ok(calls[2].at - calls[0].at >= 1100);
  assert.equal(queue.stats().queued,0);
});
test('failed Telegram sends release queue slot so other users are never blocked',async()=>{
  const queue = new TelegramDispatchQueue(()=>10000,async()=>{},0,0);
  const calls:string[]=[];
  const first=queue.schedule('bot','a',async()=>{calls.push('a');throw Error('denied');}).catch(()=>false);
  const second=queue.schedule('bot','b',async()=>{calls.push('b');return true;});
  assert.equal(await first,false);
  assert.equal(await second,true);
  assert.deepEqual(calls,['a','b']);
  assert.equal(queue.stats().queued,0);
});
test('persistent retries and direct sends use the same paced queue',()=>{
  const file=readFileSync(new URL('../server/telegramDelivery.ts',import.meta.url),'utf8');
  assert.match(file,/telegramDispatchQueue\.schedule\(record\.botId, record\.chatId/);
  assert.match(file,/messageIds\.push\(\.\.\.result\.messageIds\)/);
  assert.match(file,/startTelegramDeliveryWorker/);
});

test('slow Telegram HTTP for one chat does not block other users of the same bot', async () => {
  let clock = 1000;
  let finishSlow!: () => void;
  const started: Array<{chat:string;time:number}> = [];
  const queue = new TelegramDispatchQueue(
    () => clock, async ms => { clock += ms; }, 120, 1100,
  );
  const slow = queue.schedule('shared-bot','alice',async () => {
    started.push({chat:'alice',time:clock});
    await new Promise<void>(resolve => {finishSlow=resolve;});
    return 'alice sent';
  });
  const fast = queue.schedule('shared-bot','bob',async () => {
    started.push({chat:'bob',time:clock});
    return 'bob sent';
  });

  // This must resolve BEFORE the unrelated Alice HTTP request finishes.
  assert.equal(await fast,'bob sent');
  assert.deepEqual(started.map(x=>x.chat),['alice','bob']);
  assert.ok(started[1].time - started[0].time >= 120);
  assert.equal(queue.stats().inFlight,1,
    'Alice remains in flight while Bob has already received his message');
  finishSlow();
  assert.equal(await slow,'alice sent');
  assert.deepEqual(queue.stats(),{
    queued:0,inFlight:0,lastAdmissionWaitMs:120,
  });
});

test('same-chat sends cannot overtake a slow message or block another chat admission',async () => {
  let clock=1000;
  let releaseFirst!:()=>void;
  const starts:Array<{label:string;at:number}> = [];
  const queue = new TelegramDispatchQueue(
    ()=>clock,async ms=>{ clock+=ms; },120,1100,
  );
  const first=queue.schedule('bot','a',async()=>{
    starts.push({label:'a1',at:clock});
    await new Promise<void>(resolve=>{releaseFirst=resolve;});
    return true;
  });
  const second=queue.schedule('bot','a',async()=>{
    starts.push({label:'a2',at:clock});return true;
  });
  const unrelated=queue.schedule('bot','b',async()=>{
    starts.push({label:'b',at:clock});return true;
  });
  assert.equal(await unrelated,true);
  assert.deepEqual(starts.map(x=>x.label),['a1','b']);
  releaseFirst();
  assert.equal(await first,true);
  assert.equal(await second,true);
  assert.deepEqual(starts.map(x=>x.label),['a1','b','a2']);
  assert.ok(starts[2].at-starts[0].at>=1100);
  assert.ok(starts[2].at-starts[1].at>=120);
  assert.equal(queue.stats().queued,0);
});

test('independent Telegram bots can send without waiting for each other',async()=>{
  let release!:()=>void;
  const queue=new TelegramDispatchQueue(()=>1000,async()=>{},120,1100);
  const slow=queue.schedule('bot-a','chat',async()=>{
    await new Promise<void>(resolve=>{release=resolve;});return 'done';
  });
  const fast=queue.schedule('bot-b','chat',async()=> 'fast');
  assert.equal(await fast,'fast');
  release();
  assert.equal(await slow,'done');
  assert.equal(queue.stats().queued,0);
});
