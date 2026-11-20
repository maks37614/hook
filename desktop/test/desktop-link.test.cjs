'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const { normalizeCommand, linkedTickerDocuments, MetaScalpTickerSender, DesktopTickerRelayClient }=require('../desktop-link-client.cjs');

test('symbol formatting keeps exchange, spot/futures and group',()=>{
  assert.deepEqual(normalizeCommand({symbol:'btcusdt',exchange:'binance',marketType:'futures',binding:'1'}),{
    symbol:'BTCUSDT',exchange:'binance',marketType:'futures',binding:'001',tickerPattern:'BINANCE:BTCUSDT.p',
  });
  assert.equal(normalizeCommand({symbol:'ethusdt',exchange:'bybit',marketType:'spot',binding:'500'}).tickerPattern,'BYBIT:ETHUSDT');
});
test('rejects invalid binding, exchange and injected symbols',()=>{
  for (const command of [
    {symbol:'BTCUSDT',exchange:'binance',marketType:'futures',binding:'000'},
    {symbol:'BTCUSDT',exchange:'binance',marketType:'futures',binding:'501'},
    {symbol:'BTCUSDT',exchange:'binance',marketType:'futures',binding:'1abc'},
    {symbol:'BTCUSDT;DELETE',exchange:'binance',marketType:'futures',binding:'001'},
    {symbol:'BTCUSDT',exchange:'okx',marketType:'futures',binding:'001'},
    {symbol:'BTCUSDT',exchange:'bybit',marketType:'margin',binding:'001'},
  ]) assert.equal(normalizeCommand(command),null);
});
test('MetaScalp sender probes only loopback and sends only change-ticker',async()=>{
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push([url,opts]);
    if(url.endsWith('/ping'))return {ok:true,json:async()=>({app:url.includes('17847')?'MetaScalp':'Other'})};
    if(url.endsWith('/api/change-ticker'))return {ok:true,json:async()=>({status:'ok'})};
    throw Error('Unexpected call');
  };
  const sender=new MetaScalpTickerSender(fetchImpl);
  const result=await sender.send({symbol:'solusdt',exchange:'bybit',marketType:'futures',binding:'001'});
  assert.equal(result.ok,true);
  assert.equal(result.port,17847);
  assert.deepEqual(JSON.parse(calls.at(-1)[1].body),{tickerPattern:'BYBIT:SOLUSDT.p',binding:'001'});
  assert.ok(calls.every(([url])=>url.startsWith('http://127.0.0.1:')));
  assert.equal(calls.filter(([url])=>url.includes('change-ticker')).length,1);
  await sender.send({symbol:'solusdt',exchange:'bybit',marketType:'futures',binding:'001'});
  assert.equal(calls.filter(([url])=>url.includes('change-ticker')).length,1);
});
test('untrusted service cannot receive MetaScalp commands',async()=>{
  const calls=[];
  const sender=new MetaScalpTickerSender(async url=>{
    calls.push(url);
    return {ok:true,json:async()=>({app:'NotMetaScalp'})};
  });
  const result=await sender.send({symbol:'BTCUSDT',exchange:'binance',marketType:'spot',binding:'001'});
  assert.deepEqual(result,{ok:false,reason:'METASCALP_OFFLINE'});
  assert.ok(calls.every(url=>url.endsWith('/ping')));
});
test('relay uses the signed-in cookie and forwards one fresh command',async()=>{
  const calls=[];
  const cmd={seq:1,symbol:'BTCUSDT',exchange:'binance',marketType:'futures',binding:'001',createdAt:Date.now()};
  let client;
  client=new DesktopTickerRelayClient({
    getCookie:async()=> '__Host-h00k-session=test-token',
    fetchImpl:async(url,opts)=>{calls.push([url,opts]);return {status:200,json:async()=>({command:cmd})};},
    onCommand:async(received)=>{ assert.deepEqual(received,cmd);client.stop();return {ok:true}; },
  });
  client.start();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(client.running,false);
  assert.equal(calls.length,1);
  assert.match(calls[0][0],/\/api\/desktop-link\/poll\?after=0$/);
  assert.equal(calls[0][1].headers.Cookie,'__Host-h00k-session=test-token');
});

test('Desktop accepts a fresh low sequence after VPS channel restart',async()=>{
  const command={seq:1,symbol:'ETHUSDT',exchange:'binance',
    marketType:'futures',binding:'002',createdAt:Date.now()};
  let handled=0;
  let client;
  client=new DesktopTickerRelayClient({
    getCookie:async()=> '__Host-h00k-session=test-token',
    fetchImpl:async()=>({
      status:200,headers:{get:()=> 'new-vps-epoch'},
      json:async()=>({command}),
    }),
    onCommand:async()=>{handled++;client.stop();return {ok:true};},
  });
  client.seq=1000;
  client.epoch='old-vps-epoch';
  client.start();
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(handled,1);
  assert.equal(client.seq,1);
  assert.equal(client.epoch,'new-vps-epoch');
});

test('session switch resets cursor so new account receives ticker sequence 1',async()=>{
  let polls=0, received=0;
  const command={seq:1,symbol:'SOLUSDT',exchange:'bybit',
    marketType:'spot',binding:'002',createdAt:Date.now()+3_600_000};
  let client;
  client=new DesktopTickerRelayClient({
    getCookie:async()=> polls===0 ? 'h00k-session=user-A' : 'h00k-session=user-B',
    fetchImpl:async(url)=>{
      polls++;
      if(polls===1) return {status:204,headers:{get:()=> 'epoch-A'}};
      assert.match(url,/poll\?after=0(?:&|$)/);
      return {status:200,headers:{get:()=> 'epoch-B'},json:async()=>({command})};
    },
    onCommand:async()=>{received++;client.stop();return {ok:true}},
  });
  client.seq=4000;client.epoch='old';
  client.start();
  await new Promise(resolve=>setTimeout(resolve,80));
  assert.equal(received,1);
  assert.equal(client.seq,1);
  assert.equal(client.epoch,'epoch-B');
});

test('MetaScalp body read deadline prevents a stalled local response',async()=>{
  let called=0;
  const sender=new MetaScalpTickerSender(async(url,{signal})=>{
    if(url.endsWith('/ping') && url.includes('17845')) return {
      ok:true,json:()=>new Promise((_,reject)=>{
        signal.addEventListener('abort',()=>reject(new Error('local body timed out')),{once:true});
      }),
    };
    if(url.endsWith('/ping') && url.includes('17846')) return {
      ok:true,json:async()=>({app:'MetaScalp'}),
    };
    if(url.endsWith('/api/change-ticker')) {
      called++;
      return {ok:true,json:async()=>({status:'ok'})};
    }
    throw Error('Unexpected '+url);
  });
  const start=Date.now();
  const result=await sender.send({symbol:'BTCUSDT',exchange:'binance',
    marketType:'futures',binding:'002'});
  assert.equal(result.ok,true);
  assert.equal(called,1);
  assert.ok(Date.now()-start < 3000,'must move to the next port instead of stalling');
});

test('command from an expired account session is never applied after sign-out',async()=>{
  let cookiesRead=0, pollCount=0, sent=0;
  const command={seq:1,symbol:'BTCUSDT',exchange:'binance',
    marketType:'futures',binding:'002',createdAt:Date.now()};
  let client;
  client=new DesktopTickerRelayClient({
    getCookie:async()=> (++cookiesRead===1 ? 'h00k-session=old' : 'h00k-session=new'),
    fetchImpl:async()=>{
      if(++pollCount===1) return {status:200,headers:{get:()=> 'old-epoch'},json:async()=>({command})};
      client.stop();
      return {status:204,headers:{get:()=> 'new-epoch'}};
    },
    onCommand:async()=>{sent++;return {ok:true};},
  });
  client.start();
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(sent,0);
  assert.ok(cookiesRead>=2);
});

const FIRST='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SECOND='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EXTRA='cccccccc-cccc-cccc-cccc-cccccccccccc';
function mixedMetaScalpState() {
  return {windows:[{tabs:[{documents:[
    {externalId:FIRST,kind:'orderBook',linkNumber:2,connectionId:11,ticker:'ETHUSDT'},
    {externalId:SECOND,kind:'orderBook',linkNumber:2,connectionId:22,ticker:'ETHUSDT'},
    {externalId:EXTRA,kind:'orderBook',linkNumber:3,connectionId:33,ticker:'SOLUSDT'},
  ]}]}],standaloneCharts:[]};
}
test('UI inventory selects only the requested binding and validates destinations',()=>{
  assert.deepEqual(linkedTickerDocuments(mixedMetaScalpState(),2),{documents:[
    {externalId:FIRST,connectionId:11},{externalId:SECOND,connectionId:22},
  ]});
  assert.deepEqual(linkedTickerDocuments(mixedMetaScalpState(),3),{documents:[
    {externalId:EXTRA,connectionId:33},
  ]});
  assert.equal(linkedTickerDocuments({},2),null,'unsupported inventory must be recognized');
  const malformed=mixedMetaScalpState();
  malformed.windows[0].tabs[0].documents[0].externalId='../../orders';
  assert.equal(linkedTickerDocuments(malformed,2).error,'METASCALP_UNBOUND_PANEL');
});

test('one click updates spot and futures books in 002 with their original connections',async()=>{
  const calls=[];
  const sender=new MetaScalpTickerSender(async(url,opts)=>{
    calls.push([url,opts]);
    if(url.endsWith('/ping')) return {ok:true,json:async()=>({app:'MetaScalp'})};
    if(url.endsWith('/api/ui/state')) return {ok:true,json:async()=>mixedMetaScalpState()};
    if(url.includes('/api/ui/documents/')) return {ok:true,json:async()=>({status:'ok'})};
    throw Error('Unexpected local endpoint '+url);
  });
  const cmd={symbol:'btcusdt',exchange:'binance',marketType:'futures',binding:'002'};
  const result=await sender.send(cmd);
  assert.deepEqual(result,{ok:true,port:17845,mode:'per-panel',panels:2});
  const writes=calls.filter(([url,opts])=>opts.method==='PUT');
  assert.deepEqual(writes.map(([url])=>url).sort(),[FIRST,SECOND]
    .map(id=>'http://127.0.0.1:17845/api/ui/documents/'+id+'/ticker').sort());
  for(const [,opts] of writes) {
    assert.deepEqual(JSON.parse(opts.body),{ticker:'BTCUSDT'});
    assert.equal(opts.method,'PUT');
  }
  assert.equal(calls.filter(([url])=>url.endsWith('/api/change-ticker')).length,0,
    'group-wide futures pattern must not be pushed into the spot book');
  assert.ok(calls.every(([url])=>url.startsWith('http://127.0.0.1:')));
  const again=await sender.send(cmd);
  assert.equal(again.duplicate,true);
  assert.equal(calls.filter(([url,opts])=>opts.method==='PUT').length,2);
});

test('mixed group includes charts and never changes other groups or empty documents',async()=>{
  const state=mixedMetaScalpState();
  state.standaloneCharts.push({externalId:'dddddddd-dddd-dddd-dddd-dddddddddddd',
    kind:'chart',linkNumber:2,connectionId:22,ticker:'ETHUSDT'});
  state.windows[0].tabs[0].documents.push({
    externalId:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    kind:'chart',linkNumber:3,connectionId:22,ticker:'SOLUSDT',
  });
  const docs=linkedTickerDocuments(state,2);
  assert.equal(docs.documents.length,3);
  assert.ok(docs.documents.some(d=>d.externalId==='dddddddd-dddd-dddd-dddd-dddddddddddd'));
  assert.ok(!docs.documents.some(d=>d.externalId===EXTRA));
});

test('mixed group reports partial delivery and does not mark it as successful',async()=>{
  const sender=new MetaScalpTickerSender(async(url)=>{
    if(url.endsWith('/ping'))return {ok:true,json:async()=>({app:'MetaScalp'})};
    if(url.endsWith('/api/ui/state'))return {ok:true,json:async()=>mixedMetaScalpState()};
    if(url.includes('/api/ui/documents/'))return {ok:!url.includes(SECOND),json:async()=>(
      url.includes(SECOND)?{error:'Document not found'}:{status:'ok'})};
    throw Error('Other endpoints must not be called');
  });
  const r=await sender.send({symbol:'BTCUSDT',exchange:'binance',marketType:'spot',binding:'002'});
  assert.deepEqual(r,{ok:false,reason:'METASCALP_PARTIAL',succeeded:1,total:2});
  assert.equal(sender.lastCommandKey,'','failed delivery must allow retry');
});

test('legacy MetaScalp without UI inventory keeps the existing named-group route',async()=>{
  const calls=[];
  const sender=new MetaScalpTickerSender(async(url,opts)=>{
    calls.push([url,opts]);
    if(url.endsWith('/ping'))return {ok:true,json:async()=>({app:'MetaScalp'})};
    if(url.endsWith('/api/ui/state'))return {ok:false,status:400,json:async()=>({error:'Not found'})};
    if(url.endsWith('/api/change-ticker'))return {ok:true,json:async()=>({status:'ok'})};
    throw Error('Unexpected '+url);
  });
  const r=await sender.send({symbol:'BTCUSDT',exchange:'binance',marketType:'futures',binding:'002'});
  assert.equal(r.ok,true);
  assert.equal(r.legacy,true);
  assert.deepEqual(JSON.parse(calls.at(-1)[1].body),
    {tickerPattern:'BINANCE:BTCUSDT.p',binding:'002'});
});
