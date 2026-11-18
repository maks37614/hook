import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import WebSocket from 'ws';
import { installLiquidationStream, liquidationFeed } from '../server/liquidationFeed';

test('multi-Liq endpoint accepts several markets over ONE browser socket', async t => {
  const added: string[] = [], removed: string[] = [];
  t.mock.method(liquidationFeed, 'startPersistence', () => {});
  t.mock.method(liquidationFeed, 'addBulkClient', (client: WebSocket, ex: string, symbol: string, live = false) => {
    added.push(ex + ':' + symbol + (live ? ':live' : ''));
    client.send(JSON.stringify({ type:'snapshot',exchange:ex,symbol,events:[],connected:true }));
    return true;
  });
  t.mock.method(liquidationFeed, 'removeBulkClient', (_client: WebSocket, ex: string, symbol: string) => {
    removed.push(ex + ':' + symbol);
  });
  const server = http.createServer();
  installLiquidationStream(server);
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const port = (server.address() as { port: number }).port;
  const ws = new WebSocket('ws://127.0.0.1:' + port + '/api/hookchart/liquidations-multi');
  await new Promise<void>((resolve,reject) => { ws.once('open',resolve);ws.once('error',reject); });
  const snapshots: string[]=[];
  ws.on('message', buf => {
    const msg=JSON.parse(buf.toString());
    if (msg.type==='snapshot') snapshots.push(msg.exchange+':'+msg.symbol);
  });
  ws.send(JSON.stringify({type:'subscribe',exchange:'binance',symbol:'BTCUSDT'}));
  ws.send(JSON.stringify({type:'subscribe',exchange:'bybit',symbol:'ETHUSDT',live:true}));
  ws.send(JSON.stringify({type:'subscribe',exchange:'bybit',symbol:'ETHUSDT',live:true}));
  await new Promise(resolve => setTimeout(resolve,80));
  assert.deepEqual(added,['binance:BTCUSDT','bybit:ETHUSDT:live']);
  assert.deepEqual(snapshots,['binance:BTCUSDT','bybit:ETHUSDT']);
  ws.send(JSON.stringify({type:'unsubscribe',exchange:'binance',symbol:'BTCUSDT'}));
  await new Promise(resolve => setTimeout(resolve,30));
  assert.deepEqual(removed,['binance:BTCUSDT']);
  ws.close();
  await new Promise(resolve => ws.once('close',resolve));
  assert.deepEqual(removed,['binance:BTCUSDT','bybit:ETHUSDT']);
});

test('multi-Liq endpoint rejects invalid subscribe messages without affecting legacy route', async t => {
  t.mock.method(liquidationFeed,'startPersistence',()=>{});
  const server=http.createServer();
  installLiquidationStream(server);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  const port=(server.address() as {port:number}).port;
  const ws=new WebSocket('ws://127.0.0.1:'+port+'/api/hookchart/liquidations-multi');
  await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  ws.send(JSON.stringify({type:'subscribe',exchange:'binance',symbol:'BTC/USDT'}));
  const code=await new Promise<number>(resolve=>ws.once('close',resolve));
  assert.equal(code,1008);
});
