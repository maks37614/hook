import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type WebSocket from 'ws';
import { ExchangeStreamPool } from '../server/exchangeStreamPool';

class Socket extends EventEmitter {
  readyState = 0; sent: any[] = [];
  constructor() { super(); setTimeout(() => { this.readyState = 1; this.emit('open'); }, 0); }
  send(value: string) { this.sent.push(JSON.parse(value)); }
  terminate() { this.readyState = 3; this.emit('close'); }
  message(value: unknown) { this.emit('message', Buffer.from(JSON.stringify(value))); }
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('different Binance symbols share a connection while raw and combined consumers receive their own format', async () => {
  const sockets: Socket[] = [];
  const pool = new ExchangeStreamPool(() => { const socket = new Socket(); sockets.push(socket); return socket as unknown as WebSocket; });
  try {
    const raw = pool.open('wss://fstream.binance.com/market/ws/btcusdt@aggTrade');
    const combined = pool.open('wss://fstream.binance.com/market/stream?streams=btcusdt@aggTrade');
    const other = pool.open('wss://fstream.binance.com/market/ws/ethusdt@ticker');
    const first: any[] = [], second: any[] = [], eth: any[] = [];
    raw.on('message', data => first.push(JSON.parse(data.toString()))); combined.on('message', data => second.push(JSON.parse(data.toString()))); other.on('message', data => eth.push(JSON.parse(data.toString())));
    await sleep(20); assert.equal(sockets.length, 1);
    sockets[0].message({ stream: 'btcusdt@aggTrade', data: { e: 'aggTrade', p: '100' } });
    assert.equal(first[0].p, '100'); assert.equal(second[0].data.p, '100'); assert.equal(eth.length, 0);
    sockets[0].message({ stream: 'ethusdt@ticker', data: { c: '10' } }); assert.equal(eth[0].c, '10'); assert.equal(first.length, 1);
  } finally { pool.stop(); }
});

test('1000 clients share a market connection and releasing one does not disconnect the others', async () => {
  const sockets: Socket[] = [];
  const pool = new ExchangeStreamPool(() => { const socket = new Socket(); sockets.push(socket); return socket as unknown as WebSocket; });
  try {
    const clients = Array.from({ length: 1000 }, () => pool.open('wss://fstream.binance.com/market/ws/btcusdt@aggTrade'));
    let received = 0; for (const client of clients) client.on('message', () => received++);
    await sleep(20); assert.equal(sockets.length, 1);
    clients[0].close(); sockets[0].message({ stream: 'btcusdt@aggTrade', data: { e: 'aggTrade', p: '100' } });
    assert.equal(received, 999); assert.equal(pool.stats().consumers, 999);
    clients.slice(1).forEach(client => client.close()); assert.equal(pool.stats().consumers, 0);
  } finally { pool.stop(); }
});

test('Bybit shares topics, reconstructs snapshots for late subscribers and isolates different symbols', async () => {
  let socket!: Socket;
  const pool = new ExchangeStreamPool(() => { socket = new Socket(); return socket as unknown as WebSocket; });
  const source = 'wss://stream.bybit.com/v5/public/linear';
  try {
    const first = pool.open(source), eth = pool.open(source);
    first.on('open', () => first.send('{"op":"subscribe","args":["orderbook.50.BTCUSDT"]}'));
    eth.on('open', () => eth.send('{"op":"subscribe","args":["publicTrade.ETHUSDT"]}'));
    let ethMessages = 0; eth.on('message', () => ethMessages++);
    await sleep(300);
    assert.equal(socket.sent.filter(item => item.op === 'subscribe').length, 1);
    socket.message({ topic: 'orderbook.50.BTCUSDT', type: 'snapshot', data: { u: 1, b: [['100', '2']], a: [['101', '3']] } });
    socket.message({ topic: 'orderbook.50.BTCUSDT', type: 'delta', data: { u: 2, b: [['100', '4']], a: [] } });
    assert.equal(ethMessages, 0);
    const late = pool.open(source); const messages: any[] = [];
    late.on('message', raw => messages.push(JSON.parse(raw.toString())));
    late.on('open', () => late.send('{"op":"subscribe","args":["orderbook.50.BTCUSDT"]}'));
    await sleep(20);
    assert.equal(messages[0].type, 'snapshot'); assert.deepEqual(messages[0].data.b, [['100', '4']]);
    assert.equal(socket.sent.filter(item => item.op === 'subscribe').length, 1);
    first.close(); await sleep(280); assert.equal(socket.sent.filter(item => item.op === 'unsubscribe').length, 0);
    late.close(); await sleep(280); assert.ok(socket.sent.some(item => item.op === 'unsubscribe' && item.args.includes('orderbook.50.BTCUSDT')));
    socket.message({ topic: 'publicTrade.ETHUSDT', data: [] }); assert.equal(ethMessages, 1);
  } finally { pool.stop(); }
});

test('1200 distinct Binance topics are sharded below venue limits and routed only to their instrument', async () => {
  const sockets: Socket[] = [], pool = new ExchangeStreamPool(() => { const socket = new Socket(); sockets.push(socket); return socket as unknown as WebSocket; });
  try {
    const clients = Array.from({ length: 1200 }, (_, n) => pool.open(`wss://fstream.binance.com/market/ws/coin${n}usdt@aggTrade`));
    let received = 0; clients.forEach(client => client.on('message', () => received++));
    await sleep(700); assert.equal(sockets.length, 3); assert.equal(pool.stats().topics, 1200);
    assert.ok(clients.every(client => client.entry.topics.size <= 400 && client.entry.topicChars < 18000));
    const last = clients.at(-1)!; (last.entry.socket as unknown as Socket).message({ stream: 'coin1199usdt@aggTrade', data: { e: 'aggTrade', s: 'COIN1199USDT', p: '2' } });
    assert.equal(received, 1); assert.equal(clients[0].topics.has('coin1199usdt@aggTrade'), false);
    clients.forEach(client => client.close()); assert.equal(pool.stats().topics, 0); assert.equal(pool.stats().consumers, 0);
  } finally { pool.stop(); }
});

test('Bybit reserves initial topics during a connection burst and bounds each subscription batch', async () => {
  const sockets: Socket[] = [], pool = new ExchangeStreamPool(() => { const socket = new Socket(); sockets.push(socket); return socket as unknown as WebSocket; });
  try {
    const clients = Array.from({ length: 450 }, (_, n) => pool.open('wss://stream.bybit.com/v5/public/spot', [`publicTrade.COIN${n}USDT`, `orderbook.1.COIN${n}USDT`]));
    let received = 0; clients.at(-1)!.on('message', () => received++);
    await sleep(850); assert.equal(sockets.length, 3); assert.equal(pool.stats().topics, 900);
    assert.ok(clients.every(client => client.entry.topics.size <= 400));
    (clients.at(-1)!.entry.socket as unknown as Socket).message({ topic: 'publicTrade.COIN449USDT', data: [] }); assert.equal(received, 1);
    assert.ok(sockets.flatMap(socket => socket.sent).every(command => command.args.length <= 10));
    clients.forEach(client => client.close()); assert.equal(pool.stats().topics, 0);
  } finally { pool.stop(); }
});

test('closing a connecting Bybit consumer releases its reserved topics before upstream opens', () => {
  const pool = new ExchangeStreamPool(() => new Socket() as unknown as WebSocket);
  try { const client = pool.open('wss://stream.bybit.com/v5/public/linear', ['publicTrade.SUSDT']); assert.equal(pool.stats().topics, 1); client.close(); assert.equal(pool.stats().topics, 0); }
  finally { pool.stop(); }
});
