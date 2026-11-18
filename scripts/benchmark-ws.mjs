#!/usr/bin/env node
/**
 * Controlled synthetic HookChart WebSocket load check.
 * Run on localhost by default; live remote testing requires --allow-remote.
 * This does not place orders or send any exchange subscription messages.
 */
import WebSocket from 'ws';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}
const url = new URL(option('--url', 'ws://127.0.0.1:3000/api/hookchart/depth?exchange=binance&market=futures&symbol=BTCUSDT'));
const clients = Number(option('--clients', '20'));
const seconds = Number(option('--seconds', '20'));
const ramp = Number(option('--ramp', '5'));
const allowRemote = process.argv.includes('--allow-remote');
const local = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
if (!['ws:', 'wss:'].includes(url.protocol) || (!local && !allowRemote))
  throw new Error('Use a ws:// or wss:// URL. Remote targets require --allow-remote.');
if (!Number.isSafeInteger(clients) || clients < 1 || clients > 5000 ||
    !Number.isSafeInteger(seconds) || seconds < 5 || seconds > 300 ||
    !Number.isSafeInteger(ramp) || ramp < 1 || ramp > 100)
  throw new Error('Limits: --clients 1..5000, --seconds 5..300, --ramp 1..100 per second.');
const isDepth = url.pathname === '/api/hookchart/depth';
const isKline = url.pathname === '/api/hookchart/klines';
if (!isDepth && !isKline)
  throw new Error('Only read-only HookChart depth and Kline endpoints are supported.');
if (Math.ceil(clients / ramp) > seconds)
  process.stderr.write('Warning: not all requested clients can be launched within this duration.\n');

const results = {
  target: url.origin, clientsRequested: clients, durationSeconds: seconds, rampPerSecond: ramp,
  attempted: 0, opened: 0, rejected: 0, peakOpen: 0, messages: 0, livePackets: 0,
  errors: 0, closed: 0, finalActive: 0, klinePackets: 0, firstPacketLatencyMs: [],
};
const sockets = new Set();
let active = 0;
const start = Date.now();

function connect() {
  results.attempted++;
  const started = Date.now();
  const socket = new WebSocket(url.href, { handshakeTimeout: 5000, perMessageDeflate: false });
  sockets.add(socket);
  let counted = false, first = false;
  socket.on('open', () => {
    counted = true; active++; results.opened++; results.peakOpen = Math.max(active, results.peakOpen);
  });
  socket.on('message', raw => {
    results.messages++;
    if (!first) { first = true; results.firstPacketLatencyMs.push(Date.now() - started); }
    try {
      const packet = JSON.parse(raw.toString());
      if (isDepth && packet.status === 'LIVE' && packet.update) results.livePackets++;
      if (isKline && packet.type === 'kline' && packet.candle) results.klinePackets++;
    } catch { /* payload format is not a load-test assertion */ }
  });
  socket.on('error', () => { results.errors++; });
  socket.on('close', code => {
    if (counted) active--;
    if (code === 1013 || code === 1008) results.rejected++;
    results.closed++; sockets.delete(socket);
  });
}

const launch = () => {
  for (let i = 0; i < ramp && results.attempted < clients; i++) connect();
};
launch();
const launcher = setInterval(launch, 1000);
await new Promise(resolve => setTimeout(resolve, seconds * 1000));
clearInterval(launcher);
for (const socket of sockets) socket.close();
await new Promise(resolve => setTimeout(resolve, 1500));
for (const socket of sockets) socket.terminate();
results.finalActive = active;
const latencies = results.firstPacketLatencyMs;
results.averageFirstPacketMs = latencies.length
  ? Math.round(latencies.reduce((sum, v) => sum + v, 0) / latencies.length) : null;
results.elapsedSeconds = Math.round((Date.now() - start) / 100) / 10;
delete results.firstPacketLatencyMs;
console.log(JSON.stringify(results, null, 2));
if (results.errors || results.rejected) process.exitCode = 1;
