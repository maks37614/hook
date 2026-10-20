import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
const state = globalThis.__alertsFixture = {
  auth: { user: { uid: 'alice' }, profile: { uid: 'alice' } },
  listeners: new Map(), writes: [], deletes: [],
};
const legacy = { id: 'ownerless-old-cache', symbol: 'ETHUSDT', targetPrice: 100, isActive: true };
localStorage.setItem('signalhook_local_alerts', JSON.stringify([legacy]));
const intervals = new Map();
let timerId = 0;
globalThis.setInterval = callback => { const id = ++timerId; intervals.set(id, callback); return id; };
globalThis.clearInterval = id => intervals.delete(id);
const requests = [];
let rejectDelete = false;
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url === '/api/alerts/sync') return new Promise(resolve => {
    requests.push({ body: JSON.parse(options.body), resolve, settled: false });
  });
  if (url.startsWith('/api/alerts/history?')) return Response.json({ success: true, history: [] });
  if (options.method === 'DELETE' && url.startsWith('/api/alerts/')) {
    return rejectDelete ? Response.json({ success: false, error: 'Fixture deletion failed' }, { status: 503 })
      : Response.json({ success: true });
  }
  if (url === '/api/alerts' && options.method === 'POST') return Response.json({ success: true, alert: JSON.parse(options.body) });
  throw new Error(`Unexpected network request: ${url}`);
};

const { AlertsProvider, useAlerts } = await import('../../src/context/AlertsContext.tsx');
let api;
function Probe() { api = useAlerts(); return React.createElement('div', null, api.alerts.map(a => a.id).join(',')); }
const root = createRoot(document.getElementById('root'));
const render = () => root.render(React.createElement(AlertsProvider, null, React.createElement(Probe)));
const makeAlert = (id, userId) => ({ id, userId, symbol: 'BTCUSDT', exchange: 'binance', marketType: 'futures',
  targetPrice: 110, condition: 'gte', createdAt: 1, isActive: true, triggered: false });
const emit = (uid, alerts) => state.listeners.get(`users/${uid}/alerts`)({
  forEach: visit => alerts.forEach(alert => visit({ data: () => alert })),
});
const answer = (request, alerts) => { request.settled = true; request.resolve(Response.json({ success: true, alerts })); };
const poll = () => { void [...intervals.values()].at(-1)(); };

try {
  await act(async () => { render(); });
  assert.equal(state.writes.length, 0, 'sign-in must not import the global ownerless cache');
  const aliceAlert = makeAlert('alice-manual', 'alice');
  await act(async () => { emit('alice', [aliceAlert]); });
  await act(async () => { answer(requests.at(-1), [aliceAlert]); });
  assert.equal(api.alerts.length, 1);

  await act(async () => { poll(); });
  const stalePoll = requests.at(-1);
  await act(async () => { await api.deleteAlert(aliceAlert.id); });
  assert.equal(api.alerts.length, 0);
  await act(async () => { answer(stalePoll, [aliceAlert]); });
  assert.equal(api.alerts.length, 0, 'a delayed poll must not recreate a deleted row');
  assert.equal(state.writes.length, 0, 'a delayed poll must not restore its Firestore document');

  await act(async () => { emit('alice', [aliceAlert]); });
  assert.deepEqual(requests.at(-1).body.alerts, [], 'cached deleted records must not be sent back to the server');
  await act(async () => { answer(requests.at(-1), []); });
  assert.equal(api.alerts.length, 0);
  assert.ok(state.deletes.includes('users/alice/alerts/alice-manual'));

  const kept = makeAlert('still-active', 'alice');
  await act(async () => { emit('alice', [kept]); });
  await act(async () => { answer(requests.at(-1), [kept]); });
  rejectDelete = true;
  await act(async () => { await assert.rejects(api.deleteAlert(kept.id), /Fixture deletion failed/); });
  assert.deepEqual(api.alerts.map(a => a.id), [kept.id], 'failed deletion stays visible instead of silently returning later');
  rejectDelete = false;

  await act(async () => { emit('alice', [kept]); });
  const oldAccountResponse = requests.at(-1);
  state.auth = { user: { uid: 'bob' }, profile: { uid: 'alice', telegramChatId: 'old-profile' } };
  await act(async () => { render(); });
  assert.equal(api.alerts.length, 0);
  await act(async () => { poll(); });
  const firstBobSync = requests.at(-1);
  assert.equal(firstBobSync.body.userId, 'bob');
  assert.deepEqual(firstBobSync.body.alerts, []);
  assert.equal(firstBobSync.body.telegramChatId, undefined, 'a still-loading profile must not copy the previous account credentials');
  await act(async () => { answer(firstBobSync, []); answer(oldAccountResponse, [kept]); });
  assert.equal(api.alerts.length, 0);
  const bobAlert = makeAlert('bob-manual', 'bob');
  await act(async () => { emit('bob', [bobAlert]); });
  await act(async () => { answer(requests.at(-1), [bobAlert]); });
  assert.deepEqual(api.alerts.map(a => a.id), [bobAlert.id]);

  state.auth.profile = { uid: 'bob' };
  await act(async () => { render(); });
  await act(async () => { await api.addAlert({ symbol: 'SOLUSDT', exchange: 'binance', marketType: 'spot', targetPrice: 10, condition: 'gte' }); });
  assert.equal(state.writes.length, 1, 'only the explicit create action writes a new alert');
  assert.ok(state.writes[0].ref.startsWith('users/bob/alerts/'));
  assert.notEqual(state.writes[0].value.id, legacy.id);
  console.log('PASS: alert deletion, delayed sync, account changes, ownerless cache and manual creation remain isolated.');
} finally {
  await act(async () => { root.unmount(); });
  dom.window.close();
}
