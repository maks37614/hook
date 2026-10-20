import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const [mode, stateFile] = process.argv.slice(2);
assert.ok(['create', 'verify'].includes(mode) && stateFile, 'Usage: container-smoke.mjs create|verify state.json');
const origin = process.env.SMOKE_ORIGIN || 'http://127.0.0.1:19228';
async function request(path, token, body) {
  const response = await fetch(origin + path, {
    method: body ? 'POST' : 'GET',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, data: await response.json() };
}
const deadline = Date.now() + 90_000;
while (true) {
  try {
    const health = await request('/api/health');
    if (health.status === 200) {
      if (process.env.SMOKE_RELEASE) assert.equal(health.data.release, process.env.SMOKE_RELEASE);
      break;
    }
  } catch (error) { if (error.code === 'ERR_ASSERTION') throw error; }
  assert.ok(Date.now() < deadline, 'Production container did not become healthy');
  await delay(500);
}
if (process.env.SMOKE_RELEASE) {
  const dom = await request('/api/dom/status');
  assert.equal(dom.status, 200);
  assert.equal(dom.data.revision, process.env.SMOKE_RELEASE, 'Live DOM checks must identify the deployed VPS commit');
}
let state;
if (mode === 'create') {
  async function register() {
    const result = await request('/api/auth/local/register', null, {
      email: `container-${randomUUID()}@example.test`, password: randomUUID(), displayName: 'Container fixture',
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.success, true);
    assert.ok(result.data.accessToken.startsWith('local.'));
    return result.data;
  }
  const alice = await register(), bob = await register();
  const alertId = `container_${randomUUID()}`;
  const created = await request('/api/alerts', alice.accessToken, {
    id: alertId, userId: alice.user.uid, symbol: 'BTCUSDT', exchange: 'binance', marketType: 'spot',
    targetPrice: 100, condition: 'gte', isActive: false,
  });
  assert.equal(created.status, 200);
  assert.equal(created.data.success, true);
  assert.equal(created.data.alert.isActive, false, 'Smoke rule must never trigger real deliveries');
  state = { alice, bob, alertId };
  fs.writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
} else {
  state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
}
const { alice, bob, alertId } = state;
assert.equal((await request('/api/alerts')).status, 401);
const own = await request('/api/alerts', alice.accessToken);
assert.equal(own.status, 200);
assert.ok(own.data.alerts.some(alert => alert.id === alertId));
assert.equal((await request('/api/alerts', bob.accessToken)).data.alerts.length, 0);
assert.equal((await request(`/api/alerts?userId=${alice.user.uid}`, bob.accessToken)).status, 403);
const telegram = await request('/api/telegram/status', alice.accessToken);
assert.equal(telegram.status, 200);
assert.equal(telegram.data.isConfigured, false);
assert.equal(telegram.data.sharedBotAvailable, false, 'CI must not have a real bot token');
console.log(`PASS: production container ${mode}; persistent sessions and rules, account isolation, no real Telegram delivery.`);
