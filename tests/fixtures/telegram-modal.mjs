import './offline-network.mjs';
import './offline-firebase.mjs';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
const window = dom.window;
for (const key of ['window', 'document', 'location', 'Element', 'Text', 'Node', 'NodeFilter', 'MutationObserver', 'HTMLElement', 'localStorage', 'navigator', 'Event', 'MouseEvent'])
  Object.defineProperty(globalThis, key, { value: key === 'window' ? window : window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const requests = [];
let connected = false;
window.fetch = async (input, options) => {
  const route = new URL(String(input), 'http://localhost/').pathname;
  requests.push({ route, token: new Headers(options?.headers).get('Authorization') });
  if (route === '/api/telegram/status') return Response.json({ success: true, isConfigured: connected, botUsername: 'HookFixtureBot' });
  if (route === '/api/telegram/connect') return Response.json({ success: true, url: 'https://t.me/HookFixtureBot?start=fixture_link', expiresAt: Date.now() + 600000 });
  if (route === '/api/telegram/test') return Response.json({ success: true });
  if (route === '/api/cron/status') return Response.json({ success: true, isHealthy: true, stats: { activeAlertsCount: 2 }, delivery: { pending: 1 } });
  if (route === '/api/alerts/sync') return Response.json({ success: true, alerts: [] });
  if (route === '/api/alerts/history') return Response.json({ success: true, history: [] });
  throw new Error(`Unexpected fixture request ${route}`);
};
const { installAuthenticatedFetch } = await import('../../src/utils/authenticatedFetch.ts');
installAuthenticatedFetch();
globalThis.fetch = (...args) => window.fetch(...args);
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { AuthProvider } = await import('../../src/context/AuthContext.tsx');
const { AlertsProvider } = await import('../../src/context/AlertsContext.tsx');
const { LanguageProvider } = await import('../../src/context/LanguageContext.tsx');
const { TelegramAlertsModal } = await import('../../src/components/TelegramAlertsModal.tsx');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let root;
const renderFor = async uid => {
  const user = { uid, email: `${uid}@fixture.test`, displayName: uid, isLocalUser: true };
  localStorage.setItem('signalhook_local_session', JSON.stringify({ user, profile: user, accessToken: `local.fixture-${uid}`, expiresAt: Date.now() + 3600000 }));
  root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(AuthProvider, {}, React.createElement(AlertsProvider, {},
      React.createElement(LanguageProvider, {}, React.createElement(TelegramAlertsModal, { isOpen: true, onClose() {} })))));
    await sleep(80);
  });
};
const button = label => [...document.querySelectorAll('button')].find(item => item.textContent.includes(label));
const click = async label => {
  assert.ok(button(label), `Missing control: ${label}`);
  await act(async () => { button(label).dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await sleep(30); });
};
try {
  await renderFor('alice');
  await click('Налаштування бота');
  assert.ok(document.body.textContent.includes('Telegram ще не підключено'));
  assert.equal(document.querySelector('input[type="password"]'), null, 'users never enter the site bot secret');
  await click('Підключити Telegram');
  const link = document.querySelector('a[href*="?start="]');
  assert.equal(link?.getAttribute('href'), 'https://t.me/HookFixtureBot?start=fixture_link');
  connected = true;
  await act(async () => { await sleep(4200); });
  assert.equal(document.querySelector('a[href*="?start="]'), null);
  await click('Надіслати тест');
  assert.ok(document.body.textContent.includes('Тестове сповіщення надіслано'));
  assert.ok(requests.every(request => request.token === 'Bearer local.fixture-alice'));
  await act(async () => { root.unmount(); });
  requests.length = 0; connected = false;
  await renderFor('bob'); await click('Налаштування бота');
  assert.ok(document.body.textContent.includes('Telegram ще не підключено'));
  assert.ok(requests.every(request => request.token === 'Bearer local.fixture-bob'));
  console.log('PASS: Telegram connection UI, polling and per-account authorization');
} finally {
  if (root) await act(async () => root.unmount());
  dom.window.close();
}
