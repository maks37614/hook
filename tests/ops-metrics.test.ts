import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installOpsMetrics } from '../server/opsMetrics';

test('operator metrics are disabled without a strong token and never publicly exposed', async () => {
  const previous = process.env.H00K_OPS_TOKEN;
  const app = express();
  installOpsMetrics(app, () => ({
    activeMarkets: 2, clients: 5, sentPackets: 30, sentBytes: 14400, slowConsumers: 0,
  }), () => ({
    activeMarkets: 1, clients: 2, upstreamSockets: 1,
    accepted: 2, rejected: 0, reconnects: 0, failures: 0, sent: 6,
    sentBytes: 1200, upstreamCandles: 3, slowConsumers: 0,
  }));
  const server = app.listen(0, '127.0.0.1');
  try {
    // Node's listen() becomes active on the next tick.
    await new Promise<void>((resolve, reject) => {
      if (server.listening) resolve();
      else { server.once('listening', resolve); server.once('error', reject); }
    });
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    const url = `http://127.0.0.1:${addr.port}/api/ops/market-data`;
    delete process.env.H00K_OPS_TOKEN;
    assert.equal((await fetch(url)).status, 404);
    process.env.H00K_OPS_TOKEN = 'too-short';
    assert.equal((await fetch(url, { headers: { Authorization: 'Bearer too-short' } })).status, 404);

    process.env.H00K_OPS_TOKEN = 'c'.repeat(64);
    assert.equal((await fetch(url, { headers: { Authorization: 'Bearer invalid' } })).status, 404);
    const response = await fetch(url, { headers: { Authorization: 'Bearer ' + process.env.H00K_OPS_TOKEN } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const json = await response.json();
    assert.equal(json.hookChartDepth.clients, 5);
    assert.equal(json.hookChartDepth.sentPackets, 30);
    assert.equal(json.hookChartDepth.sentBytes, 14400);
    assert.equal(json.hookChartKlineRelay.sentBytes, 1200);
    assert.equal(json.hookChartKlineRelay.upstreamCandles, 3);
    assert.ok(Array.isArray(json.exchangeHttp));
    assert.ok(Array.isArray(json.publicPriceWebSockets));
    assert.ok(Array.isArray(json.cronJobs));
    assert.ok(json.cronJobs.some((job: { id: string }) => job.id === 'screener_patterns'));
    assert.ok(typeof json.activeSurveillanceWorkers === 'number');
    assert.ok(typeof json.processPerformance.intervalMs === 'number');
    assert.ok(typeof json.memory.rssBytes === 'number');
    assert.ok(!JSON.stringify(json).includes(process.env.H00K_OPS_TOKEN));
  } finally {
    if (previous === undefined) delete process.env.H00K_OPS_TOKEN;
    else process.env.H00K_OPS_TOKEN = previous;
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});
