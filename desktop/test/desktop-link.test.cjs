'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const { normalizeCommand, MetaScalpTickerSender, DesktopTickerRelayClient }=require('../desktop-link-client.cjs');

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
