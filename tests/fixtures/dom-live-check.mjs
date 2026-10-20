import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import WebSocket from 'ws';

const SITE_URL = process.env.SITE_URL || 'https://h00k.top';
const LIVE_CHECK_TOKEN = process.env.LIVE_CHECK_TOKEN;
if (!LIVE_CHECK_TOKEN) throw new Error('Set LIVE_CHECK_TOKEN to a registered monitoring account token; application data is private.');
const siteHeaders = url => new URL(url).origin === new URL(SITE_URL).origin ? { Authorization: `Bearer ${LIVE_CHECK_TOKEN}` } : {};
const venueCases = [
  { exchange: 'binance', marketType: 'spot', symbol: 'BTCUSDT',
    direct: 'https://data-api.binance.vision/api/v3/depth?symbol=BTCUSDT&limit=100' },
  { exchange: 'bybit', marketType: 'futures', symbol: 'BTCUSDT',
    direct: ['https://api.bybit.com/v5/market/orderbook?category=linear&symbol=BTCUSDT&limit=200',
             'https://api.bytick.com/v5/market/orderbook?category=linear&symbol=BTCUSDT&limit=200'] },
];

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json', ...siteHeaders(url) } });
  if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
  return response.json();
}

async function bybitWebSocketSnapshot(symbol) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket('wss://stream.bybit.com/v5/public/linear', {
      handshakeTimeout: 8500,
    });
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      // A connection denied during handshake may emit another asynchronous error.
      socket.on('error', () => {});
      if (socket.readyState === WebSocket.OPEN) socket.close();
      else socket.terminate();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('Bybit public WebSocket snapshot timeout')), 12000);
    socket.on('open', () => socket.send(JSON.stringify({
      op: 'subscribe', args: [`orderbook.50.${symbol}`],
    })));
    socket.on('message', raw => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.topic === `orderbook.50.${symbol}` && msg.type === 'snapshot' &&
            Array.isArray(msg.data?.b) && Array.isArray(msg.data?.a)) {
          finish(null, { retCode: 0, result: { b: msg.data.b, a: msg.data.a } });
        }
      } catch {}
    });
    socket.on('error', finish);
    socket.on('close', () => finish(new Error('Bybit public WebSocket closed without orderbook')));
  });
}

const sortedBook = (levels, descending) => levels
  .map(([p, q]) => [Number(p), Number(q)])
  .filter(([p, q]) => Number.isFinite(p) && p > 0 && Number.isFinite(q) && q > 0)
  .sort((a, b) => descending ? b[0] - a[0] : a[0] - b[0]);

async function verifyVenue(config) {
  const common = new URLSearchParams({
    symbol: config.symbol, exchange: config.exchange, marketType: config.marketType, limit: '100',
  });
  const siteSnapshot = await getJson(`${SITE_URL}/api/orderbook?${common}`);
  assert.equal(siteSnapshot.success, true);
  let direct;
  let lastExchangeError = '';
  for (const endpoint of Array.isArray(config.direct) ? config.direct : [config.direct]) {
    try {
      direct = await getJson(endpoint);
      if (config.exchange === 'bybit' && direct.retCode !== 0) {
        throw new Error(`Bybit API code ${direct.retCode}`);
      }
      break;
    } catch (err) {
      lastExchangeError = String(err);
    }
  }
  if (!direct && config.exchange === 'bybit') {
    try {
      direct = await bybitWebSocketSnapshot(config.symbol);
      console.log('INFO: Bybit direct REST restricted; verified against independent public orderbook WebSocket.');
    } catch (err) {
      lastExchangeError += `; WebSocket: ${String(err)}`;
    }
  }
  if (!direct) throw new Error(`Direct ${config.exchange} market is inaccessible: ${lastExchangeError}`);
  const reference = config.exchange === 'bybit' ? direct.result : direct;
  assert.ok(reference && Array.isArray(reference.bids || reference.b) && Array.isArray(reference.asks || reference.a),
    'Independent exchange returned actual book levels');
  const originalBids = sortedBook(reference.bids || reference.b, true);
  const originalAsks = sortedBook(reference.asks || reference.a, false);
  const appBids = sortedBook(siteSnapshot.bids, true);
  const appAsks = sortedBook(siteSnapshot.asks, false);
  assert.ok(appBids.length >= 10 && appAsks.length >= 10, 'Site snapshot has real orderbook depth');
  const tick = await getJson(`${SITE_URL}/api/dom/tick-size?${common}`);
  assert.ok(tick.success && Number(tick.tickSize) > 0, 'Site returns real exchange tick metadata');

  // Independent queries are non-atomic; compare with a time-drift tolerance.
  const maxDifference = Math.max(tick.tickSize * 30, originalBids[0][0] * 0.002);
  assert.ok(Math.abs(appBids[0][0] - originalBids[0][0]) <= maxDifference,
    `${config.exchange} best bid diverged from independent direct exchange feed`);
  assert.ok(Math.abs(appAsks[0][0] - originalAsks[0][0]) <= maxDifference,
    `${config.exchange} best ask diverged from independent direct exchange feed`);
  assert.ok(appBids[0][0] < appAsks[0][0], 'Bid below ask');

  let matchingPriceLevels = 0;
  let matchingNotionals = 0;
  for (const [app, ref] of [[appBids, originalBids], [appAsks, originalAsks]]) {
    const directByPrice = new Map(ref.map(([p,q]) => [p,q]));
    for (const [price, qty] of app.slice(5, 80)) {
      const compareQty = directByPrice.get(price);
      if (compareQty === undefined) continue;
      matchingPriceLevels++;
      const dollarAmount = price * qty;
      const directDollarAmount = price * compareQty;
      assert.ok(Number.isFinite(dollarAmount) && dollarAmount > 0);
      // Quantities change between separate snapshots; check order-of-magnitude, not equality.
      if (Math.abs(dollarAmount - directDollarAmount) / Math.max(1, directDollarAmount) < 0.85) matchingNotionals++;
    }
  }
  assert.ok(matchingPriceLevels >= 5, `${config.exchange} level mapping does not match independent market depth`);
  assert.ok(matchingNotionals >= 2, `${config.exchange} dollar order quantities differ materially from exchange depth`);
  console.log(`PASS: ${config.exchange} ${config.marketType} independent market depth: bid=${appBids[0][0]}, ask=${appAsks[0][0]}, matches=${matchingPriceLevels}, sizeMatches=${matchingNotionals}`);
}

async function browserVerify(server, browser, config) {
  const page = await browser.newPage({ viewport: { width: 940, height: 950 } });
  await page.addInitScript(() => {
    // Freeze only venue sockets. The widget must paint real REST snapshots from
    // the deployed server without nondeterministic trades changing its rows.
    const RealWS = window.WebSocket;
    window.WebSocket = function(url, protocols) {
      if (/^wss:\/\/(stream\.bybit|fstream\.binance|stream\.binance)/.test(String(url))) {
        return { readyState: 0, send() {}, close() {}, onmessage: null, onopen: null, onclose: null, onerror: null };
      }
      return new RealWS(url, protocols);
    };
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const appSnapshots = [];
  page.on('response', async response => {
    if (response.url().includes('/api/orderbook?') && response.ok()) {
      try { const data = await response.json(); if (data.success) appSnapshots.push(data); } catch {}
    }
  });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(`${origin}/tests/fixtures/dom-live-browser.html?exchange=${config.exchange}&marketType=${config.marketType}`);
  await page.locator('[data-dom-side="bid"]').first().waitFor({ timeout: 25000 });
  await page.locator('[data-dom-side="ask"]').first().waitFor({ timeout: 25000 });
  assert.ok(appSnapshots.length > 0, 'Browser received live orderbook snapshot from deployed API');

  const displayed = async side => page.locator(`[data-dom-side="${side}"]`).evaluateAll(nodes =>
    nodes.map(node => ({
      price: Number(node.getAttribute('data-dom-price')),
      volume: Number(node.getAttribute('data-dom-volume-usd')),
      text: node.textContent,
    })));
  const original = appSnapshots.at(-1);
  const expectedVolume = side => original[side].reduce((sum, [p, q]) => sum + Number(p) * Number(q), 0);
  const x1Asks = await displayed('ask');
  const x1Bids = await displayed('bid');
  for (const [side, rows] of [['bids', x1Bids], ['asks', x1Asks]]) {
    assert.ok(rows.length >= 10, 'DOM paints real depth rows');
    const total = rows.reduce((sum, row) => sum + row.volume, 0);
    assert.ok(Math.abs(total - expectedVolume(side)) / expectedVolume(side) < 1e-7,
      `${config.exchange}: x1 DOM notional differs from fetched real exchange quantities`);
    assert.ok(rows.every(row => row.text && row.text.length > 0 && Number.isFinite(row.volume)));
  }

  await page.locator('button[title^="Рівень зжаття стакану"]').click();
  await page.getByRole('button', { name: 'x10', exact: true }).last().click();
  await page.waitForTimeout(300);
  for (const [side, rows] of [['bids', await displayed('bid')], ['asks', await displayed('ask')]]) {
    const total = rows.reduce((sum, row) => sum + row.volume, 0);
    assert.ok(Math.abs(total - expectedVolume(side)) / expectedVolume(side) < 1e-7,
      `${config.exchange}: x10 DOM lost or duplicated exchange USD amounts`);
  }
  assert.deepEqual(errors, [], 'No browser runtime errors during live DOM rendering');
  console.log(`PASS: ${config.exchange} DOM React component in Chrome displays exact live REST sums at x1 and x10`);
  await page.close();
}

const siteReady = async () => {
  for (let i = 0; i < 36; i++) {
    try {
      const response = await getJson(`${SITE_URL}/api/dom/status`);
      if (response.success && (!process.env.GITHUB_SHA || response.revision === process.env.GITHUB_SHA)) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error('Production site did not become ready with DOM instrument metadata');
};

await siteReady();
let server, browser;
let validatedVenues = 0;
try {
  server = await createServer({
    configFile: false, plugins: [
      react(), tailwindcss(),
      { name: 'dom-live-api-proxy', configureServer(vite) {
        vite.middlewares.use('/api', async (req, res) => {
          try {
            const target = new URL(`/api${req.url}`, SITE_URL);
            const remote = await fetch(target, { signal: AbortSignal.timeout(12000), headers: siteHeaders(target) });
            res.statusCode = remote.status;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(await remote.text());
          } catch (e) {
            res.statusCode = 503;
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      } },
    ],
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox'] });
  for (const config of venueCases) {
    try {
      await verifyVenue(config);
      await browserVerify(server, browser, config);
      validatedVenues++;
    } catch (e) {
      console.error(`FAILED ${config.exchange} ${config.marketType}: ${e.stack || e}`);
    }
  }
} finally {
  await browser?.close();
  await server?.close();
}
if (validatedVenues !== venueCases.length) {
  throw new Error(`Only ${validatedVenues}/${venueCases.length} independent exchange + DOM checks passed; inspect API access and market values`);
}
console.log('PASS: live DOM exchange reconciliation completed for Binance and Bybit.');
