import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  DEFAULT_METASCALP_SETTINGS,
  findActiveMetaScalpPort,
  getStoredMetaScalpSettings,
  getUserMetaScalpSettings,
  pingMetaScalpPort,
  saveStoredMetaScalpSettings,
  sendTickerToMetaScalp,
  linkedMetaScalpPanels,
} from '../src/utils/metaScalpService';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});

function mockApi(t: TestContext, handler: (url: URL, options: RequestInit) => Response | Promise<Response>) {
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, options: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    return handler(url, options);
  });
}

function installGlobal(t: TestContext, name: string, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  });
}

function mockClipboard(t: TestContext) {
  const copied: string[] = [];
  installGlobal(t, 'navigator', { clipboard: { writeText: async (text: string) => { copied.push(text); } } });
  return copied;
}

function mockStorage(t: TestContext) {
  const data = new Map<string, string>();
  installGlobal(t, 'localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  });
  return data;
}

test('discovery accepts only a successful JSON response identifying MetaScalp', async (t) => {
  const cases = [
    { response: () => json({ app: 'MetaScalp', version: '0.0.9' }), expected: true },
    { response: () => json({ app: 'MetaScalp' }, 404), expected: false },
    { response: () => json({ app: 'MetaScalp' }, 500), expected: false },
    { response: () => json({ app: 'AnotherApp' }), expected: false },
    { response: () => json(null), expected: false },
    { response: () => new Response('<html>Not MetaScalp</html>'), expected: false },
  ];
  let current = cases[0];
  mockApi(t, () => current.response());
  for (current of cases) assert.equal(await pingMetaScalpPort(17845), current.expected);
});

test('unresponsive discovery requests abort instead of waiting indefinitely', async (t) => {
  mockApi(t, (_url, options) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
  }));
  assert.equal(await pingMetaScalpPort(17845, 5), false);
});

test('sending reaches every supported discovery port and never posts to another application', async (t) => {
  let activePort = 17845;
  const posts: number[] = [];
  mockApi(t, (url, options) => {
    const port = Number(url.port);
    if (options.method === 'POST') {
      posts.push(port);
      assert.equal(port, activePort);
      assert.equal(url.pathname, '/api/change-ticker');
      assert.deepEqual(JSON.parse(String(options.body)), { tickerPattern: 'BINANCE:BTCUSDT.p', binding: '001' });
      return json({ status: 'ok' });
    }
    if (url.pathname === '/api/ui/state') return json({error:'Not found'}, 400);
    assert.equal(url.pathname, '/ping');
    return port === activePort ? json({ app: 'MetaScalp' }) : json({ app: 'AnotherApp' });
  });
  for (activePort = 17845; activePort <= 17855; activePort++) {
    const result = await sendTickerToMetaScalp('BTCUSDT', 'binance', 'futures');
    assert.equal(result.success, true, `port ${activePort}`);
    assert.equal(result.portUsed, activePort);
  }
  assert.deepEqual(posts, Array.from({ length: 11 }, (_, index) => 17845 + index));
});

test('commands use the official tickerPattern format for each exchange and market', async (t) => {
  let expected = '';
  mockApi(t, (_url, options) => {
    if (options.method !== 'POST') return json({ app: 'MetaScalp' });
    assert.equal(options.headers && (options.headers as Record<string, string>)['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(String(options.body)), { tickerPattern: expected, binding: '500' });
    return json({ status: 'ok' });
  });
  for (const exchange of ['binance', 'bybit'] as const) {
    for (const market of ['spot', 'futures'] as const) {
      expected = `${exchange.toUpperCase()}:ETHUSDT${market === 'futures' ? '.p' : ''}`;
      const result = await sendTickerToMetaScalp('ethusdt', exchange, market, { binding: '500' });
      assert.equal(result.success, true);
      assert.equal(result.ticker, expected);
    }
  }
});

test('multiple running terminals honor the user preferred port', async (t) => {
  const requests: number[] = [];
  mockApi(t, (url, options) => {
    requests.push(Number(url.port));
    return json(options.method === 'POST' ? { status: 'ok' } : { app: 'MetaScalp' });
  });
  const result = await sendTickerToMetaScalp('BTCUSDT', 'bybit', 'spot', { port: 17853, binding: '321' });
  assert.equal(result.portUsed, 17853);
  assert.deepEqual(requests, [17853, 17853, 17853]); // ping, UI inventory, change-ticker
});

test('invalid preferred ports fall back to the supported range', async (t) => {
  const requested: string[] = [];
  mockApi(t, (url) => { requested.push(url.href); return json({ app: 'MetaScalp' }); });
  for (const port of [NaN, -1, 0, 65536, 17845.5]) assert.equal(await findActiveMetaScalpPort(port), 17845);
  assert.ok(requested.every((url) => url === 'http://127.0.0.1:17845/ping'));
});

test('terminal errors are shown without switching an unrelated terminal', async (t) => {
  const copied = mockClipboard(t);
  const posts: number[] = [];
  mockApi(t, (url, options) => {
    if (options.method !== 'POST') return json({ app: 'MetaScalp' });
    posts.push(Number(url.port));
    return json({ error: "Binding '321' not found" }, 400);
  });
  const result = await sendTickerToMetaScalp('BTCUSDT', 'binance', 'futures', { port: 17853, binding: '321' });
  assert.equal(result.success, false);
  assert.match(result.message, /Binding '321' not found/);
  assert.deepEqual(posts, [17853]);
  assert.equal(result.copiedToClipboard, true);
  assert.deepEqual(copied, ['BINANCE:BTCUSDT.p']);
});

test('a successful HTTP status without the terminal acknowledgement is not success', async (t) => {
  mockClipboard(t);
  mockApi(t, (_url, options) => json(options.method === 'POST' ? { error: 'Rejected' } : { app: 'MetaScalp' }));
  assert.equal((await sendTickerToMetaScalp('BTCUSDT', 'binance', 'spot')).success, false);
});

test('no terminal means no command and a clipboard fallback with connection guidance', async (t) => {
  const copied = mockClipboard(t);
  const ports: number[] = [];
  mockApi(t, (url, options) => {
    assert.equal(options.method, 'GET');
    ports.push(Number(url.port));
    return json({}, 404);
  });
  const result = await sendTickerToMetaScalp('ETHUSDT', 'bybit', 'futures');
  assert.equal(result.success, false);
  assert.match(result.message, /локальної мережі/);
  assert.deepEqual(ports, Array.from({ length: 11 }, (_, index) => 17845 + index));
  assert.deepEqual(copied, ['BYBIT:ETHUSDT.p']);
});

test('user settings remain separate and never inherit legacy or guest settings', (t) => {
  const data = mockStorage(t);
  const first = { ...DEFAULT_METASCALP_SETTINGS, port: 17853, binding: '321' };
  const second = { ...DEFAULT_METASCALP_SETTINGS, port: 17855, binding: '500' };
  data.set('crypto_screener_metascalp_settings', JSON.stringify(first));
  saveStoredMetaScalpSettings(first, 'user-a');
  assert.deepEqual(getStoredMetaScalpSettings('user-b'), DEFAULT_METASCALP_SETTINGS);
  assert.deepEqual(getStoredMetaScalpSettings(), DEFAULT_METASCALP_SETTINGS);
  saveStoredMetaScalpSettings(second, 'user-b');
  assert.deepEqual(getStoredMetaScalpSettings('user-a'), first);
  assert.deepEqual(getStoredMetaScalpSettings('user-b'), second);
  saveStoredMetaScalpSettings(second);
  assert.equal(data.get('crypto_screener_metascalp_settings'), JSON.stringify(first));
});

test('account switches and logout reject a profile from the previous user', (t) => {
  mockStorage(t);
  const first = { ...DEFAULT_METASCALP_SETTINGS, binding: '321' };
  const second = { ...DEFAULT_METASCALP_SETTINGS, binding: '500' };
  saveStoredMetaScalpSettings(second, 'user-b');
  const staleProfile = { uid: 'user-a', metaScalpSettings: first };
  assert.deepEqual(getUserMetaScalpSettings('user-b', staleProfile), second);
  assert.deepEqual(getUserMetaScalpSettings('new-user', staleProfile), DEFAULT_METASCALP_SETTINGS);
  assert.deepEqual(getUserMetaScalpSettings(undefined, staleProfile), DEFAULT_METASCALP_SETTINGS);
  assert.deepEqual(getUserMetaScalpSettings('user-a', staleProfile), first);
});

test('the actual HTTP client completes discovery and an official API command on a loopback fixture', async (t) => {
  let payload: unknown;
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.url === '/ping' && request.method === 'GET') {
      response.end(JSON.stringify({ app: 'MetaScalp', version: '0.0.9' }));
      return;
    }
    if (request.url === '/api/ui/state' && request.method === 'GET') {
      response.statusCode = 400; // Simulate old MetaScalp without the panel inventory API.
      response.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      payload = JSON.parse(body);
      const valid = request.url === '/api/change-ticker' && request.method === 'POST'
        && JSON.stringify(payload) === JSON.stringify({ tickerPattern: 'BYBIT:ETHUSDT.p', binding: '500' });
      response.statusCode = valid ? 200 : 400;
      response.end(JSON.stringify(valid ? { status: 'ok' } : { error: 'Invalid request body' }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const result = await sendTickerToMetaScalp('ETHUSDT', 'bybit', 'futures', { port: address.port, binding: '500' });
  assert.equal(result.success, true);
  assert.equal(result.portUsed, address.port);
  assert.deepEqual(payload, { tickerPattern: 'BYBIT:ETHUSDT.p', binding: '500' });
});

const FUTURES_PANEL='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SPOT_PANEL='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

test('browser-side MetaScalp mixed group preserves each market and ignores other groups', async (t) => {
  mockClipboard(t);
  const calls: { path: string; method: string; body: unknown }[] = [];
  const state={ windows:[{tabs:[{documents:[
    { externalId:FUTURES_PANEL, linkNumber:2, kind:'orderBook', connectionId:11 },
    { externalId:SPOT_PANEL, linkNumber:2, kind:'orderBook', connectionId:22 },
    { externalId:'cccccccc-cccc-cccc-cccc-cccccccccccc', linkNumber:3, kind:'chart', connectionId:33 },
  ]}]}], standaloneCharts:[] };
  mockApi(t, (url, opts) => {
    calls.push({path:url.pathname, method:opts.method || 'GET', body:opts.body});
    if(url.pathname==='/ping')return json({app:'MetaScalp'});
    if(url.pathname==='/api/ui/state')return json(state);
    if(url.pathname.includes('/api/ui/documents/'))return json({status:'ok'});
    throw Error('Unexpected endpoint '+url.pathname);
  });
  const result=await sendTickerToMetaScalp('BTCUSDT','binance','futures',{binding:'002'});
  assert.equal(result.success,true);
  assert.match(result.message,/Spot\/Futures/);
  const writes=calls.filter(x=>x.method==='PUT');
  assert.deepEqual(writes.map(x=>x.path).sort(),[FUTURES_PANEL,SPOT_PANEL]
    .map(id=>'/api/ui/documents/'+id+'/ticker').sort());
  for(const item of writes)assert.deepEqual(JSON.parse(String(item.body)),{ticker:'BTCUSDT'});
  assert.equal(calls.some(x=>x.path==='/api/change-ticker'),false);
  assert.deepEqual(linkedMetaScalpPanels(state,'002')?.documents?.map(d=>d.connectionId),[11,22]);
  assert.equal(linkedMetaScalpPanels(state,'002')?.orderBookCount,2);
});

test('browser side distinguishes a partial MetaScalp per-panel update from full success',async(t)=>{
  mockClipboard(t);
  const state={windows:[{tabs:[{documents:[
    {externalId:FUTURES_PANEL,linkNumber:2,kind:'orderBook',connectionId:11},
    {externalId:SPOT_PANEL,linkNumber:2,kind:'orderBook',connectionId:22},
  ]}]}],standaloneCharts:[]};
  mockApi(t,(url)=>{
    if(url.pathname==='/ping')return json({app:'MetaScalp'});
    if(url.pathname==='/api/ui/state')return json(state);
    if(url.pathname.includes(FUTURES_PANEL))return json({status:'ok'});
    if(url.pathname.includes(SPOT_PANEL))return json({error:'Unavailable'},400);
    throw Error('Unexpected endpoint '+url.pathname);
  });
  const result=await sendTickerToMetaScalp('BTCUSDT','binance','spot',{binding:'002'});
  assert.equal(result.success,false);
  assert.match(result.message,/1 з 2/);
});

test('browser-side all groups: one order book opens the selected site market, not the existing book connection', async (t) => {
  mockClipboard(t);
  let group = 1;
  let selectedMarket: 'futures' | 'spot' = 'spot';
  const calls: { path: string; method: string; body: unknown }[] = [];
  mockApi(t, (url, opts) => {
    calls.push({path:url.pathname,method:opts.method ?? 'GET',body:opts.body});
    if(url.pathname==='/ping')return json({app:'MetaScalp'});
    if(url.pathname==='/api/ui/state')return json({windows:[{tabs:[{documents:[
      {externalId:FUTURES_PANEL,kind:'orderBook',linkNumber:group,connectionId:11},
      {externalId:SPOT_PANEL,kind:'chart',linkNumber:group,connectionId:11},
    ]}]}],standaloneCharts:[]});
    if(url.pathname==='/api/change-ticker')return json({status:'ok'});
    throw Error('A single book with a chart must use the market-aware named group endpoint');
  });
  for(const requestedGroup of [1,2,17,500]){
    for(const market of ['spot','futures'] as const) {
      group=requestedGroup;
      selectedMarket=market;
      const before=calls.length;
      const result=await sendTickerToMetaScalp('BTCUSDT','binance',selectedMarket,{binding:String(group).padStart(3,'0')});
      assert.equal(result.success,true);
      const writes=calls.slice(before).filter(call=>call.method==='POST');
      assert.equal(writes.length,1);
      assert.deepEqual(JSON.parse(String(writes[0].body)),{
        tickerPattern:market==='futures'?'BINANCE:BTCUSDT.p':'BINANCE:BTCUSDT',
        binding:String(group).padStart(3,'0'),
      });
      assert.equal(calls.slice(before).filter(call=>call.method==='PUT').length,0);
    }
  }
});

test('browser-side two books in any group use per-panel writes even with same connection ID',async(t)=>{
  mockClipboard(t);
  let group=1;
  const calls: {path:string;method:string;body:unknown}[]=[];
  mockApi(t,(url,opts)=>{
    calls.push({path:url.pathname,method:opts.method??'GET',body:opts.body});
    if(url.pathname==='/ping')return json({app:'MetaScalp'});
    if(url.pathname==='/api/ui/state')return json({windows:[{tabs:[{documents:[
      {externalId:FUTURES_PANEL,kind:'orderBook',linkNumber:group,connectionId:11},
      {externalId:SPOT_PANEL,kind:'orderBook',linkNumber:group,connectionId:11},
    ]}]}],standaloneCharts:[]});
    if(url.pathname.includes('/api/ui/documents/'))return json({status:'ok'});
    throw Error('Multi-book group must never force source market onto every book');
  });
  for(const requestedGroup of [1,2,17,500]){
    group=requestedGroup;
    const before=calls.length;
    const result=await sendTickerToMetaScalp('ETHUSDT','binance','futures',{binding:String(group).padStart(3,'0')});
    assert.equal(result.success,true);
    const writes=calls.slice(before).filter(call=>call.method==='PUT');
    assert.equal(writes.length,2);
    assert.ok(writes.every(call=>JSON.parse(String(call.body)).ticker==='ETHUSDT'));
    assert.equal(calls.slice(before).filter(call=>call.path==='/api/change-ticker').length,0);
  }
});
