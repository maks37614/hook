import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createTestSession } from './fixtures/user-session';

test('HTTP tracking is explicit; deleting the last coin stays empty after refresh and restart',
  { skip: process.env.H00K_PG_INTEGRATION_TEST !== '1' }, async (t) => {
  const root = process.cwd();
  const session = await createTestSession();
  const fixture = fs.mkdtempSync(path.join(root, '.test-surveillance-api-'));
  fs.mkdirSync(path.join(fixture, 'server/data'), { recursive: true });
  const config = { timeframe: '4h', triggerModes: ['bar_close'], levelsEnabled: true, structureEnabled: true,
    momentumEnabled: true, momentumPct: 2.5, momentumBars: 3, momentumTf: '15m',
    channelEnabled: true, fibonacciEnabled: true, cooldownMinutes: 15 };
  const coin = (id: string, userId: string) => ({ id, userId, symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
    exchange: 'binance', marketType: 'futures', isActive: false, createdAt: '', updatedAt: '', config });
  fs.writeFileSync(path.join(fixture, 'server/data/surveillance.json'), JSON.stringify({
    guest: [coin('guest-btc', 'guest')], owner: [coin('owner-btc', 'owner')],
  }));
  let server: ChildProcess | null = null;
  let base = '';
  const stop = async () => {
    if (!server || server.exitCode !== null) return;
    const exited = once(server, 'exit');
    server.kill();
    await exited;
    server = null;
  };
  const start = async () => {
    const reservation = net.createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = (reservation.address() as net.AddressInfo).port;
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    let output = '';
    server = spawn(process.execPath, ['--import', 'tsx', '--import',
      path.join(root, 'tests/fixtures/offline-market.ts'), path.join(root, 'server.ts')], {
      cwd: fixture, env: { ...process.env, ...session.env, PORT: String(port), NODE_ENV: 'production', TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout!.on('data', data => { output = (output + data).slice(-8000); });
    server.stderr!.on('data', data => { output = (output + data).slice(-8000); });
    base = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(output);
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Server did not start: ${output}`);
  };
  const list = async (userId: string) => (await (await fetch(`${base}/api/surveillance?userId=${userId}`, { headers: session.headers(userId) })).json()).data;
  const post = (route: string, body: unknown) => fetch(`${base}${route}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...session.headers((body as any)?.userId || 'owner') }, body: JSON.stringify(body) });
  try {
    await start();
    await t.test('chart API preserves international symbols instead of truncating to the quote asset', async () => {
      for (const symbol of ['龙虾', '币安人生', '我踏马来了']) {
        const response = await fetch(`${base}/api/klines?symbol=${encodeURIComponent(`${symbol}/USDT`)}&limit=10`);
        assert.equal(response.status, 200);
        const history = await response.json();
        assert.equal(history.symbol, `${symbol}USDT`);
        assert.equal(history.success, true);
      }
    });
    const marketResponse = await fetch(`${base}/api/market/quotes?minVolume=0`);
    assert.equal(marketResponse.status, 503);
    const market = await marketResponse.json();
    assert.equal(market.success, false);
    assert.equal(market.timestamp, null);
    assert.equal(market.sources.length, 4);
    assert.ok(market.sources.every((source: any) => source.status === 'unavailable' && source.httpStatus === 503));
    const legacyMarket = await (await fetch(`${base}/api/screener/coins?minVolume=0`)).json();
    assert.deepEqual(legacyMarket, market, 'previously deployed clients retain the same API response');
    const selectedMarket = await (await fetch(`${base}/api/market/quotes?exchange=bybit&marketType=spot&minVolume=0`)).json();
    assert.deepEqual(selectedMarket.sources.map((source: any) => [source.exchange, source.marketType]), [['bybit', 'spot']]);
    for (const query of ['exchange=invalid', 'marketType=invalid', 'minVolume=NaN', 'minVolume=-1', 'minVolume=20&maxVolume=10']) {
      assert.equal((await fetch(`${base}/api/market/quotes?${query}`)).status, 400);
    }
    // Symbol search is account-protected and does not invent pairs when
    // the selected exchange's shared ticker catalog is offline.
    const symbolsUrl = `${base}/api/surveillance/symbols?exchange=binance&marketType=futures&q=BTC`;
    const offlineSymbols = await fetch(symbolsUrl, { headers: session.headers('owner') });
    assert.equal(offlineSymbols.status, 503);
    assert.deepEqual((await offlineSymbols.json()).data, []);
    const emptySymbols = await fetch(
      `${base}/api/surveillance/symbols?exchange=binance&marketType=futures&q=`,
      { headers: session.headers('owner') },
    );
    assert.equal(emptySymbols.status, 200);
    assert.deepEqual((await emptySymbols.json()).data, []);
    const wrongMarket = await fetch(
      `${base}/api/surveillance/symbols?exchange=not-an-exchange&marketType=futures&q=BTC`,
      { headers: session.headers('owner') },
    );
    assert.equal(wrongMarket.status, 400);
    assert.equal((await fetch(symbolsUrl)).status, 401);
    assert.deepEqual(await list('new-user'), []);
    const deleted = await fetch(`${base}/api/surveillance/owner-btc?userId=owner`, { method: 'DELETE', headers: session.headers('owner') });
    assert.equal(deleted.status, 200);
    assert.deepEqual(await list('owner'), []);
    assert.deepEqual(await list('owner'), []);
    assert.equal((await fetch(`${base}/api/surveillance?userId=guest`)).status, 401);
    assert.equal((await fetch(`${base}/api/surveillance?userId=owner`, { headers: session.headers('new-user') })).status, 403);
    // A bare ticker must not create a fake worker while exchange catalogs are offline.
    const bare = await post('/api/surveillance', { userId: 'owner', symbol: 'BTC', exchange: 'binance', marketType: 'futures' });
    assert.equal(bare.status, 503);
    assert.equal((await bare.json()).code, 'MARKET_UNAVAILABLE');
    assert.deepEqual(await list('owner'), []);
    const badQuote = await post('/api/surveillance', { userId: 'owner', symbol: 'BTCUSDC', exchange: 'binance', marketType: 'futures' });
    assert.equal(badQuote.status, 400);
    assert.equal((await badQuote.json()).code, 'UNSUPPORTED_QUOTE');
    assert.deepEqual(await list('owner'), []);

    const added = await post('/api/surveillance', { userId: 'owner', symbol: 'SOLUSDT', exchange: 'bybit', marketType: 'futures' });
    assert.equal(added.status, 200, 'saved coin creation keeps its existing HTTP contract');
    const addedBody = await added.json();
    assert.equal(addedBody.success, true);
    assert.equal(addedBody.coin.symbol, 'SOLUSDT');
    assert.equal(addedBody.coin.baseAsset, 'SOL');
    assert.equal(addedBody.coin.quoteAsset, 'USDT');
    assert.equal(addedBody.pending, true, 'offline candles cannot masquerade as completed analysis');
    assert.deepEqual((await list('owner')).map((c: any) => c.symbol), ['SOLUSDT']);
    const selected = (await list('owner'))[0];
    const manualCheck = await post(`/api/surveillance/${selected.id}/check`, { userId: 'owner' });
    assert.equal(manualCheck.status, 503, 'offline manual checks must report unavailable market data');
    assert.equal(manualCheck.headers.get('retry-after'), '10');
    assert.equal((await manualCheck.json()).success, false);
    const checkAll = await post('/api/surveillance/check-all', { userId: 'owner' });
    assert.equal(checkAll.status, 503, 'check-all must signal a retryable exchange-data failure');
    assert.equal(checkAll.headers.get('retry-after'), '10');
    assert.equal((await checkAll.json()).success, false);
    assert.deepEqual((await list('owner')).map((c: any) => c.symbol), ['SOLUSDT'],
      'failed analysis never removes or overwrites the saved coin');
    const workerUrl = `${base}/api/surveillance/worker/${selected.id}?userId=owner`;
    assert.equal((await fetch(workerUrl, { headers: session.headers('owner') })).status, 200);
    const configured = await fetch(`${base}/api/surveillance/${selected.id}`, { method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...session.headers('owner') },
      body: JSON.stringify({ userId: 'owner', config: { densityMode: 'MANUAL', manualDensityThresholdUsd: 123000 } }),
    });
    assert.equal(configured.status, 200);
    const workerState = await (await fetch(workerUrl, { headers: session.headers('owner') })).json();
    assert.equal(workerState.data.densityMode, 'MANUAL');
    assert.equal(workerState.data.densityThresholdUsd, 123000);
    assert.deepEqual(workerState.data.densities, [], 'an unavailable DOM cannot manufacture a wall at the requested sum');
    assert.equal((await fetch(`${base}/api/surveillance/${selected.id}?userId=owner`, { method: 'DELETE', headers: session.headers('new-user') })).status, 403);
    assert.equal((await list('owner')).length, 1);
    assert.equal((await fetch(`${base}/api/surveillance/${selected.id}?userId=owner`, { method: 'DELETE', headers: session.headers('owner') })).status, 200);
    assert.equal((await fetch(workerUrl, { headers: session.headers('owner') })).status, 404, 'deletion stops the live worker');
    assert.equal((await post('/api/surveillance', { userId: 'owner', symbol: '' })).status, 400);
    assert.equal((await post('/api/surveillance', { userId: 'owner', symbol: 'SOLUSDT', config: { manualDensityThresholdUsd: 0 } })).status, 400);
    assert.equal((await post('/api/surveillance/backtest', {})).status, 400);
    assert.equal((await post('/api/surveillance/backtest', { symbol: 'SOLUSDT', exchange: 'bybit', marketType: 'futures' })).status, 503);
    assert.equal((await post('/api/surveillance/backtest', { symbol: '龙虾USDT', exchange: 'binance', marketType: 'futures' })).status, 503);
    await stop();
    await start();
    assert.deepEqual(await list('owner'), []);
    assert.deepEqual(await list('new-user'), []);
  } finally {
    await stop();
    fs.rmSync(fixture, { recursive: true, force: true });
    await session.cleanup();
  }
});

