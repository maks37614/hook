import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setApiIdentity } from '../src/utils/apiFetch';
import { subscribeUserSignalStream, userSignalStreamStats } from '../src/utils/userSignalStream';

test('one private SSE is shared by price alerts and 24/7 monitors in one browser account', async () => {
  const fetchOriginal=globalThis.fetch;
  let opened=0;
  let stream: ReadableStreamDefaultController<Uint8Array> | null=null;
  const requests:string[]=[];
  setApiIdentity('owner-sse',null);
  globalThis.fetch=(async (url,options) => {
    requests.push(String(url));
    opened++;
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        stream=controller;
        options?.signal?.addEventListener('abort',()=>{
          try {controller.error(new Error('aborted'));} catch {}
        },{once:true});
      },
    }), {status:200,headers:{'Content-Type':'text/event-stream'}});
  }) as typeof globalThis.fetch;
  const first:string[]=[],second:string[]=[];
  let unsubA=()=>{},unsubB=()=>{};
  try {
    unsubA=subscribeUserSignalStream('owner-sse',event=>first.push(event));
    unsubB=subscribeUserSignalStream('owner-sse',event=>second.push(event));
    await new Promise(resolve=>setTimeout(resolve,12));
    assert.equal(opened,1,'a second subscriber must not open a second SSE connection');
    assert.deepEqual(userSignalStreamStats(),{connections:1,subscribers:2});
    assert.equal(requests[0],'/api/surveillance/stream',
      'stream URL must not carry account IDs or secret tokens');
    assert.ok(stream);
    stream!.enqueue(new TextEncoder().encode('retry: 10000\n\nevent: alert\ndata: 1\n\n'));
    await new Promise(resolve=>setTimeout(resolve,12));
    assert.deepEqual(first,['alert']);
    assert.deepEqual(second,['alert']);
    unsubA();
    assert.deepEqual(userSignalStreamStats(),{connections:1,subscribers:1});
    stream!.enqueue(new TextEncoder().encode('event: changed\ndata: 2\n\n'));
    await new Promise(resolve=>setTimeout(resolve,12));
    assert.deepEqual(first,['alert']);
    assert.deepEqual(second,['alert','changed']);
    unsubB();
    assert.deepEqual(userSignalStreamStats(),{connections:0,subscribers:0});
    assert.equal(opened,1);
  } finally {
    unsubA();unsubB();
    globalThis.fetch=fetchOriginal;
    setApiIdentity(null,null);
  }
});

test('a price alert fires its private SSE before waiting for Telegram and only after disk commit',()=>{
  const server=readFileSync(new URL('../server/alertService.ts',import.meta.url),'utf8');
  const start=server.indexOf('if (isTriggered) {',server.indexOf('async function checkAlertsInternal'));
  const end=server.indexOf('const language = normalizeLanguage',start);
  const dispatch=server.indexOf('await sendUserTelegramMessage(',end);
  assert.ok(start>0 && end>start && dispatch>end);
  const snippet=server.slice(start,end);
  assert.match(snippet,/if \(!saveAlerts\(/);
  assert.match(snippet,/alert = fired;[\s\S]*publishSurveillanceAlert\(alert\.userId \|\| ''\)/);
  assert.ok(server.indexOf('publishSurveillanceAlert(alert.userId',start)<dispatch,
    'urgent on-site event cannot wait for a Telegram network response');

  const context=readFileSync(new URL('../src/context/AlertsContext.tsx',import.meta.url),'utf8');
  assert.match(context,/subscribeUserSignalStream\(user\.uid/);
  assert.match(context,/priceAlertRefreshRef\.current\?\.\(\)/);
  assert.match(context,/if \(force\)[\s\S]*?lastLiveFetch = now/);
  assert.match(context,/pendingUrgent = true/);
  assert.match(context,/urgentTimer = setTimeout/);
  assert.match(context,/if \(connected\) priceAlertRefreshRef\.current\?\.\(\)/,
    'reconnected accounts must fetch durable signals missed while offline');
  assert.match(context,/if \(!document\.hidden\) void pollSync\(/,
    'foregrounding a tab must promptly catch up pending triggers');
  assert.match(context,/if \(urgentTimer\) clearTimeout\(urgentTimer\)/);
});
