import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import {
  createCoinGeckoHoldersService,
  getBaseTicker, parseCoinGeckoHolders, validateContract,
} from '../server/coingeckoHolders';

const ETH = '0x' + 'a'.repeat(40);
const OTHER = '0x' + 'b'.repeat(40);
const now = Date.UTC(2026, 10, 14, 12, 0, 0);
const response = (json: unknown, status = 200) =>
  new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
const holderPayload = (symbol = 'DEMO', address = ETH) => ({
  data: {
    type: 'token',
    attributes: {
      symbol, address,
      holders: {
        count: 1258,
        distribution_percentage: {
          top_10: '36.42', '11_30': '7.11', '31_50': '3.22', rest: '53.25',
        },
        last_updated: new Date(now - 50_000).toISOString(),
      },
    },
  },
});

test('free CoinGecko API resolves exchange pairs safely; addresses must be valid', () => {
  assert.equal(getBaseTicker('DEMOUSDT'), 'DEMO');
  assert.equal(getBaseTicker('DEMOBTC'), 'DEMO');
  assert.equal(getBaseTicker('SOLUSDT'), 'SOL');
  assert.equal(getBaseTicker('../TOKEN'), null);
  assert.equal(getBaseTicker(''), null);
  assert.deepEqual(validateContract({ network: 'eth', address: ETH }), {
    network: 'eth', address: ETH,
  });
  assert.equal(validateContract({ network: 'eth', address: 'malicious' }), null);
  assert.equal(validateContract({ network: 'https://evil.com', address: ETH }), null);
});

test('provider holder data is used without inventing wallet percentages', () => {
  const parsed = parseCoinGeckoHolders(holderPayload(), 'DEMOUSDT',
    {network: 'eth',address: ETH}, now);
  assert.equal(parsed.status, 'available');
  assert.equal(parsed.count, 1258);
  assert.equal(parsed.distribution?.top_10, 36.42);
  assert.equal(parsed.distribution?.['11_30'], 7.11);
  assert.equal(parsed.distribution?.['11_20'], undefined);
  assert.ok(parsed.lastUpdated?.startsWith('2026-11-14T'));
  assert.equal(parsed.network, 'eth');
  assert.equal(parsed.contractAddress, ETH);

  for (const bad of [
    holderPayload('WRONG', ETH),
    holderPayload('DEMO', OTHER),
    { data: { type:'token', attributes: { symbol:'DEMO', address:ETH, holders:{} } } },
  ]) {
    const value = parseCoinGeckoHolders(bad,'DEMOUSDT',{ network:'eth', address:ETH },now);
    assert.equal(value.status,'unavailable');
    assert.equal(value.count,null);
    assert.equal(value.distribution,null);
  }
  const malformed = holderPayload();
  malformed.data.attributes.holders.distribution_percentage.top_10 = '500';
  const badPct = parseCoinGeckoHolders(malformed,'DEMO',{network:'eth',address:ETH},now);
  assert.equal(badPct.distribution?.top_10,undefined);
});

test('one catalog call + one holder call shared by concurrent users, with 12h positive cache', async () => {
  const requests: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input); requests.push(url);
    if (url.includes('/coins/list?include_platform=true')) {
      return response([
        { id:'demo-token', symbol:'demo', platforms: { ethereum:ETH } },
        { id:'duplicate-a', symbol:'dupe', platforms: { ethereum:ETH } },
        { id:'duplicate-b', symbol:'dupe', platforms: { ethereum:OTHER } },
        { id:'multi', symbol:'multi', platforms: {ethereum:ETH, solana:'So11111111111111111111111111111111111111112'} },
        { id:'bitcoin', symbol:'btc', platforms: {} },
      ]);
    }
    if (url.includes('/onchain/networks/eth/tokens/' + ETH + '/info')) {
      return response(holderPayload());
    }
    throw new Error('Unexpected outbound request '+url);
  }) as typeof fetch;
  const service = createCoinGeckoHoldersService({
    apiKey:'test-demo-key', fetcher, now:()=>now,
  });
  const [a,b,c] = await Promise.all([
    service.get('DEMOUSDT'), service.get('DEMOUSDT'), service.get('DEMOUSDT'),
  ]);
  assert.equal(a.status,'available');
  assert.deepEqual(a,b);
  assert.deepEqual(a,c);
  assert.equal(requests.length,2);
  assert.equal((await service.get('DEMOUSDT')).count,1258);
  assert.equal(requests.length,2);
  const collision = await service.get('DUPEUSDT');
  assert.equal(collision.status,'ambiguous');
  assert.equal(collision.count,null);
  const multi = await service.get('MULTIUSDT');
  assert.equal(multi.status,'ambiguous');
  assert.equal((await service.get('BTCUSDT')).status,'native_unsupported');
  assert.equal(requests.length,2,'no token-info request for ambiguous or native symbols');
});

test('verified contract override works without requesting massive coin catalog', async () => {
  const requests: string[] = [];
  const service = createCoinGeckoHoldersService({
    apiKey:'test', tokenMap: {DEMO:{network:'eth',address:ETH}},
    now:()=>now,
    fetcher: (async (url: string | URL | Request) => {
      requests.push(String(url));
      return response(holderPayload());
    }) as typeof fetch,
  });
  assert.equal((await service.get('DEMOUSDT')).count,1258);
  assert.equal(requests.length,1);
  assert.ok(requests[0].includes('/onchain/networks/eth/tokens/'));
  assert.ok(!requests[0].includes('coins/list'));
});

test('native Bitcoin is not silently mapped to holders of wrapped tokens', async () => {
  const service = createCoinGeckoHoldersService({
    apiKey:'test-demo-key', now:()=>now,
    fetcher: (async () => { throw Error('Native coin must not call token-info API'); }) as typeof fetch,
  });
  const result = await service.get('BTCUSDT');
  assert.equal(result.status, 'native_unsupported');
  assert.equal(result.count, null);
  assert.equal(result.contractAddress, null);
  assert.match(result.detail, /нативна монета/);
});

test('verified official Chainlink contract resolves LINK holders without ambiguous ticker', async () => {
  const requested: string[] = [];
  const service = createCoinGeckoHoldersService({
    apiKey:'test-demo-key', now:()=>now,
    fetcher: (async (url: string | URL | Request) => {
      requested.push(String(url));
      return response(holderPayload('LINK', '0x514910771AF9Ca656af840dff83E8264EcF986CA'));
    }) as typeof fetch,
  });
  const result = await service.get('LINKUSDT');
  assert.equal(result.status, 'available');
  assert.equal(result.count, 1258);
  assert.equal(result.network, 'eth');
  assert.equal(requested.length, 1);
  assert.ok(requested[0].includes('/tokens/0x514910771AF9Ca656af840dff83E8264EcF986CA/info'));
});

test('missing key yields n/d and never calls external services', async () => {
  const service = createCoinGeckoHoldersService({
    fetcher: (async () => { throw Error('Should not call'); }) as typeof fetch,
    now:()=>now,
  });
  const result = await service.get('DEMOUSDT');
  assert.equal(result.status,'not_configured');
  assert.equal(result.count,null);
});

test('monthly free API quota persists across service restarts', async () => {
  const folder = mkdtempSync(join(tmpdir(),'coingecko-holder-test-'));
  try {
    const file = join(folder,'budget.json');
    const requests: string[] = [];
    const fetcher = (async (url: string | URL | Request) => {
      requests.push(String(url));
      return response(holderPayload());
    }) as typeof fetch;
    const options = {
      apiKey:'test', now:()=>now, storageFile:file, maxMonthlyCalls:1,
      tokenMap:{DEMO:{network:'eth',address:ETH}},fetcher,
    };
    const first = createCoinGeckoHoldersService(options);
    assert.equal((await first.get('DEMOUSDT')).status,'available');
    const second = createCoinGeckoHoldersService(options);
    assert.equal((await second.get('DEMOUSDT')).status,'rate_limited');
    assert.equal(requests.length,1);
    const persisted=JSON.parse(readFileSync(file,'utf8'));
    assert.equal(persisted.count,1);
  } finally {
    rmSync(folder,{ recursive:true,force:true });
  }
});

test('CoinGecko integration stays behind server route and does not touch HookChart', () => {
  const server = readFileSync(new URL('../server.ts',import.meta.url),'utf8');
  const view = readFileSync(new URL('../src/components/SmartAnalysisBlock.tsx',import.meta.url),'utf8');
  const demo = readFileSync(new URL('../server/coingeckoHolders.ts',import.meta.url),'utf8');
  assert.match(server, /app\.get\('\/api\/market\/holders'/);
  assert.match(view, /fetch\('\/api\/market\/holders\?symbol='/);
  assert.match(view, /holderTop10Display/);
  assert.match(view, /Кількість адрес-власників/);
  assert.match(view, /Джерело: CoinGecko/);
  assert.match(demo, /x-cg-demo-api-key/);
  assert.match(demo, /HOLDERS_TTL = 12 \* 60 \* 60_000/);
  assert.doesNotMatch(demo, /getJson\([^)]*(?:top_holders|holders_chart)/);
});
